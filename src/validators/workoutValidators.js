const {body,param,query,validationResult} = require('express-validator');
const ResponseHandler = require('../utils/responseHandler');

const validateWorkoutImages = (isRequired = true) => {
  return (req, res, next) => {
    const files = req.files || {};
    const totalImages = (files.banner?.length || 0) + (files.thumbnail?.length || 0);

    if (isRequired && totalImages === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least 1 image is required (banner or thumbnail)',
      });
    }

    if (totalImages > 2) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 2 images allowed (banner + thumbnail)',
      });
    }

    next();
  };
};
const updateworkoutvalidator = [
    param('workoutId')
    .notEmpty().withMessage('Workout ID is required')
    .isMongoId().withMessage('Invalid Workout ID format'),
    body('name')
    .optional()
    .isString().withMessage('Name must be a string')
    .trim(),
    body('duration')
    .optional()
    .isInt({ min: 1 }).withMessage('Duration must be a positive number'),
    body('level')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Level must be beginner, intermediate, or advanced'),
    body('category')
    .optional()
    .isArray().withMessage('Category must be an array of strings'),
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

const getworkoutByIdvalidator = [
    body('workoutId')
    .notEmpty().withMessage('Workout ID is required')
    .isMongoId().withMessage('Invalid Workout ID format')
];

const createWorkoutValidator = [
  body('name')
    .notEmpty().withMessage('Workout name is required')
    .isString().withMessage('Name must be a string')
    .trim(),

  body('duration')
    .notEmpty().withMessage('Duration is required')
    .isInt({ min: 1 }).withMessage('Duration must be a positive number'),

  body('level')
    .notEmpty().withMessage('Level is required')
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Level must be beginner, intermediate, or advanced'),

  body('category')
    .notEmpty().withMessage('Category is required')
    .isArray().withMessage('Category must be an array of strings'),
    
  body('introduction')
    .notEmpty().withMessage('Introduction is required')
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
const deleteWorkoutValidator = [
  param('workoutId')
    .notEmpty().withMessage('Workout ID is required')
    .isMongoId().withMessage('Invalid Workout ID format')
];

const getworkByIdvalidator = [
    body('workoutId')
    .notEmpty().withMessage('Workout ID is required')
    .isMongoId().withMessage('Invalid Workout ID format')
];

const listWorkoutsValidator = [
    // page is required, integer >=1
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    
    // limit is required, integer >=1 and <=100
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

    // optional filters
    query('search')
        .optional()
        .isString().withMessage('Search must be a string'),

    query('level')
        .optional()
        .isIn(['beginner', 'intermediate', 'advanced'])
        .withMessage('Level must be beginner, intermediate, or advanced'),

    query('category')
        .optional()
        .isString().withMessage('Category must be a string'),
];



module.exports = {
    createWorkoutValidator,
    listWorkoutsValidator,
    updateworkoutvalidator,
    getworkoutByIdvalidator,
    deleteWorkoutValidator,
    getworkByIdvalidator,
    validateWorkoutImages,
    handleValidationErrors
};
