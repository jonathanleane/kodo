import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Translates text from source language to target language using OpenAI API
 * 
 * @param text The text to translate
 * @param sourceLanguage The source language code
 * @param targetLanguage The target language code
 * @returns The translated text
 */
export async function translateMessage(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  try {
    // If languages are the same, no translation needed
    if (sourceLanguage === targetLanguage) {
      return text;
    }
    
    const prompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}. 

Text to translate: "${text}"

Translation:`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Using GPT-4o for high-quality translations
      messages: [
        { role: 'system', content: 'You are a professional translator. Translate the text accurately while maintaining its tone and meaning. Only respond with the translation, nothing else.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.3, // Lower temperature for more consistent translations
    });
    
    // Extract the translated text from the response
    const translatedText = response.choices[0]?.message?.content?.trim() || text;
    
    return translatedText;
  } catch (error) {
    console.error('Translation error:', error);
    // Return original text if translation fails
    return `[Translation Error] ${text}`;
  }
}

/**
 * Detects the language of input text using OpenAI API
 * 
 * @param text The text to analyze
 * @returns The detected language code
 */
export async function detectLanguage(text: string): Promise<string> {
  try {
    const prompt = `Detect the language of the following text and return ONLY the ISO language code (e.g. 'en', 'es', 'fr', 'ja', etc.).

Text: "${text}"

Language code:`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a language detection tool. Respond only with the two-letter ISO language code.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 10,
      temperature: 0.1,
    });
    
    const languageCode = response.choices[0]?.message?.content?.trim() || 'en';
    
    // Return only the first two characters to ensure it's a valid ISO code
    return languageCode.substring(0, 2).toLowerCase();
  } catch (error) {
    console.error('Language detection error:', error);
    // Default to English if detection fails
    return 'en';
  }
}
