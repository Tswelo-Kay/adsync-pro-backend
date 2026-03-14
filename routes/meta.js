const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const META_APP_ID = process.env.META_APP_ID || '26860661756854188';
const META_APP_SECRET = process.env.META_APP_SECRET;
const REDIRECT_URI = `${process.env.BACKEND_URL || 'https://adsync-pro-backend-production.up.railway.app'}/meta/callback`;
const GRAPH_API = 'https://graph.facebook.com/v19.0';

const SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement'
].join(',');

// ─── Middleware: verify JWT ───────────────────────────────────────────────────
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.userId = decoded.id || decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── 1. Start OAuth flow ──────────────────────────────────────────────────────
// GET /meta/auth
// Frontend calls this, we redirect the user to Facebook's OAuth dialog.
router.get('/auth', authMiddleware, (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.userId })).toString('base64');

  const authUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  authUrl.searchParams.set('client_id', META_APP_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');

  res.json({ authUrl: authUrl.toString() });
});

// ─── 2. OAuth Callback ────────────────────────────────────────────────────────
// GET /meta/callback
// Facebook redirects here after user grants permission.
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL || 'https://heroic-pastelito-b39094.netlify.app'}/integrations.html?meta=error&reason=${error}`);
  }

  if (!code || !state) {
    return res.redirect(`${process.env.FRONTEND_URL}/integrations.html?meta=error&reason=missing_params`);
  }

  let userId;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    userId = decoded.userId;
  } catch {
    return res.redirect(`${process.env.FRONTEND_URL}/integrations.html?meta=error&reason=invalid_state`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await axios.get(`${GRAPH_API}/oauth/access_token`, {
      params: {
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code
      }
    });

    const { access_token, expires_in } = tokenRes.data;

    // Exchange for a long-lived token (60 days)
    const longLivedRes = await axios.get(`${GRAPH_API}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        fb_exchange_token: access_token
      }
    });

    const longLivedToken = longLivedRes.data.access_token;
    const longLivedExpiry = longLivedRes.data.expires_in; // ~5183944 seconds (60 days)

    // Get user's Facebook name/ID
    const meRes = await axios.get(`${GRAPH_API}/me`, {
      params: { access_token: longLivedToken, fields: 'id,name' }
    });

    const { id: fbUserId, name: fbName } = meRes.data;

    // Save token to DB
    await pool.query(
      `INSERT INTO meta_connections (user_id, fb_user_id, fb_name, access_token, expires_at, connected_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' seconds')::interval, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         fb_user_id = EXCLUDED.fb_user_id,
         fb_name = EXCLUDED.fb_name,
         access_token = EXCLUDED.access_token,
         expires_at = EXCLUDED.expires_at,
         connected_at = NOW()`,
      [userId, fbUserId, fbName, longLivedToken, longLivedExpiry]
    );

    res.redirect(`${process.env.FRONTEND_URL || 'https://heroic-pastelito-b39094.netlify.app'}/integrations.html?meta=success`);
  } catch (err) {
    console.error('Meta OAuth callback error:', err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}/integrations.html?meta=error&reason=token_exchange_failed`);
  }
});

// ─── 3. Get Connection Status ─────────────────────────────────────────────────
// GET /meta/status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fb_name, connected_at, expires_at,
              expires_at > NOW() AS is_valid
       FROM meta_connections WHERE user_id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ connected: false });
    }

    const conn = result.rows[0];
    res.json({
      connected: true,
      fbName: conn.fb_name,
      connectedAt: conn.connected_at,
      expiresAt: conn.expires_at,
      isValid: conn.is_valid
    });
  } catch (err) {
    console.error('Meta status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch connection status' });
  }
});

// ─── 4. Get Ad Accounts ───────────────────────────────────────────────────────
// GET /meta/accounts
router.get('/accounts', authMiddleware, async (req, res) => {
  try {
    const token = await getToken(req.userId);
    const response = await axios.get(`${GRAPH_API}/me/adaccounts`, {
      params: {
        access_token: token,
        fields: 'id,name,account_status,currency,timezone_name,amount_spent'
      }
    });

    res.json({ accounts: response.data.data });
  } catch (err) {
    console.error('Meta accounts error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch ad accounts' });
  }
});

// ─── 5. Get Campaigns for an Ad Account ──────────────────────────────────────
// GET /meta/campaigns?accountId=act_XXXXXXX
router.get('/campaigns', authMiddleware, async (req, res) => {
  const { accountId } = req.query;
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });

  try {
    const token = await getToken(req.userId);
    const response = await axios.get(`${GRAPH_API}/${accountId}/campaigns`, {
      params: {
        access_token: token,
        fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights{spend,impressions,clicks,ctr,cpc}'
      }
    });

    res.json({ campaigns: response.data.data });
  } catch (err) {
    console.error('Meta campaigns error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// ─── 6. Get Insights (Analytics) ─────────────────────────────────────────────
// GET /meta/insights?accountId=act_XXXXXXX&datePreset=last_30d
router.get('/insights', authMiddleware, async (req, res) => {
  const { accountId, datePreset = 'last_30d' } = req.query;
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });

  try {
    const token = await getToken(req.userId);
    const response = await axios.get(`${GRAPH_API}/${accountId}/insights`, {
      params: {
        access_token: token,
        date_preset: datePreset,
        fields: 'spend,impressions,clicks,ctr,cpc,reach,frequency,actions',
        level: 'account'
      }
    });

    res.json({ insights: response.data.data });
  } catch (err) {
    console.error('Meta insights error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// ─── 7. Disconnect ────────────────────────────────────────────────────────────
// DELETE /meta/disconnect
router.delete('/disconnect', authMiddleware, async (req, res) => {
  try {
    // Optionally revoke the token on Facebook's side
    const result = await pool.query(
      'SELECT access_token FROM meta_connections WHERE user_id = $1',
      [req.userId]
    );

    if (result.rows.length > 0) {
      const token = result.rows[0].access_token;
      try {
        await axios.delete(`${GRAPH_API}/me/permissions`, {
          params: { access_token: token }
        });
      } catch {
        // Don't block disconnect if revocation fails
      }
    }

    await pool.query('DELETE FROM meta_connections WHERE user_id = $1', [req.userId]);
    res.json({ success: true, message: 'Meta account disconnected' });
  } catch (err) {
    console.error('Meta disconnect error:', err.message);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ─── Helper: get stored token ─────────────────────────────────────────────────
async function getToken(userId) {
  const result = await pool.query(
    'SELECT access_token, expires_at FROM meta_connections WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) throw new Error('No Meta connection found');

  const { access_token, expires_at } = result.rows[0];
  if (new Date(expires_at) < new Date()) throw new Error('Meta token expired');

  return access_token;
}
// Auto-create table on startup
pool.query(`
  CREATE TABLE IF NOT EXISTS meta_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    fb_user_id VARCHAR(50),
    fb_name VARCHAR(255),
    access_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ DEFAULT NOW()
  )
`).then(() => console.log('✅ meta_connections table ready'))
  .catch(err => console.error('meta_connections table error:', err));

module.exports = router;