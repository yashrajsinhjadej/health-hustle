// Phone-specific Rate Limiter for OTP endpoints
// Provides rate limiting per phone number instead of per IP

const { rateLimiter } = require('./customRateLimit');
const ResponseHandler = require('../utils/ResponseHandler');
const Logger = require('../utils/logger');

// OTP-specific rate limiter that uses phone number as key
function createOTPRateLimit(limit, windowSeconds) {
    return async function (req, res, next) {
        try {
            // Extract phone number from request body
            const phone = req.body.phone;
            
            if (!phone) {
                // If no phone number, fall back to IP-based limiting
                const ipKey = `${req.ip}:${req.path}`;
                const { allowed, remaining, ttl } = await rateLimiter.isAllowed(ipKey, limit, windowSeconds);
                
                if (!allowed) {
                    Logger.warn('otp-rate-limit', `Rate limit exceeded for IP`, { 
                        ip: req.ip, 
                        remaining, 
                        ttl 
                    });
                    return res.status(429).json({
                        error: "Too many requests",
                        retryAfter: ttl,
                        message: `Rate limit exceeded. Try again in ${ttl} seconds.`
                    });
                }
                
                res.set("X-RateLimit-Remaining", remaining);
                res.set("X-RateLimit-Reset", ttl);
                return next();
            }

            // Clean phone number (remove any formatting)
            // Convert to string first to handle both string and number types
            const phoneString = String(phone);
            const cleanPhone = phoneString.replace(/\D/g, '');
            
            // Use phone number + endpoint as key for rate limiting
            const phoneKey = `phone:${cleanPhone}:${req.path}`;
            
            const { allowed, remaining, ttl } = await rateLimiter.isAllowed(phoneKey, limit, windowSeconds);

            if (!allowed) {
                Logger.warn('otp-rate-limit', `Rate limit exceeded for phone`, { 
                    phone: cleanPhone, 
                    remaining, 
                    ttl 
                });
                return res.status(429).json({
                    error: "Too many requests",
                    retryAfter: ttl,
                    message: `Too many OTP requests for this phone number. Try again in ${ttl} seconds.`
                });
            }

            // Set rate limit headers
            res.set("X-RateLimit-Remaining", remaining);
            res.set("X-RateLimit-Reset", ttl);
            Logger.debug('otp-rate-limit', `Rate limit OK for phone`, { 
                phone: cleanPhone, 
                remaining, 
                ttl 
            });
            
            next();
        } catch (err) {
            Logger.error('otp-rate-limit', 'Rate limiter error', { 
                error: err.message, 
                stack: err.stack 
            });
            next(); // fail open if rate limiter fails
        }
    };
}

module.exports = createOTPRateLimit;
