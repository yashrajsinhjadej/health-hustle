// JWT Authentication Middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ConnectionHelper = require('../utils/connectionHelper');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Ensure MongoDB connection is ready
        await ConnectionHelper.ensureConnection();
        
        const user = await User.findById(decoded.userId).select('-otp');

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token or user not found'
            });
        }

        // Check if token was issued before user's last login (session invalidation)
        const tokenIssuedAt = new Date(decoded.iat * 1000); // JWT iat is in seconds
        
        if (user.lastLoginAt > tokenIssuedAt) {
            return res.status(401).json({
                success: false,
                error: 'Session expired due to login from another device',
                action: 'redirect_to_login'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            error: 'Invalid or expired token',
            action: 'redirect_to_login'
        });
    }
};

// Role-based authorization middleware
const authorizeRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `Access denied. Required role: ${allowedRoles.join(' or ')}`
            });
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
