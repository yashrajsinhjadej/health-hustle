// filename: server.js
// Health Hustle Backend Server - Updated validation system
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const ResponseHandler = require('./src/utils/ResponseHandler');

const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Limit file size to 5MB
});
// starting cron job for notifications
// const startNotificationCron = require('./src/services/notificationCron');
// startNotificationCron();




const app = express();

// Add request logging middleware
app.use((req, res, next) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.requestId = requestId; // Attach to request for use in controllers
    
    console.log(`📥 [${requestId}] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log(`📥 [${requestId}] Headers:`, req.headers);
    console.log(`📥 [${requestId}] IP:`, req.ip || req.connection.remoteAddress);
    console.log(`📥 [${requestId}] User-Agent:`, req.get('User-Agent'));
    
    if (req.body && Object.keys(req.body).length > 0) {
        console.log(`📥 [${requestId}] Body:`, req.body);
    }
    
    if (req.query && Object.keys(req.query).length > 0) {
        console.log(`📥 [${requestId}] Query:`, req.query);
    }
    
    if (req.params && Object.keys(req.params).length > 0) {
        console.log(`📥 [${requestId}] Params:`, req.params);
    }
    
    // Log response
    const originalSend = res.send;
    res.send = function(data) {
        console.log(`📤 [${requestId}] Response sent - Status: ${res.statusCode}`);
        if (res.statusCode >= 400) {
            console.log(`📤 [${requestId}] Error response:`, data);
        }
        originalSend.call(this, data);
    };
    
    next();
});

const User = require('./models/User');

(function checkUserSchema() {
  try {
    const tzPath = User.schema.path('timezone');
    console.log('[boot] User schema timezone path:', tzPath);
    console.log('[boot] User schema paths count:', Object.keys(User.schema.paths).length);
  } catch (e) {
    console.error('[boot] Failed to inspect User schema:', e);
  }
})();


// Security Middleware - Apply helmet before other middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Other Middleware
app.use(cors());

// Enforce request body size limits (adjust values as needed)
app.use(express.json({ limit: '2mb' })); // JSON payloads up to 2MB
app.use(express.urlencoded({ extended: true, limit: '2mb' })); // Form payloads up to 2MB

// Explicit handler for payload too large errors from body parsers
app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        console.error('❌ Payload too large:', err.message);
        return ResponseHandler.error(res, 413, 'Payload Too Large');
    }
    next(err);
});

// Connect to MongoDB on startup using external helper
console.log(' Starting Health Hustle server...');
console.log('🔍 ===== ENVIRONMENT VARIABLES DEBUG =====');
console.log('🔍 Environment check for URL configuration:');
console.log('🔍 - NODE_ENV:', process.env.NODE_ENV);
console.log('🔍 - VERCEL:', process.env.VERCEL);
console.log('🔍 - VERCEL_URL:', process.env.VERCEL_URL);
console.log('🔍 - VERCEL_ENV:', process.env.VERCEL_ENV);
console.log('🔍 - FRONTEND_URL exists:', !!process.env.FRONTEND_URL);
console.log('🔍 - FRONTEND_URL value:', `"${process.env.FRONTEND_URL}"`);
console.log('🔍 - FRONTEND_URL type:', typeof process.env.FRONTEND_URL);
console.log('🔍 - All env keys containing "URL":', Object.keys(process.env).filter(key => key.includes('URL')));
console.log('🔍 ===== END ENVIRONMENT DEBUG =====');
const connectDB = require('./src/utils/mongoConnect');
connectDB();

// Global MongoDB connection middleware - ensures DB is connected for all API requests
const ensureMongoDBConnection = async (req, res, next) => {
    if (req.path === '/health' || req.path === '/debug' || req.path === '/test-connection' || req.path === '/env-debug') {
        return next();
    }
    
    try {
        if (mongoose.connection.readyState === 1) {
            console.log('✅ MongoDB already connected for:', req.path);
            return next();
        }
        
        console.log('🔄 MongoDB not connected for API request, attempting to connect...');
        console.log('📥 Request path:', req.path);
        console.log('📥 Request method:', req.method);
        
        const ConnectionHelper = require('./src/utils/connectionHelper');
        await ConnectionHelper.ensureConnection();
        
        console.log('✅ MongoDB connected successfully for API request:', req.path);
        next();
    } catch (error) {
        console.error('❌ MongoDB connection failed for API request:', error.message);
        console.error('❌ Request path:', req.path);
        ResponseHandler.serverError(res, 'Service temporarily unavailable. Please try again.');
    }
};

// Enhanced Health check route with MongoDB connection wait
app.get('/health', async (req, res) => {
    console.log('🏥 Health check route accessed');
    const ip = req.ip
    console.log('📥 Request IP:', ip);

    try {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        console.log('🔍 Health check details:');
        console.log('   - Memory usage:', memUsage);
        console.log('   - Uptime:', uptime);
        console.log('   - MongoDB ready state:', mongoose.connection.readyState);
        
        let dbStatus = 'disconnected';
        let dbHost = null;
        
        try {
            console.log('🔄 Health check - Waiting for MongoDB connection...');
            const ConnectionHelper = require('./src/utils/connectionHelper');
            await ConnectionHelper.ensureConnection();
            dbStatus = 'connected';
            dbHost = mongoose.connection.host;
            console.log('✅ MongoDB connected successfully during health check');
        } catch (dbError) {
            console.error('❌ MongoDB connection failed during health check:', dbError);
            dbStatus = 'disconnected';
        }
        
        const SMSProviderFactory = require('./src/services/sms/SMSProviderFactory');
        const smsStatus = await SMSProviderFactory.healthCheck();

        const s3 = require('./src/services/s3Service.js');
        const s3Status = await s3.healthCheck();
        
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
                host: dbHost
            },
            sms: smsStatus,
            s3: s3Status,
            environment: process.env.NODE_ENV || 'development'
        };
        
        console.log('🏥 Health response:', JSON.stringify(healthResponse, null, 2));
        res.json(healthResponse);
    } catch (error) {
        console.error('❌ Health check error:', error);
        console.error('❌ Error stack:', error.stack);
        ResponseHandler.serverError(res, 'Health check failed');
    }
});

// =======================
// Redis client + rate limiter integration (ADDED)
// =======================

// Import Redis client and rate limiter (CommonJS style to match the file)
const redisClient = require('./src/utils/redisClient.js').client;
const { rateLimiter } = require('./src/middleware/redisrateLimiter.js');

// Attach Redis client event listeners for visibility
if (redisClient && typeof redisClient.on === 'function') {
    redisClient.on('error', (err) => {
        console.error('❌ Redis Client Error:', err);
    });
    redisClient.on('connect', () => {
        console.log('✅ Redis connected');
    });
    redisClient.on('ready', () => {
        console.log('✅ Redis ready to accept commands');
    });
    // For node-redis v4, connect() may be required if not already done in redisClient.js
    (async () => {
        try {
            if (typeof redisClient.connect === 'function') {
                await redisClient.connect();
            }
        } catch (err) {
            console.error('❌ Failed to connect to Redis on startup:', err);
            // Choose fail-fast if Redis is mandatory:
            // process.exit(1);
        }
    })();
} else {
    console.warn('⚠ Redis client not initialized or missing event API.');
}


// Apply MongoDB connection middleware to all API routes
app.use('/api', ensureMongoDBConnection);

// API Routes
const apiRoutes = require('./src/routes');
app.use('/api', apiRoutes);

// 404 handler
app.use('*', (req, res) => {
    console.log('❌ 404 - Route not found:', req.originalUrl);
    ResponseHandler.notFound(res, 'API route not found');
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    console.error('❌ Error stack:', error.stack);
    ResponseHandler.serverError(res, 'Internal server error');
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
