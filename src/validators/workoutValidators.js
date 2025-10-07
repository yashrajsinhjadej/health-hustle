const {body,validationResult} = require('express-validator');
const ResponseHandler = require('../utils/responseHandler');

const createWorkoutValidator = [
  body('name')
    .notEmpty().withMessage('Workout name is required')
    .isString().withMessage('Name must be a string')
    .trim(),

  body('duration')
    .notEmpty().withMessage('Duration is required')
    .isInt({ min: 1 }).withMessage('Duration must be a positive number'),

  body('level')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Level must be beginner, intermediate, or advanced'),

  body('category')
    .optional()
    .isArray().withMessage('Category must be an array of strings'),

  body('bannerUrl')
    .optional()
    .isURL().withMessage('Banner URL must be a valid URL'),

  body('thumbnailUrl')
    .optional()
    .isURL().withMessage('Thumbnail URL must be a valid URL'),

  body('introduction')
    .optional()
    .isString().withMessage('Introduction must be a string'),

  body('detailedInstructions')
    .optional()
    .isArray().withMessage('Detailed instructions must be an array of strings'),

  body('equipment')
    .optional()
    .isArray().withMessage('Equipment must be an array of strings'),

  body('targetMuscles')
    .optional()
    .isArray().withMessage('Target muscles must be an array of strings'),

  body('caloriesBurnedEstimate')
    .optional()
    .isInt({ min: 0 }).withMessage('Calories burned must be a positive number'),
  body('sequence')
  .optional()
  .isInt({ min: 1 }).withMessage('Sequence must be a positive integer'),
];




const handleValidationErrors = (req, res, next) => {
    console.log(`🔍 [${req.requestId}] handleValidationErrors middleware called`);
    const errors = validationResult(req);
    
    console.log(`🔍 [${req.requestId}] Validation check - Total errors found: ${errors.array().length}`);
    
    if (!errors.isEmpty()) {
        console.log(`❌ [${req.requestId}] Validation FAILED - Errors:`, JSON.stringify(errors.array(), null, 2));
        return ResponseHandler.validationError(res, errors);
    }
    
    console.log(`✅ [${req.requestId}] Validation PASSED - No errors found`);
    next();
};

module.exports = {
    createWorkoutValidator,
    handleValidationErrors
};
