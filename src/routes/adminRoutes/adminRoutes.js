// Admin Routes - Simple admin endpoints
const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { authenticateToken, adminOnly } = require('../../middleware/auth');
const AdminAuthController = require('../../controllers/AdminAuthController');
const AuthController = require('../../controllers/AuthController');
const ResponseHandler = require('../../utils/ResponseHandler');
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
    const requestId = `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.requestId = requestId;
    
    console.log(`🔥 [ADMIN ROUTE] ================================`);
    console.log(`🔥 [ADMIN ROUTE] REQUEST ID: ${requestId}`);
    console.log(`🔥 [ADMIN ROUTE] ${req.method} ${req.originalUrl}`);
    console.log(`🔥 [ADMIN ROUTE] Timestamp: ${new Date().toISOString()}`);
    console.log(`🔥 [ADMIN ROUTE] IP: ${req.ip || req.connection.remoteAddress}`);
    console.log(`🔥 [ADMIN ROUTE] User-Agent: ${req.get('User-Agent')}`);
    console.log(`🔥 [ADMIN ROUTE] Body:`, JSON.stringify(req.body, null, 2));
    console.log(`🔥 [ADMIN ROUTE] Query:`, JSON.stringify(req.query, null, 2));
    console.log(`🔥 [ADMIN ROUTE] Params:`, JSON.stringify(req.params, null, 2));
    console.log(`🔥 [ADMIN ROUTE] Headers:`, JSON.stringify({
        'content-type': req.get('Content-Type'),
        'authorization': req.get('Authorization') ? 'Bearer ***' : 'None',
        'referer': req.get('Referer')
    }, null, 2));
    console.log(`🔥 [ADMIN ROUTE] Deployment: ${process.env.VERCEL_URL || 'LOCAL'}`);
    console.log(`🔥 [ADMIN ROUTE] ================================`);
    
    // Log response
    const originalSend = res.send;
    res.send = function(data) {
        console.log(`✅ [ADMIN RESPONSE] ================================`);
        console.log(`✅ [ADMIN RESPONSE] REQUEST ID: ${requestId}`);
        console.log(`✅ [ADMIN RESPONSE] Status: ${res.statusCode}`);
        console.log(`✅ [ADMIN RESPONSE] ${req.method} ${req.originalUrl}`);
        console.log(`✅ [ADMIN RESPONSE] Response Length: ${data ? data.length : 0} bytes`);
        console.log(`✅ [ADMIN RESPONSE] ================================`);
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
router.post('/signup', adminAuthLimit, (req, res, next) => {
    console.log(`📝 [ADMIN SIGNUP] Starting admin signup process...`);
    console.log(`📝 [ADMIN SIGNUP] Email: ${req.body.email}`);
    console.log(`📝 [ADMIN SIGNUP] Name: ${req.body.name}`);
    next();
}, validateAdminSignup, handleValidationErrors, AdminAuthController.signup);

router.post('/login', adminAuthLimit, (req, res, next) => {
    console.log(`🔑 [ADMIN LOGIN] Starting admin login process...`);
    console.log(`🔑 [ADMIN LOGIN] Email: ${req.body.email}`);
    next();
}, validateAdminLogin, handleValidationErrors, AdminAuthController.login);

// POST /admin/forgot-password - Request password reset for admin via email with reset link
router.post('/forgot-password', adminRateLimit, (req, res, next) => {
    console.log(`🔒 [FORGOT PASSWORD] Starting password reset process...`);
    console.log(`🔒 [FORGOT PASSWORD] Email: ${req.body.email}`);
    next();
}, validateAdminEmail, handleValidationErrors, AdminAuthController.forgotPassword);


// POST /admin/reset-password - Process password reset with token
router.post('/reset-password', adminRateLimit, (req, res, next) => {
    console.log(`🔄 [RESET PASSWORD] Processing password reset...`);
    console.log(`🔄 [RESET PASSWORD] Token: ${req.body.token ? 'Present' : 'Missing'}`);
    next();
}, validateAdminPasswordReset, handleValidationErrors, AdminAuthController.resetPassword);

    
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
