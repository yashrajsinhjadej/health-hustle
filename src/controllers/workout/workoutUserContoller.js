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

    // 0️⃣ Redis cache check
    const cacheKey = `workout:category:${categoryId}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      Logger.info('🧠 Cache hit for category workouts', requestId, { categoryId });
      const result = JSON.parse(cachedData);
      return ResponseHandler.success(res, 'Workouts fetched successfully (from cache)', result);
    }

    Logger.info('⚙️ Cache miss - fetching from DB', requestId, { categoryId });

    // 1️⃣ Find all active category-workout associations
    const categoryWorkouts = await categoryWorkout
      .find({ categoryId: categoryId, isActive: true })
      .sort({ sequence: 1 });

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

    // 6️⃣ Store in Redis (10 min TTL)
    await redisClient.set(cacheKey, JSON.stringify(result), { EX: 600 });
    Logger.info('💾 Cached category workouts in Redis', requestId, { categoryId, count: result.length });

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

    // 0️⃣ Check Redis cache
    const cacheKey = `workout:details:${workoutId}`;
    const cachedWorkout = await redisClient.get(cacheKey);

    if (cachedWorkout) {
      Logger.info('🧠 Cache hit for workout details', requestId, { workoutId });
      const workout = JSON.parse(cachedWorkout);
      return ResponseHandler.success(res, 'Workout fetched successfully (from cache)', workout);
    }

    Logger.info('⚙️ Cache miss - fetching from DB', requestId, { workoutId });

    // 1️⃣ Fetch workout and populate videos
    const workout = await workoutModel
      .findById(workoutId)
      .populate({
        path: 'videos.video',
        model: 'WorkoutVideo',
        select: 'title description youtubeUrl duration'
      })
      .lean();

    if (!workout) {
      Logger.warn('Get workout by ID failed - not found', requestId, { workoutId });
      return ResponseHandler.notFound(res, 'Workout not found');
    }

    // 2️⃣ Process videos (sequence + duration)
    const videosWithSequence = workout.videos
      .map(v => {
        if (!v.video) return null;
        const durationInMinutes = v.video.duration ? Math.ceil(v.video.duration / 60) : 0;
        return {
          _id: v.video._id,
          title: v.video.title,
          description: v.video.description,
          youtubeUrl: v.video.youtubeUrl,
          duration: durationInMinutes,
          sequence: v.sequence
        };
      })
      .filter(v => v !== null)
      .sort((a, b) => a.sequence - b.sequence);

    workout.videos = videosWithSequence;

    Logger.info('Video durations converted and sorted', requestId, {
      videoCount: videosWithSequence.length
    });

    // 3️⃣ Store in Redis for 10 mins
    await redisClient.set(cacheKey, JSON.stringify(workout), { EX: 600 });
    Logger.info('💾 Cached workout details in Redis', requestId, { workoutId });

    // 4️⃣ Return final result
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

// Workout Search Controller Functions
// Workout Search Controller Functions
// Workout Search Controller Functions
// Workout Search Controller Functions

async searchWorkouts(req, res) {
  try {
    const { 
      query = '', 
      page = 1, 
      limit = 10,
      level,
      minDuration,
      maxDuration,
      minCalories,
      maxCalories,
      equipment,
      sortBy = 'relevance' // relevance, duration, calories, name
    } = req.query;

    // Validate query length (frontend should handle this, but safety check)
    if (query.length < 3) {
      return ResponseHandler.error(res, 'Search query must be at least 3 characters long', 400);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build search query with priority weighting
    const searchQuery = {
      isActive: true, // Only search active workouts
      $or: [
        { 
          name: { 
            $regex: query, 
            $options: 'i' // Case insensitive
          } 
        },
        { 
          description: { 
            $regex: query, 
            $options: 'i' 
          } 
        },
        { 
          introduction: { 
            $regex: query, 
            $options: 'i' 
          } 
        },
        { 
          level: { 
            $regex: query, 
            $options: 'i' 
          } 
        }
      ]
    };

    // Add optional filters
    if (level) {
      searchQuery.level = level;
    }

    if (minDuration || maxDuration) {
      searchQuery.duration = {};
      if (minDuration) searchQuery.duration.$gte = parseInt(minDuration);
      if (maxDuration) searchQuery.duration.$lte = parseInt(maxDuration);
    }

    if (minCalories || maxCalories) {
      searchQuery.caloriesBurned = {};
      if (minCalories) searchQuery.caloriesBurned.$gte = parseInt(minCalories);
      if (maxCalories) searchQuery.caloriesBurned.$lte = parseInt(maxCalories);
    }

    if (equipment && equipment !== '' && equipment !== 'undefined') {
      const equipmentArray = Array.isArray(equipment) ? equipment : [equipment];
      const validEquipment = equipmentArray.filter(e => e && e !== '' && e !== 'undefined');
      if (validEquipment.length > 0) {
        searchQuery.equipment = { $in: validEquipment };
      }
    }

    // Build aggregation pipeline for weighted search results
    const aggregationPipeline = [
      { $match: searchQuery },
      {
        $addFields: {
          // Calculate relevance score
          relevanceScore: {
            $add: [
              // Exact match bonus - highest priority (weight: 20)
              {
                $cond: [
                  { $eq: [{ $toLower: '$name' }, query.toLowerCase()] },
                  20,
                  0
                ]
              },
              // Name match gets highest priority (weight: 15)
              {
                $cond: [
                  { $regexMatch: { input: '$name', regex: query, options: 'i' } },
                  15,
                  0
                ]
              },
              // Description match gets high priority (weight: 8)
              {
                $cond: [
                  { 
                    $and: [
                      { $ne: ['$description', null] },
                      { $ne: ['$description', ''] },
                      { $regexMatch: { input: '$description', regex: query, options: 'i' } }
                    ]
                  },
                  8,
                  0
                ]
              },
              // Introduction match gets medium priority (weight: 5)
              {
                $cond: [
                  { 
                    $and: [
                      { $ne: ['$introduction', null] },
                      { $ne: ['$introduction', ''] },
                      { $regexMatch: { input: '$introduction', regex: query, options: 'i' } }
                    ]
                  },
                  5,
                  0
                ]
              },
              // Level match gets lower priority (weight: 2)
              {
                $cond: [
                  { $regexMatch: { input: '$level', regex: query, options: 'i' } },
                  2,
                  0
                ]
              }
            ]
          }
        }
      }
    ];

    // Add sorting
    let sortStage = {};
    switch (sortBy) {
      case 'duration':
        sortStage = { duration: 1, relevanceScore: -1 };
        break;
      case 'calories':
        sortStage = { caloriesBurned: -1, relevanceScore: -1 };
        break;
      case 'name':
        sortStage = { name: 1 };
        break;
      case 'relevance':
      default:
        sortStage = { relevanceScore: -1, name: 1 };
        break;
    }

    aggregationPipeline.push({ $sort: sortStage });

    // Get total count for pagination
    const totalCountPipeline = [...aggregationPipeline, { $count: 'total' }];
    const countResult = await workoutModel.aggregate(totalCountPipeline);
    const totalResults = countResult.length > 0 ? countResult[0].total : 0;

    // Add pagination
    aggregationPipeline.push(
      { $skip: skip },
      { $limit: parseInt(limit) }
    );

    // Project only needed fields
    aggregationPipeline.push({
      $project: {
        name: 1,
        thumbnailUrl: 1,
        bannerUrl: 1,
        description: 1,
        introduction: 1,
        equipment: 1,
        duration: 1,
        exerciseCount: 1,
        level: 1,
        caloriesBurned: 1,
        relevanceScore: 1
      }
    });

    // Execute aggregation
    const workouts = await workoutModel.aggregate(aggregationPipeline);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalResults / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    Logger.info(`Search completed for query: "${query}" - Found ${totalResults} results`);

    return ResponseHandler.success(res, {
      workouts,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalResults,
        resultsPerPage: parseInt(limit),
        hasNextPage,
        hasPrevPage
      },
      searchQuery: query,
      filters: {
        level,
        duration: { min: minDuration, max: maxDuration },
        calories: { min: minCalories, max: maxCalories },
        equipment
      }
    }, 'Workouts retrieved successfully');

  } catch (error) {
    Logger.error('Search workouts error:', error);
    return ResponseHandler.error(res, 'Error searching workouts', 500, error.message);
  }
}

async getSearchSuggestions(req, res) {
  try {
    const { query = '', limit = 5 } = req.query;

    if (query.length < 2) {
      return ResponseHandler.success(res, { suggestions: [] }, 'No suggestions');
    }

    // Try to get from cache first
    const cacheKey = `search_suggestions:${query}:${limit}`;
    let cachedSuggestions = null;

    try {
      cachedSuggestions = await redisClient.get(cacheKey);
      
      if (cachedSuggestions) {
        Logger.info(`Cache hit for suggestions: ${query}`);
        return ResponseHandler.success(
          res, 
          { suggestions: JSON.parse(cachedSuggestions) }, 
          'Suggestions retrieved from cache'
        );
      }
    } catch (cacheError) {
      Logger.warn('Redis cache read error:', cacheError.message);
    }

    // Query database if not in cache
    const suggestions = await workoutModel.find(
      {
        isActive: true,
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } }
        ]
      },
      { 
        name: 1, 
        level: 1, 
        duration: 1, 
        thumbnailUrl: 1,
        exerciseCount: 1,
        caloriesBurned: 1
      }
    )
      .limit(parseInt(limit))
      .lean();

    // Cache suggestions for 5 minutes
    try {
      await redisClient.set(cacheKey, JSON.stringify(suggestions), 'EX', 300);
    } catch (cacheError) {
      Logger.warn('Redis cache write error:', cacheError.message);
    }

    Logger.info(`Suggestions generated for query: ${query}`);

    return ResponseHandler.success(res, { suggestions }, 'Suggestions retrieved successfully');

  } catch (error) {
    Logger.error('Get suggestions error:', error);
    return ResponseHandler.error(res, 'Error getting suggestions', 500, error.message);
  }
}


}

module.exports = new WorkoutUserController();