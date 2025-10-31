const express = require('express');
const {
  upsertCMSPage,
  getPublicCMSPageHTML
} = require('../../controllers/cmsController'); // Use require

// Assuming you import your authentication middleware here:
// const { protect, admin } = require('../middleware/authMiddleware'); 

const router = express.Router();

// Admin: upsert only
router.put('/admin/cms-pages/:slug', /* protect, admin, */ upsertCMSPage);

// Public: full HTML
router.get('/:slug', getPublicCMSPageHTML);


module.exports = router; // Use module.exports = router;