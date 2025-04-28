import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
// import io, { Socket } from 'socket.io-client'; // No longer need direct import
import { router, useNavigation, Href } from 'expo-router';
import { useSocket } from '../context/SocketContext'; // Import the hook
// import * as Network from 'expo-network'; // To get IP address
// import { DefaultEventsMap } from '@socket.io/component-emitter'; // Type comes from context
import * as Localization from 'expo-localization'; // Import localization
// import { Picker } from '@react-native-picker/picker'; // Use RadioButton instead
import { Button as PaperButton, RadioButton, Text as PaperText } from 'react-native-paper'; // Import Paper components
import * as Clipboard from 'expo-clipboard'; // Import clipboard

// Use environment variables provided by the build environment
// Fallback to hardcoded values only if environment variables are not set (useful for local dev without .env)
// const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://kodo-backend-production.up.railway.app'; 
// const FRONTEND_URL = process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://kodo-frontend-production.up.railway.app';

// Supported Languages (Example)
const SUPPORTED_LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
  { label: 'Français', value: 'fr' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Italiano', value: 'it' },
  { label: 'Português', value: 'pt' },
  { label: 'Русский', value: 'ru' },
  { label: '中文 (简体)', value: 'zh' }, // Or just 'zh-CN' if needed, API usually handles base 'zh'
  { label: '日本語', value: 'ja' },
  { label: '한국어', value: 'ko' },
  { label: 'العربية', value: 'ar' },
  { label: 'हिन्दी', value: 'hi' },
  { label: 'Bahasa Indonesia', value: 'id' },
  { label: 'Tagalog (Filipino)', value: 'tl' },
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
  const [status, setStatus] = useState<string>('selecting_language'); // Start with language selection
  const [error, setError] = useState<string | null>(null);
  // Language State 
  const defaultLanguage = Localization.getLocales()[0]?.languageCode || 'en';
  const [myLanguage, setMyLanguage] = useState<string>(SUPPORTED_LANGUAGES.find(l => l.value === defaultLanguage) ? defaultLanguage : 'en');
  const [languageConfirmed, setLanguageConfirmed] = useState(false); // Track confirmation
  const [linkCopied, setLinkCopied] = useState(false); // State for copy feedback
  const { socket, connect, disconnect, isConnected } = useSocket();
  const hasInitiatedProcess = useRef(false); // Track if fetch/connect started

  const webAppBaseUrl = FRONTEND_URL;
  const navigation = useNavigation();

  // Effect 1: Fetch token and connect socket AFTER language is confirmed
  useEffect(() => {
    // Only run if language confirmed, not already connected, and process not initiated
    if (languageConfirmed && !isConnected && !hasInitiatedProcess.current) { 
      hasInitiatedProcess.current = true; 
      
      console.log(`Generate QR Screen: Language ${myLanguage} confirmed. Fetching token...`);
      setStatus('Requesting QR Code...');
      setError(null);

      let fetchedToken: string | null = null;

      // Send language preference when fetching token
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
        
        // Connect socket
        return connect(); 
      })
      .then((connectedSocket) => {
          if (!connectedSocket) throw new Error("Socket connection failed or wasn't available.");
          console.log('Socket connected via context, ID:', connectedSocket.id);
          // Status updated by Effect 2
      })
      .catch(err => {
        console.error('Error during token generation or initial socket connection:', err);
        setError(`Setup failed: ${err.message}`);
        setStatus('Error');
        hasInitiatedProcess.current = false; // Allow retry by confirming language again?
        setLanguageConfirmed(false); // Go back to language selection on error
      });
    }
    // Dependencies: Trigger when language is confirmed or connection status changes
  }, [languageConfirmed, isConnected, connect, myLanguage]); 

  // Effect 2: Set up socket listeners (mostly unchanged, runs when connected)
  useEffect(() => {
    if (isConnected && socket && qrToken) {
      console.log(`[Effect 2] Running: Socket connected, token available. Language: ${myLanguage}`);
      setStatus('Listening for partner... (Scan QR Code)');
      console.log(`[Effect 2] Status *should* be: Listening for partner...`); 

      // Emit listenForToken now that we are connected and have the token AND LANGUAGE
      console.log(`[Effect 2] Emitting listenForToken for token: ${qrToken} with language ${myLanguage}`);
      socket.emit('listenForToken', { token: qrToken, language: myLanguage }); // Send language

      // Handler for joinedRoom event
      const handleJoinedRoom = ({ roomId, partnerLanguage }: { roomId: string; partnerLanguage: string }) => {
        console.log(`[handleJoinedRoom] Triggered. My lang: ${myLanguage}, Partner Lang: ${partnerLanguage}. Setting status to: Partner joined! Navigating...`);
        setStatus('Partner joined! Navigating...'); 
        setTimeout(() => {
            console.log('[handleJoinedRoom] Navigating after delay...');
            router.push({
              pathname: '/join',
              // Pass MY language to the chat screen
              params: { roomId, myLanguage: myLanguage, partnerLanguage, joined: 'true' }
            } as any);
        }, 500); 
      };
      
      // Handler for error event
      const handleError = (errorMessage: { message: string }) => {
          console.error('[handleError] Triggered. Error from server via socket:', errorMessage);
          setError(errorMessage.message || 'Server error during connection/wait');
          setStatus('Error listening for partner');
      };

      // Add listeners
      console.log('[Effect 2] Adding socket listeners (joinedRoom, error)');
      socket.on('joinedRoom', handleJoinedRoom);
      socket.on('error', handleError);

      // Cleanup listeners when effect re-runs or component unmounts
      return () => {
          console.log("[Effect 2 Cleanup] Cleaning up socket listeners");
          // Check if socket still exists before removing listeners
          if(socket) {
            socket.off('joinedRoom', handleJoinedRoom);
            socket.off('error', handleError);
          }
      };
    } else {
        // Log why this effect might not be running
        console.log(`[Effect 2] Skipped: isConnected=${isConnected}, socket exists=${!!socket}, qrToken exists=${!!qrToken}`);
    }
  }, [isConnected, socket, qrToken, router, myLanguage]); // Add myLanguage dependency

  // Handler for confirm button
  const handleConfirmLanguage = () => {
      console.log("Language confirmed:", myLanguage);
      setLanguageConfirmed(true);
  };

  // --- Copy Link Handler ---
  const copyToClipboard = async () => {
    if (qrUrl) {
      await Clipboard.setStringAsync(qrUrl);
      setLinkCopied(true);
      // Optionally reset after a delay
      setTimeout(() => setLinkCopied(false), 2000); 
    }
  };

  // --- Render Logic --- 
  // Log state variables just before rendering
  console.log(`[Render] Status: "${status}", QR URL Ready: ${!!qrUrl}, Error: ${error}`);

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <PaperText variant="headlineSmall" style={styles.status}>{status}</PaperText>
      
      {/* Language Picker - Show only before confirmation */}
      {!languageConfirmed && status === 'selecting_language' ? (
          <View style={styles.languageSelectContainer}>
              <PaperText variant="titleMedium">Select Your Language:</PaperText>
              <RadioButton.Group onValueChange={(newValue: string) => setMyLanguage(newValue)} value={myLanguage}>
                 {SUPPORTED_LANGUAGES.map(lang => (
                    <View key={lang.value} style={styles.radioButtonRow}>
                       <RadioButton value={lang.value} />
                       <PaperText>{lang.label}</PaperText>
                    </View>
                 ))}
              </RadioButton.Group>
              <PaperButton 
                  mode="contained" 
                  onPress={handleConfirmLanguage} 
                  style={{marginTop: 20}}
              >
                  Confirm & Generate QR
              </PaperButton>
          </View>
      ) : null}

      {error && <PaperText style={styles.errorText}>{error}</PaperText>}
      
      {/* QR Code - Show only when listening */}
      {qrUrl && status === 'Listening for partner... (Scan QR Code)' && !error ? (
        <View style={styles.qrContainer}> 
          <QRCode
            value={qrUrl}
            size={250}
            color="black"
            backgroundColor="white"
          />
          <PaperText style={styles.info}>Ask your chat partner to scan this code using their phone's camera.</PaperText>
          <PaperButton 
              mode="outlined" // Use outlined or text style for secondary action
              icon="content-copy"
              onPress={copyToClipboard}
              style={styles.copyButton}
          >
              {linkCopied ? 'Link Copied!' : 'Copy Invite Link'}
          </PaperButton>
        </View>
      ) : null} 
      
      {/* Spinner - Show during intermediate states after language confirmation */}
      {(status === 'Requesting QR Code...' || status === 'Connecting to chat service...') && !error ? (
        <ActivityIndicator size="large" style={{marginTop: 30}} />
      ) : null}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    paddingTop: 40,
    backgroundColor: '#f5f5f5'
  },
  status: {
    marginBottom: 30,
    textAlign: 'center'
  },
   errorText: {
        color: 'red',
        marginTop: 20,
        marginBottom: 20,
        textAlign: 'center',
        fontWeight: 'bold'
    },
  languageSelectContainer: {
      width: '90%',
      maxWidth: 400,
      alignItems: 'center',
      marginBottom: 20,
      padding: 20,
      backgroundColor: 'white',
      borderRadius: 8,
      elevation: 2,
  },
  radioButtonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      width: '80%',
      justifyContent: 'flex-start',
  },
  qrContainer: { 
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20, 
  },
  info: {
      marginTop: 30,
      textAlign: 'center',
      fontSize: 16,
      color: 'grey',
      paddingHorizontal: 10,
  },
  copyButton: {
    marginTop: 15, 
  },
}); 
