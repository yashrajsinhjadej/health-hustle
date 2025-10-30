const ResponseHandler = require('../../utils/ResponseHandler');
const categoryModel = require('../../models/Category');
const CategoryWorkout = require('../../models/CategoryWorkout');


class CategoryController {
  /**
   * CREATE CATEGORY
   * Logic: Find max sequence among ACTIVE categories only, then add 1
   */
  async createCategory(req, res) {
    try {
      const { name, designId } = req.body;
  
      // Basic validation: ensure name is provided
      if (!name || typeof name !== 'string' || !name.trim()) {
        return ResponseHandler.badRequest(res, 'Category name is required');
      }
  
      console.log('Creating category with name:', name);
      console.log('Design ID:', designId);
  
      // Ensure no active category exists with the same name
      const existingCategory = await categoryModel.findOne({ 
        name: name.trim(), 
        isActive: true 
      });
      
      if (existingCategory) {
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
      
      console.log('Computed next category sequence:', nextSequence);
  
      const newCategory = new categoryModel({
        name: name.trim(),
        designId,
        categorySequence: nextSequence,
        createdBy: req.user?._id
      });
  
      await newCategory.save();
  
      return ResponseHandler.success(res, 'Category created successfully', newCategory);
    } catch (error) {
      console.error('Error creating category:', error);
      return ResponseHandler.serverError(res, 'An error occurred while creating the category');
    }
  }
  
  /**
   * UPDATE CATEGORY
   * Logic: When reordering, only shift ACTIVE categories
   * Inactive categories are ignored in sequence calculations
   */
  async updateCategory(req, res) {
    try {
      const categoryId = req.params.id;
      const { name, designId, categorySequence } = req.body;
  
      const category = await categoryModel.findById(categoryId);
      if (!category) {
        return ResponseHandler.notFound(res, 'Category not found');
      }

      // Don't allow updating inactive categories
      if (!category.isActive) {
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
          return ResponseHandler.forbidden(res, 'Another category with this name already exists');
        }
      }
  
      // Handle category sequence reordering (only among ACTIVE categories)
      const oldSequence = category.categorySequence;
      const newSequence = Number(categorySequence);
  
      if (newSequence && !isNaN(newSequence) && newSequence !== oldSequence) {
        // Validate sequence is a positive integer
        if (newSequence < 1) {
          return ResponseHandler.badRequest(res, 'Category sequence must be at least 1');
        }

        // Count only ACTIVE categories
        const totalActiveCategories = await categoryModel.countDocuments({ isActive: true });
  
        // Ensure sequence is within bounds (clamp to valid range)
        const validNewSeq = Math.min(Math.max(newSequence, 1), totalActiveCategories);

        // Inform user if sequence was clamped
        if (validNewSeq !== newSequence) {
          console.log(`Sequence ${newSequence} was clamped to ${validNewSeq} (max: ${totalActiveCategories})`);
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
        }
  
        category.categorySequence = validNewSeq;
      }
  
      // Update other fields
      if (name) category.name = name.trim();
      if (designId !== undefined) category.designId = designId;
      
      category.updatedBy = req.user?._id;
      category.updatedAt = Date.now();
  
      await category.save();
  
      return ResponseHandler.success(res, 'Category updated successfully', category);
  
    } catch (error) {
      console.error('Error updating category:', error);
      return ResponseHandler.serverError(res, 'An error occurred while updating the category');
    }
  }

  /**
   * GET ALL CATEGORIES
   * Logic: Only fetch ACTIVE categories and sort by sequence
   */
  async getAllCategories(req, res) {
    try {
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
    
      return ResponseHandler.success(res, 'Categories retrieved successfully', categories);
    } catch (error) {
      console.error('Error retrieving categories:', error);
      return ResponseHandler.serverError(res, 'An error occurred while retrieving categories');
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
    try {
      const categoryId = req.params.id;

      const category = await categoryModel.findById(categoryId);
      if (!category) {
        return ResponseHandler.notFound(res, 'Category not found');
      }

      // Already deleted
      if (!category.isActive) {
        return ResponseHandler.success(res, 'Category is already deleted');
      }

         // Guard: check for any ACTIVE workout links
    const blockingCount = await CategoryWorkout.countDocuments({
      categoryId: category._id,
      isActive: true
    });

    if (blockingCount > 0) {
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

      return ResponseHandler.success(res, 'Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      return ResponseHandler.serverError(res, 'An error occurred while deleting the category');
    }
  }

  /**
   * GET CATEGORY BY ID
   */
  async getCategoryById(req, res) {
    try {
      const categoryId = req.params.id;

      if (!categoryId) {
        return ResponseHandler.badRequest(res, 'Category ID is required');
      }

      const category = await categoryModel.findById(categoryId);
      if (!category) {
        return ResponseHandler.notFound(res, 'Category not found');
      }

      return ResponseHandler.success(res, 'Category fetched successfully', category);
    } catch (error) {
      console.error('Error fetching category by ID:', error);
      return ResponseHandler.serverError(res, 'An error occurred while fetching the category');
    }
  }


}

module.exports = new CategoryController();