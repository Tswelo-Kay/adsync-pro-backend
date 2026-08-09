const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');

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
    
    await sequelize.query(`
  CREATE TABLE IF NOT EXISTS google_ads_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    access_token TEXT,
    refresh_token TEXT,
    connected_at TIMESTAMP DEFAULT NOW()
  )
`);

await sequelize.query(
  `INSERT INTO google_ads_connections (access_token, refresh_token)
   VALUES (:accessToken, :refreshToken) ON CONFLICT DO NOTHING`,
  { replacements: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token } }
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
   const [rows] = await sequelize.query(
  'SELECT * FROM google_ads_connections ORDER BY connected_at DESC LIMIT 1'
);

if (rows.length === 0) {
  return res.status(401).json({ error: 'Google Ads not connected' });
} 

    const { access_token } = rows[0];

    // Get customer ID
    const customerRes = await fetch(
      'https://googleads.googleapis.com/v24/customers:listAccessibleCustomers',
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

// —— CREATE CAMPAIGN (real Google Ads API)
router.post('/campaigns/create', async (req, res) => {
  const { campaignName, budget } = req.body;
  try {
    const [rows] = await sequelize.query(
      'SELECT * FROM google_ads_connections ORDER BY connected_at DESC LIMIT 1'
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Google Ads not connected' });
    }

    const { access_token } = rows[0];

    // Get the customer ID
    const customerRes = await fetch(
      'https://googleads.googleapis.com/v24/customers:listAccessibleCustomers',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'developer-token': DEVELOPER_TOKEN
        }
      }
    );
    const customerData = await customerRes.json();
    if (!customerData.resourceNames || customerData.resourceNames.length === 0) {
      return res.status(400).json({ error: 'No accessible Google Ads customer found' });
    }
    const customerId = customerData.resourceNames[0].split('/')[1];

    // Step 1: Create the campaign budget
    const budgetMicros = Math.round(parseFloat(budget) * 1000000);
    const budgetRes = await fetch(
      `https://googleads.googleapis.com/v24/customers/${customerId}/campaignBudgets:mutate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'developer-token': DEVELOPER_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          operations: [{
            create: {
              name: `${campaignName} Budget ${Date.now()}`,
              amountMicros: budgetMicros,
              deliveryMethod: 'STANDARD'
            }
          }]
        })
      }
    );
    const budgetData = await budgetRes.json();
    if (budgetData.error) {
      console.error('Budget creation error:', JSON.stringify(budgetData.error));
      return res.status(400).json({ error: 'Failed to create campaign budget', details: budgetData.error });
    }
    const budgetResourceName = budgetData.results[0].resourceName;

    // Step 2: Create the campaign itself (PAUSED for safety)
    const campaignRes = await fetch(
      `https://googleads.googleapis.com/v24/customers/${customerId}/campaigns:mutate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'developer-token': DEVELOPER_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          operations: [{
            create: {
              name: campaignName,
              advertisingChannelType: 'SEARCH',
              status: 'PAUSED',
              campaignBudget: budgetResourceName,
              manualCpc: {},
              networkSettings: {
                targetGoogleSearch: true,
                targetSearchNetwork: true,
                targetContentNetwork: false,
                targetPartnerSearchNetwork: false
              }
            }
          }]
        })
      }
    );
    const campaignData = await campaignRes.json();
    if (campaignData.error) {
      console.error('Campaign creation error:', JSON.stringify(campaignData.error));
      return res.status(400).json({ error: 'Failed to create campaign', details: campaignData.error });
    }

    // Save a local record too, for our own dashboard display
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS google_ads_campaigns (
        id SERIAL PRIMARY KEY,
        campaign_name TEXT,
        budget DECIMAL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const [result] = await sequelize.query(
      `INSERT INTO google_ads_campaigns (campaign_name, budget, status)
       VALUES (:campaignName, :budget, 'paused') RETURNING *`,
      { replacements: { campaignName, budget } }
    );

    res.json({ success: true, campaign: result[0], googleCampaign: campaignData.results[0] });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

//─── GET STATUS ──────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
   const [result] = await sequelize.query(
  'SELECT id, connected_at FROM google_ads_connections ORDER BY connected_at DESC LIMIT 1'
);
res.json({
  connected: result.length > 0,
  connectedAt: result[0]?.connected_at || null
}); 
  } catch (error) {
    res.json({ connected: false });
  }
});

module.exports = router;
