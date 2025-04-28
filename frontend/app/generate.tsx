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
import * as Localization from 'expo-localization'; // Import localization
import { Picker } from '@react-native-picker/picker'; // Simple picker

// Use environment variables provided by the build environment
// Fallback to hardcoded values only if environment variables are not set (useful for local dev without .env)
// const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://kodo-backend-production.up.railway.app'; 
// const FRONTEND_URL = process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://kodo-frontend-production.up.railway.app';

// Supported Languages (Example)
const SUPPORTED_LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
  { label: 'Français', value: 'fr' },
  { label: 'Bahasa Indonesia', value: 'id' },
  // Add more as needed
];

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
  const [status, setStatus] = useState<string>('Initializing...');
  const [error, setError] = useState<string | null>(null);
  // --- Language State --- 
  const defaultLanguage = Localization.getLocales()[0]?.languageCode || 'en';
  const [myLanguage, setMyLanguage] = useState<string>(SUPPORTED_LANGUAGES.find(l => l.value === defaultLanguage) ? defaultLanguage : 'en');
  // -------------------
  const { socket, connect, disconnect, isConnected } = useSocket();
  const hasFetchedToken = useRef(false);
  const hasConnectedSocket = useRef(false);

  const webAppBaseUrl = FRONTEND_URL;
  const navigation = useNavigation();

  useEffect(() => {
    if (hasFetchedToken.current) return;
    hasFetchedToken.current = true; 

    console.log(`Generate QR Screen: Fetching token for language: ${myLanguage}`);
    setStatus('Requesting QR Code...');
    setError(null);

    let fetchedToken: string | null = null;

    fetch(`${BACKEND_URL}/generate-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useHttp: true, language: myLanguage })
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
  }, [connect, myLanguage, isConnected, socket]);

  useEffect(() => {
    if (isConnected && socket && qrToken) {
      console.log(`[Effect 2] Running: Socket connected, token available. Language: ${myLanguage}`);
      
      console.log(`[Effect 2] Setting status to: Listening for partner...`);
      setStatus('Listening for partner... (Scan QR Code)');
      console.log(`[Effect 2] Status *should* be: Listening for partner...`);

      console.log(`[Effect 2] Emitting listenForToken for token: ${qrToken} with language ${myLanguage}`);
      socket.emit('listenForToken', { token: qrToken, language: myLanguage });

      const handleJoinedRoom = ({ roomId, partnerLanguage }: { roomId: string; partnerLanguage: string }) => {
        console.log(`[handleJoinedRoom] Triggered. My lang: ${myLanguage}, Partner Lang: ${partnerLanguage}. Setting status to: Partner joined! Navigating...`);
        setStatus('Partner joined! Navigating...');
        setTimeout(() => {
            console.log('[handleJoinedRoom] Navigating after delay...');
            router.push({
              pathname: '/join',
              params: { roomId, myLanguage: myLanguage, partnerLanguage, joined: 'true' }
            } as any);
        }, 500);
      };
      
      const handleError = (errorMessage: { message: string }) => {
          console.error('[handleError] Triggered. Error from server via socket:', errorMessage);
          setError(errorMessage.message || 'Server error during connection/wait');
          setStatus('Error listening for partner');
      };

      console.log('[Effect 2] Adding socket listeners (joinedRoom, error)');
      socket.on('joinedRoom', handleJoinedRoom);
      socket.on('error', handleError);

      return () => {
          console.log("[Effect 2 Cleanup] Cleaning up socket listeners");
          if(socket) {
            socket.off('joinedRoom', handleJoinedRoom);
            socket.off('error', handleError);
          }
      };
    } else {
        console.log(`[Effect 2] Skipped: isConnected=${isConnected}, socket exists=${!!socket}, qrToken exists=${!!qrToken}`);
    }
  }, [isConnected, socket, qrToken, router, myLanguage]);

  // Log state variables just before rendering
  console.log(`[Render] Status: "${status}", QR URL Ready: ${!!qrUrl}, Error: ${error}`);

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{status}</Text>
      {/* Language Picker - Show only initially */}
      {status === 'Initializing...' || status === 'Requesting QR Code...' ? (
          <View style={styles.pickerContainer}>
              <Text>Select Your Language:</Text>
              <Picker
                  selectedValue={myLanguage}
                  style={styles.picker}
                  onValueChange={(itemValue: string) => setMyLanguage(itemValue)}
              >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                      <Picker.Item key={lang.value} label={lang.label} value={lang.value} />
                  ))}
              </Picker>
          </View>
      ) : null}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {qrUrl && status === 'Listening for partner... (Scan QR Code)' && !error ? (
        <View style={styles.qrContainer}>
          <QRCode
            value={qrUrl}
            size={250}
            color="black"
            backgroundColor="white"
          />
          <Text style={styles.info}>Ask your chat partner to scan this code using their phone's camera.</Text>
        </View>
      ) : (
        !error && status !== 'Initializing...' && status !== 'Requesting QR Code...' && (
            <ActivityIndicator size="large" color="#007AFF" />
        )
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
  qrContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  info: {
      marginTop: 30,
      textAlign: 'center',
      fontSize: 16,
      color: 'grey',
      paddingHorizontal: 10,
  },
  debugText: {
      fontSize: 12,
      color: '#888',
      marginTop: 5,
  },
  pickerContainer: {
      width: '80%',
      marginBottom: 20,
      alignItems: 'center', 
  },
  picker: {
      height: 50,
      width: '100%',
      backgroundColor: '#FFF', // Optional styling
      marginTop: 5, 
  }
}); 