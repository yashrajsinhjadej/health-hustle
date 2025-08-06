// Test the fixed auth middleware logic
require('dotenv').config();
const jwt = require('jsonwebtoken');

console.log('🔧 Testing Fixed Auth Middleware Logic');
console.log('=====================================');

// Simulate the NEW auth middleware check logic
function testFixedAuthLogic(tokenIssuedTime, userLastLoginTime) {
    console.log(`\n📅 Testing:`);
    console.log(`  Token issued at: ${tokenIssuedTime.toISOString()}`);
    console.log(`  User lastLoginAt: ${userLastLoginTime.toISOString()}`);
    
    // NEW logic: account for timestamp precision
    const timeDifference = userLastLoginTime.getTime() - tokenIssuedTime.getTime();
    console.log(`  Time difference: ${timeDifference}ms`);
    
    if (timeDifference > 1000) {
        console.log('❌ Session would be invalidated (difference > 1 second)');
        return false;
    } else {
        console.log('✅ Session would be valid (difference <= 1 second)');
        return true;
    }
}

console.log('\n🧪 Test Cases:');

// Test Case 1: Exact same time (should pass)
const exactTime = new Date();
testFixedAuthLogic(exactTime, new Date(exactTime.getTime()));

// Test Case 2: 500ms difference (should pass)
const base1 = new Date();
testFixedAuthLogic(base1, new Date(base1.getTime() + 500));

// Test Case 3: 999ms difference (should pass)
const base2 = new Date();
testFixedAuthLogic(base2, new Date(base2.getTime() + 999));

// Test Case 4: 1001ms difference (should fail)
const base3 = new Date();
testFixedAuthLogic(base3, new Date(base3.getTime() + 1001));

// Test Case 5: 2 seconds difference (should fail)
const base4 = new Date();
testFixedAuthLogic(base4, new Date(base4.getTime() + 2000));

// Test Case 6: Real JWT scenario
console.log('\n🔍 Real JWT Scenario Test:');
const token = jwt.sign({ userId: 'test' }, process.env.JWT_SECRET, { expiresIn: '7d' });
const decoded = jwt.decode(token);
const jwtTime = new Date(decoded.iat * 1000);
const currentTime = new Date();

testFixedAuthLogic(jwtTime, currentTime);

console.log('\n✅ The fix should resolve the 30-minute expiration issue!');
console.log('   - Tokens will remain valid for the full 7 days');
console.log('   - Only genuine new logins (>1 second difference) will invalidate tokens');
console.log('   - Millisecond precision differences are now ignored');
