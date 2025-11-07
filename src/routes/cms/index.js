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


const rateLimiters = require('../../middleware/redisrateLimiter').rateLimiters;


const router = express.Router();

// ============================================
// PUBLIC ROUTES (No Auth)
// ============================================

// Get FAQ as HTML for WebView

router.use(rateLimiters.global());


router.get('/faq', getPublicFaqHtml);

// Get FAQ as JSON for native mobile UI
router.get('/faq/public/json', getPublicFaqJson);

// ============================================
// ADMIN ROUTES (Protected) - Must come BEFORE public :slug route
// ============================================

// FAQ Management
router.get('/admin/faq', authenticateToken, adminOnly, getAllFaqs);
router.post('/admin/faq', authenticateToken, adminOnly, addFaq);
router.put('/admin/faq/reorder', authenticateToken, adminOnly, reorderFaqs);
router.put('/admin/faq/:id', authenticateToken, adminOnly, updateFaq);
router.delete('/admin/faq/:id', authenticateToken, adminOnly, deleteFaq);

// CMS Pages Management
router.post('/admin/create', authenticateToken, adminOnly, upsertCMSPage);
router.get('/admin/cms', authenticateToken, adminOnly, listCMSPages);
router.get('/admin/:slug', authenticateToken, adminOnly, getCMSPageForEdit);
router.put('/admin/:slug', authenticateToken, adminOnly, upsertCMSPage);  // Add PUT for updates
router.delete('/admin/:slug', authenticateToken, adminOnly, deleteCMSPage);

// ============================================
// MIXED ROUTES - Handle both authenticated and public
// ============================================

// Handle /:slug - if authenticated, return JSON for editing; if not, return HTML for public
router.get('/:slug', (req, res, next) => {
  const token = req.headers.authorization;
  if (token) {
    // Has token - treat as admin request for editing (return JSON)
    authenticateToken(req, res, (err) => {
      if (err) return next(err);
      getCMSPageForEdit(req, res);
    });
  } else {
    // No token - treat as public request (return HTML)
    getPublicCMSPageHTML(req, res);
  }
});

router.post('/:slug', authenticateToken, adminOnly, upsertCMSPage);

module.exports = router;