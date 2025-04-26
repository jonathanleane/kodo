const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

// Basic middleware
app.use(express.json());

// Basic routes
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Basic server is running',
    environment: process.env.NODE_ENV || 'development',
    port: PORT
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Basic server listening on 0.0.0.0:${PORT}`);
  console.log('Environment variables:');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('PORT:', process.env.PORT);
});