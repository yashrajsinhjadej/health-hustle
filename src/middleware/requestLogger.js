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
    let preview = "";

    try {
        const stringData = typeof data === "string" ? data : JSON.stringify(data);

        preview = stringData.length > 200
            ? stringData.substring(0, 200) + "...[truncated]"
            : stringData;

        Logger.logResponse(requestId, res.statusCode, {
            size: stringData.length,
            preview
        });
    } catch (err) {
        Logger.logResponse(requestId, res.statusCode, "Unable to parse body");
    }

    return originalSend.call(this, data);
};

    next();
};
