const { query, validationResult } = require('express-validator');
const Logger = require('../utils/logger');
const ResponseHandler = require('../utils/ResponseHandler');

const notificationFeedValidator = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
];

const handleUserNotificationValidation = (req, res, next) => {
    const requestId = req.requestId || Logger.generateId('user-notification-validation');
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        Logger.warn(requestId, 'User notification validation failed', {
            errors: errors.array()
        });
        return ResponseHandler.validationError(res, errors);
    }

    Logger.debug(requestId, 'User notification validation passed');
    return next();
};

module.exports = {
    notificationFeedValidator,
    handleUserNotificationValidation
};

