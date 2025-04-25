# Kodo Architecture

## Overview

Kodo is a real-time chat application with automatic translation between users speaking different languages. The system consists of three main components:

1. **Client Application (React Native)**: The mobile app handling UI, QR code operations, and WebSocket communication
2. **Backend Server (Node.js)**: Manages WebSocket connections, chat rooms, and translation requests
3. **Translation Service (OpenAI API)**: Provides text translation functionality
4. **Cache (Redis)**: Stores temporary session data

## Component Details

### Client Application

- **UI/UX**: Chat interface, QR code display/scanning, language selection
- **WebSocket Client**: Real-time communication with the backend
- **State Management**: Manage connection status, room data, and messages

### Backend Server

- **HTTP API**: For QR code token generation
- **WebSocket Server**: Manages real-time connections and events
- **Room Management**: Tracking active chat sessions
- **Translation Service Integration**: Handles LLM API communication

### Cache (Redis)

Stores ephemeral data:
- QR tokens with TTL
- Active room information
- WebSocket connection mappings

## Key Workflows

### User Pairing

1. User A generates a QR code (token)
2. User B scans the QR code
3. Backend validates token and creates a chat room
4. Both users join the room via WebSocket

### Messaging

1. User sends message
2. Backend receives message and identifies languages
3. Message is sent to Translation Service
4. Translated message is sent to recipient

## Security & Privacy

- Transport security (HTTPS/WSS)
- Short-lived, single-use tokens
- No persistent user data
- API key security
- Input validation

## Scalability

- Horizontal scaling of WebSocket servers
- Redis for state management across instances
- LLM API cost optimization strategies
