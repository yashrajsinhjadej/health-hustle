// MongoDB connection logic extracted from index.js
const mongoose = require('mongoose');
const connectDB = async () => {
    try {
        console.log('🔍 Starting MongoDB connection process...');
        console.log('🔍 Environment variables check:');
        console.log('   - NODE_ENV:', process.env.NODE_ENV || 'not set');
        console.log('   - VERCEL:', process.env.VERCEL || 'not set');
        console.log('   - MONGODB_URI exists:', !!process.env.MONGODB_URI);
        
        if (!process.env.MONGODB_URI) {
            console.error('❌ MONGODB_URI environment variable is not set');
            return;
        }

        console.log('🔍 MONGODB_URI preview:', process.env.MONGODB_URI.substring(0, 30) + '...');
        console.log('🔍 MONGODB_URI full length:', process.env.MONGODB_URI.length);
        console.log('🔍 MONGODB_URI contains @:', process.env.MONGODB_URI.includes('@'));
        console.log('🔍 MONGODB_URI contains %40:', process.env.MONGODB_URI.includes('%40'));

        try {
            const uri = process.env.MONGODB_URI;
            const protocolMatch = uri.match(/^(mongodb\+srv:\/\/)/);
            const userPassMatch = uri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@/);
            const hostMatch = uri.match(/@([^\/]+)\//);
            const dbMatch = uri.match(/\/([^?]+)\?/);
            
            console.log('🔍 Connection string analysis:');
            console.log('   - Protocol:', protocolMatch ? protocolMatch[1] : 'NOT_FOUND');
            console.log('   - Username:', userPassMatch ? userPassMatch[1] : 'NOT_FOUND');
            console.log('   - Password length:', userPassMatch ? userPassMatch[2].length : 'NOT_FOUND');
            console.log('   - Password contains @:', userPassMatch ? userPassMatch[2].includes('@') : 'NOT_FOUND');
            console.log('   - Host:', hostMatch ? hostMatch[1] : 'NOT_FOUND');
            console.log('   - Database:', dbMatch ? dbMatch[1] : 'NOT_FOUND');
        } catch (parseError) {
            console.error('❌ Error parsing connection string:', parseError.message);
        }

        const mongoOptions = {
            maxPoolSize: 50,
            serverSelectionTimeoutMS: 20000,
            socketTimeoutMS: 45000,
            family: 4,
            retryWrites: true,
            w: 'majority',
            bufferCommands: false,
            autoIndex: true,
            maxIdleTimeMS: 30000,
            connectTimeoutMS: 20000,
            heartbeatFrequencyMS: 10000,
            compressors: 'zlib',
            zlibCompressionLevel: 1,
        };

        console.log('🔍 MongoDB options configured:', JSON.stringify(mongoOptions, null, 2));
        console.log('🔄 Attempting to connect to MongoDB...');

        mongoose.connection.on('connecting', () => {
            console.log('🔄 MongoDB connecting...');
        });
        mongoose.connection.on('connected', () => {
            console.log('✅ MongoDB connected successfully!');
        });
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
            console.error('❌ Error stack:', err.stack);
            console.error('❌ Error code:', err.code);
            console.error('❌ Error name:', err.name);
        });
        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected');
        });
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });
        mongoose.connection.on('close', () => {
            console.log('🔒 MongoDB connection closed');
        });

        try {
            await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
            console.log('✅ Connected to MongoDB Atlas with connection pooling (maxPoolSize: 5)');
            console.log('🔍 Connection details:');
            console.log('   - Host:', mongoose.connection.host);
            console.log('   - Port:', mongoose.connection.port);
            console.log('   - Database:', mongoose.connection.name);
            console.log('   - Ready State:', mongoose.connection.readyState);
            console.log('   - Connection ID:', mongoose.connection.id);
        } catch (connectError) {
            console.error('❌ Mongoose.connect() failed:');
            console.error('   - Error message:', connectError.message);
            console.error('   - Error name:', connectError.name);
            console.error('   - Error code:', connectError.code);
            console.error('   - Error stack:', connectError.stack);
            if (connectError.name === 'MongoParseError') {
                console.error('❌ This is a connection string parsing error');
            } else if (connectError.name === 'MongoNetworkError') {
                console.error('❌ This is a network connectivity error');
            } else if (connectError.name === 'MongoServerSelectionError') {
                console.error('❌ This is a server selection error');
            } else if (connectError.name === 'MongoAuthenticationError') {
                console.error('❌ This is an authentication error');
            }
            throw connectError;
        }
    } catch (error) {
        console.error('❌ MongoDB connection error in outer catch:');
        console.error('   - Error message:', error.message);
        console.error('   - Error name:', error.name);
        console.error('   - Error code:', error.code);
        console.error('   - Error stack:', error.stack);
        if (error.message.includes('Invalid scheme')) {
            console.error('❌ CONNECTION STRING FORMAT ERROR: Check if MONGODB_URI starts with mongodb+srv://');
        } else if (error.message.includes('Authentication failed')) {
            console.error('❌ AUTHENTICATION ERROR: Check username/password');
        } else if (error.message.includes('ENOTFOUND')) {
            console.error('❌ DNS ERROR: Cannot resolve hostname');
        } else if (error.message.includes('ECONNREFUSED')) {
            console.error('❌ CONNECTION REFUSED: Network access issue');
        } else if (error.message.includes('ETIMEDOUT')) {
            console.error('❌ TIMEOUT ERROR: Connection timed out');
        }
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    }
};

module.exports = connectDB;
