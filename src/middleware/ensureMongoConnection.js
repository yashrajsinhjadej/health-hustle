const mongoose = require('mongoose');
const ConnectionHelper = require('../utils/connectionHelper');
const ResponseHandler = require('../utils/ResponseHandler');

const SKIP_PATHS = new Set([
    '/health',
    '/debug',
    '/test-connection',
    '/env-debug'
]);

module.exports = async function ensureMongoConnection(req, res, next) {
    try {
        // Skip paths
        if (SKIP_PATHS.has(req.path)) return next();

        // If already connected, continue
        if (mongoose.connection.readyState === 1) {
            return next();
        }

        console.log(`🔄 Reconnecting MongoDB for: ${req.path}`);

        // Use the helper to create/restore connection
        await ConnectionHelper.ensureConnection();

        return next();

    } catch (err) {
        console.error('❌ ensureMongoConnection Middleware Error:', err.message);
        return ResponseHandler.serverError(res, 'Service temporarily unavailable.');
    }
};
