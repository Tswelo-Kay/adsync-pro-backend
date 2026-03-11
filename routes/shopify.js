const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_SCOPES = 'read_products,read_analytics,read_orders,read_inventory';
const REDIRECT_URI = `${process.env.BACKEND_URL || 'https://adsync-pro-backend-production.up.railway.app'}/auth/shopify/callback`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://heroic-pastelito-b39094.netlify.app';

// ─── DB SETUP ────────────────────────────────────────────────────────────────
async function ensureShopifyTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopify_stores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      shop_domain VARCHAR(255) UNIQUE NOT NULL,
      access_token TEXT NOT NULL,
      shop_name VARCHAR(255),
      shop_email VARCHAR(255),
      currency VARCHAR(10),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}
ensureShopifyTable().catch(console.error);

// ─── MIDDLEWARE: verify JWT ───────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'adsyncpro_super_secret_key_2024_molefe';

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

// ─── STEP 1: Initiate OAuth ───────────────────────────────────────────────────
// GET /auth/shopify?shop=mystore.myshopify.com&token=JWT
router.get('/auth/shopify', (req, res) => {
  const { shop, token } = req.query;
  if (!shop) return res.status(400).json({ error: 'Shop domain required' });

  // Validate shop domain format
  if (!shop.match(/^[a-zA-Z0-9-]+\.myshopify\.com$/)) {
    return res.status(400).json({ error: 'Invalid shop domain format' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  // Encode user token in state so we can retrieve it in callback
  const stateData = Buffer.from(JSON.stringify({ nonce: state, token })).toString('base64');

  const authUrl = `https://${shop}/admin/oauth/authorize?` +
    `client_id=${SHOPIFY_API_KEY}&` +
    `scope=${SHOPIFY_SCOPES}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `state=${stateData}`;

  res.json({ authUrl });
});

// ─── STEP 2: OAuth Callback ───────────────────────────────────────────────────
router.get('/auth/shopify/callback', async (req, res) => {
  const { code, shop, state, hmac } = req.query;

  // Verify HMAC
  const params = Object.keys(req.query)
    .filter(k => k !== 'hmac')
    .sort()
    .map(k => `${k}=${req.query[k]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(params).digest('hex');
  if (digest !== hmac) {
    return res.redirect(`${FRONTEND_URL}/integrations.html?shopify=error&msg=invalid_hmac`);
  }

  // Decode state to get user JWT
  let userToken;
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    userToken = stateData.token;
  } catch {
    return res.redirect(`${FRONTEND_URL}/integrations.html?shopify=error&msg=invalid_state`);
  }

  // Verify user JWT
  let user;
  try {
    user = jwt.verify(userToken, JWT_SECRET);
  } catch {
    return res.redirect(`${FRONTEND_URL}/integrations.html?shopify=error&msg=invalid_token`);
  }

  // Exchange code for access token
  try {
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    });
    const accessToken = tokenRes.data.access_token;

    // Fetch shop info
    const shopRes = await axios.get(`https://${shop}/admin/api/2026-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    const shopData = shopRes.data.shop;

    // Save to DB
    await pool.query(`
      INSERT INTO shopify_stores (user_id, shop_domain, access_token, shop_name, shop_email, currency)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (shop_domain) DO UPDATE SET
        access_token = $3, shop_name = $4, shop_email = $5, currency = $6, updated_at = NOW()
    `, [user.id, shop, accessToken, shopData.name, shopData.email, shopData.currency]);

    res.redirect(`${FRONTEND_URL}/integrations.html?shopify=success&shop=${shop}`);
  } catch (err) {
    console.error('Shopify OAuth error:', err.message);
    res.redirect(`${FRONTEND_URL}/integrations.html?shopify=error&msg=oauth_failed`);
  }
});

// ─── GET: Connected stores ────────────────────────────────────────────────────
router.get('/shopify/stores', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, shop_domain, shop_name, shop_email, currency, created_at FROM shopify_stores WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ stores: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stores' });
  }
});

// ─── GET: Products ────────────────────────────────────────────────────────────
router.get('/shopify/products', authMiddleware, async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Shop domain required' });

  try {
    const storeRes = await pool.query(
      'SELECT access_token FROM shopify_stores WHERE user_id = $1 AND shop_domain = $2',
      [req.user.id, shop]
    );
    if (!storeRes.rows.length) return res.status(404).json({ error: 'Store not found' });

    const { access_token } = storeRes.rows[0];
    const productsRes = await axios.get(`https://${shop}/admin/api/2026-01/products.json?limit=50`, {
      headers: { 'X-Shopify-Access-Token': access_token }
    });

    res.json({ products: productsRes.data.products });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ─── GET: Orders / Analytics ──────────────────────────────────────────────────
router.get('/shopify/analytics', authMiddleware, async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Shop domain required' });

  try {
    const storeRes = await pool.query(
      'SELECT access_token FROM shopify_stores WHERE user_id = $1 AND shop_domain = $2',
      [req.user.id, shop]
    );
    if (!storeRes.rows.length) return res.status(404).json({ error: 'Store not found' });

    const { access_token } = storeRes.rows[0];

    // Fetch last 30 days orders
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ordersRes = await axios.get(
      `https://${shop}/admin/api/2026-01/orders.json?status=any&created_at_min=${since}&limit=250`,
      { headers: { 'X-Shopify-Access-Token': access_token } }
    );

    const orders = ordersRes.data.orders;
    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0;

    res.json({
      analytics: {
        totalRevenue: totalRevenue.toFixed(2),
        totalOrders,
        avgOrderValue,
        period: '30 days',
        orders: orders.slice(0, 10) // return last 10 for display
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ─── DELETE: Disconnect store ─────────────────────────────────────────────────
router.delete('/shopify/stores/:shop', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM shopify_stores WHERE user_id = $1 AND shop_domain = $2',
      [req.user.id, req.params.shop]
    );
    res.json({ message: 'Store disconnected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disconnect store' });
  }
});

module.exports = router;
