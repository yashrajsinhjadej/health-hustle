const ResponseHandler = require('../../utils/ResponseHandler');
const Logger = require('../../utils/logger');
const workoutModel = require('../../models/Workout');
const WorkoutVideoModel = require('../../models/workoutvideo');
const categoryWorkout = require('../../models/CategoryWorkout');
const CategoryModel = require('../../models/Category');
const redisClient = require('../../utils/redisClient');

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
   * GET WORKOUTS BY CATEGORY
   * Logic:
   * 1. Find all active category-workout associations for the category
   * 2. Fetch workout details for those associations
   * 3. Combine and return sorted by sequence
   */
  async getcategory(req, res) {
    const requestId = `category-workouts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { categoryId } = req.body;

      // Basic validation
      if (!categoryId) {
        Logger.warn('Get category workouts validation failed - missing categoryId', requestId);
        return ResponseHandler.badRequest(res, 'Category ID is required');
      }

      Logger.info('Get category workouts START', requestId, { categoryId });
      
      // 1️⃣ Find all active category-workout associations
      const categoryWorkouts = await categoryWorkout
        .find({ categoryId: categoryId, isActive: true })
        .sort({ sequence: 1 }); // Sort by sequence
      
      if (!categoryWorkouts || categoryWorkouts.length === 0) {
        Logger.info('No workouts found for category', requestId, { categoryId });
        return ResponseHandler.success(res, 'No workouts found in this category', []);
      }
  
      // 2️⃣ Extract workout IDs
      const workoutIds = categoryWorkouts.map(cw => cw.workoutId);
      
      Logger.info('Fetching workout details', requestId, { 
        categoryId,
        workoutCount: workoutIds.length 
      });

      // 3️⃣ Fetch workout details
      const workouts = await workoutModel
        .find({ _id: { $in: workoutIds } })
        .select(WORKOUT_PROJECTION);
      
      // 4️⃣ Create a map of workouts by ID for easy lookup
      const workoutMap = {};
      workouts.forEach(workout => {
        workoutMap[workout._id.toString()] = workout.toObject();
      });
      
      // 5️⃣ Combine category-workout data with workout details, maintaining sequence order
      const result = categoryWorkouts.map(cw => ({
        ...workoutMap[cw.workoutId.toString()],
        sequence: cw.sequence,
        categoryWorkoutId: cw._id
      }));

      Logger.info('Get category workouts SUCCESS', requestId, { 
        categoryId,
        workoutsReturned: result.length 
      });

      return ResponseHandler.success(res, 'Workouts fetched successfully', result);
      
    } catch (error) {
      Logger.error('Get category workouts FAILED', requestId, { 
        error: error.message, 
        stack: error.stack 
      });
      return ResponseHandler.serverError(
        res, 
        'An error occurred while fetching category workouts', 
        'CATEGORY_WORKOUTS_GET_FAILED'
      );
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
    const requestId = `homepage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const CACHE_KEY = "homepage:data";
    const CACHE_TTL = 3600; // 1 hour

    try {
      Logger.info("Homepage fetch START", requestId);

      // 1️⃣ Check Redis cache first
      const cachedData = await redisClient.get(CACHE_KEY);
      if (cachedData) {
        Logger.info("Homepage served from cache", requestId);
        return ResponseHandler.success(
          res,
          "Homepage data fetched successfully (from cache)",
          JSON.parse(cachedData)
        );
      }

      const LIMIT = 10;

      // 2️⃣ Fetch from MongoDB if cache miss
      const result = await CategoryModel.aggregate([
        { $match: { isActive: true } },
        { $sort: { categorySequence: 1 } },
        {
          $lookup: {
            from: "categoryworkouts",
            let: { catId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$categoryId", "$$catId"] },
                      { $eq: ["$isActive", true] },
                    ],
                  },
                },
              },
              { $sort: { sequence: 1 } },
              { $limit: LIMIT },
              {
                $lookup: {
                  from: "workouts",
                  let: { workoutId: "$workoutId" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$_id", "$$workoutId"] },
                            { $eq: ["$isActive", true] },
                          ],
                        },
                      },
                    },
                    {
                      $project: {
                        _id: 1,
                        name: 1,
                        thumbnailUrl: 1,
                        duration: 1,
                        difficulty: 1,
                        caloriesBurned: 1,
                        introduction: 1,
                      },
                    },
                  ],
                  as: "workoutDetails",
                },
              },
              { $unwind: { path: "$workoutDetails", preserveNullAndEmptyArrays: false } },
              { $replaceRoot: { newRoot: "$workoutDetails" } },
            ],
            as: "workouts",
          },
        },
        {
          $project: {
            _id: 0,
            categoryId: "$_id",
            category: "$name",
            designId: 1,
            categorySequence: 1,
            totalWorkouts: { $size: "$workouts" },
            data: {
              $map: {
                input: "$workouts",
                as: "workout",
                in: {
                  _id: "$$workout._id",
                  name: { $ifNull: ["$$workout.name", "Untitled Workout"] },
                  thumbnail: { $ifNull: ["$$workout.thumbnailUrl", null] },
                  duration: "$$workout.duration",
                  level: "$$workout.level",
                  caloriesBurned: "$$workout.caloriesBurned",
                  introduction: "$$workout.introduction",
                },
              },
            },
          },
        },
      ]);

      // 3️⃣ Cache the result in Redis
      await redisClient.set(CACHE_KEY, JSON.stringify(result), { EX: CACHE_TTL });
      Logger.info("Homepage cached in Redis", requestId, { ttl: CACHE_TTL });

      // 4️⃣ Return the response
      return ResponseHandler.success(
        res,
        "Homepage data fetched successfully",
        result
      );
    } catch (error) {
      Logger.error("Homepage fetch FAILED", requestId, {
        error: error.message,
        stack: error.stack,
      });
      return ResponseHandler.serverError(
        res,
        "An error occurred while fetching homepage data",
        "HOMEPAGE_FETCH_FAILED"
      );
    }
  }
      
  /**
   * LIST WORKOUTS
   * Lists workouts with optional search and filtering
   * GET /workouts?search=fullbody&level=beginner&page=1&limit=25
   */
  async listworkout(req, res) {
    const requestId = `workout-list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // 1️⃣ Extract filter and search parameters
      const searchTerm = req.query.search;
      const levelFilter = req.query.level;
      const categoryFilter = req.query.category;

      Logger.info('List workouts START', requestId, { 
        searchTerm, 
        levelFilter, 
        categoryFilter 
      });

      // Build filter object
      let filter = {};
      if (searchTerm) filter.$text = { $search: searchTerm };
      if (levelFilter) filter.level = levelFilter;
      if (categoryFilter) filter.category = categoryFilter;

      // 2️⃣ Pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 25;
      const skip = (page - 1) * limit;

      Logger.info('Pagination params', requestId, { page, limit, skip });

      // 3️⃣ Build and execute query
      let query = workoutModel.find(filter);

      // If searching, sort by text score; otherwise sort by sequence
      if (searchTerm) {
        query = query
          .select({ ...WORKOUT_PROJECTION, score: { $meta: "textScore" } })
          .sort({ score: { $meta: "textScore" }, sequence: 1 });
        Logger.info('Search mode enabled', requestId, { searchTerm });
      } else {
        query = query.select(WORKOUT_PROJECTION).sort({ sequence: 1 });
      }

      query = query.skip(skip).limit(limit);

      const workouts = await query.exec();

      // 4️⃣ Get pagination metadata
      const totalDocuments = await workoutModel.countDocuments(filter);
      const totalPages = Math.ceil(totalDocuments / limit);

      Logger.info('List workouts SUCCESS', requestId, { 
        workoutsReturned: workouts.length,
        totalDocuments,
        totalPages,
        currentPage: page
      });

      // 5️⃣ Return response with pagination
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
      Logger.error('List workouts FAILED', requestId, { 
        error: error.message, 
        stack: error.stack 
      });
      return ResponseHandler.serverError(
        res, 
        'An error occurred while listing workouts', 
        'WORKOUT_LIST_FAILED'
      );
    }
  }

  /**
   * GET WORKOUT BY ID
   * Fetches a single workout with all its videos (sorted by sequence)
   */
  async getworkoutbyid(req, res) {
    const requestId = `workout-getbyid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { workoutId } = req.body;

      // Basic validation
      if (!workoutId) {
        Logger.warn('Get workout by ID validation failed - missing workoutId', requestId);
        return ResponseHandler.badRequest(res, 'Workout ID is required');
      }

      Logger.info('Get workout by ID START', requestId, { workoutId });

      // 1️⃣ Fetch workout and populate videos
      const workout = await workoutModel
        .findById(workoutId)
        .populate({
          path: 'videos.video',
          model: 'WorkoutVideo',
          select: 'title description youtubeUrl duration'
        })
        .lean(); // Convert Mongoose doc to plain JS object

      if (!workout) {
        Logger.warn('Get workout by ID failed - not found', requestId, { workoutId });
        return ResponseHandler.notFound(res, 'Workout not found');
      }

      // 2️⃣ Map videos with sequence from workout.videos array and convert duration to minutes
      const videosWithSequence = workout.videos
        .map(v => {
          if (!v.video) return null; // Skip if video was deleted
          
          // Convert duration from seconds to minutes (rounded up)
          const durationInMinutes = v.video.duration ? Math.ceil(v.video.duration / 60) : 0;
          
          return {
            _id: v.video._id,
            title: v.video.title,
            description: v.video.description,
            youtubeUrl: v.video.youtubeUrl,
            duration: durationInMinutes, // Now in minutes
            sequence: v.sequence
          };
        })
        .filter(v => v !== null) // Remove nulls
        .sort((a, b) => a.sequence - b.sequence); // Sort by sequence
        
      Logger.info('Video durations converted to minutes', requestId, {
        videoCount: videosWithSequence.length,
        examples: videosWithSequence.slice(0, 2).map(v => ({ 
          title: v.title,
          durationMinutes: v.duration
        }))
      });

      // 3️⃣ Replace videos array with sorted videos
      workout.videos = videosWithSequence;

      Logger.info('Get workout by ID SUCCESS', requestId, { 
        workoutId,
        videoCount: videosWithSequence.length 
      });

      return ResponseHandler.success(res, 'Workout fetched successfully', workout);
    } catch (error) {
      Logger.error('Get workout by ID FAILED', requestId, { 
        error: error.message, 
        stack: error.stack 
      });
      return ResponseHandler.serverError(
        res, 
        'An error occurred while fetching the workout', 
        'WORKOUT_GET_BY_ID_FAILED'
      );
    }
  }
}

module.exports = new WorkoutUserController();