const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const JWT_SECRET = process.env.JWT_SECRET || 'adsyncpro_super_secret_key_2024_molefe';
const TAKEALOT_API_BASE = 'https://seller-api.takealot.com/v2';

// ─── ENCRYPTION ───────────────────────────────────────────────────────────────
// API keys are encrypted at rest using AES-256-GCM
const ENCRYPTION_KEY = process.env.TAKEALOT_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');

function encryptKey(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUFFER, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptKey(encrypted) {
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BUFFER, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]).toString('utf8');
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
// Simple in-memory rate limiter per user — max 10 Takealot API calls per minute
const rateLimitMap = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxCalls = 10;

  if (!rateLimitMap.has(userId)) {
    rateLimitMap.set(userId, { calls: 1, windowStart: now });
    return true;
  }

  const userLimit = rateLimitMap.get(userId);
  if (now - userLimit.windowStart > windowMs) {
    rateLimitMap.set(userId, { calls: 1, windowStart: now });
    return true;
  }

  if (userLimit.calls >= maxCalls) return false;
  userLimit.calls++;
  return true;
}

// ─── DB SETUP ────────────────────────────────────────────────────────────────
async function ensureTakealotTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS takealot_stores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      api_key_encrypted TEXT NOT NULL,
      seller_name VARCHAR(255),
      status VARCHAR(50) DEFAULT 'active',
      last_error TEXT,
      last_sync TIMESTAMP,
      connected_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}
ensureTakealotTable().catch(console.error);

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Helper: Takealot API request with error detection ────────────────────────
async function takealotRequest(apiKey, endpoint) {
  try {
    const response = await axios.get(`${TAKEALOT_API_BASE}${endpoint}`, {
      headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    return { success: true, data: response.data };
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      return { success: false, errorType: 'invalid_key', message: 'API key is invalid or expired' };
    }
    if (err.response?.status === 429) {
      return { success: false, errorType: 'rate_limited', message: 'Too many requests to Takealot API' };
    }
    if (err.code === 'ECONNABORTED') {
      return { success: false, errorType: 'timeout', message: 'Takealot API request timed out' };
    }
    return { success: false, errorType: 'unknown', message: err.message };
  }
}

// ─── Helper: Update store status in DB ───────────────────────────────────────
async function updateStoreStatus(userId, status, error = null) {
  await pool.query(
    'UPDATE takealot_stores SET status = $1, last_error = $2, last_sync = NOW(), updated_at = NOW() WHERE user_id = $3',
    [status, error, userId]
  );
}

// ─── POST: Test Connection ────────────────────────────────────────────────────
router.post('/takealot/test', authMiddleware, async (req, res) => {
  const { api_key } = req.body;
  if (!api_key) return res.status(400).json({ error: 'API key required' });

  const result = await takealotRequest(api_key, '/offers?page_number=1&page_size=1');
  if (result.success) {
    res.json({ success: true, message: '✅ API key is valid! Your store is ready to connect.' });
  } else if (result.errorType === 'invalid_key') {
    res.status(400).json({ success: false, error: '❌ Invalid API key. Please check and try again.' });
  } else {
    res.json({ success: true, message: '⚠️ Key looks OK but Takealot API is slow. Try connecting anyway.' });
  }
});

// ─── POST: Connect (save encrypted API key) ───────────────────────────────────
router.post('/takealot/connect', authMiddleware, async (req, res) => {
  const { api_key } = req.body;
  if (!api_key) return res.status(400).json({ error: 'API key required' });

  // Validate key first
  const testResult = await takealotRequest(api_key, '/offers?page_number=1&page_size=1');
  if (testResult.errorType === 'invalid_key') {
    return res.status(400).json({ error: '❌ Invalid API key. Please check your Takealot Seller Portal and try again.' });
  }

  try {
    // Encrypt before storing
    const encryptedKey = encryptKey(api_key);

    await pool.query(`
      INSERT INTO takealot_stores (user_id, api_key_encrypted, seller_name, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (user_id) DO UPDATE SET
        api_key_encrypted = $2, seller_name = $3, status = 'active', 
        last_error = NULL, updated_at = NOW()
    `, [req.user.id, encryptedKey, 'My Takealot Store']);

    res.json({ success: true, message: 'Takealot store connected successfully!' });
  } catch (err) {
    console.error('Takealot connect error:', err.message);
    res.status(500).json({ error: 'Failed to save connection. Please try again.' });
  }
});

// ─── GET: Status ──────────────────────────────────────────────────────────────
router.get('/takealot/status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, seller_name, status, last_error, last_sync, connected_at FROM takealot_stores WHERE user_id = $1',
      [req.user.id]
    );
    if (result.rows.length > 0) {
      res.json({ connected: true, store: result.rows[0] });
    } else {
      res.json({ connected: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// ─── GET: Products ────────────────────────────────────────────────────────────
router.get('/takealot/products', authMiddleware, async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  try {
    const storeRes = await pool.query(
      'SELECT api_key_encrypted FROM takealot_stores WHERE user_id = $1',
      [req.user.id]
    );
    if (!storeRes.rows.length) return res.status(404).json({ error: 'Takealot not connected' });

    const apiKey = decryptKey(storeRes.rows[0].api_key_encrypted);
    const result = await takealotRequest(apiKey, '/offers?page_number=1&page_size=50');

    if (!result.success) {
      // Key expired or invalid — update status to warn user
      if (result.errorType === 'invalid_key') {
        await updateStoreStatus(req.user.id, 'key_expired', 'API key has expired. Please reconnect your Takealot store.');
      }
      return res.status(400).json({ error: result.message, errorType: result.errorType });
    }

    await updateStoreStatus(req.user.id, 'active');
    res.json({ products: result.data.offers || [], total: result.data.total_results || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ─── GET: Analytics ───────────────────────────────────────────────────────────
router.get('/takealot/analytics', authMiddleware, async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  try {
    const storeRes = await pool.query(
      'SELECT api_key_encrypted FROM takealot_stores WHERE user_id = $1',
      [req.user.id]
    );
    if (!storeRes.rows.length) return res.status(404).json({ error: 'Takealot not connected' });

    const apiKey = decryptKey(storeRes.rows[0].api_key_encrypted);

    // Fetch orders
    const ordersResult = await takealotRequest(apiKey, '/orders?page_number=1&page_size=100');
    if (!ordersResult.success && ordersResult.errorType === 'invalid_key') {
      await updateStoreStatus(req.user.id, 'key_expired', 'API key has expired. Please reconnect.');
      return res.status(400).json({ error: 'API key expired. Please reconnect your Takealot store.', errorType: 'key_expired' });
    }

    const orders = ordersResult.success ? (ordersResult.data.orders || []) : [];
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.selling_price || 0), 0);
    const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0;

    // Fetch offers/stock
    const offersResult = await takealotRequest(apiKey, '/offers?page_number=1&page_size=100');
    const offers = offersResult.success ? (offersResult.data.offers || []) : [];
    const totalStock = offers.reduce((sum, o) => sum + (o.stock || 0), 0);
    const lowStockItems = offers.filter(o => o.stock < 5).length;

    await updateStoreStatus(req.user.id, 'active');

    res.json({
      analytics: {
        totalOrders,
        totalRevenue: totalRevenue.toFixed(2),
        avgOrderValue,
        totalProducts: offers.length,
        totalStock,
        lowStockItems
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ─── DELETE: Disconnect ───────────────────────────────────────────────────────
router.delete('/takealot/disconnect', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM takealot_stores WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Takealot disconnected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

module.exports = router;
