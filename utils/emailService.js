const nodemailer = require('nodemailer');

// Create transporter using Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Test the connection
transporter.verify(function(error, success) {
  if (error) {
    console.log('❌ Email service error:', error.message);
  } else {
    console.log('✅ Email service ready!');
  }
});

// WELCOME EMAIL
const sendWelcomeEmail = async (user) => {
  try {
    await transporter.sendMail({
      from: '"AdSync Pro" <' + process.env.EMAIL_USER + '>',
      to: user.email,
      subject: '🎉 Welcome to AdSync Pro!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #f0f0f5; padding: 40px; border-radius: 16px;">
          <h1 style="color: #ff6b35; font-size: 28px;">Welcome to AdSync Pro! 🚀</h1>
          <p style="font-size: 16px; color: #b0b0c0;">Hi ${user.firstName},</p>
          <p style="font-size: 16px; color: #b0b0c0;">Your account has been created successfully. You're now ready to start creating powerful ad campaigns!</p>
          <div style="background: #13131a; border: 1px solid #2a2a3a; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h3 style="color: #ff6b35; margin: 0 0 12px;">Your Account Details</h3>
            <p style="color: #b0b0c0; margin: 4px 0;">📧 Email: ${user.email}</p>
            <p style="color: #b0b0c0; margin: 4px 0;">🏢 Business: ${user.businessName || 'Not set'}</p>
            <p style="color: #b0b0c0; margin: 4px 0;">💳 Plan: Free</p>
          </div>
          <a href="http://localhost:5000" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #ff6b35, #ffb347); color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">Start Creating Campaigns →</a>
          <p style="font-size: 13px; color: #7070a0; margin-top: 30px;">© 2026 AdSync Pro. All rights reserved.</p>
        </div>
      `
    });
    console.log('✅ Welcome email sent to:', user.email);
  } catch (error) {
    console.error('❌ Welcome email failed:', error.message);
  }
};

// CAMPAIGN CREATED EMAIL
const sendCampaignEmail = async (user, campaign) => {
  try {
    await transporter.sendMail({
      from: '"AdSync Pro" <' + process.env.EMAIL_USER + '>',
      to: user.email,
      subject: '📢 Campaign Created: ' + campaign.name,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #f0f0f5; padding: 40px; border-radius: 16px;">
          <h1 style="color: #ff6b35;">Campaign Created! 📢</h1>
          <p style="color: #b0b0c0;">Hi ${user.firstName}, your campaign has been created successfully!</p>
          <div style="background: #13131a; border: 1px solid #2a2a3a; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h3 style="color: #ff6b35; margin: 0 0 12px;">${campaign.name}</h3>
            <p style="color: #b0b0c0; margin: 4px 0;">📱 Platforms: ${(campaign.platforms || []).join(', ')}</p>
            <p style="color: #b0b0c0; margin: 4px 0;">🌍 Target: ${(campaign.targetCountries || []).join(', ')}</p>
            <p style="color: #b0b0c0; margin: 4px 0;">📋 Status: ${campaign.status}</p>
          </div>
          <p style="font-size: 13px; color: #7070a0;">© 2026 AdSync Pro. All rights reserved.</p>
        </div>
      `
    });
    console.log('✅ Campaign email sent to:', user.email);
  } catch (error) {
    console.error('❌ Campaign email failed:', error.message);
  }
};

// PASSWORD RESET EMAIL
const sendPasswordResetEmail = async (user, resetToken) => {
  try {
    await transporter.sendMail({
      from: '"AdSync Pro" <' + process.env.EMAIL_USER + '>',
      to: user.email,
      subject: '🔐 Reset Your AdSync Pro Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0f; color: #f0f0f5; padding: 40px; border-radius: 16px;">
          <h1 style="color: #ff6b35;">Reset Your Password 🔐</h1>
          <p style="color: #b0b0c0;">Hi ${user.firstName}, we received a request to reset your password.</p>
          <p style="color: #b0b0c0;">Your password reset code is:</p>
          <div style="background: #13131a; border: 2px solid #ff6b35; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
            <h2 style="color: #ff6b35; font-size: 36px; letter-spacing: 8px; margin: 0;">${resetToken}</h2>
          </div>
          <p style="color: #b0b0c0;">This code expires in <strong style="color: #ff6b35;">15 minutes</strong>.</p>
          <p style="color: #7070a0;">If you didn't request this, ignore this email.</p>
          <p style="font-size: 13px; color: #7070a0;">© 2026 AdSync Pro. All rights reserved.</p>
        </div>
      `
    });
    console.log('✅ Password reset email sent to:', user.email);
  } catch (error) {
    console.error('❌ Password reset email failed:', error.message);
  }
};

module.exports = { sendWelcomeEmail, sendCampaignEmail, sendPasswordResetEmail };