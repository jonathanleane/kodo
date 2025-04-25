import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useSocket } from '../contexts/SocketContext';
import { RootStackParamList } from '../../App';

type ChatScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Chat'>;
type ChatScreenRouteProp = RouteProp<RootStackParamList, 'Chat'>;

type Message = {
  id: string;
  original: string;
  translated: string;
  sender: 'self' | 'partner';
  timestamp: string;
};

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const route = useRoute<ChatScreenRouteProp>();
  const { roomId, mode, language, partnerLanguage } = route.params;
  const { socket, isConnected } = useSocket();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPartnerLanguage, setCurrentPartnerLanguage] = useState(partnerLanguage);
  const [joinedChat, setJoinedChat] = useState(mode === 'guest');
  const [sending, setSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!socket || !isConnected) {
      Alert.alert(
        'Connection Error',
        'Lost connection to the server. You\'ll be returned to the home screen.',
        [{
          text: 'OK',
          onPress: () => navigation.navigate('Home'),
        }]
      );
      return;
    }

    // If host, join the room
    if (mode === 'host' && !joinedChat) {
      socket.emit('joinAsHost', { roomId });
    }

    // Set up socket event listeners
    socket.on('partnerJoined', ({ partnerLanguage }) => {
      setCurrentPartnerLanguage(partnerLanguage);
      // Add system message
      const systemMessage: Message = {
        id: `system-${Date.now()}`,
        original: 'Partner joined the chat',
        translated: 'Partner joined the chat',
        sender: 'self',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, systemMessage]);
    });

    socket.on('roomJoined', ({ partnerLanguage }) => {
      setCurrentPartnerLanguage(partnerLanguage);
      setJoinedChat(true);
    });

    socket.on('newMessage', (message: Message) => {
      setMessages(prev => [...prev, message]);
      // Scroll to the end
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
    });

    socket.on('partnerLeft', () => {
      // Add system message
      const systemMessage: Message = {
        id: `system-${Date.now()}`,
        original: 'Partner left the chat',
        translated: 'Partner left the chat',
        sender: 'self',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, systemMessage]);
    });

    socket.on('error', ({ message }) => {
      Alert.alert('Error', message);
    });

    // Cleanup function
    return () => {
      socket.off('partnerJoined');
      socket.off('roomJoined');
      socket.off('newMessage');
      socket.off('partnerLeft');
      socket.off('error');
    };
  }, [socket, isConnected, roomId, mode]);

  const handleSendMessage = () => {
    if (!inputText.trim() || !socket || !isConnected || !joinedChat || sending) {
      return;
    }

    setSending(true);
    setInputText('');

    // Send message to server
    socket.emit('sendMessage', {
      roomId,
      messageText: inputText.trim(),
    });

    // Wait for the message to be processed and returned via socket
    setTimeout(() => setSending(false), 500);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isSystemMessage = item.id.startsWith('system-');
    const isSelf = item.sender === 'self';

    if (isSystemMessage) {
      return (
        <View style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{item.original}</Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.messageContainer,
          isSelf ? styles.selfMessageContainer : styles.partnerMessageContainer,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isSelf ? styles.selfMessageBubble : styles.partnerMessageBubble,
          ]}
        >
          <Text style={styles.originalText}>{item.original}</Text>
          <View style={styles.translationDivider} />
          <Text style={styles.translatedText}>{item.translated}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.languageInfo}>
        <Text style={styles.languageText}>
          You: <Text style={styles.language}>{language}</Text> | Partner:{' '}
          <Text style={styles.language}>
            {currentPartnerLanguage || 'Connecting...'}
          </Text>
        </Text>
      </View>

      {!joinedChat && (
        <View style={styles.waitingContainer}>
          <ActivityIndicator size="large" color="#5762D5" />
          <Text style={styles.waitingText}>Waiting for partner to join...</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesContainer}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        onLayout={() => flatListRef.current?.scrollToEnd()}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
          editable={joinedChat && !sending}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || !joinedChat || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSendMessage}
          disabled={!inputText.trim() || !joinedChat || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="send" size={24} color="white" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  languageInfo: {
    padding: 10,
    backgroundColor: '#EDF2F7',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  languageText: {
    fontSize: 14,
    color: '#4A5568',
    textAlign: 'center',
  },
  language: {
    fontWeight: 'bold',
    color: '#5762D5',
  },
  waitingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 70,
    backgroundColor: 'rgba(247, 249, 252, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  waitingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#4A5568',
  },
  messagesContainer: {
    padding: 10,
    paddingBottom: 20,
  },
  messageContainer: {
    marginBottom: 10,
    maxWidth: '80%',
  },
  selfMessageContainer: {
    alignSelf: 'flex-end',
  },
  partnerMessageContainer: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  selfMessageBubble: {
    backgroundColor: '#5762D5',
  },
  partnerMessageBubble: {
    backgroundColor: 'white',
  },
  originalText: {
    fontSize: 15,
    color: '#333',
  },
  translationDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    marginVertical: 6,
  },
  translatedText: {
    fontSize: 15,
    color: '#333',
    fontStyle: 'italic',
  },
  systemMessageContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  systemMessageText: {
    fontSize: 12,
    color: '#718096',
    backgroundColor: 'rgba(237, 242, 247, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 16,
    color: '#333',
  },
  sendButton: {
    backgroundColor: '#5762D5',
    borderRadius: 50,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
});

export default ChatScreen;
