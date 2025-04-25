import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import io from 'socket.io-client';

// TODO: Replace with your actual backend URL
const BACKEND_URL = 'http://localhost:3001'; // Use IP address for physical devices
const DEEP_LINK_BASE = 'mychat://join?token=';

export default function GenerateQRScreen({ navigation }) {
  const [token, setToken] = useState(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [status, setStatus] = useState('Connecting...');
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Establish WebSocket connection
    console.log('Attempting to connect to backend...');
    socketRef.current = io(BACKEND_URL, {
      reconnectionAttempts: 5,
      transports: ['websocket'], // Explicitly use WebSocket
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Connected to backend with socket ID:', socket.id);
      setStatus('Requesting QR Code...');
      // Once connected, request a token
      // Option 1: Send request via WS (preferred)
      console.log('Emitting generateToken event...');
      socket.emit('generateToken'); 
      // Option 2: Make HTTP request (requires passing socket.id)
      // fetch(`${BACKEND_URL}/generate-qr`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json', 'X-Socket-ID': socket.id },
      //   body: JSON.stringify({ socketId: socket.id }) // Redundant if using header
      // })
      // .then(res => res.json())
      // .then(data => {
      //   if (data.token) {
      //     setToken(data.token);
      //     setQrUrl(DEEP_LINK_BASE + data.token);
      //     setStatus('Scan the QR code below');
      //   } else {
      //      throw new Error(data.error || 'Failed to get token from backend');
      //   }
      // })
      // .catch(err => {
      //   console.error("Error fetching QR token:", err);
      //   setError('Could not generate QR code. Please try again.');
      //   setStatus('Error');
      // });
    });

    socket.on('tokenGenerated', (receivedToken) => {
      console.log('Token received from backend:', receivedToken);
      if (receivedToken) {
        setToken(receivedToken);
        setQrUrl(DEEP_LINK_BASE + receivedToken);
        setStatus('Scan the QR code below');
        setError(null);
      } else {
        setError('Backend did not provide a token.');
        setStatus('Error');
      }
    });

    socket.on('joinedRoom', ({ roomId, partnerLanguage }) => {
      console.log(`Joined room ${roomId} with partner language ${partnerLanguage}`);
      setStatus('Partner joined!');
      // Navigate to chat screen, passing necessary info
      navigation.replace('Chat', { roomId, myLanguage: 'en', partnerLanguage, socket: socketRef.current }); // Pass socket instance
    });

    socket.on('connect_error', (err) => {
      console.error('Connection Error:', err.message);
      setError(`Failed to connect to server: ${err.message}. Make sure the backend is running at ${BACKEND_URL}.`);
      setStatus('Connection Failed');
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from backend:', reason);
      if (reason !== 'io client disconnect') { // Don't show error if we intentionally disconnect
        setStatus('Disconnected');
        setError('Lost connection to the server.');
      }
    });

    socket.on('error', (errorMessage) => {
        console.error('Received error from server:', errorMessage);
        Alert.alert('Server Error', errorMessage.message || 'An unknown error occurred.');
        // Decide if we should navigate back or just show the error
        setStatus('Error');
        setError(errorMessage.message || 'Server error');
    });

    // Cleanup on unmount
    return () => {
      if (socket) {
        console.log('Disconnecting socket...');
        socket.disconnect();
      }
    };
  }, [navigation]); // Add navigation dependency

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
        !error && <ActivityIndicator size="large" color="#0000ff" />
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
  },
  status: {
    fontSize: 18,
    marginBottom: 20,
  },
   errorText: {
        color: 'red',
        marginBottom: 20,
        textAlign: 'center',
    },
  info: {
      marginTop: 30,
      textAlign: 'center',
      fontSize: 16,
      color: 'grey'
  }
}); 