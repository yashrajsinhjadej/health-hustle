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

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

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

// MongoDB connection function
const connectDB = async () => {
    try {
        console.log('🔍 Starting MongoDB connection process...');
        console.log('🔍 Environment variables check:');
        console.log('   - NODE_ENV:', process.env.NODE_ENV || 'not set');
        console.log('   - VERCEL:', process.env.VERCEL || 'not set');
        console.log('   - MONGODB_URI exists:', !!process.env.MONGODB_URI);
        
        // Check if MONGODB_URI is set
        if (!process.env.MONGODB_URI) {
            console.error('❌ MONGODB_URI environment variable is not set');
            return;
        }

        console.log('🔍 MONGODB_URI preview:', process.env.MONGODB_URI.substring(0, 30) + '...');

        const mongoOptions = {
            maxPoolSize: 5,               // Reduced for serverless
            serverSelectionTimeoutMS: 15000, // 15 seconds timeout for Vercel
            socketTimeoutMS: 45000,       // 45 seconds socket timeout
            family: 4,                    // Use IPv4, skip trying IPv6
            retryWrites: true,
            w: 'majority',
            // Vercel-specific optimizations
            bufferCommands: false,        // Disable mongoose buffering
            autoIndex: false,             // Disable auto-indexing in production
            maxIdleTimeMS: 30000,         // Close connections after 30 seconds of inactivity
            // Additional options for better serverless compatibility
            connectTimeoutMS: 15000,      // Connection timeout
            heartbeatFrequencyMS: 10000,  // Heartbeat frequency
        };

        console.log('🔍 MongoDB options configured:', JSON.stringify(mongoOptions, null, 2));
        console.log('🔄 Attempting to connect to MongoDB...');
        
        await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
        console.log('✅ Connected to MongoDB Atlas with connection pooling (maxPoolSize: 5)');
        console.log('🔍 Connection details:');
        console.log('   - Host:', mongoose.connection.host);
        console.log('   - Port:', mongoose.connection.port);
        console.log('   - Database:', mongoose.connection.name);
        console.log('   - Ready State:', mongoose.connection.readyState);
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
            console.error('❌ Error stack:', err.stack);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });
        
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error name:', error.name);
        
        // Don't exit process in serverless environment
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    }
};

// Connect to MongoDB on startup
console.log('🚀 Starting Health Hustle server...');
connectDB();

// Home route
app.get('/', (req, res) => {
    console.log('🏠 Home route accessed');
    res.json({
        success: true,
        message: 'Health Hustle API Server is running! 🚀',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            auth: '/api/auth',
            user: '/api/user',
            admin: '/api/admin'
        },
        documentation: 'Check /health for detailed server status'
    });
});

// Debug route for MongoDB connection testing
app.get('/debug', (req, res) => {
    console.log('🔍 Debug route accessed');
    const mongoUri = process.env.MONGODB_URI;
    const hasMongoUri = !!mongoUri;
    const mongoUriPreview = hasMongoUri ? 
        mongoUri.substring(0, 20) + '...' + mongoUri.substring(mongoUri.length - 20) : 
        'Not set';
    
    const debugInfo = {
        success: true,
        message: 'Debug Information',
        timestamp: new Date().toISOString(),
        environment: {
            NODE_ENV: process.env.NODE_ENV || 'not set',
            hasMongoUri: hasMongoUri,
            mongoUriPreview: mongoUriPreview,
            mongoConnectionState: mongoose.connection.readyState,
            mongoConnectionStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'
        },
        mongoose: {
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name,
            readyStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'
        },
        connectionInfo: {
            hasConnectionString: !!process.env.MONGODB_URI,
            connectionStringLength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
            isProduction: process.env.NODE_ENV === 'production',
            serverless: process.env.VERCEL === '1'
        }
    };
    
    console.log('🔍 Debug info:', JSON.stringify(debugInfo, null, 2));
    res.json(debugInfo);
});

// Enhanced Health check route
app.get('/health', async (req, res) => {
    console.log('🏥 Health check route accessed');
    try {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();
        const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        
        console.log('🔍 Health check details:');
        console.log('   - Memory usage:', memUsage);
        console.log('   - Uptime:', uptime);
        console.log('   - DB Status:', dbStatus);
        console.log('   - MongoDB ready state:', mongoose.connection.readyState);
        
        // Check Twilio status
        const TwilioSMSService = require('./src/services/twilioSMSService');
        const twilioStatus = await TwilioSMSService.healthCheck();
        
        const healthResponse = {
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
                name: 'health-hustle',
                readyState: mongoose.connection.readyState,
                host: mongoose.connection.host
            },
            twilio: twilioStatus,
            environment: process.env.NODE_ENV || 'development'
        };
        
        console.log('🏥 Health response:', JSON.stringify(healthResponse, null, 2));
        res.json(healthResponse);
    } catch (error) {
        console.error('❌ Health check error:', error);
        console.error('❌ Error stack:', error.stack);
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
    console.log('❌ 404 - Route not found:', req.originalUrl);
    res.status(404).json({
        success: false,
        message: 'API route not found'
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Health Hustle server running on port ${PORT}`);
        console.log(`📍 Server URL: http://localhost:${PORT}`);
    });
}

// Export for Vercel serverless
module.exports = app;
