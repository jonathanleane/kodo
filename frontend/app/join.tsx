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

// TODO: Replace with your actual backend URL if deployed
// const BACKEND_URL = 'http://localhost:3001'; // Default for local dev
// const BACKEND_URL = 'https://kodo-app-5dhoh.ondigitalocean.app'; // Old DigitalOcean URL
const BACKEND_URL = 'https://kodo-production.up.railway.app'; // Railway deployment URL

// Type for the socket instance
type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap>;

// Define the path for Socket.IO (must match server and ingress)
const socketIoPath = "/socket.io"; // Use standard path instead of /api prefix for testing

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
  const { token, joined } = params; // Token from URL, joined flag if navigated from GenerateQR
  const passedRoomId = params.roomId as string;
  const passedMyLanguage = params.myLanguage as string;
  const passedPartnerLanguage = params.partnerLanguage as string;

  const [connectStatus, setConnectStatus] = useState('idle'); // idle, connecting, joined, error
  const [roomId, setRoomId] = useState<string | null>(passedRoomId || null);
  const [myLanguage, setMyLanguage] = useState<string | null>(passedMyLanguage || null);
  const [partnerLanguage, setPartnerLanguage] = useState<string | null>(passedPartnerLanguage || null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<AppSocket | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // --- Connection Logic (for User B joining via URL) ---
  useEffect(() => {
    // Only run connection logic if joining via token (not navigated from GenerateQR)
    if (token && !joined) {
      setConnectStatus('connecting');
      console.log(`Join screen: Attempting to connect and join with token: ${token}`);

      // TODO: Get user's actual language preference
      const userBLanguage = 'es';
      setMyLanguage(userBLanguage);

      console.log(`Join screen: Connecting to ${BACKEND_URL} with path ${socketIoPath}`);
      
      // Connect directly to the backend-temp namespace
      const namespace = 'backend-temp';
      console.log(`Using namespace: ${namespace}`);
      
      // Create Socket.IO connection with explicit namespace
      socketRef.current = io(`${BACKEND_URL}/${namespace}`, {
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          transports: ['polling', 'websocket'],
          path: '/socket.io', // Explicit path
          forceNew: true,
          autoConnect: true,
          withCredentials: false
      });

      const socket = socketRef.current;

      const connectionTimeout = setTimeout(() => {
          console.error("Join screen: Connection timeout");
          socket?.disconnect();
          setError(`Could not connect to the server at ${BACKEND_URL}.`);
          setConnectStatus('error');
      }, 10000);

      socket.on('connect', () => {
          clearTimeout(connectionTimeout);
          console.log('Join screen: Connected with socket ID:', socket.id);
          console.log(`Join screen: Emitting join event with token ${token} and lang ${userBLanguage}`);
          socket.emit('join', { token: token, language: userBLanguage });
      });

      socket.on('joinedRoom', ({ roomId: receivedRoomId, partnerLanguage: receivedPartnerLang }: { roomId: string, partnerLanguage: string }) => {
          console.log(`Join screen: Successfully joined room ${receivedRoomId}`);
          setRoomId(receivedRoomId);
          setPartnerLanguage(receivedPartnerLang);
          setConnectStatus('joined');
          setError(null);
          // Now the main chat useEffect listener will take over
      });

      socket.on('error', (errorMessage: { message: string }) => {
          clearTimeout(connectionTimeout);
          console.error('Join screen: Error from server:', errorMessage);
          setError(errorMessage.message || 'Could not join the chat room.');
          setConnectStatus('error');
          socket?.disconnect();
      });

      socket.on('connect_error', (err: Error) => {
          clearTimeout(connectionTimeout);
          console.error('Join screen: Connection Error:', err.message);
          console.error('Connection Error details:', err);
          if (!socket?.active) {
              setError(`Could not connect to the server: ${err.message}.`);
              setConnectStatus('error');
          }
          
          // Try a direct fetch to test the HTTP connection
          fetch(`${BACKEND_URL}/health`)
            .then(response => {
              if (response.ok) {
                console.log('HTTP connection works but WebSocket failed');
                return response.json();
              } else {
                console.error('HTTP connection also failed:', response.status);
                throw new Error(`HTTP status ${response.status}`);
              }
            })
            .then(data => console.log('Health check response:', data))
            .catch(err => console.error('Health check failed:', err));
      });
      
      // Add listener for server acknowledgment
      socket.on('server_ack', (data) => {
        console.log('Received server acknowledgment:', data);
      });

      socket.on('disconnect', (reason: Socket.DisconnectReason) => {
          clearTimeout(connectionTimeout);
          console.log('Join screen: Socket disconnected:', reason);
          if (connectStatus === 'connecting') {
              setError("Disconnected before joining the room.");
              setConnectStatus('error');
          }
          // Let the chat listener handle disconnects after joining
      });

      // Cleanup connection listeners on unmount if connection is in progress
      return () => {
         clearTimeout(connectionTimeout);
         if (socketRef.current && connectStatus === 'connecting') {
            console.log("Join screen: Cleaning up joining connection attempt.");
            socketRef.current.disconnect();
         }
      }
    } else if (joined) {
        // If navigated from GenerateQR, we are already "joined"
        setConnectStatus('joined');
    }

  }, [token, joined, connectStatus]); // Dependencies for join logic

  // --- Chat Logic (runs once connected/joined) ---
  useEffect(() => {
    // Only run chat logic if joined successfully
    if (connectStatus !== 'joined' || !roomId) return;

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
        console.error("Chat logic: Socket not connected!");
        setError("Lost connection, cannot chat.");
        setConnectStatus('error');
        // Optionally navigate home: router.replace('/');
        return;
    }

    console.log(`Chat logic: Listening in room ${roomId}`);

    // --- Define Event Handlers ---
    const handleNewMessage = (message: any) => {
        console.log('Chat message received:', message);
        setMessages((prevMessages) => [...prevMessages, { ...message, id: Date.now().toString() + Math.random() }]);
    };
    const handlePartnerLeft = () => {
        console.log('Partner left the chat');
        setPartnerLeft(true);
        Alert.alert("Partner Left", "Your chat partner has left the room.");
    };
    const handleError = (errorMessage: { message: string }) => {
        console.error('Received error during chat:', errorMessage);
        Alert.alert('Chat Error', errorMessage.message || 'An unknown error occurred during chat.');
        // Could set connectStatus to 'error' or navigate
    };
    const handleDisconnect = (reason: Socket.DisconnectReason) => {
        console.log('Disconnected during chat:', reason);
        if (reason !== 'io client disconnect' && connectStatus === 'joined') {
             setError("Lost connection to the server.");
             setConnectStatus('error');
             Alert.alert("Disconnected", "Lost connection to the server.");
             // Optionally navigate home: router.replace('/');
        }
    };

    // --- Register Listeners ---
    socket.on('newMessage', handleNewMessage);
    socket.on('partnerLeft', handlePartnerLeft);
    socket.on('error', handleError);
    socket.on('disconnect', handleDisconnect);

    // --- Cleanup Chat Listeners ---
    return () => {
      console.log('Leaving chat, removing listeners...');
      socket?.off('newMessage', handleNewMessage);
      socket?.off('partnerLeft', handlePartnerLeft);
      socket?.off('error', handleError);
      socket?.off('disconnect', handleDisconnect);
      // Disconnect the socket when leaving the chat screen
      if (socketRef.current) {
          console.log("Disconnecting chat socket.");
          socketRef.current.disconnect();
          socketRef.current = null;
      }
    };
  }, [connectStatus, roomId]); // Dependencies for chat logic

  // Scroll to bottom when messages update
  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
        flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  // --- Send Message Handler ---
  const handleSend = useCallback(() => {
    if (inputText.trim() && !partnerLeft && socketRef.current?.connected && roomId) {
      console.log(`Sending message to room ${roomId}: ${inputText}`);
      socketRef.current.emit('sendMessage', {
        roomId: roomId,
        messageText: inputText.trim(),
      });
      setInputText('');
    } else if (partnerLeft) {
        Alert.alert("Cannot Send", "Your partner has left the chat.");
    } else if (!socketRef.current?.connected) {
        Alert.alert("Cannot Send", "You are not connected to the server.");
    }
  }, [inputText, roomId, partnerLeft]);

  // --- Render Logic ---
  if (connectStatus === 'connecting' || (token && !joined && connectStatus === 'idle')) {
    return (
        <View style={styles.centerStatus}>
            <ActivityIndicator size="large" />
            <Text style={styles.statusText}>Connecting and joining room...</Text>
        </View>
    );
  }

  if (connectStatus === 'error') {
     return (
        <View style={styles.centerStatus}>
            <Text style={styles.errorText}>Error joining chat</Text>
            <Text style={styles.errorDetail}>{error || "An unknown error occurred."}</Text>
             <PaperButton mode="contained" onPress={() => router.replace('/')}>Go Home</PaperButton>
        </View>
    );
  }

  if (connectStatus !== 'joined' || !roomId) {
      // Should not happen if logic is correct, but acts as a fallback
       return (
        <View style={styles.centerStatus}>
            <Text style={styles.errorText}>Something went wrong</Text>
            <PaperButton mode="contained" onPress={() => router.replace('/')}>Go Home</PaperButton>
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
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
                    editable={!partnerLeft} // Disable input if partner left
                />
                <Button title="Send" onPress={handleSend} disabled={partnerLeft || !inputText.trim()} />
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
  },
  statusText: {
      marginTop: 15,
      fontSize: 16,
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
    paddingVertical: 10,
    marginRight: 10,
    backgroundColor: '#fff'
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
      padding: 10,
      borderRadius: 15,
      elevation: 1, // Android shadow
      shadowColor: '#000', // iOS shadow
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
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