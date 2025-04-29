import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    ScrollView,
    ActivityIndicator,
    StyleSheet
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { router, useNavigation, Href } from 'expo-router';
import { useSocket } from '../context/SocketContext';
import * as Localization from 'expo-localization';
import { Button as PaperButton, Text as PaperText, useTheme } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
import * as Clipboard from 'expo-clipboard';
import i18n, { setLocale } from '../translations/i18n.config';

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
  { label: 'ไทย', value: 'th' },
  { label: 'Tiếng Việt', value: 'vi' },
  { label: 'Türkçe', value: 'tr' },
];

// HARDCODE for now to ensure correct URL is used
const BACKEND_URL = 'https://kodo-backend-s7vj.onrender.com'; // NEW Render Backend URL
const FRONTEND_URL = 'https://kodo-frontend.onrender.com'; // Use the actual Render Frontend URL

console.log('Using BACKEND_URL:', BACKEND_URL);
console.log('Using FRONTEND_URL:', FRONTEND_URL);

export default function GenerateQRScreen() {
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('selecting_language'); // Start with language selection
  const [error, setError] = useState<string | null>(null);
  // Language State 
  // const defaultLanguage = Localization.getLocales()[0]?.languageCode || 'en';
  // const [myLanguage, setMyLanguage] = useState<string>(SUPPORTED_LANGUAGES.find(l => l.value === defaultLanguage) ? defaultLanguage : 'en');
  const [myLanguage, setMyLanguage] = useState<string>(i18n.locale.substring(0, 2)); // Get initial locale from i18n
  const [languageConfirmed, setLanguageConfirmed] = useState(false); // Track confirmation
  const [linkCopied, setLinkCopied] = useState(false); // State for copy feedback
  const { socket, connect, disconnect, isConnected } = useSocket();
  const theme = useTheme();
  const hasInitiatedProcess = useRef(false); // Track if fetch/connect started

  const webAppBaseUrl = FRONTEND_URL;
  const navigation = useNavigation();

  // Effect 1: Fetch token and connect socket AFTER language is confirmed
  useEffect(() => {
    if (languageConfirmed && !isConnected && !hasInitiatedProcess.current) { 
      hasInitiatedProcess.current = true; 
      
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
        
        setQrToken(fetchedToken); 
        const joinUrl = `${webAppBaseUrl}/join?token=${fetchedToken}`;
        setQrUrl(joinUrl);
        setStatus('Connecting to chat service...');
        
        return connect(); 
      })
      .then((connectedSocket) => {
          if (!connectedSocket) throw new Error("Socket connection failed or wasn't available.");
      })
      .catch(err => {
        console.error('Error during token generation or initial socket connection:', err);
        setError(`Setup failed: ${err.message}`);
        setStatus('Error');
        hasInitiatedProcess.current = false; 
        setLanguageConfirmed(false); 
      });
    }
  }, [languageConfirmed, isConnected, connect, myLanguage]); 

  // Effect 2: Set up socket listeners (mostly unchanged, runs when connected)
  useEffect(() => {
    if (isConnected && socket && qrToken) {
      setStatus('Listening for partner... (Scan QR Code)');

      socket.emit('listenForToken', { token: qrToken, language: myLanguage });

      const handleJoinedRoom = ({ roomId, partnerLanguage }: { roomId: string; partnerLanguage: string }) => {
        setStatus('Partner joined! Navigating...'); 
        setTimeout(() => {
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

      socket.on('joinedRoom', handleJoinedRoom);
      socket.on('error', handleError);

      return () => {
          if(socket) {
            socket.off('joinedRoom', handleJoinedRoom);
            socket.off('error', handleError);
          }
      };
    } else {
    }
  }, [isConnected, socket, qrToken, router, myLanguage]); 

  // Handler for confirm button
  const handleConfirmLanguage = () => {
      setLanguageConfirmed(true);
  };

  // Update language in i18n when selected
  const handleLanguageChange = (itemValue: string) => {
      setMyLanguage(itemValue);
      setLocale(itemValue); // Update i18n locale
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

  return (
    <ScrollView contentContainerStyle={[styles.scrollContainer, {backgroundColor: theme.colors.background}]}>
      <PaperText variant="headlineSmall" style={[styles.status, {color: theme.colors.onBackground}]}>{status}</PaperText>
      
      {/* Language Picker - Show only before confirmation */}
      {!languageConfirmed && status === 'selecting_language' ? (
          <View style={[styles.languageSelectContainer, {backgroundColor: theme.colors.surface}]}>
              <PaperText variant="titleMedium" style={{marginBottom: 10, color: theme.colors.onSurfaceVariant}}>{i18n.t('selectYourLanguage')}</PaperText>
              <View style={[styles.pickerWrapper, {borderColor: theme.colors.outline}]}> 
                <Picker
                    selectedValue={myLanguage}
                    style={[styles.picker, {backgroundColor: theme.colors.surface, color: theme.colors.onSurface}] }
                    dropdownIconColor={theme.colors.onSurfaceVariant}
                    onValueChange={handleLanguageChange}
                >
                    {SUPPORTED_LANGUAGES.map(lang => (
                        <Picker.Item key={lang.value} label={lang.label} value={lang.value} />
                    ))}
                </Picker>
              </View>
              <PaperButton 
                  mode="contained" 
                  onPress={handleConfirmLanguage} 
                  style={{marginTop: 20}}
              >
                  {i18n.t('confirmAndGenerate')}
              </PaperButton>
          </View>
      ) : null}

      {error && <PaperText style={[styles.errorText, {color: theme.colors.error}]}>{error}</PaperText>}
      
      {/* QR Code - Show only when listening */}
      {qrUrl && status === 'Listening for partner... (Scan QR Code)' && !error ? (
        <View style={styles.qrContainer}> 
          <QRCode value={qrUrl} size={250} color={theme.colors.onBackground} backgroundColor={theme.colors.background} />
          <PaperText style={[styles.info, {color: theme.colors.secondary}]}>Ask your partner to scan this code, OR</PaperText>
          <PaperButton 
              mode="text"
              icon="content-copy"
              onPress={copyToClipboard}
              style={styles.copyButton}
          >
              {linkCopied ? i18n.t('linkCopied') : i18n.t('copyInviteLink')}
          </PaperButton>
        </View>
      ) : null} 
      
      {/* Spinner - Show during intermediate states after language confirmation */}
      {(status === 'Requesting QR Code...' || status === 'Connecting to chat service...') && !error ? (
        <ActivityIndicator size="large" style={{marginTop: 30}} color={theme.colors.primary} />
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
  },
  status: {
    marginBottom: 30,
    textAlign: 'center'
  },
   errorText: {
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
      borderRadius: 8,
      elevation: 2,
  },
  pickerWrapper: { 
    width: '80%',
    marginTop: 10,
    marginBottom: 10,
  },
  picker: { 
      height: 50,
      width: '100%',
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
      paddingHorizontal: 10,
  },
  copyButton: {
    marginTop: 15, 
  },
}); 
