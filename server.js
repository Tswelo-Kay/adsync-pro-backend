const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const { sequelize } = require('./models');
const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security & Utilities ─────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);

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

startServer();