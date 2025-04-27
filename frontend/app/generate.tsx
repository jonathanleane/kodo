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
// import io, { Socket } from 'socket.io-client'; // No longer need direct import
import { router, useNavigation, Href } from 'expo-router';
import { useSocket } from '../context/SocketContext'; // Import the hook
// import * as Network from 'expo-network'; // To get IP address
// import { DefaultEventsMap } from '@socket.io/component-emitter'; // Type comes from context

// Use environment variables provided by the build environment
// Fallback to hardcoded values only if environment variables are not set (useful for local dev without .env)
// const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://kodo-backend-production.up.railway.app'; 
// const FRONTEND_URL = process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://kodo-frontend-production.up.railway.app';

// HARDCODE for now to ensure correct URL is used
const BACKEND_URL = 'https://kodo-backend-s7vj.onrender.com'; // NEW Render Backend URL
const FRONTEND_URL = 'https://kodo-frontend.onrender.com'; // Use the actual Render Frontend URL

console.log('Using BACKEND_URL:', BACKEND_URL);
console.log('Using FRONTEND_URL:', FRONTEND_URL);

// Define the path for Socket.IO (standard path)
// const socketIoPath = "/socket.io"; // Managed by context

export default function GenerateQRScreen() {
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Preparing...');
  const [error, setError] = useState<string | null>(null);
  const { socket, connect, disconnect, isConnected } = useSocket();
  const hasFetchedToken = useRef(false);
  const hasConnectedSocket = useRef(false);

  const webAppBaseUrl = FRONTEND_URL;
  const navigation = useNavigation();

  useEffect(() => {
    if (hasFetchedToken.current) return;
    hasFetchedToken.current = true; 

    console.log("Generate QR Screen: Fetching token...");
    setStatus('Requesting QR Code...');
    setError(null);

    let fetchedToken: string | null = null;

    fetch(`${BACKEND_URL}/generate-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useHttp: true })
    })
    .then(response => {
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      return response.json();
    })
    .then(data => {
      fetchedToken = data.token;
      if (!fetchedToken) throw new Error('Backend did not provide a token.');
      
      console.log('Token received:', fetchedToken);
      setQrToken(fetchedToken);
      const joinUrl = `${webAppBaseUrl}/join?token=${fetchedToken}`;
      setQrUrl(joinUrl);
      console.log("Generated QR URL:", joinUrl);
      setStatus('Connecting to chat service...');
      
      if (!isConnected && !hasConnectedSocket.current) {
          hasConnectedSocket.current = true;
          return connect();
      }
      return Promise.resolve(socket);
    })
    .then((connectedSocket) => {
        if (!connectedSocket) throw new Error("Socket connection failed or wasn't available.");
        console.log('Socket connected via context, ID:', connectedSocket.id);
        setStatus('Scan the QR code below');
        hasConnectedSocket.current = true;
    })
    .catch(err => {
      console.error('Error during token generation or initial socket connection:', err);
      setError(`Setup failed: ${err.message}`);
      setStatus('Error');
      hasFetchedToken.current = false;
      hasConnectedSocket.current = false;
    });

    return () => {
      console.log("GenerateQRScreen: Unmounting token fetch/connect effect");
    };
  }, [connect, isConnected, socket]);

  useEffect(() => {
    if (isConnected && socket && qrToken) {
      console.log('GenerateQRScreen: Socket connected and token available. Setting up listeners and emitting listenForToken.');

      console.log('Emitting listenForToken event for token:', qrToken);
      socket.emit('listenForToken', { token: qrToken });

      const handleJoinedRoom = ({ roomId, partnerLanguage }: { roomId: string; partnerLanguage: string }) => {
        console.log(`Host joined room ${roomId} with partner language ${partnerLanguage}`);
        setStatus('Partner joined!');
        router.push({
          pathname: '/join',
          params: { roomId, myLanguage: 'en', partnerLanguage, joined: 'true' }
        } as any);
      };
      
      const handleError = (errorMessage: { message: string }) => {
          console.error('Generate Screen: Received error from server via socket:', errorMessage);
          setError(errorMessage.message || 'Server error during connection/wait');
          setStatus('Error');
      };

      socket.on('joinedRoom', handleJoinedRoom);
      socket.on('error', handleError);

      return () => {
          console.log("GenerateQRScreen: Cleaning up socket listeners");
          socket.off('joinedRoom', handleJoinedRoom);
          socket.off('error', handleError);
      };
    }
  }, [isConnected, socket, qrToken, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{status}</Text>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {qrUrl && status === 'Scan the QR code below' && !error ? (
        <QRCode
          value={qrUrl}
          size={250}
          color="black"
          backgroundColor="white"
        />
      ) : (
        !error && <ActivityIndicator size="large" color="#007AFF" />
      )}
      {qrUrl && status === 'Scan the QR code below' && !error && (
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