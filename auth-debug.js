// Auth Middleware Debug Test
require('dotenv').config();
const jwt = require('jsonwebtoken');

console.log('🔍 Auth Middleware Session Logic Debug');
console.log('=====================================');

// Simulate the exact scenario from the auth middleware
function simulateAuthCheck(tokenIssuedTime, userLastLoginTime) {
    console.log(`\n📅 Scenario Test:`);
    console.log(`  Token issued at: ${tokenIssuedTime.toISOString()}`);
    console.log(`  User lastLoginAt: ${userLastLoginTime.toISOString()}`);
    
    // This is the exact logic from auth.js line 26-32
    if (userLastLoginTime > tokenIssuedTime) {
        console.log('❌ RESULT: Session expired due to login from another device');
        return false;
    } else {
        console.log('✅ RESULT: Token is valid');
        return true;
    }
}

// Test various scenarios
const now = new Date();
const thirtyMinutesAgo = new Date(now.getTime() - (30 * 60 * 1000));
const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

console.log('\n🧪 Testing different time scenarios:');

// Scenario 1: Normal case - token issued recently, user logged in at same time
console.log('\n1. Normal Login Scenario:');
simulateAuthCheck(thirtyMinutesAgo, thirtyMinutesAgo);

// Scenario 2: Token issued, then user logs in again (should invalidate old token)
console.log('\n2. User Logs In Again After Token Issued:');
simulateAuthCheck(oneHourAgo, thirtyMinutesAgo);

// Scenario 3: User logged in, then token was issued (should be valid)
console.log('\n3. Token Issued After User Login:');
simulateAuthCheck(thirtyMinutesAgo, oneHourAgo);

// Scenario 4: Check if there's a precision issue with timestamps
console.log('\n4. Timestamp Precision Test:');
const baseTime = new Date();
const timeWithMilliseconds = new Date(baseTime.getTime());
const timeWithoutMilliseconds = new Date(Math.floor(baseTime.getTime() / 1000) * 1000);

console.log(`  Base time: ${baseTime.toISOString()}`);
console.log(`  Time with ms: ${timeWithMilliseconds.toISOString()}`);
console.log(`  Time without ms: ${timeWithoutMilliseconds.toISOString()}`);
console.log(`  Are they equal? ${baseTime.getTime() === timeWithoutMilliseconds.getTime()}`);

// Test the actual JWT timestamp conversion
console.log('\n🔧 JWT Timestamp Conversion Test:');
const testToken = jwt.sign({ userId: 'test' }, process.env.JWT_SECRET, { expiresIn: '7d' });
const decoded = jwt.decode(testToken);
const jwtIssuedAt = new Date(decoded.iat * 1000);
const currentTime = new Date();

console.log(`  JWT iat: ${decoded.iat}`);
console.log(`  JWT iat as Date: ${jwtIssuedAt.toISOString()}`);
console.log(`  Current time: ${currentTime.toISOString()}`);
console.log(`  Difference in ms: ${currentTime.getTime() - jwtIssuedAt.getTime()}`);

// Check if there's any automatic updating of lastLoginAt happening
console.log('\n⚠️  Potential Issues to Check:');
console.log('1. Is lastLoginAt being updated automatically somewhere?');
console.log('2. Are there background processes updating user records?');
console.log('3. Is there a timestamp precision mismatch?');
console.log('4. Are there multiple login events happening?');

// Create a detailed timing test
console.log('\n⏰ Detailed Timing Analysis:');
const tokenTime = new Date(Date.now() - (30 * 60 * 1000)); // 30 minutes ago
const loginTime1 = new Date(tokenTime.getTime() + 1000); // 1 second after token
const loginTime2 = new Date(tokenTime.getTime() - 1000); // 1 second before token

console.log('Testing with very small time differences:');
simulateAuthCheck(tokenTime, loginTime1); // Should fail
simulateAuthCheck(tokenTime, loginTime2); // Should pass
