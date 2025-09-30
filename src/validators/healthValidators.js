// Health Data Validation Rules using express-validator
const { body, param, validationResult } = require('express-validator');
const Logger = require('../utils/logger');

// Date format validation helper
const isValidDateFormat = (value) => {
    const validationId = `date_val_${Date.now()}`;
    Logger.info('HealthValidators', 'isValidDateFormat', 'Starting date validation', {
        validationId,
        dateValue: value
    });
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value)) {
        Logger.warn('HealthValidators', 'isValidDateFormat', 'Date format validation failed', {
            validationId,
            dateValue: value,
            expectedFormat: 'YYYY-MM-DD',
            error: 'Regex pattern mismatch'
        });
        throw new Error('Invalid date format. Use YYYY-MM-DD format.');
    }
    
    const date = new Date(value);
    if (isNaN(date.getTime())) {
        Logger.warn('HealthValidators', 'isValidDateFormat', 'Date value validation failed', {
            validationId,
            dateValue: value,
            error: 'Invalid date value'
        });
        throw new Error('Invalid date. Please provide a valid date.');
    }
    
    Logger.success('HealthValidators', 'isValidDateFormat', 'Date validation passed', {
        validationId,
        dateValue: value,
        parsedDate: date.toISOString()
    });
    
    return true;
};

// Time format validation helper
const isValidTimeFormat = (value) => {
    const validationId = `time_val_${Date.now()}`;
    Logger.info('HealthValidators', 'isValidTimeFormat', 'Starting time validation', {
        validationId,
        timeValue: value
    });
    
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(value)) {
        Logger.warn('HealthValidators', 'isValidTimeFormat', 'Time format validation failed', {
            validationId,
            timeValue: value,
            expectedFormat: 'HH:MM (24-hour)',
            error: 'Regex pattern mismatch'
        });
        throw new Error('Invalid time format. Use HH:MM format (24-hour).');
    }
    
    Logger.success('HealthValidators', 'isValidTimeFormat', 'Time validation passed', {
        validationId,
        timeValue: value
    });
    
    return true;
};

// Future date validation helper
const isNotFutureDate = (value) => {
    const validationId = `future_date_val_${Date.now()}`;
    Logger.info('HealthValidators', 'isNotFutureDate', 'Starting future date validation', {
        validationId,
        dateValue: value
    });
    
    const inputDate = new Date(value);
    const today = new Date();
    
    // Set today to start of day for accurate comparison
    today.setHours(0, 0, 0, 0);
    
    // Set input date to start of day for accurate comparison
    inputDate.setHours(0, 0, 0, 0);
    
    if (inputDate > today) {
        Logger.warn('HealthValidators', 'isNotFutureDate', 'Future date validation failed', {
            validationId,
            dateValue: value,
            inputDate: inputDate.toISOString(),
            today: today.toISOString(),
            error: 'Date cannot be in the future'
        });
        throw new Error('Date cannot be in the future. Please provide today\'s date or a past date.');
    }
    
    Logger.success('HealthValidators', 'isNotFutureDate', 'Future date validation passed', {
        validationId,
        dateValue: value,
        inputDate: inputDate.toISOString(),
        today: today.toISOString()
    });
    
    return true;
};


// Validation for date in request body
const validateDateBody = [
    body('date')
        .trim()
        .notEmpty()
        .withMessage('Date is required in request body')
        .custom(isValidDateFormat)
        .custom(isNotFutureDate)
];


const validateWaterBody=[
    body('water.consumed')
        .notEmpty()
        .isFloat({ min: 0, max: 50 })
        .withMessage('Water consumed must be between 0 and 50 glasses'),
];

const validateSleepBody=[
    body('sleep.duration')
        .notEmpty()
        .isFloat({ min: 0, max: 12 })
        .withMessage('Sleep duration must be between 0 and 24 hours'),
]

const validatecalories =[
    body('calories.consumed')
        .notEmpty()
        .isFloat({ min: 0, max: 5000 })
        .withMessage('Calories consumed must be between 0 and 5000'),
]

// Validation for bulk update
const validateBulkUpdate = [
    body('health_data')
        .notEmpty()
        .withMessage('health_data is required')
        .isArray()
        .withMessage('health_data must be an array')
        .custom((value) => {
            if (value.length === 0) {
                throw new Error('health_data array cannot be empty');
            }
            if (value.length > 30) {
                throw new Error('Cannot process more than 30 days of data at once');
            }
            return true;
        }),
    
    body('health_data.*.date')
        .notEmpty()
        .withMessage('Date is required for each health data entry')
        .custom(isValidDateFormat)
        .custom(isNotFutureDate),
    
    body('health_data.*.data')
        .notEmpty()
        .withMessage('Data object is required for each health data entry')
        .isObject()
        .withMessage('Data must be an object')
];

// Validation result handler middleware
const ResponseHandler = require('../utils/ResponseHandler');
const { validate } = require('../models/DailyHealthData');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return ResponseHandler.validationError(res, errors);
    }
    
    next();
};

module.exports = {
    validateDateBody,
    validateBulkUpdate,
    handleValidationErrors,
    validateWaterBody,
    validatecalories,
    validateSleepBody
}; 