// filename: server.js
require('dotenv').config();

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

// CORS
app.use(cors());

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
    app.listen(PORT, () => {
        console.log(`🚀 Health Hustle server running at http://localhost:${PORT}`);
    });
}
/* ===========================
   🔹 EXPORT (FOR VERCEL)
============================== */
module.exports = app;
