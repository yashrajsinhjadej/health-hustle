// Admin Routes - Simple admin endpoints
const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { authenticateToken, adminOnly } = require('../../middleware/auth');
const AdminAuthController = require('../../controllers/AdminAuthController');
const AuthController = require('../../controllers/AuthController');
const ResponseHandler = require('../../utils/ResponseHandler');
const Logger = require('../../utils/logger');
const createCustomRateLimit = require('../../middleware/customRateLimit');
const { 
    validateAdminSignup, 
    validateAdminLogin, 
    validateAdminEmail,
    validateAdminPasswordReset,
    handleValidationErrors 
} = require('../../validators/userValidators');

// Global admin route logging middleware
router.use((req, res, next) => {
    const requestId = `admin-route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.requestId = requestId;
    
    Logger.info('Admin route request', requestId, {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.connection.remoteAddress,
        hasAuth: !!req.get('Authorization'),
        bodyKeys: Object.keys(req.body || {}),
        queryKeys: Object.keys(req.query || {}),
        params: req.params
    });
    
    // Log response
    const originalSend = res.send;
    res.send = function(data) {
        Logger.info('Admin route response', requestId, {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            responseLength: data ? data.length : 0
        });
        originalSend.call(this, data);
    };
    
    next();
});

// Create rate limiter for admin routes using environment variables
const adminRateLimit = createCustomRateLimit(
    parseInt(process.env.ADMIN_ROUTES_LIMIT) || 100, 
    parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60
); // Admin routes rate limit from env

const adminAuthLimit = createCustomRateLimit(
    parseInt(process.env.ADMIN_AUTH_LIMIT) || 5, 
    parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60
); // Admin auth routes rate limit from env


// Public admin auth routes (no authentication required)
router.post('/signup', adminAuthLimit, validateAdminSignup, handleValidationErrors, AdminAuthController.signup);

router.post('/login', adminAuthLimit, validateAdminLogin, handleValidationErrors, AdminAuthController.login);

// POST /admin/forgot-password - Request password reset for admin via email with reset link
router.post('/forgot-password', adminRateLimit, validateAdminEmail, handleValidationErrors, AdminAuthController.forgotPassword);

// POST /admin/reset-password - Process password reset with token
router.post('/reset-password', adminRateLimit, validateAdminPasswordReset, handleValidationErrors, AdminAuthController.resetPassword);

    
// Protected admin routes (authentication required)
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken);
protectedRouter.use(adminOnly);
protectedRouter.use(adminRateLimit);

// GET /admin/profile - Get admin profile
protectedRouter.get('/profile', AdminAuthController.getProfile);

// POST /admin/logout - Admin logout with enhanced tracking and security monitoring
protectedRouter.post('/logout', AdminAuthController.logout);

// GET /admin/dashboard - Enhanced admin dashboard with pagination and performance optimization
protectedRouter.get('/dashboard', AdminAuthController.dashboard);
protectedRouter.get('/dashboard/export', AdminAuthController.exportDashboardData);

// GET /admin/users/:userId - Get individual user details
protectedRouter.get('/users/:userId', AdminAuthController.getUser);

// DELETE /admin/users/:userId - Delete a user and return updated list with pagination
protectedRouter.delete('/users/:userId', AdminAuthController.deleteUser);

// PUT /admin/users/:userId - Update user details with comprehensive validation
protectedRouter.put('/users/:userId', AdminAuthController.updateUser);

// Mount protected routes
router.use('/', protectedRouter);

module.exports = router;
