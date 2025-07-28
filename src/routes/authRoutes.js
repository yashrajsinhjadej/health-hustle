// Authentication Routes
const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { authenticateToken } = require('../middleware/auth');


router.get('/',(req,res)=>{
    res.send('Auth API');
})

// POST /auth/send-otp - Send OTP to phone number
router.post('/send-otp', AuthController.sendOTP.bind(AuthController));

// POST /auth/verify-otp - Verify OTP and login/register
router.post('/verify-otp', AuthController.verifyOTP.bind(AuthController));


module.exports = router;
