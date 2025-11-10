const ResponseHandler = require('../../utils/ResponseHandler');
const Logger = require('../../utils/logger');
const workoutModel = require('../../models/Workout');
const workoutvideoModel = require('../../models/workoutvideo');
const WorkoutUserController = require('../../controllers/workout/workoutUserContoller');
const {clearCache} = require('../../utils/cacheUtils');


class WorkoutVideo {
  /**
   * CREATE WORKOUT VIDEO
   * Logic:
   * 1. Validate workout exists and is active
   * 2. Check for duplicate video title within the workout
   * 3. Create new video document
   * 4. Add video to workout with proper sequence
   * 5. Update workout exerciseCount and duration
   */
  async createWorkoutVideo(req, res) {
    clearCache('workout');
    const requestId = `video-create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { workoutId, sequence, ...videoData } = req.body;

      // Basic validation
      if (!workoutId) {
        Logger.warn('Video create validation failed - missing workoutId', requestId);
        return ResponseHandler.badRequest(res, 'Workout ID is required');
      }

      Logger.info('Create workout video START', requestId, { 
        workoutId, 
        sequence,
        videoTitle: videoData.title,
        userId: req.user?._id 
      });

      // 1️⃣ Fetch the workout to check videos within it
      const workout = await workoutModel.findById(workoutId).populate('videos.video');
      if (!workout) {
        Logger.warn('Video create failed - workout not found', requestId, { workoutId });
        return ResponseHandler.notFound(res, 'Workout not found');
      }
      if (!workout.isActive) {
        Logger.warn('Video create failed - workout inactive', requestId, { workoutId });
        return ResponseHandler.forbidden(res, 'Cannot add video to an inactive workout');
      }

      // 2️⃣ Check if title already exists in this specific workout
      if (videoData.title) {
        const titleExists = workout.videos.some(v => 
          v.video && 
          v.video.title && 
          v.video.title.trim().toLowerCase() === videoData.title.trim().toLowerCase()
        );

        if (titleExists) {
          Logger.warn('Video create failed - duplicate title in workout', requestId, { 
            title: videoData.title,
            workoutId 
          });
          return ResponseHandler.forbidden(res, 'A video with this title already exists in this workout');
        }
      }

      // 3️⃣ Create the new video document (duration in SECONDS)
      const newVideo = await workoutvideoModel.create(videoData);
      Logger.info('Video document created', requestId, { videoId: newVideo._id });

      // 4️⃣ Determine sequence for the video
      let videoSequence = sequence || workout.videos.length + 1;

      // If sequence is specified, shift existing videos down
      if (sequence && Number.isFinite(Number(sequence))) {
        workout.videos.forEach(v => {
          if (Number(v.sequence) >= Number(sequence)) {
            v.sequence = Number(v.sequence) + 1;
          }
        });
        videoSequence = Number(sequence);
        Logger.info('Video sequence adjusted - shifted existing videos', requestId, { 
          insertAt: videoSequence 
        });
      }

      // Add new video to workout
      workout.videos.push({ video: newVideo._id, sequence: videoSequence });

      // 5️⃣ Update exerciseCount
      workout.exerciseCount = workout.videos.length;

      // 6️⃣ Increment workout.duration (stored in MINUTES)
      // Video duration comes in SECONDS, convert to minutes
      const seconds = Number.isFinite(Number(newVideo.duration))
        ? Number(newVideo.duration)
        : Number.isFinite(Number(videoData.duration))
          ? Number(videoData.duration)
          : 0;

      const minutesToAdd = seconds > 0 ? Math.floor(seconds / 60) : 0;
      const currentMinutes = Number.isFinite(Number(workout.duration)) ? Number(workout.duration) : 0;
      workout.duration = currentMinutes + minutesToAdd;

      Logger.info('Workout metadata updated', requestId, { 
        exerciseCount: workout.exerciseCount,
        newDuration: workout.duration,
        minutesAdded: minutesToAdd
      });

      // Save workout with updated data
      await workout.save();

      Logger.info('Create workout video SUCCESS', requestId, { 
        videoId: newVideo._id,
        workoutId 
      });

      // Return the updated workout details
      await WorkoutUserController.getworkoutbyid(req, res);
    } catch (error) {
      Logger.error('Create workout video FAILED', requestId, { 
        error: error.message, 
        stack: error.stack 
      });
      return ResponseHandler.serverError(
        res, 
        'An error occurred while creating the workout video', 
        'VIDEO_CREATE_FAILED'
      );
    }
  }

  /**
   * UPDATE WORKOUT VIDEO
   * Logic:
   * 1. Validate video and workout exist
   * 2. Check for duplicate title (excluding current video)
   * 3. Update video document
   * 4. Handle sequence reordering if needed
   */
  async updateWorkoutVideo(req, res) {
    clearCache('workout');
    const requestId = `video-update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { videoId, workoutId, sequence, ...updateData } = req.body;

      // Basic validation
      if (!videoId) {
        Logger.warn('Video update validation failed - missing videoId', requestId);
        return ResponseHandler.badRequest(res, 'Video ID is required');
      }

      if (!workoutId) {
        Logger.warn('Video update validation failed - missing workoutId', requestId);
        return ResponseHandler.badRequest(res, 'Workout ID is required');
      }

      Logger.info('Update workout video START', requestId, { 
        videoId, 
        workoutId,
        updates: { ...updateData, sequence },
        userId: req.user?._id
      });

      // 1️⃣ Get the workout with populated videos to check for duplicates
      const workout = await workoutModel.findById(workoutId).populate('videos.video');
      if (!workout) {
        Logger.warn('Video update failed - workout not found', requestId, { workoutId });
        return ResponseHandler.notFound(res, 'Workout not found');
      }

      // 2️⃣ If title is being updated, check for duplicates within this workout
      if (updateData.title) {
        const titleExists = workout.videos.some(v => 
          v.video && 
          v.video._id.toString() !== videoId && // Exclude current video
          v.video.title && 
          v.video.title.trim().toLowerCase() === updateData.title.trim().toLowerCase()
        );

        if (titleExists) {
          Logger.warn('Video update failed - duplicate title', requestId, { 
            title: updateData.title,
            workoutId 
          });
          return ResponseHandler.forbidden(res, 'A video with this title already exists in this workout');
        }
      }

      // 3️⃣ Update video document fields
      const updatedVideo = await workoutvideoModel.findByIdAndUpdate(
        videoId,
        updateData,
        { new: true } // Return updated document
      );

      if (!updatedVideo) {
        Logger.warn('Video update failed - video not found', requestId, { videoId });
        return ResponseHandler.notFound(res, 'Workout video not found');
      }

      Logger.info('Video document updated', requestId, { videoId });

      // 4️⃣ Handle sequence reordering if provided
      if (sequence !== undefined) {
        const videoObj = workout.videos.find(v => v.video._id.toString() === videoId);
        if (!videoObj) {
          Logger.warn('Video update failed - video not in workout', requestId, { 
            videoId, 
            workoutId 
          });
          return ResponseHandler.notFound(res, 'Video not part of this workout');
        }

        const oldSequence = videoObj.sequence;

        // Only proceed if sequence actually changed
        if (sequence !== oldSequence) {
          // Shift other videos based on direction of move
          workout.videos.forEach(v => {
            if (sequence > oldSequence) {
              // Moving down: shift videos between old and new UP
              if (v.sequence > oldSequence && v.sequence <= sequence) {
                v.sequence -= 1;
              }
            } else {
              // Moving up: shift videos between new and old DOWN
              if (v.sequence < oldSequence && v.sequence >= sequence) {
                v.sequence += 1;
              }
            }
          });

          // Update this video's sequence
          videoObj.sequence = sequence;

          // Sort array by sequence for consistency
          workout.videos.sort((a, b) => a.sequence - b.sequence);

          await workout.save();

          Logger.info('Video sequence updated', requestId, { 
            videoId,
            oldSequence, 
            newSequence: sequence 
          });
        }
      }

      Logger.info('Update workout video SUCCESS', requestId, { videoId });
      return ResponseHandler.success(res, 'Workout video updated successfully', updatedVideo);

    } catch (error) {
      Logger.error('Update workout video FAILED', requestId, { 
        error: error.message, 
        stack: error.stack 
      });
      return ResponseHandler.serverError(
        res, 
        'An error occurred while updating the workout video', 
        'VIDEO_UPDATE_FAILED'
      );
    }
  }

  /**
   * DELETE WORKOUT VIDEO
   * Logic:
   * 1. Validate workout exists and is active
   * 2. Find and remove video from workout.videos array
   * 3. Adjust sequences of remaining videos (close the gap)
   * 4. Update workout exerciseCount and duration
   * 5. Delete video document
   */
  async deleteWorkoutVideo(req, res) {
    clearCache('workout');
    const requestId = `video-delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { videoId, workoutId } = req.body;

      // Basic validation
      if (!videoId) {
        Logger.warn('Video delete validation failed - missing videoId', requestId);
        return ResponseHandler.badRequest(res, 'Video ID is required');
      }

      if (!workoutId) {
        Logger.warn('Video delete validation failed - missing workoutId', requestId);
        return ResponseHandler.badRequest(res, 'Workout ID is required');
      }

      Logger.info('Delete workout video START', requestId, { videoId, workoutId });

      // 1️⃣ Find the workout
      const workout = await workoutModel.findById(workoutId);
      if (!workout) {
        Logger.warn('Video delete failed - workout not found', requestId, { workoutId });
        return ResponseHandler.notFound(res, 'Workout not found');
      }
      if (!workout.isActive) {
        Logger.warn('Video delete failed - workout inactive', requestId, { workoutId });
        return ResponseHandler.forbidden(res, 'Cannot delete video from an inactive workout');
      }

      // 2️⃣ Find the video entry inside the workout
      const videoObj = workout.videos.find(v => v.video.toString() === String(videoId));
      if (!videoObj) {
        Logger.warn('Video delete failed - video not in workout', requestId, { 
          videoId, 
          workoutId 
        });
        return ResponseHandler.notFound(res, 'Video not part of this workout');
      }

      const deletedSequence = Number(videoObj.sequence) || 0;

      // 3️⃣ Fetch the video document to read its duration (seconds)
      const videoDoc = await workoutvideoModel.findById(videoId).select('duration').lean();
      const seconds = Number.isFinite(Number(videoDoc?.duration)) ? Number(videoDoc.duration) : 0;
      const minutesToSubtract = seconds > 0 ? Math.floor(seconds / 60) : 0;

      Logger.info('Video details retrieved for deletion', requestId, { 
        deletedSequence,
        durationSeconds: seconds,
        minutesToSubtract 
      });

      // 4️⃣ Remove the video from workout.videos array
      workout.videos = workout.videos.filter(v => v.video.toString() !== String(videoId));

      // 5️⃣ Adjust sequence of remaining videos (close the gap)
      workout.videos.forEach(v => {
        if (Number(v.sequence) > deletedSequence) {
          v.sequence = Number(v.sequence) - 1;
        }
      });

      // 6️⃣ Update exerciseCount
      workout.exerciseCount = workout.videos.length;

      // 7️⃣ Decrement workout.duration (stored in MINUTES), clamp to >= 0
      const currentMinutes = Number.isFinite(Number(workout.duration)) ? Number(workout.duration) : 0;
      const newMinutes = Math.max(0, currentMinutes - minutesToSubtract);
      workout.duration = newMinutes;

      Logger.info('Workout metadata updated after deletion', requestId, { 
        exerciseCount: workout.exerciseCount,
        newDuration: workout.duration,
        minutesSubtracted: minutesToSubtract
      });

      // 8️⃣ Persist workout changes
      await workout.save();

      // 9️⃣ Delete the video document
      await workoutvideoModel.findByIdAndDelete(videoId);

      Logger.info('Delete workout video SUCCESS', requestId, { videoId, workoutId });

      // 🔟 Return updated workout details
      await WorkoutUserController.getworkoutbyid(req, res);
    } catch (error) {
      Logger.error('Delete workout video FAILED', requestId, { 
        error: error.message, 
        stack: error.stack 
      });
      return ResponseHandler.serverError(
        res, 
        'An error occurred while deleting the workout video', 
        'VIDEO_DELETE_FAILED'
      );
    }
  }

  
}

module.exports = new WorkoutVideo();