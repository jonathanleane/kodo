import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Platform
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import io, { Socket } from 'socket.io-client';
import { router, useNavigation, Href } from 'expo-router';
import * as Network from 'expo-network'; // To get IP address
import { DefaultEventsMap } from '@socket.io/component-emitter';

// Define types for socket events if desired (optional but good practice)
// interface ServerToClientEvents {
//   tokenGenerated: (token: string) => void;
//   joinedRoom: ({ roomId, partnerLanguage }: { roomId: string; partnerLanguage: string }) => void;
//   error: (error: { message: string }) => void;
// }
// interface ClientToServerEvents {
//   generateToken: () => void;
// }

// Backend URL configuration
// const BACKEND_URL = 'http://localhost:3001'; // Local development
// const BACKEND_URL = 'https://kodo-app-5dhoh.ondigitalocean.app'; // DigitalOcean (legacy)
const BACKEND_URL = 'https://kodo-production.up.railway.app'; // Railway backend
// Base URL for the web app itself (for the QR code link)
// For mobile testing on local network, this needs to be IP address
// For web testing, localhost:8081 works
// For deployment, this would be your actual domain
const WEB_APP_PORT = 8081; // Default Expo web port
const FRONTEND_URL = 'https://zonal-benevolence-production.up.railway.app'; // Updated Railway frontend URL

// Type for the socket instance
type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap>;

// Define the path for Socket.IO (standard path)
const socketIoPath = "/socket.io";

export default function GenerateQRScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Preparing...');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<AppSocket | null>(null);
  
  // Always use the production frontend URL for QR codes
  const webAppBaseUrl = FRONTEND_URL;
  const navigation = useNavigation(); // Use navigation hook if needed for header etc.

  // Generate a QR code via HTTP instead of socket
  useEffect(() => {
    console.log("Generate QR Screen: Using HTTP endpoint to generate token");
    setStatus('Requesting QR Code...');
    
    // Make a direct HTTP request to the /generate-qr endpoint
    fetch(`${BACKEND_URL}/generate-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useHttp: true }) // Flag to indicate HTTP-based flow
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Token received from backend HTTP endpoint:', data.token);
      const receivedToken = data.token;
      if (receivedToken) {
        setToken(receivedToken);
        const joinUrl = `${webAppBaseUrl}/join?token=${receivedToken}`;
        setQrUrl(joinUrl);
        console.log("Generated QR URL:", joinUrl);
        setStatus('Scan the QR code below');
        
        // Also connect with socket for real-time room joining
        connectWithSocket(receivedToken);
      } else {
        setError('Backend did not provide a token.');
        setStatus('Error');
      }
    })
    .catch(err => {
      console.error('Error generating token via HTTP:', err);
      setError(`Failed to generate QR code: ${err.message}`);
      setStatus('Error');
    });
  }, []); // Run once on mount


  // Helper function to connect to socket.io after token is generated via HTTP
  function connectWithSocket(token: string) {
    console.log('Connecting to backend with pre-generated token:', token);
    const backendTarget = BACKEND_URL;
    
    // Connect directly to the backend-temp namespace
    const namespace = 'backend-temp';
    console.log(`Using namespace: ${namespace}`);
    
    // Create Socket.IO connection with better reconnection settings
    socketRef.current = io(`${backendTarget}/${namespace}`, {
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000,
      transports: ['polling', 'websocket'],
      path: '/socket.io',
      forceNew: true,
      autoConnect: true,
      withCredentials: false,
      pingInterval: 10000,
      pingTimeout: 20000
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Connected to backend with socket ID:', socket.id);
      // Explicitly emit listenForToken with the generated token
      setTimeout(() => {
        console.log('Emitting listenForToken event for token:', token);
        socket.emit('listenForToken', { token: token });
      }, 1000); // Add a small delay to ensure connection is stable
    });
    
    // Add event listener for room joining
    socket.on('joinedRoom', ({ roomId, partnerLanguage }) => {
      console.log(`Host joined room ${roomId} with partner language ${partnerLanguage}`);
      setStatus('Partner joined!');
      router.push({
        pathname: '/join',
        params: { roomId, myLanguage: 'en', partnerLanguage, joined: 'true' }
      } as any);
    });

    // Add listeners for errors
    socket.on('error', (errorMessage: { message: string }) => {
      console.error('Received error from server:', errorMessage);
      setError(errorMessage.message || 'Server error');
    });

    socket.on('connect_error', (err: Error) => {
      console.error('Socket connection error:', err);
    });

    return socket; // Return the socket for cleanup
  }
  
  // Add cleanup for socket when component unmounts
  useEffect(() => {
    // Cleanup function
    return () => {
      if (socketRef.current && socketRef.current.connected) {
        console.log('Leaving Generate screen, disconnecting socket...');
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{status}</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {qrUrl && !error ? (
        <QRCode
          value={qrUrl}
          size={250}
          color="black"
          backgroundColor="white"
        />
      ) : (
        !error && <ActivityIndicator size="large" color="#007AFF" />
      )}
      {qrUrl && !error && <Text style={styles.info}>Ask your chat partner to scan this code using their phone's camera.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5'
  },
  status: {
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center'
  },
   errorText: {
        color: 'red',
        marginBottom: 20,
        textAlign: 'center',
        fontWeight: 'bold'
    },
  info: {
      marginTop: 30,
      textAlign: 'center',
      fontSize: 16,
      color: 'grey',
      paddingHorizontal: 10,
  }
}); 