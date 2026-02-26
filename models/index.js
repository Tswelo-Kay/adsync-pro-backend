'use strict';

const { sequelize } = require('../config/database');
const User = require('./User');

// Future models will be imported here as we build them:
// const Campaign = require('./Campaign');
// const Subscription = require('./Subscription');
// const Integration = require('./Integration');

// Define associations here as models grow
// Example (for later):
// User.hasMany(Campaign, { foreignKey: 'userId', as: 'campaigns' });
// Campaign.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  sequelize,
  User
};