// controllers/cmsController.js
const CMSPage = require('../models/CMSPage');
const ResponseHandler = require('../utils/ResponseHandler');
const Logger = require('../utils/logger');

/**
 * Admin: Create or Update CMS Page
 * POST /api/cms/admin/create
 */
exports.upsertCMSPage = async (req, res) => {
  const requestId = Logger.generateId('cms-upsert');
  
  try {
    Logger.info(requestId, 'CMS page upsert started');
    
    const { slug, title, htmlContent } = req.body;

    // Validation
    if (!slug || !title || !htmlContent) {
      Logger.warn(requestId, 'Validation failed - missing required fields');
      return ResponseHandler.error(res, 'Validation failed', 'slug, title, and htmlContent are required', 400, 'CMS_MISSING_FIELDS');
    }

    // Sanitize slug
    const sanitizedSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    Logger.debug(requestId, 'Slug sanitized', { original: slug, sanitized: sanitizedSlug });

    // Find and update or create new
    const cmsPage = await CMSPage.findOneAndUpdate(
      { slug: sanitizedSlug },
      {
        slug: sanitizedSlug,
        title,
        htmlContent,
        updatedAt: Date.now()
      },
      {
        upsert: true, // Create if doesn't exist
        new: true,    // Return updated document
        runValidators: true
      }
    );

    Logger.success(requestId, 'CMS page saved successfully', { slug: sanitizedSlug });
    return ResponseHandler.success(res, 'CMS page saved successfully', cmsPage);

  } catch (error) {
    Logger.error(requestId, 'CMS upsert error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to save CMS page');
  }
};

/**
 * Admin: Get CMS Page for Editing
 * GET /api/cms/admin/:slug
 */
exports.getCMSPageForEdit = async (req, res) => {
  const requestId = Logger.generateId('cms-get-edit');
  
  try {
    const { slug } = req.params;
    Logger.info(requestId, 'Fetching CMS page for edit', { slug });
    
    const cmsPage = await CMSPage.findOne({ slug });
    
    if (!cmsPage) {
      Logger.warn(requestId, 'CMS page not found', { slug });
      return ResponseHandler.notFound(res, 'CMS page not found', 'CMS_PAGE_NOT_FOUND');
    }

    Logger.success(requestId, 'CMS page fetched successfully', { slug });
    return ResponseHandler.success(res, 'CMS page fetched successfully', cmsPage);

  } catch (error) {
    Logger.error(requestId, 'CMS fetch error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to fetch CMS page');
  }
};

/**
 * Admin: List all CMS Pages
 * GET /api/cms/admin/cms
 */
exports.listCMSPages = async (req, res) => {
  const requestId = Logger.generateId('cms-list');
  
  try {
    Logger.info(requestId, 'Listing all CMS pages');
    
    const pages = await CMSPage.find()
      .select('slug title updatedAt')
      .sort({ updatedAt: -1 });

    Logger.success(requestId, 'CMS pages listed successfully', { count: pages.length });
    return ResponseHandler.success(res, 'CMS pages retrieved successfully', pages);

  } catch (error) {
    Logger.error(requestId, 'CMS list error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to list CMS pages');
  }
};

/**
 * Public: Get CMS Page as HTML (for WebView)
 * GET /api/cms/:slug
 */
exports.getPublicCMSPageHTML = async (req, res) => {
  const requestId = Logger.generateId('cms-public');
  
  try {
    const { slug } = req.params;
    Logger.info(requestId, 'Fetching public CMS page', { slug });
    
    const cmsPage = await CMSPage.findOne({ slug })
      .select('title htmlContent');
    
    if (!cmsPage) {
      Logger.warn(requestId, 'Public CMS page not found', { slug });
      return res
        .status(404)
        .set('Content-Type', 'text/html; charset=utf-8')
        .send(generateErrorHTML('404', 'Page Not Found'));
    }

    // Generate full HTML document for mobile WebView
    const fullHTML = generateFullHTML(cmsPage.title, cmsPage.htmlContent);

    Logger.success(requestId, 'Public CMS page served', { slug });
    return res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'no-cache')
      .set('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline' 'unsafe-hashes'; script-src-attr 'unsafe-inline' 'unsafe-hashes'; style-src 'unsafe-inline';")
      .send(fullHTML);

  } catch (error) {
    Logger.error(requestId, 'Public CMS fetch error', { 
      error: error.message, 
      stack: error.stack 
    });
    return res
      .status(500)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(generateErrorHTML('500', 'Server Error'));
  }
};

/**
 * Admin: Delete CMS Page
 * DELETE /api/cms/admin/:slug
 */
exports.deleteCMSPage = async (req, res) => {
  const requestId = Logger.generateId('cms-delete');
  
  try {
    const { slug } = req.params;
    Logger.info(requestId, 'Deleting CMS page', { slug });
    
    const result = await CMSPage.findOneAndDelete({ slug });
    
    if (!result) {
      Logger.warn(requestId, 'CMS page not found for deletion', { slug });
      return ResponseHandler.notFound(res, 'CMS page not found', 'CMS_PAGE_NOT_FOUND');
    }

    Logger.success(requestId, 'CMS page deleted successfully', { slug });
    return ResponseHandler.success(res, 'CMS page deleted successfully');

  } catch (error) {
    Logger.error(requestId, 'CMS delete error', { 
      error: error.message, 
      stack: error.stack 
    });
    return ResponseHandler.serverError(res, 'Failed to delete CMS page');
  }
};

// Helper function to generate full HTML document
function generateFullHTML(title, content) {
  // Extract and separate scripts from content
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts = [];
  let contentWithoutScripts = content;
  
  let match;
  while ((match = scriptRegex.exec(content)) !== null) {
    scripts.push(match[1]); // Store script content
    contentWithoutScripts = contentWithoutScripts.replace(match[0], ''); // Remove script tags
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
    ${contentWithoutScripts}
    ${scripts.length > 0 ? `<script>
        // Execute scripts after DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {
            ${scripts.join('\n')}
        });
        // Also execute immediately in case DOM is already loaded
        if (document.readyState === 'loading') {
            // DOM not ready, event listener will handle it
        } else {
            // DOM already loaded, execute now
            ${scripts.join('\n')}
        }
    </script>` : ''}
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