const Logger = require('../utils/logger');
const ResponseHandler = require('../utils/ResponseHandler');

/**
 * Higher-order function to wrap controller methods with request logging and error handling.
 * @param {string} operationName - Name of the operation for logging (e.g., 'admin-send-notification')
 * @param {Function} handler - Async controller function (req, res, requestId) => Promise<void>
 */
const withRequestLogging = (operationName, handler) => {
    return async (req, res, next) => {
        const requestId = Logger.generateId(operationName);

        try {
            Logger.info(requestId, `📢 Starting ${operationName}`);
            Logger.logRequest(requestId, req);

            await handler(req, res, requestId);

        } catch (error) {
            Logger.error(requestId, `Error in ${operationName}`, {
                error: error.message,
                stack: error.stack,
            });
            return ResponseHandler.serverError(res, `Failed to process ${operationName}`);
        }
    };
};

module.exports = withRequestLogging;
