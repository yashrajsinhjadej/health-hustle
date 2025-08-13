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
        
        // If not connected, check if we have a valid URI first
        if (!process.env.MONGODB_URI) {
            console.error(`🔗 [${connectionId}] ❌ MONGODB_URI environment variable is missing`);
            throw new Error('MONGODB_URI environment variable is not set');
        }
        
        // Validate URI format
        if (!process.env.MONGODB_URI.startsWith('mongodb+srv://') && !process.env.MONGODB_URI.startsWith('mongodb://')) {
            console.error(`🔗 [${connectionId}] ❌ Invalid MONGODB_URI format. Must start with mongodb+srv:// or mongodb://`);
            throw new Error('Invalid MONGODB_URI format');
        }
        
        console.log(`🔗 [${connectionId}] Not connected, attempting to connect...`);
        console.log(`🔗 [${connectionId}] Environment: NODE_ENV=${process.env.NODE_ENV}, VERCEL=${process.env.VERCEL}`);
        console.log(`🔗 [${connectionId}] MongoDB URI exists: ${!!process.env.MONGODB_URI}`);
        console.log(`🔗 [${connectionId}] MongoDB URI preview: ${process.env.MONGODB_URI.substring(0, 30)}...`);
        
        // Try to establish connection with timeout
        const timeout = 15000; // 15 seconds timeout (reduced from 20)
        const startTime = Date.now();
        
        // First, try to connect if not already connecting
        if (mongoose.connection.readyState === 0) {
            try {
                console.log(`🔗 [${connectionId}] Attempting to connect to MongoDB...`);
                
                const mongoOptions = {
                    maxPoolSize: 5,
                    serverSelectionTimeoutMS: 10000,
                    socketTimeoutMS: 30000,
                    family: 4,
                    retryWrites: true,
                    w: 'majority',
                    bufferCommands: false,
                    autoIndex: false,
                    maxIdleTimeMS: 30000,
                    connectTimeoutMS: 10000,
                    heartbeatFrequencyMS: 10000,
                };
                
                await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
                console.log(`🔗 [${connectionId}] ✅ MongoDB connection established after ${Date.now() - startTime}ms`);
                console.log(`🔗 [${connectionId}] Connection details - Host: ${mongoose.connection.host}, DB: ${mongoose.connection.name}`);
                return true;
                
            } catch (connectError) {
                console.error(`🔗 [${connectionId}] ❌ MongoDB connection failed:`, connectError.message);
                console.error(`🔗 [${connectionId}] Error details:`, {
                    name: connectError.name,
                    code: connectError.code,
                    stack: connectError.stack
                });
                
                // Provide specific error guidance
                if (connectError.name === 'MongoParseError') {
                    throw new Error('Invalid MongoDB connection string format');
                } else if (connectError.name === 'MongoNetworkError') {
                    throw new Error('Network error - cannot reach MongoDB server');
                } else if (connectError.name === 'MongoServerSelectionError') {
                    throw new Error('Cannot select MongoDB server - check cluster status');
                } else if (connectError.name === 'MongoAuthenticationError') {
                    throw new Error('Authentication failed - check username/password');
                } else {
                    throw new Error(`MongoDB connection failed: ${connectError.message}`);
                }
            }
        }
        
        // If already connecting, wait with timeout
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
        console.error(`🔗 [${connectionId}] ❌ MongoDB connection timeout after 15 seconds`);
        console.error(`🔗 [${connectionId}] Final readyState: ${mongoose.connection.readyState}`);
        console.error(`🔗 [${connectionId}] Connection host: ${mongoose.connection.host}`);
        console.error(`🔗 [${connectionId}] Connection error:`, mongoose.connection.error);
        throw new Error('MongoDB connection timeout - check your connection string and network connectivity');
    }
}

module.exports = ConnectionHelper;
