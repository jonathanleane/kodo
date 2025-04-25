FROM node:18-alpine

WORKDIR /app

# Copy package.json files first for better caching
COPY package.json ./
COPY src/server/package.json ./src/server/
COPY src/shared ./src/shared/

# Install dependencies
RUN npm install --ignore-scripts
RUN cd src/server && npm install --ignore-scripts

# Copy the rest of the application code
COPY src/server ./src/server

# Build the server
RUN cd src/server && npm run build

# Expose the port the app runs on
EXPOSE 3001

# Command to run the application
CMD ["node", "src/server/dist/index.js"]
