// Health Hustle Backend Server - Updated validation system
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const ResponseHandler = require('./src/utils/responseHandler');


// Routes
const authRoutes = require('./src/routes/authRoutes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes/adminRoutes');
const userRoutes = require('./src/routes/userRoutes/userRoutes');
const healthRoutes = require('./src/routes/healthRoutes/healthRoutes');

const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Limit file size to 5MB
});



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
    // Skip for health check and debug routes (not API routes)
    if (req.path === '/health' || req.path === '/debug' || req.path === '/test-connection' || req.path === '/env-debug') {
        return next();
    }
    
    try {
        // Check if MongoDB is connected
        if (mongoose.connection.readyState === 1) {
            // Already connected, proceed
            console.log('✅ MongoDB already connected for:', req.path);
            return next();
        }
        
        // Not connected, use ConnectionHelper to wait for connection
        console.log('🔄 MongoDB not connected for API request, attempting to connect...');
        console.log('📥 Request path:', req.path);
        console.log('📥 Request method:', req.method);
        
        // Import and use ConnectionHelper for consistent connection handling
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
        
        // Use ConnectionHelper to wait for database connection
        let dbStatus = 'disconnected';
        let dbHost = null;
        
        try {
            console.log('🔄 Health check - Waiting for MongoDB connection...');
            
            // Import and use ConnectionHelper
            const ConnectionHelper = require('./src/utils/connectionHelper');
            await ConnectionHelper.ensureConnection();
            
            // If we reach here, connection is successful
            dbStatus = 'connected';
            dbHost = mongoose.connection.host;
            console.log('✅ MongoDB connected successfully during health check');
            
        } catch (dbError) {
            console.error('❌ MongoDB connection failed during health check:', dbError);
            dbStatus = 'disconnected';
        }
        
        // Check Twilio status
        const TwilioSMSService = require('./src/services/twilioSMSService');
        const twilioStatus = await TwilioSMSService.healthCheck();

        //check aws s3 status 
        const s3 = require('./src/services/s3service');
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
            twilio: twilioStatus,
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
