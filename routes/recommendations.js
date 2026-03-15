const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { generateRecommendations, getRecommendations } = require('../services/productIntelligenceService');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorised' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.userId = decoded.id || decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// GET /recommendations — get today's saved recommendations
router.get('/', authMiddleware, async (req, res) => {
  try {
    const recs = await getRecommendations(req.userId);
    res.json({ recommendations: recs });
  } catch (err) {
    console.error('Get recommendations error:', err.message);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// POST /recommendations/generate — generate fresh recommendations now
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const result = await generateRecommendations(req.userId);
    res.json(result);
  } catch (err) {
    console.error('Generate recommendations error:', err.message);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

module.exports = router;