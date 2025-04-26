import { Stack } from 'expo-router';
import { SocketProvider } from '../context/SocketContext';

export default function RootLayout() {
  return (
    <SocketProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Translator Chat Home' }} />
        <Stack.Screen name="generate" options={{ title: 'Generate Chat QR' }} />
        <Stack.Screen name="join" options={{ title: 'Chat Room' }} />
        {/* Hide the not-found screen from the stack */}
        <Stack.Screen name="+not-found" options={{ title: 'Not Found' }} />
      </Stack>
    </SocketProvider>
  );
}
