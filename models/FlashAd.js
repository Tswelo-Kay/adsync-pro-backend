const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FlashAd = sequelize.define('FlashAd', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  // —— Ownership
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  campaignId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'campaigns',
      key: 'id'
    }
  },

  // —— Basic Info
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  discountPercent: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'active', 'expired', 'cancelled'),
    defaultValue: 'scheduled'
  },

  // —— Product link
  productId: {
    type: DataTypes.STRING,
    allowNull: true // links to Shopify/Takealot product ID
  },

  // —— Scheduling
  startTime: {
    type: DataTypes.DATE,
    allowNull: false
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: false
  }

}, {
  tableName: 'flash_ads',
  timestamps: true
});

module.exports = FlashAd;