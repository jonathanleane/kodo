import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSocket } from '../contexts/SocketContext';
import { RootStackParamList } from '../../App';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { isConnected, reconnect } = useSocket();

  const handleCreateChat = () => {
    if (!isConnected) {
      Alert.alert(
        'Connection Error',
        'Unable to connect to the server. Please check your internet connection and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: reconnect }
        ]
      );
      return;
    }
    
    navigation.navigate('LanguageSelect', { mode: 'host' });
  };

  const handleJoinChat = () => {
    if (!isConnected) {
      Alert.alert(
        'Connection Error',
        'Unable to connect to the server. Please check your internet connection and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: reconnect }
        ]
      );
      return;
    }
    
    navigation.navigate('LanguageSelect', { mode: 'guest' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <Text style={styles.title}>KODO</Text>
        <Text style={styles.subtitle}>Chat with anyone, in any language</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleCreateChat}
        >
          <Text style={styles.buttonText}>Create Chat</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={handleJoinChat}
        >
          <Text style={styles.buttonText}>Join Chat</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.connectionStatus}>
        <Text style={{
          color: isConnected ? '#6FCF97' : '#EB5757',
          fontWeight: 'bold'
        }}>
          {isConnected ? 'Connected to server' : 'Not connected'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    justifyContent: 'space-between',
    padding: 20,
  },
  logo: {
    alignItems: 'center',
    marginTop: 60,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#5762D5',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#4F4F4F',
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 40,
  },
  button: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryButton: {
    backgroundColor: '#5762D5',
  },
  secondaryButton: {
    backgroundColor: '#6C63FF',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  connectionStatus: {
    alignItems: 'center',
    padding: 10,
  },
});

export default HomeScreen;
