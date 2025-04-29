import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Link, Href } from 'expo-router';
import { Button, Text as PaperText, useTheme } from 'react-native-paper';

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Optional: Add an engaging graphic/icon */}
      {/* <Image source={require('../assets/images/your-logo.png')} style={styles.logo} /> */}
      
      <PaperText variant="headlineLarge" style={[styles.title, {color: theme.colors.primary}]}>Kodo Chat</PaperText>
      <PaperText variant="titleMedium" style={styles.subtitle}>
        Chat instantly across languages.
      </PaperText>
      <PaperText variant="bodyLarge" style={styles.description}>
        Break down barriers with real-time, AI-powered translation directly in your chat.
      </PaperText>
      
      <Link href={"/generate" as Href} asChild>
        <Button 
          mode="contained" 
          style={styles.button} 
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
        >
            Start a New Chat Session
        </Button>
      </Link>
      
      <View style={styles.instructionsContainer}>
          <PaperText variant="titleSmall" style={styles.instructionsTitle}>How it works:</PaperText>
          <PaperText style={styles.instructionStep}>1. Click "Start New Chat Session".</PaperText>
          <PaperText style={styles.instructionStep}>2. Select your language.</PaperText>
          <PaperText style={styles.instructionStep}>3. Share the QR code or link with your chat partner.</PaperText>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 30,
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  subtitle: {
    marginBottom: 25,
    textAlign: 'center',
    color: '#555',
  },
  description: {
      marginBottom: 45,
      textAlign: 'center',
      paddingHorizontal: 20,
      lineHeight: 22,
      color: '#333',
  },
  button: {
    paddingVertical: 10,
    marginBottom: 40,
    borderRadius: 30, 
    elevation: 2,
  },
  buttonContent: {
    paddingHorizontal: 20,
  },
  buttonLabel: {
      fontSize: 16,
      fontWeight: 'bold',
  },
  instructionsContainer: {
      marginTop: 30,
      alignItems: 'center',
      padding: 15,
      backgroundColor: 'rgba(0, 128, 128, 0.05)',
      borderRadius: 8,
      width: '90%',
      maxWidth: 500,
  },
  instructionsTitle: {
      marginBottom: 10,
      fontWeight: 'bold',
  },
  instructionStep: {
      marginBottom: 5,
      color: '#444',
  },
}); 