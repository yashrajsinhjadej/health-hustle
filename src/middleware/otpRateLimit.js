// Phone-specific Rate Limiter for OTP endpoints
// Provides rate limiting per phone number instead of per IP

const { rateLimiter } = require('./customRateLimit');
const ResponseHandler = require('../utils/ResponseHandler');

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
                    console.log(`🚫 OTP Rate limit exceeded for IP ${req.ip}: ${remaining} remaining, reset in ${ttl}s`);
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
            const cleanPhone = phone.replace(/\D/g, '');
            
            // Use phone number + endpoint as key for rate limiting
            const phoneKey = `phone:${cleanPhone}:${req.path}`;
            
            const { allowed, remaining, ttl } = await rateLimiter.isAllowed(phoneKey, limit, windowSeconds);

            if (!allowed) {
                console.log(`🚫 OTP Rate limit exceeded for phone ${cleanPhone}: ${remaining} remaining, reset in ${ttl}s`);
                return res.status(429).json({
                    error: "Too many requests",
                    retryAfter: ttl,
                    message: `Too many OTP requests for this phone number. Try again in ${ttl} seconds.`
                });
            }

            // Set rate limit headers
            res.set("X-RateLimit-Remaining", remaining);
            res.set("X-RateLimit-Reset", ttl);
            console.log(`✅ OTP Rate limit OK for phone ${cleanPhone}: ${remaining} remaining, reset in ${ttl}s`);
            
            next();
        } catch (err) {
            console.error("OTP rate limiter error:", err);
            next(); // fail open if rate limiter fails
        }
    };
}

module.exports = createOTPRateLimit;
