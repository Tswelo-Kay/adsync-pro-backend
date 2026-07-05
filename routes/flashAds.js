const express = require('express');
const router = express.Router();
const { FlashAd } = require('../models'); // adjust if your model file/name differs

// Create a new flash ad
router.post('/', async (req, res) => {
  try {
    const { title, discountPercent, startTime, endTime, productId, userId } = req.body;
    const flashAd = await FlashAd.create({
      title,
      discountPercent,
      startTime,
      endTime,
      productId,
      userId,
      status: 'scheduled'
    });
    res.status(201).json({ success: true, flashAd });
  } catch (error) {
    console.error('Error creating flash ad:', error);
    res.status(500).json({ success: false, message: 'Failed to create flash ad' });
  }
});

// Get all flash ads for a user
router.get('/', async (req, res) => {
  try {
    const flashAds = await FlashAd.findAll();
    res.json({ success: true, flashAds });
  } catch (error) {
    console.error('Error fetching flash ads:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch flash ads' });
  }
});

// Delete a flash ad
router.delete('/:id', async (req, res) => {
  try {
    await FlashAd.destroy({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Flash ad deleted' });
  } catch (error) {
    console.error('Error deleting flash ad:', error);
    res.status(500).json({ success: false, message: 'Failed to delete flash ad' });
  }
});

module.exports = router;
