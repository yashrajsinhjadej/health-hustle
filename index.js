// Health Hustle Backend Server
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');



// Routes
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const userRoutes = require('./src/routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware - Apply helmet before other middleware
app.use(helmet({
    // Configure for API usage
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles if needed
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false, // Disable for API compatibility
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
    }
}));

// Other Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Check required environment variables
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
}

if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET environment variable is required');
    process.exit(1);
}

// MongoDB connection with retry logic for serverless
let mongoConnected = false;

const connectToMongo = async () => {
    try {
        console.log('🔗 Attempting MongoDB connection...');
        console.log('📡 Connection string:', process.env.MONGODB_URI ? 'Present' : 'Missing');
        console.log('🌐 Environment:', process.env.NODE_ENV);
        
        // Try with explicit connection string parameters
        const mongoUri = process.env.MONGODB_URI + '?retryWrites=true&w=majority&maxPoolSize=1&serverSelectionTimeoutMS=5000&socketTimeoutMS=5000&connectTimeoutMS=5000';
        
        console.log('🔗 Using enhanced connection string');
        
        const connectionPromise = mongoose.connect(mongoUri);
        
        // Add timeout to the connection
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Connection timeout after 5 seconds')), 5000);
        });
        
        await Promise.race([connectionPromise, timeoutPromise]);
        
        mongoConnected = true;
        console.log('✅ Connected to MongoDB Atlas (basic connection)');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.error('🔍 Error type:', error.constructor.name);
        
        // Try one more time with even simpler approach
        try {
            console.log('🔄 Retrying with minimal connection...');
            await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 1 });
            mongoConnected = true;
            console.log('✅ Connected to MongoDB Atlas (retry successful)');
        } catch (retryError) {
            console.error('❌ MongoDB retry also failed:', retryError.message);
            mongoConnected = false;
        }
    }
};

// Connect to MongoDB (non-blocking)
connectToMongo().catch(error => {
    console.error('❌ Initial MongoDB connection failed:', error.message);
    // Don't block server startup - let it try again on first request
});

// Simple test endpoint (no MongoDB required)
app.get('/test', (req, res) => {
    res.json({
        message: 'Server is running!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.2',
        mongoUri: process.env.MONGODB_URI ? 'Present' : 'Missing',
        mongoConnected: mongoConnected
    });
});

// Enhanced Health check route (serverless-optimized)
app.get('/health', async (req, res) => {
    try {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();
        const dbStatus = mongoConnected && mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        
        // Check Twilio status (with timeout)
        let twilioStatus = { status: 'unavailable', message: 'Twilio not configured' };
        try {
            const TwilioSMSService = require('./src/services/twilioSMSService');
            twilioStatus = await Promise.race([
                TwilioSMSService.healthCheck(),
                new Promise(resolve => setTimeout(() => resolve({ status: 'timeout', message: 'Twilio check timed out' }), 2000))
            ]);
        } catch (error) {
            twilioStatus = { status: 'error', message: error.message };
        }
        
        res.json({
            status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
            message: 'Health Hustle API Server is running!',
            timestamp: new Date().toISOString(),
            uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            memory: {
                used: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
                total: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`
            },
            database: {
                status: dbStatus,
                name: 'health-hustle'
            },
            twilio: twilioStatus,
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: error.message
        });
    }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API route not found'
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Export for Vercel deployment
module.exports = app;

// Start server only for local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Health Hustle server running on port ${PORT}`);
        console.log(`Server URL: http://localhost:${PORT}`);
    });
}
