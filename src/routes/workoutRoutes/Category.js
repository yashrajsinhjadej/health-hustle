const express = require('express');
const {adminOnly, authenticateToken } = require('../../middleware/auth');
const router = express.Router();
const { createCategoryValidator, updateCategoryValidator, deleteCategoryValidator , handleValidationErrors } = require('../../validators/categoryValidators');



const CategoryController    = require('../../controllers/workout/categoryController');

router.use(authenticateToken);
router.use(adminOnly);




router.post('/create',createCategoryValidator, handleValidationErrors, CategoryController.createCategory);

router.post('/update/:id', updateCategoryValidator, handleValidationErrors, CategoryController.updateCategory);
router.post('/delete/:id', deleteCategoryValidator, handleValidationErrors, CategoryController.deleteCategory);



router.get('/list', CategoryController.getAllCategories);





module.exports = router;