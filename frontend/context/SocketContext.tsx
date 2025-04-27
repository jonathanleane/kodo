import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import { DefaultEventsMap } from '@socket.io/component-emitter';

// Backend URL configuration - Ensure this matches your actual backend URL
const BACKEND_URL = 'https://kodo-backend-production.up.railway.app';
const SOCKET_NAMESPACE = '/backend-temp'; // Use the correct namespace

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
    // Prevent multiple connections
    if (socket?.connected) {
        console.log('Socket already connected.');
        return socket;
    }

    console.log(`SocketContext: Attempting connection to ${BACKEND_URL}${SOCKET_NAMESPACE}...`);
    const newSocket = io(`${BACKEND_URL}${SOCKET_NAMESPACE}`, {
      reconnectionAttempts: 5, // Sensible defaults
      timeout: 20000,
      transports: ['polling', 'websocket'],
      path: '/socket.io',
      forceNew: true, // Ensure a new connection if needed
      autoConnect: false, // Connect manually
      withCredentials: false,
    });

    setSocket(newSocket); // Store the socket instance immediately

    // Return a promise that resolves on connect or rejects on error
    return new Promise((resolve, reject) => {
        newSocket.on('connect', () => {
            console.log('SocketContext: Connected! ID:', newSocket.id);
            setIsConnected(true);
            resolve(newSocket);
        });

        newSocket.on('disconnect', (reason) => {
            console.log('SocketContext: Disconnected.', reason);
            setIsConnected(false);
            // Consider automatic cleanup or state reset if needed
            // setSocket(null); // Optionally clear socket on disconnect
        });

        newSocket.on('connect_error', (err) => {
            console.error('SocketContext: Connection Error:', err);
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
      console.log('SocketContext: Disconnecting socket...');
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