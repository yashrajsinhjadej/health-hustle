const ResponseHandler = require('../utils/ResponseHandler');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Middleware to validate image uploads
 * Checks file type and size for all uploaded files
 */
function validateImageUpload(req, res, next) {
    const files = req.files || {};
    
    // If no files, skip validation
    if (Object.keys(files).length === 0) {
        return next();
    }
    
    // Validate each file field
    for (const [fieldName, fileArray] of Object.entries(files)) {
        for (const file of fileArray) {
            // Check file type
            if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
                return ResponseHandler.error(
                    res,
                    'Invalid file type',
                    `${fieldName} must be JPEG, PNG, or WebP. Received: ${file.mimetype}`,
                    400
                );
            }
            
            // Check file size
            if (file.size > MAX_FILE_SIZE) {
                return ResponseHandler.error(
                    res,
                    'File too large',
                    `${fieldName} exceeds maximum size of 5MB (${(file.size / 1024 / 1024).toFixed(2)}MB provided)`,
                    400
                );
            }
        }
    }
    
    next();
}

module.exports = validateImageUpload;
