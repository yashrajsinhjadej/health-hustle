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

// Validation for date parameter in routes
const validateDateParam = [
    param('date')
        .trim()
        .notEmpty()
        .withMessage('Date parameter is required')
        .custom(isValidDateFormat)
        .custom(isNotFutureDate)
];

// Validation for date in request body
const validateDateBody = [
    body('date')
        .trim()
        .notEmpty()
        .withMessage('Date is required in request body')
        .custom(isValidDateFormat)
        .custom(isNotFutureDate)
];

// Validation for daily health data update with date in body
const validateDailyHealthDataBody = [
    // Date body validation - REQUIRED
    body('date')
        .trim()
        .notEmpty()
        .withMessage('Date is required in request body')
        .custom(isValidDateFormat)
        .custom(isNotFutureDate),

    // Steps validation (optional)
    body('steps.count')
        .optional()
        .isInt({ min: 0, max: 100000 })
        .withMessage('Steps count must be between 0 and 100,000'),
    
    body('steps.goal')
        .optional()
        .isInt({ min: 1000, max: 50000 })
        .withMessage('Steps goal must be between 1,000 and 50,000'),
    
    body('steps.calories')
        .optional()
        .isFloat({ min: 0, max: 10000 })
        .withMessage('Steps calories must be between 0 and 10,000'),

    // Water validation (optional) - frontend sends glasses, backend stores ml
    body('water.consumed')
        .optional()
        .isFloat({ min: 0, max: 50 })
        .withMessage('Water consumed must be between 0 and 50 glasses'),
    
    body('water.goal')
        .optional()
        .isFloat({ min: 1, max: 25 })
        .withMessage('Water goal must be between 1 and 25 glasses'),

    // Body metrics validation (optional)
    body('bodyMetrics.weight')
        .optional()
        .isFloat({ min: 10, max: 500 })
        .withMessage('Weight must be between 10kg and 500kg'),
    
    body('bodyMetrics.height')
        .optional()
        .isFloat({ min: 50, max: 300 })
        .withMessage('Height must be between 50cm and 300cm'),
    
    body('bodyMetrics.bmi')
        .optional()
        .isFloat({ min: 10, max: 100 })
        .withMessage('BMI must be between 10 and 100'),

    // Blood pressure validation (optional)
    body('bloodPressure.systolic')
        .optional()
        .isInt({ min: 70, max: 250 })
        .withMessage('Systolic pressure must be between 70 and 250'),
    
    body('bloodPressure.diastolic')
        .optional()
        .isInt({ min: 40, max: 150 })
        .withMessage('Diastolic pressure must be between 40 and 150'),
    
    body('bloodPressure.timestamp')
        .optional()
        .isISO8601()
        .withMessage('Blood pressure timestamp must be a valid ISO 8601 date'),

    // Heart rate validation (optional)
    body('heartRate.avgBpm')
        .optional()
        .isInt({ min: 30, max: 250 })
        .withMessage('Average heart rate BPM must be between 30 and 250'),

    // Sleep validation (optional)
    body('sleep.duration')
        .optional()
        .isFloat({ min: 0, max: 24 })
        .withMessage('Sleep duration must be between 0 and 24 hours'),
    
    body('sleep.quality')
        .optional()
        .isIn(['poor', 'fair', 'good', 'excellent'])
        .withMessage('Sleep quality must be poor, fair, good, or excellent'),
    
    body('sleep.bedtime')
        .optional()
        .custom(isValidTimeFormat),
    
    body('sleep.wakeup')
        .optional()
        .custom(isValidTimeFormat),

    // Meals validation (optional)
    body('meals')
        .optional()
        .isArray()
        .withMessage('Meals must be an array'),
    
    body('meals.*.type')
        .optional()
        .isIn(['breakfast', 'lunch', 'dinner', 'snack'])
        .withMessage('Meal type must be breakfast, lunch, dinner, or snack'),
    
    body('meals.*.time')
        .optional()
        .custom(isValidTimeFormat),
    
    body('meals.*.calories')
        .optional()
        .isInt({ min: 1, max: 5000 })
        .withMessage('Meal calories must be between 1 and 5000'),
    
    body('meals.*.description')
        .optional()
        .isLength({ min: 1, max: 200 })
        .withMessage('Meal description must be between 1 and 200 characters'),

    // Exercise validation (optional)
    body('exercise')
        .optional()
        .isArray()
        .withMessage('Exercise must be an array'),
    
    body('exercise.*.type')
        .optional()
        .isLength({ min: 1, max: 50 })
        .withMessage('Exercise type must be between 1 and 50 characters'),
    
    body('exercise.*.duration')
        .optional()
        .isInt({ min: 1, max: 600 })
        .withMessage('Exercise duration must be between 1 and 600 minutes'),
    
    body('exercise.*.calories')
        .optional()
        .isInt({ min: 1, max: 2000 })
        .withMessage('Exercise calories must be between 1 and 2000'),
    
    body('exercise.*.time')
        .optional()
        .custom(isValidTimeFormat)
];

// Validation for daily health data update
const validateDailyHealthData = [
    // Date parameter validation
    param('date')
        .trim()
        .notEmpty()
        .withMessage('Date parameter is required')
        .custom(isValidDateFormat)
        .custom(isNotFutureDate),

    // Steps validation (optional)
    body('steps.count')
        .optional()
        .isInt({ min: 0, max: 100000 })
        .withMessage('Steps count must be between 0 and 100,000'),
    
    body('steps.goal')
        .optional()
        .isInt({ min: 1000, max: 50000 })
        .withMessage('Steps goal must be between 1,000 and 50,000'),
    
    body('steps.calories')
        .optional()
        .isFloat({ min: 0, max: 10000 })
        .withMessage('Steps calories must be between 0 and 10,000'),

    // Water validation (optional) - frontend sends glasses, backend stores ml
    body('water.consumed')
        .optional()
        .isFloat({ min: 0, max: 50 })
        .withMessage('Water consumed must be between 0 and 50 glasses'),
    
    body('water.goal')
        .optional()
        .isFloat({ min: 1, max: 25 })
        .withMessage('Water goal must be between 1 and 25 glasses'),

    // Body metrics validation (optional)
    body('bodyMetrics.weight')
        .optional()
        .isFloat({ min: 10, max: 500 })
        .withMessage('Weight must be between 10kg and 500kg'),
    
    body('bodyMetrics.height')
        .optional()
        .isFloat({ min: 50, max: 300 })
        .withMessage('Height must be between 50cm and 300cm'),
    
    body('bodyMetrics.bmi')
        .optional()
        .isFloat({ min: 10, max: 100 })
        .withMessage('BMI must be between 10 and 100'),

    // Blood pressure validation (optional)
    body('bloodPressure.systolic')
        .optional()
        .isInt({ min: 70, max: 250 })
        .withMessage('Systolic pressure must be between 70 and 250'),
    
    body('bloodPressure.diastolic')
        .optional()
        .isInt({ min: 40, max: 150 })
        .withMessage('Diastolic pressure must be between 40 and 150'),
    
    body('bloodPressure.timestamp')
        .optional()
        .isISO8601()
        .withMessage('Blood pressure timestamp must be a valid ISO 8601 date'),

    // Heart rate validation (optional)
    body('heartRate.avgBpm')
        .optional()
        .isInt({ min: 30, max: 250 })
        .withMessage('Average heart rate BPM must be between 30 and 250'),

    // Sleep validation (optional)
    body('sleep.duration')
        .optional()
        .isFloat({ min: 0, max: 24 })
        .withMessage('Sleep duration must be between 0 and 24 hours'),
    
    body('sleep.quality')
        .optional()
        .isIn(['poor', 'fair', 'good', 'excellent'])
        .withMessage('Sleep quality must be poor, fair, good, or excellent'),
    
    body('sleep.bedtime')
        .optional()
        .custom(isValidTimeFormat),
    
    body('sleep.wakeup')
        .optional()
        .custom(isValidTimeFormat),

    // Meals validation (optional)
    body('meals')
        .optional()
        .isArray()
        .withMessage('Meals must be an array'),
    
    body('meals.*.type')
        .optional()
        .isIn(['breakfast', 'lunch', 'dinner', 'snack'])
        .withMessage('Meal type must be breakfast, lunch, dinner, or snack'),
    
    body('meals.*.time')
        .optional()
        .custom(isValidTimeFormat),
    
    body('meals.*.calories')
        .optional()
        .isInt({ min: 0, max: 5000 })
        .withMessage('Meal calories must be between 0 and 5,000'),
    
    body('meals.*.description')
        .optional()
        .isLength({ max: 200 })
        .withMessage('Meal description must be less than 200 characters'),

    // Exercise validation (optional)
    body('exercise')
        .optional()
        .isArray()
        .withMessage('Exercise must be an array'),
    
    body('exercise.*.type')
        .optional()
        .isIn(['running', 'walking', 'cycling', 'swimming', 'gym', 'yoga', 'other'])
        .withMessage('Exercise type must be running, walking, cycling, swimming, gym, yoga, or other'),
    
    body('exercise.*.duration')
        .optional()
        .isInt({ min: 1, max: 480 })
        .withMessage('Exercise duration must be between 1 and 480 minutes'),
    
    body('exercise.*.calories')
        .optional()
        .isInt({ min: 0, max: 2000 })
        .withMessage('Exercise calories must be between 0 and 2,000'),
    
    body('exercise.*.time')
        .optional()
        .custom(isValidTimeFormat)
];

// Validation for quick update  
const validateQuickUpdate = [
    body('metric')
        .trim()
        .notEmpty()
        .withMessage('Metric is required')
        .isIn(['steps', 'water', 'sleep', 'heartRate'])
        .withMessage('Metric must be steps, water, sleep, or heartRate'),
    
    body('value')
        .notEmpty()
        .withMessage('Value is required')
        .custom((value, { req }) => {
            const metric = req.body.metric;
            
            if (!metric) {
                return true; // Let the metric validation handle this
            }
            
            switch (metric) {
                case 'steps':
                    if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 100000) {
                        throw new Error('Steps value must be an integer between 0 and 100,000');
                    }
                    break;
                case 'water':
                    if (isNaN(Number(value)) || Number(value) < 0 || Number(value) > 50) {
                        throw new Error('Water value must be a number between 0 and 50 glasses');
                    }
                    break;
                case 'sleep':
                    if (isNaN(Number(value)) || Number(value) < 0 || Number(value) > 24) {
                        throw new Error('Sleep value must be a number between 0 and 24 hours');
                    }
                    break;
                case 'heartRate':
                    if (isNaN(Number(value)) || Number(value) < 30 || Number(value) > 250) {
                        throw new Error('Heart rate value must be a number between 30 and 250 BPM');
                    }
                    break;
            }
            return true;
        })
];

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

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return ResponseHandler.validationError(res, errors);
    }
    
    next();
};

module.exports = {
    validateDateParam,
    validateDateBody,
    validateDailyHealthData,
    validateDailyHealthDataBody,
    validateQuickUpdate,
    validateBulkUpdate,
    handleValidationErrors
}; 