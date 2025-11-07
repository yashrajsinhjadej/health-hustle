// Authentication Routes
const express = require('express');
const router = express.Router();
const AuthController = require('../../controllers/AuthController');
const { authenticateToken } = require('../../middleware/auth');
const { 
    validatePhoneNumber, 
    validateOTP, 
    handleValidationErrors 
} = require('../../validators/userValidators');
const ResponseHandler = require('../../utils/ResponseHandler');
const { rateLimiters } = require('../../middleware/redisrateLimiter');

router.get('/',(req,res)=>{
    return ResponseHandler.success(res, "Auth API ready");
})

// Create rate limiters for different endpoints using environment variables

// POST /auth/send-otp - Send OTP to phone number
router.post('/send-otp', rateLimiters.auth(), validatePhoneNumber, handleValidationErrors, AuthController.sendOTP.bind(AuthController));

// POST /auth/verify-otp - Verify OTP and login/register
router.post('/verify-otp', rateLimiters.strict(), validatePhoneNumber, validateOTP, handleValidationErrors, AuthController.verifyOTP.bind(AuthController));

// POST /auth/logout - Logout current user
router.post('/logout', authenticateToken, AuthController.logout.bind(AuthController));


module.exports = router;
