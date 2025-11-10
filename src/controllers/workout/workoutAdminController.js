// src/controllers/workout/workoutAdminController.js

const mongoose = require('mongoose');
const ResponseHandler = require('../../utils/ResponseHandler');
const Logger = require('../../utils/logger');
const workoutModel = require('../../models/Workout');
const workoutvideoModel = require('../../models/workoutvideo');
const s3Service = require('../../services/s3Service');
const categoryWorkout = require('../../models/CategoryWorkout');
const CategoryModel = require('../../models/Category');
const {clearCache} = require('../../utils/cacheUtils');

// NOTE: helmet's contentSecurityPolicy was imported but unused; removed to avoid confusion.

class WorkoutAdminController {
// controllers/workoutController.js (createWorkout)
async  createWorkout(req, res) {
  clearCache('homepage');
  clearCache('workout');
  const requestId = `workout-create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let bannerKey = null;
  let thumbnailKey = null;
  let bannerUrl = null;
  let thumbnailUrl = null;

  try {
    const workoutData = req.body;
    Logger.info('Create workout START', requestId, { 
      name: workoutData.name, 
      categoryIds: workoutData.categoryIds,
      userId: req.user?._id 
    });

    // -----------------------------
    // 1 Validate files first
    // -----------------------------
    if (!req.files || !req.files.banner || !req.files.banner[0]) {
      Logger.warn('Create workout failed - missing banner', requestId);
      return ResponseHandler.badRequest(res, 'Workout banner image is required');
    }
    if (!req.files.thumbnail || !req.files.thumbnail[0]) {
      Logger.warn('Create workout failed - missing thumbnail', requestId);
      return ResponseHandler.badRequest(res, 'Workout thumbnail image is required');
    }

    // -----------------------------
    // 2️⃣ Extract and validate categoryIds
    // -----------------------------
    let categoryIds = workoutData.categoryIds || [];

    if (typeof categoryIds === 'string') {
      try {
        categoryIds = JSON.parse(categoryIds);
      } catch {
        categoryIds = [categoryIds];
      }
    }
    if (!Array.isArray(categoryIds)) {
      categoryIds = [categoryIds];
    }

    categoryIds = [...new Set(categoryIds.map(id => id?.toString()))].filter(Boolean);
    Logger.info('Category IDs parsed', requestId, { categoryIds });

    // -----------------------------
    // 3 Validate workout name (among ACTIVE workouts)
    // -----------------------------
    if (!workoutData.name || !workoutData.name.trim()) {
      Logger.warn('Create workout failed - missing name', requestId);
      return ResponseHandler.badRequest(res, 'Workout name is required');
    }

    const existingWorkout = await workoutModel.findOne({
      name: workoutData.name.trim(),
      isActive: true,
    });

    if (existingWorkout) {
      Logger.warn('Create workout failed - duplicate name', requestId, { name: workoutData.name });
      return ResponseHandler.forbidden(res, 'Workout name already exists');
    }

    // -----------------------------
    // 4️⃣ Validate categories exist and are ACTIVE
    // -----------------------------
    if (categoryIds.length > 0) {
      const categoryObjectIds = categoryIds.map(id => {
        try {
          return new mongoose.Types.ObjectId(id);
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (categoryObjectIds.length !== categoryIds.length) {
        Logger.warn('Create workout failed - invalid category IDs', requestId);
        return ResponseHandler.badRequest(res, 'One or more category IDs are invalid');
      }

      const validCategories = await CategoryModel.find({
        _id: { $in: categoryObjectIds },
        isActive: true,
      }).select('_id name');

      if (validCategories.length !== categoryObjectIds.length) {
        const validIds = validCategories.map(c => c._id.toString());
        const invalidIds = categoryIds.filter(id => !validIds.includes(id));
        Logger.warn('Create workout failed - inactive categories', requestId, { invalidIds });
        return ResponseHandler.badRequest(
          res,
          `Invalid or inactive category IDs: ${invalidIds.join(', ')}`
        );
      }

      Logger.info('All categories validated', requestId, { categories: validCategories.map(c => c.name) });
    }

    // -----------------------------
    // 5️⃣ Calculate next workout sequence (among ACTIVE workouts)
    // -----------------------------
    const lastWorkout = await workoutModel
      .findOne({ isActive: true }, { sequence: 1 })
      .sort({ sequence: -1 })
      .lean();

    const nextWorkoutSequence = lastWorkout
      ? (Number(lastWorkout.sequence) || 0) + 1
      : 1;

    Logger.info('Next workout sequence calculated', requestId, { sequence: nextWorkoutSequence });

    // -----------------------------
    // 6 Upload images to S3 (using new s3Service API)
    // -----------------------------
    const uploadedKeys = []; // Track uploads for cleanup on error

    try {
      // Upload banner
      const bannerFile = req.files.banner[0];
      const bannerResult = await s3Service.uploadToS3(
        bannerFile.buffer,
        bannerFile.originalname,
        bannerFile.mimetype,
        {
          keyPrefix: 'workouts/banners/',
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: 'inline',
          // acl: 'public-read', // only if objects are intended to be public
        }
      );
      bannerKey = bannerResult.key;
      bannerUrl = bannerResult.url;
      uploadedKeys.push(bannerKey);
      Logger.info('Banner uploaded to S3', requestId, { key: bannerKey });

      // Upload thumbnail
      const thumbnailFile = req.files.thumbnail[0];
      const thumbnailResult = await s3Service.uploadToS3(
        thumbnailFile.buffer,
        thumbnailFile.originalname,
        thumbnailFile.mimetype,
        {
          keyPrefix: 'workouts/thumbnails/',
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: 'inline',
          // acl: 'public-read',
        }
      );
      thumbnailKey = thumbnailResult.key;
      thumbnailUrl = thumbnailResult.url;
      uploadedKeys.push(thumbnailKey);
      Logger.info('Thumbnail uploaded to S3', requestId, { key: thumbnailKey });

      // If your bucket is private and url is null, derive on demand via presigned URLs or use getS3PublicUrl
      if (!bannerUrl) {
        bannerUrl = s3Service.getS3PublicUrl(bannerKey);
      }
      if (!thumbnailUrl) {
        thumbnailUrl = s3Service.getS3PublicUrl(thumbnailKey);
      }
    } catch (uploadError) {
      Logger.error('S3 upload failed', requestId, { error: uploadError.message });

      // Cleanup any uploaded files
      for (const key of uploadedKeys) {
        try {
          await s3Service.deleteFromS3(key);
          Logger.info('Cleaned up S3 object', requestId, { key });
        } catch (cleanupErr) {
          Logger.error('S3 cleanup failed', requestId, { key, error: cleanupErr.message });
        }
      }

      return ResponseHandler.serverError(res, 'Failed to upload images', 'WORKOUT_IMAGE_UPLOAD_FAILED');
    }

    // -----------------------------
    // 7️⃣ Create workout in DB
    // -----------------------------
    const workout = await workoutModel.create({
      name: workoutData.name.trim(),
      introduction: workoutData.introduction,
      duration: workoutData.duration,
      level: workoutData.level,
      caloriesBurned: workoutData.caloriesBurned,
      equipment: workoutData.equipment,
      bannerUrl,
      thumbnailUrl,
      bannerKey,      // optional: store keys for exact references and cleanup later
      thumbnailKey,   // optional: store keys for exact references and cleanup later
      sequence: nextWorkoutSequence,
      isActive: true,
      videos: [],
      createdBy: req.user?._id,
    });

    Logger.info('Workout created in DB', requestId, { workoutId: workout._id });

    // -----------------------------
    // 8️⃣ Create CategoryWorkout associations (OPTIMIZED)
    // -----------------------------
    if (categoryIds.length > 0) {
      const categoryObjectIds = categoryIds.map(id => new mongoose.Types.ObjectId(id));

      const sequenceResults = await categoryWorkout.aggregate([
        {
          $match: {
            categoryId: { $in: categoryObjectIds },
            isActive: true,
          },
        },
        {
          $group: {
            _id: '$categoryId',
            maxSequence: { $max: '$sequence' },
          },
        },
      ]);

      const sequenceMap = {};
      sequenceResults.forEach(result => {
        sequenceMap[result._id.toString()] = result.maxSequence || 0;
      });

      const categoryWorkouts = categoryObjectIds.map(categoryObjectId => {
        const idStr = categoryObjectId.toString();
        const maxSeq = sequenceMap[idStr] || 0;
        const nextSeq = maxSeq + 1;

        return {
          categoryId: categoryObjectId,
          workoutId: workout._id,
          sequence: nextSeq,
          isActive: true,
          createdAt: new Date(),
        };
      });

      await categoryWorkout.insertMany(categoryWorkouts);
      Logger.info('Category associations created', requestId, { count: categoryWorkouts.length });
    }

    // -----------------------------
    // 9️⃣ Return response
    // -----------------------------
    const responseData = workout.toObject();
    responseData.categories = categoryIds;

    Logger.info('Create workout SUCCESS', requestId, { workoutId: workout._id });
    return ResponseHandler.success(
      res,
      'Workout created successfully',
      responseData
    );

  } catch (error) {
    Logger.error('Create workout FAILED', requestId, { error: error.message, stack: error.stack });

    // Cleanup S3 uploads if workout creation failed
    const keysToCleanup = [bannerKey, thumbnailKey].filter(Boolean);
    if (keysToCleanup.length > 0) {
      Logger.warn('Cleaning up S3 uploads after error', requestId, { keys: keysToCleanup });
      for (const key of keysToCleanup) {
        try {
          await s3Service.deleteFromS3(key);
          Logger.info('S3 cleanup successful', requestId, { key });
        } catch (cleanupErr) {
          Logger.error('S3 cleanup failed', requestId, { key, error: cleanupErr.message });
        }
      }
    }

    return ResponseHandler.serverError(
      res,
      'An error occurred while creating the workout',
      'WORKOUT_CREATE_FAILED'
    );
  }
}


async deleteWorkout(req, res) {
  clearCache('homepage');
  clearCache('workout');
  const requestId = `workout-delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const workoutId = req.body.workoutId;

    // -----------------------------
    // 1️⃣ Validate and find workout
    // -----------------------------
    if (!workoutId) {
      Logger.warn('Delete workout failed - missing ID', requestId);
      return ResponseHandler.badRequest(res, 'Workout ID is required');
    }

    Logger.info('Delete workout START', requestId, { workoutId });

    const workout = await workoutModel.findById(workoutId);
    if (!workout) {
      Logger.warn('Delete workout failed - not found', requestId, { workoutId });
      return ResponseHandler.notFound(res, 'Workout not found');
    }

    // Already deleted
    if (!workout.isActive) {
      Logger.info('Workout already deleted', requestId, { workoutId });
      return ResponseHandler.success(res, 'Workout is already deleted');
    }

    Logger.info('Workout found', requestId, { workoutId, name: workout.name });

    // -----------------------------
    // 2️⃣ Find all CategoryWorkout associations
    // -----------------------------
    const categoryAssociations = await categoryWorkout.find({
      workoutId,
      isActive: true
    }).lean();

    Logger.info('Category associations found', requestId, { count: categoryAssociations.length });

    // -----------------------------
    // 3️⃣ Soft delete CategoryWorkout associations & reorder sequences
    // -----------------------------
    for (const association of categoryAssociations) {
      const { _id: associationId, categoryId, sequence: deletedSequence } = association;

      Logger.info('Processing category association', requestId, { categoryId, sequence: deletedSequence });

      // Soft delete this association
      await categoryWorkout.updateOne(
        { _id: associationId },
        { 
          isActive: false,
          sequence: null, // Remove from active sequence
          updatedAt: Date.now()
        }
      );

      // Shift remaining ACTIVE workouts in this category UP by 1
      const shiftResult = await categoryWorkout.updateMany(
        {
          categoryId,
          sequence: { $gt: deletedSequence },
          isActive: true
        },
        { 
          $inc: { sequence: -1 }
        }
      );

      Logger.info('Shifted workouts in category', requestId, { 
        categoryId, 
        shiftedCount: shiftResult.modifiedCount 
      });
    }

    // -----------------------------
    // 4️⃣ Handle S3 Images
    // -----------------------------
    
    // OPTION A: Keep images for potential restoration (RECOMMENDED for soft delete)
    Logger.info('Keeping S3 images for potential restoration', requestId);
    
    // OPTION B: Delete images from S3 (uncomment if you want hard delete)
    /*
    Logger.info('Deleting S3 images', requestId);
    
    // Use stored keys for reliable deletion
    if (workout.bannerKey) {
      try {
        await s3Service.deleteFromS3(workout.bannerKey);
        Logger.info('Banner deleted from S3', requestId, { key: workout.bannerKey });
      } catch (err) {
        Logger.warn('Failed to delete banner from S3', requestId, { key: workout.bannerKey, error: err.message });
      }
    }

    if (workout.thumbnailKey) {
      try {
        await s3Service.deleteFromS3(workout.thumbnailKey);
        Logger.info('Thumbnail deleted from S3', requestId, { key: workout.thumbnailKey });
      } catch (err) {
        Logger.warn('Failed to delete thumbnail from S3', requestId, { key: workout.thumbnailKey, error: err.message });
      }
    }
    */

    // -----------------------------
    // 5️⃣ Soft delete workout videos
    // -----------------------------
    const videoIds = workout.videos.map(v => v.video).filter(Boolean);
    if (videoIds.length > 0) {
      const videoResult = await workoutvideoModel.updateMany(
        { _id: { $in: videoIds } },
        { 
          isActive: false,
          updatedAt: Date.now()
        }
      );
      Logger.info('Workout videos soft deleted', requestId, { count: videoResult.modifiedCount });
    }

    // -----------------------------
    // 6️⃣ Soft delete the workout itself
    // -----------------------------
    await workoutModel.updateOne(
      { _id: workoutId },
      { 
        isActive: false,
        sequence: null, // Remove from global sequence (if used)
        updatedBy: req.user?._id,
        updatedAt: Date.now()
      }
    );

    Logger.info('Delete workout SUCCESS', requestId, { workoutId });

    return ResponseHandler.success(
      res, 
      'Workout deleted successfully'
    );

  } catch (error) {
    Logger.error('Delete workout FAILED', requestId, { error: error.message, stack: error.stack });
    return ResponseHandler.serverError(
      res, 
      'An error occurred while deleting the workout',
      'WORKOUT_DELETE_FAILED'
    );
  }
}

async updateWorkout(req, res) {
  clearCache('homepage');
  clearCache('workout');
  const requestId = `workout-update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const workoutId = req.params.workoutId;
    const updateData = req.body;

    // -----------------------------
    // 1️⃣ Validate workout ID
    // -----------------------------
    if (!workoutId) {
      Logger.warn('Update workout failed - missing ID', requestId);
      return ResponseHandler.badRequest(res, 'Workout ID is required');
    }

    const workout = await workoutModel.findById(workoutId);
    if (!workout) {
      Logger.warn('Update workout failed - not found', requestId, { workoutId });
      return ResponseHandler.notFound(res, 'Workout not found');
    }

    // Don't allow updating inactive workouts
    if (!workout.isActive) {
      Logger.warn('Update workout failed - inactive', requestId, { workoutId });
      return ResponseHandler.forbidden(res, 'Cannot update an inactive workout');
    }

    Logger.info('Update workout START', requestId, { workoutId, name: workout.name });

    // -----------------------------
    // 2️⃣ Handle Category Membership Sync
    // -----------------------------
    if (updateData.categoryIds !== undefined) {
      let categoryIds = updateData.categoryIds || [];

      // Handle different input formats for categoryIds
      if (typeof categoryIds === 'string') {
        try {
          categoryIds = JSON.parse(categoryIds);
        } catch {
          categoryIds = categoryIds ? [categoryIds] : [];
        }
      }
      if (!Array.isArray(categoryIds)) {
        categoryIds = [categoryIds];
      }

      // Remove duplicates and normalize to strings
      categoryIds = [...new Set(categoryIds.map(id => id?.toString()))].filter(Boolean);

      Logger.info('Category IDs to sync', requestId, { categoryIds });

      // Validate all categories exist and are ACTIVE
      if (categoryIds.length > 0) {
        const categoryObjectIds = categoryIds.map(id => {
          try {
            return new mongoose.Types.ObjectId(id);
          } catch {
            return null;
          }
        }).filter(Boolean);

        if (categoryObjectIds.length !== categoryIds.length) {
          Logger.warn('Update workout failed - invalid category IDs', requestId);
          return ResponseHandler.badRequest(res, 'One or more category IDs are invalid');
        }

        const validCategories = await CategoryModel.find({
          _id: { $in: categoryObjectIds },
          isActive: true,
        }).select('_id name');

        if (validCategories.length !== categoryObjectIds.length) {
          const validIds = validCategories.map(c => c._id.toString());
          const invalidIds = categoryIds.filter(id => !validIds.includes(id));
          Logger.warn('Update workout failed - inactive categories', requestId, { invalidIds });
          return ResponseHandler.badRequest(
            res,
            `Invalid or inactive category IDs: ${invalidIds.join(', ')}`
          );
        }

        Logger.info('All categories validated', requestId, { categories: validCategories.map(c => c.name) });
      }

      // Load current active associations
      const currentAssociations = await categoryWorkout.find({
        workoutId,
        isActive: true
      }).lean();

      const currentCategoryIds = currentAssociations.map(a => a.categoryId.toString());
      Logger.info('Current active categories', requestId, { currentCategoryIds });

      // Determine which categories to remove, keep, and add
      const categoriesToRemove = currentCategoryIds.filter(id => !categoryIds.includes(id));
      const categoriesToKeep = currentCategoryIds.filter(id => categoryIds.includes(id));
      const categoriesToAdd = categoryIds.filter(id => !currentCategoryIds.includes(id));

      Logger.info('Category sync plan', requestId, { 
        toRemove: categoriesToRemove, 
        toKeep: categoriesToKeep, 
        toAdd: categoriesToAdd 
      });

      // REMOVE: Deactivate associations and reorder sequences
      if (categoriesToRemove.length > 0) {
        for (const categoryId of categoriesToRemove) {
          const categoryObjectId = new mongoose.Types.ObjectId(categoryId);
          
          // Find the association to remove
          const associationToRemove = await categoryWorkout.findOne({
            workoutId,
            categoryId: categoryObjectId,
            isActive: true
          });

          if (associationToRemove) {
            const deletedSequence = associationToRemove.sequence;

            // Soft delete this association
            await categoryWorkout.updateOne(
              { _id: associationToRemove._id },
              {
                isActive: false,
                sequence: null,
                updatedAt: Date.now()
              }
            );

            // Shift remaining ACTIVE workouts in this category UP by 1
            const shiftResult = await categoryWorkout.updateMany(
              {
                categoryId: categoryObjectId,
                sequence: { $gt: deletedSequence },
                isActive: true
              },
              {
                $inc: { sequence: -1 }
              }
            );

            Logger.info('Removed from category and shifted workouts', requestId, { 
              categoryId, 
              shiftedCount: shiftResult.modifiedCount 
            });
          }
        }
      }

      // KEEP: Do nothing - existing associations maintain their sequence
      Logger.info('Keeping existing associations unchanged', requestId, { count: categoriesToKeep.length });

      // ADD: Process ONLY new categories - add them to the end of EACH NEW category
      if (categoriesToAdd.length > 0) {
        const categoryObjectIds = categoriesToAdd.map(id => new mongoose.Types.ObjectId(id));

        // Get max sequence for ONLY the NEW categories in one query
        const sequenceResults = await categoryWorkout.aggregate([
          {
            $match: {
              categoryId: { $in: categoryObjectIds },
              isActive: true,
            },
          },
          {
            $group: {
              _id: '$categoryId',
              maxSequence: { $max: '$sequence' },
            },
          },
        ]);

        // Create a map: categoryId -> maxSequence
        const sequenceMap = {};
        sequenceResults.forEach(result => {
          sequenceMap[result._id.toString()] = result.maxSequence || 0;
        });

        // Process each NEW category ONLY
        for (const categoryId of categoriesToAdd) {
          const categoryObjectId = new mongoose.Types.ObjectId(categoryId);
          const idStr = categoryObjectId.toString();
          
          // Calculate next sequence for THIS NEW category (max + 1)
          const maxSeq = sequenceMap[idStr] || 0;
          const nextSeq = maxSeq + 1;

          // Check if association already exists (might be inactive from previous removal)
          const existingAssociation = await categoryWorkout.findOne({
            categoryId: categoryObjectId,
            workoutId
          });

          if (existingAssociation) {
            // Reactivate and move to end of THIS category
            existingAssociation.isActive = true;
            existingAssociation.sequence = nextSeq;
            existingAssociation.updatedAt = Date.now();
            await existingAssociation.save();
            Logger.info('Reactivated category association', requestId, { categoryId: idStr, sequence: nextSeq });
          } else {
            // Create new association at the end of THIS category
            await categoryWorkout.create({
              categoryId: categoryObjectId,
              workoutId,
              sequence: nextSeq,
              isActive: true,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
            Logger.info('Created new category association', requestId, { categoryId: idStr, sequence: nextSeq });
          }

          // Update sequenceMap for next iteration (in case of multiple new categories)
          sequenceMap[idStr] = nextSeq;
        }
      }

      Logger.info('Category membership synced successfully', requestId);
    }

    // -----------------------------
    // 3️⃣ Handle Image Uploads
    // -----------------------------
    const files = req.files || {};

    // -- Banner Image --
    if (files.banner && files.banner[0]) {
      Logger.info('Uploading new banner', requestId);
      
      const newBanner = files.banner[0];
      const bannerResult = await s3Service.uploadToS3(
        newBanner.buffer,
        newBanner.originalname,
        newBanner.mimetype,
        {
          keyPrefix: 'workouts/banners/',
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: 'inline',
        }
      );

      // Delete old banner if exists (use stored key for reliability)
      if (workout.bannerKey) {
        try {
          await s3Service.deleteFromS3(workout.bannerKey);
          Logger.info('Old banner deleted from S3', requestId, { key: workout.bannerKey });
        } catch (err) {
          Logger.warn('Failed to delete old banner from S3', requestId, { key: workout.bannerKey, error: err.message });
        }
      }

      // Update DB with new URL and key
      workout.bannerUrl = bannerResult.url || s3Service.getS3PublicUrl(bannerResult.key);
      workout.bannerKey = bannerResult.key;
      Logger.info('Banner updated successfully', requestId);
    }

    // -- Thumbnail Image --
    if (files.thumbnail && files.thumbnail[0]) {
      Logger.info('Uploading new thumbnail', requestId);
      
      const newThumbnail = files.thumbnail[0];
      const thumbnailResult = await s3Service.uploadToS3(
        newThumbnail.buffer,
        newThumbnail.originalname,
        newThumbnail.mimetype,
        {
          keyPrefix: 'workouts/thumbnails/',
          cacheControl: 'public, max-age=31536000, immutable',
          contentDisposition: 'inline',
        }
      );

      // Delete old thumbnail if exists (use stored key for reliability)
      if (workout.thumbnailKey) {
        try {
          await s3Service.deleteFromS3(workout.thumbnailKey);
          Logger.info('Old thumbnail deleted from S3', requestId, { key: workout.thumbnailKey });
        } catch (err) {
          Logger.warn('Failed to delete old thumbnail from S3', requestId, { key: workout.thumbnailKey, error: err.message });
        }
      }

      // Update DB with new URL and key
      workout.thumbnailUrl = thumbnailResult.url || s3Service.getS3PublicUrl(thumbnailResult.key);
      workout.thumbnailKey = thumbnailResult.key;
      Logger.info('Thumbnail updated successfully', requestId);
    }

    // -----------------------------
    // 4️⃣ Update other workout fields
    // -----------------------------
    // Remove fields that shouldn't be mass-assigned
    const fieldsToExclude = [
      'categoryIds',
      '_id', 
      'createdAt', 
      'createdBy',
      'isActive'
    ];
    
    fieldsToExclude.forEach(field => delete updateData[field]);
    Logger.info('Updating workout fields', requestId, { fields: Object.keys(updateData) });
    
    // Update allowed fields
    if (updateData.name) workout.name = updateData.name.trim();
    if (updateData.introduction !== undefined) workout.introduction = updateData.introduction;
    if (updateData.duration !== undefined) workout.duration = updateData.duration;
    if (updateData.level !== undefined) workout.level = updateData.level;
    if (updateData.caloriesBurned !== undefined) workout.caloriesBurned = updateData.caloriesBurned;
    if (updateData.equipment !== undefined) workout.equipment = updateData.equipment;

    workout.updatedBy = req.user?._id;
    workout.updatedAt = Date.now();

    await workout.save();

    Logger.info('Workout saved successfully', requestId);

    // -----------------------------
    // 5️⃣ Get updated category associations for response
    // -----------------------------
    const updatedAssociations = await categoryWorkout.find({
      workoutId,
      isActive: true
    }).select('categoryId').lean();

    const activeCategoryIds = updatedAssociations.map(a => a.categoryId.toString());

    const responseData = workout.toObject();
    responseData.categories = activeCategoryIds;

    Logger.info('Update workout SUCCESS', requestId, { workoutId });
    return ResponseHandler.success(res, 'Workout updated successfully', responseData);

  } catch (error) {
    Logger.error('Update workout FAILED', requestId, { error: error.message, stack: error.stack });
    
    // Handle duplicate name error
    if (error.code === 11000 && error.keyPattern && error.keyPattern.name) {
      return ResponseHandler.forbidden(res, 'Workout name already exists');
    }
    
    return ResponseHandler.serverError(
      res, 
      'An error occurred while updating the workout',
      'WORKOUT_UPDATE_FAILED'
    );
  }
}

async getworkoutbyid(req, res) {
  const requestId = `workout-get_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const workoutId = req.params.workoutId;
    Logger.info('Get workout by ID START', requestId, { workoutId });

    // 1) Validate ID
    if (!workoutId) {
      Logger.warn('Workout ID missing', requestId);
      return ResponseHandler.badRequest(res, "Workout ID is required");
    }
    if (!mongoose.Types.ObjectId.isValid(workoutId)) {
      Logger.warn('Invalid workout ID format', requestId, { workoutId });
      return ResponseHandler.badRequest(res, "Invalid Workout ID");
    }

    // 2) Fetch workout and populate videos
    const workout = await workoutModel
      .findById(workoutId)
      .populate({
        path: "videos.video",
        select: "_id title description youtubeUrl duration",
        model: workoutvideoModel,
      })
      .lean();

    if (!workout) {
      Logger.warn('Workout not found', requestId, { workoutId });
      return ResponseHandler.notFound(res, "Workout not found");
    }

    Logger.info('Workout found, processing data', requestId, { videoCount: workout.videos?.length || 0 });

    // 3) Sort videos by sequence and drop entries with missing populated docs
    const sortedVideos = Array.isArray(workout.videos)
      ? workout.videos
          .filter((v) => v && v.video) // ensure populated doc exists
          .sort((a, b) => {
            const sa = Number.isFinite(a.sequence) ? a.sequence : 0;
            const sb = Number.isFinite(b.sequence) ? b.sequence : 0;
            return sa - sb;
          })
      : [];

    workout.videos = sortedVideos;

    // 4) Attach active categories for this workout
    const categoryLinks = await categoryWorkout
      .find({ workoutId: workout._id, isActive: true })
      .select("categoryId")
      .lean();

    const categoryIds = categoryLinks
      .map((link) => link.categoryId)
      .filter((id) => !!id);

    const categories =
      categoryIds.length > 0
        ? await CategoryModel.find({
            _id: { $in: categoryIds },
            isActive: true,
          })
            .select("_id name")
            .lean()
        : [];

    workout.category = categories;
    Logger.info('Categories attached', requestId, { categoryCount: categories.length });

    // 5) Attach all active categories (sorted by categorySequence)
    const allCategoriesRaw = await CategoryModel.find({ isActive: true })
      .select("_id name categorySequence")
      .sort({ categorySequence: 1 })
      .lean();

    // Strip categorySequence from response if not needed client-side
    workout.allCategories = allCategoriesRaw.map(({ _id, name }) => ({ _id, name }));

    // 6) Flatten videos for frontend convenience
    workout.videos = workout.videos.map((item) => ({
      _id: item.video._id,
      title: item.video.title,
      description: item.video.description,
      youtubeUrl: item.video.youtubeUrl,
      duration: item.video.duration,
      sequence: item.sequence,
    }));

    Logger.info('Get workout by ID SUCCESS', requestId);
    return ResponseHandler.success(res, "Workout retrieved successfully", workout);
  } catch (error) {
    Logger.error('Get workout by ID FAILED', requestId, { error: error.message, stack: error.stack });
    return ResponseHandler.serverError(
      res, 
      "An error occurred while retrieving the workout",
      'WORKOUT_GET_BY_ID_FAILED'
    );
  }
}

// controllers/workoutController.js

// import mongoose from "mongoose";
// import { ResponseHandler } from "../utils/responseHandler.js";
// import categoryWorkout from "../models/categoryWorkout.js";

/**
 * Updates the sequence/order of a workout within a category.
 * This function moves a single workout to a target position and shifts other workouts accordingly
 * so that sequences remain contiguous without collisions.
 *
 * Security/robustness notes:
 * - Uses a transaction to ensure atomic updates.
 * - Validates inputs and ensures integers for sequence.
 * - Handles no-op (same sequence) quickly.
 * - Uses index hints in comments; ensure you create indexes in your model.
 */
async  updateWorkoutSequence(req, res) {
  clearCache('homepage');
  clearCache('workout');
  const requestId = `workout-reorder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const session = await mongoose.startSession();

  try {
    const { workoutId, categoryId, workoutsequence } = req.body;
    Logger.info('Update workout sequence START', requestId, { workoutId, categoryId, workoutsequence });

    // Validate required fields (the original code had a logic bug)
    if (!workoutId || !categoryId || workoutsequence === undefined || workoutsequence === null) {
      Logger.warn('Missing required fields for sequence update', requestId, { workoutId, categoryId, workoutsequence });
      return ResponseHandler.badRequest(
        res,
        "workoutId, categoryId and workoutsequence are required"
      );
    }

    // Ensure sequence is a positive integer
    const newSequence = Number(workoutsequence);
    if (!Number.isInteger(newSequence) || newSequence < 1) {
      Logger.warn('Invalid sequence value', requestId, { workoutsequence, parsed: newSequence });
      return ResponseHandler.badRequest(res, "workoutsequence must be a positive integer");
    }

    await session.startTransaction();
    Logger.info('Transaction started', requestId);

    // 1) Find the existing record to get its current sequence
    const current = await categoryWorkout.findOne(
      { categoryId, workoutId },
      { sequence: 1, _id: 0 }
    ).session(session);

    if (!current) {
      await session.abortTransaction();
      Logger.warn('Workout not found in category', requestId, { workoutId, categoryId });
      return ResponseHandler.notFound(res, "Workout not found in this category");
    }

    const oldSequence = current.sequence;
    Logger.info('Current sequence found', requestId, { oldSequence, newSequence });

    // Optional: find max sequence in the category to clamp newSequence
    const maxDoc = await categoryWorkout
      .find({ categoryId }, { sequence: 1 })
      .sort({ sequence: -1 })
      .limit(1)
      .session(session);
    const maxSequence = maxDoc.length ? maxDoc[0].sequence : 0;

    if (maxSequence === 0) {
      // Should not happen because we found 'current', but guard anyway
      await session.abortTransaction();
      Logger.error('Invalid category sequence state', requestId, { maxSequence });
      return ResponseHandler.serverError(res, "Invalid category sequence state");
    }

    // Clamp newSequence to valid range [1, maxSequence]
    const targetSequence = Math.max(1, Math.min(newSequence, maxSequence));
    Logger.info('Target sequence calculated', requestId, { requested: newSequence, clamped: targetSequence, max: maxSequence });

    // 2) No-op if target equals current
    if (targetSequence === oldSequence) {
      await session.commitTransaction();
      Logger.info('Sequence unchanged (no-op)', requestId, { sequence: targetSequence });
      return ResponseHandler.success(res, "Workout sequence unchanged", {
        workoutId,
        categoryId,
        sequence: targetSequence
      });
    }

    // 3) Shift other items in affected range
    if (oldSequence < targetSequence) {
      // Moving down: shift items between (oldSequence+1 .. targetSequence) up by -1
      const result = await categoryWorkout.updateMany(
        {
          categoryId,
          sequence: { $gt: oldSequence, $lte: targetSequence },
          workoutId: { $ne: workoutId }
        },
        { $inc: { sequence: -1 } },
        { session }
      );
      Logger.info('Shifted workouts UP (moving down)', requestId, { range: `${oldSequence + 1}-${targetSequence}`, affected: result.modifiedCount });
    } else {
      // Moving up: shift items between (targetSequence .. oldSequence-1) down by +1
      const result = await categoryWorkout.updateMany(
        {
          categoryId,
          sequence: { $gte: targetSequence, $lt: oldSequence },
          workoutId: { $ne: workoutId }
        },
        { $inc: { sequence: 1 } },
        { session }
      );
      Logger.info('Shifted workouts DOWN (moving up)', requestId, { range: `${targetSequence}-${oldSequence - 1}`, affected: result.modifiedCount });
    }

    // 4) Set the workout to its target position
    await categoryWorkout.updateOne(
      { categoryId, workoutId },
      { $set: { sequence: targetSequence } },
      { session }
    );

    await session.commitTransaction();
    Logger.info('Update workout sequence SUCCESS', requestId, { oldSequence, newSequence: targetSequence });

    return ResponseHandler.success(res, "Workout sequence updated successfully", {
      workoutId,
      categoryId,
      sequence: targetSequence
    });
  } catch (error) {
    Logger.error('Update workout sequence FAILED', requestId, { error: error.message, stack: error.stack });
    try {
      await session.abortTransaction();
      Logger.info('Transaction aborted', requestId);
    } catch (_) {}
    return ResponseHandler.serverError(
      res, 
      "An error occurred while updating workout sequence",
      'WORKOUT_SEQUENCE_UPDATE_FAILED'
    );
  } finally {
    session.endSession();
  }
}



}

module.exports = new WorkoutAdminController();
  