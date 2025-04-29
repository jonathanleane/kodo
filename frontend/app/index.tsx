import React from 'react';
import { View, StyleSheet, Image, ScrollView, Linking } from 'react-native';
import { Link, Href } from 'expo-router';
import { Button, Text as PaperText, useTheme, Card, Title, Paragraph, Divider, Icon } from 'react-native-paper';

export default function HomeScreen() {
  const theme = useTheme();
  const GITHUB_URL = "https://github.com/jonathanleane/kodo";

  return (
    <ScrollView style={{backgroundColor: theme.colors.background}}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        
        {/* --- Hero Section --- */}
        <View style={styles.heroSection}>
          {/* <Image source={require('../assets/images/kodo-logo-placeholder.png')} style={styles.logo} /> */}
          <PaperText variant="displayMedium" style={[styles.title, {color: theme.colors.primary}]}>Kodo Chat</PaperText>
          <PaperText variant="headlineSmall" style={styles.subtitle}>
            Speak Freely Across Languages
          </PaperText>
          <PaperText variant="bodyLarge" style={styles.description}>
            Experience seamless, real-time, AI-powered chat translation. Connect with anyone, anywhere, in your own language.
          </PaperText>
          <Link href={"/generate" as Href} asChild>
            <Button 
              mode="contained" 
              icon="chat-plus-outline"
              style={styles.ctaButton} 
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
            >
                Start a New Chat Session
            </Button>
          </Link>
        </View>

        <Divider style={styles.divider}/>

        {/* --- Features Section --- */}
        <View style={styles.section}>
          <PaperText variant="headlineSmall" style={styles.sectionTitle}>Features</PaperText>
          <View style={styles.featuresGrid}>
            <Card style={styles.featureCard} mode="elevated">
              <Card.Content style={styles.cardContent}>
                <Icon source="translate" size={30} color={theme.colors.primary} />
                <Title style={styles.cardTitle}>Real-Time Translation</Title>
                <Paragraph style={styles.cardParagraph}>Messages are translated instantly as you chat, powered by OpenAI's GPT models.</Paragraph>
              </Card.Content>
            </Card>
            <Card style={styles.featureCard} mode="elevated">
              <Card.Content style={styles.cardContent}>
                 <Icon source="earth" size={30} color={theme.colors.primary} />
                <Title style={styles.cardTitle}>Multi-Language Support</Title>
                <Paragraph style={styles.cardParagraph}>Choose from numerous languages for seamless communication.</Paragraph>
              </Card.Content>
            </Card>
            <Card style={styles.featureCard} mode="elevated">
              <Card.Content style={styles.cardContent}>
                 <Icon source="qrcode-scan" size={30} color={theme.colors.primary} />
                <Title style={styles.cardTitle}>Easy Connection</Title>
                <Paragraph style={styles.cardParagraph}>Connect easily by scanning a QR code or sharing a simple invite link.</Paragraph>
              </Card.Content>
            </Card>
             <Card style={styles.featureCard} mode="elevated">
              <Card.Content style={styles.cardContent}>
                 <Icon source="keyboard-outline" size={30} color={theme.colors.primary} />
                <Title style={styles.cardTitle}>Typing Indicator</Title>
                <Paragraph style={styles.cardParagraph}>See when your chat partner is typing their reply.</Paragraph>
              </Card.Content>
            </Card>
          </View>
        </View>

        <Divider style={styles.divider}/>

        {/* --- How it Works Section --- */}
        <View style={styles.section}>
          <PaperText variant="headlineSmall" style={styles.sectionTitle}>How It Works</PaperText>
          <View style={styles.howItWorksStep}>
              <Icon source="numeric-1-circle" size={24} color={theme.colors.secondary}/>
              <PaperText style={styles.instructionStep}>Click "Start New Chat Session" & select your language.</PaperText>
          </View>
           <View style={styles.howItWorksStep}>
              <Icon source="numeric-2-circle" size={24} color={theme.colors.secondary}/>
              <PaperText style={styles.instructionStep}>Share the generated QR code or copy the invite link.</PaperText>
          </View>
           <View style={styles.howItWorksStep}>
              <Icon source="numeric-3-circle" size={24} color={theme.colors.secondary}/>
              <PaperText style={styles.instructionStep}>Your partner scans the code or opens the link & selects their language.</PaperText>
          </View>
          <View style={styles.howItWorksStep}>
              <Icon source="numeric-4-circle" size={24} color={theme.colors.secondary}/>
              <PaperText style={styles.instructionStep}>Chat away! Messages are translated in real-time.</PaperText>
          </View>
        </View>

        <Divider style={styles.divider}/>

        {/* --- Open Source Section --- */}
        <View style={styles.section}>
          <PaperText variant="headlineSmall" style={styles.sectionTitle}>Open Source</PaperText>
           <PaperText variant="bodyLarge" style={styles.description}>
             Kodo Chat is open-source! Feel free to explore the code, contribute, or deploy your own instance.
          </PaperText>
          <Button 
            mode="outlined" 
            icon="github"
            style={[styles.button, {marginTop: 15}]}
            onPress={() => Linking.openURL(GITHUB_URL)}
           > 
             View on GitHub
          </Button>
        </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 50,
  },
  heroSection: {
      paddingTop: 60,
      paddingBottom: 40,
      alignItems: 'center',
      width: '100%',
      paddingHorizontal: 20,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  title: {
    marginBottom: 15,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 20, 
    textAlign: 'center',
  },
  description: {
      marginBottom: 30, 
      textAlign: 'center',
      paddingHorizontal: 20, 
      lineHeight: 24,
      maxWidth: 600,
  },
  ctaButton: {
    paddingVertical: 12,
    borderRadius: 30, 
    elevation: 3, 
    marginTop: 10,
  },
  button: {
    paddingVertical: 8, 
    borderRadius: 30, 
    elevation: 2, 
  },
  buttonContent: {
    paddingHorizontal: 25,
  },
  buttonLabel: {
      fontSize: 16, 
  },
  divider: {
      marginVertical: 40,
      width: '80%',
      height: 1,
  },
  section: {
      alignItems: 'center',
      marginBottom: 30,
      paddingHorizontal: 15,
      width: '100%',
  },
  sectionTitle: {
      marginBottom: 30,
      textAlign: 'center',
  },
  featuresGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      width: '100%',
      maxWidth: 900,
  },
  featureCard: {
      width: '90%',
      maxWidth: 320,
      margin: 10,
      minHeight: 150,
  },
  cardContent: {
      alignItems: 'center',
      paddingTop: 20,
      paddingBottom: 10,
  },
  cardTitle: {
      marginTop: 10,
      marginBottom: 5,
      textAlign: 'center',
  },
  cardParagraph: {
      textAlign: 'center',
      fontSize: 14,
  },
  howItWorksStep: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 15,
      width: '90%',
      maxWidth: 500,
  },
  instructionStep: {
      marginLeft: 10,
      fontSize: 16,
      flexShrink: 1,
  },
}); 