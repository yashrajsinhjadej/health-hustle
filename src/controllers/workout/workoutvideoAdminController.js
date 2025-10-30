const ResponseHandler = require('../../utils/ResponseHandler');
const workoutModel = require('../../models/Workout');
const { contentSecurityPolicy } = require('helmet');
const workoutvideoModel = require('../../models/workoutvideo');
const WorkoutUserController = require('../../controllers/workout/workoutUserContoller');
class workoutvideo {


async createWorkoutVideo(req, res) {
  try {
    const { workoutId, sequence, ...videoData } = req.body;

    if (!workoutId) {
      return ResponseHandler.badRequest(res, 'Workout ID is required');
    }

    // 1️⃣ First, get the workout to check videos within it
    const workout = await workoutModel.findById(workoutId).populate('videos.video');
    if (!workout) {
      return ResponseHandler.notFound(res, 'Workout not found');
    }
    if (!workout.isActive) {
      return ResponseHandler.forbidden(res, 'Cannot add video to an inactive workout');
    }

    // 2️⃣ Check if title already exists IN THIS SPECIFIC WORKOUT
    const titleExists = workout.videos.some(v => 
      v.video && 
      v.video.title && 
      v.video.title.trim().toLowerCase() === videoData.title.trim().toLowerCase()
    );

    if (titleExists) {
      return ResponseHandler.forbidden(res, 'A video with this title already exists in this workout');
    }

    // 3️⃣ Create the new video (duration comes from user input, in SECONDS)
    const newVideo = await workoutvideoModel.create(videoData);

    // 4️⃣ Determine sequence
    let videoSequence = sequence || workout.videos.length + 1;

    // If sequence is specified, shift existing videos
    if (sequence && Number.isFinite(Number(sequence))) {
      workout.videos.forEach(v => {
        if (Number(v.sequence) >= Number(sequence)) {
          v.sequence = Number(v.sequence) + 1;
        }
      });
      videoSequence = Number(sequence);
    }

    // Push new video with sequence
    workout.videos.push({ video: newVideo._id, sequence: videoSequence });

    // 5️⃣ Update exerciseCount
    workout.exerciseCount = workout.videos.length;

    // 6️⃣ Increment workout.duration (stored in MINUTES) by floor(newVideo.duration / 60)
    const seconds = Number.isFinite(Number(newVideo.duration))
      ? Number(newVideo.duration)
      : Number.isFinite(Number(videoData.duration))
        ? Number(videoData.duration)
        : 0;

    const minutesToAdd = seconds > 0 ? Math.floor(seconds / 60) : 0;
    const currentMinutes = Number.isFinite(Number(workout.duration)) ? Number(workout.duration) : 0;
    workout.duration = currentMinutes + minutesToAdd;

    // Save workout
    await workout.save();

    // Return the updated workout
    await WorkoutUserController.getworkoutbyid(req, res);
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error creating workout video:`, error);
    return ResponseHandler.error(res, {
      message: 'Error creating workout video',
      error: error.message,
    });
  }
}
async updateWorkoutVideo(req, res) {
  try {
    const { videoId, workoutId, sequence, ...updateData } = req.body;

    if (!videoId) {
      return ResponseHandler.badRequest(res, 'Video ID is required');
    }

    if (!workoutId) {
      return ResponseHandler.badRequest(res, 'Workout ID is required');
    }

    // 1️⃣ Get the workout with populated videos to check for duplicates
    const workout = await workoutModel.findById(workoutId).populate('videos.video');
    if (!workout) {
      return ResponseHandler.notFound(res, 'Workout not found');
    }

    // 2️⃣ If title is being updated, check for duplicates within this workout
    if (updateData.title) {
      const titleExists = workout.videos.some(v => 
        v.video && 
        v.video._id.toString() !== videoId && // Exclude the current video being updated
        v.video.title && 
        v.video.title.trim().toLowerCase() === updateData.title.trim().toLowerCase()
      );

      if (titleExists) {
        return ResponseHandler.forbidden(res, 'A video with this title already exists in this workout');
      }
    }

    // 3️⃣ Update video fields
    const updatedVideo = await workoutvideoModel.findByIdAndUpdate(
      videoId,
      updateData,
      { new: true } // return the updated document
    );

    if (!updatedVideo) {
      return ResponseHandler.notFound(res, 'Workout video not found');
    }

    // 4️⃣ If sequence is provided, update the workout
    if (sequence !== undefined) {
      const videoObj = workout.videos.find(v => v.video._id.toString() === videoId);
      if (!videoObj) {
        return ResponseHandler.notFound(res, 'Video not part of this workout');
      }

      const oldSequence = videoObj.sequence;

      // Only proceed if sequence changed
      if (sequence !== oldSequence) {
        workout.videos.forEach(v => {
          if (sequence > oldSequence) {
            // Moving down
            if (v.sequence > oldSequence && v.sequence <= sequence) {
              v.sequence -= 1;
            }
          } else {
            // Moving up
            if (v.sequence < oldSequence && v.sequence >= sequence) {
              v.sequence += 1;
            }
          }
        });

        // Update this video's sequence
        videoObj.sequence = sequence;

        // Optional: sort array by sequence
        workout.videos.sort((a, b) => a.sequence - b.sequence);

        await workout.save();
      }
    }

    return ResponseHandler.success(res, 'Workout video updated successfully', updatedVideo);

  } catch (error) {
    console.error(`❌ [${req.requestId}] Error updating workout video:`, error);
    return ResponseHandler.error(res, {
      message: 'Error updating workout video',
      error: error.message,
    });
  }
}

async deleteWorkoutVideo(req, res) {
  try {
    const { videoId, workoutId } = req.body;

    // 1 Find the workout
    const workout = await workoutModel.findById(workoutId);
    if (!workout) {
      return ResponseHandler.notFound(res, 'Workout not found');
    }
    if (!workout.isActive) {
      return ResponseHandler.forbidden(res, 'Cannot delete video from an inactive workout');
    }

    // 2️⃣ Find the video entry inside the workout
    const videoObj = workout.videos.find(v => v.video.toString() === String(videoId));
    if (!videoObj) {
      return ResponseHandler.notFound(res, 'Video not part of this workout');
    }

    const deletedSequence = Number(videoObj.sequence) || 0;

    // 3️⃣ Fetch the video document to read its duration (seconds)
    const videoDoc = await workoutvideoModel.findById(videoId).select('duration').lean();
    const seconds = Number.isFinite(Number(videoDoc?.duration)) ? Number(videoDoc.duration) : 0;
    const minutesToSubtract = seconds > 0 ? Math.floor(seconds / 60) : 0;

    // 4️⃣ Remove the video from workout.videos
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

    // 8️⃣ Persist workout changes
    await workout.save();

    // 9️⃣ Delete the video document
    await workoutvideoModel.findByIdAndDelete(videoId);

    // 🔟 Return updated workout
    await WorkoutUserController.getworkoutbyid(req, res);
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error deleting workout video:`, error);
    return ResponseHandler.error(res, {
      message: 'Error deleting workout video',
      error: error.message,
    });
  }
}
}

module.exports = new workoutvideo();