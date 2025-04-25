/**
 * Room data structure stored in Redis
 */
export interface RoomData {
  host: {
    socketId: string | null;
    language: string;
  };
  guest: {
    socketId: string | null;
    language: string;
  };
  createdAt: string;
}

/**
 * QR token data structure stored in Redis
 */
export interface TokenData {
  language: string;
  createdAt: string;
}

/**
 * Message structure sent between clients
 */
export interface Message {
  id: string;
  original: string;
  translated: string;
  sender: 'self' | 'partner' | 'host' | 'guest';
  timestamp: string;
}

/**
 * Socket.IO client event payloads
 */
export interface SocketEvents {
  // Client -> Server
  join: {
    token: string;
    language: string;
  };
  joinAsHost: {
    roomId: string;
  };
  sendMessage: {
    roomId: string;
    messageText: string;
  };
  
  // Server -> Client
  roomCreated: {
    roomId: string;
    partnerLanguage: string;
  };
  roomJoined: {
    roomId: string;
    partnerLanguage: string;
  };
  partnerJoined: {
    partnerLanguage: string;
  };
  newMessage: Message;
  partnerLeft: void;
  error: {
    message: string;
  };
}
