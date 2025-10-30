const {body,param,query,validationResult} = require('express-validator');
const ResponseHandler = require('../utils/ResponseHandler');
const { get } = require('mongoose');

const validateWorkoutImages = (isRequired = true) => {
  return (req, res, next) => {
    const files = req.files || {};
    const totalImages = (files.banner?.length || 0) + (files.thumbnail?.length || 0);

    if (isRequired && totalImages > 2) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 2 images allowed (banner + thumbnail)',
      });
    }

    next();
  };
};


const updateWorkoutValidator = [
  // Path parameter validation
  param('workoutId')
    .notEmpty().withMessage('Workout ID is required')
    .isMongoId().withMessage('Invalid Workout ID format'),

  // Category IDs validation (required for syncing)
  body('categoryIds')
    .optional()
    .custom((value) => {
      // Handle string, array, or JSON string
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          // If not JSON, treat as single ID
          value = [value];
        }
      }
      
      if (!Array.isArray(value)) {
        value = [value];
      }

      // Check if all values are valid MongoDB IDs
      const allValid = value.every(id => {
        if (!id) return false;
        return /^[a-f\d]{24}$/i.test(id.toString());
      });

      if (!allValid) {
        throw new Error('All category IDs must be valid MongoDB ObjectIds');
      }

      return true;
    }),

  // Workout fields validation
  body('name')
    .optional()
    .isString().withMessage('Name must be a string')
    .trim()
    .notEmpty().withMessage('Name cannot be empty'),

  body('description')
    .optional()
    .isString().withMessage('Description must be a string'),

  body('duration')
    .optional()
    .isInt({ min: 1 }).withMessage('Duration must be a positive number'),

  body('level')
    .optional()
    .isString().withMessage('Difficulty must be a string')
    .isIn(['Beginner', 'Intermediate', 'Advanced'])
    .withMessage('Difficulty must be Beginner, Intermediate, or Advanced'),

  body('caloriesBurned')
    .optional()
    .isInt({ min: 0 }).withMessage('Calories burned must be a non-negative number'),

  body('equipment')
    .optional()
    .custom((value) => {
      // Handle string or array
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          throw new Error('Equipment must be a valid JSON array');
        }
      }
      
      if (!Array.isArray(value)) {
        throw new Error('Equipment must be an array');
      }

      return true;
    })
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

  body('introduction')
    .notEmpty().withMessage('Introduction is required')
    .isString().withMessage('Introduction must be a string'),

  body('categoryIds')
    .notEmpty().withMessage('At least one category is required')
    .isArray({ min: 1 }).withMessage('CategoryIds must be an array of MongoDB IDs')
];


const getworkByIdvalidator = [
  param('workoutId')
    .notEmpty().withMessage('Workout ID is required')
    .isMongoId().withMessage('Invalid Workout ID format')
]


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
  body('workoutId')
    .notEmpty().withMessage('Workout ID is required')
    .isMongoId().withMessage('Invalid Workout ID format')
];

const getworkByIdvalidators = [
    param('workoutId')
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



const getcategoryvalidator = [
    body('categoryId')
        .notEmpty().withMessage('Category ID is required')
        .isMongoId().withMessage('Invalid Category ID format'),
];


module.exports = {
    createWorkoutValidator,
    getworkByIdvalidators,
    listWorkoutsValidator,
    updateWorkoutValidator,
    getworkoutByIdvalidator,
    deleteWorkoutValidator,
    getworkByIdvalidator,
    validateWorkoutImages,
    handleValidationErrors, 
    getcategoryvalidator
};
