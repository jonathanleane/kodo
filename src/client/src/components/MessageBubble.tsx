import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type MessageBubbleProps = {
  original: string;
  translated: string;
  isSelf: boolean;
};

const MessageBubble: React.FC<MessageBubbleProps> = ({
  original,
  translated,
  isSelf,
}) => {
  return (
    <View
      style={[
        styles.container,
        isSelf ? styles.selfContainer : styles.partnerContainer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isSelf ? styles.selfBubble : styles.partnerBubble,
        ]}
      >
        <Text
          style={[
            styles.originalText,
            isSelf ? styles.selfText : styles.partnerText,
          ]}
        >
          {original}
        </Text>
        
        <View style={styles.divider} />
        
        <Text
          style={[
            styles.translatedText,
            isSelf ? styles.selfText : styles.partnerText,
          ]}
        >
          {translated}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 5,
    maxWidth: '80%',
  },
  selfContainer: {
    alignSelf: 'flex-end',
  },
  partnerContainer: {
    alignSelf: 'flex-start',
  },
  bubble: {
    padding: 12,
    borderRadius: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  selfBubble: {
    backgroundColor: '#5762D5',
  },
  partnerBubble: {
    backgroundColor: 'white',
  },
  originalText: {
    fontSize: 15,
  },
  translatedText: {
    fontSize: 15,
    fontStyle: 'italic',
  },
  selfText: {
    color: 'white',
  },
  partnerText: {
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 6,
  },
});

export default MessageBubble;
