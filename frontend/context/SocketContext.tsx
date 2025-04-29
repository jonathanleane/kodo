import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { DefaultEventsMap } from '@socket.io/component-emitter';

// Revert to using ENV VARS with fallbacks for local dev
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3001'; 
// Remove hardcoded URL
// const BACKEND_URL = 'https://kodo-backend-s7vj.onrender.com'; 
const SOCKET_NAMESPACE = '/backend-temp'; 

console.log('[SocketContext] Using BACKEND_URL:', BACKEND_URL);

// Type for the socket instance
export type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap>;

interface SocketContextProps {
  socket: AppSocket | null;
  isConnected: boolean;
  connect: () => Promise<AppSocket>;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextProps | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(async (): Promise<AppSocket> => {
    if (socket?.connected) {
        // console.log('Socket already connected.'); // REMOVE LOG
        return socket;
    }

    // console.log(`SocketContext: Attempting connection to ${BACKEND_URL}${SOCKET_NAMESPACE}...`); // REMOVE LOG
    const newSocket = io(`${BACKEND_URL}${SOCKET_NAMESPACE}`, {
      reconnectionAttempts: 30, // Try for ~2-3 minutes before failing
      timeout: 60000, // Keep increased timeout
      transports: ['websocket'], // FORCE WEBSOCKET ONLY
      path: '/socket.io',
      autoConnect: false, // Connect manually
      withCredentials: false,
    });

    setSocket(newSocket); // Store the socket instance immediately

    // Return a promise that resolves on connect or rejects on error
    return new Promise((resolve, reject) => {
        newSocket.on('connect', () => {
            // console.log('SocketContext: Connected! ID:', newSocket.id); // REMOVE LOG
            setIsConnected(true);
            resolve(newSocket);
        });

        newSocket.on('disconnect', (reason) => {
            // console.log('SocketContext: Disconnected.', reason); // REMOVE LOG
            setIsConnected(false);
            // Consider automatic cleanup or state reset if needed
            // setSocket(null); // Optionally clear socket on disconnect
        });

        newSocket.on('connect_error', (err) => {
            console.error('SocketContext: Connection Error:', err); // Keep error log
            setIsConnected(false);
            setSocket(null); // Clear broken socket
            reject(err);
        });

        // Manually initiate the connection
        newSocket.connect();
    });
  }, [socket]); // Depend on socket state

  const disconnect = useCallback(() => {
    if (socket) {
      // console.log('SocketContext: Disconnecting socket...'); // REMOVE LOG
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket]);

  // Cleanup on provider unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, connect, disconnect }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextProps => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}; 