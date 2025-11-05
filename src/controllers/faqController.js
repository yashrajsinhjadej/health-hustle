// controllers/faqController.js
const FAQ = require('../models/FAQ');
const Logger = require('../utils/logger');
const ResponseHandler = require('../utils/ResponseHandler');

/**
 * Admin: Get all FAQ items
 * GET /api/cms/admin/faq
 */
exports.getAllFaqs = async (req, res) => {
  const requestId = Logger.generateId('faq-get-all');
  
  try {
    Logger.info(requestId, 'Fetching all FAQ items');
    
    const faqs = await FAQ.find().sort({ order: 1 });

    Logger.success(requestId, 'FAQ items retrieved successfully', { count: faqs.length });
    return ResponseHandler.success(res, 'FAQ items retrieved successfully', faqs);
    
  } catch (error) {
    Logger.error(requestId, 'Get FAQs error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to retrieve FAQ items');
  }
};

/**
 * Admin: Add new FAQ item
 * POST /api/cms/admin/faq
 */
exports.addFaq = async (req, res) => {
  const requestId = Logger.generateId('faq-add');
  
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      Logger.warn(requestId, 'Validation failed - missing required fields');
      return ResponseHandler.error(res, 'Validation failed', 'Question and answer are required', 400, 'FAQ_MISSING_FIELDS');
    }

    // Get the highest order number
    const maxOrderFaq = await FAQ.findOne().sort({ order: -1 });
    const newOrder = maxOrderFaq ? maxOrderFaq.order + 1 : 1;

    // Create new FAQ
    const faq = new FAQ({
      question: question.trim(),
      answer: answer.trim(),
      order: newOrder
    });

    await faq.save();

    Logger.success(requestId, 'FAQ item added successfully', { order: newOrder });
    return ResponseHandler.created(res, 'FAQ item added successfully', faq);
    
  } catch (error) {
    Logger.error(requestId, 'Add FAQ error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to add FAQ item');
  }
};

/**
 * Admin: Update FAQ item
 * PUT /api/cms/admin/faq/:id
 */
exports.updateFaq = async (req, res) => {
  const requestId = Logger.generateId('faq-update');
  
  try {
    const { id } = req.params;
    const { question, answer, isActive } = req.body;

    Logger.info(requestId, 'Updating FAQ item', { id });

    const faq = await FAQ.findById(id);

    if (!faq) {
      Logger.warn(requestId, 'FAQ item not found', { id });
      return ResponseHandler.notFound(res, 'FAQ item not found', 'FAQ_NOT_FOUND');
    }

    // Update fields
    if (question !== undefined) faq.question = question.trim();
    if (answer !== undefined) faq.answer = answer.trim();
    if (isActive !== undefined) faq.isActive = isActive;
    faq.updatedAt = Date.now();

    await faq.save();

    Logger.success(requestId, 'FAQ item updated successfully', { id });
    return ResponseHandler.success(res, 'FAQ item updated successfully', faq);
    
  } catch (error) {
    Logger.error(requestId, 'Update FAQ error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to update FAQ item');
  }
};

/**
 * Admin: Delete FAQ item
 * DELETE /api/cms/admin/faq/:id
 */
exports.deleteFaq = async (req, res) => {
  const requestId = Logger.generateId('faq-delete');
  
  try {
    const { id } = req.params;

    Logger.info(requestId, 'Deleting FAQ item', { id });

    // Find the FAQ to get its order
    const faq = await FAQ.findById(id);

    if (!faq) {
      Logger.warn(requestId, 'FAQ item not found', { id });
      return ResponseHandler.notFound(res, 'FAQ item not found', 'FAQ_NOT_FOUND');
    }

    const deletedOrder = faq.order;

    // Delete the FAQ
    await FAQ.findByIdAndDelete(id);

    // Update order for all FAQs that came after the deleted one
    await FAQ.updateMany(
      { order: { $gt: deletedOrder } },
      { $inc: { order: -1 } }
    );

    Logger.success(requestId, 'FAQ deleted and order updated', { 
      id, 
      deletedOrder 
    });

    return ResponseHandler.success(res, 'FAQ item deleted successfully');
    
  } catch (error) {
    Logger.error(requestId, 'Delete FAQ error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to delete FAQ item');
  }
};

/**
 * Admin: Reorder FAQ items
 * PUT /api/cms/admin/faq/reorder
 */
exports.reorderFaqs = async (req, res) => {
  const requestId = Logger.generateId('faq-reorder');
  
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      Logger.warn(requestId, 'Validation failed - invalid orderedIds');
      return ResponseHandler.error(res, 'Validation failed', 'orderedIds array is required', 400, 'FAQ_INVALID_ORDER');
    }

    Logger.info(requestId, 'Reordering FAQ items', { count: orderedIds.length });

    // Update order for each FAQ
    const updatePromises = orderedIds.map((id, index) =>
      FAQ.findByIdAndUpdate(id, { order: index + 1, updatedAt: Date.now() })
    );

    await Promise.all(updatePromises);

    const faqs = await FAQ.find().sort({ order: 1 });

    Logger.success(requestId, 'FAQ items reordered successfully');
    return ResponseHandler.success(res, 'FAQ items reordered successfully', faqs);
    
  } catch (error) {
    Logger.error(requestId, 'Reorder FAQs error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to reorder FAQ items');
  }
};

/**
 * Public: Get FAQ as HTML (for mobile WebView)
 * GET /api/cms/faq
 */
exports.getPublicFaqHtml = async (req, res) => {
  const requestId = Logger.generateId('faq-public-html');
  
  try {
    Logger.info(requestId, 'Fetching public FAQ as HTML');
    
    const faqs = await FAQ.find({ isActive: true }).sort({ order: 1 });

    // Generate compact HTML with inline styles
    const htmlContent = generateFaqHTML(faqs);

    Logger.success(requestId, 'Public FAQ HTML served', { count: faqs.length });
    
    // Return HTML directly with proper CSP for inline events
    return res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'no-cache')
      .set('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval'; script-src-attr 'unsafe-inline'; style-src 'unsafe-inline';")
      .send(htmlContent);
      
  } catch (error) {
    Logger.error(requestId, 'Get public FAQ HTML error', { 
      error: error.message, 
      stack: error.stack 
    });
    return res
      .status(500)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send('<h1>Error loading FAQ</h1>');
  }
};

/**
 * Public: Get FAQ as JSON (for mobile app native UI)
 * GET /api/cms/faq/public/json
 */
exports.getPublicFaqJson = async (req, res) => {
  const requestId = Logger.generateId('faq-public-json');
  
  try {
    Logger.info(requestId, 'Fetching public FAQ as JSON');
    
    const faqs = await FAQ.find({ isActive: true })
      .sort({ order: 1 })
      .select('question answer order');

    Logger.success(requestId, 'Public FAQ JSON served', { count: faqs.length });
    return ResponseHandler.success(res, 'FAQ items retrieved successfully', faqs);
    
  } catch (error) {
    Logger.error(requestId, 'Get public FAQ JSON error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to retrieve FAQ items');
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate dropdown HTML for FAQ (compact inline style format)
 */
function generateFaqHTML(faqs) {
  const faqItems = faqs
    .map(
      (faq) =>
        `<div class="faq-item"><div class="faq-question"><span>${escapeHtml(
          faq.question
        )}</span><span class="faq-icon">∨</span></div><div class="faq-answer"><p>${escapeHtml(
          faq.answer
        )}</p></div></div>`
    )
    .join('');

  return `<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#ffffff;padding:0;margin:0}.faq-container{max-width:100%;padding:0}.faq-item{border-bottom:1px solid #f0f0f0;background:#fff}.faq-question{display:flex;justify-content:space-between;align-items:center;padding:20px 16px;cursor:pointer;font-weight:600;font-size:16px;color:#000;user-select:none;transition:background-color 0.2s}.faq-question:active{background-color:#f9f9f9}.faq-icon{font-size:16px;transition:transform 0.3s ease;color:#000;font-weight:normal}.faq-item.active .faq-icon{transform:rotate(180deg)}.faq-answer{max-height:0;overflow:hidden;transition:max-height 0.3s ease,padding 0.3s ease;padding:0 16px;background:#fff}.faq-item.active .faq-answer{max-height:300px;padding:0 16px 20px 16px}.faq-answer p{color:#666;font-size:14px;line-height:1.6;margin:0;font-weight:400}</style><div class="faq-container">${faqItems}</div><script>document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.faq-item').forEach(function(item){item.addEventListener('click',function(){this.classList.toggle('active')})})});if(document.readyState!=='loading'){document.querySelectorAll('.faq-item').forEach(function(item){item.addEventListener('click',function(){this.classList.toggle('active')})})}</script>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

module.exports = exports;
