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
      const workout = await workoutModel.create({
        name: workoutData.name.trim(),
        description: workoutData.description,
        duration: workoutData.duration,
        difficulty: workoutData.difficulty,
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
      const workoutId = req.params.workoutId;
      if (!workoutId) {
        return ResponseHandler.badRequest(res, 'Workout ID is required');
      }

      console.log('Workout ID to delete:', workoutId);

      const workout = await workoutModel.findById(workoutId);
      if (!workout) {
        return ResponseHandler.notFound(res, 'Workout not found');
      }

      console.log('Workout found:', workout);

      const deletedSequence = workout.sequence;

      // Delete images from S3
      if (workout.bannerUrl) {
        try {
          const bannerKey = s3Service.getKeyFromUrl(workout.bannerUrl);
          if (bannerKey) await s3Service.deleteFromS3(bannerKey);
          console.log('Deleted banner from S3:', workout.bannerUrl);
        } catch (err) {
          console.warn('Failed to delete banner from S3:', err.message);
        }
      }

      if (workout.thumbnailUrl) {
        try {
          const thumbnailKey = s3Service.getKeyFromUrl(workout.thumbnailUrl);
          if (thumbnailKey) await s3Service.deleteFromS3(thumbnailKey);
          console.log('Deleted thumbnail from S3:', workout.thumbnailUrl);
        } catch (err) {
          console.warn('Failed to delete thumbnail from S3:', err.message);
        }
      }

      // Delete all workout videos linked to this workout
      const videoIds = workout.videos.map(v => v.video).filter(Boolean);
      if (videoIds.length > 0) {
        await workoutvideoModel.deleteMany({ _id: { $in: videoIds } });
        console.log(`Deleted ${videoIds.length} workout videos.`);
      }

      // Delete the workout itself
      await workoutModel.findByIdAndDelete(workoutId);
      console.log('Workout deleted. Now updating sequences...');

      // Decrement sequence of remaining workouts
      await workoutModel.updateMany(
        { sequence: { $gt: deletedSequence } },
        { $inc: { sequence: -1 } }
      );

      return ResponseHandler.success(res, 'Workout and its resources deleted successfully');
    } catch (error) {
      console.error(error);
      return ResponseHandler.error(res, error);
    }
  }

  async updateWorkout(req, res) {
    try {
      const workoutId = req.params.workoutId;
      const updateData = req.body;

      if (!workoutId) {
        return ResponseHandler.badRequest(res, 'Workout ID is required');
      }

      const workout = await workoutModel.findById(workoutId);
      if (!workout) {
        return ResponseHandler.notFound(res, 'Workout not found');
      }

      // 🧩 Handle sequence changes
      if (
        updateData.sequence !== undefined &&
        updateData.sequence !== workout.sequence
      ) {
        const newSequence = Number(updateData.sequence);
        const oldSequence = workout.sequence;

        if (Number.isNaN(newSequence) || newSequence <= 0) {
          return ResponseHandler.badRequest(res, 'sequence must be a positive number');
        }

        if (newSequence > oldSequence) {
          await workoutModel.updateMany(
            { sequence: { $gt: oldSequence, $lte: newSequence } },
            { $inc: { sequence: -1 } }
          );
        } else {
          await workoutModel.updateMany(
            { sequence: { $gte: newSequence, $lt: oldSequence } },
            { $inc: { sequence: 1 } }
          );
        }

        workout.sequence = newSequence;
      }

      // 🖼️ Handle Image Uploads
      const files = req.files || {};

      // -- Banner Image
      if (files.banner && files.banner[0]) {
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
              console.log('🗑 Old banner deleted from S3');
            } catch (err) {
              console.warn('⚠️ Failed to delete old banner:', err.message);
            }
          }
        }

        // Update DB link
        workout.bannerUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newKey}`;
      }

      // -- Thumbnail Image
      if (files.thumbnail && files.thumbnail[0]) {
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
      }

      // 📝 Update other fields
      Object.assign(workout, updateData);

      await workout.save();

      return ResponseHandler.success(res, 'Workout updated successfully', workout);
    } catch (error) {
      console.error('❌ Error updating workout:', error);
      if (error.code === 11000 && error.keyPattern && error.keyPattern.name) {
        return ResponseHandler.error(res, 'Workout name already exists');
      }
      return ResponseHandler.error(res, error);
    }
  }
}

module.exports = new WorkoutAdminController();
