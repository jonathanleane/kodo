import { Stack } from 'expo-router';
import { SocketProvider } from '../context/SocketContext';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';

// Example Theme Configuration (Teal)
const KodoTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#008080', // Teal
    secondary: '#4682B4', // Steel Blue
    tertiary: '#A9A9A9', // Dark Gray
    background: '#F0F8FF', // Alice Blue
    surface: '#FFFFFF', // White
    // Add other overrides if needed
  },
};

export default function RootLayout() {
  const paperTheme = KodoTheme;

  return (
    // Wrap everything in PaperProvider for theme context
    <PaperProvider theme={paperTheme}>
          <SocketProvider>
            <Stack>
              <Stack.Screen name="index" options={{ title: 'Kodo Chat' }} />
              <Stack.Screen name="generate" options={{ title: 'Start New Chat' }} />
              <Stack.Screen name="join" options={{ title: 'Chat Room' }} />
              <Stack.Screen name="+not-found" options={{ title: 'Not Found' }} />
            </Stack>
          </SocketProvider>
    </PaperProvider>
  );
}
