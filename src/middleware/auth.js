// JWT Authentication Middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ConnectionHelper = require('../utils/connectionHelper');
const ResponseHandler = require('../utils/ResponseHandler');
const Logger = require('../utils/logger');
const redis = require('../utils/redisClient');  // ← Redis client

// ==========================================================
// 🔐 AUTHENTICATE TOKEN (JWT + Redis Session Validation)
// ==========================================================
const authenticateToken = async (req, res, next) => {
    const requestId = Logger.generateId('auth-token');

    try {
        Logger.info(requestId, 'Token authentication START', {
            method: req.method,
            path: req.path,
            ip: req.ip || req.connection.remoteAddress
        });

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            Logger.warn(requestId, 'No token provided');
            return ResponseHandler.unauthorized(res, 'Access token required', 'AUTH_TOKEN_MISSING');
        }

        Logger.debug(requestId, 'Token found, verifying...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { userId, role, sessionId } = decoded;

        Logger.debug(requestId, 'Token decoded', { userId, role, sessionId });

        // ==========================================================
        // 1️⃣ REDIS SESSION CHECK
        // ==========================================================
        Logger.debug(requestId, 'Checking session in Redis...');

        if (role === 'user') {
            // SINGLE DEVICE LOGIN → only 1 sessionId stored
            const storedSession = await redis.get(`session:user:${userId}`);

            if (!storedSession || storedSession !== sessionId) {
                Logger.warn(requestId, 'Redis session invalid for USER', { userId, sessionId });
                return ResponseHandler.unauthorized(
                    res,
                    'Session expired. Please login again.',
                    'AUTH_SESSION_EXPIRED'
                );
            }
        } else {
            // MULTI-DEVICE LOGIN (ADMIN / HR / MASTER ADMIN)
            const exists = await redis.exists(`session:admin:${userId}:${sessionId}`);

            if (!exists) {
                Logger.warn(requestId, 'Redis session invalid for ADMIN', { userId, sessionId });
                return ResponseHandler.unauthorized(
                    res,
                    'Session expired or logged out.',
                    'AUTH_SESSION_EXPIRED'
                );
            }
        }

        // ==========================================================
        // 2️⃣ MONGO CONNECTION + USER FETCH
        // ==========================================================
        await ConnectionHelper.ensureConnection();

        const user = await User.findById(userId).select('-otp');

        if (!user) {
            Logger.warn(requestId, 'User not found', { userId });
            return ResponseHandler.unauthorized(res, 'Invalid token or user not found', 'AUTH_USER_NOT_FOUND');
        }

        if (!user.isActive) {
            Logger.warn(requestId, 'User inactive', { userId });
            return ResponseHandler.unauthorized(res, 'User account inactive', 'AUTH_USER_INACTIVE');
        }

        Logger.success(requestId, 'Authentication successful', { userId });

        req.user = user
       req.session = {
        sessionId,
        role
        };
        next()
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            Logger.warn(requestId, 'Invalid JWT token', { error: error.message });
            return ResponseHandler.forbidden(res, 'Invalid token', 'AUTH_INVALID_TOKEN');
        } else if (error.name === 'TokenExpiredError') {
            Logger.warn(requestId, 'JWT token expired', { expiredAt: error.expiredAt });
            return ResponseHandler.forbidden(res, 'Token expired', 'AUTH_TOKEN_EXPIRED');
        } else {
            Logger.error(requestId, 'Authentication error', {
                error: error.message,
                stack: error.stack
            });
            return ResponseHandler.forbidden(res, 'Authentication failed', 'AUTH_FAILED');
        }
    }
};

// ==========================================================
// 🔐 ROLE-BASED AUTHORIZATION
// ==========================================================
const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return ResponseHandler.unauthorized(res, 'Authentication required');
        }

        if (!allowedRoles.includes(req.user.role)) {
            return ResponseHandler.forbidden(
                res,
                `Access denied. Required role: ${allowedRoles.join(' or ')}`
            );
        }

        next();
    };
};

// Define roles
const adminOnly = authorizeRole('admin', 'master_admin', 'hr');
const userOnly = authorizeRole('user');
const adminOrUser = authorizeRole('admin', 'master_admin', 'hr', 'user');

// ==========================================================
// EXPORTS
// ==========================================================
module.exports = {
    authenticateToken,
    authorizeRole,
    adminOnly,
    userOnly,
    adminOrUser
};
