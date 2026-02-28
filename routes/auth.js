const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { generateToken, protect } = require('../middleware/auth');

// ─── REGISTER ─────────────────────────────────────────────────────────────────
// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('businessName').notEmpty().withMessage('Business name is required')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, firstName, lastName, businessName, phone } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.'
      });
    }

    // Create user (password is hashed automatically via model hook)
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      businessName,
      phone: phone || null,
      subscriptionPlan: 'free',
      subscriptionStatus: 'active'
    });

    // Generate token
    const token = generateToken(user.id);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: user.toSafeObject()
    });

  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Check password
    const isValid = await user.validatePassword(password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Update last login
    await user.update({ lastLogin: new Date() });

    // Generate token
    const token = generateToken(user.id);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully!',
      token,
      user: user.toSafeObject()
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.'
    });
  }
});

// ─── GET CURRENT USER ─────────────────────────────────────────────────────────
// GET /api/auth/me (requires login)
router.get('/me', protect, async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user.toSafeObject()
  });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
// POST /api/auth/logout (client just deletes token, but we confirm here)
router.post('/logout', protect, async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
});
// UPDATE PROFILE
// PUT /api/auth/me
router.put('/me', protect, async (req, res) => {
  try {
    const { firstName, lastName, businessName, phone } = req.body;
    const user = req.user;
    if (firstName) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (businessName !== undefined) user.businessName = businessName;
    if (phone !== undefined) user.phone = phone;
    await user.save();
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: user.toSafeObject()
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// CHANGE PASSWORD
// PUT /api/auth/change-password
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide both passwords.' });
    }
    const bcrypt = require('bcryptjs');
    const { User } = require('../models');
    const user = await User.findByPk(req.user.id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await User.update({ password: hashed }, { where: { id: req.user.id }, individualHooks: false });
    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
