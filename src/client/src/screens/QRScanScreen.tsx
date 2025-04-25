import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { Camera } from 'expo-camera';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSocket } from '../contexts/SocketContext';
import { RootStackParamList } from '../../App';

type QRScanScreenNavigationProp = StackNavigationProp<RootStackParamList, 'QRScan'>;
type QRScanScreenRouteProp = RouteProp<RootStackParamList, 'QRScan'>;

const QRScanScreen: React.FC = () => {
  const navigation = useNavigation<QRScanScreenNavigationProp>();
  const route = useRoute<QRScanScreenRouteProp>();
  const { language } = route.params;
  const { socket, isConnected } = useSocket();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    // Request camera permission
    const requestCameraPermission = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };

    requestCameraPermission();

    // Set up socket event listeners
    if (socket) {
      socket.on('roomCreated', ({ roomId, partnerLanguage }) => {
        // Navigate to chat screen after room is created
        navigation.replace('Chat', {
          roomId,
          mode: 'guest',
          language,
          partnerLanguage,
        });
      });

      socket.on('error', ({ message }) => {
        Alert.alert('Error', message, [
          {
            text: 'OK',
            onPress: () => setScanned(false),
          },
        ]);
      });

      // Cleanup function
      return () => {
        socket.off('roomCreated');
        socket.off('error');
      };
    }
  }, [socket]);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    if (!socket || !isConnected) {
      Alert.alert(
        'Connection Error',
        'Not connected to the server. Please try again.',
        [
          {
            text: 'OK',
            onPress: () => setScanned(false),
          },
        ]
      );
      return;
    }

    try {
      // Assume the QR code contains a token
      const token = data;

      // Join the room with the token
      socket.emit('join', { token, language });
    } catch (error) {
      console.error('Error scanning QR code:', error);
      Alert.alert(
        'Invalid QR Code',
        'The QR code could not be recognized. Please try again.',
        [
          {
            text: 'OK',
            onPress: () => setScanned(false),
          },
        ]
      );
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Camera access is required to scan QR codes
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === 'granted');
          }}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cameraContainer}>
        <BarCodeScanner
          onBarCodeScanned={handleBarCodeScanned}
          style={styles.camera}
        />
        <View style={styles.overlay}>
          <View style={styles.unfilled} />
          <View style={styles.middleRow}>
            <View style={styles.unfilled} />
            <View style={styles.scanner} />
            <View style={styles.unfilled} />
          </View>
          <View style={styles.unfilled} />
        </View>
      </View>

      <View style={styles.instructionContainer}>
        <Text style={styles.instructionText}>
          Scan the QR code shown by the other person
        </Text>
        <Text style={styles.languageText}>
          Your selected language: <Text style={styles.language}>{language}</Text>
        </Text>
      </View>

      {scanned && (
        <TouchableOpacity
          style={styles.scanAgainButton}
          onPress={() => setScanned(false)}
        >
          <Text style={styles.scanAgainButtonText}>Scan Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraContainer: {
    width: '100%',
    height: '70%',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unfilled: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: '100%',
  },
  middleRow: {
    flexDirection: 'row',
    width: '100%',
  },
  scanner: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#5762D5',
    backgroundColor: 'transparent',
  },
  instructionContainer: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  languageText: {
    color: '#666',
    fontSize: 14,
  },
  language: {
    fontWeight: 'bold',
  },
  scanAgainButton: {
    position: 'absolute',
    bottom: 150,
    backgroundColor: '#5762D5',
    padding: 12,
    borderRadius: 8,
  },
  scanAgainButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorText: {
    color: '#EB5757',
    marginBottom: 20,
    textAlign: 'center',
    padding: 20,
  },
  permissionButton: {
    backgroundColor: '#5762D5',
    padding: 16,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default QRScanScreen;
