const ResponseHandler = require('../utils/ResponseHandler');
// User Profile Validation Rules using express-validator
const { body, param,validationResult } = require('express-validator');
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
const validateUserFirstTime = [
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
    const requestId = req.requestId || 'validation';
    Logger.debug(requestId, 'handleValidationErrors middleware called');
    const errors = validationResult(req);
    
    Logger.debug(requestId, 'Validation check completed', { 
        totalErrors: errors.array().length 
    });
    
    if (!errors.isEmpty()) {
        Logger.warn(requestId, 'Validation FAILED', { 
            errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
        });
        return ResponseHandler.validationError(res, errors);
    }
    
    Logger.debug(requestId, 'Validation PASSED - No errors found');
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

const validateUserProfileUpdate = [
    // Name validation (optional)
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Name must be between 1 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name can only contain letters and spaces'),

    // Email validation (optional)
    body('email')
        .optional()
        .trim()
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),

    // Gender validation (optional)
    body('gender')
        .optional()
        .trim()
        .isIn(['male', 'female', 'other'])
        .withMessage('Gender must be male, female, or other'),

    // Age validation (optional)
    body('age')
        .optional()
        .isInt({ min: 13, max: 120 })
        .withMessage('Age must be between 13 and 120'),

    // Height unit validation (required if height is provided)
    body('heightUnit')
        .if(body('height').exists())
        .notEmpty()
        .withMessage('Height unit is required when height is provided')
        .isIn(['cm', 'ft'])
        .withMessage('Height unit must be cm or ft'),

    // Height validation (optional, but requires heightUnit if provided)
    body('height')
        .optional()
        .isFloat({ min: 0.1 })
        .withMessage('Height must be a positive number')
        .custom((value, { req }) => {
            if (value && !req.body.heightUnit) {
                throw new Error('Height unit must be provided when height is specified');
            }
            return true;
        }),

    // Weight unit validation (required if weight is provided)
    body('weightUnit')
        .if(body('weight').exists())
        .notEmpty()
        .withMessage('Weight unit is required when weight is provided')
        .isIn(['kg', 'lbs'])
        .withMessage('Weight unit must be kg or lbs'),

    // Weight validation (optional, but requires weightUnit if provided)
    body('weight')
        .optional()
        .isFloat({ min: 0.1 })
        .withMessage('Weight must be a positive number')
        .custom((value, { req }) => {
            if (value && !req.body.weightUnit) {
                throw new Error('Weight unit must be provided when weight is specified');
            }
            return true;
        }),


    body('sportsAmbitions')
        .optional()
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
        }),

        body('bodyProfile')
        .trim()
        .optional()
        .isIn(['slim', 'average', 'muscular', 'overweight'])
        .withMessage('Body profile must be slim, average, muscular, or overweight'),

        body('mainGoal')
        .trim()
        .optional()
        .isIn(['weight_loss', 'build_muscles', 'full_body_detox', 'fit_body','weight_gain','athletic_performance'])
        .withMessage('Main goal must be weight_loss, build_muscles, full_body_detox, athletic_performance, weight_gain, or fit_body'),

         body('loyaltyPercentage')
        .trim()
        .optional()
        .isInt({ min: 0, max: 100 })
        .withMessage('Loyalty percentage must be between 0 and 100')
        .custom((value) => {
            if (value % 10 !== 0) {
                throw new Error('Loyalty percentage must be in intervals of 10 (0, 10, 20, ..., 100)');
            }
            return true;
        }),

];


const updateUserValidationadmin = [
    // Validate userId parameter format
    param('userId')
        .notEmpty().withMessage('User ID is required')
        .isLength({ min: 24, max: 24 }).withMessage('User ID must be 24 characters')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid MongoDB ObjectId format');
            }
            return true;
        }),

    // Validate name format
    body('name')
        .optional()
        .trim()
        .notEmpty().withMessage('Name cannot be empty if provided')
        .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s\-\.\']+$/).withMessage('Name can only contain letters, spaces, hyphens, dots, and apostrophes')
        .matches(/[a-zA-Z]/).withMessage('Name must contain at least one letter'),

    // Validate email format
    body('email')
        .optional()
        .trim()
        .custom((value) => {
            if (value === '' || value === null) {
                return true; // Allow empty string or null to clear email
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                throw new Error('Invalid email format');
            }
            return true;
        })
        .customSanitizer((value) => {
            if (value === '' || value === null) return null;
            return value.toLowerCase().trim();
        }),

    // Validate phone format
    body('phone')
        .optional()
        .trim()
        .custom((value) => {
            if (!value || value === '') return true;
            const cleanPhone = value.replace(/\D/g, '');
            const phoneRegex = /^[0-9]{10,15}$/;
            if (!phoneRegex.test(cleanPhone)) {
                throw new Error('Phone number must be 10-15 digits');
            }
            return true;
        })
        .customSanitizer((value) => {
            if (!value || value === '') return value;
            return value.replace(/\D/g, '');
        }),

    // Validate gender format
    body('gender')
        .optional()
        .trim()
        .custom((value) => {
            if (value === '' || value === null) return true; // Allow empty to clear gender
            const validGenders = ['male', 'female', 'other'];
            if (!validGenders.includes(value.toLowerCase())) {
                throw new Error('Gender must be: male, female, or other');
            }
            return true;
        })
        .customSanitizer((value) => {
            if (value === '' || value === null) return null;
            return value.toLowerCase();
        }),

    // Validate age format
    body('age')
        .optional()
        .custom((value) => {
            if (value === '' || value === null || value === undefined) return true;
            const ageNum = parseInt(value);
            if (isNaN(ageNum) || ageNum < 1 || ageNum > 150) {
                throw new Error('Age must be between 1 and 150');
            }
            return true;
        })
        .customSanitizer((value) => {
            if (value === '' || value === null) return null;
            return parseInt(value);
        }),

    // Validate profileCompleted format
    body('profileCompleted')
        .optional()
        .custom((value) => {
            if (value === true || value === false) return true;
            if (value === 'true' || value === 'false') return true;
            if (value === 1 || value === 0) return true;
            throw new Error('profileCompleted must be a boolean value');
        })
        .customSanitizer((value) => {
            if (value === true || value === 'true' || value === 1 || value === '1') return true;
            if (value === false || value === 'false' || value === 0 || value === '0') return false;
            return value;
        }),

    body('isActive')
        .optional()
        .custom((value) => {
            // Accept: true, false, "true", "false", 1, 0
            if (value === true || value === false) return true;
            if (value === 'true' || value === 'false') return true;
            if (value === 1 || value === 0) return true;
            throw new Error('isActive must be a boolean value (true/false, 1/0, or "true"/"false")');
        })
        .customSanitizer((value) => {
            // Convert all truthy values to true boolean
            if (value === true || value === 'true' || value === 1 || value === '1') {
                return true;
            }
            // Convert all falsy values to false boolean
            if (value === false || value === 'false' || value === 0 || value === '0') {
                return false;
            }
            return value;
        }),

    // Check if at least one field is provided
    body().custom((value, { req }) => {
        const allowedFields = ['name', 'email', 'phone', 'gender', 'age', 'profileCompleted', 'isActive'];
        const hasAtLeastOneField = allowedFields.some(field => req.body.hasOwnProperty(field));
        
        if (!hasAtLeastOneField) {
            throw new Error('At least one field must be provided for update');
        }
        return true;
    })
];


module.exports = {
    validateUserProfileUpdate,
    validatePhoneNumber,
    validateOTP,
    validateAdminSignup,
    validateAdminLogin,
    validateAdminEmail,
    validateAdminPasswordReset,
    validateUserFirstTime,
    updateUserValidationadmin,
    handleValidationErrors
}; 