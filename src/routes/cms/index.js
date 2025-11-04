const express = require('express');
const { authenticateToken, adminOnly } = require('../../middleware/auth');

const {
  upsertCMSPage,
  getCMSPageForEdit,
  listCMSPages,
  getPublicCMSPageHTML,
  deleteCMSPage
} = require('../../controllers/cmsController');

const {
  getAllFaqs,
  addFaq,
  updateFaq,
  deleteFaq,
  reorderFaqs,
  getPublicFaqHtml,
  getPublicFaqJson
} = require('../../controllers/faqController');

const router = express.Router();

// ============================================
// PUBLIC ROUTES (No Auth)
// ============================================

// Get CMS Page as HTML (for WebView)
router.get('/faq', getPublicFaqHtml);

router.get('/:slug', getPublicCMSPageHTML);
// Get FAQ as HTML for WebView

// Get FAQ as JSON for native mobile UI
router.get('/faq/public/json', getPublicFaqJson);

// ============================================
// ADMIN ROUTES (Protected)
// ============================================
router.use(authenticateToken);
router.use(adminOnly);

// FAQ Management (Must come BEFORE :slug routes)
router.get('/admin/faq', getAllFaqs);
router.post('/admin/faq', addFaq);
router.put('/admin/faq/reorder', reorderFaqs);
router.put('/admin/faq/:id', updateFaq);
router.delete('/admin/faq/:id', deleteFaq);

// CMS Pages Management
router.post('/admin/create', upsertCMSPage);
router.get('/admin/cms', listCMSPages);
router.get('/admin/:slug', getCMSPageForEdit);
router.delete('/admin/:slug', deleteCMSPage);

module.exports = router;