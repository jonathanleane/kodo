import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import io, { Socket } from 'socket.io-client';
import { DefaultEventsMap } from '@socket.io/component-emitter';
import { Button as PaperButton, Text as PaperText, IconButton, useTheme } from 'react-native-paper';
import { useSocket, AppSocket } from '../context/SocketContext'; // Import the hook and type
import * as Localization from 'expo-localization'; // Import localization
import { formatDistanceToNow } from 'date-fns'; // Import date-fns function
import { Picker } from '@react-native-picker/picker'; // Use Picker
import i18n, { setLocale } from '../translations/i18n.config'; // Import i18n config

// Backend URL configuration
// const BACKEND_URL = 'https://kodo-production.up.railway.app'; // REMOVE THIS - Provided by context

// Type for the socket instance
// type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap>; // Provided by context

// Define the path for Socket.IO (standard path)
const socketIoPath = "/socket.io";

// Supported Languages (Example - should match generate.tsx)
const SUPPORTED_LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
  { label: 'Français', value: 'fr' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Italiano', value: 'it' },
  { label: 'Português', value: 'pt' },
  { label: 'Русский', value: 'ru' },
  { label: '中文 (简体)', value: 'zh' }, 
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

// --- Message Bubble Component ---
const MessageBubble = React.memo(({ message, myLanguage }: { message: any, myLanguage: string | null }) => {
  const [showAlternate, setShowAlternate] = useState(false);
  const isSelf = message.sender === 'self';

  // Determine primary and alternate text based on sender
  const primaryText = isSelf ? message.original : message.translated;
  const alternateText = isSelf ? message.translated : message.original;
  // Only show toggle if translation actually happened AND succeeded
  const wasTranslated = message.original !== message.translated;
  
  // Format timestamp if available
  const formattedTimestamp = message.timestamp
    ? formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })
    : '';

  return (
    <View style={[styles.messageRow, isSelf ? styles.messageRowSelf : styles.messageRowPartner]}>
      <View style={[styles.messageBubble, isSelf ? styles.messageBubbleSelf : styles.messageBubblePartner]}>
        <View style={styles.messageContentRow}> 
          <Text style={styles.messagePrimaryText}>{primaryText}</Text>
          {/* Show toggle only if it was successfully translated */}
          {wasTranslated && (
              <IconButton
                  icon="translate"
                  size={16}
                  style={styles.translateIcon}
                  onPress={() => setShowAlternate(!showAlternate)}
              />
          )}
        </View>
        {/* Show alternate only if toggle is active AND it was successfully translated */}
        {showAlternate && wasTranslated && (
          <Text style={styles.messageAlternateText}>({alternateText})</Text>
        )}
        {/* Display Timestamp */}
        <Text style={isSelf ? styles.timestampSelf : styles.timestampPartner}>
          {formattedTimestamp}
        </Text>
      </View>
    </View>
  );
});

// --- Main Chat Screen / Join Handler ---
export default function JoinChatScreen() {
  const params = useLocalSearchParams();
  const token = params.token as string | undefined; // Token from URL
  const joined = params.joined === 'true'; // Flag if navigated from GenerateQR
  const passedRoomId = params.roomId as string;
  const passedMyLanguage = params.myLanguage as string; // This is HOST lang when navigated
  const passedPartnerLanguage = params.partnerLanguage as string;
  const theme = useTheme(); // Get theme

  // State Management
  const [uiStatus, setUiStatus] = useState('idle'); // idle, selecting_language, connecting, waiting, joined, error
  const [roomId, setRoomId] = useState<string | null>(passedRoomId || null);
  // --- Language State (Guest) ---
  const [myLanguage, setMyLanguage] = useState<string>(i18n.locale.substring(0,2));
  // -----------------------------
  const [partnerLanguage, setPartnerLanguage] = useState<string | null>(passedPartnerLanguage || null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false); // State for partner typing
  const flatListRef = useRef<FlatList>(null);
  const { socket, connect, disconnect, isConnected } = useSocket();
  const connectionAttempted = useRef(false);
  const joinAttempted = useRef(false);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null); // Ref for typing timeout

  // Set initial state based on navigation type
  useEffect(() => {
    if (token && !joined) {
          setUiStatus('selecting_language');
          // Ensure i18n is set to the detected/default language initially
          setLocale(myLanguage); 
      } else if (joined && passedRoomId) {
          // Host navigated here - set MY language based on passed params
          // This assumes the HOST's language was passed as myLanguage param
          setMyLanguage(passedMyLanguage); 
          setLocale(passedMyLanguage); // Set i18n to host's language
          setPartnerLanguage(passedPartnerLanguage);
          setRoomId(passedRoomId);
          setUiStatus('joined');
      } else {
          setError("Invalid page state.");
          setUiStatus('error');
      }
  }, [token, joined, passedRoomId, passedMyLanguage, passedPartnerLanguage, myLanguage]); 

  // --- Effect 1: Ensure Connection (for guests, now runs AFTER language selection) ---
  useEffect(() => {
    let isActive = true;
    if (uiStatus === 'connecting' && !isConnected && !connectionAttempted.current) {
      connectionAttempted.current = true;
      setError(null);
      
      connect()
        .then(() => {
           if (!isActive) return;
        })
        .catch((err) => {
            if (!isActive) return;
            console.error('[Effect 1] connect() promise rejected:', err);
            setError(`Socket connection failed: ${err.message}`);
            setUiStatus('error');
            connectionAttempted.current = false; // Allow retry on next mount? Or handle retry differently
        });
    }
    
    return () => { isActive = false; };
  }, [uiStatus, isConnected, connect]); // Depends on uiStatus trigger now
  
  // --- Effect 2: Emit Join & Setup Listeners (for guests) ---
  useEffect(() => {
    let hostCheckInterval: NodeJS.Timeout | null = null;
    let joinTimeout: NodeJS.Timeout | null = null;
    let isActive = true;

    if (uiStatus === 'connecting' && token && !joined && isConnected && socket && !joinAttempted.current) {
        joinAttempted.current = true; 
        setError(null);

        const userBLanguage = myLanguage;
        
        const handleConnectionTest = (data: any) => {
        };

        const handleJoinedRoom = ({ roomId: receivedRoomId, partnerLanguage: receivedPartnerLang }: { roomId: string, partnerLanguage: string }) => {
            if (!isActive) return;
            if (hostCheckInterval) clearInterval(hostCheckInterval);
            if (joinTimeout) clearTimeout(joinTimeout);
          setRoomId(receivedRoomId);
          setPartnerLanguage(receivedPartnerLang);
            setUiStatus('joined');
          setError(null);
        };

        const handleWaitingForHost = (data: any) => {
            try {
                if (!isActive) return;
                setUiStatus('waiting'); 
          setError(null);
                if (hostCheckInterval) clearInterval(hostCheckInterval); 
                hostCheckInterval = setInterval(() => {
                }, 15000); 
            } catch (e: any) {
                console.error('[handleWaitingForHost] Error processing event:', e);
                setError(`Error in waitingForHost handler: ${e?.message || 'Unknown error'}`);
            }
        };

        const handleError = (errorMessage: { message: string }) => {
            if (!isActive) return;
            console.error(`[handleError] Received socket error: ${errorMessage.message}`);
            if (joinTimeout) clearTimeout(joinTimeout);
            if (hostCheckInterval) clearInterval(hostCheckInterval);
            setError(errorMessage.message || 'Could not join the chat room.');
            setUiStatus('error');
            disconnect(); 
            joinAttempted.current = false; 
        };
        
        socket.on('joinedRoom', handleJoinedRoom);
        socket.on('waitingForHost', handleWaitingForHost);
        socket.on('error', handleError);

        socket.emit('join', { token: token, language: userBLanguage });

        joinTimeout = setTimeout(() => {
            if (isActive && uiStatus !== 'joined') { 
                console.error("Join screen (Guest): Join/Wait timeout"); 
                if (hostCheckInterval) clearInterval(hostCheckInterval);
                setError(`Host did not respond or join failed within 90s timeout.`);
                setUiStatus('error');
                disconnect();
                joinAttempted.current = false; // Allow retry?
            }
          }, 90000); // Increased timeout to 90 seconds
          
        return () => {
            isActive = false;
            if (joinTimeout) clearTimeout(joinTimeout);
            if (hostCheckInterval) clearInterval(hostCheckInterval);
            if (socket) {
                socket.off('connection_test', handleConnectionTest);
                socket.off('joinedRoom', handleJoinedRoom);
                socket.off('waitingForHost', handleWaitingForHost);
                socket.off('error', handleError);
            }
        };
    }
    
    else if (joined && passedRoomId && isConnected && uiStatus !== 'joined') {
        console.log(`[Effect 2 Host Check] Setting state for joined host. Room: ${passedRoomId}`);
        setRoomId(passedRoomId);
        setMyLanguage(passedMyLanguage); 
        setPartnerLanguage(passedPartnerLanguage);
        setUiStatus('joined'); 
    }
    
  }, [uiStatus, token, joined, isConnected, socket, disconnect, passedRoomId, passedMyLanguage, passedPartnerLanguage, myLanguage]); 

  // --- Effect 3: Chat Logic (runs once connection status is 'joined') ---
  useEffect(() => {
    if (uiStatus !== 'joined' || !roomId || !socket) {
        if (uiStatus === 'joined' && !socket) {
            console.error("Chat logic: State is 'joined' but socket is missing!");
            setError("Connection lost unexpectedly.");
            setUiStatus('error');
        }
        return; // Exit if not in the right state
    }
    
    let isActive = true; 
    if (isReconnecting) {
        console.log("Chat logic: Reconnection successful.");
        setIsReconnecting(false);
    }

    const handleNewMessage = (message: any) => {
        if (!isActive) return;
        if (message.sender === 'partner') {
            setIsPartnerTyping(false);
        }
        console.log('Chat message received:', message);
        // Add timestamp when adding message to state
        const messageWithTimestamp = {
             ...message, 
             id: Date.now().toString() + Math.random(), // Keep existing ID generation
             timestamp: Date.now() // Add current timestamp
        };
        setMessages((prevMessages) => [...prevMessages, messageWithTimestamp]);
    };
    const handlePartnerLeft = () => {
        if (!isActive) return;
        console.log('Partner left the chat');
        setPartnerLeft(true);
        // Alert.alert("Partner Left", "Your chat partner has left the room."); // Remove Alert
        // UI is already updated via the partnerLeft state check in render
    };
    const handleError = (errorMessage: { message: string }) => {
        if (!isActive) return;
        console.error('Received error during chat:', errorMessage);
        Alert.alert('Chat Error', errorMessage.message || 'An unknown error occurred during chat.');
        setError(errorMessage.message || 'Chat error');
        setUiStatus('error');
        setIsReconnecting(false);
    };
    const handleDisconnect = (reason: Socket.DisconnectReason) => {
        if (!isActive) return;
        if (reason !== 'io client disconnect' && uiStatus === 'joined') {
             console.log(`Connection lost: ${reason}. Attempting to reconnect...`);
             setError(null); // Clear previous errors
             setIsReconnecting(true); // Set reconnecting status
        }
    };
    const handleConnect = () => {
        if (!isActive || !isReconnecting) return; // Only handle if we were explicitly reconnecting
        console.log('Chat logic: Reconnect successful (handleConnect)');
        setIsReconnecting(false);
        setError(null);
    };
    const handleReconnectFailed = () => {
        if (!isActive) return;
        console.error('Chat logic: Permanent reconnection failure.');
        setError("Connection lost. Please check your internet and refresh.");
        setIsReconnecting(false);
        setUiStatus('error'); // Now set error state
    };
    const handlePartnerTyping = () => {
        if (!isActive) return;
        setIsPartnerTyping(true);
    };
    const handlePartnerStoppedTyping = () => {
        if (!isActive) return;
        setIsPartnerTyping(false);
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('partnerLeft', handlePartnerLeft);
    socket.on('error', handleError);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);
    socket.io.on("reconnect_failed", handleReconnectFailed);
    socket.on('partnerTyping', handlePartnerTyping);
    socket.on('partnerStoppedTyping', handlePartnerStoppedTyping);

    return () => {
      isActive = false;
      console.log('Chat logic: Cleaning up listeners for room', roomId);
      if (socket) {
        socket.off('newMessage', handleNewMessage);
        socket.off('partnerLeft', handlePartnerLeft);
        socket.off('error', handleError);
        socket.off('disconnect', handleDisconnect);
        socket.off('connect', handleConnect);
        socket.io.off("reconnect_failed", handleReconnectFailed);
        socket.off('partnerTyping', handlePartnerTyping);
        socket.off('partnerStoppedTyping', handlePartnerStoppedTyping);
      }
    };
  }, [uiStatus, roomId, socket, disconnect, isReconnecting]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
        flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  // --- Send Message Handler ---
  const handleSend = useCallback(() => {
    // Use socket from context
    if (inputText.trim() && !partnerLeft && socket?.connected && roomId) {
      console.log(`Sending message to room ${roomId}: ${inputText}`);
      socket.emit('sendMessage', {
        roomId: roomId,
        messageText: inputText.trim(),
      });
      setInputText('');
    } else if (partnerLeft) {
        Alert.alert("Cannot Send", "Your partner has left the chat.");
    } else if (!socket?.connected) {
        Alert.alert("Cannot Send", "You are not connected to the server.");
    }
  }, [inputText, roomId, partnerLeft, socket]); // Add socket dependency

  // Update language in i18n when selected
  const handleLanguageChange = (itemValue: string) => {
      setMyLanguage(itemValue);
      setLocale(itemValue); // Update i18n locale
      console.log('i18n locale set to:', itemValue);
  };
  
  // Handler for confirming language selection
  const handleConfirmLanguage = () => {
      console.log(`Language confirmed: ${myLanguage}. Proceeding to connect.`);
      setError(null);
      setUiStatus('connecting'); // Trigger connection effects
  };

  // --- Typing Indicator Logic ---
  const handleInputChange = (text: string) => {
      setInputText(text);
      if (socket && isConnected && !isReconnecting) {
        // User started typing (or continued typing)
        socket.emit('startTyping');
        // Clear existing timeout
        if (typingTimeout.current) {
            clearTimeout(typingTimeout.current);
        }
        // Set a new timeout to emit stopTyping after a pause
        typingTimeout.current = setTimeout(() => {
            if (socket && isConnected) { // Check connection again
                socket.emit('stopTyping');
            }
        }, 1500); // Emit stop after 1.5 seconds of inactivity
      }
  };

  const handleInputBlur = () => {
      // When input loses focus, immediately signal stop typing
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current);
      }
      if (socket && isConnected && !isReconnecting) {
        socket.emit('stopTyping');
      }
  };
  // --------------------------

  // --- Render Logic ---
  // NEW: Language Selection state
  if (uiStatus === 'selecting_language') {
      return (
          <View style={[styles.centerStatus, {backgroundColor: theme.colors.background}]}>
              <PaperText variant="titleMedium" style={{marginBottom: 15, color: theme.colors.onBackground}}>{i18n.t('selectYourLanguage')}</PaperText>
              <View style={styles.pickerWrapper}> 
                <Picker
                  selectedValue={myLanguage}
                  style={[styles.picker, {backgroundColor: theme.colors.surface, color: theme.colors.onSurface}]} 
                  dropdownIconColor={theme.colors.onSurfaceVariant}
                  onValueChange={handleLanguageChange} // Use updated handler
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
                  {i18n.t('confirmAndJoin')}
              </PaperButton>
          </View>
      );
  }

  // Loading / Connecting / Waiting states
  if (uiStatus === 'connecting' || uiStatus === 'waiting') { // Removed idle state from here
    let statusMessage = 'Initializing...'; // Default for idle
    if (uiStatus === 'connecting') statusMessage = 'Connecting...';
    if (uiStatus === 'waiting') statusMessage = 'Waiting for host...';
    
    return (
        <View style={[styles.centerStatus, {backgroundColor: theme.colors.background}]}>
            <ActivityIndicator size="large" color={theme.colors.primary}/>
            <PaperText style={[styles.statusText, {color: theme.colors.onBackground}]}>{statusMessage}</PaperText>
            {uiStatus === 'waiting' && (
                <PaperText style={styles.waitingText}>
                    Please keep this screen open.
                </PaperText>
            )}
        </View>
    );
  }

  // Error state
  if (uiStatus === 'error') {
     return (
        <View style={[styles.centerStatus, {backgroundColor: theme.colors.background}]}>
            <PaperText variant="titleMedium" style={[styles.errorText, {color: theme.colors.error}]}>Error</PaperText>
            <PaperText style={[styles.errorDetail, {color: theme.colors.onSurfaceVariant}]}>{error || "An unknown error occurred."}</PaperText>
             <PaperButton mode="contained" onPress={() => {disconnect(); router.replace('/');}}>Go Home</PaperButton>
        </View>
    );
  }

  // Fallback for unexpected state (should not happen)
  if (uiStatus !== 'joined' || !roomId) {
       return (
        <View style={[styles.centerStatus, {backgroundColor: theme.colors.background}]}>
            <PaperText style={styles.errorText}>Something went wrong</PaperText>
             <PaperButton mode="contained" onPress={() => {disconnect(); router.replace('/');}}>Go Home</PaperButton>
        </View>
    );
  }

  // --- Render Chat UI ---
  return (
    <SafeAreaView style={[styles.safeArea, {backgroundColor: theme.colors.background}]}>
        {/* Set screen title dynamically */}
        <Stack.Screen options={{ title: `Room: ${roomId.split('_')[1]}` }} />
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} // Adjust as needed
        >
            {/* ADD Reconnecting Indicator Overlay */}
            {isReconnecting && (
                <View style={styles.reconnectingOverlay}>
                    <ActivityIndicator size="small" color="#FFF" />
                    <PaperText style={styles.reconnectingText}>{i18n.t('connectionLostReconnecting')}</PaperText>
                </View>
            )}
            {partnerLeft && (
                <View style={styles.partnerLeftBanner}>
                    <PaperText style={styles.partnerLeftText}>Your partner has left the chat.</PaperText>
                </View>
            )}
            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={({ item }) => <MessageBubble message={item} myLanguage={myLanguage} />}
                keyExtractor={(item) => item.id}
                style={styles.messageList}
                contentContainerStyle={{ paddingBottom: 10 }} // Add padding to bottom
                ListEmptyComponent={() => (
                    <View style={styles.emptyChatContainer}>
                        <PaperText style={styles.emptyChatText}>No messages yet. Start chatting!</PaperText>
                    </View>
                )}
                ListFooterComponent={isPartnerTyping ? (
                    <PaperText style={styles.typingIndicator}>Partner is typing...</PaperText>
                ) : null}
            />
            <View style={[styles.inputContainer, {backgroundColor: theme.colors.elevation.level2}]}> {/* Themed background (This was the issue) */}
                <TextInput
                    style={[styles.input, {backgroundColor: theme.colors.background, color: theme.colors.onSurface, borderColor: theme.colors.outline}] }
                    value={inputText}
                    onChangeText={handleInputChange}
                    onBlur={handleInputBlur}
                    placeholder="Type your message..."
                    editable={!partnerLeft && isConnected && !isReconnecting}
                />
                <PaperButton 
                  mode="contained" 
                  onPress={handleSend} 
                  disabled={partnerLeft || !inputText.trim() || !isConnected || isReconnecting}
                  style={styles.sendButton}
                >
                    Send
                </PaperButton>
            </View>
        </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Styles --- (Combined and adjusted)
const styles = StyleSheet.create({
  centerStatus: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      // Background set inline
  },
  statusText: {
      marginTop: 15,
      fontSize: 16,
      marginBottom: 10,
      textAlign: 'center'
      // Color set inline
  },
  waitingText: {
      fontSize: 14,
      color: '#666',
      textAlign: 'center',
      marginTop: 10,
      marginHorizontal: 20,
  },
  errorText: {
    fontSize: 18,
    // color: 'red', // Use theme color
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center'
  },
  errorDetail: {
    fontSize: 14,
    // color: 'grey', // Use theme color
    marginBottom: 20,
    textAlign: 'center'
  },
  safeArea: {
      flex: 1,
      // backgroundColor: '#f0f0f0' // Use theme color
  },
  container: {
    flex: 1,
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center', 
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth, // Thinner border
    borderTopColor: '#ccc', // Use theme.colors.outline?
    // Background set inline
  },
  input: {
    flex: 1,
    borderWidth: 1,
    // borderColor: '#ccc', // Use theme color
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8, 
    marginRight: 10,
    fontSize: 16, 
    // Color/Background set inline
  },
  sendButton: {
      // ...
  },
  messageRow: {
      flexDirection: 'row',
      marginVertical: 5,
  },
  messageRowSelf: {
      justifyContent: 'flex-end',
  },
  messageRowPartner: {
      justifyContent: 'flex-start',
  },
  messageBubble: {
      maxWidth: '80%',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 15,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 1,
  },
  messageBubbleSelf: {
      backgroundColor: '#DCF8C6', // Keep chat bubble colors distinct for now
      // Could use theme.colors.primaryContainer / onPrimaryContainer if desired
      marginLeft: 'auto',
      borderBottomRightRadius: 0,
  },
  messageBubblePartner: {
      backgroundColor: '#FFFFFF', // Keep chat bubble colors distinct for now
      // Could use theme.colors.secondaryContainer / onSecondaryContainer if desired
      marginRight: 'auto',
      borderBottomLeftRadius: 0,
  },
  messageContentRow: { // New style for text + icon
    flexDirection: 'row',
    alignItems: 'center',
  },
  messagePrimaryText: { 
      fontSize: 16,
      flexShrink: 1, 
      marginRight: 4, 
  },
  messageAlternateText: { 
      fontSize: 14,
      color: '#555',
      fontStyle: 'italic',
      marginTop: 3,
  },
  timestampSelf: { // Style for timestamp
      fontSize: 10,
      color: '#666',
      marginTop: 4, 
      textAlign: 'right', // Align self timestamp right
  },
   timestampPartner: { // Style for timestamp
      fontSize: 10,
      color: '#666',
      marginTop: 4, 
      textAlign: 'left', // Align partner timestamp left
  },
  translateIcon: {
      margin: -4, // Reduce default margins/padding of IconButton
      height: 20, // Adjust height if needed
      width: 20,  // Adjust width if needed
  },
  partnerLeftBanner: {
      padding: 10,
      backgroundColor: '#ffebee',
      alignItems: 'center',
  },
  partnerLeftText: {
      color: '#d32f2f',
      fontWeight: 'bold',
  },
  debugText: {
      fontSize: 12,
      color: '#888',
      marginTop: 5,
      textAlign: 'center',
      marginHorizontal: 15,
  },
  reconnectingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // Ensure it's above other elements
  },
  reconnectingText: {
      color: '#FFF',
      marginLeft: 10,
      fontWeight: 'bold',
  },
  pickerWrapper: { 
    width: '80%',
    maxWidth: 350, // Max width for picker
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 4,
    // Colors set inline
  },
  picker: { 
      height: 50,
      width: '100%',
  },
  typingIndicator: {
      paddingHorizontal: 15,
      paddingVertical: 5,
      fontStyle: 'italic',
      color: '#888',
      textAlign: 'center', // Or align left/right as desired
  },
  emptyChatContainer: { // Style for empty chat message
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      marginTop: 50, 
  },
  emptyChatText: {
      fontSize: 16,
      color: 'grey',
      textAlign: 'center',
  },
}); 