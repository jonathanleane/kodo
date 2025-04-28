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
  ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import io, { Socket } from 'socket.io-client';
import { DefaultEventsMap } from '@socket.io/component-emitter';
import { Button as PaperButton, RadioButton, Text as PaperText, IconButton } from 'react-native-paper';
import { useSocket, AppSocket } from '../context/SocketContext'; // Import the hook and type
import * as Localization from 'expo-localization'; // Import localization

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
];

// --- Message Bubble Component ---
const MessageBubble = React.memo(({ message, myLanguage }: { message: any, myLanguage: string | null }) => {
  const [showAlternate, setShowAlternate] = useState(false);
  const isSelf = message.sender === 'self';

  // Determine primary and alternate text based on sender
  const primaryText = isSelf ? message.original : message.translated;
  const alternateText = isSelf ? message.translated : message.original;
  const showTranslationToggle = message.original !== message.translated;

  return (
    <View style={[styles.messageRow, isSelf ? styles.messageRowSelf : styles.messageRowPartner]}>
      <View style={[styles.messageBubble, isSelf ? styles.messageBubbleSelf : styles.messageBubblePartner]}>
        <View style={styles.messageContentRow}> 
          <Text style={styles.messagePrimaryText}>{primaryText}</Text>
          {showTranslationToggle && (
              <IconButton
                  icon="translate" // Or use another icon like "eye" or "swap-horizontal"
                  size={16}
                  style={styles.translateIcon}
                  onPress={() => setShowAlternate(!showAlternate)}
              />
          )}
        </View>
        {showAlternate && showTranslationToggle && (
          <Text style={styles.messageAlternateText}>({alternateText})</Text>
        )}
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

  // State Management
  const [uiStatus, setUiStatus] = useState('idle'); // idle, selecting_language, connecting, waiting, joined, error
  const [roomId, setRoomId] = useState<string | null>(passedRoomId || null);
  // --- Language State (Guest) ---
  const defaultLanguage = Localization.getLocales()[0]?.languageCode || 'en';
  // Initialize with default, host value comes later if applicable
  const [myLanguage, setMyLanguage] = useState<string>(SUPPORTED_LANGUAGES.find(l => l.value === defaultLanguage) ? defaultLanguage : 'en');
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
          setUiStatus('selecting_language'); // Start by asking for language
      } else if (joined && passedRoomId) {
          // Host navigated here
          setMyLanguage(passedMyLanguage); // Host language passed via params
          setPartnerLanguage(passedPartnerLanguage);
          setRoomId(passedRoomId);
          setUiStatus('joined'); // Already joined logically
      } else {
          setError("Invalid page state.");
          setUiStatus('error');
      }
  }, [token, joined, passedRoomId]); // Only run once on mount based on initial params

  // --- Effect 1: Ensure Connection (for guests, now runs AFTER language selection) ---
  useEffect(() => {
    let isActive = true;
    console.log(`[Effect 1 Check] uiStatus: ${uiStatus}, isConnected: ${isConnected}, connectionAttempted: ${connectionAttempted.current}`);
    // Only attempt connection if status is 'connecting', not connected, and not already attempted.
    if (uiStatus === 'connecting' && !isConnected && !connectionAttempted.current) {
      connectionAttempted.current = true;
      setError(null);
      console.log('[Effect 1] Calling connect()...');
      
      connect()
        .then(() => {
           if (!isActive) return;
           console.log('[Effect 1] connect() promise resolved.');
           // isConnected state change will trigger Effect 2
        })
        .catch((err) => {
            if (!isActive) return;
            console.error('[Effect 1] connect() promise rejected:', err);
            setError(`Could not connect: ${err.message}`);
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
    console.log(`[Effect 2 Check] uiStatus: ${uiStatus}, token: ${!!token}, joined: ${joined}, isConnected: ${isConnected}, socket: ${!!socket}, joinAttempted: ${joinAttempted.current}`);

    // Only run if guest, connected, have token, and haven't tried joining yet
    if (uiStatus === 'connecting' && token && !joined && isConnected && socket && !joinAttempted.current) {
        joinAttempted.current = true; 
        setError(null);
        console.log('[Effect 2] Conditions met. Emitting join and adding listeners.');

        // Use the language selected by the user
        // const userBLanguage = 'es'; // Old hardcoded value
        const userBLanguage = myLanguage;
        
        // --- Setup Listeners FIRST --- 
        const handleConnectionTest = (data: any) => {
            console.log('[handleConnectionTest] Received:', data);
        };
        console.log('[Effect 2] Adding listener: connection_test');
        socket.on('connection_test', handleConnectionTest);

        const handleJoinedRoom = ({ roomId: receivedRoomId, partnerLanguage: receivedPartnerLang }: { roomId: string, partnerLanguage: string }) => {
            // Log reception of the event
            console.log(`[handleJoinedRoom] EVENT RECEIVED! Room: ${receivedRoomId}, Partner Lang: ${receivedPartnerLang}`);
            if (!isActive) {
                console.log('[handleJoinedRoom] Component inactive, ignoring event.');
                return;
            }
            setRoomId(receivedRoomId);
            setPartnerLanguage(receivedPartnerLang);
            setUiStatus('joined');
            setError(null);
        };

        const handleWaitingForHost = (data: any) => {
            try {
                if (!isActive) return;
                console.log('[handleWaitingForHost] Received data:', data);
                setUiStatus('waiting'); 
                setError(null);
                if (hostCheckInterval) clearInterval(hostCheckInterval); 
                hostCheckInterval = setInterval(() => {
                    console.log(`Join screen (Guest): Still waiting for host...`);
                }, 15000); 
            } catch (e: any) {
                console.error('[handleWaitingForHost] Error processing event:', e);
                setError(e?.message || 'Unknown error');
                // Optionally set error state?
            }
        };

        const handleError = (errorMessage: { message: string }) => {
            if (!isActive) return;
            setError(errorMessage.message || 'Could not join the chat room.');
            setUiStatus('error');
            disconnect(); // Disconnect on error
            joinAttempted.current = false; // Allow retry?
        };
        
        console.log('[Effect 2] Adding listeners: joinedRoom, waitingForHost, error');
        socket.on('joinedRoom', handleJoinedRoom);
        socket.on('waitingForHost', handleWaitingForHost);
        socket.on('error', handleError);
        // --- End Listeners Setup ---

        // Emit the join event WITH LANGUAGE
        console.log(`[Effect 2] Emitting join event with token ${token} and lang ${userBLanguage}`);
        socket.emit('join', { token: token, language: userBLanguage });
        console.log(`[Effect 2] <<<<<< AFTER EMITTING join event with token ${token}`);

        // Set a timeout specifically for the join/wait phase
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
          
        // Cleanup function for THIS effect
        return () => {
            isActive = false;
            console.log('[Effect 2 Cleanup] Removing join listeners and clearing timeouts.');
            if (joinTimeout) clearTimeout(joinTimeout);
            if (hostCheckInterval) clearInterval(hostCheckInterval);
            if (socket) {
                socket.off('connection_test', handleConnectionTest);
                socket.off('joinedRoom', handleJoinedRoom);
                socket.off('waitingForHost', handleWaitingForHost);
                socket.off('error', handleError);
            }
            // Don't reset joinAttempted here unless you want auto-retry on dependency change
        };
    }
    
    // Logic for host remains largely the same, ensure state is set if navigated here
    else if (joined && passedRoomId && isConnected && uiStatus !== 'joined') {
        console.log(`[Effect 2 Host Check] Setting state for joined host. Room: ${passedRoomId}`);
        setRoomId(passedRoomId);
        setMyLanguage(passedMyLanguage); 
        setPartnerLanguage(passedPartnerLanguage);
        setUiStatus('joined'); 
    }
    
    // Dependencies: now includes myLanguage needed for the join emit
  }, [uiStatus, token, joined, isConnected, socket, disconnect, passedRoomId, passedMyLanguage, passedPartnerLanguage, myLanguage]); 

  // --- Effect 3: Chat Logic (runs once connection status is 'joined') ---
  useEffect(() => {
    // Only run chat logic if joined successfully and socket is available
    if (uiStatus !== 'joined' || !roomId || !socket) {
        // If we are supposed to be joined but socket is missing, it's an error
        if (uiStatus === 'joined' && !socket) {
            console.error("Chat logic: State is 'joined' but socket is missing!");
            setError("Connection lost unexpectedly.");
            setUiStatus('error');
        }
        return; // Exit if not in the right state
    }
    
    let isActive = true; 
    console.log(`Chat logic: Socket active (ID: ${socket.id}) in room ${roomId}. Setting up listeners.`);
    // If we were reconnecting, clear the flag now that we are joined and ready
    if (isReconnecting) {
        console.log("Chat logic: Reconnection successful.");
        setIsReconnecting(false);
    }

    // --- Define Event Handlers ---
    const handleNewMessage = (message: any) => {
        if (!isActive) return;
        // If partner sent a message, they definitely stopped typing
        if (message.sender === 'partner') {
            setIsPartnerTyping(false);
        }
        console.log('Chat message received:', message);
        setMessages((prevMessages) => [...prevMessages, { ...message, id: Date.now().toString() + Math.random() }]);
    };
    const handlePartnerLeft = () => {
        if (!isActive) return;
        console.log('Partner left the chat');
        setPartnerLeft(true);
        Alert.alert("Partner Left", "Your chat partner has left the room.");
    };
    const handleError = (errorMessage: { message: string }) => {
        if (!isActive) return;
        console.error('Received error during chat:', errorMessage);
        Alert.alert('Chat Error', errorMessage.message || 'An unknown error occurred during chat.');
        setError(errorMessage.message || 'Chat error');
        setUiStatus('error');
        // Consider disconnecting or navigating away
        // disconnect(); 
        // router.replace('/');
        setIsReconnecting(false);
    };
    const handleDisconnect = (reason: Socket.DisconnectReason) => {
        if (!isActive) return;
        console.log('Disconnected during chat:', reason);
        // Don't immediately go to error state if it was an unexpected disconnect
        if (reason !== 'io client disconnect' && uiStatus === 'joined') {
             console.log(`Connection lost: ${reason}. Attempting to reconnect...`);
             setError(null); // Clear previous errors
             setIsReconnecting(true); // Set reconnecting status
             // uiStatus remains 'joined' logically, UI will show reconnecting overlay
             // Socket.IO client will automatically try to reconnect based on context settings
             // We could add a listener for explicit reconnect_failed event if needed
        }
    };
    // <<< ADDED: Listener for reconnect success >>>
    const handleConnect = () => {
        if (!isActive || !isReconnecting) return; // Only handle if we were explicitly reconnecting
        console.log('Chat logic: Reconnect successful (handleConnect)');
        setIsReconnecting(false);
        setError(null);
        // No need to change uiStatus, should still be 'joined'
    };
     // <<< ADDED: Listener for permanent reconnect failure >>>
    const handleReconnectFailed = () => {
        if (!isActive) return;
        console.error('Chat logic: Permanent reconnection failure.');
        setError("Connection lost. Please check your internet and refresh.");
        setIsReconnecting(false);
        setUiStatus('error'); // Now set error state
    };
    // --- Typing Indicator Handlers ---
    const handlePartnerTyping = () => {
        if (!isActive) return;
        // console.log("Partner started typing");
        setIsPartnerTyping(true);
    };
    const handlePartnerStoppedTyping = () => {
        if (!isActive) return;
        // console.log("Partner stopped typing");
        setIsPartnerTyping(false);
    };
    // -------------------------------

    // --- Register Listeners ---
    console.log("Chat logic: Attaching listeners (newMessage, partnerLeft, error, disconnect, connect, reconnect_failed, partnerTyping, partnerStoppedTyping)");
    socket.on('newMessage', handleNewMessage);
    socket.on('partnerLeft', handlePartnerLeft);
    socket.on('error', handleError); 
    socket.on('disconnect', handleDisconnect); 
    socket.on('connect', handleConnect); // Listen for successful connect/reconnect
    socket.io.on("reconnect_failed", handleReconnectFailed); // Listen for permanent failure
    // Typing listeners
    socket.on('partnerTyping', handlePartnerTyping);
    socket.on('partnerStoppedTyping', handlePartnerStoppedTyping);

    // --- Cleanup Chat Listeners ---
    return () => {
      isActive = false;
      console.log('Chat logic: Cleaning up listeners for room', roomId);
      // Remove listeners when component unmounts or state changes
      if (socket) {
        socket.off('newMessage', handleNewMessage);
        socket.off('partnerLeft', handlePartnerLeft);
        socket.off('error', handleError);
        socket.off('disconnect', handleDisconnect);
        socket.off('connect', handleConnect);
        socket.io.off("reconnect_failed", handleReconnectFailed);
        // Typing listeners cleanup
        socket.off('partnerTyping', handlePartnerTyping);
        socket.off('partnerStoppedTyping', handlePartnerStoppedTyping);
      }
      // We disconnect globally when LEAVING the chat screen, not just on effect cleanup
      // This is handled by the context provider cleanup now, or could be done via router events
      // disconnect(); // Moved disconnect call out of here
    };
    // Depend on socket instance and joined state
  }, [uiStatus, roomId, socket, disconnect, isReconnecting]); // Added isReconnecting dependency

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
          <View style={styles.centerStatus}>
              <PaperText variant="titleMedium" style={{marginBottom: 15}}>Select Your Language:</PaperText>
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
                  Confirm & Join Chat
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
        <View style={styles.centerStatus}>
            <ActivityIndicator size="large" />
            <Text style={styles.statusText}>{statusMessage}</Text>
            {/* Display Debug Info */}
            <Text style={styles.debugText}>Status: {uiStatus}</Text>
            <Text style={styles.debugText}>Socket Connected: {isConnected ? 'Yes' : 'No'}</Text>
            {socket?.id && <Text style={styles.debugText}>Socket ID: {socket.id}</Text>}
            {uiStatus === 'waiting' && (
                <Text style={styles.waitingText}>
                    Please keep this screen open.
                </Text>
            )}
        </View>
    );
  }

  // Error state
  if (uiStatus === 'error') {
     return (
        <View style={styles.centerStatus}>
            <Text style={styles.errorText}>Error</Text>
            <Text style={styles.errorDetail}>{error || "An unknown error occurred."}</Text>
             <PaperButton mode="contained" onPress={() => {disconnect(); router.replace('/');}}>Go Home</PaperButton>
        </View>
    );
  }

  // Fallback for unexpected state (should not happen)
  if (uiStatus !== 'joined' || !roomId) {
       return (
        <View style={styles.centerStatus}>
            <Text style={styles.errorText}>Something went wrong</Text>
             <PaperButton mode="contained" onPress={() => {disconnect(); router.replace('/');}}>Go Home</PaperButton>
        </View>
    );
  }

  // --- Render Chat UI ---
  return (
    <SafeAreaView style={styles.safeArea}>
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
                    <Text style={styles.reconnectingText}>Connection lost. Reconnecting...</Text>
                </View>
            )}
            {partnerLeft && (
                <View style={styles.partnerLeftBanner}>
                    <Text style={styles.partnerLeftText}>Your partner has left the chat.</Text>
                </View>
            )}
            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={({ item }) => <MessageBubble message={item} myLanguage={myLanguage} />}
                keyExtractor={(item) => item.id}
                style={styles.messageList}
                contentContainerStyle={{ paddingVertical: 10 }}
                ListFooterComponent={isPartnerTyping ? (
                    <PaperText style={styles.typingIndicator}>Partner is typing...</PaperText>
                ) : null}
            />
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
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
      backgroundColor: '#f5f5f5' // Match other screens
  },
  statusText: {
      marginTop: 15,
      fontSize: 16,
      marginBottom: 10,
      textAlign: 'center'
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
    color: 'red',
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center'
  },
  errorDetail: {
    fontSize: 14,
    color: 'grey',
    marginBottom: 20,
    textAlign: 'center'
  },
  safeArea: {
      flex: 1,
      backgroundColor: '#f0f0f0'
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
    alignItems: 'center', // Align items vertically
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8, // Adjust padding per platform
    marginRight: 10,
    backgroundColor: '#fff',
    fontSize: 16, // Make font size consistent
  },
  sendButton: {
      // Add some style if needed, e.g., marginLeft: 5
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
      backgroundColor: '#dcf8c6',
      marginLeft: 'auto',
      borderBottomRightRadius: 0,
  },
  messageBubblePartner: {
      backgroundColor: '#fff',
      marginRight: 'auto',
      borderBottomLeftRadius: 0,
  },
  messageContentRow: { // New style for text + icon
    flexDirection: 'row',
    alignItems: 'center',
  },
  messagePrimaryText: { // Renamed from messageOriginal
      fontSize: 16,
      flexShrink: 1, // Allow text to shrink if icon takes space
      marginRight: 4, // Space between text and icon
  },
  messageAlternateText: { // Renamed from messageTranslated
      fontSize: 14,
      color: '#555',
      fontStyle: 'italic',
      marginTop: 3,
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
  radioButtonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8, // Add some spacing
      width: '60%', // Adjust width as needed
      justifyContent: 'flex-start', // Align items
  },
  typingIndicator: {
      paddingHorizontal: 15,
      paddingVertical: 5,
      fontStyle: 'italic',
      color: '#888',
      textAlign: 'center', // Or align left/right as desired
  }
}); 