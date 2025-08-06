// Test the exact timing issue
require('dotenv').config();
const jwt = require('jsonwebtoken');

console.log('🔍 Exact Timing Issue Test');
console.log('==========================');

// Simulate the exact login process
function simulateLoginProcess() {
    console.log('\n1. Generating token...');
    const token = jwt.sign({ userId: 'test123' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    console.log('2. Decoding token to get iat...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const tokenIssuedAt = new Date(decoded.iat * 1000);
    
    console.log('3. Simulating database save...');
    // This simulates user.lastLoginAt = tokenIssuedAt; await user.save();
    const userLastLoginAt = new Date(tokenIssuedAt.getTime()); // Exact copy
    
    console.log('4. Time comparison:');
    console.log(`   Token iat: ${decoded.iat}`);
    console.log(`   Token iat as Date: ${tokenIssuedAt.toISOString()}`);
    console.log(`   User lastLoginAt: ${userLastLoginAt.toISOString()}`);
    console.log(`   Are they equal? ${tokenIssuedAt.getTime() === userLastLoginAt.getTime()}`);
    
    // Simulate the auth middleware check
    console.log('\n5. Auth middleware check:');
    if (userLastLoginAt > tokenIssuedAt) {
        console.log('❌ Session would be invalidated');
        return false;
    } else {
        console.log('✅ Session would be valid');
        return true;
    }
}

// Run multiple tests to see if there's inconsistency
for (let i = 1; i <= 3; i++) {
    console.log(`\n🧪 Test Run ${i}:`);
    simulateLoginProcess();
}

// Test the exact problematic scenario
console.log('\n🚨 Testing Problematic Scenario:');
console.log('================================');

// This simulates what might happen if there's a tiny timing difference
const baseTime = new Date();
const jwtTime = new Date(Math.floor(baseTime.getTime() / 1000) * 1000); // JWT precision (seconds)
const dbTime = new Date(baseTime.getTime()); // DB precision (milliseconds)

console.log(`Base time: ${baseTime.toISOString()}`);
console.log(`JWT time (seconds precision): ${jwtTime.toISOString()}`);
console.log(`DB time (milliseconds precision): ${dbTime.toISOString()}`);
console.log(`DB time > JWT time? ${dbTime > jwtTime}`);

if (dbTime > jwtTime) {
    console.log('❌ This would cause session invalidation!');
} else {
    console.log('✅ This would be fine');
}
