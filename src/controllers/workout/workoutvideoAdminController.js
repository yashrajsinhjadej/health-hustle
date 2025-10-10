const ResponseHandler = require('../../utils/responseHandler');
const workoutModel = require('../../models/Workout');
const { contentSecurityPolicy } = require('helmet');
const workoutvideoModel = require('../../models/WorkoutVideo');
class workoutvideo 
{
  async createWorkoutVideo(req, res) {
    try {
        const { workoutId, sequence, ...videoData } = req.body;

        if (!workoutId) {
            return ResponseHandler.badRequest(res, 'Workout ID is required');
        }
        // 1️⃣ Create the new video
        const newVideo = await workoutvideoModel.create(videoData);
        // 2️⃣ Add video to workout
        const workout = await workoutModel.findById(workoutId);
        if (!workout) {
            return ResponseHandler.notFound(res, 'Workout not found');
        }
        // Determine sequence
        let videoSequence = sequence || workout.videos.length + 1;
        // If sequence is specified, shift existing videos
        if (sequence) {
            workout.videos.forEach(v => {
                if (v.sequence >= sequence) v.sequence += 1;
            });
        }
        // Push new video with sequence
        workout.videos.push({ video: newVideo._id, sequence: videoSequence });
        // 3️⃣ Update exerciseCount
        workout.exerciseCount = workout.videos.length;
        // Save workout
        await workout.save();
        return ResponseHandler.success(res, 'Workout video created successfully', newVideo);
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

    // 1️⃣ Update video fields
    const updatedVideo = await workoutvideoModel.findByIdAndUpdate(
      videoId,
      updateData,
      { new: true } // return the updated document
    );

    if (!updatedVideo) {
      return ResponseHandler.notFound(res, 'Workout video not found');
    }

    // 2️⃣ If sequence is provided, update the workout
    if (sequence !== undefined) {
      const workout = await workoutModel.findById(workoutId);
      if (!workout) {
        return ResponseHandler.notFound(res, 'Workout not found');
      }

      const videoObj = workout.videos.find(v => v.video.toString() === videoId);
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

      // 1️⃣ Find the workout
      const workout = await workoutModel.findById(workoutId);
      if (!workout) {
        return ResponseHandler.notFound(res, 'Workout not found');
      }

      // 2️⃣ Find the video in the workout
      const videoObj = workout.videos.find(v => v.video.toString() === videoId);
      if (!videoObj) {
        return ResponseHandler.notFound(res, 'Video not part of this workout');
      }

      const deletedSequence = videoObj.sequence;

      // 3️⃣ Remove the video from workout.videos
      workout.videos = workout.videos.filter(v => v.video.toString() !== videoId);

      // 4️⃣ Adjust sequence of remaining videos
      workout.videos.forEach(v => {
        if (v.sequence > deletedSequence) {
          v.sequence -= 1;
        }
      });

      // 5️⃣ Save the workout
      await workout.save();

      // 6️⃣ Delete the video document
      await workoutvideoModel.findByIdAndDelete(videoId);

      return ResponseHandler.success(res, 'Workout video deleted successfully');
    } catch (error) {
      console.error(`❌ [${req.requestId}] Error deleting workout video:`, error);
      return ResponseHandler.error(res, {
        message: 'Error deleting workout video',
        error: error.message,
      });
    }
  }

}

module.exports = new workoutvideo();2