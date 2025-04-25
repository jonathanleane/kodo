import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import QRGenerateScreen from './src/screens/QRGenerateScreen';
import QRScanScreen from './src/screens/QRScanScreen';
import ChatScreen from './src/screens/ChatScreen';
import LanguageSelectScreen from './src/screens/LanguageSelectScreen';

// Contexts
import { SocketProvider } from './src/contexts/SocketContext';

// Define the navigation stack parameter list
export type RootStackParamList = {
  Home: undefined;
  LanguageSelect: { mode: 'host' | 'guest' };
  QRGenerate: { language: string };
  QRScan: { language: string };
  Chat: { 
    roomId: string; 
    mode: 'host' | 'guest'; 
    language: string;
    partnerLanguage: string;
  };
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <SocketProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <Stack.Navigator 
            initialRouteName="Home"
            screenOptions={{
              headerStyle: {
                backgroundColor: '#5762D5',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          >
            <Stack.Screen 
              name="Home" 
              component={HomeScreen} 
              options={{ title: 'Kodo' }} 
            />
            <Stack.Screen 
              name="LanguageSelect" 
              component={LanguageSelectScreen}
              options={{ title: 'Select Language' }} 
            />
            <Stack.Screen 
              name="QRGenerate" 
              component={QRGenerateScreen} 
              options={{ title: 'Share QR Code' }} 
            />
            <Stack.Screen 
              name="QRScan" 
              component={QRScanScreen} 
              options={{ title: 'Scan QR Code' }} 
            />
            <Stack.Screen 
              name="Chat" 
              component={ChatScreen} 
              options={{ title: 'Chat', headerBackTitle: 'End Chat' }} 
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SocketProvider>
    </SafeAreaProvider>
  );
}
