// JWT Authentication Middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ConnectionHelper = require('../utils/connectionHelper');
const ResponseHandler = require('../utils/ResponseHandler');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
        console.log(`🔐 [${requestId}] Auth middleware START - ${req.method} ${req.path}`);
        console.log(`🔐 [${requestId}] Request headers:`, req.headers);
        console.log(`🔐 [${requestId}] Request IP:`, req.ip || req.connection.remoteAddress);
        
        const authHeader = req.headers['authorization'];
        console.log(`🔐 [${requestId}] Authorization header:`, authHeader ? `${authHeader.substring(0, 20)}...` : 'missing');
        
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            console.log(`🔐 [${requestId}] No token provided`);
            return ResponseHandler.unauthorized(res, 'Access token required');
        }

        console.log(`🔐 [${requestId}] Token found, verifying...`);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log(`🔐 [${requestId}] Token decoded - User ID: ${decoded.userId}, IAT: ${decoded.iat}, EXP: ${decoded.exp}`);
        
        // Ensure MongoDB connection is ready
        console.log(`🔐 [${requestId}] Ensuring MongoDB connection...`);
        await ConnectionHelper.ensureConnection();
        
        console.log(`🔐 [${requestId}] Looking up user in database...`);
        const user = await User.findById(decoded.userId).select('-otp');

        if (!user || !user.isActive) {
            console.log(`🔐 [${requestId}] User not found or inactive - ID: ${decoded.userId}`);
            return ResponseHandler.unauthorized(res, 'Invalid token or user not found');
        }

        console.log(`🔐 [${requestId}] User found: ${user.name} (${user._id})`);

        // Check if token was issued before user's last login (session invalidation)
        const tokenIssuedAt = new Date(decoded.iat * 1000); // JWT iat is in seconds
        
        if (user.lastLoginAt > tokenIssuedAt) {
            return ResponseHandler.unauthorized(res, 'Session expired due to login from another device');
        }

        req.user = user;
        next();
    } catch (error) {
        return ResponseHandler.forbidden(res, 'Invalid or expired token');
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
