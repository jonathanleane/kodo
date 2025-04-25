import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { translateMessage } from './services/translationService';
import { 
  TOKEN_EXPIRY_SECONDS, 
  ROOM_EXPIRY_SECONDS 
} from './config/constants';

// Load environment variables
dotenv.config();

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// API route to generate QR code token
app.post('/generate-qr', async (req, res) => {
  try {
    const { language } = req.body;
    
    if (!language) {
      return res.status(400).json({ error: 'Language is required' });
    }
    
    // Generate a token
    const token = uuidv4();
    
    // Store token in Redis with expiry
    await redis.set(
      `qr_token:${token}`, 
      JSON.stringify({ 
        language,
        createdAt: new Date().toISOString() 
      }),
      'EX',
      TOKEN_EXPIRY_SECONDS
    );
    
    return res.status(200).json({ token });
  } catch (error) {
    console.error('Error generating QR token:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Join room with token
  socket.on('join', async ({ token, language }) => {
    try {
      if (!token || !language) {
        socket.emit('error', { message: 'Token and language are required' });
        return;
      }
      
      // Get token data from Redis
      const tokenData = await redis.get(`qr_token:${token}`);
      
      if (!tokenData) {
        socket.emit('error', { message: 'Invalid or expired token' });
        return;
      }
      
      const { language: hostLanguage } = JSON.parse(tokenData);
      
      // Create room ID
      const roomId = uuidv4();
      
      // Store room data in Redis with expiry
      await redis.set(
        `room:${roomId}`,
        JSON.stringify({
          host: {
            socketId: null, // Will be filled when host joins
            language: hostLanguage,
          },
          guest: {
            socketId: socket.id,
            language,
          },
          createdAt: new Date().toISOString(),
        }),
        'EX',
        ROOM_EXPIRY_SECONDS
      );
      
      // Store socket to room mapping
      await redis.set(`socket:${socket.id}`, roomId);
      
      // Join the room
      socket.join(roomId);
      
      // Emit room joined event to guest
      socket.emit('roomCreated', { 
        roomId, 
        partnerLanguage: hostLanguage 
      });
      
      // Broadcast room info to any connection with the token
      io.emit(`room:${token}`, { roomId });
      
      // Delete the token as it's been used
      await redis.del(`qr_token:${token}`);
      
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });
  
  // Host joining existing room
  socket.on('joinAsHost', async ({ roomId }) => {
    try {
      // Get room data
      const roomData = await redis.get(`room:${roomId}`);
      
      if (!roomData) {
        socket.emit('error', { message: 'Room not found or expired' });
        return;
      }
      
      const room = JSON.parse(roomData);
      
      // Update host socket ID
      room.host.socketId = socket.id;
      
      // Update room data in Redis
      await redis.set(
        `room:${roomId}`,
        JSON.stringify(room),
        'EX',
        ROOM_EXPIRY_SECONDS
      );
      
      // Store socket to room mapping
      await redis.set(`socket:${socket.id}`, roomId);
      
      // Join the room
      socket.join(roomId);
      
      // Emit events
      socket.emit('roomJoined', { 
        roomId, 
        partnerLanguage: room.guest.language 
      });
      
      socket.to(roomId).emit('partnerJoined', { 
        partnerLanguage: room.host.language 
      });
      
    } catch (error) {
      console.error('Error host joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });
  
  // Send message
  socket.on('sendMessage', async ({ roomId, messageText }) => {
    try {
      // Get room data
      const roomData = await redis.get(`room:${roomId}`);
      
      if (!roomData) {
        socket.emit('error', { message: 'Room not found or expired' });
        return;
      }
      
      const room = JSON.parse(roomData);
      
      // Determine sender and recipient
      const isHost = room.host.socketId === socket.id;
      const senderLanguage = isHost ? room.host.language : room.guest.language;
      const recipientLanguage = isHost ? room.guest.language : room.host.language;
      const recipientSocketId = isHost ? room.guest.socketId : room.host.socketId;
      
      // Translate the message
      const translatedText = await translateMessage(
        messageText, 
        senderLanguage, 
        recipientLanguage
      );
      
      // Create message object
      const message = {
        id: uuidv4(),
        original: messageText,
        translated: translatedText,
        sender: isHost ? 'host' : 'guest',
        timestamp: new Date().toISOString(),
      };
      
      // Send to recipient
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('newMessage', {
          ...message,
          sender: 'partner',
        });
      }
      
      // Send to sender (confirm)
      socket.emit('newMessage', {
        ...message,
        sender: 'self',
      });
      
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      console.log(`Client disconnected: ${socket.id}`);
      
      // Get roomId for this socket
      const roomId = await redis.get(`socket:${socket.id}`);
      
      if (roomId) {
        // Get room data
        const roomData = await redis.get(`room:${roomId}`);
        
        if (roomData) {
          const room = JSON.parse(roomData);
          
          // Notify partner of disconnection
          if (room.host.socketId === socket.id && room.guest.socketId) {
            io.to(room.guest.socketId).emit('partnerLeft');
          } else if (room.guest.socketId === socket.id && room.host.socketId) {
            io.to(room.host.socketId).emit('partnerLeft');
          }
          
          // If both users disconnected, remove room data
          if (
            (room.host.socketId === socket.id && !room.guest.socketId) ||
            (room.guest.socketId === socket.id && !room.host.socketId)
          ) {
            await redis.del(`room:${roomId}`);
          } else {
            // Update room data (mark this user as disconnected)
            if (room.host.socketId === socket.id) {
              room.host.socketId = null;
            } else if (room.guest.socketId === socket.id) {
              room.guest.socketId = null;
            }
            
            await redis.set(
              `room:${roomId}`,
              JSON.stringify(room),
              'EX',
              ROOM_EXPIRY_SECONDS
            );
          }
        }
        
        // Remove socket mapping
        await redis.del(`socket:${socket.id}`);
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});