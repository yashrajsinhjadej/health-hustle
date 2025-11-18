// src/config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        console.log('🔍 Starting MongoDB connection process...');
        console.log('🔍 Environment:');
        console.log('   - NODE_ENV:', process.env.NODE_ENV || 'not set');
        console.log('   - VERCEL:', process.env.VERCEL || 'not set');
        console.log('   - MONGODB_URI exists:', !!process.env.MONGODB_URI);

        if (!process.env.MONGODB_URI) {
            console.error('❌ MONGODB_URI environment variable is not set');
            return;
        }

        console.log('🔍 MONGODB_URI preview:', process.env.MONGODB_URI.substring(0, 30) + '...');
       
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

        mongoose.connection.on('connecting', () =>
            console.log('🔄 MongoDB connecting...')
        );

        mongoose.connection.on('connected', () =>
            console.log('✅ MongoDB connected successfully!')
        );

        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err.message);
        });

        mongoose.connection.on('disconnected', () =>
            console.log('⚠️ MongoDB disconnected')
        );

        mongoose.connection.on('reconnected', () =>
            console.log('🔁 MongoDB reconnected')
        );

        await mongoose.connect(process.env.MONGODB_URI, mongoOptions);

        console.log('🚀 MongoDB Connected:');
        console.log('   - Host:', mongoose.connection.host);
        console.log('   - DB:', mongoose.connection.name);

    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    }
};

module.exports = connectDB;
