import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Platform
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
// import io, { Socket } from 'socket.io-client'; // No longer need direct import
import { router, useNavigation, Href } from 'expo-router';
import { useSocket } from '../context/SocketContext'; // Import the hook
// import * as Network from 'expo-network'; // To get IP address
// import { DefaultEventsMap } from '@socket.io/component-emitter'; // Type comes from context

// Backend URL configuration
// const BACKEND_URL = 'http://localhost:3001'; // Local development
// const BACKEND_URL = 'https://kodo-app-5dhoh.ondigitalocean.app'; // DigitalOcean (legacy)
const BACKEND_URL = 'https://kodo-backend-production.up.railway.app'; // NEW Correct backend URL
// Base URL for the web app itself (for the QR code link)
const FRONTEND_URL = 'https://kodo-frontend-production.up.railway.app'; // NEW Correct frontend URL

// Define the path for Socket.IO (standard path)
// const socketIoPath = "/socket.io"; // Managed by context

export default function GenerateQRScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Preparing...');
  const [error, setError] = useState<string | null>(null);
  // const socketRef = useRef<AppSocket | null>(null); // Remove socketRef
  const { socket, connect, disconnect, isConnected } = useSocket(); // Use context

  // Always use the production frontend URL for QR codes
  const webAppBaseUrl = FRONTEND_URL;
  const navigation = useNavigation(); // Use navigation hook if needed for header etc.

  // Generate a QR code via HTTP and then connect socket
  useEffect(() => {
    console.log("Generate QR Screen: Using HTTP endpoint to generate token");
    setStatus('Requesting QR Code...');
    let currentToken: string | null = null;

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
      currentToken = data.token;
      if (currentToken) {
        setToken(currentToken);
        const joinUrl = `${webAppBaseUrl}/join?token=${currentToken}`;
        setQrUrl(joinUrl);
        console.log("Generated QR URL:", joinUrl);
        setStatus('Connecting to chat service...');
        
        // Connect using the context's connect function
        return connect(); // Return the promise from connect()
      } else {
        throw new Error('Backend did not provide a token.');
      }
    })
    .then((connectedSocket) => {
      // This runs after socket connection is successful
      setStatus('Scan the QR code below');
      console.log('Socket connected via context, ID:', connectedSocket.id);
      
      // Now that we are connected and have the token, listen for it
      if (currentToken) {
        console.log('Emitting listenForToken event for token:', currentToken);
        connectedSocket.emit('listenForToken', { token: currentToken });

        // Add listener for when the partner joins
        connectedSocket.on('joinedRoom', ({ roomId, partnerLanguage }) => {
          console.log(`Host joined room ${roomId} with partner language ${partnerLanguage}`);
          setStatus('Partner joined!');
          // Navigate to join screen (which acts as chat screen for host)
          // The socket instance is available via context on the target screen
          router.push({
            pathname: '/join',
            params: { roomId, myLanguage: 'en', partnerLanguage, joined: 'true' }
          } as any);
        });

        // Add listener for general errors on this socket instance
        connectedSocket.on('error', (errorMessage: { message: string }) => {
            console.error('Generate Screen: Received error from server:', errorMessage);
            setError(errorMessage.message || 'Server error during connection/wait');
            setStatus('Error');
            // Maybe disconnect on error?
            // disconnect(); 
        });
      } else {
          throw new Error("Token was lost before socket connection completed.");
      }
    })
    .catch(err => {
      console.error('Error during token generation or socket connection:', err);
      setError(`Failed setup: ${err.message}`);
      setStatus('Error');
    });

    // Cleanup function for the effect
    return () => {
        // Remove listeners specific to this screen when component unmounts
        // Check if socket exists before trying to remove listeners
        if (socket) {
            console.log("GenerateQRScreen: Cleaning up listeners");
            socket.off('joinedRoom');
            socket.off('error');
            // Decide if we should disconnect here. Usually, we want the socket
            // to persist until the user explicitly leaves the chat flow.
            // If navigating away means abandoning the chat setup, uncomment disconnect:
            // disconnect(); 
        }
    };
    // Dependencies: connect hook and socket instance (for cleanup)
  }, [connect, socket]); 

  // Remove the local connectWithSocket function
  // function connectWithSocket(token: string) { ... } // REMOVED
  
  // Remove the local socket cleanup useEffect
  // useEffect(() => { ... }); // REMOVED

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{status}</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {qrUrl && !error && status !== 'Connecting to chat service...' ? (
        <QRCode
          value={qrUrl}
          size={250}
          color="black"
          backgroundColor="white"
        />
      ) : (
        !error && <ActivityIndicator size="large" color="#007AFF" />
      )}
      {qrUrl && !error && status !== 'Connecting to chat service...' && (
          <Text style={styles.info}>Ask your chat partner to scan this code using their phone's camera.</Text>
      )}
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