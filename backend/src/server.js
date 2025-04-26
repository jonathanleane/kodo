require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const redis = require('redis'); // Uncomment when Redis is configured
const { OpenAI } = require('openai');
const crypto = require('crypto'); // Add crypto for token generation

// Basic configuration (consider moving to a config file)
const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable not set.");
    console.log("Please create a .env file in the backend directory with your OpenAI API key.");
    console.log("Example .env file:");
    console.log("OPENAI_API_KEY=your_api_key_here");
    process.exit(1); // Exit if the key isn't found
}

const app = express();
const server = http.createServer(app);

// Define the path for Socket.IO (including the ingress prefix)
const socketIoPath = "/socket.io"; // Use standard path instead of /api prefix for testing

const io = new Server(server, {
    // Tell Socket.IO server to listen on this path
    path: socketIoPath,
    cors: {
        origin: "*", // Keep allowing all origins for now
        methods: ["GET", "POST"]
    },
    // Add logging to troubleshoot connection issues
    connectTimeout: 30000,
    pingTimeout: 60000,
    upgradeTimeout: 30000,
    transports: ['polling'], // Force polling since WebSockets appear to be blocked
    allowUpgrades: false // Prevent transport upgrades to WebSocket
});

// --- OpenAI Setup ---
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// --- Redis Client Setup ---
let redisClient;
(async () => {
  try {
    // Use the DATABASE_URL environment variable provided by DigitalOcean
    const redisUrl = process.env.DATABASE_URL;
    if (!redisUrl) {
        throw new Error('DATABASE_URL environment variable not set for Redis connection.');
    }
    console.log("Connecting to Redis using provided URL...");
    redisClient = redis.createClient({
      // Pass the connection string URL directly
      url: redisUrl,
      // Add TLS settings for secure connections on DO Managed Redis
      socket: {
          tls: true,
          rejectUnauthorized: false // Necessary for some DO Redis configs, consider security implications
      },
      // Add reconnect strategy
      retry_strategy: function(options) {
          if (options.error && options.error.code === 'ECONNREFUSED') {
              // End reconnecting on a specific error and flush all commands with a individual error
              return new Error('The server refused the connection');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
              // End reconnecting after a specific timeout and flush all commands with a individual error
              return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
              // End reconnecting with built in error
              return undefined;
          }
          // reconnect after
          return Math.min(options.attempt * 100, 3000);
      }
    });
    
    // Set up error handling with reconnect logic
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
      // Don't exit on redis errors, try to reconnect instead
    });
    
    redisClient.on('reconnecting', () => {
      console.log('Attempting to reconnect to Redis...');
    });
    
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    // Don't exit on initial connection failure - continue without Redis
    // The server will attempt to handle operations gracefully without Redis
    console.log('Server will continue without Redis - chat functionality will be limited');
  }
})();


// --- Middleware ---
app.use(express.json()); // Middleware to parse JSON bodies

// --- Basic HTTP Routes ---
app.get('/', (req, res) => {
    res.send('Translation Chat Backend Running');
});

// Placeholder for QR Code Generation Route
// TODO: Implement /generate-qr route
app.post('/generate-qr', async (req, res) => {
    // 1. Generate unique token
    // 2. Store token -> requesting user (socket ID initially) in Redis with TTL
    // 3. Return token
    console.log("Received /generate-qr request");

    // Get the socket ID from the request (important: needs to be passed from client)
    // For now, we'll assume it might come in the body or headers.
    // A better approach might be for the client to connect via WebSocket FIRST,
    // then request the QR code via a WebSocket event, providing its socket.id.
    // But sticking to the HLD's HTTP endpoint for now:
    const requestingSocketId = req.body.socketId || req.headers['x-socket-id']; // Example ways to pass it

    if (!requestingSocketId) {
        console.error("Error: Socket ID not provided in /generate-qr request.");
        // In a real app, the client should establish a WebSocket connection *before* requesting a QR.
        // The request should likely be a WS message, not HTTP.
        // For now, let's proceed with a dummy ID for testing HTTP endpoint directly.
        // return res.status(400).json({ error: "Socket ID is required to generate a QR code." });
        console.warn("Warning: No socket ID provided. Generating QR token without linking to a specific user initially.");
        // Allow generating the token but it won't be directly linked yet.
    }

    const token = crypto.randomBytes(16).toString('hex'); // Generate a secure random token
    const tokenKey = `qr_token:${token}`;
    const tokenData = JSON.stringify({ requestingUserId: requestingSocketId || 'unknown', createdAt: Date.now() });
    const ttlInSeconds = 60; // Token valid for 60 seconds

    try {
        await redisClient.set(tokenKey, tokenData, { EX: ttlInSeconds });
        console.log(`Stored token ${token} for user ${requestingSocketId || 'unknown'} with TTL ${ttlInSeconds}s`);
        res.json({ token: token });
    } catch (err) {
        console.error("Redis error storing token:", err);
        res.status(500).json({ error: "Failed to generate QR token" });
    }
});


// --- WebSocket Event Handling ---
io.on('connection', (socket) => {
    console.log(`Connection received! Socket ID: ${socket.id}, Transport: ${socket.conn.transport.name}`);
    // Log additional connection details for debugging
    console.log(`Connection details - Handshake: ${JSON.stringify(socket.handshake.headers, null, 2)}`);
    console.log(`Connection URL: ${socket.handshake.url}, Query: ${JSON.stringify(socket.handshake.query)}`);
    console.log(`Socket.IO path: ${socketIoPath}`);

    // Send immediate acknowledgment to client
    socket.emit('server_ack', { status: 'connected', socketId: socket.id });
    
    console.log(`User connected: ${socket.id}`);

    // TODO: Handle 'join' event from Scanner (Client B)
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

            console.log(`Token valid. Found User A socket ID: ${userA_SocketId}`);

            // Check if User A is still connected (tricky if they requested via HTTP)
            // Ideally User A is already connected via WebSocket.
            const userASocket = io.sockets.sockets.get(userA_SocketId);
            if (!userASocket) {
                 // This handles the case where the original requester disconnected
                 // or if the ID stored was 'unknown' because they used HTTP without identifying.
                console.log(`Original user ${userA_SocketId} not found or disconnected.`);
                 // We could potentially still store the room info and wait for User A to connect/reconnect
                 // but for simplicity now, we'll reject the join.
                socket.emit('error', { message: 'The user who generated the code is not available.' });
                 await redisClient.del(tokenKey); // Clean up token
                return;
            }

            // 3. Create room ID
            const roomId = `room_${crypto.randomBytes(8).toString('hex')}`;
            console.log(`Creating room ${roomId} for ${userA_SocketId} and ${clientB_SocketId}`);

            // 4. Store room info (participants, languages) in Redis
            const roomKey = `room:${roomId}`;
            // TODO: Get User A's language (needs to be sent when requesting QR or stored earlier)
            const userA_Language = 'en'; // Placeholder for User A's language
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
            // Notify User B (Scanner)
            socket.emit('joinedRoom', { roomId: roomId, partnerLanguage: userA_Language });
            // Notify User A (QR Generator)
            userASocket.emit('joinedRoom', { roomId: roomId, partnerLanguage: userB_Language });
            // Could also use io.to(roomId).emit(...) but emitting individually allows sending different partner languages

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
        const ttlInSeconds = 120;

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
                    const prompt = `Translate the following text from ${senderLang} to ${targetLang}. Output only the translated text, without any additional explanation or introduction.`;
                    console.log(`Sending to OpenAI: Model=${process.env.OPENAI_MODEL || 'gpt-4o'}, Prompt="${prompt}", Text="${messageText}"`);

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
            const recipientSocket = io.sockets.sockets.get(recipientSocketId);
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
                        const partnerSocket = io.sockets.sockets.get(partnerSocketId);
                        if (partnerSocket) {
                            console.log(`Notifying partner ${partnerSocketId} in room ${roomId} that user left`);
                            partnerSocket.emit('partnerLeft');
                        }
                         // Remove the disconnected user's socket mapping
                        console.log(`[Redis DEL ${userRoomKey}] Attempting for disconnect...`);
                        await redisClient.del(userRoomKey);
                        console.log(`[Redis DEL ${userRoomKey}] Success for disconnect.`);

                        // Optionally: Leave room management to Redis TTL or implement explicit cleanup
                        // For now, let's remove the room data if one person leaves
                        console.log(`Removing room data for room ${roomId} as one user left.`);
                        console.log(`[Redis DEL ${roomKey}] Attempting for disconnect cleanup...`);
                        await redisClient.del(roomKey);
                        console.log(`[Redis DEL ${roomKey}] Success for disconnect cleanup.`);
                         // Also remove the partner's socket mapping
                        const partnerKey = `user_socket:${partnerSocketId}`;
                        console.log(`[Redis DEL ${partnerKey}] Attempting partner cleanup...`);
                        await redisClient.del(partnerKey);
                        console.log(`[Redis DEL ${partnerKey}] Success partner cleanup.`);

                    } else {
                        // If no partner was found (maybe already disconnected), just clean up
                        console.log(`No partner found for disconnected user ${disconnectedSocketId} in room ${roomId}. Cleaning up.`);
                         console.log(`[Redis DEL ${roomKey}] Attempting for disconnect cleanup...`);
                         await redisClient.del(roomKey);
                         console.log(`[Redis DEL ${roomKey}] Success for disconnect cleanup.`);
                         await redisClient.del(userRoomKey); // Clean up potentially stale mapping
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

    // TODO: Handle 'leaveRoom' event (optional explicit leave)

    // TODO: Handle 'setLanguage' event (optional)

});


// Add a health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        uptime: process.uptime(),
        timestamp: Date.now(),
        redis: redisClient && redisClient.isReady ? 'connected' : 'disconnected',
        socketio: io ? 'initialized' : 'not initialized',
    };
    res.json(healthData);
});

// Add an API test endpoint 
app.get('/api/test', (req, res) => {
    res.json({ message: 'API routes are working correctly' });
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
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