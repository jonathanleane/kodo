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
  Alert
} from 'react-native';

// Helper function to render message bubbles
const MessageBubble = ({ message }) => {
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

export default function ChatScreen({ route, navigation }) {
  const { roomId, myLanguage, partnerLanguage, socket: initialSocket } = route.params;
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [partnerLeft, setPartnerLeft] = useState(false);
  const socketRef = useRef(initialSocket); // Use the socket passed from GenerateQR or created by deep link
  const flatListRef = useRef();

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
        console.error("ChatScreen: Socket not provided or not connected!");
        Alert.alert("Connection Error", "Lost connection, cannot chat.");
        navigation.navigate('Home'); // Go back home if socket is bad
        return;
    }

    console.log(`Entered Chat room: ${roomId}`);
    navigation.setOptions({ title: `Chat Room: ${roomId.split('_')[1]}` }); // Set header title

    const handleNewMessage = (message) => {
        console.log('New message received:', message);
        // Add a unique ID for FlatList key
        setMessages((prevMessages) => [...prevMessages, { ...message, id: Date.now().toString() + Math.random() }]);
    };

    const handlePartnerLeft = () => {
        console.log('Partner left the chat');
        setPartnerLeft(true);
        Alert.alert("Partner Left", "Your chat partner has left the room.");
        // Optionally disable input or navigate away after a delay
    };

    const handleError = (errorMessage) => {
        console.error('Received error during chat:', errorMessage);
        Alert.alert('Server Error', errorMessage.message || 'An unknown error occurred during chat.');
        // Consider navigating back
    };

    const handleDisconnect = (reason) => {
        console.log('Disconnected during chat:', reason);
        if (reason !== 'io client disconnect') {
             Alert.alert("Disconnected", "Lost connection to the server.");
             navigation.navigate('Home'); // Go back home on unexpected disconnect
        }
    };

    // Register listeners
    socket.on('newMessage', handleNewMessage);
    socket.on('partnerLeft', handlePartnerLeft);
    socket.on('error', handleError); // Listen for general errors
    socket.on('disconnect', handleDisconnect);

    // Cleanup: remove listeners when component unmounts
    return () => {
      console.log('Leaving chat screen, removing listeners...');
      socket.off('newMessage', handleNewMessage);
      socket.off('partnerLeft', handlePartnerLeft);
      socket.off('error', handleError);
      socket.off('disconnect', handleDisconnect);
      // Optionally tell backend user is leaving? Or rely on disconnect.
      // socket.emit('leaveRoom', { roomId });
      // If this component initiated the socket connection (deep link case), disconnect it.
      // Need logic to determine if this screen owns the socket.
      // For simplicity now, we assume the socket lifecycle is managed elsewhere (e.g., App.js or GenerateQR)
      // unless explicitly passed for cleanup.
    };
  }, [roomId, navigation]); // Rerun effect if roomId or navigation changes

  // Scroll to bottom when messages update
  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
        flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    if (inputText.trim() && !partnerLeft && socketRef.current?.connected) {
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

  return (
    <SafeAreaView style={styles.safeArea}>
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
                editable={!partnerLeft} // Disable input if partner left
                />
                <Button title="Send" onPress={handleSend} disabled={partnerLeft || !inputText.trim()} />
            </View>
        </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
      flex: 1,
      backgroundColor: '#f0f0f0' // Background for the whole screen area
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
      backgroundColor: '#dcf8c6', // Light green for self
      marginLeft: 'auto',
      borderBottomRightRadius: 0,
  },
  messageBubblePartner: {
      backgroundColor: '#fff', // White for partner
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
      backgroundColor: '#ffebee', // Light red
      alignItems: 'center',
  },
  partnerLeftText: {
      color: '#d32f2f', // Darker red
      fontWeight: 'bold',
  }
}); 