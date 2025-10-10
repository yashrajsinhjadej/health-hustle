const ResponseHandler = require('../utils/ResponseHandler');
// User Profile Validation Rules using express-validator
const { body, validationResult } = require('express-validator');
const Logger = require('../utils/logger');

// Admin signup validation
const validateAdminSignup = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name can only contain letters and spaces'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
];

// Admin login validation
const validateAdminLogin = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// Admin email validation for password reset
const validateAdminEmail = [
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail()
];

// Validation rules for user profile update
const validateUserProfileUpdate = [
    // Name validation
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 1, max: 50 })
        .withMessage('Name must be between 1 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name can only contain letters and spaces'),

    // Email validation
    body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .withMessage('Please enter a valid email address'),

    // Gender validation
    body('gender')
        .trim()
        .notEmpty()
        .withMessage('Gender is required')
        .isIn(['male', 'female', 'other'])
        .withMessage('Gender must be male, female, or other'),

    // Height validation (basic - detailed validation after conversion)
    body('height')
        .notEmpty()
        .withMessage('Height is required')
        .isFloat({ min: 0.1 })
        .withMessage('Height must be a positive number'),

    // Height unit validation (required)
    body('heightUnit')
        .notEmpty()
        .withMessage('Height unit is required')
        .isIn(['cm', 'ft'])
        .withMessage('Height unit must be cm or ft'),

    // Weight validation (basic - detailed validation after conversion)
    body('weight')
        .notEmpty()
        .withMessage('Weight is required')
        .isFloat({ min: 0.1 })
        .withMessage('Weight must be a positive number'),

    // Weight unit validation (required)
    body('weightUnit')
        .notEmpty()
        .withMessage('Weight unit is required')
        .isIn(['kg', 'lbs'])
        .withMessage('Weight unit must be kg or lbs'),

    // Age validation
    body('age')
        .notEmpty()
        .withMessage('Age is required')
        .isInt({ min: 2, max: 102 })
        .withMessage('Age must be between 2 and 102'),

    // Loyalty percentage validation
    body('loyaltyPercentage')
        .notEmpty()
        .withMessage('Loyalty percentage is required')
        .isInt({ min: 0, max: 100 })
        .withMessage('Loyalty percentage must be between 0 and 100')
        .custom((value) => {
            if (value % 10 !== 0) {
                throw new Error('Loyalty percentage must be in intervals of 10 (0, 10, 20, ..., 100)');
            }
            return true;
        }),

    // Body profile validation
    body('bodyProfile')
        .trim()
        .notEmpty()
        .withMessage('Body profile is required')
        .isIn(['slim', 'average', 'muscular', 'overweight'])
        .withMessage('Body profile must be slim, average, muscular, or overweight'),

    // Main goal validation
    body('mainGoal')
        .trim()
        .notEmpty()
        .withMessage('Main goal is required')
        .isIn(['weight_loss', 'build_muscles', 'full_body_detox', 'fit_body','weight_gain','athletic_performance'])
        .withMessage('Main goal must be weight_loss, build_muscles, full_body_detox, athletic_performance, weight_gain, or fit_body'),

    // Sports ambitions validation (required - at least one)
    body('sportsAmbitions')
        .notEmpty()
        .withMessage('Sports ambitions are required')
        .isArray({ min: 1 })
        .withMessage('At least one sport ambition must be selected')
        .custom((value) => {
            if (value && value.length > 0) {
                const allowedSports = ['swimming', 'badminton', 'table_tennis', 'boxing', 'running', 'cycling'];
                const invalidSports = value.filter(sport => 
                    !allowedSports.includes(sport.toLowerCase())
                );
                if (invalidSports.length > 0) {
                    throw new Error(`Invalid sports: ${invalidSports.join(', ')}. Allowed sports: ${allowedSports.join(', ')}`);
                }
            }
            return true;
        })
];

// Validation result handler middleware

const handleValidationErrors = (req, res, next) => {
    console.log(`🔍 [${req.requestId}] handleValidationErrors middleware called`);
    const errors = validationResult(req);
    
    console.log(`🔍 [${req.requestId}] Validation check - Total errors found: ${errors.array().length}`);
    
    if (!errors.isEmpty()) {
        console.log(`❌ [${req.requestId}] Validation FAILED - Errors:`, JSON.stringify(errors.array(), null, 2));
        return ResponseHandler.validationError(res, errors);
    }
    
    console.log(`✅ [${req.requestId}] Validation PASSED - No errors found`);
    next();
};

// Phone number validation for OTP
const validatePhoneNumber = [
    body('phone')
        .trim()
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^[0-9]{10}$/)
        .withMessage('Phone number must be exactly 10 digits')
];

// OTP validation
const validateOTP = [
    body('otp')
        .trim()
        .notEmpty()
        .withMessage('OTP is required')
        .matches(/^[0-9]{6}$/)
        .withMessage('OTP must be exactly 6 digits')
];

// Admin password reset validation
const validateAdminPasswordReset = [
    body('token')
        .trim()
        .notEmpty()
        .withMessage('Reset token is required')
        .isLength({ min: 10 })
        .withMessage('Invalid reset token format'),

    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
];

module.exports = {
    validateUserProfileUpdate,
    validatePhoneNumber,
    validateOTP,
    validateAdminSignup,
    validateAdminLogin,
    validateAdminEmail,
    validateAdminPasswordReset,
    handleValidationErrors
}; 