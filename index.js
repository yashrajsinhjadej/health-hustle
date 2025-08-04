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

// Connect to MongoDB with connection pooling
mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,              // Maximum 10 simultaneous connections
    serverSelectionTimeoutMS: 5000, // 5 seconds timeout for server selection
    socketTimeoutMS: 45000,       // 45 seconds socket timeout
    family: 4                     // Use IPv4, skip trying IPv6
})
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas with connection pooling (maxPoolSize: 10)');
    })
    .catch((error) => {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    });

// Enhanced Health check route
app.get('/health', async (req, res) => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Check Twilio status
    const TwilioSMSService = require('./src/services/twilioSMSService');
    const twilioStatus = await TwilioSMSService.healthCheck();
    
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
        twilio: twilioStatus
    });
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
