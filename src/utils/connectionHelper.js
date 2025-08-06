// MongoDB Connection Helper for Serverless
const mongoose = require('mongoose');

class ConnectionHelper {
    static async ensureConnection() {
        console.log('ConnectionHelper: Checking connection state...');
        
        // Check if already connected
        if (mongoose.connection.readyState === 1) {
            console.log('ConnectionHelper: Already connected to MongoDB');
            return true;
        }
        
        // If connecting, wait for it to complete
        if (mongoose.connection.readyState === 2) {
            console.log('ConnectionHelper: Connection in progress, waiting...');
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 30000); // 30 second timeout
                
                mongoose.connection.once('connected', () => {
                    clearTimeout(timeout);
                    console.log('ConnectionHelper: Connection established while waiting');
                    resolve(true);
                });
                
                mongoose.connection.once('error', (error) => {
                    clearTimeout(timeout);
                    console.error('ConnectionHelper: Connection error while waiting:', error);
                    reject(error);
                });
            });
        }
        
        // If disconnected or uninitialized, try to connect
        if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
            console.log('ConnectionHelper: Attempting to connect to MongoDB...');
            
            try {
                // Wait up to 30 seconds for connection
                await mongoose.connection.asPromise();
                console.log('ConnectionHelper: Successfully connected to MongoDB');
                return true;
            } catch (error) {
                console.error('ConnectionHelper: Failed to connect to MongoDB:', error);
                
                // For serverless, sometimes we need to force a reconnection
                if (process.env.VERCEL) {
                    console.log('ConnectionHelper: Vercel environment detected, attempting force reconnect...');
                    try {
                        await mongoose.disconnect();
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                        
                        const mongoUri = process.env.MONGODB_URI;
                        if (!mongoUri) {
                            throw new Error('MONGODB_URI not found in environment variables');
                        }
                        
                        await mongoose.connect(mongoUri, {
                            maxPoolSize: 3,
                            serverSelectionTimeoutMS: 25000,
                            socketTimeoutMS: 45000,
                            bufferCommands: false,
                            autoIndex: false,
                        });
                        
                        console.log('ConnectionHelper: Force reconnect successful');
                        return true;
                    } catch (reconnectError) {
                        console.error('ConnectionHelper: Force reconnect failed:', reconnectError);
                        throw reconnectError;
                    }
                } else {
                    throw error;
                }
            }
        }
        
        return false;
    }
    
    static getConnectionStatus() {
        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        
        return {
            state: mongoose.connection.readyState,
            description: states[mongoose.connection.readyState] || 'unknown',
            host: mongoose.connection.host,
            name: mongoose.connection.name
        };
    }
    
    static async waitForConnection(timeoutMs = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            if (mongoose.connection.readyState === 1) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        throw new Error(`Connection timeout after ${timeoutMs}ms`);
    }
}

module.exports = ConnectionHelper;
