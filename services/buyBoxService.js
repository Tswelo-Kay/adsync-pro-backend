const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

const TAKEALOT_API = 'https://seller-api.takealot.com/v2';

// ─── Main Guard Function ──────────────────────────────────────
// Runs every 15 minutes for all users
async function runBuyBoxGuard() {
  console.log('🛡️ Buy Box Guard running...', new Date().toISOString());

  try {
    // Get all users with Takealot connected
    const users = await pool.query(`
      SELECT u.id, t.api_key_encrypted 
      FROM users u
      JOIN takealot_connections t ON t.user_id = u.id
      WHERE t.api_key_encrypted IS NOT NULL
    `);

    for (const user of users.rows) {
      try {
        await checkUserBuyBox(user);
      } catch (err) {
        console.error(`Buy Box check failed for user ${user.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Buy Box Guard error:', err.message);
  }
}

// ─── Check a single user's products ──────────────────────────
async function checkUserBuyBox(user) {
  const { decryptApiKey } = require('./encryptionService');
  const apiKey = decryptApiKey(user.api_key_encrypted);

  // Get their offers from Takealot
  const offersRes = await axios.get(`${TAKEALOT_API}/offers`, {
    headers: { Authorization: apiKey },
    params: { page_size: 100, status: 'BUYABLE' }
  });

  const offers = offersRes.data?.offers || [];

  for (const offer of offers) {
    await checkOfferBuyBox(user.id, offer, apiKey);
  }
}

// ─── Check a single offer's Buy Box status ────────────────────
async function checkOfferBuyBox(userId, offer, apiKey) {
  const ourPrice = offer.selling_price;
  const productId = offer.tsin || offer.offer_id;
  const productName = offer.product?.title || offer.display_name || 'Unknown Product';

  // Get all offers for this product (competitors)
  let competitorOffers = [];
  try {
    const productRes = await axios.get(`${TAKEALOT_API}/offers`, {
      headers: { Authorization: apiKey },
      params: { tsin: productId, page_size: 20 }
    });
    competitorOffers = productRes.data?.offers || [];
  } catch {
    // If we can't get competitors, use just our price
    competitorOffers = [{ selling_price: ourPrice }];
  }

  // Find lowest competitor price
  const allPrices = competitorOffers.map(o => o.selling_price).filter(Boolean);
  const winningPrice = allPrices.length > 0 ? Math.min(...allPrices) : ourPrice;
  const priceGap = ourPrice - winningPrice;
  const isWinning = priceGap <= 0;
  const competitorCount = competitorOffers.length - 1;

  // Save status to DB
  await pool.query(`
    INSERT INTO buy_box_status 
      (user_id, product_id, product_name, our_price, winning_price, price_gap, competitor_count, is_winning, last_checked)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (user_id, product_id) DO UPDATE SET
      product_name = EXCLUDED.product_name,
      our_price = EXCLUDED.our_price,
      winning_price = EXCLUDED.winning_price,
      price_gap = EXCLUDED.price_gap,
      competitor_count = EXCLUDED.competitor_count,
      is_winning = EXCLUDED.is_winning,
      last_checked = NOW()
  `, [userId, productId, productName, ourPrice, winningPrice, priceGap, competitorCount, isWinning]);

  // Log the action taken
  const action = isWinning ? 'WINNING' : 'LOSING';
  const estimatedSaving = isWinning ? 0 : (ourPrice - winningPrice) * 0.1; // estimated

  await pool.query(`
    INSERT INTO buy_box_actions 
      (user_id, product_id, product_name, action, trigger_reason, our_price, winning_price, estimated_saving)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    userId, productId, productName, action,
    isWinning ? 'Price competitive' : `Losing by R${priceGap.toFixed(2)}`,
    ourPrice, winningPrice, estimatedSaving
  ]);

  console.log(` ${isWinning ? '✅' : '❌'} ${productName}: ${isWinning ? 'WINNING' : `LOSING by R${priceGap.toFixed(2)}`}`);
}

// ─── Get Buy Box summary for dashboard ───────────────────────
async function getBuyBoxSummary(userId) {
  const status = await pool.query(`
    SELECT 
      COUNT(*) as total_monitored,
      SUM(CASE WHEN is_winning THEN 1 ELSE 0 END) as winning,
      SUM(CASE WHEN NOT is_winning THEN 1 ELSE 0 END) as losing,
      COALESCE(SUM(CASE WHEN NOT is_winning THEN price_gap * 0.1 ELSE 0 END), 0) as potential_wasted_daily
    FROM buy_box_status
    WHERE user_id = $1
  `, [userId]);

  const savings = await pool.query(`
    SELECT COALESCE(SUM(estimated_saving), 0) as total_saved
    FROM buy_box_actions
    WHERE user_id = $1 
    AND created_at > NOW() - INTERVAL '30 days'
    AND action = 'WINNING'
  `, [userId]);

  const products = await pool.query(`
    SELECT * FROM buy_box_status
    WHERE user_id = $1
    ORDER BY is_winning ASC, price_gap DESC
  `, [userId]);

  return {
    summary: status.rows[0],
    totalSaved30d: savings.rows[0].total_saved,
    products: products.rows
  };
}

module.exports = { runBuyBoxGuard, getBuyBoxSummary };