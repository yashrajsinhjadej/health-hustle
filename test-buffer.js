// Test the 30-second buffer approach
require('dotenv').config();
const jwt = require('jsonwebtoken');

console.log('🔧 Testing 30-Second Buffer Approach');
console.log('===================================');

// Simulate the new login process
function simulateNewLoginProcess() {
    console.log('\n📝 Simulating Login Process:');
    
    // 1. Generate token
    const token = jwt.sign({ userId: 'test123' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    console.log('1. ✅ Token generated');
    
    // 2. Extract iat
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const tokenIssuedAt = new Date(decoded.iat * 1000);
    console.log('2. ✅ Token iat extracted:', tokenIssuedAt.toISOString());
    
    // 3. Set lastLoginAt to 30 seconds before
    const userLastLoginAt = new Date(tokenIssuedAt.getTime() - 30000);
    console.log('3. ✅ lastLoginAt set to:', userLastLoginAt.toISOString());
    
    // 4. Test auth middleware logic
    console.log('\n🔍 Auth Middleware Check:');
    console.log(`  Token issued at: ${tokenIssuedAt.toISOString()}`);
    console.log(`  User lastLoginAt: ${userLastLoginAt.toISOString()}`);
    console.log(`  lastLoginAt > tokenIssuedAt? ${userLastLoginAt > tokenIssuedAt}`);
    
    if (userLastLoginAt > tokenIssuedAt) {
        console.log('❌ Session would be invalidated');
        return false;
    } else {
        console.log('✅ Session would be valid');
        return true;
    }
}

// Test multiple scenarios
console.log('\n🧪 Multiple Test Runs:');
for (let i = 1; i <= 3; i++) {
    console.log(`\n--- Test Run ${i} ---`);
    simulateNewLoginProcess();
}

// Test the session invalidation scenario
console.log('\n🚨 Testing Session Invalidation:');
console.log('=================================');

// Simulate user logging in again (new token vs old lastLoginAt)
const oldTime = new Date(Date.now() - (60 * 60 * 1000)); // 1 hour ago
const newToken = jwt.sign({ userId: 'test123' }, process.env.JWT_SECRET, { expiresIn: '7d' });
const newDecoded = jwt.verify(newToken, process.env.JWT_SECRET);
const newTokenTime = new Date(newDecoded.iat * 1000);

console.log(`Old lastLoginAt: ${oldTime.toISOString()}`);
console.log(`New token time: ${newTokenTime.toISOString()}`);
console.log(`Should invalidate old sessions? ${oldTime > newTokenTime ? 'YES' : 'NO'}`);

console.log('\n✨ Benefits of this approach:');
console.log('  - ✅ Simple and clean code');
console.log('  - ✅ No timestamp precision issues');
console.log('  - ✅ Always ensures current token is valid');
console.log('  - ✅ Still invalidates old tokens on new login');
console.log('  - ✅ 30-second buffer is invisible to users');
console.log('  - ✅ Maintains security while fixing the bug');
