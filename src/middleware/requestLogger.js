// src/middleware/requestLogger.js
const Logger = require('../utils/logger');

module.exports = function requestLogger(req, res, next) {
    const requestId = Logger.generateId('req');
    req.requestId = requestId;

    // Log Incoming Request
    Logger.logRequest(requestId, req);

    // Override res.send to capture outgoing response
    const originalSend = res.send;

    res.send = function (data) {
        Logger.logResponse(requestId, res.statusCode, data);

        return originalSend.call(this, data);
    };

    next();
};
