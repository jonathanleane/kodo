import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, Href } from 'expo-router';
import { Button, Text as PaperText, useTheme } from 'react-native-paper'; // Use Paper components and theme

export default function HomeScreen() {
  const theme = useTheme(); // Access theme

  return (
    // Use theme background color
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Use PaperText with theme variants */}
      <PaperText variant="displayMedium" style={styles.title}>Kodo Chat</PaperText>
      <PaperText variant="titleMedium" style={styles.subtitle}>Real-Time Translation</PaperText>
      
      <Link href={"/generate" as Href} asChild>
        <Button mode="contained" style={styles.button} contentStyle={styles.buttonContent}>
            Start New Chat
        </Button>
      </Link>
      <PaperText variant="bodyMedium" style={styles.info}>To join a chat, scan a QR code or use an invite link.</PaperText>
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
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 40,
    textAlign: 'center',
    color: '#555', // Use a slightly muted color or theme color
  },
  button: {
    paddingVertical: 8, // Add vertical padding inside button
    marginBottom: 30,
    borderRadius: 30, // Make button rounder
  },
  buttonContent: {
    paddingHorizontal: 10, // Add horizontal padding for text
  },
  info: {
    textAlign: 'center',
    color: 'grey',
    marginTop: 20,
  }
}); 