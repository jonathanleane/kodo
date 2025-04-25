import express from 'express';

const router = express.Router();

// Health check endpoint for DigitalOcean App Platform
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Kodo server is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;