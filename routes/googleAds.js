const express = require('express');
const router = express.Router();

// Google Ads OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://adsync-pro-backend-production.up.railway.app/api/google-ads/callback';
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

// ─── OAUTH CONNECT ───────────────────────────────────────────
router.get('/connect', (req, res) => {
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent('https://www.googleapis.com/auth/adwords')}&` +
    `access_type=offline&prompt=consent`;
  res.json({ authUrl });
});

// ─── OAUTH CALLBACK ───────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'No authorization code received' });

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await response.json();
    if (tokens.error) return res.status(400).json({ error: tokens.error });

    // Store tokens in DB
    const db = req.app.locals.db;
    await db.query(`
      CREATE TABLE IF NOT EXISTS google_ads_connections (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        access_token TEXT,
        refresh_token TEXT,
        connected_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.query(
      `INSERT INTO google_ads_connections (access_token, refresh_token) 
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [tokens.access_token, tokens.refresh_token]
    );

    res.redirect('https://adsyncpro.com/integrations.html?google=connected');
  } catch (error) {
    console.error('Google Ads callback error:', error);
    res.status(500).json({ error: 'OAuth failed' });
  }
});

// ─── GET CAMPAIGNS ───────────────────────────────────────────
router.get('/campaigns', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const connection = await db.query(
      'SELECT * FROM google_ads_connections ORDER BY connected_at DESC LIMIT 1'
    );

    if (connection.rows.length === 0) {
      return res.status(401).json({ error: 'Google Ads not connected' });
    }

    const { access_token } = connection.rows[0];

    // Get customer ID
    const customerRes = await fetch(
      'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'developer-token': DEVELOPER_TOKEN
        }
      }
    );

    const customerData = await customerRes.json();
    res.json({ success: true, customers: customerData });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// ─── CREATE CAMPAIGN ─────────────────────────────────────────
router.post('/campaigns/create', async (req, res) => {
  const { campaignName, budget, platforms } = req.body;
  try {
    const db = req.app.locals.db;
    const connection = await db.query(
      'SELECT * FROM google_ads_connections ORDER BY connected_at DESC LIMIT 1'
    );

    if (connection.rows.length === 0) {
      return res.status(401).json({ error: 'Google Ads not connected' });
    }

    // Store campaign in DB for now (full API integration after Basic access approval)
    await db.query(`
      CREATE TABLE IF NOT EXISTS google_ads_campaigns (
        id SERIAL PRIMARY KEY,
        campaign_name TEXT,
        budget DECIMAL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const result = await db.query(
      `INSERT INTO google_ads_campaigns (campaign_name, budget) 
       VALUES ($1, $2) RETURNING *`,
      [campaignName, budget]
    );

    res.json({ success: true, campaign: result.rows[0] });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// ─── GET STATUS ──────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const result = await db.query(
      'SELECT id, connected_at FROM google_ads_connections ORDER BY connected_at DESC LIMIT 1'
    );
    res.json({
      connected: result.rows.length > 0,
      connectedAt: result.rows[0]?.connected_at || null
    });
  } catch (error) {
    res.json({ connected: false });
  }
});

module.exports = router;
