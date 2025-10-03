// Admin Routes - Simple admin endpoints
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken, adminOnly } = require('../middleware/auth');
const AdminAuthController = require('../controllers/AdminAuthController');
const AuthController = require('../controllers/AuthController');
const ResponseHandler = require('../utils/ResponseHandler');
const createCustomRateLimit = require('../middleware/customRateLimit');
const { 
    validateAdminSignup, 
    validateAdminLogin, 
    validateAdminEmail,
    validateAdminPasswordReset,
    handleValidationErrors 
} = require('../validators/userValidators');

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

// Public admin auth routes (no authentication required)
router.post('/signup', adminRateLimit, (req, res, next) => {
    console.log(`📝 [ADMIN SIGNUP] Starting admin signup process...`);
    console.log(`📝 [ADMIN SIGNUP] Email: ${req.body.email}`);
    console.log(`📝 [ADMIN SIGNUP] Name: ${req.body.name}`);
    next();
}, validateAdminSignup, handleValidationErrors, AdminAuthController.signup);

router.post('/login', adminRateLimit, (req, res, next) => {
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

// GET /admin/reset-password - Show password reset form
router.get('/reset-password', (req, res, next) => {
    console.log(`🔓 [RESET PASSWORD FORM] Showing password reset form...`);
    console.log(`🔓 [RESET PASSWORD FORM] Token: ${req.query.token ? 'Present' : 'Missing'}`);
    next();
}, AdminAuthController.showResetForm);

// POST /admin/reset-password - Process password reset with token
router.post('/reset-password', adminRateLimit, (req, res, next) => {
    console.log(`🔄 [RESET PASSWORD] Processing password reset...`);
    console.log(`🔄 [RESET PASSWORD] Token: ${req.body.token ? 'Present' : 'Missing'}`);
    next();
}, validateAdminPasswordReset, handleValidationErrors, AdminAuthController.resetPassword);

// GET /admin/forgot-password - Show forgot password form
router.get('/forgot-password', (req, res, next) => {
    console.log(`📧 [FORGOT PASSWORD FORM] Showing forgot password form...`);
    next();
}, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Password Reset - Health Hustle</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
                .form-group { margin-bottom: 15px; }
                label { display: block; margin-bottom: 5px; font-weight: bold; }
                input[type="email"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
                button { background-color: #e74c3c; color: white; padding: 12px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
                button:hover { background-color: #c0392b; }
                .header { text-align: center; margin-bottom: 30px; }
                .header h1 { color: #e74c3c; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Health Hustle Admin</h1>
                <h2>Forgot Your Password?</h2>
                <p>Enter your admin email address and we'll send you a password reset link.</p>
            </div>
            
            <form method="POST" action="/api/admin/forgot-password">
                <div class="form-group">
                    <label for="email">Admin Email:</label>
                    <input type="email" id="email" name="email" required 
                           placeholder="Enter your admin email address">
                </div>
                
                <button type="submit">Send Reset Link</button>
            </form>
        </body>
        </html>
    `);
});

// Protected admin routes (authentication required)
const protectedRouter = express.Router();
protectedRouter.use(authenticateToken);
protectedRouter.use(adminOnly);
protectedRouter.use(adminRateLimit);

// Add protected route logging
protectedRouter.use((req, res, next) => {
    console.log(`🛡️ [PROTECTED ADMIN] ================================`);
    console.log(`🛡️ [PROTECTED ADMIN] ${req.method} ${req.originalUrl}`);
    console.log(`🛡️ [PROTECTED ADMIN] User ID: ${req.user ? req.user._id : 'Unknown'}`);
    console.log(`🛡️ [PROTECTED ADMIN] User Email: ${req.user ? req.user.email : 'Unknown'}`);
    console.log(`🛡️ [PROTECTED ADMIN] User Role: ${req.user ? req.user.role : 'Unknown'}`);
    console.log(`🛡️ [PROTECTED ADMIN] ================================`);
    next();
});

// GET /admin/profile - Get admin profile
protectedRouter.get('/profile', (req, res, next) => {
    console.log(`👤 [ADMIN PROFILE] Getting admin profile...`);
    console.log(`👤 [ADMIN PROFILE] Admin ID: ${req.user._id}`);
    next();
}, AdminAuthController.getProfile);

// POST /admin/logout - Admin logout with enhanced tracking and security monitoring
protectedRouter.post('/logout', (req, res, next) => {
    console.log(`🚪 [ADMIN LOGOUT] Admin logging out...`);
    console.log(`🚪 [ADMIN LOGOUT] Admin ID: ${req.user._id}`);
    next();
}, AdminAuthController.logout);

// GET /admin/dashboard - Enhanced admin dashboard with pagination and performance optimization
protectedRouter.get('/dashboard', (req, res, next) => {
    console.log(`📊 [ADMIN DASHBOARD] Loading dashboard...`);
    console.log(`📊 [ADMIN DASHBOARD] Page: ${req.query.page || 1}`);
    console.log(`📊 [ADMIN DASHBOARD] Limit: ${req.query.limit || 10}`);
    console.log(`📊 [ADMIN DASHBOARD] Search: ${req.query.search || 'None'}`);
    next();
}, AdminAuthController.dashboard);

// GET /admin/users/:userId - Get individual user details
protectedRouter.get('/users/:userId', (req, res, next) => {
    console.log(`👥 [GET USER] Getting user details...`);
    console.log(`👥 [GET USER] Target User ID: ${req.params.userId}`);
    console.log(`👥 [GET USER] Admin ID: ${req.user._id}`);
    next();
}, AdminAuthController.getUser);

// DELETE /admin/users/:userId - Delete a user and return updated list with pagination
protectedRouter.delete('/users/:userId', (req, res, next) => {
    console.log(`❌ [DELETE USER] Deleting user...`);
    console.log(`❌ [DELETE USER] Target User ID: ${req.params.userId}`);
    console.log(`❌ [DELETE USER] Admin ID: ${req.user._id}`);
    next();
}, AdminAuthController.deleteUser);

// PUT /admin/users/:userId - Update user details with comprehensive validation
protectedRouter.put('/users/:userId', (req, res, next) => {
    console.log(`✏️ [UPDATE USER] Updating user...`);
    console.log(`✏️ [UPDATE USER] Target User ID: ${req.params.userId}`);
    console.log(`✏️ [UPDATE USER] Admin ID: ${req.user._id}`);
    console.log(`✏️ [UPDATE USER] Updates:`, JSON.stringify(req.body, null, 2));
    next();
}, AdminAuthController.updateUser);

// Mount protected routes
router.use('/', protectedRouter);

module.exports = router;
