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
  const [status, setStatus] = useState<string>('Connecting...');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<AppSocket | null>(null);
  const [webAppBaseUrl, setWebAppBaseUrl] = useState<string | null>(`http://localhost:${WEB_APP_PORT}`);
  const navigation = useNavigation(); // Use navigation hook if needed for header etc.

  // Configure the URL for QR code generation
  useEffect(() => {
    // ALWAYS use the production URL for the QR code in the deployed environment
    // This ensures consistent behavior and prevents localhost URLs from appearing
    console.log("Setting QR code URL to production frontend URL");
    setWebAppBaseUrl(FRONTEND_URL);
    
    // Log the URL for debugging
    console.log("QR Code will use URL:", FRONTEND_URL);
    console.log("Current window.location.hostname:", window.location.hostname);
  }, []); // No dependencies needed


  useEffect(() => {
    if (!webAppBaseUrl) {
        // Don't try to connect if we don't have the base URL yet (e.g., IP address error)
        setStatus("Waiting for network info...");
        return;
    }

    console.log('Attempting to connect to backend...');
    const backendTarget = BACKEND_URL;

    // Log the connection attempt details
    console.log(`Attempting to connect to: ${backendTarget} with path: ${socketIoPath}`);
    
    // Connect directly to the backend-temp namespace
    const namespace = 'backend-temp';
    console.log(`Using namespace: ${namespace}`);
    
    // Create Socket.IO connection with better reconnection settings
    socketRef.current = io(`${backendTarget}/${namespace}`, {
      reconnectionAttempts: 30,         // More reconnection attempts
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000,                   // Longer timeout
      transports: ['polling', 'websocket'],
      path: '/socket.io',               // Explicit path
      forceNew: true,
      autoConnect: true,
      withCredentials: false,
      pingInterval: 10000,              // More frequent pings to keep connection alive
      pingTimeout: 20000                // Longer ping timeout
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Connected to backend with socket ID:', socket.id);
      setStatus('Requesting QR Code...');
      console.log('Emitting generateToken event...');
      // Add a slight delay to ensure connection is stable
      setTimeout(() => {
        socket.emit('generateToken');
      }, 500);
    });

    socket.on('tokenGenerated', (receivedToken: string) => {
      console.log('Token received from backend:', receivedToken);
      if (receivedToken && webAppBaseUrl) {
        setToken(receivedToken);
        const joinUrl = `${webAppBaseUrl}/join?token=${receivedToken}`;
        setQrUrl(joinUrl);
        console.log("Generated QR URL:", joinUrl);
        setStatus('Scan the QR code below');
        setError(null);
      } else if (!webAppBaseUrl) {
         setError('Could not determine the web app URL for the QR Code.');
         setStatus('Error');
      } else {
        setError('Backend did not provide a token.');
        setStatus('Error');
      }
    });

    socket.on('joinedRoom', ({ roomId, partnerLanguage }: { roomId: string; partnerLanguage: string }) => {
      console.log(`Partner joined room ${roomId} with language ${partnerLanguage}`);
      setStatus('Partner joined!');
       router.push({
          pathname: '/join',
          params: { roomId, myLanguage: 'en', partnerLanguage, joined: 'true' }
       } as any); // Bypass type checking for now
       // IMPORTANT: Disconnect this socket as the chat screen manages its own connection
       if (socket) socket.disconnect();
    });

    socket.on('connect_error', (err: Error) => {
      console.error('Connection Error:', err.message);
      console.error('Connection Error details:', err);
      setError(`Failed to connect to server: ${err.message}. Make sure the backend is running at ${backendTarget}.`);
      setStatus('Connection Failed');
      
      // Try a direct fetch to test the HTTP connection
      fetch(`${backendTarget}/health`)
        .then(response => {
          if (response.ok) {
            console.log('HTTP connection works but Socket.IO connection failed');
            return response.json();
          } else {
            console.error('HTTP connection also failed:', response.status);
            throw new Error(`HTTP status ${response.status}`);
          }
        })
        .then(data => {
          console.log('Health check response:', data);
          // Show alternative error message for user
          setError(`Failed to establish real-time connection. Using HTTP fallback would require changes to the app architecture.`);
        })
        .catch(err => console.error('Health check failed:', err));
    });
    
    // Add listener for server acknowledgment
    socket.on('server_ack', (data) => {
      console.log('Received server acknowledgment:', data);
    });

    socket.on('disconnect', (reason: Socket.DisconnectReason) => {
      console.log('Disconnected from backend:', reason);
      // Check if navigation happened - simple check using router state might be unreliable here
      // Let's assume if the socket isn't explicitly closed by `joinedRoom`, it's an unexpected disconnect
      if (socketRef.current && socketRef.current.connected) {
         // Only show error if we didn't intentionally disconnect
         setStatus('Disconnected');
         setError('Lost connection to the server.');
      }
    });

    socket.on('error', (errorMessage: { message: string }) => {
        console.error('Received error from server:', errorMessage);
        Alert.alert('Server Error', errorMessage.message || 'An unknown error occurred.');
        setStatus('Error');
        setError(errorMessage.message || 'Server error');
    });

    // Add periodic ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        console.log('Sending keep-alive ping to server...');
        // This is a custom ping - not needed if socket.io ping is working,
        // but adds an extra layer of keep-alive messaging
        socketRef.current.emit('ping');
      }
    }, 20000); // Every 20 seconds

    // Cleanup on unmount - but NOT when leaving normally after QR code is scanned
    return () => {
      clearInterval(pingInterval);
      // Only disconnect if we're not being redirected to the chat
      if (socketRef.current && socketRef.current.connected && status !== 'Partner joined!') {
        console.log('Leaving Generate screen, disconnecting socket...');
        socketRef.current.disconnect();
      } else {
        console.log('Keeping socket connection alive for room joining...');
      }
    };
  }, [webAppBaseUrl]); // Rerun effect if webAppBaseUrl changes

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