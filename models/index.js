const { sequelize } = require('../config/database');
const User = require('./User');
const Campaign = require('./Campaign');
const FlashAd = require('./FlashAd');

User.hasMany(Campaign, { foreignKey: 'userId', as: 'campaigns' });
Campaign.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(FlashAd, { foreignKey: 'userId', as: 'flashAds' });
FlashAd.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Campaign.hasMany(FlashAd, { foreignKey: 'campaignId', as: 'flashAds' });
FlashAd.belongsTo(Campaign, { foreignKey: 'campaignId', as: 'campaign' });

module.exports = { sequelize, User, Campaign, FlashAd };