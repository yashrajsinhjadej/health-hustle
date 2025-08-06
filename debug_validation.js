const { body, validationResult } = require('express-validator');

// Date format validation helper (copied from healthValidators.js)
const isValidDateFormat = (value) => {
    console.log('Validating date:', value);
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD format.');
    }
    
    const date = new Date(value);
    if (isNaN(date.getTime())) {
        throw new Error('Invalid date. Please provide a valid date.');
    }
    
    return true;
};

// Test validation
const validateBulkUpdate = [
    body('health_data')
        .notEmpty()
        .withMessage('health_data is required')
        .isArray()
        .withMessage('health_data must be an array')
        .custom((value) => {
            console.log('Validating health_data array:', JSON.stringify(value, null, 2));
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
        .custom(isValidDateFormat),
    
    body('health_data.*.data')
        .notEmpty()
        .withMessage('Data object is required for each health data entry')
        .isObject()
        .withMessage('Data must be an object')
];

// Mock request object
const mockReq = {
    body: {
        "health_data": [
            {
                "date": "2025-08-01",
                "data": {
                    "heartRate": {
                        "readings": [],
                        "avgBpm": 0,
                        "maxBpm": 0,
                        "minBpm": 0
                    },
                    "steps": {
                        "count": 10000,
                        "distance": 7.5
                    },
                    "water": {
                        "consumed": 0,
                        "entries": []
                    },
                    "calories": {
                        "consumed": 0,
                        "burned": 2000,
                        "entries": []
                    },
                    "workouts": [],
                    "meals": []
                }
            }
        ]
    }
};

// Test function
async function testValidation() {
    console.log('Testing validation with:', JSON.stringify(mockReq.body, null, 2));
    
    // Run validation
    const results = [];
    for (const validator of validateBulkUpdate) {
        try {
            await validator.run(mockReq);
        } catch (error) {
            console.error('Validation error:', error);
        }
    }
    
    const errors = validationResult(mockReq);
    console.log('Validation result:', errors.isEmpty() ? 'PASSED' : 'FAILED');
    
    if (!errors.isEmpty()) {
        console.log('Errors:', errors.array());
    }
}

testValidation().catch(console.error);
