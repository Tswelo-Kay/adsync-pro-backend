const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { sequelize } = require('./models');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const uploadRoutes = require('./routes/upload');
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
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};
app.use(errorHandler);
startServer();