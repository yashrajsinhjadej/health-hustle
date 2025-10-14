const ResponseHandler = require('../../utils/ResponseHandler');
const workoutModel = require('../../models/Workout')
const WorkoutVideoModel = require('../../models/workoutvideo');

// Define the minimal set of fields to return for a list view
const WORKOUT_PROJECTION = {
    _id: 1,
    name: 1,
    thumbnailUrl: 1,
    level: 1,
    duration: 1,
    category: 1,
    exerciseCount: 1,
    sequence: 1,
};

class WorkoutUserController {

  // controllers/workoutController.js


async getcategory(req, res) {
    try {
      const { category } = req.body;
      const workouts = await workoutModel.find({ category: category });
      return ResponseHandler.success(res, 'Workouts fetched successfully', workouts);
    } catch (error) {
      return ResponseHandler.error(res, error);
    }
  }



async homepage(req, res) {
    try {
      // Set your home screen cap here (use 10–12). You can tweak to 10 if needed.
      const LIMIT = 10;
  
      const pipeline = [
        // Optional: filter flags if you have them
        // { $match: { isActive: true, isPublished: true } },
  
        // Ensure category is an array for consistent unwinding
        {
          $addFields: {
            category: {
              $cond: [
                { $isArray: "$category" },
                "$category",
                { $cond: [{ $ifNull: ["$category", false] }, ["$category"], []] }
              ]
            }
          }
        },
  
        // Unwind so each category value is processed separately
        { $unwind: "$category" },
  
        // Normalize category values (trim + lowercase)
        {
          $addFields: {
            category: {
              $toLower: {
                $trim: { input: "$category" }
              }
            }
          }
        },
  
        // Sort first so we keep the latest items in each category
        { $sort: { createdAt: -1, _id: -1 } },
  
        // Group workouts by individual category value
        {
          $group: {
            _id: "$category",
            data: {
              $push: {
                name: { $ifNull: ["$name", "Untitled Workout"] },
                thumbnail: { $ifNull: ["$thumbnailUrl", null] }
              }
            }
          }
        },
  
        // Slice to LIMIT items per category for the home screen
        {
          $project: {
            _id: 0,
            category: "$_id",
            data: { $slice: ["$data", LIMIT] }
          }
        },
  
        // Sort categories alphabetically (optional)
        { $sort: { category: 1 } }
      ];
  
      const result = await workoutModel.aggregate(pipeline);
  
      return ResponseHandler.success(
        res,
        "Workout categories fetched successfully",
        result
      );
    } catch (error) {
      return ResponseHandler.error(res, error);
    }
  }
  
  
      
    /**
     * Lists workouts with optional search and filtering.
     * GET /workouts?search=fullbody&level=beginner
     */async listworkout(req, res) {
        try {
            // 1. Filter and Search Parameters
            const searchTerm = req.query.search;
            const levelFilter = req.query.level;
            const categoryFilter = req.query.category;

            let filter = {};
            if (searchTerm) filter.$text = { $search: searchTerm };
            if (levelFilter) filter.level = levelFilter;
            if (categoryFilter) filter.category = categoryFilter;

            // 2. Pagination
            const page = parseInt(req.query.page) || 1; // required, validated via express-validator
            const limit = parseInt(req.query.limit) || 25; // optional, default 25
            const skip = (page - 1) * limit;

            // 3. Query
            let query = workoutModel.find(filter);

            if (searchTerm) {
                query = query
                    .select({ ...WORKOUT_PROJECTION, score: { $meta: "textScore" } })
                    .sort({ score: { $meta: "textScore" }, sequence: 1 });
            } else {
                query = query.select(WORKOUT_PROJECTION).sort({ sequence: 1 });
            }

            query = query.skip(skip).limit(limit);

            const workouts = await query.exec();

            // 4. Pagination metadata
            const totalDocuments = await workoutModel.countDocuments(filter);
            const totalPages = Math.ceil(totalDocuments / limit);
            console.log('totalPages', workouts.length);
            // 5. Response
            return ResponseHandler.success(res, 'Workouts fetched successfully', {
                workouts,
                pagination: {
                    totalDocuments,
                    totalPages,
                    currentPage: page,
                    pageSize: limit
                }
            });
        } catch (error) {
            console.error('List Workouts API Error:', error);
            return ResponseHandler.error(res, error);
        }
    }

    async getworkoutbyid(req, res) {
        try {
            const { workoutId } = req.body;
            if (!workoutId) {
                return ResponseHandler.badRequest(res, 'Workout ID is required');
            }

            // Fetch workout and populate videos
            const workout = await workoutModel
                .findById(workoutId)
                .populate({
                    path: 'videos.video',
                    model: 'WorkoutVideo',
                    select: 'title description youtubeUrl duration'
                })
                .lean(); // Convert Mongoose doc to plain JS object

            if (!workout) {
                return ResponseHandler.notFound(res, 'Workout not found');
            }

            // Map videos with sequence from workout.videos array
            const videosWithSequence = workout.videos
                .map(v => {
                    if (!v.video) return null; // skip if video was deleted
                    return {
                        _id: v.video._id,
                        title: v.video.title,
                        description: v.video.description,
                        youtubeUrl: v.video.youtubeUrl,
                        duration: v.video.duration,
                        sequence: v.sequence
                    };
                })
                .filter(v => v !== null) // remove nulls
                .sort((a, b) => a.sequence - b.sequence); // sort by sequence

            // Replace videos array with sorted videos
            workout.videos = videosWithSequence;
            return ResponseHandler.success(res, 'Workout fetched successfully', workout);
        } catch (error) {
            return ResponseHandler.error(res, error);
        }
    }
}


module.exports = new WorkoutUserController();
