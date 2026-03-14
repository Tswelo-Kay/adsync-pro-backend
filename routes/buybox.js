const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { getBuyBoxSummary } = require('../services/buyBoxService');

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

// GET /buybox/summary
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const data = await getBuyBoxSummary(req.userId);
    res.json(data);
  } catch (err) {
    console.error('Buy Box summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Buy Box summary' });
  }
});

module.exports = router;