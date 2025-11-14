const { body, validationResult } = require('express-validator');

/**
 * Validation rules for admin notification send API
 */
const validateAdminNotification = [
    body('title')
        .notEmpty()
        .withMessage('Title is required')
        .isString()
        .withMessage('Title must be a string')
        .isLength({ max: 65 })
        .withMessage('Title cannot exceed 65 characters'),

    body('body')
        .notEmpty()
        .withMessage('Body is required')
        .isString()
        .withMessage('Body must be a string')
        .isLength({ max: 240 })
        .withMessage('Body cannot exceed 240 characters'),

    body('data')
        .optional()
        .custom((value) => {
            if (typeof value !== 'object') {
                throw new Error('Data must be a JSON object');
            }
            return true;
        }),

    body('scheduleType')
        .optional()
        .isIn(['instant', 'scheduled_once', 'daily'])
        .withMessage('scheduleType must be one of: instant, scheduled_once, daily'),

    body('scheduledDate')
        .if(body('scheduleType').equals('scheduled_once'))
        .notEmpty()
        .withMessage('scheduledDate is required for scheduled_once type')
        .isISO8601()
        .withMessage('scheduledDate must be a valid ISO date string')
        .custom((value) => {
            const date = new Date(value);
            if (date <= new Date()) {
                throw new Error('scheduledDate must be in the future');
            }
            return true;
        }),

    body('scheduledTime')
        .if(body('scheduleType').equals('daily'))
        .notEmpty()
        .withMessage('scheduledTime is required for daily type')
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
        .withMessage('scheduledTime must be in HH:mm 24-hour format'),

    // ============================================
    // 🎯 FILTER VALIDATIONS (NEW)
    // ============================================

    body('targetAudience')
        .optional()
        .isIn(['all', 'filtered'])
        .withMessage('targetAudience must be either "all" or "filtered"'),

    // Validate that filters object exists when targetAudience is 'filtered'
    body('filters')
        .if(body('targetAudience').equals('filtered'))
        .notEmpty()
        .withMessage('filters object is required when targetAudience is "filtered"')
        .isObject()
        .withMessage('filters must be an object'),

    // Custom validation: At least one filter must be provided
    body('filters')
        .if(body('targetAudience').equals('filtered'))
        .custom((value) => {
            const hasGenderFilter = value?.gender && Array.isArray(value.gender) && value.gender.length > 0;
            const hasPlatformFilter = value?.platform && Array.isArray(value.platform) && value.platform.length > 0;
            const hasAgeFilter = value?.ageRange && (value.ageRange.min || value.ageRange.max);

            if (!hasGenderFilter && !hasPlatformFilter && !hasAgeFilter) {
                throw new Error('At least one filter (gender, platform, or ageRange) must be provided');
            }
            return true;
        }),

    // --- Gender Filter Validation ---
    body('filters.gender')
        .optional()
        .isArray()
        .withMessage('filters.gender must be an array')
        .custom((value) => {
            if (!Array.isArray(value)) return true; // Skip if not array (caught above)
            
            const validGenders = ['male', 'female', 'other'];
            const invalidGenders = value.filter(g => 
                !validGenders.includes(String(g).toLowerCase())
            );

            if (invalidGenders.length > 0) {
                throw new Error(
                    `Invalid gender values: ${invalidGenders.join(', ')}. Allowed: male, female, other`
                );
            }
            return true;
        }),

    // --- Platform Filter Validation ---
    body('filters.platform')
        .optional()
        .isArray()
        .withMessage('filters.platform must be an array')
        .custom((value) => {
            if (!Array.isArray(value)) return true; // Skip if not array (caught above)
            
            const validPlatforms = ['android', 'ios', 'web'];
            const invalidPlatforms = value.filter(p => 
                !validPlatforms.includes(String(p).toLowerCase())
            );

            if (invalidPlatforms.length > 0) {
                throw new Error(
                    `Invalid platform values: ${invalidPlatforms.join(', ')}. Allowed: android, ios, web`
                );
            }
            return true;
        }),

    // --- Age Range Filter Validation ---
    body('filters.ageRange')
        .optional()
        .isObject()
        .withMessage('filters.ageRange must be an object'),

    body('filters.ageRange.min')
        .optional()
        .isInt({ min: 13, max: 120 })
        .withMessage('ageRange.min must be between 13 and 120'),

    body('filters.ageRange.max')
        .optional()
        .isInt({ min: 13, max: 120 })
        .withMessage('ageRange.max must be between 13 and 120'),

    // Custom validation: min cannot be greater than max
    body('filters.ageRange')
        .optional()
        .custom((value) => {
            if (value && value.min && value.max) {
                const min = parseInt(value.min);
                const max = parseInt(value.max);
                
                if (min > max) {
                    throw new Error('ageRange.min cannot be greater than ageRange.max');
                }
            }
            return true;
        }),
];


/**
 * Middleware to handle validation errors globally
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array().map((err) => ({
                field: err.param,
                message: err.msg,
            })),
        });
    }
    next();
};

module.exports = {
    validateAdminNotification,
    handleValidationErrors,
};
