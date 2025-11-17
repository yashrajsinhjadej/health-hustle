// JWT Authentication Middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ConnectionHelper = require('../utils/connectionHelper');
const ResponseHandler = require('../utils/ResponseHandler');
const Logger = require('../utils/logger');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    const requestId = Logger.generateId('auth-token');
    
    try {
        Logger.info(requestId, 'Token authentication START', { 
            method: req.method, 
            path: req.path,
            ip: req.ip || req.connection.remoteAddress 
        });
        
        const authHeader = req.headers['authorization'];
        Logger.debug(requestId, 'Authorization header check', { 
            hasHeader: !!authHeader 
        });
        
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            Logger.warn(requestId, 'No token provided');
            return ResponseHandler.unauthorized(res, 'Access token required', 'AUTH_TOKEN_MISSING');
        }

        Logger.debug(requestId, 'Token found, verifying...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        Logger.debug(requestId, 'Token decoded', { 
            userId: decoded.userId, 
            iat: decoded.iat, 
            exp: decoded.exp 
        });
        
        // Ensure MongoDB connection is ready
        Logger.debug(requestId, 'Ensuring MongoDB connection');
        await ConnectionHelper.ensureConnection();
        
        Logger.debug(requestId, 'Looking up user in database', { userId: decoded.userId });
        const user = await User.findById(decoded.userId).select('-otp');

        if (!user) {
            Logger.warn(requestId, 'User not found or inactive', { userId: decoded.userId });
            return ResponseHandler.unauthorized(res, 'Invalid token or user not found', 'AUTH_USER_NOT_FOUND');
        }

        if( !user.isActive ) {
            Logger.warn(requestId, 'User account inactive', { userId: user._id });
            return ResponseHandler.unauthorized(res, 'User account is inactive. Please contact support.', 'AUTH_USER_INACTIVE');
        }

        Logger.debug(requestId, 'User found', { userId: user._id, name: user.name });

        // Check if token was issued before user's last login (session invalidation)
        const tokenIssuedAt = new Date(decoded.iat * 1000); // JWT iat is in seconds
        
        if (user.lastLoginAt > tokenIssuedAt) {
            Logger.warn(requestId, 'Token invalidated by newer login', { 
                userId: user._id,
                tokenIssuedAt,
                lastLoginAt: user.lastLoginAt 
            });
            return ResponseHandler.unauthorized(res, 'Session expired due to login from another device', 'AUTH_SESSION_EXPIRED');
        }

        Logger.success(requestId, 'Authentication successful', { userId: user._id });
        req.user = user;
        next();
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

// Role-based authorization middleware
const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return ResponseHandler.unauthorized(res, 'Authentication required');
        }

        if (!allowedRoles.includes(req.user.role)) {
            return ResponseHandler.forbidden(res, `Access denied. Required role: ${allowedRoles.join(' or ')}`);
        }

        next();
    };
};

// Admin only middleware
const adminOnly = authorizeRole('admin');

// User only middleware
const userOnly = authorizeRole('user');

// Admin or User middleware
const adminOrUser = authorizeRole('admin', 'user');

module.exports = {
    authenticateToken,
    authorizeRole,
    adminOnly,
    userOnly,
    adminOrUser
};
