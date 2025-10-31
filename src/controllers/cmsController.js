// controllers/cmsController.js
const CMSPage = require('../models/CMSPage');
const ResponseHandler = require('../utils/ResponseHandler');

/**
 * Generate final mobile-wrapped HTML from rawContent.
 * - For 'contact-us': expects JSON string; renders structured sections.
 * - For others (e.g., 'about-us'): converts Markdown to HTML; HTML strings pass through via marked.
 */
const generateHtmlFromRaw = async (rawContent, slug) => {
  let contentHtml = '';

  const { marked } = await import('marked'); // dynamic import

  const baseStyle = `
    body { font-family: sans-serif; padding: 15px; margin: auto; line-height: 1.6; color: #1c1c1c; }
    h1, h2 { font-size: 16px; font-weight: bold; margin-top: 25px; margin-bottom: 10px; }
    p, li { font-size: 15px; margin-bottom: 5px; }
    a { text-decoration: none; color: #007bff; }
    ul { list-style: none; padding: 0; }
  `;

  try {
    if (slug === 'contact-us') {
      const data = JSON.parse(rawContent);

      if (data.customerSupport || data.socialMedia) {
        let supportHtml = `
          <p style="margin-bottom: 25px;">Have questions or need support? We're here to help. Reach out to us anytime.</p>
          <h2 style="font-size: 18px;">Customer support</h2>
          <div style="margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
            <p style="margin: 5px 0; font-weight: bold;">Contact number</p>
            <p style="margin: 5px 0;"><a href="tel:${data.customerSupport.contactNumber}">${data.customerSupport.contactNumber}</a></p>
            <p style="margin: 5px 0; font-weight: bold;">Email id</p>
            <p style="margin: 5px 0;"><a href="mailto:${data.customerSupport.emailId}">${data.customerSupport.emailId}</a></p>
          </div>
        `;

        let socialHtml = `
          <h2 style="font-size: 18px;">Social media</h2>
          <ul>
        `;
        (data.socialMedia || []).forEach((item) => {
          socialHtml += `
            <li style="margin-bottom: 15px;">
              <p style="margin: 5px 0; font-weight: bold;">${item.platform}</p>
              <p style="margin: 5px 0;"><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.url}</a></p>
            </li>
          `;
        });
        socialHtml += `</ul>`;

        contentHtml = supportHtml + socialHtml;
      }
    }

    // Default path: Markdown → HTML
    if (!contentHtml) {
      contentHtml = marked(rawContent);
    }
  } catch (e) {
    console.error(`Error generating HTML for slug ${slug}:`, e);
    contentHtml = '<h1>Content Error</h1><p>The page content failed to render due to a formatting issue.</p>';
  }

  const mobileWrapper = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>${baseStyle}</style>
    </head>
    <body>
      <div style="padding-top: 15px;">
        ${contentHtml}
      </div>
    </body>
    </html>
  `;
  return mobileWrapper;
};

/**
 * PUT /api/admin/cms-pages/:slug
 * Upsert a CMS page: update if exists, create if not.
 */
exports.upsertCMSPage = async (req, res) => {
  const { slug } = req.params;
  const { title, rawContent } = req.body;

  if (!rawContent && !title) {
    return ResponseHandler.error(res, 400, "Please provide 'rawContent' or 'title' to upsert.");
  }

  try {
    const updateFields = {};
    if (typeof title === 'string' && title.trim().length > 0) {
      updateFields.title = title.trim();
    }
    if (typeof rawContent === 'string') {
      updateFields.rawContent = rawContent;
      updateFields.htmlContent = await generateHtmlFromRaw(rawContent, slug); // await here
    }

    const defaultTitle =
      updateFields.title ||
      slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const cmsPage = await CMSPage.findOneAndUpdate(
      { slug },
      {
        $setOnInsert: { slug, title: defaultTitle },
        $set: updateFields,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );

    const wasJustCreated =
      cmsPage.createdAt &&
      Math.abs(Date.now() - new Date(cmsPage.createdAt).getTime()) < 2500;

    const message = wasJustCreated
      ? 'CMS Page created (upsert) successfully.'
      : 'CMS Page updated successfully.';

    return ResponseHandler.success(res, message, cmsPage.slug);
  } catch (error) {
    console.error('CMS Upsert Error:', error);
    return ResponseHandler.error(res, 400, 'Upsert failed due to validation or server error.');
  }
};

/**
 * GET /api/web/cms/:slug
 * Return the full HTML document (mobile-wrapped).
 */
exports.getPublicCMSPageHTML = async (req, res) => {
  try {
    const cmsPage = await CMSPage.findOne({ slug: req.params.slug }).select('htmlContent');
    
    if (!cmsPage) {
      return res
        .status(404)
        .set('Content-Type', 'text/html')
        .send('<h1>404</h1><p>Page Not Found</p>');
    }

    return res.status(200).set('Content-Type', 'text/html').send(cmsPage.htmlContent);
  } catch (error) {
    console.error('Public CMS Fetch Error:', error);
    return res
      .status(500)
      .set('Content-Type', 'text/html')
      .send('<h1>500</h1><p>Server Error</p>');
  }
};
