// JWT Debug Test Script
require('dotenv').config();
const jwt = require('jsonwebtoken');

console.log('🔍 JWT Configuration Debug');
console.log('============================');

// Check environment variables
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('JWT_SECRET value:', `"${process.env.JWT_SECRET}"`);
console.log('JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0);
console.log('JWT_EXPIRES_IN:', process.env.JWT_EXPIRES_IN);

// Test token generation
console.log('\n🔧 Token Generation Test');
console.log('============================');

try {
    const testUserId = '64a1b2c3d4e5f6789abcdef0';
    
    // Generate token the same way as in AuthController
    const token = jwt.sign(
        { userId: testUserId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    console.log('✅ Token generated successfully');
    console.log('Token length:', token.length);
    console.log('Token preview:', token.substring(0, 50) + '...');
    
    // Decode token to see what's inside
    const decoded = jwt.decode(token, { complete: true });
    console.log('\n📋 Token Payload:');
    console.log('  - userId:', decoded.payload.userId);
    console.log('  - iat (issued at):', decoded.payload.iat);
    console.log('  - exp (expires at):', decoded.payload.exp);
    
    // Convert timestamps to readable dates
    const issuedAt = new Date(decoded.payload.iat * 1000);
    const expiresAt = new Date(decoded.payload.exp * 1000);
    const now = new Date();
    
    console.log('\n📅 Token Timing:');
    console.log('  - Issued at:', issuedAt.toISOString());
    console.log('  - Expires at:', expiresAt.toISOString());
    console.log('  - Current time:', now.toISOString());
    console.log('  - Time until expiration:', Math.round((expiresAt - now) / (1000 * 60 * 60 * 24)), 'days');
    console.log('  - Is expired?', now > expiresAt ? 'YES' : 'NO');
    
    // Test verification
    console.log('\n🔍 Token Verification Test');
    console.log('============================');
    
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token verification successful');
    console.log('Verified userId:', verified.userId);
    console.log('Verified iat:', verified.iat);
    console.log('Verified exp:', verified.exp);
    
} catch (error) {
    console.error('❌ Token test failed:', error.message);
    console.error('Error name:', error.name);
    console.error('Error stack:', error.stack);
}

// Test with different JWT_SECRET values to identify the issue
console.log('\n🧪 Secret Testing');
console.log('============================');

const testSecrets = [
    process.env.JWT_SECRET,
    process.env.JWT_SECRET.trim(),
    process.env.JWT_SECRET.replace(/\s+/g, ''),
    'yashrajsinhjadeja'
];

testSecrets.forEach((secret, index) => {
    try {
        console.log(`\nTest ${index + 1}:`);
        console.log(`Secret: "${secret}"`);
        
        const token = jwt.sign({ test: true }, secret, { expiresIn: '7d' });
        const verified = jwt.verify(token, secret);
        
        console.log('✅ Success with this secret');
    } catch (error) {
        console.log('❌ Failed with this secret:', error.message);
    }
});
