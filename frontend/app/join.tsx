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
import { Button as PaperButton } from 'react-native-paper';
import { useSocket } from '../context/SocketContext'; // Import the hook

// Backend URL configuration
// const BACKEND_URL = 'https://kodo-production.up.railway.app'; // REMOVE THIS - Provided by context

// Type for the socket instance
// type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap>; // Provided by context

// Define the path for Socket.IO (standard path)
const socketIoPath = "/socket.io";

// --- Message Bubble Component ---
const MessageBubble = ({ message }: { message: any }) => {
  const isSelf = message.sender === 'self';
  return (
    <View style={[styles.messageRow, isSelf ? styles.messageRowSelf : styles.messageRowPartner]}>
      <View style={[styles.messageBubble, isSelf ? styles.messageBubbleSelf : styles.messageBubblePartner]}>
        <Text style={styles.messageOriginal}>{message.original}</Text>
        {message.original !== message.translated && (
          <Text style={styles.messageTranslated}>({message.translated})</Text>
        )}
      </View>
    </View>
  );
};

// --- Main Chat Screen / Join Handler ---
export default function JoinChatScreen() {
  const params = useLocalSearchParams();
  const token = params.token as string | undefined; // Token from URL
  const joined = params.joined === 'true'; // Flag if navigated from GenerateQR
  const passedRoomId = params.roomId as string;
  const passedMyLanguage = params.myLanguage as string;
  const passedPartnerLanguage = params.partnerLanguage as string;

  // State Management
  const [uiStatus, setUiStatus] = useState('idle'); // idle, connecting, waiting, joined, error
  const [roomId, setRoomId] = useState<string | null>(passedRoomId || null);
  const [myLanguage, setMyLanguage] = useState<string | null>(passedMyLanguage || null);
  const [partnerLanguage, setPartnerLanguage] = useState<string | null>(passedPartnerLanguage || null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const { socket, connect, disconnect, isConnected } = useSocket(); // Use context

  // --- Connection & Joining Logic (for User B joining via URL) ---
  useEffect(() => {
    let hostCheckInterval: NodeJS.Timeout | null = null;
    let connectTimeout: NodeJS.Timeout | null = null;
    let isActive = true; // Flag to prevent state updates on unmounted component

    // Scenario 1: Joining via QR code link (token is present, not navigated from host)
    if (token && !joined) {
      setUiStatus('connecting');
      setError(null);
      console.log(`Join screen (Guest): Attempting connection for token: ${token}`);

      // TODO: Get user's actual language preference dynamically
      const userBLanguage = 'es'; 
      setMyLanguage(userBLanguage);

      connect()
        .then((connectedSocket) => {
          if (!isActive) return; // Don't proceed if component unmounted
          console.log('Join screen (Guest): Connected with socket ID:', connectedSocket.id);
          
          // --- Setup Listeners for Guest --- 
          connectedSocket.on('joinedRoom', ({ roomId: receivedRoomId, partnerLanguage: receivedPartnerLang }: { roomId: string, partnerLanguage: string }) => {
            if (!isActive) return;
            console.log(`Join screen (Guest): Successfully joined room ${receivedRoomId}`);
            if (hostCheckInterval) clearInterval(hostCheckInterval);
            if (connectTimeout) clearTimeout(connectTimeout);
            setRoomId(receivedRoomId);
            setPartnerLanguage(receivedPartnerLang);
            setUiStatus('joined');
            setError(null);
          });

          connectedSocket.on('waitingForHost', (data) => {
            if (!isActive) return;
            console.log(`Join screen (Guest): Waiting for host event received:`, data);
             if (connectTimeout) clearTimeout(connectTimeout);
            setUiStatus('waiting'); // Update UI state
            setError(null);

            // Start polling (checkHostStatus does nothing on backend, but keeps UI updated)
            if (hostCheckInterval) clearInterval(hostCheckInterval); // Clear previous interval if any
            hostCheckInterval = setInterval(() => {
                console.log(`Join screen (Guest): Checking if host has connected...`);
                // This emit isn't strictly necessary as backend doesn't use it
                // connectedSocket.emit('checkHostStatus', { token: token }); 
            }, 5000);
          });

          connectedSocket.on('error', (errorMessage: { message: string }) => {
            if (!isActive) return;
            console.error('Join screen (Guest): Error from server:', errorMessage);
             if (connectTimeout) clearTimeout(connectTimeout);
             if (hostCheckInterval) clearInterval(hostCheckInterval);
            setError(errorMessage.message || 'Could not join the chat room.');
            setUiStatus('error');
            disconnect(); // Disconnect on error
          });
          // --- End Listeners for Guest ---

          // Emit the join event after listeners are set up
          console.log(`Join screen (Guest): Emitting join event with token ${token} and lang ${userBLanguage}`);
          connectedSocket.emit('join', { token: token, language: userBLanguage });

          // Set a timeout for the overall join process
          connectTimeout = setTimeout(() => {
            if (isActive && uiStatus !== 'joined') {
                console.error("Join screen (Guest): Join timeout");
                if (hostCheckInterval) clearInterval(hostCheckInterval);
                setError(`Could not connect/join within timeout.`);
                setUiStatus('error');
                disconnect();
            }
          }, 30000); // 30 second timeout

        })
        .catch((err) => {
          if (!isActive) return;
          console.error('Join screen (Guest): Connection failed:', err);
          setError(`Could not connect: ${err.message}`);
          setUiStatus('error');
        });
    
    // Scenario 2: Navigated here from GenerateQR (Host)
    } else if (joined && passedRoomId) {
        console.log(`Join screen (Host): Already joined room ${passedRoomId}. Socket connected: ${isConnected}`);
        setRoomId(passedRoomId);
        setMyLanguage(passedMyLanguage); // Should be 'en' from generate screen
        setPartnerLanguage(passedPartnerLanguage);
        setUiStatus('joined'); // Already joined
    } else if (!token && !joined) {
        console.error("Join screen: Invalid state - no token and not joined.");
        setError("Invalid page state. Please start over.");
        setUiStatus('error');
    }

    // Cleanup function for the effect
    return () => {
        isActive = false;
        console.log("Join screen: Cleaning up connection/joining effect...");
        if (connectTimeout) clearTimeout(connectTimeout);
        if (hostCheckInterval) clearInterval(hostCheckInterval);
        
        // Remove listeners specific to the guest joining process
        if (socket && token && !joined) {
            console.log("Join screen (Guest): Removing specific listeners");
            socket.off('joinedRoom');
            socket.off('waitingForHost');
            socket.off('error');
        }
        // We don't disconnect here generally, as the chat logic might still need the socket
    };
    // Ensure dependencies cover all scenarios
  }, [token, joined, connect, disconnect, isConnected, passedRoomId, passedMyLanguage, passedPartnerLanguage, socket, uiStatus]); 

  // --- Chat Logic (runs once connection status is 'joined') ---
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
    
    let isActive = true; // Flag for async operations
    console.log(`Chat logic: Socket active (ID: ${socket.id}) in room ${roomId}. Setting up listeners.`);

    // --- Define Event Handlers ---
    const handleNewMessage = (message: any) => {
        if (!isActive) return;
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
    };
    const handleDisconnect = (reason: Socket.DisconnectReason) => {
        if (!isActive) return;
        console.log('Disconnected during chat:', reason);
        if (reason !== 'io client disconnect' && uiStatus === 'joined') {
             setError("Lost connection to the server.");
             setUiStatus('error');
             Alert.alert("Disconnected", "Lost connection to the server.");
             // SocketProvider handles actual disconnect state, just update UI
             // disconnect(); // Context handles this
        }
    };

    // --- Register Listeners ---
    console.log("Chat logic: Attaching listeners");
    socket.on('newMessage', handleNewMessage);
    socket.on('partnerLeft', handlePartnerLeft);
    socket.on('error', handleError); // General errors during chat
    socket.on('disconnect', handleDisconnect); // Listen for disconnects

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
      }
      // Disconnect socket when leaving the chat screen entirely
      // This assumes leaving /join means the chat is over.
      console.log("Chat logic: Disconnecting socket via context.");
      disconnect();
    };
    // Depend on socket instance and joined state
  }, [uiStatus, roomId, socket, disconnect]); 

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

  // --- Render Logic ---
  // Loading / Connecting / Waiting states
  if (uiStatus === 'connecting' || uiStatus === 'waiting' || uiStatus === 'idle') {
    let statusMessage = 'Initializing...';
    if (uiStatus === 'connecting') statusMessage = 'Connecting to chat service...';
    if (uiStatus === 'waiting') statusMessage = 'Waiting for host to connect...';
    
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
            {partnerLeft && (
                <View style={styles.partnerLeftBanner}>
                    <Text style={styles.partnerLeftText}>Your partner has left the chat.</Text>
                </View>
            )}
            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={({ item }) => <MessageBubble message={item} />}
                keyExtractor={(item) => item.id}
                style={styles.messageList}
                contentContainerStyle={{ paddingVertical: 10 }}
            />
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Type your message..."
                    editable={!partnerLeft && isConnected} // Disable input if partner left or disconnected
                />
                <PaperButton 
                  mode="contained" 
                  onPress={handleSend} 
                  disabled={partnerLeft || !inputText.trim() || !isConnected} // Disable send if partner left, no text, or disconnected
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
      paddingVertical: 8, // Adjust padding
      paddingHorizontal: 12, // Adjust padding
      borderRadius: 15,
      elevation: 1, // Android shadow
      shadowColor: '#000', // iOS shadow
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
  messageOriginal: {
      fontSize: 16,
  },
  messageTranslated: {
      fontSize: 14,
      color: '#555',
      fontStyle: 'italic',
      marginTop: 3,
  },
  partnerLeftBanner: {
      padding: 10,
      backgroundColor: '#ffebee',
      alignItems: 'center',
  },
  partnerLeftText: {
      color: '#d32f2f',
      fontWeight: 'bold',
  }
}); 