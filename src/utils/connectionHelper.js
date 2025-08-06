// MongoDB Connection Helper for Serverless
const mongoose = require('mongoose');

class ConnectionHelper {
    static async ensureConnection() {
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`🔗 [${connectionId}] ConnectionHelper.ensureConnection START`);
        console.log(`🔗 [${connectionId}] Current MongoDB readyState: ${mongoose.connection.readyState}`);
        console.log(`🔗 [${connectionId}] ReadyState meaning: ${['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'}`);
        
        // Simple check: if connected, return true
        if (mongoose.connection.readyState === 1) {
            console.log(`🔗 [${connectionId}] Already connected - Host: ${mongoose.connection.host}, DB: ${mongoose.connection.name}`);
            return true;
        }
        
        // If not connected, wait for connection with timeout
        console.log(`🔗 [${connectionId}] Not connected, waiting for connection...`);
        console.log(`🔗 [${connectionId}] Environment: NODE_ENV=${process.env.NODE_ENV}, VERCEL=${process.env.VERCEL}`);
        console.log(`🔗 [${connectionId}] MongoDB URI exists: ${!!process.env.MONGODB_URI}`);
        
        const timeout = 20000; // 20 seconds timeout
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const currentState = mongoose.connection.readyState;
            console.log(`🔗 [${connectionId}] Waiting... ReadyState: ${currentState} (${Date.now() - startTime}ms elapsed)`);
            
            if (currentState === 1) {
                console.log(`🔗 [${connectionId}] ✅ MongoDB connection established after ${Date.now() - startTime}ms`);
                console.log(`🔗 [${connectionId}] Connection details - Host: ${mongoose.connection.host}, DB: ${mongoose.connection.name}`);
                return true;
            }
            
            // If disconnected, log it
            if (currentState === 0) {
                console.log(`🔗 [${connectionId}] State is disconnected (0)`);
            } else if (currentState === 2) {
                console.log(`🔗 [${connectionId}] State is connecting (2)`);
            } else if (currentState === 3) {
                console.log(`🔗 [${connectionId}] State is disconnecting (3)`);
            }
            
            // Wait 100ms before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // If we reach here, connection failed
        console.error(`🔗 [${connectionId}] ❌ MongoDB connection timeout after 20 seconds`);
        console.error(`🔗 [${connectionId}] Final readyState: ${mongoose.connection.readyState}`);
        console.error(`🔗 [${connectionId}] Connection host: ${mongoose.connection.host}`);
        console.error(`🔗 [${connectionId}] Connection error:`, mongoose.connection.error);
        throw new Error('MongoDB connection timeout');
    }
}

module.exports = ConnectionHelper;
