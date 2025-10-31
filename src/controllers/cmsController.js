// controllers/cmsController.js
const CMSPage = require('../models/CMSPage');

/**
 * Admin: Create or Update CMS Page
 * POST /api/admin/cms
 */
exports.upsertCMSPage = async (req, res) => {
  try {
    const { slug, title, htmlContent, metaDescription } = req.body;

    // Validation
    if (!slug || !title || !htmlContent) {
      return res.status(400).json({
        success: false,
        message: 'slug, title, and htmlContent are required'
      });
    }

    // Sanitize slug
    const sanitizedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');

    // Find and update or create new
    const cmsPage = await CMSPage.findOneAndUpdate(
      { slug: sanitizedSlug },
      {
        slug: sanitizedSlug,
        title,
        htmlContent,
        metaDescription: metaDescription || '',
        updatedAt: Date.now()
      },
      {
        upsert: true, // Create if doesn't exist
        new: true,    // Return updated document
        runValidators: true
      }
    );

    return res.status(200).json({
      success: true,
      message: 'CMS page saved successfully',
      data: cmsPage
    });

  } catch (error) {
    console.error('CMS Upsert Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save CMS page',
      error: error.message
    });
  }
};

/**
 * Admin: Get CMS Page for Editing
 * GET /api/admin/cms/:slug
 */
exports.getCMSPageForEdit = async (req, res) => {
  try {
    const cmsPage = await CMSPage.findOne({ slug: req.params.slug });
    
    if (!cmsPage) {
      return res.status(404).json({
        success: false,
        message: 'CMS page not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: cmsPage
    });

  } catch (error) {
    console.error('CMS Fetch Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch CMS page',
      error: error.message
    });
  }
};

/**
 * Admin: List all CMS Pages
 * GET /api/admin/cms
 */
exports.listCMSPages = async (req, res) => {
  try {
    const pages = await CMSPage.find()
      .select('slug title updatedAt')
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      data: pages
    });

  } catch (error) {
    console.error('CMS List Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list CMS pages',
      error: error.message
    });
  }
};

/**
 * Public: Get CMS Page as HTML (for WebView)
 * GET /api/public/cms/:slug
 */
exports.getPublicCMSPageHTML = async (req, res) => {
  try {
    const cmsPage = await CMSPage.findOne({ slug: req.params.slug })
      .select('title htmlContent metaDescription');
    
    if (!cmsPage) {
      return res
        .status(404)
        .set('Content-Type', 'text/html; charset=utf-8')
        .send(generateErrorHTML('404', 'Page Not Found'));
    }

    // Generate full HTML document for mobile WebView
    const fullHTML = generateFullHTML(cmsPage.title, cmsPage.htmlContent, cmsPage.metaDescription);

    return res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300') // Cache for 5 minutes
      .send(fullHTML);

  } catch (error) {
    console.error('Public CMS Fetch Error:', error);
    return res
      .status(500)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(generateErrorHTML('500', 'Server Error'));
  }
};

/**
 * Admin: Delete CMS Page
 * DELETE /api/admin/cms/:slug
 */
exports.deleteCMSPage = async (req, res) => {
  try {
    const result = await CMSPage.findOneAndDelete({ slug: req.params.slug });
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'CMS page not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'CMS page deleted successfully'
    });

  } catch (error) {
    console.error('CMS Delete Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete CMS page',
      error: error.message
    });
  }
};

// Helper function to generate full HTML document
function generateFullHTML(title, content, metaDescription = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="description" content="${escapeHtml(metaDescription)}">
    <title>${escapeHtml(title)}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            padding: 16px;
            background-color: #ffffff;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 12px;
            font-weight: 600;
            line-height: 1.3;
        }
        h1 { font-size: 28px; }
        h2 { font-size: 24px; }
        h3 { font-size: 20px; }
        p {
            margin-bottom: 16px;
        }
        ul, ol {
            margin-left: 24px;
            margin-bottom: 16px;
        }
        li {
            margin-bottom: 8px;
        }
        a {
            color: #007AFF;
            text-decoration: none;
        }
        a:active {
            opacity: 0.6;
        }
        img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 16px 0;
        }
        strong {
            font-weight: 600;
        }
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 16px;
            margin: 16px 0;
            color: #666;
            font-style: italic;
        }
        code {
            background-color: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        pre {
            background-color: #f5f5f5;
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin-bottom: 16px;
        }
        pre code {
            background-color: transparent;
            padding: 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: #f5f5f5;
            font-weight: 600;
        }
        /* Mobile-specific adjustments */
        @media (max-width: 768px) {
            body {
                padding: 12px;
            }
            h1 { font-size: 24px; }
            h2 { font-size: 20px; }
            h3 { font-size: 18px; }
        }
    </style>
</head>
<body>
    ${content}
</body>
</html>`;
}

// Helper function for error pages
function generateErrorHTML(code, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${code} - ${message}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
            padding: 20px;
            text-align: center;
        }
        .error-container {
            max-width: 400px;
        }
        h1 {
            font-size: 48px;
            color: #333;
            margin-bottom: 16px;
        }
        p {
            font-size: 18px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>${code}</h1>
        <p>${message}</p>
    </div>
</body>
</html>`;
}

// Helper function to escape HTML for meta tags
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

module.exports = exports;