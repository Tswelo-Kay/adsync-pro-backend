const { sequelize } = require('../config/database');
const User = require('./User');
const Campaign = require('./Campaign');

User.hasMany(Campaign, { foreignKey: 'userId', as: 'campaigns' });
Campaign.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = { sequelize, User, Campaign };