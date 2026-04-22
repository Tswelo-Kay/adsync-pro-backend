const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: `You are AdSync Pro's friendly support assistant. AdSync Pro is a South African SaaS platform built by Infinite Select (Pty) Ltd that helps e-commerce sellers automate their advertising on TikTok, Meta, and Google Ads. It integrates with Takealot and Shopify stores.

Key features:
- AI Ad Generator (creates ad copy for TikTok, Meta, Google, WhatsApp)
- Buy Box Guard (monitors and reprices products every 15 minutes)
- Campaign Management (create and manage ad campaigns)
- Store integrations (Takealot and Shopify)
- AI Product Recommendations

Pricing plans:
- Free: R0/month - 3 campaigns, basic features
- Starter: R499/month - 10 campaigns, Buy Box Guard (5 products)
- Growth: R899/month - 25 campaigns, Buy Box Guard unlimited
- Pro: R1200/month - Unlimited campaigns, WhatsApp API, dedicated manager

Always be helpful, friendly and concise. If you don't know something, direct them to admin@adsyncpro.com.`,
      messages: messages
    });
    res.json({ reply: response.content[0].text });
  } catch (error) {
    console.error('Help chat error:', error);
    res.status(500).json({ error: 'Chat unavailable. Please email admin@adsyncpro.com' });
  }
});

module.exports = router;