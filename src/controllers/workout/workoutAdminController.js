// src/controllers/workout/workoutAdminController.js

const mongoose = require('mongoose');
const ResponseHandler = require('../../utils/ResponseHandler');
const workoutModel = require('../../models/Workout');
const workoutvideoModel = require('../../models/workoutvideo');
const s3Service = require('../../services/s3service');
const categoryWorkout = require('../../models/CategoryWorkout');
const CategoryModel = require('../../models/Category');

// NOTE: helmet's contentSecurityPolicy was imported but unused; removed to avoid confusion.

class WorkoutAdminController {
  async createWorkout(req, res) {
    // Declare URLs in outer scope so catch block can access them for cleanup
    let bannerUrl = null;
    let thumbnailUrl = null;

    try {
      const workoutData = req.body;
      console.log('📦 Creating workout:', workoutData);

      // -----------------------------
      // 1 Validate files first
      // -----------------------------
      if (!req.files || !req.files.banner || !req.files.banner[0]) {
        return ResponseHandler.badRequest(res, 'Workout banner image is required');
      }
      if (!req.files.thumbnail || !req.files.thumbnail[0]) {
        return ResponseHandler.badRequest(res, 'Workout thumbnail image is required');
      }

      // -----------------------------
      // 2️⃣ Extract and validate categoryIds
      // -----------------------------
      let categoryIds = workoutData.categoryIds || [];

      // Handle different input formats for categoryIds
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

      // Remove duplicates and normalize to strings
      categoryIds = [...new Set(categoryIds.map(id => id?.toString()))].filter(Boolean);

      console.log('📂 Category IDs:', categoryIds);

      // -----------------------------
      // 3 Validate workout name (among ACTIVE workouts)
      // -----------------------------
      if (!workoutData.name || !workoutData.name.trim()) {
        return ResponseHandler.badRequest(res, 'Workout name is required');
      }

      const existingWorkout = await workoutModel.findOne({
        name: workoutData.name.trim(),
        isActive: true,
      });

      if (existingWorkout) {
        return ResponseHandler.forbidden(res, 'Workout name already exists');
      }

      // -----------------------------
      // 4️⃣ Validate categories exist and are ACTIVE
      // -----------------------------
      if (categoryIds.length > 0) {
        // Convert to ObjectIds safely
        const categoryObjectIds = categoryIds.map(id => {
          try {
            return new mongoose.Types.ObjectId(id);
          } catch {
            return null;
          }
        }).filter(Boolean);

        if (categoryObjectIds.length !== categoryIds.length) {
          return ResponseHandler.badRequest(res, 'One or more category IDs are invalid');
        }

        const validCategories = await CategoryModel.find({
          _id: { $in: categoryObjectIds },
          isActive: true,
        }).select('_id name');

        if (validCategories.length !== categoryObjectIds.length) {
          const validIds = validCategories.map(c => c._id.toString());
          const invalidIds = categoryIds.filter(id => !validIds.includes(id));
          return ResponseHandler.badRequest(
            res,
            `Invalid or inactive category IDs: ${invalidIds.join(', ')}`
          );
        }

        console.log('✅ All categories valid:', validCategories.map(c => c.name));
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

      console.log('🔢 Next workout sequence:', nextWorkoutSequence);

      // -----------------------------
      // 6 Upload images to S3
      // -----------------------------
      const uploadedKeys = []; // Track uploads for cleanup on error

      try {
        // Upload banner
        const bannerFile = req.files.banner[0];
        const bannerKey = await s3Service.uploadToS3(
          bannerFile.buffer,
          bannerFile.originalname,
          bannerFile.mimetype
        );
        uploadedKeys.push(bannerKey);
        bannerUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${bannerKey}`;
        console.log('✅ Banner uploaded:', bannerUrl);

        // Upload thumbnail
        const thumbnailFile = req.files.thumbnail[0];
        const thumbnailKey = await s3Service.uploadToS3(
          thumbnailFile.buffer,
          thumbnailFile.originalname,
          thumbnailFile.mimetype
        );
        uploadedKeys.push(thumbnailKey);
        thumbnailUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${thumbnailKey}`;
        console.log('✅ Thumbnail uploaded:', thumbnailUrl);

      } catch (uploadError) {
        console.error('❌ S3 upload failed:', uploadError);

        // Cleanup any uploaded files
        for (const key of uploadedKeys) {
          try {
            await s3Service.deleteFromS3(key);
            console.log('🗑️ Cleaned up:', key);
          } catch (cleanupErr) {
            console.error('⚠️ Cleanup failed for:', key, cleanupErr);
          }
        }

        return ResponseHandler.serverError(res, 'Failed to upload images');
      }

      // -----------------------------
      // 7️⃣ Create workout in DB
      // -----------------------------

      console.log('guierhgiurghiegheirghfinveirunverinerbiuerwbneirbneirbnefubneribueriubheowirbhfkneiorubheribndfknegy7ernbkneioruhp4oghweuirgheiuowrbnerbneirubneiohgheiuworghegiuepr gheionhvergiounhrg mopvwhy5h59nuyvhn5890wnvw4-y58bv y9hn5hw-uy59-upw3nv890y5wnvy89uw50y9uqw35m9yv-qw5n9ne59vwpy9j')

      console.log(workoutData)
      const workout = await workoutModel.create({
        name: workoutData.name.trim(),
        introduction: workoutData.introduction,
        duration: workoutData.duration,
        level: workoutData.level,
        caloriesBurned: workoutData.caloriesBurned,
        equipment: workoutData.equipment,
        bannerUrl,
        thumbnailUrl,
        sequence: nextWorkoutSequence,
        isActive: true,
        videos: [],
        createdBy: req.user?._id, // keep as-is; ensure your auth middleware sets req.user
      });

      console.log('✅ Workout created:', workout._id);

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

        // Create a map: categoryId -> maxSequence
        const sequenceMap = {};
        sequenceResults.forEach(result => {
          sequenceMap[result._id.toString()] = result.maxSequence || 0;
        });

        // Build category-workout associations
        const categoryWorkouts = categoryObjectIds.map(categoryObjectId => {
          const idStr = categoryObjectId.toString();
          const maxSeq = sequenceMap[idStr] || 0;
          const nextSeq = maxSeq + 1;

          console.log(`📊 Category ${idStr}: sequence ${nextSeq}`);

          return {
            categoryId: categoryObjectId,
            workoutId: workout._id,
            sequence: nextSeq,
            isActive: true,
            createdAt: new Date(),
          };
        });

        // 🚀 Bulk insert all at once
        await categoryWorkout.insertMany(categoryWorkouts);
        console.log(`✅ Created ${categoryWorkouts.length} category associations`);
      }

      // -----------------------------
      // 9️⃣ Return response
      // -----------------------------
      const responseData = workout.toObject();
      responseData.categories = categoryIds;

      return ResponseHandler.success(
        res,
        'Workout created successfully',
        responseData
      );

    } catch (error) {
      console.error('❌ createWorkout error:', error);

      // Cleanup S3 uploads if workout creation failed
      if (bannerUrl || thumbnailUrl) {
        console.warn('⚠️ Error occurred after S3 upload. Cleaning up...');

        if (bannerUrl) {
          try {
            const bannerKey = s3Service.getKeyFromUrl(bannerUrl);
            if (bannerKey) {
              await s3Service.deleteFromS3(bannerKey);
              console.log('🗑️ Cleaned up banner');
            }
          } catch (cleanupErr) {
            console.error('⚠️ Failed to cleanup banner:', cleanupErr);
          }
        }

        if (thumbnailUrl) {
          try {
            const thumbnailKey = s3Service.getKeyFromUrl(thumbnailUrl);
            if (thumbnailKey) {
              await s3Service.deleteFromS3(thumbnailKey);
              console.log('🗑️ Cleaned up thumbnail');
            }
          } catch (cleanupErr) {
            console.error('⚠️ Failed to cleanup thumbnail:', cleanupErr);
          }
        }
      }

      return ResponseHandler.serverError(
        res,
        'An error occurred while creating the workout'
      );
    }
  }


async deleteWorkout(req, res) {
  try {
    const workoutId = req.body.workoutId;

    // -----------------------------
    // 1️⃣ Validate and find workout
    // -----------------------------
    if (!workoutId) {
      return ResponseHandler.badRequest(res, 'Workout ID is required');
    }

    console.log('🗑️ Deleting workout:', workoutId);

    const workout = await workoutModel.findById(workoutId);
    if (!workout) {
      return ResponseHandler.notFound(res, 'Workout not found');
    }

    // Already deleted
    if (!workout.isActive) {
      return ResponseHandler.success(res, 'Workout is already deleted');
    }

    console.log('✅ Workout found:', workout.name);

    // -----------------------------
    // 2️⃣ Find all CategoryWorkout associations
    // -----------------------------
    const categoryAssociations = await categoryWorkout.find({
      workoutId,
      isActive: true
    }).lean();

    console.log(`📂 Found ${categoryAssociations.length} active category associations`);

    // -----------------------------
    // 3️⃣ Soft delete CategoryWorkout associations & reorder sequences
    // -----------------------------
    for (const association of categoryAssociations) {
      const { _id: associationId, categoryId, sequence: deletedSequence } = association;

      console.log(`🔄 Processing category ${categoryId}, sequence ${deletedSequence}`);

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

      console.log(`  ✅ Shifted ${shiftResult.modifiedCount} workouts UP in category`);
    }

    // -----------------------------
    // 4️⃣ Handle S3 Images
    // -----------------------------
    
    // OPTION A: Keep images for potential restoration (RECOMMENDED for soft delete)
    console.log('📦 Keeping S3 images for potential restoration');
    
    // OPTION B: Delete images from S3 (uncomment if you want hard delete)
    /*
    console.log('🗑️ Deleting S3 images...');
    
    if (workout.bannerUrl) {
      try {
        const bannerKey = s3Service.getKeyFromUrl(workout.bannerUrl);
        if (bannerKey) {
          await s3Service.deleteFromS3(bannerKey);
          console.log('  ✅ Deleted banner from S3:', workout.bannerUrl);
        }
      } catch (err) {
        console.warn('  ⚠️ Failed to delete banner from S3:', err.message);
      }
    }

    if (workout.thumbnailUrl) {
      try {
        const thumbnailKey = s3Service.getKeyFromUrl(workout.thumbnailUrl);
        if (thumbnailKey) {
          await s3Service.deleteFromS3(thumbnailKey);
          console.log('  ✅ Deleted thumbnail from S3:', workout.thumbnailUrl);
        }
      } catch (err) {
        console.warn('  ⚠️ Failed to delete thumbnail from S3:', err.message);
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
      console.log(`🎥 Soft deleted ${videoResult.modifiedCount} workout videos`);
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

    console.log('✅ Workout soft deleted successfully');

    return ResponseHandler.success(
      res, 
      'Workout deleted successfully'
    );

  } catch (error) {
    console.error('❌ Error deleting workout:', error);
    return ResponseHandler.serverError(
      res, 
      'An error occurred while deleting the workout'
    );
  }
}

async updateWorkout(req, res) {
  try {
    const workoutId = req.params.workoutId;
    const updateData = req.body;

    // -----------------------------
    // 1️⃣ Validate workout ID
    // -----------------------------
    if (!workoutId) {
      return ResponseHandler.badRequest(res, 'Workout ID is required');
    }

    const workout = await workoutModel.findById(workoutId);
    if (!workout) {
      return ResponseHandler.notFound(res, 'Workout not found');
    }

    // Don't allow updating inactive workouts
    if (!workout.isActive) {
      return ResponseHandler.forbidden(res, 'Cannot update an inactive workout');
    }

    console.log('📝 Updating workout:', workoutId);

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

      console.log('📂 Category IDs to sync:', categoryIds);

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
          return ResponseHandler.badRequest(res, 'One or more category IDs are invalid');
        }

        const validCategories = await CategoryModel.find({
          _id: { $in: categoryObjectIds },
          isActive: true,
        }).select('_id name');

        if (validCategories.length !== categoryObjectIds.length) {
          const validIds = validCategories.map(c => c._id.toString());
          const invalidIds = categoryIds.filter(id => !validIds.includes(id));
          return ResponseHandler.badRequest(
            res,
            `Invalid or inactive category IDs: ${invalidIds.join(', ')}`
          );
        }

        console.log('✅ All categories valid:', validCategories.map(c => c.name));
      }

      // Load current active associations
      const currentAssociations = await categoryWorkout.find({
        workoutId,
        isActive: true
      }).lean();

      const currentCategoryIds = currentAssociations.map(a => a.categoryId.toString());
      console.log('📋 Current active categories:', currentCategoryIds);

      // Determine which categories to remove, keep, and add
      const categoriesToRemove = currentCategoryIds.filter(id => !categoryIds.includes(id));
      const categoriesToKeep = currentCategoryIds.filter(id => categoryIds.includes(id));
      const categoriesToAdd = categoryIds.filter(id => !currentCategoryIds.includes(id));

      console.log('➖ Categories to remove:', categoriesToRemove);
      console.log('✔️ Categories to keep:', categoriesToKeep);
      console.log('➕ Categories to add:', categoriesToAdd);

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

            console.log(`🔴 Removed from category ${categoryId}, shifted ${shiftResult.modifiedCount} workouts UP`);
          }
        }
      }

      // KEEP: Do nothing - existing associations maintain their sequence
      console.log(`✅ Keeping ${categoriesToKeep.length} existing associations with their sequences unchanged`);

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
            console.log(`🔄 Reactivated association for NEW category ${idStr}: sequence ${nextSeq}`);
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
            console.log(`✅ Created new association for NEW category ${idStr}: sequence ${nextSeq}`);
          }

          // Update sequenceMap for next iteration (in case of multiple new categories)
          sequenceMap[idStr] = nextSeq;
        }
      }

      console.log('✅ Category membership synced - kept sequences maintain their position');
    }

    // -----------------------------
    // 3️⃣ Handle Image Uploads
    // -----------------------------
    const files = req.files || {};

    // -- Banner Image --
    if (files.banner && files.banner[0]) {
      console.log('🖼️ Uploading new banner...');
      
      const newBanner = files.banner[0];
      const newKey = await s3Service.uploadToS3(
        newBanner.buffer,
        newBanner.originalname,
        newBanner.mimetype
      );

      // Delete old banner if exists
      if (workout.bannerUrl) {
        const oldBannerKey = s3Service.getKeyFromUrl(workout.bannerUrl);
        if (oldBannerKey) {
          try {
            await s3Service.deleteFromS3(oldBannerKey);
            console.log('🗑️ Old banner deleted from S3');
          } catch (err) {
            console.warn('⚠️ Failed to delete old banner:', err.message);
          }
        }
      }

      // Update DB link
      workout.bannerUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`;
      console.log('✅ Banner updated');
    }

    // -- Thumbnail Image --
    if (files.thumbnail && files.thumbnail[0]) {
      console.log('🖼️ Uploading new thumbnail...');
      
      const newThumbnail = files.thumbnail[0];
      const newKey = await s3Service.uploadToS3(
        newThumbnail.buffer,
        newThumbnail.originalname,
        newThumbnail.mimetype
      );

      // Delete old thumbnail if exists
      if (workout.thumbnailUrl) {
        const oldThumbKey = s3Service.getKeyFromUrl(workout.thumbnailUrl);
        if (oldThumbKey) {
          try {
            await s3Service.deleteFromS3(oldThumbKey);
            console.log('🗑️ Old thumbnail deleted from S3');
          } catch (err) {
            console.warn('⚠️ Failed to delete old thumbnail:', err.message);
          }
        }
      }

      // Update DB link
      workout.thumbnailUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`;
      console.log('✅ Thumbnail updated');
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
    console.log('🔧 Updating workout fields:', updateData);
    
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

    console.log('✅ Workout updated successfully');

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

    return ResponseHandler.success(res, 'Workout updated successfully', responseData);

  } catch (error) {
    console.error('❌ Error updating workout:', error);
    
    // Handle duplicate name error
    if (error.code === 11000 && error.keyPattern && error.keyPattern.name) {
      return ResponseHandler.forbidden(res, 'Workout name already exists');
    }
    
    return ResponseHandler.serverError(
      res, 
      'An error occurred while updating the workout'
    );
  }
}

async getworkoutbyid(req, res) {
  try {
    const workoutId = req.params.workoutId;

    // 1) Validate ID
    if (!workoutId) {
      return ResponseHandler.badRequest(res, "Workout ID is required");
    }
    if (!mongoose.Types.ObjectId.isValid(workoutId)) {
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
      return ResponseHandler.notFound(res, "Workout not found");
    }

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

    return ResponseHandler.success(res, "Workout retrieved successfully", workout);
  } catch (error) {
    console.error("❌ Error retrieving workout by ID:", error);
    return ResponseHandler.serverError(res, "An error occurred while retrieving the workout");
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
  const session = await mongoose.startSession();

  try {
    const { workoutId, categoryId, workoutsequence } = req.body;

    console.log('🔄 Updating workout sequence:', req.body)
    console.log(workoutsequence)

    // Validate required fields (the original code had a logic bug)
    if (!workoutId || !categoryId || workoutsequence === undefined || workoutsequence === null) {
      return ResponseHandler.badRequest(
        res,
        "workoutId, categoryId and workoutsequence are required"
      );
    }

    // Ensure sequence is a positive integer
    const newSequence = Number(workoutsequence);
    if (!Number.isInteger(newSequence) || newSequence < 1) {
      return ResponseHandler.badRequest(res, "workoutsequence must be a positive integer");
    }

    await session.startTransaction();

    // 1) Find the existing record to get its current sequence
    const current = await categoryWorkout.findOne(
      { categoryId, workoutId },
      { sequence: 1, _id: 0 }
    ).session(session);

    if (!current) {
      await session.abortTransaction();
      return ResponseHandler.notFound(res, "Workout not found in this category");
    }

    const oldSequence = current.sequence;

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
      return ResponseHandler.serverError(res, "Invalid category sequence state");
    }

    // Clamp newSequence to valid range [1, maxSequence]
    const targetSequence = Math.max(1, Math.min(newSequence, maxSequence));

    // 2) No-op if target equals current
    if (targetSequence === oldSequence) {
      await session.commitTransaction();
      return ResponseHandler.success(res, "Workout sequence unchanged", {
        workoutId,
        categoryId,
        sequence: targetSequence
      });
    }

    // 3) Shift other items in affected range
    if (oldSequence < targetSequence) {
      // Moving down: shift items between (oldSequence+1 .. targetSequence) up by -1
      await categoryWorkout.updateMany(
        {
          categoryId,
          sequence: { $gt: oldSequence, $lte: targetSequence },
          workoutId: { $ne: workoutId }
        },
        { $inc: { sequence: -1 } },
        { session }
      );
    } else {
      // Moving up: shift items between (targetSequence .. oldSequence-1) down by +1
      await categoryWorkout.updateMany(
        {
          categoryId,
          sequence: { $gte: targetSequence, $lt: oldSequence },
          workoutId: { $ne: workoutId }
        },
        { $inc: { sequence: 1 } },
        { session }
      );
    }

    // 4) Set the workout to its target position
    await categoryWorkout.updateOne(
      { categoryId, workoutId },
      { $set: { sequence: targetSequence } },
      { session }
    );

    await session.commitTransaction();

    return ResponseHandler.success(res, "Workout sequence updated successfully", {
      workoutId,
      categoryId,
      sequence: targetSequence
    });
  } catch (error) {
    console.error("❌ Error updating workout sequence:", error);
    try {
      await session.abortTransaction();
    } catch (_) {}
    return ResponseHandler.serverError(res, "An error occurred while updating workout sequence");
  } finally {
    session.endSession();
  }
}



}

module.exports = new WorkoutAdminController();
  