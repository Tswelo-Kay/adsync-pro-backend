const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Campaign = sequelize.define('Campaign', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // ─── Ownership ───────────────────────────────────────────────
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },

  // ─── Basic Info ───────────────────────────────────────────────
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'paused', 'completed', 'cancelled'),
    defaultValue: 'draft'
  },

  // ─── Media ────────────────────────────────────────────────────
  mediaType: {
    type: DataTypes.ENUM('image', 'video', 'text'),
    allowNull: false,
    defaultValue: 'image'
  },
  mediaUrl: {
    type: DataTypes.STRING,
    allowNull: true // URL to uploaded image or video
  },
  adCopyText: {
    type: DataTypes.TEXT,
    allowNull: true // The actual ad text/caption
  },

  // ─── Links ────────────────────────────────────────────────────
  websiteUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: { isUrl: true }
  },
  whatsappNumber: {
    type: DataTypes.STRING,
    allowNull: true // e.g. +27821234567
  },
  whatsappMessage: {
    type: DataTypes.STRING,
    allowNull: true // Pre-filled WhatsApp message
  },
  shopifyUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: { isUrl: true }
  },
  takealotUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: { isUrl: true }
  },
  amazonUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: { isUrl: true }
  },

  // ─── Targeting ────────────────────────────────────────────────
  targetCountries: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['ZA'], // Default: South Africa
    allowNull: false
  },
  targetCities: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  targetAgeMin: {
    type: DataTypes.INTEGER,
    defaultValue: 18
  },
  targetAgeMax: {
    type: DataTypes.INTEGER,
    defaultValue: 65
  },
  targetGender: {
    type: DataTypes.ENUM('all', 'male', 'female'),
    defaultValue: 'all'
  },

  // ─── Platforms ────────────────────────────────────────────────
  platforms: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    // e.g. ['facebook', 'instagram', 'twitter', 'tiktok', 'linkedin']
  },

  // ─── Scheduling ───────────────────────────────────────────────
  startDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  timezone: {
    type: DataTypes.STRING,
    defaultValue: 'Africa/Johannesburg'
  },
  frequency: {
    type: DataTypes.ENUM('once', 'daily', 'weekly', 'monthly'),
    defaultValue: 'daily'
  },
  scheduledTimes: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: ['09:00'],
    // e.g. ['09:00', '13:00', '18:00'] - times to post each day
  },

  // ─── Budget ───────────────────────────────────────────────────
  budgetTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  budgetCurrency: {
    type: DataTypes.STRING,
    defaultValue: 'ZAR'
  },

  // ─── Stats (updated over time) ────────────────────────────────
  impressions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  clicks: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  conversions: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }

}, {
  tableName: 'campaigns',
  timestamps: true
});

module.exports = Campaign;
