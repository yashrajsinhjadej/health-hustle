const ResponseHandler = require('../../utils/ResponseHandler');
const workoutModel = require('../../models/Workout');
const { contentSecurityPolicy } = require('helmet');
const workoutvideoModel = require('../../models/workoutVideo');
const s3Service = require('../../services/s3service');
class WorkoutAdminController {


  async createWorkout(req, res) {
  try {
    const workoutData = req.body;
    workoutData.videos = [];
    workoutData.createdBy = req.user._id;

    // -----------------------------
    // Sequence handling
    // -----------------------------
    if (workoutData.sequence === undefined) {
      const lastWorkout = await workoutModel.findOne().sort({ sequence: -1 });
      workoutData.sequence = lastWorkout ? lastWorkout.sequence + 1 : 1;
    } else {
      const existingWorkout = await workoutModel.findOne({ sequence: workoutData.sequence });
      if (existingWorkout) {
        await workoutModel.updateMany(
          { sequence: { $gte: workoutData.sequence } },
          { $inc: { sequence: 1 } }
        );
      }
    }

    // -----------------------------
    // Handle S3 uploads for banner and thumbnail
    // -----------------------------
    if (!req.files || !req.files.banner || !req.files.banner[0]) {
      return ResponseHandler.badRequest(res, 'Workout banner image is required');
    }
    if (!req.files.thumbnail || !req.files.thumbnail[0]) {
      return ResponseHandler.badRequest(res, 'Workout thumbnail image is required');
    }

    // Upload banner
    const bannerFile = req.files.banner[0];
    const bannerKey = await s3Service.uploadToS3(
      bannerFile.buffer,
      bannerFile.originalname,
      bannerFile.mimetype
    );
    workoutData.bannerUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${bannerKey}`;

    // Upload thumbnail
    const thumbnailFile = req.files.thumbnail[0];
    const thumbnailKey = await s3Service.uploadToS3(
      thumbnailFile.buffer,
      thumbnailFile.originalname,
      thumbnailFile.mimetype
    );
    workoutData.thumbnailUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${thumbnailKey}`;

    // -----------------------------
    // Create workout in DB
    // -----------------------------
    const data = await workoutModel.create(workoutData);

    // Return the workout as plain object
    const responseData = data.toObject();

    return ResponseHandler.success(res, 'Workout created successfully', responseData);

  } catch (error) {
    console.error('❌ createWorkout error:', error);

    if (error.code === 11000 && error.keyPattern && error.keyPattern.name) {
      return ResponseHandler.error(res, 'Workout name already exists');
    }

    return ResponseHandler.error(res, error);
  }
}
async deleteWorkout(req, res) {
  try {
    const workoutId = req.params.workoutId;
    if (!workoutId) {
      return ResponseHandler.badRequest(res, 'Workout ID is required');
    }

    console.log("Workout ID to delete:", workoutId);

    // Find the workout
    const workout = await workoutModel.findById(workoutId);
    if (!workout) {
      return ResponseHandler.notFound(res, 'Workout not found');
    }

    console.log("Workout found:", workout);

    const deletedSequence = workout.sequence;

    // -----------------------------
    // Delete images from S3
    // -----------------------------
    if (workout.bannerUrl) {
      try {
        const bannerKey = s3Service.getKeyFromUrl(workout.bannerUrl);
        console.log(bannerKey)
        if (bannerKey) await s3Service.deleteFromS3(bannerKey);
        console.log("Deleted banner from S3:", workout.bannerUrl);
      } catch (err) {
        console.warn("Failed to delete banner from S3:", err.message);
      }
    }

    if (workout.thumbnailUrl) {
      try {
        const thumbnailKey = s3Service.getKeyFromUrl(workout.thumbnailUrl);
        console.log(thumbnailKey)
        if (thumbnailKey) await s3Service.deleteFromS3(thumbnailKey);
        console.log("Deleted thumbnail from S3:", workout.thumbnailUrl);
      } catch (err) {
        console.warn("Failed to delete thumbnail from S3:", err.message);
      }
    }

    // -----------------------------
    // Delete all workout videos linked to this workout
    // -----------------------------
    const videoIds = workout.videos.map(v => v.video); // Array of video ObjectIds
    if (videoIds.length > 0) {
      await workoutvideoModel.deleteMany({ _id: { $in: videoIds } });
      console.log(`Deleted ${videoIds.length} workout videos.`);
    }

    // -----------------------------
    // Delete the workout itself
    // -----------------------------
    await workoutModel.findByIdAndDelete(workoutId);
    console.log("Workout deleted. Now updating sequences...");

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

async  updateWorkout(req, res) {
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

    // ============================
    // 🧩 Handle sequence changes
    // ============================
    if (
      updateData.sequence !== undefined &&
      updateData.sequence !== workout.sequence
    ) {
      const newSequence = Number(updateData.sequence);
      const oldSequence = workout.sequence;

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

    // ============================
    // 🖼️ Handle Image Uploads
    // ============================
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
            console.log('🗑️ Old banner deleted from S3');
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

    // ============================
    // 📝 Update other fields
    // ============================
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