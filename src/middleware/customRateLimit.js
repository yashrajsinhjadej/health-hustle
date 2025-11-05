// Custom In-Memory Rate Limiter - Replaces Redis
// Provides the same functionality as Redis rate limiting but in-memory
// Now configurable via environment variables

const Logger = require('../utils/logger');

class CustomRateLimiter {
    constructor() {
        this.requests = new Map(); // Store request counts: key -> {count, firstRequest, windowStart}
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // Clean up every minute to prevent memory leaks
    }

    // Check if request is allowed (same interface as Redis rateLimiter)
    async isAllowed(key, limit, windowSeconds) {
        const now = Date.now();
        const windowMs = windowSeconds * 1000;
        const windowStart = now - windowMs;
        
        // Get or create request history for this key
        if (!this.requests.has(key)) {
            this.requests.set(key, {
                count: 0,
                firstRequest: now,
                windowStart: now
            });
        }
        
        const requestData = this.requests.get(key);
        
        // Check if we're in a new window
        if (now - requestData.windowStart >= windowMs) {
            // Reset for new window
            requestData.count = 0;
            requestData.firstRequest = now;
            requestData.windowStart = now;
        }
        
        // Increment counter
        requestData.count++;
        
        // Check if under limit
        const allowed = requestData.count <= limit;
        const remaining = Math.max(limit - requestData.count, 0);
        
        // Calculate TTL (time until window resets)
        const ttl = Math.ceil((windowMs - (now - requestData.windowStart)) / 1000);
        
        return {
            allowed: allowed,
            remaining: remaining,
            ttl: ttl
        };
    }

    // Clean up old entries to prevent memory leaks
    cleanup() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes - remove entries older than this
        
        let cleanedCount = 0;
        for (const [key, requestData] of this.requests.entries()) {
            if (now - requestData.firstRequest > maxAge) {
                this.requests.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            Logger.debug('rate-limiter', 'Cleaned up old entries', { cleanedCount });
        }
    }

    // Get current stats (for debugging)
    getStats() {
        return {
            totalKeys: this.requests.size,
            memoryUsage: process.memoryUsage().heapUsed
        };
    }
}

// Create global instance
const rateLimiter = new CustomRateLimiter();

// Middleware factory - now configurable via environment variables
function createCustomRateLimit(limit, windowSeconds) {
    return async function (req, res, next) {
        const requestId = Logger.generateId('rate-limit');
        
        try {
            // Use IP + route path so each route has separate counter (same as Redis version)
            const key = `${req.ip}:${req.path}`;
            
            // Use environment variables if provided, otherwise use passed parameters
            const effectiveLimit = limit || parseInt(process.env.RATE_LIMIT_DEFAULT_LIMIT) || 60;
            const effectiveWindow = windowSeconds || parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60;
            
            const { allowed, remaining, ttl } = await rateLimiter.isAllowed(key, effectiveLimit, effectiveWindow);

            if (!allowed) {
                Logger.warn(requestId, 'Rate limit exceeded', { 
                    key, 
                    remaining, 
                    resetIn: ttl 
                });
                return res.status(429).json({
                    error: "Too many requests",
                    retryAfter: ttl,
                    message: `Rate limit exceeded. Try again in ${ttl} seconds.`
                });
            }

            // Set rate limit headers (same as Redis version)
            res.set("X-RateLimit-Remaining", remaining);
            res.set("X-RateLimit-Reset", ttl);
            
            next();
        } catch (err) {
            Logger.error(requestId, 'Rate limiter error', { 
                error: err.message, 
                stack: err.stack 
            });
            next(); // fail open if rate limiter fails (same as Redis version)
        }
    };
}

// Export both the middleware factory and the rate limiter instance
module.exports = createCustomRateLimit;
module.exports.CustomRateLimiter = CustomRateLimiter;
module.exports.rateLimiter = rateLimiter;
