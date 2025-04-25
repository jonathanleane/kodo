import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define environment-specific server URL
const SERVER_URL = __DEV__ 
  ? 'http://localhost:3001' // Development
  : 'https://api.kodo-app.com'; // Production

type SocketContextType = {
  socket: Socket | null;
  isConnected: boolean;
  reconnect: () => void;
};

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  reconnect: () => {},
});

type SocketProviderProps = {
  children: ReactNode;
};

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const setupSocket = () => {
    // Create socket connection
    const newSocket = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Set up event listeners
    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnected(false);
    });

    // Store socket instance
    setSocket(newSocket);

    // Return cleanup function
    return () => {
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  };

  // Initialize socket on component mount
  useEffect(() => {
    const cleanup = setupSocket();
    return cleanup;
  }, []);

  // Function to manually reconnect
  const reconnect = () => {
    if (socket) {
      socket.disconnect();
    }
    setupSocket();
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        reconnect,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use the socket context
export const useSocket = () => useContext(SocketContext);
