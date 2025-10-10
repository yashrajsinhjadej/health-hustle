const ResponseHandler = require('../../utils/responseHandler');
const workoutModel = require('../../models/Workout')
const WorkoutVideoModel = require('../../models/WorkoutVideo');

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
