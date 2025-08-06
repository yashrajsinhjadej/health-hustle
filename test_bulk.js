const axios = require('axios');

// First, let's login to get a token
const loginData = {
    phoneNumber: "+919876543210", // Use your test phone number
    password: "password123"       // Use your test password
};

const testBulkAPI = async () => {
    try {
        console.log('🔐 Logging in to get auth token...');
        
        // Login to get token
        const loginResponse = await axios.post('http://localhost:3001/api/auth/login', loginData);
        
        if (!loginResponse.data.success) {
            console.error('❌ Login failed:', loginResponse.data);
            return;
        }
        
        const token = loginResponse.data.token;
        console.log('✅ Login successful, got token');
        
        // Test data (exact same as your request)
        const bulkData = {
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
        };
        
        console.log('📤 Testing bulk health API...');
        console.log('Data being sent:', JSON.stringify(bulkData, null, 2));
        
        // Test bulk API
        const bulkResponse = await axios.put('http://localhost:3001/api/health/bulk', bulkData, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Bulk API Response:');
        console.log(JSON.stringify(bulkResponse.data, null, 2));
        
    } catch (error) {
        console.error('❌ Error testing bulk API:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
};

testBulkAPI();
