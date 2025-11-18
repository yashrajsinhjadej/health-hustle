// Health Data Validation Rules using express-validator
const { body, param, validationResult } = require('express-validator');
const Logger = require('../utils/logger');
const ResponseHandler = require('../utils/ResponseHandler');
const { validate } = require('../models/DailyHealthData');


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


// Get current date in user's timezone (returns YYYY-MM-DD string)
const getCurrentDateInTimezone = (timezone) => {
    const validationId = `get_date_${Date.now()}`;
    try {
        Logger.info('HealthValidators', 'getCurrentDateInTimezone', 'Getting current date', {
            validationId,
            timezone
        });

        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });

        const dateString = formatter.format(new Date());
        
        Logger.success('HealthValidators', 'getCurrentDateInTimezone', 'Date retrieved', {
            validationId,
            timezone,
            date: dateString
        });

        return dateString;
    } catch (err) {
        Logger.error('HealthValidators', 'getCurrentDateInTimezone', 'Invalid timezone', {
            validationId,
            timezone,
            error: err.message
        });
        throw new Error(`Invalid timezone provided: ${timezone}`);
    }
};


// Validator for single date operations - must be TODAY in user's timezone
const isDateTodayInTimezone = (dateString, timezone) => {
    const validationId = `tz_date_val_${Date.now()}`;
    try {
        Logger.info('HealthValidators', 'isDateTodayInTimezone', 'Starting timezone date validation', {
            validationId,
            dateValue: dateString,
            timezone
        });

        // Simple string comparison - no Date object needed!
        const todayInTimezone = getCurrentDateInTimezone(timezone);

        if (dateString !== todayInTimezone) {
            Logger.warn('HealthValidators', 'isDateTodayInTimezone', 'Date validation failed', {
                validationId,
                inputDate: dateString,
                currentDate: todayInTimezone,
                timezone,
                error: 'Date must be current date in user timezone'
            });
            throw new Error('Please provide today\'s date for your timezone.');
        }

        Logger.success('HealthValidators', 'isDateTodayInTimezone', 'Date validation passed', {
            validationId,
            dateValue: dateString,
            timezone
        });
        
        return true;
    } catch (err) {
        Logger.error('HealthValidators', 'isDateTodayInTimezone', 'Timezone validation error', {
            validationId,
            dateValue: dateString,
            timezone,
            error: err.message
        });
        throw err;
    }
};
const isDatePastOrTodayInTimezone = (dateString, timezone) => {
    const validationId = `tz_date_val_${Date.now()}`;
    try {
        Logger.info('HealthValidators', 'isDatePastOrTodayInTimezone', 'Starting timezone date validation', {
            validationId,
            dateValue: dateString,
            timezone
        });

        // Get current date in user's timezone (formatted as YYYY-MM-DD)
        const todayInTimezone = getCurrentDateInTimezone(timezone);

        // Lexicographical comparison works since both are in YYYY-MM-DD format
        if (dateString > todayInTimezone) {
            Logger.warn('HealthValidators', 'isDatePastOrTodayInTimezone', 'Future date validation failed', {
                validationId,
                inputDate: dateString,
                currentDate: todayInTimezone,
                timezone,
                error: 'Future dates are not allowed'
            });
            throw new Error('Future dates are not allowed for your timezone.');
        }

        Logger.success('HealthValidators', 'isDatePastOrTodayInTimezone', 'Date validation passed', {
            validationId,
            dateValue: dateString,
            currentDate: todayInTimezone,
            timezone
        });

        return true;
    } catch (err) {
        Logger.error('HealthValidators', 'isDatePastOrTodayInTimezone', 'Timezone validation error', {
            validationId,
            dateValue: dateString,
            timezone,
            error: err.message
        });
        throw err;
    }
};

// Validator for bulk operations - can be historical, but NOT future dates
const isDateNotFutureInTimezone = (dateString, timezone) => {
    const validationId = `tz_bulk_val_${Date.now()}`;
    try {
        Logger.info('HealthValidators', 'isDateNotFutureInTimezone', 'Starting bulk date validation', {
            validationId,
            dateValue: dateString,
            timezone
        });

        // Simple string comparison - no Date object needed!
        const todayInTimezone = getCurrentDateInTimezone(timezone);

        if (dateString > todayInTimezone) {
            Logger.warn('HealthValidators', 'isDateNotFutureInTimezone', 'Future date rejected', {
                validationId,
                inputDate: dateString,
                currentDate: todayInTimezone,
                timezone,
                error: 'Cannot provide future dates'
            });
            throw new Error('Cannot provide future dates. Date must be today or earlier.');
        }

        Logger.success('HealthValidators', 'isDateNotFutureInTimezone', 'Date validation passed', {
            validationId,
            dateValue: dateString,
            timezone
        });
        
        return true;
    } catch (err) {
        Logger.error('HealthValidators', 'isDateNotFutureInTimezone', 'Timezone validation error', {
            validationId,
            dateValue: dateString,
            timezone,
            error: err.message
        });
        throw err;
    }
};


// Validation for date in request body (single operations - must be TODAY)
const validateDateBody = [
    body('date')
        .trim()
        .notEmpty()
        .withMessage('Date is required in request body')
        .custom(isValidDateFormat)
        .custom((value, { req }) => {
            const timezone = req.headers.timezone || 'UTC';
            return isDatePastOrTodayInTimezone(value, timezone);
        })
];


// Validation for water consumption
const validateWaterBody = [
    body('water.consumed')
        .notEmpty()
        .withMessage('Water consumed is required')
        .isFloat({ min: 0, max: 50 })
        .withMessage('Water consumed must be between 0 and 50 glasses'),
];


// Validation for sleep duration
const validateSleepBody = [
    body('sleep.duration')
        .notEmpty()
        .withMessage('Sleep duration is required')
        .isFloat({ min: 0, max: 12 })
        .withMessage('Sleep duration must be between 0 and 12 hours'),
];


// Validation for calories consumed
const validatecalories = [
    body('calories.consumed')
        .notEmpty()
        .withMessage('Calories consumed is required')
        .isFloat({ min: 0, max: 5000 })
        .withMessage('Calories consumed must be between 0 and 5000'),
];


// Validation for bulk update (can include historical dates)
const validateBulkUpdate = [
    // Validate root array
    body("health_data")
        .notEmpty().withMessage("health_data is required")
        .isArray().withMessage("health_data must be an array")
        .custom((value) => {
            if (value.length === 0) {
                throw new Error("health_data array cannot be empty");
            }
            if (value.length > 30) {
                throw new Error("Cannot process more than 30 days of data at once");
            }
            return true;
        }),

    // Ensure unique dates
    body("health_data").custom((value) => {
        const dates = value.map((item) => item.date);
        const duplicates = dates.filter((d, i) => dates.indexOf(d) !== i);
        if (duplicates.length > 0) {
            throw new Error(`Duplicate dates found: ${duplicates.join(", ")}`);
        }
        return true;
    }),

    // Validate each date
    body("health_data.*.date")
        .notEmpty().withMessage("Date is required for each health data entry")
        .custom(isValidDateFormat)
        .custom((value, { req }) => {
            const timezone = req.headers.timezone || "UTC";
            return isDateNotFutureInTimezone(value, timezone);
        }),

    // Validate each data object exists
    body("health_data.*.data")
        .notEmpty().withMessage("Data object is required for each health data entry")
        .isObject().withMessage("Data must be an object")
        .custom((obj) => {
            if (Object.keys(obj).length === 0) {
                throw new Error("Data object cannot be empty");
            }
            return true;
        }),

    // Optional: Validate inner fields if they exist
    body("health_data.*.data.steps").optional().isObject(),
    body("health_data.*.data.calories").optional().isObject(),
];


// Validation result handler middleware
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
    validateSleepBody,
    isDateTodayInTimezone,
    isDateNotFutureInTimezone,
    getCurrentDateInTimezone
};