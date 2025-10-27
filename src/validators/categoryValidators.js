const { body, param, validationResult } = require('express-validator');

const ResponseHandler = require('../utils/ResponseHandler');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return ResponseHandler.badRequest(res, 'Validation errors', { errors: errors.array() });
    }
    next();
};

const createCategoryValidator = [
    body('name')
        .notEmpty().withMessage('Category name is required')
        .isString().withMessage('Category name must be a string')
        .trim()
        .isLength({ max: 100 }).withMessage('Category name can be at most 100 characters long'),
    body('designId')
        .notEmpty().withMessage('Design ID is required')
        .isInt({ gt: 0 }).withMessage('Design ID must be a positive integer')
        .toInt(), // Convert string to integer
    body('categorySequence')
        .optional()
        .isInt({ gt: 0 }).withMessage('Category sequence must be a positive integer')
        .toInt(), // Convert string to integer
    handleValidationErrors
];

const updateCategoryValidator = [
    param('id')
        .notEmpty().withMessage('Category ID is required')
        .isMongoId().withMessage('Invalid Category ID format'),
    body('name')
        .optional()
        .isString().withMessage('Category name must be a string')
        .trim()
        .isLength({ max: 100 }).withMessage('Category name can be at most 100 characters long'),
    body('designId')
        .optional()
        .isInt({ gt: 0 }).withMessage('Design ID must be a positive integer')
        .toInt(),
    body('categorySequence')
        .optional()
        .isInt({ gt: 0 }).withMessage('Category sequence must be a positive integer')
        .toInt(),
    handleValidationErrors
];

const deleteCategoryValidator = [
    param('id')
        .notEmpty().withMessage('Category ID is required')
        .isMongoId().withMessage('Invalid Category ID format'),
    handleValidationErrors
];

module.exports = {
    createCategoryValidator,
    updateCategoryValidator,
    deleteCategoryValidator,
    handleValidationErrors
};