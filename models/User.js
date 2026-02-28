const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  businessName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  resetPasswordToken: {
  type: DataTypes.STRING,
  allowNull: true
},
resetPasswordExpires: {
  type: DataTypes.DATE,
  allowNull: true
},
  subscriptionPlan: {
    type: DataTypes.ENUM('free', 'starter', 'growth', 'enterprise'),
    defaultValue: 'free'
  },
  subscriptionStatus: {
    type: DataTypes.ENUM('active', 'inactive', 'cancelled', 'past_due'),
    defaultValue: 'inactive'
  },
  stripeCustomerId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  stripeSubscriptionId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    }
  }
});

// Instance method to check password
User.prototype.validatePassword = async function(plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

// Instance method to return safe user object (no password)
User.prototype.toSafeObject = function() {
  const { password, ...safeUser } = this.toJSON();
  return safeUser;
};
// Compare entered password with stored hashed password
User.prototype.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Return user object without password
User.prototype.toSafeObject = function() {
  return {
    id: this.id,
    firstName: this.firstName,
    lastName: this.lastName,
    email: this.email,
    businessName: this.businessName,
    phone: this.phone,
    subscriptionPlan: this.subscriptionPlan,
    createdAt: this.createdAt
  };
};

module.exports = User;