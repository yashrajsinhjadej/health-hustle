// src/config/db.js
const mongoose = require('mongoose');
const Logger = require('../utils/logger');

const connectDB = async () => {
    const requestId = Logger.generateId('db-connect');

    try {
        Logger.info(requestId, 'Starting MongoDB connection process');
        Logger.debug(requestId, 'Environment check', {
            NODE_ENV: process.env.NODE_ENV || 'not set',
            VERCEL: process.env.VERCEL || 'not set',
            MONGODB_URI_exists: !!process.env.MONGODB_URI
        });

        if (!process.env.MONGODB_URI) {
            Logger.error(requestId, 'MONGODB_URI environment variable is not set');
            return;
        }

        Logger.debug(requestId, 'MONGODB_URI preview', {
            preview: process.env.MONGODB_URI.substring(0, 30) + '...'
        });

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
            Logger.info(requestId, 'MongoDB connecting...')
        );

        mongoose.connection.on('connected', () =>
            Logger.success(requestId, 'MongoDB connected successfully!')
        );

        mongoose.connection.on('error', (err) => {
            Logger.error(requestId, 'MongoDB connection error', { error: err.message });
        });

        mongoose.connection.on('disconnected', () =>
            Logger.warn(requestId, 'MongoDB disconnected')
        );

        mongoose.connection.on('reconnected', () =>
            Logger.success(requestId, 'MongoDB reconnected')
        );

        await mongoose.connect(process.env.MONGODB_URI, mongoOptions);

        Logger.success(requestId, 'MongoDB Connected', {
            host: mongoose.connection.host,
            database: mongoose.connection.name
        });

    } catch (error) {
        Logger.error(requestId, 'MongoDB connection error', {
            error: error.message,
            stack: error.stack
        });
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    }
};

module.exports = connectDB;
