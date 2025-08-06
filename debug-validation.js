// Debug validation issue
const { body, validationResult } = require('express-validator');

// Same validation as in healthValidators.js
const isValidDateFormat = (value) => {
    console.log('🔍 Validating date:', value, 'Type:', typeof value);
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

const validateBulkUpdate = [
    body('health_data')
        .notEmpty()
        .withMessage('health_data is required')
        .isArray()
        .withMessage('health_data must be an array'),
    
    body('health_data.*.date')
        .notEmpty()
        .withMessage('Date is required for each health data entry')
        .custom(isValidDateFormat),
];

// Test data
const testReq = {
    body: {
        "health_data": [
            {
                "date": "2025-08-01",
                "data": {
                    "steps": {
                        "count": 10000
                    }
                }
            }
        ]
    }
};

console.log('🧪 Testing validation with sample request...');
console.log('Request body:', JSON.stringify(testReq.body, null, 2));

// Simulate express-validator
async function testValidation() {
    const req = testReq;
    const res = {};
    const next = () => {};
    
    try {
        // Run validation
        for (const validator of validateBulkUpdate) {
            await validator.run(req);
        }
        
        const errors = validationResult(req);
        console.log('🔍 Validation errors:', errors.array());
        
        if (!errors.isEmpty()) {
            console.log('❌ Validation failed');
            errors.array().forEach(error => {
                console.log(`  - Field: ${error.path || error.param}`);
                console.log(`  - Value: ${error.value}`);
                console.log(`  - Message: ${error.msg}`);
            });
        } else {
            console.log('✅ Validation passed');
        }
    } catch (error) {
        console.error('❌ Validation error:', error);
    }
}

testValidation();
