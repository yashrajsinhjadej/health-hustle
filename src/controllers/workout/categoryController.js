const ResponseHandler   = require('../../utils/ResponseHandler');
const categoryModel = require('../../models/Category');

class CategoryController {

    async createCategory(req, res) {
        try {
            const { name, designId , categorySequence } = req.body;
                console.log('Creating category with name:', name);
                console.log('Description:', designId);
                console.log('Category Sequence:', categorySequence);
            // Check if category with the same name already exists
            const existingCategory = await categoryModel.findOne({ name, isActive: true });
            if (existingCategory) {
                return ResponseHandler.forbidden(res, 'Category with this name already exists');
            }

            // logic of category sequence 
            // if no category sequence is provided, set it to the next available number and if provided, shift other categories accordingly
            
            if (!categorySequence) {
                const lastCategory = await categoryModel.findOne().sort({ categorySequence: -1 });
                const nextSequence = lastCategory ? lastCategory.categorySequence + 1 : 1;
                console.log('No category sequence provided, setting to next available:', nextSequence);
            }else{
                const existingCategoryWithSequence = await categoryModel.findOne({ categorySequence: categorySequence });
                if (existingCategoryWithSequence) {
                    console.log('Category sequence conflict detected, shifting existing categories');
                    await categoryModel.updateMany(
                        { categorySequence: { $gte: categorySequence } },
                        { $inc: { categorySequence: 1 } }
                    );
                }
            }

            const newCategory = new categoryModel({
                name,
                designId,
                categorySequence: categorySequence,
                createdBy: req.user._id
            }); 

            await newCategory.save();
            return ResponseHandler.success(res, 'Category created successfully', newCategory);
        } catch (error) {
            console.error('Error creating category:', error);
            return ResponseHandler.serverError(res, 'An error occurred while creating the category');
        }
    }

async getAllCategories(req, res) {
  try {
    const categories = await categoryModel.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: 'workouts', // collection name for workouts
          localField: '_id',
          foreignField: 'categoryId',
          as: 'workouts'
        }
      },
      {
        $addFields: {
          totalWorkouts: { $size: '$workouts' }
        }
      },
      {
        // ✅ Use inclusion-only projection — no exclusions
        $project: {
          _id: 1,
          designId: 1,
          name: 1,
          description: 1,
          categorySequence: 1,
          totalWorkouts: 1,
          createdAt: 1,
          updatedAt: 1
          // ❌ removed workouts: 0 — cannot mix inclusion and exclusion
        }
      },
      { $sort: { categorySequence: 1 } }
    ]);

    console.log(`Retrieved ${categories.length} active categories`);
    return ResponseHandler.success(res, 'Categories retrieved successfully', categories);
  } catch (error) {
    console.error('Error retrieving categories:', error);
    return ResponseHandler.serverError(res, 'An error occurred while retrieving categories');
  }
}



 async updateCategory(req, res) {
  try {
    const categoryId = req.params.id;
    const { name, description, categorySequence } = req.body;

    const category = await categoryModel.findById(categoryId);
    if (!category) {
      return ResponseHandler.notFound(res, 'Category not found');
    }

    // Check if another category with the same name exists
    if (name && name !== category.name) {
      const existingCategory = await categoryModel.findOne({ name });
      if (existingCategory) {
        return ResponseHandler.forbidden(res, 'Another category with this name already exists');
      }
    }

    // ⚙️ Handle category sequence reordering
    const oldSequence = category.categorySequence;
    const newSequence = Number(categorySequence);

    if (newSequence && newSequence !== oldSequence) {
      const totalCategories = await categoryModel.countDocuments();

      // ensure sequence is within bounds
      const validNewSeq = Math.min(Math.max(newSequence, 1), totalCategories);

      if (validNewSeq < oldSequence) {
        // Example: move from 5 → 2 (shift others down)
        await categoryModel.updateMany(
          {
            categorySequence: { $gte: validNewSeq, $lt: oldSequence },
            _id: { $ne: categoryId },
          },
          { $inc: { categorySequence: 1 } }
        );
      } else {
        // Example: move from 2 → 5 (shift others up)
        await categoryModel.updateMany(
          {
            categorySequence: { $gt: oldSequence, $lte: validNewSeq },
            _id: { $ne: categoryId },
          },
          { $inc: { categorySequence: -1 } }
        );
      }

      category.categorySequence = validNewSeq;
    }

    // 📝 Update other fields
    if (name) category.name = name;
    if (description) category.description = description;
    category.updatedBy = req.user?._id;
    category.updatedAt = Date.now();

    await category.save();

    return ResponseHandler.success(res, 'Category updated successfully', category);

  } catch (error) {
    console.error('Error updating category:', error);
    return ResponseHandler.serverError(res, 'An error occurred while updating the category');
  }
}
// Delete a category (soft delete + sequence reordering)
async deleteCategory(req, res) {
  try {
    const categoryId = req.params.id;

    const category = await categoryModel.findById(categoryId);
    if (!category) {
      return ResponseHandler.notFound(res, 'Category not found');
    }

    const deletedSequence = category.categorySequence;

    // 1️⃣ Soft delete the category
    await categoryModel.updateOne(
      { _id: categoryId },
      { 
        isActive: false, 
        updatedBy: req.user._id, 
        updatedAt: Date.now() 
      }
    );

    // 2️⃣ Shift remaining active categories up by 1
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
    }   }
}
module.exports = new CategoryController();