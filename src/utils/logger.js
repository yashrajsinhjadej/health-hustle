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

    // Helper to handle both (id, message, data) and (module, method, message, data) patterns
    static _parseArgs(args) {
        if (args.length === 3) {
            // Pattern: (id, message, data)
            return { id: args[0], message: args[1], data: args[2] };
        } else if (args.length === 4) {
            // Pattern: (module, method, message, data)
            const id = `${args[0]}.${args[1]}`;
            return { id, message: args[2], data: args[3] };
        } else if (args.length === 2) {
            // Pattern: (id, message)
            return { id: args[0], message: args[1], data: null };
        } else {
            // Fallback
            return { id: 'unknown', message: args[0] || 'No message', data: null };
        }
    }

    static info(...args) {
        const { id, message, data } = this._parseArgs(args);
        console.log(this.formatMessage('info', id, message, data));
    }

    static error(...args) {
        const { id, message, data } = this._parseArgs(args);
        console.error(this.formatMessage('error', id, message, data));
        if (data && data.error) {
            console.error(`[${id}] Error details:`, data.error);
            if (data.stack) {
                console.error(`[${id}] Stack trace:`, data.stack);
            }
        }
    }

    static warn(...args) {
        const { id, message, data } = this._parseArgs(args);
        console.warn(this.formatMessage('warn', id, message, data));
    }

    static success(...args) {
        const { id, message, data } = this._parseArgs(args);
        console.log(this.formatMessage('success', id, message, data));
    }

    static debug(...args) {
        if (process.env.NODE_ENV !== 'production') {
            const { id, message, data } = this._parseArgs(args);
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
