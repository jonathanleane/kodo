import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function HomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Real-Time Translation Chat</Text>
      <Button
        title="Start Chat (Generate QR)"
        onPress={() => navigation.navigate('GenerateQR')}
      />
      {/* User B doesn't explicitly navigate to Scan, they open the app via deep link */}
      <Text style={styles.info}>To join a chat, scan a QR code using your phone's camera.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  info: {
      marginTop: 40,
      textAlign: 'center',
      color: 'grey'
  }
}); 