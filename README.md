# Kodo Chat: Real-Time Translation Chat

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Instantly break down language barriers! Kodo Chat provides seamless, real-time, AI-powered translation directly within a simple web-based chat interface. Connect with anyone, anywhere, regardless of the language they speak.

This project demonstrates the use of Node.js, Socket.IO, React Native (with Expo for web), Redis, and the OpenAI API to create a functional multilingual chat application.

**Live Demo:** [https://kodo-frontend.onrender.com/](https://kodo-frontend.onrender.com/) *(Replace with your actual Render frontend URL if different)*

## Features

*   **Real-Time Translation:** Messages are translated instantly using OpenAI's powerful language models (defaults to `gpt-4o`).
*   **Multi-Language Support:** Users select their preferred language upon joining.
*   **Easy Connection:** Start a chat and share a unique QR code or invite link with your partner.
*   **Typing Indicator:** See when your chat partner is actively typing.
*   **Simple Interface:** Clean chat interface built with React Native Paper.
*   **WebSocket Communication:** Uses Socket.IO for efficient real-time messaging.
*   **Session Management:** Redis is used to manage connection tokens and active chat rooms.

## Tech Stack

*   **Frontend:**
    *   React Native (via Expo)
    *   Expo Router
    *   React Native Paper (UI Components)
    *   Socket.IO Client
    *   `i18n-js` & `expo-localization` (Localization)
    *   `date-fns` (Timestamps)
    *   `expo-clipboard` (Copy Link)
*   **Backend:**
    *   Node.js
    *   Express
    *   Socket.IO
    *   Redis (`ioredis`)
    *   OpenAI Node Library
    *   `dotenv`
*   **Infrastructure:**
    *   Render.com (or adaptable to other platforms like Railway, Docker)
    *   Managed Redis (Render Redis, Railway Redis, etc.)
    *   OpenAI API

## Project Structure

```
kodo/
├── backend/         # Node.js backend code
│   ├── src/
│   │   └── server.js  # Main backend logic
│   ├── .env.example # Example environment variables
│   └── package.json
├── frontend/        # Expo (React Native web) frontend code
│   ├── app/         # Expo Router screens (index, generate, join)
│   ├── assets/      # Static assets (icons, images)
│   ├── components/  # Shared UI components (if any)
│   ├── context/     # React Context (SocketContext)
│   ├── translations/# Localization files
│   │   ├── en.json
│   │   ├── es.json
│   │   └── ... (other languages)
│   │   └── i18n.config.ts # i18n setup
│   ├── .env.example # Example environment variables
│   ├── app.json     # Expo config
│   └── package.json
├── .gitignore
├── package.json     # Root package file (for workspace commands)
└── README.md        # This file
```

## Getting Started (Local Development)

### Prerequisites

*   Node.js (LTS version recommended)
*   npm
*   Docker (for running Redis easily) or a locally installed Redis instance
*   An OpenAI API Key

### Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/jonathanleane/kodo.git
    cd kodo
    ```
2.  **Install Root Dependencies:**
    ```bash
    npm install 
    ```
3.  **Install Backend Dependencies:**
    ```bash
    cd backend
    npm install
    ```
4.  **Configure Backend Environment:**
    *   Copy `.env.example` to `.env` within the `backend` directory.
    *   Edit `backend/.env` and add your `OPENAI_API_KEY`.
    *   Ensure `DATABASE_URL` is set for your local Redis (default: `redis://localhost:6379`).
5.  **Install Frontend Dependencies:**
    ```bash
    cd ../frontend
    npm install
    ```
6.  **Configure Frontend Environment:**
    *   Create a `.env` file in the `frontend` directory.
    *   Add the following lines:
        ```dotenv
        EXPO_PUBLIC_BACKEND_URL=http://localhost:3001
        EXPO_PUBLIC_FRONTEND_URL=http://localhost:8081 # Or your Expo web port
        ```
    *   **For Mobile QR Testing:** Replace `localhost` in `EXPO_PUBLIC_FRONTEND_URL` with your computer's local network IP address (e.g., `http://192.168.1.100:8081`).

### Running Locally

1.  **Start Redis:**
    *   Using Docker: `docker run -d -p 6379:6379 --name kodo-redis redis` (or `docker start kodo-redis` if it exists).
    *   Or start your native Redis instance.
2.  **Start Backend:**
    *   Open a terminal in the `backend` directory.
    *   Run: `npm run start:full` (uses `server.js`)
3.  **Start Frontend:**
    *   Open a *new* terminal in the `frontend` directory.
    *   Run: `npm run web` (or `npx expo start --web`)
    *   This should open the app in your browser at `http://localhost:8081` (or the port specified).

## Deployment (Render.com Example)

See the detailed steps outlined in the conversation history or adapt for your preferred platform.

**Key steps for Render:**

1.  Create a **Redis** instance (copy Internal URL).
2.  Create a **Web Service** for the backend:
    *   Repo: `jonathanleane/kodo`
    *   Root Dir: `backend`
    *   Build: `npm install`
    *   Start: `node src/server.js`
    *   Env Vars: `DATABASE_URL` (from Redis), `OPENAI_API_KEY`, `NODE_ENV=production`.
3.  Create a **Static Site** for the frontend:
    *   Repo: `jonathanleane/kodo`
    *   Root Dir: `frontend`
    *   Build: `npm install && npx expo export`
    *   Publish Dir: `frontend/dist`
    *   Add Rewrite Rule: Source `/*`, Destination `/index.html`.
    *   Env Vars (Build Time): `EXPO_PUBLIC_BACKEND_URL` (Backend Service URL), `EXPO_PUBLIC_FRONTEND_URL` (This Static Site URL).

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This project is licensed under the ISC License - see the LICENSE file for details (Note: No LICENSE file currently exists, using standard ISC text). 