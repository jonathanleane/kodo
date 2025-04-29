require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const redis = require('redis'); // Uncomment when Redis is configured
const { OpenAI } = require('openai');
const crypto = require('crypto'); // Add crypto for token generation

// Basic configuration (consider moving to a config file)
const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log(`Starting server on port ${PORT}`);
console.log(`Using environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`OpenAI API key present: ${OPENAI_API_KEY ? 'Yes' : 'No'}`);
console.log(`Redis URL present: ${process.env.DATABASE_URL ? 'Yes' : 'No'}`);

if (!OPENAI_API_KEY) {
    console.warn("Warning: OPENAI_API_KEY environment variable not set.");
    console.log("Translation functionality will not work without an OpenAI API key.");
    console.log("Please set OPENAI_API_KEY in your environment variables.");
    // Continue running without exiting - this allows the healthcheck to succeed
}

const app = express();

// Configure CORS properly using the cors package
const corsOptions = {
  origin: 'https://kodo-frontend.onrender.com', // Allow only the Render frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Socket-ID'],
  credentials: true,
  preflightContinue: false, // Ensure preflight requests are handled by cors middleware
  optionsSuccessStatus: 204 // Or 200 depending on client needs
};

// Apply CORS middleware to all routes
app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Create HTTP server
const server = http.createServer(app);

// Socket.IO configuration
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },
    connectTimeout: 60000,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['polling', 'websocket'],
    allowEIO3: true // For backward compatibility
});

// --- OpenAI Setup ---
let openai = null;
try {
    if (OPENAI_API_KEY) {
        openai = new OpenAI({
            apiKey: OPENAI_API_KEY,
        });
        console.log('OpenAI client initialized successfully');
    } else {
        console.log('OpenAI client not initialized (no API key)');
    }
} catch (error) {
    console.error('Failed to initialize OpenAI client:', error.message);
}

// --- Redis Client Setup ---
let redisClient;
(async () => {
  try {
    // Use the DATABASE_URL environment variable provided by Railway or DigitalOcean
    const redisUrl = process.env.DATABASE_URL || process.env.REDIS_URL;
    if (!redisUrl) {
        console.warn('No Redis URL found. Chat rooms will not persist between restarts.');
        // Initialize a minimal redisClient mock to avoid null references
        redisClient = {
            isReady: false,
            get: async () => null,
            set: async () => {},
            del: async () => {},
            connect: async () => {},
            quit: async () => {}
        };
        return; // Skip connecting
    }
    
    console.log("Connecting to Redis...");
    const redisOptions = {
      url: redisUrl
    };
    
    // Add TLS options if using a secure connection
    if (redisUrl.startsWith('rediss://')) {
      redisOptions.socket = {
        tls: true,
        rejectUnauthorized: false
      };
    }
    
    redisClient = redis.createClient(redisOptions);
    
    // Set up error handling with reconnect logic
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
      // Don't exit on redis errors, try to reconnect instead
    });
    
    redisClient.on('reconnecting', () => {
      console.log('Attempting to reconnect to Redis...');
    });
    
    await redisClient.connect();
    console.log('Connected to Redis successfully');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    console.log('Server will continue without Redis - chat functionality will be limited');
    
    // Initialize a minimal redisClient mock to avoid null references
    redisClient = {
        isReady: false,
        get: async () => null,
        set: async () => {},
        del: async () => {},
        connect: async () => {},
        quit: async () => {}
    };
  }
})();


// --- Middleware ---
app.use(express.json()); // Middleware to parse JSON bodies

// --- Basic HTTP Routes ---
// Replaced by the JSON version below
// app.get('/', (req, res) => {
//     res.send('Translation Chat Backend Running');
// });

// QR Code Generation Route - HTTP-based approach
app.post('/generate-qr', async (req, res) => {
    console.log("Received /generate-qr HTTP request");

    // Check if this is using the new HTTP-based flow
    const useHttp = req.body.useHttp === true;
    
    // For HTTP-based flow, we don't need a socket ID, just store a placeholder
    // We'll use a much longer TTL for HTTP-based flow
    const requestingSocketId = req.body.socketId || req.headers['x-socket-id'] || 'http-generated';
    const hostLanguage = req.body.language || 'en'; // Get language from request, default 'en'

    // Generate a secure random token
    const token = crypto.randomBytes(16).toString('hex');
    const tokenKey = `qr_token:${token}`;
    const tokenData = JSON.stringify({ 
        requestingUserId: requestingSocketId,
        hostLanguage: hostLanguage, // Store host language
        createdAt: Date.now(),
        useHttp: useHttp
    });
    
    // Use a much longer TTL for HTTP-generated tokens (10 minutes)
    const ttlInSeconds = useHttp ? 600 : 120;

    try {
        await redisClient.set(tokenKey, tokenData, { EX: ttlInSeconds });
        console.log(`Stored token ${token} with TTL ${ttlInSeconds}s (HTTP flow: ${useHttp})`);
        res.json({ token: token });
    } catch (err) {
        console.error("Redis error storing token:", err);
        res.status(500).json({ error: "Failed to generate QR token" });
    }
});


// Log available namespaces
console.log('Setting up Socket.IO namespaces');

// Create a namespace for /backend-temp for compatibility with DigitalOcean
const backendNamespace = io.of('/backend-temp');
console.log('Created /backend-temp namespace');

// Set up CORS for the namespace as well
backendNamespace.use((socket, next) => {
    // Log the connection request
    console.log(`Namespace connection request from origin: ${socket.handshake.headers.origin}`);
    next();
});

// Main Socket.IO connection handler
io.on('connection', handleSocketConnection);
console.log('Set up handlers for default namespace');

// Backend-temp namespace connection handler (same handlers)
backendNamespace.on('connection', handleSocketConnection);
console.log('Set up handlers for /backend-temp namespace');

// --- WebSocket Event Handling ---
function handleSocketConnection(socket) {
    console.log(`Connection received! Socket ID: ${socket.id}, Transport: ${socket.conn.transport.name}`);
    // Log additional connection details for debugging
    console.log(`Connection details - Handshake: ${JSON.stringify(socket.handshake.headers, null, 2)}`);
    console.log(`Connection namespace: ${socket.nsp.name}`);
    console.log(`Connection URL: ${socket.handshake.url}, Query: ${JSON.stringify(socket.handshake.query)}`);

    // Send immediate acknowledgment to client
    socket.emit('server_ack', { status: 'connected', socketId: socket.id });
    
    console.log(`User connected: ${socket.id}`);
    
    // Handle ping messages from clients (keep-alive)
    socket.on('ping', () => {
        console.log(`Received ping from ${socket.id}, sending pong`);
        socket.emit('pong');
    });

    // ========== SOCKET EVENT HANDLERS ==========
    
    // Handle 'join' event from Scanner (Client B)
    socket.on('join', async ({ token, language }) => {
        console.log(`Join attempt received from ${socket.id} (Client B) with token: ${token}, language: ${language}`);
        const tokenKey = `qr_token:${token}`;
        try {
            console.log(`[Redis GET ${tokenKey}] Attempting...`);
            const tokenDataString = await redisClient.get(tokenKey);
            console.log(`[Redis GET ${tokenKey}] Result: ${tokenDataString ? 'Found' : 'Not Found'}`);

            if (!tokenDataString) {
                console.log(`Token ${token} not found or expired.`);
                socket.emit('error', { message: 'Invalid or expired QR code.' });
                return;
            }

            const tokenData = JSON.parse(tokenDataString);
            const userA_SocketId = tokenData.requestingUserId;
            const clientB_SocketId = socket.id;
            const isHttpGenerated = tokenData.useHttp === true;

            console.log(`Token valid. Found User A socket ID: ${userA_SocketId}, HTTP-generated: ${isHttpGenerated}`);

            // Check if User A is still connected (ensure we check the correct namespace)
            const backendNamespace = io.of('/backend-temp'); // Get namespace instance
            // const userASocket = io.sockets.sockets.get(userA_SocketId); // Old lookup
            const userASocket = backendNamespace.sockets.get(userA_SocketId); // Lookup within namespace
            console.log(`Lookup result for User A (${userA_SocketId}) in namespace ${backendNamespace.name}: ${userASocket ? 'Found' : 'Not Found'}`);
            
            if (!userASocket) {
                // For HTTP-generated tokens without a connected User A,
                // we'll emit a special event so others can pick it up
                if (isHttpGenerated || userA_SocketId === 'http-generated') {
                    console.log(`Token was HTTP-generated and no socket is connected yet. Broadcasting token join.`);
                    
                    // Create a room anyway
                    const roomId = `room_${crypto.randomBytes(8).toString('hex')}`;
                    console.log(`Creating room ${roomId} for future connection with ${clientB_SocketId}`);
                    
                    // Store room info in Redis with the token as part of the key
                    const roomKey = `room:${roomId}`;
                    
                    // Get User A's language from the token data stored earlier
                    const userA_Language = tokenData.hostLanguage || 'en'; // Use stored lang, default 'en'
                    const userB_Language = language; // Language sent by User B
                    
                    const roomData = JSON.stringify({
                        token: token,
                        userB: { socketId: clientB_SocketId, language: userB_Language },
                        pendingUserA: true
                    });
                    
                    // Store the room data with a longer TTL (10 minutes)
                    await redisClient.set(roomKey, roomData, { EX: 600 });
                    console.log(`Created pending room ${roomId} for token ${token}`);
                    
                    // Store B's socket ID -> roomId mapping
                    const userBKey = `user_socket:${clientB_SocketId}`;
                    await redisClient.set(userBKey, roomId);
                    
                    // Add socket B to the room
                    socket.join(roomId);
                    console.log(`Socket ${clientB_SocketId} joined room ${roomId}`);
                    
                    // Emit event to user B
                    const waitingMessage = { 
                        token: token, 
                        message: 'Waiting for the host to connect...',
                        roomId: roomId
                    };
                    console.log(`Emitting waitingForHost to ${clientB_SocketId}:`, JSON.stringify(waitingMessage));
                    socket.emit('waitingForHost', waitingMessage);
                    
                    // Also broadcast to the room for good measure
                    io.to(roomId).emit('waitingForHost', waitingMessage);
                    
                    // Keep the token so A can join when they connect
                    return;
                } else {
                    // Non-HTTP case where User A disconnected
                    console.log(`Original user ${userA_SocketId} not found or disconnected.`);
                    socket.emit('error', { message: 'The user who generated the code is not available.' });
                    await redisClient.del(tokenKey); 
                    return;
                }
            }

            // 3. Create room ID
            const roomId = `room_${crypto.randomBytes(8).toString('hex')}`;
            console.log(`Creating room ${roomId} for ${userA_SocketId} and ${clientB_SocketId}`);

            // 4. Store room info (participants, languages) in Redis
            const roomKey = `room:${roomId}`;
            
            // Get User A's language from the token data stored earlier
            const userA_Language = tokenData.hostLanguage || 'en'; // Use stored lang, default 'en'
            const userB_Language = language; // Language sent by User B

            const roomData = JSON.stringify({
                userA: { socketId: userA_SocketId, language: userA_Language },
                userB: { socketId: clientB_SocketId, language: userB_Language }
            });
            console.log(`[Redis SET ${roomKey}] Attempting...`);
            await redisClient.set(roomKey, roomData);
            console.log(`[Redis SET ${roomKey}] Success.`);

            // Store socketId -> roomId mappings for easy lookup on disconnect
            const userAKey = `user_socket:${userA_SocketId}`;
            const userBKey = `user_socket:${clientB_SocketId}`;
            console.log(`[Redis SET ${userAKey}] Attempting...`);
            await redisClient.set(userAKey, roomId);
            console.log(`[Redis SET ${userAKey}] Success.`);
            console.log(`[Redis SET ${userBKey}] Attempting...`);
            await redisClient.set(userBKey, roomId);
            console.log(`[Redis SET ${userBKey}] Success.`);

            // 5. Add both sockets (A and B) to the Socket.IO room
            userASocket.join(roomId);
            socket.join(roomId); // Client B joins the room
            console.log(`Sockets ${userA_SocketId} and ${clientB_SocketId} joined Socket.IO room ${roomId}`);

            // 6. Remove/invalidate the token in Redis (it's used)
            console.log(`[Redis DEL ${tokenKey}] Attempting...`);
            await redisClient.del(tokenKey);
            console.log(`[Redis DEL ${tokenKey}] Success.`);

            // 7. Emit 'joinedRoom' to both users
            const payloadForB = { roomId: roomId, partnerLanguage: userA_Language };
            const payloadForA = { roomId: roomId, partnerLanguage: userB_Language };
            
            // Revert to emitting on socket variables
            console.log(`Emitting joinedRoom to User B (${clientB_SocketId}) via socket variable. Payload:`, JSON.stringify(payloadForB));
            socket.emit('joinedRoom', payloadForB);
            
            console.log(`Emitting joinedRoom to User A (${userA_SocketId}) via userASocket variable. Payload:`, JSON.stringify(payloadForA));
            userASocket.emit('joinedRoom', payloadForA);

            console.log(`Successfully paired users in room ${roomId}`);

        } catch (err) {
            console.error("[Redis during JOIN] Error processing join event:", err);
            socket.emit('error', { message: 'Failed to join room due to server error.' });
        }
    });

    // Handle request from User A to generate a token for QR code
    socket.on('generateToken', async () => {
        console.log(`generateToken request received from ${socket.id}`);
        const token = crypto.randomBytes(16).toString('hex');
        const tokenKey = `qr_token:${token}`;
        const tokenData = JSON.stringify({ requestingUserId: socket.id, createdAt: Date.now() });
        const ttlInSeconds = 300; // 5 minutes

        try {
            console.log(`[Redis SET ${tokenKey}] Attempting...`);
            await redisClient.set(tokenKey, tokenData, { EX: ttlInSeconds });
            console.log(`[Redis SET ${tokenKey}] Success. Stored token ${token} for user ${socket.id} with TTL ${ttlInSeconds}s`);
            socket.emit('tokenGenerated', token);
        } catch (err) {
            console.error(`[Redis SET ${tokenKey}] Error storing token for generateToken event:`, err);
            socket.emit('error', { message: "Failed to generate QR token due to server error." });
        }
    });
    
    // Register to listen for a specific token (for HTTP-generated tokens)
    // Include language from client
    socket.on('listenForToken', async ({ token, language }) => {
        const hostLanguage = language || 'en'; // Get language, default 'en'
        console.log(`Socket ${socket.id} is now listening for token: ${token} with language: ${hostLanguage}`);
        try {
            // Update the token data to include this socket
            const tokenKey = `qr_token:${token}`;
            const existingData = await redisClient.get(tokenKey);
            
            if (existingData) {
                const parsedData = JSON.parse(existingData);
                parsedData.requestingUserId = socket.id; // Update socket ID
                parsedData.hostLanguage = hostLanguage; // Update/store host language
                await redisClient.set(tokenKey, JSON.stringify(parsedData), { EX: 600 });
                console.log(`Updated token ${token} to use socket ${socket.id} and language ${hostLanguage} with TTL 600s`);
                
                // Check if there are any pending rooms for this token
                // This is the key part - we need to find if anyone has already joined with this token
                console.log(`Checking if any clients are waiting with token ${token}...`);
                const roomKeys = await redisClient.keys('room:*');
                
                for (const roomKey of roomKeys) {
                    const roomData = await redisClient.get(roomKey);
                    if (roomData) {
                        const parsedRoomData = JSON.parse(roomData);
                        
                        if (parsedRoomData.token === token && parsedRoomData.pendingUserA) {
                            console.log(`Found pending room ${roomKey} for token ${token}, completing connection!`);
                            
                            // Extract room ID from key (remove 'room:' prefix)
                            const roomId = roomKey.replace('room:', '');
                            
                            // Add host socket to room
                            socket.join(roomId);
                            
                            // Get client B info
                            const userB = parsedRoomData.userB;
                            const userB_SocketId = userB.socketId;
                            const userB_Language = userB.language;
                            
                            // Update room data to include host info AND LANGUAGE
                            parsedRoomData.pendingUserA = false;
                            parsedRoomData.userA = {
                                socketId: socket.id,
                                language: hostLanguage // Use language received from client
                            };
                            
                            // Save updated room data
                            await redisClient.set(roomKey, JSON.stringify(parsedRoomData), { EX: 600 });
                            
                            // Store socketId -> roomId mapping for the host
                            const userAKey = `user_socket:${socket.id}`;
                            await redisClient.set(userAKey, roomId);
                            
                            // Emit joinedRoom events to both sockets
                            const clientBSocket = io.sockets.sockets.get(userB_SocketId);
                            
                            if (clientBSocket) {
                                console.log(`Notifying client ${userB_SocketId} that host has connected`);
                                clientBSocket.emit('joinedRoom', {
                                    roomId: roomId,
                                    partnerLanguage: hostLanguage // Send host's language to B
                                });
                            }
                            
                            // Also notify the host
                            socket.emit('joinedRoom', {
                                roomId: roomId,
                                partnerLanguage: userB_Language // Send B's language to host
                            });
                            
                            break; // Stop after finding the first matching room
                        }
                    }
                }
            } else {
                console.log(`Token ${token} not found when socket ${socket.id} tried to listen for it`);
                socket.emit('error', { message: "Token not found or expired" });
            }
        } catch (err) {
            console.error(`Error updating token for listenForToken event:`, err);
        }
    });
    
    // Check if host has connected
    socket.on('checkHostStatus', async ({ token }) => {
        try {
            // This event allows clients to periodically check if the host has connected
            // No action needed here as the listenForToken handler above already handles this
            // Just log the request for debugging
            console.log(`Socket ${socket.id} checking host status for token: ${token}`);
        } catch (err) {
            console.error(`Error in checkHostStatus:`, err);
        }
    });

    // TODO: Handle 'sendMessage' event
    socket.on('sendMessage', async ({ roomId, messageText }) => {
        console.log(`Message received in room ${roomId} from ${socket.id}: ${messageText}`);

        if (!redisClient || !redisClient.isReady) {
            console.error("Redis client not ready.");
            socket.emit('error', { message: 'Server error: Cannot process message right now.' });
            return;
        }

        const roomKey = `room:${roomId}`;
        const senderSocketId = socket.id;

        try {
            console.log(`[Redis GET ${roomKey}] Attempting for sendMessage...`);
            const roomDataString = await redisClient.get(roomKey);
            console.log(`[Redis GET ${roomKey}] Result for sendMessage: ${roomDataString ? 'Found' : 'Not Found'}`);

            if (!roomDataString) {
                console.error(`Room data not found for room ${roomId}`);
                socket.emit('error', { message: 'Error: You are not in a valid room.' });
                return;
            }
            const roomData = JSON.parse(roomDataString);

            // 2. Identify Sender, Recipient, and Languages
            let senderLang, targetLang, recipientSocketId;
            if (roomData.userA && roomData.userA.socketId === senderSocketId) {
                senderLang = roomData.userA.language;
                recipientSocketId = roomData.userB ? roomData.userB.socketId : null;
                targetLang = roomData.userB ? roomData.userB.language : null;
            } else if (roomData.userB && roomData.userB.socketId === senderSocketId) {
                senderLang = roomData.userB.language;
                recipientSocketId = roomData.userA ? roomData.userA.socketId : null;
                targetLang = roomData.userA ? roomData.userA.language : null;
            } else {
                console.error(`Sender ${senderSocketId} not found in room ${roomId}`);
                socket.emit('error', { message: 'Error: Could not identify sender in room.' });
                return;
            }

            if (!recipientSocketId || !targetLang) {
                console.error(`Recipient or target language missing in room ${roomId}`);
                // This might happen if the partner disconnected just before message was processed
                socket.emit('error', { message: 'Error: Partner is not available for translation.' });
                return;
            }

            console.log(`Translating for ${senderSocketId} (${senderLang}) to ${recipientSocketId} (${targetLang}): ${messageText}`);

            // 3. Construct Prompt and 4. Call OpenAI API
            let translatedText = messageText; // Default to original if translation fails or languages are same
            let translationError = null;

            if (senderLang !== targetLang) { // Only translate if languages differ
                try {
                    // Enhanced Prompt
                    const prompt = `You are an expert multilingual translator specializing in real-time, natural-sounding conversational text. Translate the following user message accurately from ${senderLang} to ${targetLang}. Preserve the original tone, nuance, and idiomatic expressions where appropriate for a casual chat context. IMPORTANT: Output *only* the translated text, with no introduction, explanation, quotation marks, or labels.`;
                    console.log(`Sending to OpenAI: Model=${process.env.OPENAI_MODEL || 'gpt-4o'}, Prompt="${prompt}", Text="${messageText}"`);

                    if (!openai) {
                        throw new Error('OpenAI client not initialized - check API key');
                    }
                    
                    const completion = await openai.chat.completions.create({
                        model: process.env.OPENAI_MODEL || "gpt-4o", // Use env variable or default
                        messages: [
                            { role: "system", content: prompt },
                            { role: "user", content: messageText }
                        ],
                        temperature: 0.7, // Adjust creativity vs predictability
                        max_tokens: 150, // Limit response length to control cost/latency
                        n: 1, // We only need one translation choice
                        stream: false, // Keep it simple for now
                    });

                    if (completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
                        translatedText = completion.choices[0].message.content.trim();
                        console.log(`OpenAI Translation Success: "${translatedText}"`);
                    } else {
                        throw new Error('Invalid response structure from OpenAI');
                    }

                } catch (error) {
                    console.error("Error calling OpenAI API:", error.message || error);
                    translationError = "(Translation failed)";
                    // Optionally emit a specific error event to the sender
                    // socket.emit('translationError', { original: messageText });
                }
            } else {
                console.log("Sender and target languages are the same, skipping translation.");
            }

            // 5. Emit 'newMessage' events
            const messagePayload = {
                original: messageText,
                translated: translationError || translatedText,
                sender: '' // This will be set per recipient
            };

            // Emit to recipient
            // const recipientSocket = io.sockets.sockets.get(recipientSocketId); // Old global lookup
            const backendNamespace = io.of('/backend-temp'); // Get namespace instance
            const recipientSocket = backendNamespace.sockets.get(recipientSocketId); // Lookup within namespace
            console.log(`Lookup result for Recipient (${recipientSocketId}) in namespace ${backendNamespace.name}: ${recipientSocket ? 'Found' : 'Not Found'}`);

            if (recipientSocket) {
                messagePayload.sender = 'partner';
                recipientSocket.emit('newMessage', messagePayload);
                console.log(`Emitted 'newMessage' to recipient ${recipientSocketId}`);
            } else {
                console.log(`Recipient ${recipientSocketId} not connected, message not delivered.`);
                // Optionally notify sender that partner is offline
            }

            // Emit back to the sender
            messagePayload.sender = 'self';
            socket.emit('newMessage', messagePayload);
            console.log(`Emitted 'newMessage' back to sender ${senderSocketId}`);

        } catch (err) {
            console.error("[Redis during SEND] Error processing sendMessage:", err);
            socket.emit('error', { message: 'Server error processing your message.' });
        }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log(`User disconnected: ${socket.id}`);
        const disconnectedSocketId = socket.id;

        try {
            // 1. Find which room the disconnecting user was in
            const userRoomKey = `user_socket:${disconnectedSocketId}`;
            console.log(`[Redis GET ${userRoomKey}] Attempting for disconnect...`);
            const roomId = await redisClient.get(userRoomKey);
            console.log(`[Redis GET ${userRoomKey}] Result for disconnect: ${roomId ? roomId : 'Not Found'}`);

            if (roomId) {
                console.log(`User ${disconnectedSocketId} was in room ${roomId}`);
                const roomKey = `room:${roomId}`;

                // Get room data to find the partner
                const roomDataString = await redisClient.get(roomKey);
                if (roomDataString) {
                    const roomData = JSON.parse(roomDataString);
                    let partnerSocketId = null;

                    if (roomData.userA && roomData.userA.socketId === disconnectedSocketId) {
                        partnerSocketId = roomData.userB ? roomData.userB.socketId : null;
                    } else if (roomData.userB && roomData.userB.socketId === disconnectedSocketId) {
                        partnerSocketId = roomData.userA ? roomData.userA.socketId : null;
                    }

                    // 2. Notify the other user in the room ('partnerLeft')
                    if (partnerSocketId) {
                        // Fix namespace lookup for partner socket
                        const backendNamespace = io.of('/backend-temp');
                        const partnerSocket = backendNamespace.sockets.get(partnerSocketId); 
                        // const partnerSocket = io.sockets.sockets.get(partnerSocketId); // Old lookup
                        if (partnerSocket) {
                            console.log(`Notifying partner ${partnerSocketId} in room ${roomId} that user left`);
                            partnerSocket.emit('partnerLeft');
                        } else {
                            console.log(`Partner socket ${partnerSocketId} not found for notification.`);
                        }
                         // Remove ONLY the disconnected user's socket mapping
                        console.log(`[Redis DEL ${userRoomKey}] Attempting for disconnect...`);
                        await redisClient.del(userRoomKey);
                        console.log(`[Redis DEL ${userRoomKey}] Success for disconnect.`);

                        // DO NOT immediately delete room or partner mapping
                        console.log(`User ${disconnectedSocketId} left room ${roomId}. Keeping room data for potential reconnect.`);
                        /* // Old cleanup logic:
                        console.log(`Removing room data for room ${roomId} as one user left.`);
                        console.log(`[Redis DEL ${roomKey}] Attempting for disconnect cleanup...`);
                        await redisClient.del(roomKey);
                        console.log(`[Redis DEL ${roomKey}] Success for disconnect cleanup.`);
                         // Also remove the partner's socket mapping
                        const partnerKey = `user_socket:${partnerSocketId}`;
                        console.log(`[Redis DEL ${partnerKey}] Attempting partner cleanup...`);
                        await redisClient.del(partnerKey);
                        console.log(`[Redis DEL ${partnerKey}] Success partner cleanup.`);
                        */
                    } else {
                        // If no partner was found (maybe already disconnected), just clean up THIS user and the room
                        console.log(`No partner found for disconnected user ${disconnectedSocketId} in room ${roomId}. Cleaning up room and user mapping.`);
                         console.log(`[Redis DEL ${roomKey}] Attempting for disconnect cleanup...`);
                         await redisClient.del(roomKey); // Delete room if no partner
                         console.log(`[Redis DEL ${roomKey}] Success for disconnect cleanup.`);
                         await redisClient.del(userRoomKey); // Clean up disconnected user's mapping
                    }
                } else {
                    console.log(`Room data for room ${roomId} not found. Removing stale socket mapping ${userRoomKey}`);
                     console.log(`[Redis DEL ${userRoomKey}] Attempting for disconnect...`);
                     await redisClient.del(userRoomKey); // Clean up potentially stale mapping
                }

            } else {
                console.log(`User ${disconnectedSocketId} was not found in any active room.`);
            }
        } catch (err) {
            console.error("[Redis during DISCONNECT] Error handling disconnect:", err);
        }
    });

    // --- Typing Indicators ---
    socket.on('startTyping', async () => {
        const userRoomKey = `user_socket:${socket.id}`;
        const roomId = await redisClient.get(userRoomKey);
        if (roomId) {
            // console.log(`${socket.id} started typing in room ${roomId}`);
            // Notify everyone *else* in the room
            socket.to(roomId).emit('partnerTyping', { userId: socket.id });
        }
    });

    socket.on('stopTyping', async () => {
        const userRoomKey = `user_socket:${socket.id}`;
        const roomId = await redisClient.get(userRoomKey);
        if (roomId) {
            // console.log(`${socket.id} stopped typing in room ${roomId}`);
            // Notify everyone *else* in the room
            socket.to(roomId).emit('partnerStoppedTyping', { userId: socket.id });
        }
    });
    // -----------------------

    // TODO: Handle 'leaveRoom' event (optional explicit leave)

    // TODO: Handle 'setLanguage' event (optional)
}


// Add a health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        uptime: process.uptime(),
        timestamp: Date.now(),
        redis: redisClient && redisClient.isReady ? 'connected' : 'disconnected',
        socketio: io ? 'initialized' : 'not initialized',
    };
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(healthData));
});

// Add root endpoint to avoid text response
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ message: 'Translation Chat Backend Running' }));
});

// Handle /backend-temp requests for compatibility with DigitalOcean setup
app.get('/backend-temp', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ message: 'Translation Chat Backend Running (backend-temp path)' }));
});

// CORS middleware already applied at the top of the file

// Add an API test endpoint 
app.get('/api/test', (req, res) => {
    res.json({ message: 'API routes are working correctly' });
});

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on 0.0.0.0:${PORT}`);
    console.log(`Healthcheck at http://0.0.0.0:${PORT}/`);
    
    // Log when server is ready
    console.log('Server is ready to accept connections');
});

// --- Graceful Shutdown ---
process.on('SIGINT', async () => { // Make async
    console.log('SIGINT signal received: closing HTTP server');
    io.close(() => {
      console.log('Socket.IO server closed');
    });
    server.close(async () => { // Make inner callback async
      console.log('HTTP server closed');
      // Close Redis connection if open
      if (redisClient && redisClient.isOpen) {
        try {
            await redisClient.quit();
            console.log('Redis client disconnected');
        } catch (err) {
            console.error('Error closing Redis connection:', err);
        }
      }
      process.exit(0);
    });
  }); 

// WebSocket connections will now happen at wss://<your-domain>/api/socket.io/
// (Relative to the root, the ingress rule for /api/ needs to handle this) 