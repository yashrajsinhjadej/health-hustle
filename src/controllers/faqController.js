// controllers/faqController.js
const FAQ = require('../models/FAQ');

/**
 * Admin: Get all FAQ items
 * GET /api/faq/admin
 */
exports.getAllFaqs = async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ order: 1 });

    return res.status(200).json({
      success: true,
      message: 'FAQ items retrieved successfully',
      data: faqs
    });
  } catch (error) {
    console.error('❌ Get FAQs Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve FAQ items',
      error: error.message
    });
  }
};

/**
 * Admin: Add new FAQ item
 * POST /api/faq/admin
 */
exports.addFaq = async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        message: 'Question and answer are required'
      });
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

    return res.status(201).json({
      success: true,
      message: 'FAQ item added successfully',
      data: faq
    });
  } catch (error) {
    console.error('❌ Add FAQ Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add FAQ item',
      error: error.message
    });
  }
};

/**
 * Admin: Update FAQ item
 * PUT /api/faq/admin/:id
 */
exports.updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, isActive } = req.body;

    const faq = await FAQ.findById(id);

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ item not found'
      });
    }

    // Update fields
    if (question !== undefined) faq.question = question.trim();
    if (answer !== undefined) faq.answer = answer.trim();
    if (isActive !== undefined) faq.isActive = isActive;
    faq.updatedAt = Date.now();

    await faq.save();

    return res.status(200).json({
      success: true,
      message: 'FAQ item updated successfully',
      data: faq
    });
  } catch (error) {
    console.error('❌ Update FAQ Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update FAQ item',
      error: error.message
    });
  }
};

/**
 * Admin: Delete FAQ item
 * DELETE /api/faq/admin/:id
 */
exports.deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the FAQ to get its order
    const faq = await FAQ.findById(id);

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ item not found'
      });
    }

    const deletedOrder = faq.order;

    // Delete the FAQ
    await FAQ.findByIdAndDelete(id);

    // Update order for all FAQs that came after the deleted one
    await FAQ.updateMany(
      { order: { $gt: deletedOrder } },
      { $inc: { order: -1 } }
    );

    console.log(`✅ FAQ deleted and order updated for items after position ${deletedOrder}`);

    return res.status(200).json({
      success: true,
      message: 'FAQ item deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete FAQ Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete FAQ item',
      error: error.message
    });
  }
};

/**
 * Admin: Reorder FAQ items
 * PUT /api/faq/admin/reorder
 */
exports.reorderFaqs = async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'orderedIds array is required'
      });
    }

    // Update order for each FAQ
    const updatePromises = orderedIds.map((id, index) =>
      FAQ.findByIdAndUpdate(id, { order: index + 1, updatedAt: Date.now() })
    );

    await Promise.all(updatePromises);

    const faqs = await FAQ.find().sort({ order: 1 });

    return res.status(200).json({
      success: true,
      message: 'FAQ items reordered successfully',
      data: faqs
    });
  } catch (error) {
    console.error('❌ Reorder FAQs Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reorder FAQ items',
      error: error.message
    });
  }
};

/**
 * Public: Get FAQ as HTML (for mobile WebView)
 * GET /api/cms/faq/public
 */
exports.getPublicFaqHtml = async (req, res) => {
  try {
    const faqs = await FAQ.find({ isActive: true }).sort({ order: 1 });

    // Generate compact HTML with inline styles
    const htmlContent = generateFaqHTML(faqs);

    // Return HTML directly with proper CSP for inline events
    return res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'no-cache')
      .set('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval'; script-src-attr 'unsafe-inline'; style-src 'unsafe-inline';")
      .send(htmlContent);
  } catch (error) {
    console.error('❌ Get Public FAQ Error:', error);
    return res
      .status(500)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send('<h1>Error loading FAQ</h1>');
  }
};

/**
 * Public: Get FAQ as JSON (for mobile app native UI)
 * GET /api/faq/public/json
 */
exports.getPublicFaqJson = async (req, res) => {
  try {
    const faqs = await FAQ.find({ isActive: true })
      .sort({ order: 1 })
      .select('question answer order');

    return res.status(200).json({
      success: true,
      data: faqs
    });
  } catch (error) {
    console.error('❌ Get Public FAQ JSON Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve FAQ items',
      error: error.message
    });
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
