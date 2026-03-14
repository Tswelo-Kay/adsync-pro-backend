const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const { sequelize } = require('./models');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const uploadRoutes = require('./routes/upload');
const subscriptionRoutes = require('./routes/subscriptions');
const shopifyRoutes = require('./routes/shopify');
const takealotRoutes = require('./routes/takealot');
const errorHandler = require('./middleware/errorHandler');
require('./utils/emailService');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security & Utilities ─────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10kb' }));

// Rate limiting - max 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests. Please wait 15 minutes.' }
});

// Stricter limit for login/register - max 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes.' }
});

app.use('/api/', limiter);
app.use('/api/auth', authLimiter);
// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/', shopifyRoutes);
app.use('/', takealotRoutes);
const metaRoutes = require('./routes/meta');
app.use('/meta', metaRoutes);
const buyBoxRoutes = require('./routes/buybox');
app.use('/buybox', buyBoxRoutes);
// Buy Box tables
pool.query(`
  CREATE TABLE IF NOT EXISTS buy_box_status (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    product_name VARCHAR(255),
    our_price DECIMAL(10,2),
    winning_price DECIMAL(10,2),
    price_gap DECIMAL(10,2),
    competitor_count INTEGER DEFAULT 0,
    is_winning BOOLEAN DEFAULT false,
    last_checked TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS buy_box_actions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    product_name VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    trigger_reason TEXT,
    our_price DECIMAL(10,2),
    winning_price DECIMAL(10,2),
    estimated_saving DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`).then(() => console.log('✅ Buy Box tables ready'))
  .catch(err => console.error('Buy Box tables error:', err));
app.use('/uploads', express.static('uploads'));

// ─── Home Route (just to confirm server is running) ───────────
app.get('/', (req, res) => {
  res.json({ message: '🚀 AdSync Pro API is running!' });
});

// ─── Start Server ─────────────────────────────────────────────
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected!');

    await sequelize.sync({ alter: true });
    console.log('✅ Database tables ready!');

    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};
app.use(errorHandler);
startServer();
// ─── Buy Box Guard - runs every 15 minutes ───────────────────
const { runBuyBoxGuard } = require('./services/buyBoxService');
setInterval(() => {
  runBuyBoxGuard();
}, 15 * 60 * 1000); // 15 minutes

// Run once on startup too
runBuyBoxGuard();