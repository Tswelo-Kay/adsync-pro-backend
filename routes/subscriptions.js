const express = require('express');
const router = express.Router();
const https = require('https');
const { protect: authenticateToken } = require('../middleware/auth');
const { User } = require('../models');

const PLANS = {
  free: { name: 'Free', campaigns: 3, price: 0 },
  pro: { name: 'Pro', campaigns: 12, price: 29 },
  business: { name: 'Business', campaigns: 999999, price: 99 }
};

// Initialize Paystack payment
router.post('/initialize', authenticateToken, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!PLANS[plan] || plan === 'free') {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    const amount = PLANS[plan].price * 100; // Paystack uses kobo/cents

    const params = JSON.stringify({
      email: user.email,
      amount: amount,
      currency: 'USD',
      metadata: {
        user_id: user.id,
        plan: plan
      },
      callback_url: 'http://localhost:3000/pricing.html?payment=success'
    });

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: '/transaction/initialize',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const paystackReq = https.request(options, (paystackRes) => {
      let data = '';
      paystackRes.on('data', (chunk) => { data += chunk; });
      paystackRes.on('end', () => {
        const response = JSON.parse(data);
        if (response.status) {
          res.json({ authorization_url: response.data.authorization_url });
        } else {
          res.status(400).json({ error: 'Payment initialization failed' });
        }
      });
    });

    paystackReq.on('error', (error) => {
      res.status(500).json({ error: 'Payment service error' });
    });

    paystackReq.write(params);
    paystackReq.end();

  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify payment & upgrade user plan
router.get('/verify/:reference', authenticateToken, async (req, res) => {
  try {
    const { reference } = req.params;

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/transaction/verify/${reference}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    };

    const paystackReq = https.request(options, (paystackRes) => {
      let data = '';
      paystackRes.on('data', (chunk) => { data += chunk; });
      paystackRes.on('end', async () => {
        const response = JSON.parse(data);
        if (response.status && response.data.status === 'success') {
          const plan = response.data.metadata.plan;
          await User.update(
            { subscription_plan: plan },
            { where: { id: req.user.id } }
          );
          res.json({ success: true, plan });
        } else {
          res.status(400).json({ error: 'Payment verification failed' });
        }
      });
    });

    paystackReq.end();
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current plan
router.get('/my-plan', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const plan = user.subscription_plan || 'free';
    res.json({ plan, details: PLANS[plan] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;