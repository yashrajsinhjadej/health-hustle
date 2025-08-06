// Test date validation
const testDates = [
    "2025-08-01",
    "2025-08-02", 
    "2025-08-03"
];

const isValidDateFormat = (value) => {
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

testDates.forEach((testDate, index) => {
    try {
        const result = isValidDateFormat(testDate);
        console.log(`✅ Date ${index + 1} (${testDate}): Valid`);
    } catch (error) {
        console.log(`❌ Date ${index + 1} (${testDate}): ${error.message}`);
    }
});

// Test the exact JSON structure
const testData = {
    "health_data": [
        {
            "date": "2025-08-01",
            "data": {
                "heartRate": {
                    "avgBpm": 90
                }
            }
        }
    ]
};

console.log('\n🔍 Testing JSON structure:');
console.log('First date from JSON:', testData.health_data[0].date);
console.log('Date type:', typeof testData.health_data[0].date);
console.log('Date length:', testData.health_data[0].date.length);

try {
    isValidDateFormat(testData.health_data[0].date);
    console.log('✅ JSON date validation passed');
} catch (error) {
    console.log('❌ JSON date validation failed:', error.message);
}
