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

// TODO: Replace with your actual backend URL if deployed
// const BACKEND_URL = 'http://localhost:3001'; // Default for local dev
const BACKEND_URL = 'https://kodo-app-5dhoh.ondigitalocean.app/backend-temp'; // Try using the explicitly routed backend URL
// Base URL for the web app itself (for the QR code link)
// For mobile testing on local network, this needs to be IP address
// For web testing, localhost:8081 works
// For deployment, this would be your actual domain
const WEB_APP_PORT = 8081; // Default Expo web port

// Type for the socket instance
type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap>;

// Define the path for Socket.IO (must match server and ingress)
const socketIoPath = "/socket.io"; // Use standard path instead of /api prefix for testing

export default function GenerateQRScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Connecting...');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<AppSocket | null>(null);
  const [webAppBaseUrl, setWebAppBaseUrl] = useState<string | null>(`http://localhost:${WEB_APP_PORT}`);
  const navigation = useNavigation(); // Use navigation hook if needed for header etc.

  // Get local IP address for QR code generation if not on web
  useEffect(() => {
    if (Platform.OS !== 'web') {
      Network.getIpAddressAsync().then((ipAddress: string) => {
        console.log("Device IP Address:", ipAddress);
        setWebAppBaseUrl(`http://${ipAddress}:${WEB_APP_PORT}`);
      }).catch((err: any) => {
        console.error("Could not get IP address:", err);
        setError("Could not determine device IP address for QR code. Ensure you're on a network.");
        setStatus("Error");
      });
    } else {
      // Ensure webAppBaseUrl is set even for web platform if not already
       if (!webAppBaseUrl) {
            setWebAppBaseUrl(`http://localhost:${WEB_APP_PORT}`);
        }
    }
  }, [webAppBaseUrl]); // Add webAppBaseUrl dependency


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
    
    socketRef.current = io(backendTarget, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'], // Allow fallback to polling if websocket fails
      // Tell client to connect to this path
      path: socketIoPath,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Connected to backend with socket ID:', socket.id);
      setStatus('Requesting QR Code...');
      console.log('Emitting generateToken event...');
      socket.emit('generateToken');
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
            console.log('HTTP connection works but WebSocket failed');
            return response.json();
          } else {
            console.error('HTTP connection also failed:', response.status);
            throw new Error(`HTTP status ${response.status}`);
          }
        })
        .then(data => console.log('Health check response:', data))
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

    // Cleanup on unmount
    return () => {
      if (socketRef.current && socketRef.current.connected) {
        console.log('Leaving Generate screen, disconnecting socket...');
        socketRef.current.disconnect();
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