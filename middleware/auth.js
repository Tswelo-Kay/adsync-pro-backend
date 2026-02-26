const jwt = require('jsonwebtoken');
const { User } = require('../models');

// ─── Generate Token ────────────────────────────────────────────────────────────
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // Token valid for 7 days
  );
};

// ─── Protect Routes (must be logged in) ───────────────────────────────────────
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized. Please log in.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user
    const user = await User.findByPk(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated.'
      });
    }

    // Attach user to request
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please log in again.' });
    }
    return res.status(500).json({ success: false, message: 'Server error during authentication.' });
  }
};

// ─── Restrict by Subscription Plan ────────────────────────────────────────────
const requirePlan = (...plans) => {
  return (req, res, next) => {
    if (!plans.includes(req.user.subscriptionPlan)) {
      return res.status(403).json({
        success: false,
        message: `This feature requires a ${plans.join(' or ')} plan. Please upgrade.`
      });
    }
    next();
  };
};

module.exports = { generateToken, protect, requirePlan };