const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Auto-create tables on startup ───────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS product_recommendations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    platform VARCHAR(20) NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    product_name VARCHAR(255),
    score INTEGER DEFAULT 0,
    recommendation TEXT,
    action VARCHAR(50),
    reason TEXT,
    suggested_budget DECIMAL(10,2),
    urgency VARCHAR(20) DEFAULT 'MEDIUM',
    was_accepted BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`).then(() => console.log('✅ product_recommendations table ready'))
  .catch(err => console.error('product_recommendations table error:', err));

// ─── Main function: generate recommendations for a user ──────
async function generateRecommendations(userId) {
  const recommendations = [];

  // Get Takealot products
  const takealotProducts = await getTakealotProducts(userId);
  
  // Get Shopify products
  const shopifyProducts = await getShopifyProducts(userId);

  const allProducts = [...takealotProducts, ...shopifyProducts];

  if (allProducts.length === 0) {
    return { recommendations: [], message: 'No products found. Connect a store first.' };
  }

  // Score each product
  for (const product of allProducts) {
    const score = calculateScore(product);
    const action = determineAction(product, score);
    const urgency = score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW';

    recommendations.push({
      platform: product.platform,
      product_id: product.id,
      product_name: product.name,
      score,
      action,
      urgency,
      reason: generateReason(product, score),
      suggested_budget: suggestBudget(score)
    });
  }

  // Sort by score descending, take top 5
  const top5 = recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Save to DB
  await saveRecommendations(userId, top5);

  return { recommendations: top5, total_products_analysed: allProducts.length };
}

// ─── Get Takealot products for a user ────────────────────────
async function getTakealotProducts(userId) {
  try {
    // Check if user has Takealot connected
    const store = await pool.query(
      'SELECT * FROM takealot_stores WHERE CAST(user_id AS TEXT) = CAST($1 AS TEXT)',
      [userId]
    );
    if (store.rows.length === 0) return [];

    // Get buy box status for scoring
    const buyBoxData = await pool.query(
      'SELECT * FROM buy_box_status WHERE user_id = $1',
      [userId]
    );

    return buyBoxData.rows.map(item => ({
      id: item.product_id,
      name: item.product_name,
      platform: 'takealot',
      our_price: item.our_price,
      winning_price: item.winning_price,
      price_gap: item.price_gap,
      is_winning: item.is_winning,
      competitor_count: item.competitor_count
    }));
  } catch (err) {
    console.error('Error getting Takealot products:', err.message);
    return [];
  }
}

// ─── Get Shopify products for a user ─────────────────────────
async function getShopifyProducts(userId) {
  try {
    const store = await pool.query(
      'SELECT * FROM shopify_stores WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (store.rows.length === 0) return [];

    // For now return placeholder — will expand when Shopify product sync is built
    return [];
  } catch (err) {
    console.error('Error getting Shopify products:', err.message);
    return [];
  }
}

// ─── Score a product (0-100) ──────────────────────────────────
function calculateScore(product) {
  let score = 50; // Base score

  if (product.platform === 'takealot') {
    // Winning Buy Box = big boost
    if (product.is_winning) score += 30;
    else score -= 10;

    // No competitors = even bigger boost
    if (product.competitor_count === 0) score += 20;
    else if (product.competitor_count <= 2) score += 10;
    else if (product.competitor_count > 5) score -= 10;

    // Small price gap = competitive
    if (product.price_gap <= 5) score += 10;
    else if (product.price_gap > 20) score -= 15;
  }

  if (product.platform === 'shopify') {
    score += 20; // Shopify sellers own their store = always worth advertising
  }

  return Math.min(100, Math.max(0, score));
}

// ─── Determine best action ────────────────────────────────────
function determineAction(product, score) {
  if (product.platform === 'takealot') {
    if (!product.is_winning && product.price_gap > 20) return 'REPRICE_OR_PAUSE';
    if (product.is_winning && product.competitor_count === 0) return 'ADVERTISE_AGGRESSIVELY';
    if (product.is_winning) return 'ADVERTISE';
    return 'REPRICE_FIRST';
  }
  if (score >= 70) return 'INCREASE_BUDGET';
  return 'MAINTAIN';
}

// ─── Generate human-readable reason ──────────────────────────
function generateReason(product, score) {
  const reasons = [];

  if (product.platform === 'takealot') {
    if (product.is_winning) reasons.push('You are winning the Buy Box');
    else reasons.push(`Losing Buy Box by R${(product.price_gap || 0).toFixed(2)}`);

    if (product.competitor_count === 0) reasons.push('No competitors on this product');
    else reasons.push(`${product.competitor_count} competitor(s)`);
  }

  if (product.platform === 'shopify') {
    reasons.push('Direct store link — you own every sale');
  }

  return reasons.join('. ');
}

// ─── Suggest daily budget in Rands ───────────────────────────
function suggestBudget(score) {
  if (score >= 80) return 150;
  if (score >= 60) return 80;
  return 40;
}

// ─── Save recommendations to DB ──────────────────────────────
async function saveRecommendations(userId, recommendations) {
  for (const rec of recommendations) {
    await pool.query(`
      INSERT INTO product_recommendations 
        (user_id, platform, product_id, product_name, score, action, reason, suggested_budget, urgency)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      userId, rec.platform, rec.product_id, rec.product_name,
      rec.score, rec.action, rec.reason, rec.suggested_budget, rec.urgency
    ]);
  }
}

// ─── Get saved recommendations for a user ────────────────────
async function getRecommendations(userId) {
  const result = await pool.query(`
    SELECT * FROM product_recommendations
    WHERE user_id = $1
    AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY score DESC
    LIMIT 5
  `, [userId]);

  return result.rows;
}

module.exports = { generateRecommendations, getRecommendations };