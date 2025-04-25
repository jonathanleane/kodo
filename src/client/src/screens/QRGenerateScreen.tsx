import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import QRCode from 'react-native-qrcode-svg';
import { useSocket } from '../contexts/SocketContext';
import { RootStackParamList } from '../../App';

type QRGenerateScreenNavigationProp = StackNavigationProp<RootStackParamList, 'QRGenerate'>;
type QRGenerateScreenRouteProp = RouteProp<RootStackParamList, 'QRGenerate'>;

const QRGenerateScreen: React.FC = () => {
  const navigation = useNavigation<QRGenerateScreenNavigationProp>();
  const route = useRoute<QRGenerateScreenRouteProp>();
  const { language } = route.params;
  const { socket, isConnected } = useSocket();

  const [qrToken, setQrToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Generate QR token when component mounts
    generateQRToken();

    // Set up listener for room creation
    if (socket) {
      // Listen for room creation event related to our token
      const handleRoomCreated = ({ roomId }: { roomId: string }) => {
        // Navigate to chat screen with roomId
        navigation.replace('Chat', {
          roomId,
          mode: 'host',
          language,
          partnerLanguage: '', // Will be updated when partner joins
        });
      };

      // Listen for room creation when someone scans our QR code
      if (qrToken) {
        socket.on(`room:${qrToken}`, handleRoomCreated);
      }

      // Cleanup function
      return () => {
        if (qrToken) {
          socket.off(`room:${qrToken}`);
        }
      };
    }
  }, [socket, qrToken]);

  const generateQRToken = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!socket || !isConnected) {
        setError('Not connected to server');
        setLoading(false);
        return;
      }

      // Make API request to generate token
      const response = await fetch('http://localhost:3001/generate-qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate QR code');
      }

      const data = await response.json();
      setQrToken(data.token);
    } catch (err) {
      console.error('Error generating QR token:', err);
      setError('Failed to generate QR code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    generateQRToken();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Share this QR code</Text>
      <Text style={styles.subtitle}>
        Have the other person scan this QR code to start chatting
      </Text>

      <View style={styles.qrContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#5762D5" />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText} onPress={handleRetry}>
              Tap to retry
            </Text>
          </View>
        ) : (
          qrToken && (
            <QRCode
              value={qrToken}
              size={250}
              color="#000"
              backgroundColor="#FFF"
            />
          )
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          This QR code is valid for 60 seconds
        </Text>
        <Text style={styles.languageText}>
          Your selected language: <Text style={styles.language}>{language}</Text>
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  qrContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    width: 290,
    height: 290,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    color: '#EB5757',
    marginBottom: 10,
    textAlign: 'center',
  },
  retryText: {
    color: '#5762D5',
    fontWeight: 'bold',
  },
  infoContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  infoText: {
    color: '#666',
    fontSize: 14,
    marginBottom: 10,
  },
  languageText: {
    color: '#333',
    fontSize: 16,
  },
  language: {
    fontWeight: 'bold',
  },
});

export default QRGenerateScreen;
