const ResponseHandler = require('../../utils/ResponseHandler');
const workoutModel = require('../../models/Workout')
const WorkoutVideoModel = require('../../models/workoutvideo');
const categoryWorkout = require('../../models/CategoryWorkout');
const CategoryModel = require('../../models/Category');
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
      const { categoryId } = req.body;
      
      // Find all category-workout associations
      const categoryWorkouts = await categoryWorkout
        .find({ categoryId: categoryId,isActive:true })
        .sort({ sequence: 1 }); // Sort by sequence
      
      if (!categoryWorkouts || categoryWorkouts.length === 0) {
        return ResponseHandler.success(res, 'No workouts found in this category', []);
      }
  
      // Extract workout IDs
      const workoutIds = categoryWorkouts.map(cw => cw.workoutId);
      
      // Fetch workout details
      const workouts = await workoutModel
        .find({ _id: { $in: workoutIds } })
        .select(WORKOUT_PROJECTION); // Use your existing projection
      
      // Create a map of workouts by ID for easy lookup
      const workoutMap = {};
      workouts.forEach(workout => {
        workoutMap[workout._id.toString()] = workout.toObject();
      });
      
      // Combine category-workout data with workout details, maintaining sequence order
      const result = categoryWorkouts.map(cw => ({
        ...workoutMap[cw.workoutId.toString()],
        sequence: cw.sequence,
        categoryWorkoutId: cw._id
      }));

      return ResponseHandler.success(res, 'Workouts fetched successfully', result);
      
    } catch (error) {
      console.error('❌ getcategory error:', error);
      return ResponseHandler.error(res, error);
    }
  }

/**
 * HOMEPAGE API - Production Ready
 * Returns all active categories with their top N workouts
 * 
 * Flow:
 * Category (sorted by categorySequence) 
 *   → CategoryWorkout (sorted by sequence, isActive=true)
 *     → Workout (isActive=true)
 * 
 * Performance: Single aggregation query
 */
async homepage(req, res) {
  try {
    const LIMIT = 10; // Number of workouts per category

    console.log('🏠 Fetching homepage data...');

    const result = await CategoryModel.aggregate([
      // ==========================================
      // STEP 1: Filter only active categories
      // ==========================================
      { 
        $match: { isActive: true } 
      },

      // ==========================================
      // STEP 2: Sort categories by their sequence
      // ==========================================
      { 
        $sort: { categorySequence: 1 } 
      },

      // ==========================================
      // STEP 3: Lookup CategoryWorkout associations
      // ==========================================
      {
        $lookup: {
          from: 'categoryworkouts', // Physical collection name
          let: { catId: '$_id' },
          pipeline: [
            // Filter: only active associations for this category
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$categoryId', '$$catId'] },
                    { $eq: ['$isActive', true] }
                  ]
                }
              }
            },
            
            // Sort by sequence within category (workout order)
            { $sort: { sequence: 1 } },
            
            // Limit to top N workouts
            { $limit: LIMIT },
            
            // ==========================================
            // STEP 4: Lookup actual workout details
            // ==========================================
            {
              $lookup: {
                from: 'workouts', // Physical collection name
                let: { workoutId: '$workoutId' },
                pipeline: [
                  // Filter: only active workouts
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$_id', '$$workoutId'] },
                          { $eq: ['$isActive', true] }
                        ]
                      }
                    }
                  },
                  
                  // Only return necessary fields (optimization)
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      thumbnailUrl: 1,
                      duration: 1,
                      difficulty: 1,
                      caloriesBurned: 1,
                      introduction: 1
                    }
                  }
                ],
                as: 'workoutDetails'
              }
            },
            
            // Flatten workout details array
            { 
              $unwind: { 
                path: '$workoutDetails', 
                preserveNullAndEmptyArrays: false // Skip if workout not found
              } 
            },
            
            // Replace root with workout data only
            { $replaceRoot: { newRoot: '$workoutDetails' } }
          ],
          as: 'workouts'
        }
      },

      // ==========================================
      // STEP 5: Format final response
      // ==========================================
      {
        $project: {
          _id: 0, // Don't expose internal _id at root level
          categoryId: '$_id',
          category: '$name',
          designId: 1,
          categorySequence: 1, // Include for debugging/sorting verification
          totalWorkouts: { $size: '$workouts' },
          data: {
            $map: {
              input: '$workouts',
              as: 'workout',
              in: {
                _id: '$$workout._id',
                name: { $ifNull: ['$$workout.name', 'Untitled Workout'] },
                thumbnail: { $ifNull: ['$$workout.thumbnailUrl', null] },
                duration: '$$workout.duration',
                level: '$$workout.level',
                caloriesBurned: '$$workout.caloriesBurned',
                introduction: '$$workout.introduction'
              }
            }
          }
        }
      },

      // ==========================================
      // STEP 6: Optional - Filter out empty categories
      // ==========================================
      // Uncomment if you don't want to show categories with no workouts
      // { 
      //   $match: { 
      //     totalWorkouts: { $gt: 0 } 
      //   } 
      // }
    ]);

    console.log(`✅ Homepage data fetched: ${result.length} categories`);
    
    // Log summary
    const summary = result.map(cat => ({
      category: cat.category,
      workouts: cat.totalWorkouts
    }));
    console.log('📊 Category summary:', summary);

    return ResponseHandler.success(
      res,
      'Homepage data fetched successfully',
      result
    );

  } catch (error) {
    console.error('❌ Homepage API error:', error);
    
    // Provide more context in error
    return ResponseHandler.serverError(
      res,
      'An error occurred while fetching homepage data'
    );
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
            console.error('getworkoutbyid error:', error);
            return ResponseHandler.error(res, error);
        }
    }
}


module.exports = new WorkoutUserController();
