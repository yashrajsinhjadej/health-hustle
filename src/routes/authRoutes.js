// Authentication Routes
const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { authenticateToken } = require('../middleware/auth');

// POST /auth/send-otp - Send OTP to phone number
router.post('/send-otp', AuthController.sendOTP.bind(AuthController));

// POST /auth/verify-otp - Verify OTP and login/register
router.post('/verify-otp', AuthController.verifyOTP.bind(AuthController));

// GET /auth/profile - Get current user profile (protected)
router.get('/profile', authenticateToken, AuthController.getProfile.bind(AuthController));

// PUT /auth/profile - Update user profile (protected)
router.put('/profile', authenticateToken, AuthController.updateProfile.bind(AuthController));

module.exports = router;
