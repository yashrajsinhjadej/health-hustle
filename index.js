// Health Hustle Backend Server - Updated validation system
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const ResponseHandler = require('./src/utils/ResponseHandler');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const userRoutes = require('./src/routes/userRoutes');
const healthRoutes = require('./src/routes/healthRoutes');

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
        console.log('🔍 MONGODB_URI full length:', process.env.MONGODB_URI.length);
        console.log('🔍 MONGODB_URI contains @:', process.env.MONGODB_URI.includes('@'));
        console.log('🔍 MONGODB_URI contains %40:', process.env.MONGODB_URI.includes('%40'));

        // Parse connection string to check components
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
            maxPoolSize: 10,              // Increased for better serverless handling
            serverSelectionTimeoutMS: 20000, // Increased timeout for Vercel
            socketTimeoutMS: 45000,       // 45 seconds socket timeout
            family: 4,                    // Use IPv4, skip trying IPv6
            retryWrites: true,
            w: 'majority',
            // Vercel-specific optimizations
            bufferCommands: false,        // Critical: Disable mongoose buffering for serverless
            autoIndex: false,             // Disable auto-indexing in production
            maxIdleTimeMS: 30000,         // Close connections after 30 seconds of inactivity
            // Additional options for better serverless compatibility
            connectTimeoutMS: 20000,      // Increased connection timeout
            heartbeatFrequencyMS: 10000,  // Heartbeat frequency
            // Additional serverless optimizations
            compressors: 'zlib',          // Enable compression
            zlibCompressionLevel: 1,      // Low compression for speed
        };

        console.log('🔍 MongoDB options configured:', JSON.stringify(mongoOptions, null, 2));
        console.log('🔄 Attempting to connect to MongoDB...');
        
        // Add connection event listeners before connecting
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
        
        // Try to connect with detailed error handling
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
            
            // Check for specific error types
            if (connectError.name === 'MongoParseError') {
                console.error('❌ This is a connection string parsing error');
            } else if (connectError.name === 'MongoNetworkError') {
                console.error('❌ This is a network connectivity error');
            } else if (connectError.name === 'MongoServerSelectionError') {
                console.error('❌ This is a server selection error');
            } else if (connectError.name === 'MongoAuthenticationError') {
                console.error('❌ This is an authentication error');
            }
            
            throw connectError; // Re-throw to be caught by outer try-catch
        }
        
    } catch (error) {
        console.error('❌ MongoDB connection error in outer catch:');
        console.error('   - Error message:', error.message);
        console.error('   - Error name:', error.name);
        console.error('   - Error code:', error.code);
        console.error('   - Error stack:', error.stack);
        
        // Additional error analysis
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

// Environment variable debug route
app.get('/env-debug', (req, res) => {
    console.log('🔍 Environment debug route accessed');
    const mongoUri = process.env.MONGODB_URI;
    
    res.json({
        success: true,
        message: 'Environment Variable Debug',
        timestamp: new Date().toISOString(),
        mongoUri: {
            exists: !!mongoUri,
            length: mongoUri ? mongoUri.length : 0,
            startsWithMongo: mongoUri ? mongoUri.startsWith('mongodb') : false,
            startsWithMongoUri: mongoUri ? mongoUri.startsWith('MONGODB_URI=') : false,
            value: mongoUri || 'NOT_SET',
            preview: mongoUri ? mongoUri.substring(0, 50) + '...' : 'NOT_SET'
        },
        environment: {
            NODE_ENV: process.env.NODE_ENV,
            VERCEL: process.env.VERCEL,
            hasMongoUri: !!process.env.MONGODB_URI
        }
    });
});

// Test MongoDB connection route
app.get('/test-connection', async (req, res) => {
    console.log('🔍 Test connection route accessed');
    
    try {
        console.log('🔄 Attempting to test MongoDB connection...');
        console.log('🔍 Current connection state:', mongoose.connection.readyState);
        
        // Test if we can connect
        if (mongoose.connection.readyState === 1) {
            console.log('✅ Already connected to MongoDB');
            res.json({
                success: true,
                message: 'Already connected to MongoDB',
                connectionState: mongoose.connection.readyState,
                host: mongoose.connection.host,
                database: mongoose.connection.name
            });
        } else {
            console.log('🔄 Connection not ready, attempting to connect...');
            
            // Try to connect
            await mongoose.connect(process.env.MONGODB_URI, {
                maxPoolSize: 5,
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS: 45000,
                family: 4,
                retryWrites: true,
                w: 'majority',
                bufferCommands: false,
                autoIndex: false,
                maxIdleTimeMS: 30000,
                connectTimeoutMS: 10000,
                heartbeatFrequencyMS: 10000,
            });
            
            console.log('✅ Test connection successful!');
            res.json({
                success: true,
                message: 'Test connection successful',
                connectionState: mongoose.connection.readyState,
                host: mongoose.connection.host,
                database: mongoose.connection.name
            });
        }
    } catch (error) {
        console.error('❌ Test connection failed:');
        console.error('   - Error message:', error.message);
        console.error('   - Error name:', error.name);
        console.error('   - Error code:', error.code);
        console.error('   - Error stack:', error.stack);
        
        ResponseHandler.serverError(res, 'Test connection failed');
    }
});

// Quick MongoDB diagnostic route
app.get('/mongo-diagnostic', async (req, res) => {
    console.log('🔍 MongoDB diagnostic route accessed');
    
    const diagnostic = {
        timestamp: new Date().toISOString(),
        environment: {
            NODE_ENV: process.env.NODE_ENV || 'not set',
            VERCEL: process.env.VERCEL || 'not set',
            hasMongoUri: !!process.env.MONGODB_URI
        },
        mongoUri: {
            exists: !!process.env.MONGODB_URI,
            length: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
            startsWithMongo: process.env.MONGODB_URI ? process.env.MONGODB_URI.startsWith('mongodb') : false,
            preview: process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 50) + '...' : 'NOT_SET'
        },
        mongoose: {
            readyState: mongoose.connection.readyState,
            readyStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name,
            error: mongoose.connection.error ? mongoose.connection.error.message : null
        }
    };
    
    // Try to connect if not connected
    if (mongoose.connection.readyState !== 1) {
        try {
            console.log('🔄 Attempting connection for diagnostic...');
            const ConnectionHelper = require('./src/utils/connectionHelper');
            await ConnectionHelper.ensureConnection();
            diagnostic.connectionTest = {
                success: true,
                message: 'Connection successful'
            };
        } catch (error) {
            diagnostic.connectionTest = {
                success: false,
                error: error.message,
                errorName: error.name,
                errorCode: error.code
            };
        }
    } else {
        diagnostic.connectionTest = {
            success: true,
            message: 'Already connected'
        };
    }
    
    console.log('🔍 Diagnostic result:', JSON.stringify(diagnostic, null, 2));
    res.json(diagnostic);
});

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
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/health', healthRoutes);

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
