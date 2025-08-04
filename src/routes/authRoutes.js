// Authentication Routes
const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { authenticateToken } = require('../middleware/auth');
const { 
    validatePhoneNumber, 
    validateOTP, 
    handleValidationErrors 
} = require('../validators/userValidators');


router.get('/',(req,res)=>{
    res.send('Auth API');
})

// POST /auth/send-otp - Send OTP to phone number
router.post('/send-otp', validatePhoneNumber, handleValidationErrors, AuthController.sendOTP.bind(AuthController));

// POST /auth/verify-otp - Verify OTP and login/register
router.post('/verify-otp', validatePhoneNumber, validateOTP, handleValidationErrors, AuthController.verifyOTP.bind(AuthController));


module.exports = router;
