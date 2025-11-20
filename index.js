// filename: server.js
require('dotenv').config();

// Validate environment variables before starting (prevents runtime errors)
const validateEnvironment = require('./src/config/validateEnv');
validateEnvironment();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const ResponseHandler = require('./src/utils/ResponseHandler');

// Load core initializers
const connectDB = require('./src/config/db');
const requestLogger = require('./src/middleware/requestLogger');
const ensureMongoConnection = require('./src/middleware/ensureMongoConnection');
const healthRoute = require('./src/routes/health.route');

const app = express();

/* ===========================
   🔹 GLOBAL MIDDLEWARE
============================== */

// Request Logger
app.use(requestLogger);

// Security Middleware
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                connectSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
            },
        },
        crossOriginEmbedderPolicy: false,
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    })
);

// CORS - Environment aware configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        // Get allowed origins from env (comma-separated)
        const allowedOrigins = process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
            : ['http://localhost:3000', 'http://localhost:3001'];

        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Payload too large handler
app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return ResponseHandler.error(res, 413, 'Payload too large');
    }
    next(err);
});

/* ===========================
   🔹 DATABASE INITIALIZATION
============================== */

connectDB(); // one-time startup connection

// Health route (no DB required)
app.use('/health', healthRoute);

// Ensure DB connection for all /api routes (Vercel safe)
app.use('/api', ensureMongoConnection);

// Import API routes
const apiRoutes = require('./src/routes');
app.use('/api', apiRoutes);

/* ===========================
   🔹 FALLBACK + ERROR HANDLER
============================== */

app.use('*', (req, res) => {
    ResponseHandler.notFound(res, 'API route not found');
});

app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    ResponseHandler.serverError(res, 'Internal server error');
});

/* ===========================
   🔹 LOCAL DEVELOPMENT SERVER
============================== */

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    const Logger = require('./src/utils/logger');
    app.listen(PORT, () => {
        Logger.success('server-start', `Health Hustle server running at http://localhost:${PORT}`);
    });
}
/* ===========================
   🔹 EXPORT (FOR VERCEL)
============================== */
module.exports = app;
