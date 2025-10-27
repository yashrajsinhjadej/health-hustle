const ResponseHandler   = require('../../utils/ResponseHandler');
const categoryModel = require('../../models/Category');

class CategoryController {

    // Create a new category
    async createCategory(req, res) {
        try {
            const { name, designId } = req.body;
                console.log('Creating category with name:', name);
                console.log('Description:', designId);

            // Check if category with the same name already exists
            const existingCategory = await categoryModel.findOne({ name });
            if (existingCategory) {
                return ResponseHandler.conflict(res, 'Category with this name already exists');
            }

            const newCategory = new categoryModel({
                name,
                designId,
                createdBy: req.user._id
            }); 

            await newCategory.save();
            return ResponseHandler.success(res, 'Category created successfully', newCategory);
        } catch (error) {
            console.error('Error creating category:', error);
            return ResponseHandler.serverError(res, 'An error occurred while creating the category');
        }
    }

    // Get all categories
    async getAllCategories(req, res) {
        try {
            const categories = await categoryModel.find();
            return ResponseHandler.success(res, 'Categories retrieved successfully', categories);
        } catch (error) {
            console.error('Error retrieving categories:', error);
            return ResponseHandler.serverError(res, 'An error occurred while retrieving categories');
        }
    }


    
    // Update a category
    async updateCategory(req, res) {
        try {
            const categoryId = req.params.id;
            const { name, description } = req.body;

            const category = await categoryModel.findById(categoryId);
            if (!category) {
                return ResponseHandler.notFound(res, 'Category not found');
            }

            // Check if another category with the same name exists
            if (name && name !== category.name) {
                const existingCategory = await categoryModel.findOne({ name });
                if (existingCategory) {
                    return ResponseHandler.conflict(res, 'Another category with this name already exists');
                }
            }

            category.name = name || category.name;
            category.description = description || category.description;
            category.updatedBy = req.user._id;
            category.updatedAt = Date.now();

            await category.save();
            return ResponseHandler.success(res, 'Category updated successfully', category);
        } catch (error) {
            console.error('Error updating category:', error);
            return ResponseHandler.serverError(res, 'An error occurred while updating the category');
        }
    }

    // Delete a category
    async deleteCategory(req, res) {
        try {
            const categoryId = req.params.id;

            const category = await categoryModel.findById(categoryId);
            if (!category) {
                return ResponseHandler.notFound(res, 'Category not found');
            }

            // await category.remove();
            await categoryModel.updateOne({ _id: categoryId }, { isActive: false, updatedBy: req.user._id, updatedAt: Date.now() });
            return ResponseHandler.success(res, 'Category deleted successfully');
        } catch (error) {
            console.error('Error deleting category:', error);
            return ResponseHandler.serverError(res, 'An error occurred while deleting the category');
        }
    }
}

module.exports = new CategoryController();