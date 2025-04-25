import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../App';

type LanguageSelectScreenNavigationProp = StackNavigationProp<RootStackParamList, 'LanguageSelect'>;
type LanguageSelectScreenRouteProp = RouteProp<RootStackParamList, 'LanguageSelect'>;

// List of common languages
const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
];

const LanguageSelectScreen: React.FC = () => {
  const navigation = useNavigation<LanguageSelectScreenNavigationProp>();
  const route = useRoute<LanguageSelectScreenRouteProp>();
  const { mode } = route.params;
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  const handleContinue = () => {
    if (mode === 'host') {
      navigation.navigate('QRGenerate', { language: selectedLanguage });
    } else {
      navigation.navigate('QRScan', { language: selectedLanguage });
    }
  };

  const renderLanguageItem = ({ item }: { item: { code: string; name: string } }) => (
    <TouchableOpacity
      style={[
        styles.languageItem,
        selectedLanguage === item.code && styles.selectedLanguageItem,
      ]}
      onPress={() => setSelectedLanguage(item.code)}
    >
      <Text
        style={[
          styles.languageText,
          selectedLanguage === item.code && styles.selectedLanguageText,
        ]}
      >
        {item.name}
      </Text>
      {selectedLanguage === item.code && (
        <Text style={styles.checkmark}>✓</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {mode === 'host' ? 'What language do you speak?' : 'What language do you need?'}
      </Text>
      
      <Text style={styles.subtitle}>
        {mode === 'host' 
          ? 'Select your preferred language to communicate in' 
          : 'Select the language you would like to translate to'}
      </Text>
      
      <FlatList
        data={LANGUAGES}
        renderItem={renderLanguageItem}
        keyExtractor={(item) => item.code}
        style={styles.languageList}
      />
      
      <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  languageList: {
    flex: 1,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  selectedLanguageItem: {
    backgroundColor: '#5762D5',
  },
  languageText: {
    fontSize: 16,
    color: '#333',
  },
  selectedLanguageText: {
    color: 'white',
    fontWeight: 'bold',
  },
  checkmark: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  continueButton: {
    backgroundColor: '#5762D5',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  continueButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default LanguageSelectScreen;
