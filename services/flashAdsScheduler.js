const { FlashAd } = require('../models'); // adjust if needed
const { Op } = require('sequelize');

const runFlashAdsCheck = async () => {
  try {
    const now = new Date();

    // Activate flash ads whose start time has arrived
    await FlashAd.update(
      { status: 'active' },
      { where: { status: 'scheduled', startTime: { [Op.lte]: now } } }
    );

    // Deactivate flash ads whose end time has passed
    await FlashAd.update(
      { status: 'expired' },
      { where: { status: 'active', endTime: { [Op.lte]: now } } }
    );

    console.log('⚡ Flash Ads check complete:', now.toISOString());
  } catch (error) {
    console.error('❌ Flash Ads scheduler error:', error);
  }
};

const startFlashAdsScheduler = () => {
  setInterval(runFlashAdsCheck, 60 * 1000); // every 60 seconds
  runFlashAdsCheck(); // run once on startup too
  console.log('✅ Flash Ads scheduler started');
};

module.exports = { startFlashAdsScheduler };