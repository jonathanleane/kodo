import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, Href } from 'expo-router';
import { Button } from 'react-native-paper'; // Using Paper for consistent button styling

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Real-Time Translation Chat</Text>
      <Link href={"/generate" as Href<string>} asChild>
        <Button mode="contained" style={styles.button}>
            Start Chat (Generate QR)
        </Button>
      </Link>
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
    textAlign: 'center',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: '80%',
    maxWidth: 300
  },
  info: {
      marginTop: 40,
      textAlign: 'center',
      color: 'grey'
  }
}); 