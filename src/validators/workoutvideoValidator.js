const {body,param,validationResult} = require('express-validator');
const ResponseHandler = require('../utils/responseHandler');


const createWorkoutVideoValidator = [
  body('workoutId')
    .notEmpty().withMessage('Workout ID is required')
    .isMongoId().withMessage('Invalid Workout ID'),
  body('title')
    .notEmpty().withMessage('Video title is required')
    .isString().withMessage('Title must be a string')
    .trim(),

  body('description')
    .optional()
    .isString().withMessage('Description must be a string')
    .trim(),

  body('youtubeUrl')
    .notEmpty().withMessage('YouTube URL is required')
    .isURL().withMessage('YouTube URL must be a valid URL')
    .matches(/^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/)
    .withMessage('YouTube URL must be a valid YouTube link'),

  body('duration')
    .notEmpty().withMessage('Duration is required')
    .isInt({ min: 1 }).withMessage('Duration must be a positive number in seconds'),

  body('workoutId')
    .notEmpty().withMessage('Workout ID is required')
    .isMongoId().withMessage('Invalid Workout ID'),

  body('sequence')
    .optional()
    .isInt({ min: 1 }).withMessage('Sequence must be a positive integer'),
];

const updateWorkoutVideoValidator = [
  body('videoId')
    .notEmpty()
    .withMessage('Video ID is required')
    .isMongoId()
    .withMessage('Invalid Video ID'),

  body('workoutId')
    .notEmpty()
    .withMessage('Workout ID is required')
    .isMongoId()
    .withMessage('Invalid Workout ID'),

  body('title')
    .optional()
    .isString()
    .withMessage('Title must be a string'),

  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string'),

  body('youtubeUrl')
    .optional()
    .isURL()
    .withMessage('Invalid YouTube URL'),

  body('duration')
    .optional()
    .isNumeric()
    .withMessage('Duration must be a number'),

  body('sequence')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Sequence must be a positive integer'),
]

const deleteWorkoutVideoValidator = [
  body('videoId')
    .notEmpty()
    .withMessage('Video ID is required')
    .isMongoId()
    .withMessage('Invalid Video ID format'),

  body('workoutId')
    .notEmpty()
    .withMessage('Workout ID is required')
    .isMongoId()
    .withMessage('Invalid Workout ID format')
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
    createWorkoutVideoValidator,
    updateWorkoutVideoValidator,
    deleteWorkoutVideoValidator,
    handleValidationErrors
};
