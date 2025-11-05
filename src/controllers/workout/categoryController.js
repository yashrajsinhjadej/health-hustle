const ResponseHandler = require('../../utils/ResponseHandler');
const Logger = require('../../utils/logger');
const categoryModel = require('../../models/Category');
const CategoryWorkout = require('../../models/CategoryWorkout');


class CategoryController {
  /**
   * CREATE CATEGORY
   * Logic: Find max sequence among ACTIVE categories only, then add 1
   */
  async createCategory(req, res) {
    const requestId = `category-create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { name, designId } = req.body;
  
      // Basic validation: ensure name is provided
      if (!name || typeof name !== 'string' || !name.trim()) {
        Logger.warn('Category create validation failed - missing name', requestId);
        return ResponseHandler.badRequest(res, 'Category name is required');
      }
  
      Logger.info('Create category START', requestId, { 
        name: name.trim(), 
        designId,
        userId: req.user?._id 
      });
  
      // Ensure no active category exists with the same name
      const existingCategory = await categoryModel.findOne({ 
        name: name.trim(), 
        isActive: true 
      });
      
      if (existingCategory) {
        Logger.warn('Category create failed - duplicate name', requestId, { name: name.trim() });
        return ResponseHandler.forbidden(res, 'Category with this name already exists');
      }
  
      // Find the highest sequence among ACTIVE categories only
      const lastActiveCategory = await categoryModel
        .findOne({ isActive: true }, { categorySequence: 1 })
        .sort({ categorySequence: -1 })
        .lean();
  
      const nextSequence = lastActiveCategory 
        ? (Number(lastActiveCategory.categorySequence) || 0) + 1 
        : 1;
      
      Logger.info('Computed next category sequence', requestId, { nextSequence });
  
      const newCategory = new categoryModel({
        name: name.trim(),
        designId,
        categorySequence: nextSequence,
        createdBy: req.user?._id
      });
  
      await newCategory.save();
  
      Logger.info('Create category SUCCESS', requestId, { categoryId: newCategory._id });
      return ResponseHandler.success(res, 'Category created successfully', newCategory);
    } catch (error) {
      Logger.error('Create category FAILED', requestId, { error: error.message, stack: error.stack });
      return ResponseHandler.serverError(res, 'An error occurred while creating the category', 'CATEGORY_CREATE_FAILED');
    }
  }
  
  /**
   * UPDATE CATEGORY
   * Logic: When reordering, only shift ACTIVE categories
   * Inactive categories are ignored in sequence calculations
   */
  async updateCategory(req, res) {
    const requestId = `category-update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const categoryId = req.params.id;
      const { name, designId, categorySequence } = req.body;
  
      Logger.info('Update category START', requestId, { categoryId, updates: { name, designId, categorySequence } });
  
      const category = await categoryModel.findById(categoryId);
      if (!category) {
        Logger.warn('Update category failed - not found', requestId, { categoryId });
        return ResponseHandler.notFound(res, 'Category not found');
      }

      // Don't allow updating inactive categories
      if (!category.isActive) {
        Logger.warn('Update category failed - inactive', requestId, { categoryId });
        return ResponseHandler.forbidden(res, 'Cannot update an inactive category');
      }
  
      // Check if another ACTIVE category with the same name exists
      if (name && name.trim() !== category.name) {
        const existingCategory = await categoryModel.findOne({ 
          name: name.trim(), 
          isActive: true,
          _id: { $ne: categoryId }
        });
        
        if (existingCategory) {
          Logger.warn('Update category failed - duplicate name', requestId, { name: name.trim() });
          return ResponseHandler.forbidden(res, 'Another category with this name already exists');
        }
      }
  
      // Handle category sequence reordering (only among ACTIVE categories)
      const oldSequence = category.categorySequence;
      const newSequence = Number(categorySequence);
  
      if (newSequence && !isNaN(newSequence) && newSequence !== oldSequence) {
        // Validate sequence is a positive integer
        if (newSequence < 1) {
          Logger.warn('Update category failed - invalid sequence', requestId, { newSequence });
          return ResponseHandler.badRequest(res, 'Category sequence must be at least 1');
        }

        // Count only ACTIVE categories
        const totalActiveCategories = await categoryModel.countDocuments({ isActive: true });
  
        // Ensure sequence is within bounds (clamp to valid range)
        const validNewSeq = Math.min(Math.max(newSequence, 1), totalActiveCategories);

        // Inform user if sequence was clamped
        if (validNewSeq !== newSequence) {
          Logger.info('Sequence clamped to valid range', requestId, { 
            requested: newSequence, 
            clamped: validNewSeq, 
            max: totalActiveCategories 
          });
        }
  
        if (validNewSeq < oldSequence) {
          // Moving UP (e.g., from position 5 → 2)
          // Shift categories between new and old position DOWN by 1
          await categoryModel.updateMany(
            {
              categorySequence: { $gte: validNewSeq, $lt: oldSequence },
              _id: { $ne: categoryId },
              isActive: true  // Only shift active categories
            },
            { $inc: { categorySequence: 1 } }
          );
          Logger.info('Reordered categories - moved UP', requestId, { from: oldSequence, to: validNewSeq });
        } else if (validNewSeq > oldSequence) {
          // Moving DOWN (e.g., from position 2 → 5)
          // Shift categories between old and new position UP by 1
          await categoryModel.updateMany(
            {
              categorySequence: { $gt: oldSequence, $lte: validNewSeq },
              _id: { $ne: categoryId },
              isActive: true  // Only shift active categories
            },
            { $inc: { categorySequence: -1 } }
          );
          Logger.info('Reordered categories - moved DOWN', requestId, { from: oldSequence, to: validNewSeq });
        }
  
        category.categorySequence = validNewSeq;
      }
  
      // Update other fields
      if (name) category.name = name.trim();
      if (designId !== undefined) category.designId = designId;
      
      category.updatedBy = req.user?._id;
      category.updatedAt = Date.now();
  
      await category.save();
  
      Logger.info('Update category SUCCESS', requestId, { categoryId });
      return ResponseHandler.success(res, 'Category updated successfully', category);
  
    } catch (error) {
      Logger.error('Update category FAILED', requestId, { error: error.message, stack: error.stack });
      return ResponseHandler.serverError(res, 'An error occurred while updating the category', 'CATEGORY_UPDATE_FAILED');
    }
  }

  /**
   * GET ALL CATEGORIES
   * Logic: Only fetch ACTIVE categories and sort by sequence
   */
  async getAllCategories(req, res) {
    const requestId = `category-list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      Logger.info('Get all categories START', requestId);
      
    const categories = await categoryModel.aggregate([
  { $match: { isActive: true } },
  {
    $lookup: {
      from: 'categoryworkouts',
      let: { catId: '$_id' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$categoryId', '$$catId'] },
                { $eq: ['$isActive', true] }  // ← Only count active associations
              ]
            }
          }
        }
      ],
      as: 'workouts'
    }
  },
  { $addFields: { totalWorkouts: { $size: '$workouts' } } },
  {
    $project: {
      _id: 1,
      designId: 1,
      name: 1,
      introduction: 1,
      categorySequence: 1,
      totalWorkouts: 1,
      createdAt: 1,
      updatedAt: 1
    }
  },
  { $sort: { categorySequence: 1 } }
]);
    
      Logger.info('Get all categories SUCCESS', requestId, { count: categories.length });
      return ResponseHandler.success(res, 'Categories retrieved successfully', categories);
    } catch (error) {
      Logger.error('Get all categories FAILED', requestId, { error: error.message, stack: error.stack });
      return ResponseHandler.serverError(res, 'An error occurred while retrieving categories', 'CATEGORY_GET_ALL_FAILED');
    }
  }
    
  /**
   * DELETE CATEGORY (Soft Delete)
   * Logic:
   * 1. Set category to inactive and categorySequence to null (removes from active sequence)
   * 2. Shift all ACTIVE categories with higher sequences UP by 1
   * This keeps the active sequence continuous: 1, 2, 3, 4... (no gaps)
   */
  async deleteCategory(req, res) {
    const requestId = `category-delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const categoryId = req.params.id;

      Logger.info('Delete category START', requestId, { categoryId });

      const category = await categoryModel.findById(categoryId);
      if (!category) {
        Logger.warn('Delete category failed - not found', requestId, { categoryId });
        return ResponseHandler.notFound(res, 'Category not found');
      }

      // Already deleted
      if (!category.isActive) {
        Logger.info('Category already deleted', requestId, { categoryId });
        return ResponseHandler.success(res, 'Category is already deleted');
      }

         // Guard: check for any ACTIVE workout links
    const blockingCount = await CategoryWorkout.countDocuments({
      categoryId: category._id,
      isActive: true
    });

    if (blockingCount > 0) {
      Logger.warn('Delete category blocked - has active workouts', requestId, { categoryId, workoutCount: blockingCount });
      // Optionally also return a small sample of blocking workoutIds
      return ResponseHandler.forbidden(res, 'Category cannot be deleted while it has active workouts. Delete or unlink workouts first.', { 
      });
    }



      const deletedSequence = category.categorySequence;

      // 1️⃣ Soft delete: set isActive to false and categorySequence to null
      await categoryModel.updateOne(
        { _id: categoryId },
        { 
          isActive: false,
          categorySequence: null,  // Remove from active sequence
          updatedBy: req.user?._id, 
          updatedAt: Date.now() 
        }
      );

      // 2️⃣ Shift all ACTIVE categories with higher sequences UP by 1
      // This closes the gap and keeps sequences continuous
      await categoryModel.updateMany(
        {
          categorySequence: { $gt: deletedSequence },
          isActive: true
        },
        { $inc: { categorySequence: -1 } }
      );

      Logger.info('Delete category SUCCESS', requestId, { categoryId, deletedSequence });
      return ResponseHandler.success(res, 'Category deleted successfully');
    } catch (error) {
      Logger.error('Delete category FAILED', requestId, { error: error.message, stack: error.stack });
      return ResponseHandler.serverError(res, 'An error occurred while deleting the category', 'CATEGORY_DELETE_FAILED');
    }
  }

  /**
   * GET CATEGORY BY ID
   */
  async getCategoryById(req, res) {
    const requestId = `category-getbyid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const categoryId = req.params.id;

      if (!categoryId) {
        Logger.warn('Get category by ID failed - missing ID', requestId);
        return ResponseHandler.badRequest(res, 'Category ID is required');
      }

      Logger.info('Get category by ID START', requestId, { categoryId });

      const category = await categoryModel.findById(categoryId);
      if (!category) {
        Logger.warn('Get category by ID failed - not found', requestId, { categoryId });
        return ResponseHandler.notFound(res, 'Category not found');
      }

      Logger.info('Get category by ID SUCCESS', requestId, { categoryId });
      return ResponseHandler.success(res, 'Category fetched successfully', category);
    } catch (error) {
      Logger.error('Get category by ID FAILED', requestId, { error: error.message, stack: error.stack });
      return ResponseHandler.serverError(res, 'An error occurred while fetching the category', 'CATEGORY_GET_BY_ID_FAILED');
    }
  }


}


module.exports = new CategoryController();