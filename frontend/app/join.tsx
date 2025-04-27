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
  const [debugMessage, setDebugMessage] = useState<string>('Initializing...'); // For extra debug info
  const [isReconnecting, setIsReconnecting] = useState(false); // Track reconnection attempts
  const flatListRef = useRef<FlatList>(null);
  const { socket, connect, disconnect, isConnected } = useSocket(); // Use context
  const connectionAttempted = useRef(false); // Track if connection was initiated
  const joinAttempted = useRef(false); // Track if join emit was attempted

  // --- Effect 1: Ensure Connection (for guests) ---
  useEffect(() => {
    let isActive = true;
    console.log(`[Effect 1 Check] token: ${!!token}, joined: ${joined}, isConnected: ${isConnected}, connectionAttempted: ${connectionAttempted.current}`);
    // Only attempt connection if joining via token, not connected, and not already attempted.
    if (token && !joined && !isConnected && !connectionAttempted.current) {
      connectionAttempted.current = true;
      setUiStatus('connecting');
      setDebugMessage('Attempting to connect socket...');
      setError(null);
      console.log('[Effect 1] Calling connect()...');
      
      connect()
        .then(() => {
           if (!isActive) return;
           console.log('[Effect 1] connect() promise resolved.');
           // isConnected state change will trigger Effect 2
           setDebugMessage('Socket connection established.');
        })
        .catch((err) => {
            if (!isActive) return;
            console.error('[Effect 1] connect() promise rejected:', err);
            setDebugMessage(`Socket connection failed: ${err.message}`);
            setError(`Could not connect: ${err.message}`);
            setUiStatus('error');
            connectionAttempted.current = false; // Allow retry on next mount? Or handle retry differently
        });
    }
    
    return () => { isActive = false; };
    // Dependencies: only need token/joined status and the stable connect function reference
  }, [token, joined, connect]);
  
  // --- Effect 2: Emit Join & Setup Listeners (for guests) ---
  useEffect(() => {
    let hostCheckInterval: NodeJS.Timeout | null = null;
    let joinTimeout: NodeJS.Timeout | null = null;
    let isActive = true;
    console.log(`[Effect 2 Check] token: ${!!token}, joined: ${joined}, isConnected: ${isConnected}, socket: ${!!socket}, joinAttempted: ${joinAttempted.current}`);

    // Only run if guest, connected, have token, and haven't tried joining yet
    if (token && !joined && isConnected && socket && !joinAttempted.current) {
        joinAttempted.current = true; // Mark join as attempted
        setDebugMessage(`Socket ready (ID: ${socket.id}). Emitting join...`);
        setError(null);
        console.log('[Effect 2] Conditions met. Emitting join and adding listeners.');

        const userBLanguage = 'es'; // TODO: Make dynamic
        if (!myLanguage) setMyLanguage(userBLanguage);
        
        // --- Setup Listeners FIRST --- 
        const handleConnectionTest = (data: any) => {
            console.log('[handleConnectionTest] Received:', data);
            setDebugMessage(`Received connection_test from backend! ID: ${data.id}`);
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
            setDebugMessage(`Joined room ${receivedRoomId}!`);
            if (hostCheckInterval) clearInterval(hostCheckInterval);
            if (joinTimeout) clearTimeout(joinTimeout); // Clear join timeout
            setRoomId(receivedRoomId);
            setPartnerLanguage(receivedPartnerLang);
            setUiStatus('joined');
            setError(null);
        };

        const handleWaitingForHost = (data: any) => {
            try {
                if (!isActive) return;
                console.log('[handleWaitingForHost] Received data:', data);
                setDebugMessage('Received waitingForHost event. Waiting...');
                if (joinTimeout) clearTimeout(joinTimeout);
                setUiStatus('waiting'); 
                setError(null);
                if (hostCheckInterval) clearInterval(hostCheckInterval); 
                hostCheckInterval = setInterval(() => {
                    console.log(`Join screen (Guest): Still waiting for host...`);
                }, 15000); 
            } catch (e: any) {
                console.error('[handleWaitingForHost] Error processing event:', e);
                setDebugMessage(`Error in waitingForHost handler: ${e?.message || 'Unknown error'}`);
                // Optionally set error state?
            }
        };

        const handleError = (errorMessage: { message: string }) => {
            if (!isActive) return;
            setDebugMessage(`Socket error during join/wait: ${errorMessage.message}`);
            if (joinTimeout) clearTimeout(joinTimeout);
            if (hostCheckInterval) clearInterval(hostCheckInterval);
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

        // Emit the join event
        console.log(`[Effect 2] >>>>>> BEFORE EMITTING join event with token ${token}`);
        setDebugMessage(`Emitting join for token ${token}...`); // Update debug before emit
        socket.emit('join', { token: token, language: userBLanguage });
        console.log(`[Effect 2] <<<<<< AFTER EMITTING join event with token ${token}`);

        // Set a timeout specifically for the join/wait phase
        joinTimeout = setTimeout(() => {
            if (isActive && uiStatus !== 'joined') { 
                setDebugMessage('Join/Wait process timed out after 90s.');
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
        setDebugMessage('Ready for chat (as host).');
    }
    
    // Dependencies: Trigger when connection status changes or token/socket become available.
    // Simplify dependencies to reduce potential re-runs
  }, [token, joined, isConnected, socket, disconnect, passedRoomId, passedMyLanguage, passedPartnerLanguage]); // Removed myLanguage, uiStatus

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
        setDebugMessage("Reconnected successfully.");
        setIsReconnecting(false);
    }

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
        setIsReconnecting(false);
    };
    const handleDisconnect = (reason: Socket.DisconnectReason) => {
        if (!isActive) return;
        console.log('Disconnected during chat:', reason);
        // Don't immediately go to error state if it was an unexpected disconnect
        if (reason !== 'io client disconnect' && uiStatus === 'joined') {
             setDebugMessage(`Connection lost: ${reason}. Attempting to reconnect...`);
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
        setDebugMessage("Reconnected successfully.");
        setIsReconnecting(false);
        setError(null);
        // No need to change uiStatus, should still be 'joined'
    };
     // <<< ADDED: Listener for permanent reconnect failure >>>
    const handleReconnectFailed = () => {
        if (!isActive) return;
        console.error('Chat logic: Permanent reconnection failure.');
        setDebugMessage("Failed to reconnect after multiple attempts.");
        setError("Connection lost. Please check your internet and refresh.");
        setIsReconnecting(false);
        setUiStatus('error'); // Now set error state
    };

    // --- Register Listeners ---
    console.log("Chat logic: Attaching listeners (newMessage, partnerLeft, error, disconnect, connect, reconnect_failed)");
    socket.on('newMessage', handleNewMessage);
    socket.on('partnerLeft', handlePartnerLeft);
    socket.on('error', handleError); 
    socket.on('disconnect', handleDisconnect); 
    socket.on('connect', handleConnect); // Listen for successful connect/reconnect
    socket.io.on("reconnect_failed", handleReconnectFailed); // Listen for permanent failure

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

  // --- Render Logic ---
  // Loading / Connecting / Waiting states
  if (uiStatus === 'connecting' || uiStatus === 'waiting' || uiStatus === 'idle') {
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
            <Text style={styles.debugText}>Debug: {debugMessage}</Text> 
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
                    editable={!partnerLeft && isConnected && !isReconnecting} // Disable input if partner left OR not connected/reconnecting
                />
                <PaperButton 
                  mode="contained" 
                  onPress={handleSend} 
                  disabled={partnerLeft || !inputText.trim() || !isConnected || isReconnecting} // Disable send if partner left OR not connected/reconnecting
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
  }
}); 