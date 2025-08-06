// JWT Authentication Middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        console.log('🔍 Auth middleware - checking route:', req.path);
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            console.log('❌ Auth middleware - no token provided for:', req.path);
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-otp');

        if (!user || !user.isActive) {
            console.log('❌ Auth middleware - invalid user for:', req.path);
            return res.status(401).json({
                success: false,
                error: 'Invalid token or user not found'
            });
        }

        // Check if token was issued before user's last login (session invalidation)
        const tokenIssuedAt = new Date(decoded.iat * 1000); // JWT iat is in seconds
        
        if (user.lastLoginAt > tokenIssuedAt) {
            console.log('❌ Auth middleware - session expired for:', req.path);
            console.log('🔍 lastLoginAt:', user.lastLoginAt, 'tokenIssuedAt:', tokenIssuedAt);
            return res.status(401).json({
                success: false,
                error: 'Session expired due to login from another device',
                action: 'redirect_to_login'
            });
        }

        console.log('✅ Auth middleware - user authenticated for:', req.path);
        req.user = user;
        next();
    } catch (error) {
        console.log('❌ Auth middleware - JWT error for:', req.path, error.message);
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
