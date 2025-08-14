// Health Controller - Daily health data management
const DailyHealthData = require('../models/DailyHealthData');
const Goals = require('../models/Goals');
const ConnectionHelper = require('../utils/connectionHelper');
const WaterConverter = require('../utils/waterConverter');
const ResponseHandler = require('../utils/ResponseHandler');
const goalcounter = require('../utils/goalcounter');
/**
 * HEALTH CONTROLLER API DOCUMENTATION
 * 
 * 1. DAILY UPDATE - PUT /api/health/date
 * Expected Body Format:
 * {
 *   "date": "2025-08-07",  // REQUIRED - Date is always required in request body
 *   "steps": {
 *     "count": 8500,
 *     "goal": 10000,
 *     "calories": 340
 *   },
 *   "water": {
 *     "consumed": 6,  // Frontend sends glasses, backend stores as ml
 *     "goal": 8
 *   },
 *   "bodyMetrics": {
 *     "weight": 70,
 *     "height": 175,
 *     "bmi": 24.6
 *   },
 *   "bloodPressure": {
 *     "systolic": 120,
 *     "diastolic": 80,
 *     "timestamp": "2025-07-21T10:30:00Z"
 *   },
 *   "heartRate": {
 *     "avgBpm": 75
 *   },
 *   "sleep": {
 *     "duration": 7.5,
 *     "quality": "good"
 *   },
 *   "meals": [
 *     {
 *       "type": "breakfast",
 *       "time": "08:00",
 *       "calories": 450,
 *       "description": "Oatmeal with fruits"
 *     }
 *   ],
 *   "exercise": [
 *     {
 *       "type": "running",
 *       "duration": 30,
 *       "calories": 300,
 *       "time": "07:00"
 *     }
 *   ]
 * }
 * 
 * 2. GET SPECIFIC DATE - GET /api/health/date
 * Expected Body Format:
 * {
 *   "date": "2025-08-06"  // REQUIRED - Date is always required in request body
 * }
 * 
 * 3. QUICK UPDATE - PUT /api/health/quick-update (TODAY ONLY)
 * Expected Body Format:
 * {
 *   "metric": "steps|water|calories|sleep|weight|heartRate",
 *   "value": 8500
 * }
 * 
 * BEHAVIOR BY METRIC:
 * - WATER & CALORIES: Adds entry to array + updates total (additive)
 *   Example: water=2 glasses → adds 2 glasses to today's water entries
 * - STEPS & SLEEP & WEIGHT: Updates whole field (replacement)
 *   Example: steps=8500 → sets today's step count to 8500
 * - HEART RATE: Adds reading to array with current time
 * 
 * Note for WATER: Frontend sends in glasses, backend stores ml + creates entries
 * - 1 glass = 200ml
 * - Example: value: 2 (glasses) → adds entry + increases total by 400ml
 * 
 * 4. BULK UPDATE - POST /api/health/bulk
 * Expected Body Format:
 * {
 *   "health_data": [
 *     {
 *       "date": "2025-07-21",
 *       "data": {
 *         // Same format as daily health data above
 *       }
 *     },
 *     {
 *       "date": "2025-07-20",
 *       "data": {
 *         // Same format as daily health data above
 *       }
 *     }
 *   ]
 * }
 * 
 * STREAK SYSTEM: Multi-goal streak calculation based on:
 * - Steps goal completion (steps.count >= stepsGoal)
 * - Sleep goal completion (sleep.duration >= sleepGoal.hours)  
 * - Calories burn goal completion (calories.burned >= caloriesBurnGoal)
 * - ALL 3 goals must be completed for streak to continue
 * - Streak resets to 0 if any goal is missed (simple boolean logic)
 * 
 * DATE FORMAT: All dates should be in YYYY-MM-DD format (e.g., "2025-07-21")
 * TIME FORMAT: Times should be in HH:MM format (e.g., "10:30")
 * UNITS: Weight in kg, Height in cm, Water in glasses (frontend) → ml (backend), Duration in minutes/hours
 * 
 * WATER CONVERSION (Simple):
 * - Frontend always sends: glasses (e.g., 4 glasses)
 * - Backend stores: ml (glasses × 200ml)
 * - Frontend receives: glasses (ml ÷ 200ml)
 * - No unit tracking needed - always glasses in/out, ml stored internally
 * 
 * IMPORTANT: Date is ALWAYS required in request body for all date-specific operations
 * No automatic fallback to "today" - user must explicitly specify the date they want
 */

class HealthController {
    
    // Update or create daily health data
    async updateDailyHealth(req, res) {
        const requestId = `update_health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            console.log(`📊 [${requestId}] HealthController.updateDailyHealth START`);
            console.log(`📊 [${requestId}] Request params:`, req.params);
            console.log(`📊 [${requestId}] Request body:`, req.body);
            console.log(`📊 [${requestId}] Request headers:`, req.headers);
            console.log(`📊 [${requestId}] Request IP:`, req.ip || req.connection.remoteAddress);
            
            // Ensure MongoDB connection for serverless
            console.log(`📊 [${requestId}] Ensuring MongoDB connection...`);
            await ConnectionHelper.ensureConnection();
            
            const userId = req.user._id;
            const date = req.body.date; // Date is required in body, no fallback to today
            const healthData = req.body;

            // Additional controller-level validation for future dates
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const inputDate = new Date(date);
            inputDate.setHours(0, 0, 0, 0);
            
            if (inputDate > today) {
                console.log(`❌ [${requestId}] Rejecting future date ${date} for user ${userId}`);
                return ResponseHandler.error(res, `Date ${date} cannot be in the future. Only today's date or past dates are allowed.`);
            }
            
            console.log(`📊 [${requestId}] Processing - User: ${userId}, Date: ${date}`);
            console.log(`📊 [${requestId}] Health data received:`, healthData);

            // Simple water conversion: glasses to ml for storage
            if (healthData.water && healthData.water.consumed !== undefined) {
                const originalGlasses = healthData.water.consumed;
                healthData.water.consumed = WaterConverter.glassesToMl(originalGlasses);
                console.log(`💧 [${requestId}] Converted water: ${originalGlasses} glasses → ${healthData.water.consumed}ml`);
            }
            
            if (healthData.water && healthData.water.goal !== undefined) {
                const originalGoalGlasses = healthData.water.goal;
                healthData.water.goal = WaterConverter.glassesToMl(originalGoalGlasses);
                console.log(`💧 [${requestId}] Converted water goal: ${originalGoalGlasses} glasses → ${healthData.water.goal}ml`);
            }

            // Get user goals for streak calculation
            console.log(`📊 [${requestId}] Getting user goals for streak calculation...`);
            let userGoals = await Goals.findOne({ userId: userId });
            if (!userGoals) {
                console.log(`📊 [${requestId}] No goals found, creating default goals...`);
                userGoals = new Goals({
                    userId: userId,
                    stepsGoal: 10000,
                    caloriesBurnGoal: 2000,
                    waterIntakeGoal: 8,
                    caloriesIntakeGoal: 2000,
                    sleepGoal: { hours: 8 }
                });
                await userGoals.save();
            }

            // Find existing record or create new one
            console.log(`📊 [${requestId}] Looking for existing health record...`);
            let dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: date 
            });

            // Calculate multi-goal streak before saving
            console.log(`📊 [${requestId}] Calculating multi-goal streak...`);
            
            // Get previous day's streak data
            const previousDate = new Date(date);
            previousDate.setDate(previousDate.getDate() - 1);
            const previousDateString = previousDate.toISOString().split('T')[0];
            
            const previousRecord = await DailyHealthData.findOne({ 
                userId: userId, 
                date: previousDateString 
            });
            
            const prevStreak = previousRecord ? previousRecord.streak : 0;
            const prevGoalCompleted = previousRecord ? previousRecord.goalcompletions : false;
            
            // Check if each goal is completed
            const stepsGoal = userGoals.stepsGoal || 10000;
            const sleepGoal = userGoals.sleepGoal?.hours || 8;
            const caloriesBurnGoal = userGoals.caloriesBurnGoal || 2000;
            
            const stepsCompleted = healthData.steps && healthData.steps.count >= stepsGoal;
            const sleepCompleted = healthData.sleep && healthData.sleep.duration >= sleepGoal;
            const caloriesBurnCompleted = healthData.calories && healthData.calories.burned >= caloriesBurnGoal;
            
            // Calculate total goals completed (0-3)
            const totalGoalsCompleted = [stepsCompleted, sleepCompleted, caloriesBurnCompleted]
                .filter(Boolean).length;
            
            // Consider it a "goal completion day" if ALL 3 main goals are met
            const goalcompletions = totalGoalsCompleted === 3;
            
            // Clear streak algorithm based on yesterday's goal completion status
            let streak;
            // Note: goalcompletions boolean already reflects today's actual goal completion status
            if (!prevGoalCompleted) {
                // Yesterday goalcompletion was false
                // Check today's goal completion
                if (goalcompletions) {
                    // Today goals completed - start new streak
                    streak = 1;
                    // goalcompletions = true (already set above)
                } else {
                    // Today goals not completed - no streak
                    streak = 0;
                    // goalcompletions = false (already set above)
                }
            } else {
                // Yesterday goalcompletion was true
                if (goalcompletions) {
                    // Today goals completed - continue streak
                    streak = prevStreak + 1;
                    // goalcompletions = true (already set above)
                } else {
                    // Today goals not completed - maintain yesterday's streak
                    streak = prevStreak;
                    // goalcompletions = false (already set above)
                }
            }
            
            const streakStatus = goalcompletions ? (prevGoalCompleted ? 'INCREMENTED' : 'NEW_STREAK') : (prevGoalCompleted ? 'MAINTAINED' : 'NO_STREAK');
            console.log(`📊 [${requestId}] Streak calculation: ${prevStreak} → ${streak} (goals: ${totalGoalsCompleted}/3, ALL goals required: ${goalcompletions}, status: ${streakStatus})`);
            
            // Add streak data to health data
            healthData.streak = streak;
            healthData.goalcompletions = goalcompletions;
            
            if (dailyHealth) {
                // Update existing record
                console.log(`📊 [${requestId}] Found existing record, updating...`);
                console.log(`📊 [${requestId}] Before update:`, dailyHealth.toObject());
                Object.assign(dailyHealth, healthData);
                const savedHealth = await dailyHealth.save();
                console.log(`📊 [${requestId}] After update:`, savedHealth.toObject());
                
                console.log(`📊 [${requestId}] Updated health data for user ${userId} on ${date}`);
            } else {
                // Create new record
                console.log(`📊 [${requestId}] No existing record, creating new one...`);
                dailyHealth = new DailyHealthData({
                    userId: userId,
                    date: date,
                    ...healthData
                });
                const savedHealth = await dailyHealth.save();
                console.log(`📊 [${requestId}] Created new health record:`, savedHealth.toObject());
                
                console.log(`📊 [${requestId}] Created new health data for user ${userId} on ${date}`);
            }

            // Format and clean response data
            const responseData = { ...dailyHealth.toObject() };
            
            // Filter out unwanted fields and keep only essential data
            const cleanHealthData = {
                heartRate: responseData.heartRate ? { avgBpm: responseData.heartRate.avgBpm } : undefined,
                steps: responseData.steps ? { count: responseData.steps.count } : undefined,
                water: responseData.water ? { consumed: WaterConverter.mlToGlasses(responseData.water.consumed || 0) } : undefined,
                calories: responseData.calories ? { 
                    consumed: responseData.calories.consumed || 0, 
                    burned: responseData.calories.burned || 0 
                } : undefined,
                sleep: responseData.sleep ? { duration: responseData.sleep.duration } : undefined,
                date: responseData.date,
                goalcompletions: responseData.goalcompletions,
                streak: responseData.streak
            };
            
            // Remove undefined fields
            Object.keys(cleanHealthData).forEach(key => {
                if (cleanHealthData[key] === undefined) {
                    delete cleanHealthData[key];
                }
            });

            ResponseHandler.success(res, 'Daily health data updated successfully', cleanHealthData);

        } catch (error) {
            console.error(`❌ [${requestId}] Update daily health error:`, error);
            ResponseHandler.serverError(res, 'Failed to update daily health data');
        }
    }

    // Get specific day health data
    async getDailyHealth(req, res) {
        const requestId = `get_health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            console.log(`📊 [${requestId}] HealthController.getDailyHealth START`);
            console.log(`📊 [${requestId}] Request body:`, req.body);
            console.log(`📊 [${requestId}] Request headers:`, req.headers);
            console.log(`📊 [${requestId}] Request IP:`, req.ip || req.connection.remoteAddress);
            
            // Ensure MongoDB connection for serverless
            console.log(`📊 [${requestId}] Ensuring MongoDB connection...`);
            await ConnectionHelper.ensureConnection();
            
            const userId = req.user._id;
            const date = req.body.date;

            // Additional controller-level validation for future dates
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const inputDate = new Date(date);
            inputDate.setHours(0, 0, 0, 0);
            
            if (inputDate > today) {
                console.log(`❌ [${requestId}] Rejecting future date ${date} for user ${userId}`);
                return ResponseHandler.error(res, `Date ${date} cannot be in the future. Only today's date or past dates are allowed.`);
            }

            console.log(`📊 [${requestId}] Processing - User: ${userId}, Date: ${date}`);

            // Find health data for specific date
            console.log(`📊 [${requestId}] Looking for health record...`);
            const dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: date 
            });

            if (!dailyHealth) {
                console.log(`📊 [${requestId}] No health data found for ${date}`);
                return ResponseHandler.notFound(res, 'No health data found for this date');
            }

            console.log(`📊 [${requestId}] Found health record:`, dailyHealth.toObject());

            // Convert ml back to glasses for frontend and clean response data
            const responseData = { ...dailyHealth.toObject() };
            
            // Filter out unwanted fields and keep only essential data
            const cleanHealthData = {
                heartRate: responseData.heartRate ? { avgBpm: responseData.heartRate.avgBpm } : undefined,
                steps: responseData.steps ? { count: responseData.steps.count } : undefined,
                water: responseData.water ? { consumed: WaterConverter.mlToGlasses(responseData.water.consumed || 0) } : undefined,
                calories: responseData.calories ? { 
                    consumed: responseData.calories.consumed || 0, 
                    burned: responseData.calories.burned || 0 
                } : undefined,
                sleep: responseData.sleep ? { duration: responseData.sleep.duration } : undefined,
                date: responseData.date,
                goalcompletions: responseData.goalcompletions,
                streak: responseData.streak
            };
            
            // Remove undefined fields
            Object.keys(cleanHealthData).forEach(key => {
                if (cleanHealthData[key] === undefined) {
                    delete cleanHealthData[key];
                }
            });

            console.log(`📊 [${requestId}] Retrieved health data for user ${userId} on ${date}`);

            ResponseHandler.success(res, 'Daily health data retrieved successfully', cleanHealthData);

        } catch (error) {
            console.error(`❌ [${requestId}] Get daily health error:`, error);
            ResponseHandler.serverError(res, 'Failed to retrieve daily health data');
        }
    }

    // Get today's health data (convenience endpoint)
    async getTodayHealth(req, res) {
        try {
            // Ensure MongoDB connection before proceeding
            await ConnectionHelper.ensureConnection();
            
            const userId = req.user._id;
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            

            // Find today's health data
            const dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: today 
            });

            // Check if user has goals, if not create default goals
            let userGoals = await Goals.findOne({ userId: userId });
            
            if (!userGoals) {
                console.log(`🎯 Creating default goals for new user ${userId}`);
                
                // Create default goals for the user
                userGoals = new Goals({
                    userId: userId,
                    // Default values are already set in the schema
                    stepsGoal: 10000,
                    caloriesBurnGoal: 2000,
                    waterIntakeGoal: 8,
                    caloriesIntakeGoal: 2000,
                    sleepGoal: {
                        hours: 8
                    }
                });
                
                await userGoals.save();
                console.log(`✅ Default goals created for user ${userId}`);
            }

            // Clean goals data to only include essential fields
            let cleanGoals = null;
            if (userGoals) {
                cleanGoals = {
                    stepsGoal: userGoals.stepsGoal,
                    caloriesBurnGoal: userGoals.caloriesBurnGoal,
                    waterIntakeGoal: userGoals.waterIntakeGoal,
                    caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                    sleepGoal: {
                        hours: userGoals.sleepGoal?.hours
                    }
                };
            }
            
            // Prepare response data
            const responseData = {
                healthData: dailyHealth,
                goals: cleanGoals
            };

            // Convert ml back to glasses for frontend if health data exists
            if (dailyHealth) {
                const formattedHealthData = { ...dailyHealth.toObject() };
                
                // Filter out unwanted fields and keep only essential data
                const cleanHealthData = {
                    heartRate: formattedHealthData.heartRate ? { avgBpm: formattedHealthData.heartRate.avgBpm } : undefined,
                    steps: formattedHealthData.steps ? { count: formattedHealthData.steps.count } : undefined,
                    water: formattedHealthData.water ? { consumed: WaterConverter.mlToGlasses(formattedHealthData.water.consumed || 0) } : undefined,
                    calories: formattedHealthData.calories ? { 
                        consumed: formattedHealthData.calories.consumed || 0, 
                        burned: formattedHealthData.calories.burned || 0 
                    } : undefined,
                    sleep: formattedHealthData.sleep ? { duration: formattedHealthData.sleep.duration } : undefined,
                    date: formattedHealthData.date,
                    goalcompletions: formattedHealthData.goalcompletions,
                    streak: formattedHealthData.streak
                };
                
                // Remove undefined fields
                Object.keys(cleanHealthData).forEach(key => {
                    if (cleanHealthData[key] === undefined) {
                        delete cleanHealthData[key];
                    }
                });
                
                responseData.healthData = cleanHealthData;
            }

            if (!dailyHealth) {
                return ResponseHandler.success(res, 'No health data found for today, but goals are ready', responseData);
            } 

            console.log(`📊 Retrieved today's health data and goals for user ${userId}`);

            ResponseHandler.success(res, 'Today\'s health data and goals retrieved successfully', responseData);

        } catch (error) {
            console.error('Get today health error:', error);
            ResponseHandler.serverError(res, 'Failed to retrieve today\'s health data and goals');
        }
    }

    // Quick update for specific health metrics (TODAY ONLY)
    async quickUpdate(req, res) {
        const requestId = `quick_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            console.log(`📊 [${requestId}] HealthController.quickUpdate START`);
            console.log(`📊 [${requestId}] Request body:`, req.body);
            
            // Ensure MongoDB connection before proceeding
            await ConnectionHelper.ensureConnection();
            
            const userId = req.user._id;
            const today = new Date().toISOString().split('T')[0];
            const currentTime = new Date().toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            const { metric, value } = req.body;

            console.log(`📊 [${requestId}] Processing quick update - User: ${userId}, Today: ${today}, Metric: ${metric}, Value: ${value}`);

            // Find or create today's record
            let dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: today 
            });

            if (!dailyHealth) {
                console.log(`📊 [${requestId}] Creating new health record for today`);
                dailyHealth = new DailyHealthData({
                    userId: userId,
                    date: today
                });
            } else {
                console.log(`📊 [${requestId}] Found existing health record for today`);
            }

            // Update specific metric based on type
            switch (metric) {
                case 'steps':
                    // STEPS: Update whole field (replace current value)
                    console.log(`👟 [${requestId}] Updating steps: ${dailyHealth.steps.count} → ${value}`);
                    dailyHealth.steps.count = value;
                    break;
                    
                case 'water':
                    // WATER: Add entry to array AND update total consumed
                    console.log(`💧 [${requestId}] Adding water entry: ${value} glasses at ${currentTime}`);
                    
                    // Convert glasses to ml for storage
                    const waterMl = WaterConverter.glassesToMl(value);
                    
                    // Initialize water object if it doesn't exist
                    if (!dailyHealth.water) {
                        dailyHealth.water = { consumed: 0, entries: [] };
                    }
                    if (!dailyHealth.water.entries) {
                        dailyHealth.water.entries = [];
                    }
                    
                    // Add new entry to the array
                    dailyHealth.water.entries.push({
                        time: currentTime,
                        amount: waterMl,  // Store in ml
                        notes: `Quick update: ${value} glasses`
                    });
                    
                    // Update total consumed (add to existing)
                    dailyHealth.water.consumed = (dailyHealth.water.consumed || 0) + waterMl;
                    
                    console.log(`💧 [${requestId}] Added water entry: ${value} glasses (${waterMl}ml) at ${currentTime}`);
                    console.log(`💧 [${requestId}] Total water consumed today: ${dailyHealth.water.consumed}ml`);
                    break;
                    
                case 'calories':
                    // CALORIES: Add entry to array AND update total consumed
                    console.log(`🔥 [${requestId}] Adding calorie entry: ${value} calories at ${currentTime}`);
                    
                    // Initialize calories object if it doesn't exist
                    if (!dailyHealth.calories) {
                        dailyHealth.calories = { consumed: 0, entries: [] };
                    }
                    if (!dailyHealth.calories.entries) {
                        dailyHealth.calories.entries = [];
                    }
                    
                    // Add new entry to the array
                    dailyHealth.calories.entries.push({
                        time: currentTime,
                        amount: value,
                        type: "manual",
                        description: "Quick update entry",
                        notes: "Added via quick update"
                    });
                    
                    // Update total consumed (add to existing)
                    dailyHealth.calories.consumed = (dailyHealth.calories.consumed || 0) + value;
                    
                    console.log(`🔥 [${requestId}] Added calorie entry: ${value} calories at ${currentTime}`);
                    console.log(`🔥 [${requestId}] Total calories consumed today: ${dailyHealth.calories.consumed}`);
                    break;
                    
                case 'sleep':
                    // SLEEP: Update whole field (replace current value)
                    console.log(`😴 [${requestId}] Updating sleep duration: ${dailyHealth.sleep?.duration || 0} → ${value} hours`);
                    
                    if (!dailyHealth.sleep) {
                        dailyHealth.sleep = {};
                    }
                    dailyHealth.sleep.duration = value;
                    break;
                    
                case 'heartRate':
                    // HEART RATE: Update average BPM
                    console.log(`❤️ [${requestId}] Updating heart rate: ${dailyHealth.heartRate?.avgBpm || 0} → ${value} bpm`);
                    
                    if (!dailyHealth.heartRate) {
                        dailyHealth.heartRate = {};
                    }
                    dailyHealth.heartRate.avgBpm = value;
                    break;
                    
                default:
                    console.log(`❌ [${requestId}] Unknown metric: ${metric}`);
                    return ResponseHandler.error(res, `Unknown metric: ${metric}. Supported metrics: steps, water, sleep, heartRate`);
            }

            const savedHealth = await dailyHealth.save();
            console.log(`📊 [${requestId}] Successfully updated ${metric} for user ${userId}`);

            // Format response data (convert ml back to glasses for water)
            const responseData = { ...savedHealth.toObject() };
            let waterResponse = null;
            
            if (responseData.water && responseData.water.consumed !== undefined) {
                const totalMl = responseData.water.consumed;
                const totalGlasses = WaterConverter.mlToGlasses(totalMl);
                
                // Store both ml and glasses for water metric response
                waterResponse = {
                    totalConsumedMl: totalMl,
                    totalConsumedGlasses: totalGlasses
                };
                
                responseData.water.consumed = totalGlasses;
                
                // Also convert entries back to glasses for response
                if (responseData.water.entries) {
                    responseData.water.entries = responseData.water.entries.map(entry => ({
                        ...entry,
                        amount: WaterConverter.mlToGlasses(entry.amount)
                    }));
                }
            }

            const responsePayload = {
                date: today,
                metric: metric,
                value: value,
                timestamp: currentTime,
                updatedData: responseData
            };

            // Add water-specific data for water metric updates
            if (metric === 'water' && waterResponse) {
                responsePayload.waterSummary = waterResponse;
            }

            ResponseHandler.success(res, `${metric} updated successfully`, responsePayload);

        } catch (error) {
            console.error(`❌ [${requestId}] Quick update error:`, error);
            ResponseHandler.serverError(res, 'Failed to update health metric');
        }
    }

    // Bulk update health data for multiple dates - ULTRA OPTIMIZED VERSION
    async bulkUpdateHealthData(req, res) {
        const requestId = `bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            console.log(`🚀 [${requestId}] Starting ULTRA OPTIMIZED bulk update`);
            await ConnectionHelper.ensureConnection();
            
            const userId = req.user._id;
            const { health_data } = req.body;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // ULTRA OPTIMIZATION 1: Simple validation and sorting
            const sortedData = [...health_data]
                .filter(item => {
                    const inputDate = new Date(item.date);
                    inputDate.setHours(0, 0, 0, 0);
                    return inputDate <= today;
                })
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            if (sortedData.length === 0) {
                return ResponseHandler.error(res, 'No valid data to process');
            }

            const allDates = sortedData.map(d => d.date);
            const firstDate = sortedData[0].date;

            console.log(`📊 [${requestId}] Processing ${sortedData.length} records`);

            // CONDITIONAL STREAK STRATEGY: Only calculate streaks for ≤2 days
            const isStreakMode = sortedData.length <= 2;
            const isBulkMode = sortedData.length > 2;

            console.log(`📊 [${requestId}] Mode: ${isStreakMode ? 'STREAK (≤2 days)' : 'BULK (>2 days)'}`);

            if (isStreakMode) {
                // STREAK MODE: Calculate streaks for 1-2 days
                console.log(`📊 [${requestId}] STREAK MODE: Processing ${sortedData.length} records with streak calculation`);
                
                // Get all data needed for streak calculation
                const [existingRecords, userGoals, prevRecord] = await Promise.all([
                    DailyHealthData.find({ userId, date: { $in: allDates } }).lean(),
                    Goals.findOne({ userId }).lean(),
                    DailyHealthData.findOne({ 
                        userId, 
                        date: new Date(new Date(firstDate).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    }).lean()
                ]);

                // Fast lookup map
                const recordMap = {};
                existingRecords.forEach(rec => recordMap[rec.date] = rec);

                // Goals and streak tracking
                const goals = userGoals || { stepsGoal: 10000 };
                let prevStreak = prevRecord ? prevRecord.streak : 0;
                let prevGoalCompleted = prevRecord ? prevRecord.goalcompletions : false;

                const bulkOps = [];
                const results = [];

                for (const { date, data } of sortedData) {
                    try {
                                        // Complex multi-goal streak calculation
                const existing = recordMap[date];
                
                // Check if each goal is completed
                const stepsGoal = goals.stepsGoal || 10000;
                const sleepGoal = goals.sleepGoal?.hours || 8;
                const caloriesBurnGoal = goals.caloriesBurnGoal || 2000;
                
                const stepsCompleted = data.steps && data.steps.count >= stepsGoal;
                const sleepCompleted = data.sleep && data.sleep.duration >= sleepGoal;
                const caloriesBurnCompleted = data.calories && data.calories.burned >= caloriesBurnGoal;
                
                // Calculate total goals completed (0-3)
                const totalGoalsCompleted = [stepsCompleted, sleepCompleted, caloriesBurnCompleted]
                    .filter(Boolean).length;
                
                // Consider it a "goal completion day" if ALL 3 main goals are met
                const goalcompletions = totalGoalsCompleted === 3;
                
                // Clear streak algorithm based on yesterday's goal completion status
                let streak;
                // Note: goalcompletions boolean already reflects today's actual goal completion status
                if (!prevGoalCompleted) {
                    if (goalcompletions) {
                        // Today goals completed - start new streak
                        streak = 1;
                        // goalcompletions = true (already set above)
                    } else {
                        // Today goals not completed - no streak
                        streak = 0;
                        // goalcompletions = false (already set above)
                    }
                } else {
                    // Yesterday goalcompletion was true
                    if (goalcompletions) {
                        // Today goals completed - continue streak
                        streak = prevStreak + 1;
                        // goalcompletions = true (already set above)
                    } else {
                        // Today goals not completed - maintain yesterday's streak
                        streak = prevStreak;
                        // goalcompletions = false (already set above)
                    }
                }
                
                // Validation: Ensure streak logic is correct based on new algorithm
                if (goalcompletions && prevGoalCompleted) {
                    // If today completes goals and yesterday also completed goals, streak should increment
                    if (streak !== prevStreak + 1) {
                        console.error(`❌ [${requestId}] Streak increment error for ${date}: expected ${prevStreak + 1}, got ${streak}`);
                    }
                } else if (!goalcompletions && prevGoalCompleted) {
                    // If today doesn't complete goals but yesterday did, streak should maintain yesterday's value
                    if (streak !== prevStreak) {
                        console.error(`❌ [${requestId}] Streak maintenance error for ${date}: expected ${prevStreak}, got ${streak}`);
                    }
                } else if (goalcompletions && !prevGoalCompleted) {
                    // If today completes goals but yesterday didn't, streak should start at 1
                    if (streak !== 1) {
                        console.error(`❌ [${requestId}] New streak start error for ${date}: expected 1, got ${streak}`);
                    }
                } else if (!goalcompletions && !prevGoalCompleted) {
                    // If today doesn't complete goals and yesterday didn't, streak should be 0
                    if (streak !== 0) {
                        console.error(`❌ [${requestId}] No streak error for ${date}: expected 0, got ${streak}`);
                    }
                }

                        // Prepare update data with streak
                        const updateData = {
                            userId,
                            date,
                            streak,
                            goalcompletions,
                            goalcomplete: goalcompletions,
                            ...data
                        };

                      
                        

                        bulkOps.push({
                            updateOne: {
                                filter: { userId, date },
                                update: { $set: updateData },
                                upsert: true
                            }
                        });

                                        // Update tracking
                prevStreak = streak;
                prevGoalCompleted = goalcompletions;
                
                const streakStatus = goalcompletions ? (prevGoalCompleted ? 'INCREMENTED' : 'NEW_STREAK') : (prevGoalCompleted ? 'MAINTAINED' : 'NO_STREAK');
                console.log(`📊 [${requestId}] Day ${date}: goals ${totalGoalsCompleted}/3, completed: ${goalcompletions}, streak: ${prevStreak} → ${streak} (${streakStatus})`);
                        results.push({ 
                            date, 
                            status: existing ? 'updated' : 'created', 
                            streak, 
                            mode: 'streak',
                            goalsCompleted: {
                                steps: stepsCompleted,
                                sleep: sleepCompleted,
                                caloriesBurn: caloriesBurnCompleted,
                                total: totalGoalsCompleted,
                                allCompleted: totalGoalsCompleted === 3
                            }
                        });

                    } catch (err) {
                        console.error(`❌ [${requestId}] Error processing ${date}:`, err.message);
                    }
                }

                // Execute bulk write
                if (bulkOps.length > 0) {
                    await DailyHealthData.bulkWrite(bulkOps);
                }

                // Always include today's health data and goals (or null)
                const todayDateString = new Date().toISOString().split('T')[0];
                let todayHealth = await DailyHealthData.findOne({ userId, date: todayDateString });
                let todayGoals = goals || null;
                let todayData;
                if (todayHealth) {
                    let formattedHealthData = { ...todayHealth.toObject() };
                    
                    // Filter out unwanted fields and keep only essential data
                    const cleanHealthData = {
                        heartRate: formattedHealthData.heartRate ? { avgBpm: formattedHealthData.heartRate.avgBpm } : undefined,
                        steps: formattedHealthData.steps ? { count: formattedHealthData.steps.count } : undefined,
                        water: formattedHealthData.water ? { consumed: WaterConverter.mlToGlasses(formattedHealthData.water.consumed || 0) } : undefined,
                        calories: formattedHealthData.calories ? { 
                            consumed: formattedHealthData.calories.consumed || 0, 
                            burned: formattedHealthData.calories.burned || 0 
                        } : undefined,
                        sleep: formattedHealthData.sleep ? { duration: formattedHealthData.sleep.duration } : undefined,
                        date: formattedHealthData.date,
                        goalcompletions: formattedHealthData.goalcompletions,
                        streak: formattedHealthData.streak
                    };
                    
                    // Remove undefined fields
                    Object.keys(cleanHealthData).forEach(key => {
                        if (cleanHealthData[key] === undefined) {
                            delete cleanHealthData[key];
                        }
                    });
                    
                    // Clean goals data to only include essential fields
                    let cleanGoals = null;
                    if (todayGoals) {
                        cleanGoals = {
                            stepsGoal: todayGoals.stepsGoal,
                            caloriesBurnGoal: todayGoals.caloriesBurnGoal,
                            waterIntakeGoal: todayGoals.waterIntakeGoal,
                            caloriesIntakeGoal: todayGoals.caloriesIntakeGoal,
                            sleepGoal: {
                                hours: todayGoals.sleepGoal?.hours
                            }
                        };
                    }
                    
                    todayData = { healthData: cleanHealthData, goals: cleanGoals };
                } else {
                    // Clean goals data to only include essential fields
                    let cleanGoals = null;
                    if (todayGoals) {
                        cleanGoals = {
                            stepsGoal: todayGoals.stepsGoal,
                            caloriesBurnGoal: todayGoals.caloriesBurnGoal,
                            waterIntakeGoal: todayGoals.waterIntakeGoal,
                            caloriesIntakeGoal: todayGoals.caloriesIntakeGoal,
                            sleepGoal: {
                                hours: todayGoals.sleepGoal?.hours
                            }
                        };
                    }
                    todayData = { healthData: null, goals: cleanGoals };
                }
                const responseData = {
                    todayData: todayData
                };
                console.log(`✅ [${requestId}] STREAK MODE complete: ${results.length} records processed with streak calculation`);
                ResponseHandler.success(res, 'Health data processed with streak calculation', responseData);

            } else {
                // BULK MODE: Skip streak calculation for maximum speed
                console.log(`📊 [${requestId}] BULK MODE: Processing ${sortedData.length} records without streak calculation`);
                
                // Only get existing records (no goals, no previous streak data)
                const existingRecords = await DailyHealthData.find({ userId, date: { $in: allDates } }).lean();
                
                // Fast lookup map
                const recordMap = {};
                existingRecords.forEach(rec => recordMap[rec.date] = rec);

                const bulkOps = [];
                const results = [];

                for (const { date, data } of sortedData) {
                    try {
                        // Simple update/create without streak calculation
                        const existing = recordMap[date];
                        
                        // Prepare update data (no streak fields)
                        const updateData = {
                            userId,
                            date,
                            ...data
                        };

                        // Water conversion only
                        if (data.water) {
                            if (!updateData.water) {
                                updateData.water = {};
                            }
                            if (data.water.consumed !== undefined) {
                                updateData.water.consumed = WaterConverter.glassesToMl(data.water.consumed);
                            }
                        }

                        // Also persist goal completion compatibility flag if present in input (optional)
                        if (data.goalcompletions !== undefined) {
                            updateData.goalcompletions = data.goalcompletions;
                            updateData.goalcomplete = data.goalcompletions;
                        }

                        bulkOps.push({
                            updateOne: {
                                filter: { userId, date },
                                update: { $set: updateData },
                                upsert: true
                            }
                        });

                        results.push({ date, status: existing ? 'updated' : 'created', mode: 'bulk' });

                    } catch (err) {
                        console.error(`❌ [${requestId}] Error processing ${date}:`, err.message);
                    }
                }

                // Execute bulk write
                if (bulkOps.length > 0) {
                    await DailyHealthData.bulkWrite(bulkOps);
                }

                // Always include today's health data and goals (or null)
                const todayDateString = new Date().toISOString().split('T')[0];
                let todayHealth = await DailyHealthData.findOne({ userId, date: todayDateString });
                let todayGoals = null;
                let todayData;
                try {
                    todayGoals = await Goals.findOne({ userId });
                } catch {}
                if (todayHealth) {
                    let formattedHealthData = { ...todayHealth.toObject() };
                    
                    // Filter out unwanted fields and keep only essential data
                    const cleanHealthData = {
                        heartRate: formattedHealthData.heartRate ? { avgBpm: formattedHealthData.heartRate.avgBpm } : undefined,
                        steps: formattedHealthData.steps ? { count: formattedHealthData.steps.count } : undefined,
                        water: formattedHealthData.water ? { consumed: WaterConverter.mlToGlasses(formattedHealthData.water.consumed || 0) } : undefined,
                        calories: formattedHealthData.calories ? { 
                            consumed: formattedHealthData.calories.consumed || 0, 
                            burned: formattedHealthData.calories.burned || 0 
                        } : undefined,
                        sleep: formattedHealthData.sleep ? { duration: formattedHealthData.sleep.duration } : undefined,
                        date: formattedHealthData.date,
                        goalcompletions: formattedHealthData.goalcompletions,
                        streak: formattedHealthData.streak
                    };
                    
                    // Remove undefined fields
                    Object.keys(cleanHealthData).forEach(key => {
                        if (cleanHealthData[key] === undefined) {
                            delete cleanHealthData[key];
                        }
                    });
                    
                    // Clean goals data to only include essential fields
                    let cleanGoals = null;
                    if (todayGoals) {
                        cleanGoals = {
                            stepsGoal: todayGoals.stepsGoal,
                            caloriesBurnGoal: todayGoals.caloriesBurnGoal,
                            waterIntakeGoal: todayGoals.waterIntakeGoal,
                            caloriesIntakeGoal: todayGoals.caloriesIntakeGoal,
                            sleepGoal: {
                                hours: todayGoals.sleepGoal?.hours
                            }
                        };
                    }
                    
                    todayData = { healthData: cleanHealthData, goals: cleanGoals };
                } else {
                    // Clean goals data to only include essential fields
                    let cleanGoals = null;
                    if (todayGoals) {
                        cleanGoals = {
                            stepsGoal: todayGoals.stepsGoal,
                            caloriesBurnGoal: todayGoals.caloriesBurnGoal,
                            waterIntakeGoal: todayGoals.waterIntakeGoal,
                            caloriesIntakeGoal: todayGoals.caloriesIntakeGoal,
                            sleepGoal: {
                                hours: todayGoals.sleepGoal?.hours
                            }
                        };
                    }
                    todayData = { healthData: null, goals: cleanGoals };
                }
                const responseData = {
                    todayData: todayData
                };
                console.log(`✅ [${requestId}] BULK MODE complete: ${results.length} records processed (streaks skipped for performance)`);
                ResponseHandler.success(res, 'Bulk health data processed (streaks skipped for performance)', responseData);
            }

        } catch (error) {
            console.error(`❌ [${requestId}] Bulk update error:`, error);
            ResponseHandler.serverError(res, 'Failed to process bulk health data');
        }
    }


}

module.exports = new HealthController();
