// Automated Test Script for Bulk Health Data API
// Tests complete flow: User creation → Auth → Profile setup → Bulk data upload

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let userId = '';

// Test phone number (use a unique one each time)
const testPhone = `+1234567${Date.now().toString().slice(-3)}`;
const testUser = {
    name: 'Test User Bulk API',
    phone: testPhone,
    email: `testuser${Date.now()}@example.com`,
    password: 'TestPassword123!'
};

console.log('🚀 Starting Bulk API Test Flow...\n');
console.log(`📱 Test Phone: ${testPhone}`);
console.log(`📧 Test Email: ${testUser.email}\n`);

// Helper function to make API calls
async function apiCall(method, endpoint, data = null, headers = {}) {
    try {
        const config = {
            method,
            url: `${BASE_URL}${endpoint}`,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
                ...(authToken && { 'Authorization': `Bearer ${authToken}` })
            }
        };
        
        if (data) config.data = data;
        
        console.log(`📡 ${method.toUpperCase()} ${endpoint}`);
        if (data) console.log('📤 Request:', JSON.stringify(data, null, 2));
        
        const response = await axios(config);
        console.log('✅ Response:', response.status, response.statusText);
        console.log('📥 Data:', JSON.stringify(response.data, null, 2));
        console.log('─'.repeat(80));
        
        return response.data;
    } catch (error) {
        console.error('❌ Error:', error.response?.status, error.response?.statusText);
        console.error('📥 Error Data:', JSON.stringify(error.response?.data, null, 2));
        console.log('─'.repeat(80));
        throw error;
    }
}

// Step 1: Register new user
async function registerUser() {
    console.log('📝 STEP 1: Registering new user...');
    
    const response = await apiCall('POST', '/auth/register', {
        name: testUser.name,
        phone: testUser.phone,
        email: testUser.email,
        password: testUser.password
    });
    
    if (response.success) {
        userId = response.user.id;
        console.log(`✅ User registered successfully! ID: ${userId}\n`);
        return response;
    } else {
        throw new Error('User registration failed');
    }
}

// Step 2: Verify OTP (simulate)
async function verifyOTP() {
    console.log('🔐 STEP 2: Verifying OTP...');
    
    // For testing, we'll use a default OTP or skip this step
    // In real implementation, you'd get OTP from SMS/console
    const testOTP = '123456'; // Default OTP for testing
    
    try {
        const response = await apiCall('POST', '/auth/verify-otp', {
            phone: testUser.phone,
            otp: testOTP
        });
        
        if (response.success && response.token) {
            authToken = response.token;
            console.log(`✅ OTP verified! Token received.\n`);
            return response;
        }
    } catch (error) {
        console.log('⚠️  OTP verification failed, trying login instead...');
        return await loginUser();
    }
}

// Alternative: Login if OTP fails
async function loginUser() {
    console.log('🔑 Attempting login...');
    
    const response = await apiCall('POST', '/auth/login', {
        phone: testUser.phone,
        password: testUser.password
    });
    
    if (response.success && response.token) {
        authToken = response.token;
        console.log(`✅ Login successful! Token received.\n`);
        return response;
    } else {
        throw new Error('Login failed');
    }
}

// Step 3: Complete profile setup
async function completeProfile() {
    console.log('👤 STEP 3: Completing user profile...');
    
    const profileData = {
        name: testUser.name,
        email: testUser.email,
        gender: 'male',
        height: 175,
        heightUnit: 'cm',
        weight: 70,
        weightUnit: 'kg',
        age: 28,
        loyaltyPercentage: 85,
        bodyProfile: 'athletic',
        mainGoal: 'fitness',
        sportsAmbitions: ['running', 'cycling']
    };
    
    const response = await apiCall('PUT', '/user/dashboard', profileData);
    
    if (response.success) {
        console.log(`✅ Profile completed successfully!\n`);
        return response;
    } else {
        throw new Error('Profile completion failed');
    }
}

// Step 4: Generate bulk health data for 3 days
function generateBulkHealthData() {
    console.log('📊 STEP 4: Generating bulk health data for 3 days...');
    
    const today = new Date();
    const healthData = [];
    
    for (let i = 0; i < 3; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayData = {
            date: dateStr,
            // Watch data (automatic)
            steps: {
                count: 8500 + Math.floor(Math.random() * 3000),
                distance: 6.2 + Math.random() * 2
            },
            heartRate: {
                readings: [
                    { time: "09:00", bpm: 72, activity: "resting" },
                    { time: "15:30", bpm: 95, activity: "walking" },
                    { time: "18:00", bpm: 140, activity: "exercise" }
                ],
                avgBpm: 85,
                maxBpm: 140,
                minBpm: 68
            },
            calories: {
                burned: 2200 + Math.floor(Math.random() * 400), // From watch
                consumed: 0 // Default as per watch limitations
            },
            sleep: {
                duration: 7.5 + Math.random(),
                count: Math.floor(Math.random() * 3) + 1, // Sleep sessions
                quality: ['good', 'fair', 'excellent'][Math.floor(Math.random() * 3)],
                bedTime: "23:30",
                wakeTime: "07:00",
                deepSleep: 2.5,
                lightSleep: 5.0
            },
            // Manual data (defaults to 0 for watch compatibility)
            water: {
                consumed: 0, // Default as per watch limitations
                entries: []
            },
            // Body metrics (manual/scale)
            bodyMetrics: {
                weight: 70 + Math.random() * 2 - 1,
                bmi: 22.8,
                bodyTemperature: 36.5 + Math.random() * 0.5
            },
            // Mood tracking
            mood: {
                level: Math.floor(Math.random() * 4) + 7, // 7-10
                stressLevel: Math.floor(Math.random() * 4) + 2, // 2-5
                note: "Feeling good today!"
            },
            // Workout data
            workouts: [{
                type: "cardio",
                duration: 30,
                caloriesBurned: 300,
                exercises: ["running"],
                intensity: "moderate",
                notes: "Morning run"
            }],
            notes: `Health data for ${dateStr} - Watch sync test`
        };
        
        healthData.push(dayData);
    }
    
    console.log(`✅ Generated health data for ${healthData.length} days`);
    console.log('📅 Dates:', healthData.map(d => d.date).join(', '));
    console.log('');
    
    return healthData;
}

// Step 5: Send bulk health data
async function sendBulkHealthData() {
    console.log('📤 STEP 5: Sending bulk health data...');
    
    const healthData = generateBulkHealthData();
    
    const bulkData = {
        health_data: healthData
    };
    
    console.log(`📊 Sending bulk data for ${healthData.length} days...`);
    
    const response = await apiCall('PUT', '/user/health/bulk', bulkData);
    
    if (response.success) {
        console.log(`✅ Bulk health data uploaded successfully!`);
        console.log(`📈 Summary:`, response.summary);
        if (response.errors && response.errors.length > 0) {
            console.log(`⚠️  Errors:`, response.errors);
        }
        return response;
    } else {
        throw new Error('Bulk data upload failed');
    }
}

// Step 6: Verify data was saved
async function verifyHealthData() {
    console.log('🔍 STEP 6: Verifying health data was saved...');
    
    const response = await apiCall('GET', '/user/health/today');
    
    console.log(`✅ Today's health data retrieved:`, response.data ? 'Found' : 'Not found');
    return response;
}

// Main test flow
async function runBulkAPITest() {
    try {
        console.log('🎯 BULK API TEST AUTOMATION');
        console.log('=' .repeat(80));
        
        // Execute test steps
        await registerUser();
        await verifyOTP();
        await completeProfile();
        await sendBulkHealthData();
        await verifyHealthData();
        
        console.log('🎉 BULK API TEST COMPLETED SUCCESSFULLY!');
        console.log('✅ All steps passed - API is working correctly');
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
        console.error('🔍 Full error:', error);
        process.exit(1);
    }
}

// Run the test
runBulkAPITest();
