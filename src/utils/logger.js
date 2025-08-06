// Production-Ready Logging Utility
class Logger {
    static generateId(prefix = 'log') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    static formatMessage(level, id, message, data = null) {
        const timestamp = new Date().toISOString();
        const baseMsg = `${timestamp} [${level.toUpperCase()}] [${id}] ${message}`;
        
        if (data) {
            return `${baseMsg} - Data: ${JSON.stringify(data, null, 2)}`;
        }
        
        return baseMsg;
    }

    static info(id, message, data = null) {
        console.log(this.formatMessage('info', id, message, data));
    }

    static error(id, message, error = null, data = null) {
        console.error(this.formatMessage('error', id, message, data));
        if (error) {
            console.error(`[${id}] Error details:`, error);
            if (error.stack) {
                console.error(`[${id}] Stack trace:`, error.stack);
            }
        }
    }

    static warn(id, message, data = null) {
        console.warn(this.formatMessage('warn', id, message, data));
    }

    static debug(id, message, data = null) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(this.formatMessage('debug', id, message, data));
        }
    }

    // Request/Response logging
    static logRequest(id, req) {
        this.info(id, 'Request received', {
            method: req.method,
            path: req.path,
            query: req.query,
            params: req.params,
            headers: req.headers,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        });
    }

    static logResponse(id, statusCode, data = null) {
        this.info(id, `Response sent - Status: ${statusCode}`, data);
    }

    // Database operation logging
    static logDbOperation(id, operation, collection, query = null, result = null) {
        this.info(id, `Database ${operation} - Collection: ${collection}`, {
            query,
            result: result ? { 
                success: true, 
                recordCount: Array.isArray(result) ? result.length : 1 
            } : null
        });
    }

    // Performance logging
    static startTimer(id) {
        const startTime = Date.now();
        return {
            end: (message = 'Operation completed') => {
                const duration = Date.now() - startTime;
                this.info(id, `${message} (${duration}ms)`);
                return duration;
            }
        };
    }

    // Security logging
    static logSecurityEvent(id, event, details = null) {
        this.warn(id, `Security Event: ${event}`, details);
    }

    // Business logic logging
    static logBusinessEvent(id, event, details = null) {
        this.info(id, `Business Event: ${event}`, details);
    }
}

module.exports = Logger;
