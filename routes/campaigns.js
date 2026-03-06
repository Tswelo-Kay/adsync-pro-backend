const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { Campaign } = require('../models');
const { protect } = require('../middleware/auth');

// All campaign routes require login
router.use(protect);

// ─── CREATE A CAMPAIGN ────────────────────────────────────────
// POST /api/campaigns
router.post('/', [
  body('name').notEmpty().withMessage('Campaign name is required'),
  body('mediaType').isIn(['image', 'video', 'text']).withMessage('Media type must be image, video, or text'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

     // 🔒 Check campaign limits based on plan
    const user = await req.user.reload();
    const plan = user.subscriptionPlan || 'free';
    const planLimits = { free: 3, pro: 12, business: 999999 };
    const limit = planLimits[plan];

    const campaignCount = await Campaign.count({
      where: { userId: req.user.id }
    });

    if (campaignCount >= limit) {
      return res.status(403).json({
        success: false,
        limitReached: true,
        message: `You've reached your ${plan} plan limit of ${limit} campaigns. Please upgrade to create more!`,
        currentPlan: plan,
        campaignCount,
        limit
      });
    }
    const {
      name, description, mediaType, mediaUrl, adCopyText,
      websiteUrl, whatsappNumber, whatsappMessage,
      shopifyUrl, takealotUrl, amazonUrl,
      targetCountries, targetCities, targetAgeMin, targetAgeMax, targetGender,
      platforms, startDate, endDate, timezone, frequency, scheduledTimes,
      budgetTotal, budgetCurrency
    } = req.body;

    const campaign = await Campaign.create({
      userId: req.user.id,
      name,
      description,
      mediaType,
      mediaUrl,
      adCopyText,
      websiteUrl,
      whatsappNumber,
      whatsappMessage,
      shopifyUrl,
      takealotUrl,
      amazonUrl,
      targetCountries: targetCountries || ['ZA'],
      targetCities: targetCities || [],
      targetAgeMin: targetAgeMin || 18,
      targetAgeMax: targetAgeMax || 65,
      targetGender: targetGender || 'all',
      platforms: platforms || [],
      startDate,
      endDate,
      timezone: timezone || 'Africa/Johannesburg',
      frequency: frequency || 'daily',
      scheduledTimes: scheduledTimes || ['09:00'],
      budgetTotal,
      budgetCurrency: budgetCurrency || 'ZAR',
      status: 'draft'
    });

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully!',
      campaign
    });

  } catch (error) {
    console.error('Create campaign error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── GET ALL MY CAMPAIGNS ─────────────────────────────────────
// GET /api/campaigns
router.get('/', async (req, res) => {
  try {
    const campaigns = await Campaign.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      count: campaigns.length,
      campaigns
    });

  } catch (error) {
    console.error('Get campaigns error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── GET ONE CAMPAIGN ─────────────────────────────────────────
// GET /api/campaigns/:id
router.get('/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }

    return res.status(200).json({ success: true, campaign });

  } catch (error) {
    console.error('Get campaign error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── UPDATE A CAMPAIGN ────────────────────────────────────────
// PUT /api/campaigns/:id
router.put('/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }

    await campaign.update(req.body);

    return res.status(200).json({
      success: true,
      message: 'Campaign updated!',
      campaign
    });

  } catch (error) {
    console.error('Update campaign error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── DELETE A CAMPAIGN ────────────────────────────────────────
// DELETE /api/campaigns/:id
router.delete('/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }

    await campaign.destroy();

    return res.status(200).json({ success: true, message: 'Campaign deleted.' });

  } catch (error) {
    console.error('Delete campaign error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── CHANGE CAMPAIGN STATUS ───────────────────────────────────
// PATCH /api/campaigns/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'active', 'paused', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const campaign = await Campaign.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found.' });
    }

    await campaign.update({ status });

    return res.status(200).json({
      success: true,
      message: `Campaign is now ${status}!`,
      campaign
    });

  } catch (error) {
    console.error('Status update error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;
