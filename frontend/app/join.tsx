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
        {message.timestamp && (
            <Text style={styles.timestampText}>
                {new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
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
  const [partnerIsTyping, setPartnerIsTyping] = useState(false); // State for partner typing
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for typing timeout
  const flatListRef = useRef<FlatList>(null);
  const { socket, connect, disconnect, isConnected } = useSocket();
  const connectionAttempted = useRef(false);
  const joinAttempted = useRef(false);

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

  // --- Effect 1: Ensure Connection (for guests) ---
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
            setError(`Could not connect: ${err.message}`);
            setUiStatus('error');
            connectionAttempted.current = false; 
        });
    }
    return () => { isActive = false; };
  }, [uiStatus, isConnected, connect]);
          
  // --- Effect 2: Emit Join & Setup Listeners (for guests) ---
  useEffect(() => {
    let hostCheckInterval: NodeJS.Timeout | null = null;
    let joinTimeout: NodeJS.Timeout | null = null;
    let isActive = true;
    if (uiStatus === 'connecting' && token && !joined && isConnected && socket && !joinAttempted.current) {
        joinAttempted.current = true; 
        setError(null);

        const userBLanguage = myLanguage;
        
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
                if (joinTimeout) clearTimeout(joinTimeout);
                setUiStatus('waiting'); 
          setError(null);
                if (hostCheckInterval) clearInterval(hostCheckInterval); 
                hostCheckInterval = setInterval(() => {
                }, 15000); 
            } catch (e: any) {
                console.error('[handleWaitingForHost] Error processing event:', e);
              }
        };

        const handleError = (errorMessage: { message: string }) => {
            if (!isActive) return;
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
                setError(`Host did not respond or join failed within 90s timeout.`);
                setUiStatus('error');
                disconnect();
                joinAttempted.current = false;
            }
          }, 90000);
          
      return () => {
            isActive = false;
            if (joinTimeout) clearTimeout(joinTimeout);
            if (hostCheckInterval) clearInterval(hostCheckInterval);
            if (socket) {
                socket.off('joinedRoom', handleJoinedRoom);
                socket.off('waitingForHost', handleWaitingForHost);
                socket.off('error', handleError);
         }
        };
    }
    
    else if (joined && passedRoomId && isConnected && uiStatus !== 'joined') {
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
        return;
    }

    let isActive = true; 
    if (isReconnecting) {
        setIsReconnecting(false);
    }

    const handleNewMessage = (message: any) => {
        if (!isActive) return;
        setMessages((prevMessages) => [...prevMessages, { ...message, id: Date.now().toString() + Math.random() }]);
    };
    const handlePartnerLeft = () => {
        if (!isActive) return;
        setPartnerLeft(true);
        Alert.alert("Partner Left", "Your chat partner has left the room.");
    };
    const handleError = (errorMessage: { message: string }) => {
        if (!isActive) return;
        console.error('Received error during chat:', errorMessage);
        Alert.alert('Chat Error', errorMessage.message || 'An unknown error occurred during chat.');
        setIsReconnecting(false);
        setUiStatus('error');
    };
    const handleDisconnect = (reason: Socket.DisconnectReason) => {
        if (!isActive) return;
        if (reason !== 'io client disconnect' && uiStatus === 'joined') {
             setError(null); 
             setIsReconnecting(true);
        }
    };
    const handleConnect = () => {
        if (!isActive || !isReconnecting) return;
        setIsReconnecting(false);
        setError(null);
    };
    const handleReconnectFailed = () => {
        if (!isActive) return;
        console.error('Chat logic: Permanent reconnection failure.');
        setError("Connection lost. Please check your internet and refresh.");
        setIsReconnecting(false);
        setUiStatus('error');
    };

    const handlePartnerTyping = ({ isTyping }: { isTyping: boolean }) => {
        if (!isActive) return;
        console.log(`Partner typing: ${isTyping}`);
        setPartnerIsTyping(isTyping);
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('partnerLeft', handlePartnerLeft);
    socket.on('partnerTyping', handlePartnerTyping);
    socket.on('error', handleError);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);
    socket.io.on("reconnect_failed", handleReconnectFailed);

    return () => {
      isActive = false;
      if (socket) {
        socket.off('newMessage', handleNewMessage);
        socket.off('partnerLeft', handlePartnerLeft);
        socket.off('partnerTyping', handlePartnerTyping);
        socket.off('error', handleError);
        socket.off('disconnect', handleDisconnect);
        socket.off('connect', handleConnect);
        socket.io.off("reconnect_failed", handleReconnectFailed);
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
    if (inputText.trim() && !partnerLeft && socket?.connected && roomId) {
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
  }, [inputText, roomId, partnerLeft, socket]);

  // Handler for confirming language selection
  const handleConfirmLanguage = () => {
      setUiStatus('connecting');
  };

  // --- Typing Event Emitters ---
  const handleInputChange = (text: string) => {
    setInputText(text);

    if (socket?.connected && !typingTimeoutRef.current) {
      // Send start typing immediately if not already typing
      console.log('Emitting startTyping');
      socket.emit('startTyping');
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set a timeout to send stop typing after 1.5 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (socket?.connected) {
        console.log('Emitting stopTyping (timeout)');
        socket.emit('stopTyping');
      }
      typingTimeoutRef.current = null; // Clear ref after sending
    }, 1500); // 1.5 second timeout
  };

  const handleInputBlur = () => {
    // Send stop typing immediately on blur if a timeout was pending
    if (typingTimeoutRef.current && socket?.connected) {
        clearTimeout(typingTimeoutRef.current);
        console.log('Emitting stopTyping (blur)');
        socket.emit('stopTyping');
        typingTimeoutRef.current = null;
    }
  };

  // --- Render Logic ---
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

  if (uiStatus === 'connecting' || uiStatus === 'waiting') {
    let statusMessage = 'Connecting...';
    if (uiStatus === 'waiting') statusMessage = 'Waiting for host...';
    
    return (
        <View style={styles.centerStatus}>
            <ActivityIndicator size="large" />
            <Text style={styles.statusText}>{statusMessage}</Text>
            {uiStatus === 'waiting' && (
                <Text style={styles.waitingText}>
                    Please keep this screen open.
                </Text>
            )}
        </View>
    );
  }

  if (uiStatus === 'error') {
     return (
        <View style={styles.centerStatus}>
            <Text style={styles.errorText}>Error</Text>
            <Text style={styles.errorDetail}>{error || "An unknown error occurred."}</Text>
             <PaperButton mode="contained" onPress={() => {disconnect(); router.replace('/');}}>Go Home</PaperButton>
        </View>
    );
  }

  if (uiStatus !== 'joined' || !roomId) {
       return (
        <View style={styles.centerStatus}>
            <Text style={styles.errorText}>Something went wrong</Text>
             <PaperButton mode="contained" onPress={() => {disconnect(); router.replace('/');}}>Go Home</PaperButton>
        </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: `Room: ${roomId.split('_')[1]}` }} />
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
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
            />
            {partnerIsTyping && (
                <View style={styles.typingIndicatorContainer}>
                    <Text style={styles.typingIndicatorText}>Partner is typing...</Text>
                </View>
            )}
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

const styles = StyleSheet.create({
  centerStatus: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
      backgroundColor: '#f5f5f5'
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
    alignItems: 'center',
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
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    marginRight: 10,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  sendButton: {
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
  messageContentRow: {
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
  timestampText: {
      fontSize: 10,
      color: '#999',
      marginTop: 4,
      textAlign: 'right',
  },
  translateIcon: {
      margin: -4,
      height: 20,
      width: 20,
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
    zIndex: 10,
  },
  reconnectingText: {
      color: '#FFF',
      marginLeft: 10,
      fontWeight: 'bold',
  },
  radioButtonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      width: '60%',
      justifyContent: 'flex-start',
  },
  typingIndicatorContainer: {
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  typingIndicatorText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  }
}); 