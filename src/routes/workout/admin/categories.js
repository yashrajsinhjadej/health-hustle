const express = require('express');
const {adminOnly, authenticateToken } = require('../../../middleware/auth');
const router = express.Router();
const { createCategoryValidator, updateCategoryValidator, deleteCategoryValidator , handleValidationErrors } = require('../../../validators/categoryValidators');
const rateLimiters = require('../../../middleware/redisrateLimiter').rateLimiters;


const CategoryController    = require('../../../controllers/workout/categoryController');

router.use(authenticateToken);
router.use(adminOnly);
router.use(rateLimiters.admin()); // Apply Redis rate limiter for admin routes

// create category

router.post('/create',createCategoryValidator, handleValidationErrors, CategoryController.createCategory);


//update category   
router.post('/update/:id', updateCategoryValidator, handleValidationErrors, CategoryController.updateCategory);

//delete category
router.post('/delete/:id', deleteCategoryValidator, handleValidationErrors, CategoryController.deleteCategory);


// get all categories
router.get('/list', CategoryController.getAllCategories);
// router.get('/list/:id')


// get category by id
router.get('/list/:id', CategoryController.getCategoryById);


module.exports = router;