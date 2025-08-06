// MongoDB Connection Helper for Serverless
const mongoose = require('mongoose');

class ConnectionHelper {
    static async ensureConnection() {
        // Simple check: if connected, return true
        if (mongoose.connection.readyState === 1) {
            return true;
        }
        
        // If not connected, wait for connection with timeout
        console.log('⏳ Waiting for MongoDB connection...');
        
        const timeout = 20000; // 20 seconds timeout
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (mongoose.connection.readyState === 1) {
                console.log('✅ MongoDB connection established');
                return true;
            }
            
            // Wait 100ms before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // If we reach here, connection failed
        console.error('❌ MongoDB connection timeout after 20 seconds');
        throw new Error('MongoDB connection timeout');
    }
}

module.exports = ConnectionHelper;
