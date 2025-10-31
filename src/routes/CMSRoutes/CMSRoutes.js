const express = require('express');
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

// Create or Update CMS Page
router.post('/admin/cms', /* protect, adminOnly, */ upsertCMSPage);

// Get CMS Page for Editing
router.get('/admin/:slug', /* protect, adminOnly, */ getCMSPageForEdit);

// List all CMS Pages
router.get('/admin/cms', /* protect, adminOnly, */ listCMSPages);

// Delete CMS Page
router.delete('/admin/cms/:slug', /* protect, adminOnly, */ deleteCMSPage);

// ============================================
// PUBLIC ROUTES (No Auth)
// ============================================

// Get CMS Page as HTML (for WebView)
router.get('/public/cms/:slug', getPublicCMSPageHTML);

module.exports = router;