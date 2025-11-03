const express = require('express');
const { authenticateToken, adminOnly } = require('../../middleware/auth');


const {
  upsertCMSPage,
  getCMSPageForEdit,
  listCMSPages,
  getPublicCMSPageHTML,
  deleteCMSPage
} = require('../../controllers/cmsController');

// Import your auth middleware
// const { protect, adminOnly } = require('../middleware/authMiddleware');

const router = express.Router();

// ============================================
// ADMIN ROUTES (Protected)
// ============================================
router.get('/:slug', getPublicCMSPageHTML);

router.use(authenticateToken);
router.use(adminOnly);
// Create or Update CMS Page
router.post('/admin/create', /* protect, adminOnly, */ upsertCMSPage);

// Get CMS Page for Editing
router.get('/admin/cms', /* protect, adminOnly, */ listCMSPages);

router.get('/admin/:slug', /* protect, adminOnly, */ getCMSPageForEdit);

// List all CMS Pages

// Delete CMS Page
router.delete('/admin/:slug', /* protect, adminOnly, */ deleteCMSPage);

// ============================================
// PUBLIC ROUTES (No Auth)
// ============================================

// Get CMS Page as HTML (for WebView)

module.exports = router;