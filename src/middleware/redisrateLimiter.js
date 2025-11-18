// Enhanced Redis Rate Limiter
// Provides configurable rate limiting with environment variable support
// Works across multiple servers using Redis
// /middleware/redisrateLimeter.js


const redisClient = require("../utils/redisClient");
const Logger = require('../utils/logger');

class RedisRateLimiter {
    constructor() {
        // Test Redis connection on initialization
        this.testConnection();
    }

    async testConnection() {
        try {
            await redisClient.ping();
            Logger.info('rate-limiter', 'Redis rate limiter initialized successfully');
        } catch (err) {
            Logger.error('rate-limiter', 'Redis connection failed', { error: err.message });
        }
    }

    // Core rate limiting logic
    async isAllowed(key, limit, windowSeconds) {
        try {
            const current = await redisClient.incr(key);

            // Set expiry on first request
            if (current === 1) {
                await redisClient.expire(key, windowSeconds);
            }

            const allowed = current <= limit;
            const remaining = Math.max(limit - current, 0);
            
            // Get TTL for the key
            const ttl = await redisClient.ttl(key);

            return {
                allowed,
                remaining,
                ttl: ttl > 0 ? ttl : windowSeconds,
                current
            };
        } catch (err) {
            Logger.error('rate-limiter', 'Redis operation failed', { 
                error: err.message,
                key 
            });
            // Fail open - allow request if Redis fails
            return {
                allowed: true,
                remaining: limit,
                ttl: windowSeconds,
                current: 0,
                error: true
            };
        }
    }

    // Get current stats for a key
    async getStats(key) {
        try {
            const current = await redisClient.get(key);
            const ttl = await redisClient.ttl(key);
            return {
                current: parseInt(current) || 0,
                ttl: ttl > 0 ? ttl : 0
            };
        } catch (err) {
            Logger.error('rate-limiter', 'Failed to get stats', { error: err.message });
            return { current: 0, ttl: 0 };
        }
    }

    // Manually reset a key (useful for testing or admin actions)
    async reset(key) {
        try {
            await redisClient.del(key);
            Logger.info('rate-limiter', 'Key reset', { key });
            return true;
        } catch (err) {
            Logger.error('rate-limiter', 'Failed to reset key', { error: err.message });
            return false;
        }
    }
}

// Create global instance
const rateLimiterInstance = new RedisRateLimiter();

// Middleware factory with environment variable support
function createRateLimit(limit, windowSeconds, options = {}) {
    return async function (req, res, next) {
        const requestId = Logger.generateId('rate-limit');
        
        try {
            // Determine the rate limit key based on options
            const keyPrefix = options.keyPrefix || 'rate_limit';
            const identifier = options.useUserId && req.user?.id 
                ? req.user.id 
                : req.ip;
            
            // Include path in key for per-route limiting (optional)
            const key = options.perRoute 
                ? `${keyPrefix}:${identifier}:${req.path}`
                : `${keyPrefix}:${identifier}`;
            
            // Use environment variables if provided, otherwise use passed parameters
            const effectiveLimit = limit || parseInt(process.env.RATE_LIMIT_DEFAULT) || 30;
            const effectiveWindow = windowSeconds || parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60;
            
            const { allowed, remaining, ttl, current, error } = await rateLimiterInstance.isAllowed(
                key, 
                effectiveLimit, 
                effectiveWindow
            );

            // Set rate limit headers
            res.set("X-RateLimit-Limit", effectiveLimit);
            res.set("X-RateLimit-Remaining", remaining);
            res.set("X-RateLimit-Reset", ttl);

            if (!allowed) {
                res.set("Retry-After", ttl);
                Logger.warn(requestId, 'Rate limit exceeded', { 
                    key,
                    current,
                    limit: effectiveLimit,
                    remaining, 
                    resetIn: ttl,
                    ip: req.ip,
                    path: req.path
                });
                
                return res.status(429).json({
                    error: "Too many requests",
                    retryAfter: ttl,
                    message: `Rate limit exceeded. Try again in ${ttl} seconds.`
                });
            }

            // Log warning when approaching limit
            if (remaining <= effectiveLimit * 0.2) {
                Logger.debug(requestId, 'Approaching rate limit', {
                    key,
                    remaining,
                    limit: effectiveLimit
                });
            }

            // If Redis error but failed open, log it
            if (error) {
                Logger.warn(requestId, 'Rate limiter failed open due to Redis error');
            }
            
            next();
        } catch (err) {
            Logger.error(requestId, 'Rate limiter error', { 
                error: err.message, 
                stack: err.stack 
            });
            next(); // Fail open if rate limiter fails
        }
    };
}

// Pre-configured rate limiters based on environment variables
const rateLimiters = {
    
    auth: () => createRateLimit(
        parseInt(process.env.AUTH_RATE_LIMIT) || 5,
        parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
        { keyPrefix: 'auth_limit', perRoute: true }
    ),
    
    // API routes - higher limit, shared counter (memory efficient)
    // All user API endpoints share one counter per IP/user
    // Better than per-route: uses way less Redis memory
    api: () => createRateLimit(
        parseInt(process.env.API_RATE_LIMIT) || 100,
        parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
        { keyPrefix: 'api_limit', perRoute: false }
    ),
    
    // Admin routes - very high limit, per user (admins identified by userId)
    admin: () => createRateLimit(
        parseInt(process.env.ADMIN_RATE_LIMIT) || 200,
        parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
        { keyPrefix: 'admin_limit', useUserId: true, perRoute: false }
    ),

    // Global rate limiter - absolute maximum across everything
    global: () => createRateLimit(
        parseInt(process.env.RATE_LIMIT_GLOBAL) || 500,
        parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
        { keyPrefix: 'global_limit', perRoute: false }
    ),

    // Strict limiter - for sensitive operations (per-route, low limit)
    // Use for: password reset, email change, payment operations
    strict: () => createRateLimit(
        parseInt(process.env.RATE_LIMIT_STRICT) || 3,
        parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
        { keyPrefix: 'strict_limit', perRoute: true }
    )
};

// Export both the middleware factory and pre-configured limiters
module.exports = createRateLimit;
module.exports.rateLimiters = rateLimiters;
module.exports.RedisRateLimiter = RedisRateLimiter;
module.exports.rateLimiter = rateLimiterInstance;