#!/bin/bash
# Simple server to serve static files
echo "Installing serve package..."
npm install serve
echo "Starting server on port $PORT..."
npx serve -s dist -p $PORT