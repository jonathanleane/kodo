# Kodo: Real-Time Translation Chat App

Kodo is a mobile application enabling real-time chat with automatic bi-directional translation between users who speak different languages.

## Features

- QR code pairing for instant chat sessions
- Real-time bi-directional message translation via OpenAI API
- Cross-platform mobile support via React Native
- Ephemeral chat sessions with no persistent history

## Architecture

- **Client**: React Native mobile application
- **Server**: Node.js with Express and Socket.IO
- **Cache**: Redis for temporary session data
- **Translation**: OpenAI GPT-4o API

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker and Docker Compose (for local development)
- OpenAI API key

### Local Setup

1. Clone the repository and install dependencies

```bash
git clone <repository-url>
cd kodo
npm run install:all
```

2. Create a `.env` file in the root directory based on `.env.example`

```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

3. Start the development environment using Docker Compose

```bash
docker-compose up
```

4. In a separate terminal, start the React Native development server

```bash
cd src/client
npm start
```

5. Use Expo to run the app on your mobile device or emulator

## Project Structure

```
├── .do/                # DigitalOcean App Platform configuration
├── docs/               # Documentation
├── src/
│   ├── client/         # React Native mobile app
│   ├── server/         # Node.js backend
│   └── shared/         # Shared types and utilities
├── docker-compose.yml  # Local development configuration
├── server.Dockerfile   # Server Docker configuration
└── package.json        # Root package.json for project management
```

## Deployment

The application is configured for deployment on DigitalOcean App Platform.

1. Fork this repository to your GitHub account
2. Create a new App on DigitalOcean App Platform
3. Connect your GitHub repository
4. Configure the environment variables (especially OPENAI_API_KEY)
5. Deploy the app

Alternatively, you can use the `.do/app.yaml` file to deploy using the DigitalOcean CLI:

```bash
doctl apps create --spec .do/app.yaml
```

## Mobile App

The mobile app is built with React Native and Expo. To build the app for production:

```bash
cd src/client
eas build --platform all
```

## License

MIT
