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
const ResponseHandler = require('../utils/ResponseHandler');

const createCustomRateLimit = require('../middleware/customRateLimit');
const createOTPRateLimit = require('../middleware/otpRateLimit');

router.get('/',(req,res)=>{
    return ResponseHandler.success(res, "Auth API ready");
})

// Create rate limiters for different endpoints using environment variables
const otpRateLimit = createOTPRateLimit(
    parseInt(process.env.AUTH_OTP_SEND_LIMIT) || 5, 
    parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60
); // OTP send rate limit per phone number

const verifyRateLimit = createOTPRateLimit(
    parseInt(process.env.AUTH_OTP_VERIFY_LIMIT) || 3, 
    parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60
); // OTP verify rate limit per phone number

// POST /auth/send-otp - Send OTP to phone number
router.post('/send-otp', otpRateLimit, validatePhoneNumber, handleValidationErrors, AuthController.sendOTP.bind(AuthController));

// POST /auth/verify-otp - Verify OTP and login/register
router.post('/verify-otp', verifyRateLimit, validatePhoneNumber, validateOTP, handleValidationErrors, AuthController.verifyOTP.bind(AuthController));

// POST /auth/logout - Logout current user
router.post('/logout', authenticateToken, AuthController.logout.bind(AuthController));


module.exports = router;
