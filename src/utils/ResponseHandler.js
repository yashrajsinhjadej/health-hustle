// ResponseHandler - Simple and Clean API response utility
// Keeps responses minimal and easy for frontend to handle

class ResponseHandler {
    
    // ✅ SUCCESS RESPONSES
    
    /**
     * Standard success response
     * @param {Object} res - Express response object
     * @param {string} message - Success message
     * @param {Object|null} data - Response data
     * @param {number} statusCode - HTTP status code (default: 200)
     */
    static success(res, message, data = null, statusCode = 200) {
        const response = { message };
        
        if (data !== null && data !== undefined) {
            response.data = data;
        }
        
        return res.status(statusCode).json(response);
    }

    /**
     * Created response (201)
     * @param {Object} res - Express response object
     * @param {string} message - Success message
     * @param {Object|null} data - Response data
     */
    static created(res, message, data = null) {
        return this.success(res, message, data, 201);
    }

    // ❌ ERROR RESPONSES
    
    /**
     * Standard error response
     * @param {Object} res - Express response object
     * @param {string} message - Error message
     * @param {string} error - Detailed error description
     * @param {number} statusCode - HTTP status code (default: 400)
     */
    static error(res, message, error, statusCode = 400) {
        return res.status(statusCode).json({
            message,
            error
        });
    }

    /**
     * Rate limit error - special case for OTP cooldown
     * @param {Object} res - Express response object
     * @param {number} waitSeconds - Seconds to wait before retry
     * @param {number} statusCode - HTTP status code (default: 429)
     */
    static rateLimitError(res, waitSeconds, statusCode = 429) {
        return res.status(statusCode).json({
            message: "Too many requests",
            error: `Please try again after ${waitSeconds} seconds`
        });
    }

    // 🔐 SPECIFIC ERROR TYPES (simplified)

    /**
     * Unauthorized error (401)
     */
    static unauthorized(res, message = "Authentication required") {
        return this.error(res, "Unauthorized", message, 401);
    }

    /**
     * Forbidden error (403)
     */
    static forbidden(res, message = "Access denied") {
        return this.error(res, "Forbidden", message, 403);
    }

    /**
     * Not found error (404)
     */
    static notFound(res, message = "Resource not found") {
        return this.error(res, "Not found", message, 404);
    }

    /**
     * Internal server error (500)
     */
    static serverError(res, message = "Internal server error") {
        return this.error(res, "Server error", message, 500);
    }

    // 🛠️ UTILITY METHODS

    /**
     * Handle validation errors from express-validator
     * @param {Object} res - Express response object
     * @param {Object} validationResult - Result from express-validator
     */
    static validationError(res, validationResult) {
        const errors = {};
        validationResult.array().forEach(error => {
            const fieldPath = error.path || error.param;
            errors[fieldPath] = error.msg;
        });

        return this.error(res, "Validation failed", "Please check your input data", 400);
    }

    /**
     * Handle Mongoose validation errors
     * @param {Object} res - Express response object
     * @param {Object} mongooseError - Mongoose validation error
     */
    static mongooseError(res, mongooseError) {
        if (mongooseError.name === 'ValidationError') {
            return this.error(res, "Validation failed", "Invalid data provided", 400);
        }

        if (mongooseError.code === 11000) {
            return this.error(res, "Conflict", "Resource already exists", 409);
        }

        return this.serverError(res, "Database operation failed");
    }
}

module.exports = ResponseHandler;
