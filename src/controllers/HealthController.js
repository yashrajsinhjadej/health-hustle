// Health Controller - Daily health data management
const DailyHealthData = require('../models/DailyHealthData');
const Goals = require('../models/Goals');
const ConnectionHelper = require('../utils/connectionHelper');
const WaterConverter = require('../utils/waterConverter');
const ResponseHandler = require('../utils/ResponseHandler');

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
 *     "readings": [
 *       {
 *         "time": "10:30",
 *         "bpm": 72,
 *         "activity": "resting"
 *       }
 *     ],
 *     "average": 75,
 *     "max": 85,
 *     "min": 65
 *   },
 *   "sleep": {
 *     "duration": 7.5,
 *     "quality": "good",
 *     "bedtime": "23:00",
 *     "wakeup": "06:30"
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

            // Find existing record or create new one
            console.log(`📊 [${requestId}] Looking for existing health record...`);
            let dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: date 
            });

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

            // Format water data for response (ml back to glasses)
            const responseData = { ...dailyHealth.toObject() };
            if (responseData.water && responseData.water.consumed !== undefined) {
                responseData.water.consumed = WaterConverter.mlToGlasses(responseData.water.consumed);
            }
            if (responseData.water && responseData.water.goal !== undefined) {
                responseData.water.goal = WaterConverter.mlToGlasses(responseData.water.goal);
            }

            ResponseHandler.success(res, 'Daily health data updated successfully', responseData);

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

            // Convert ml back to glasses for frontend
            const responseData = { ...dailyHealth.toObject() };
            if (responseData.water && responseData.water.consumed !== undefined) {
                const originalMl = responseData.water.consumed;
                responseData.water.consumed = WaterConverter.mlToGlasses(originalMl);
                console.log(`💧 [${requestId}] Converted water: ${originalMl}ml → ${responseData.water.consumed} glasses`);
            }
            if (responseData.water && responseData.water.goal !== undefined) {
                const originalGoalMl = responseData.water.goal;
                responseData.water.goal = WaterConverter.mlToGlasses(originalGoalMl);
                console.log(`💧 [${requestId}] Converted water goal: ${originalGoalMl}ml → ${responseData.water.goal} glasses`);
            }

            console.log(`📊 [${requestId}] Retrieved health data for user ${userId} on ${date}`);

            ResponseHandler.success(res, 'Daily health data retrieved successfully', responseData);

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
                    activeMinutesGoal: 30,
                    waterIntakeGoal: 8,
                    caloriesIntakeGoal: 2000,
                    sleepGoal: {
                        hours: 8,
                        bedtime: "22:00",
                        wakeupTime: "06:00"
                    }
                });
                
                await userGoals.save();
                console.log(`✅ Default goals created for user ${userId}`);
            }

            // Prepare response data
            const responseData = {
                healthData: dailyHealth,
                goals: userGoals
            };

            // Convert ml back to glasses for frontend if health data exists
            if (dailyHealth && dailyHealth.water) {
                const formattedHealthData = { ...dailyHealth.toObject() };
                if (formattedHealthData.water.consumed !== undefined) {
                    formattedHealthData.water.consumed = WaterConverter.mlToGlasses(formattedHealthData.water.consumed);
                }
                if (formattedHealthData.water.goal !== undefined) {
                    formattedHealthData.water.goal = WaterConverter.mlToGlasses(formattedHealthData.water.goal);
                }
                responseData.healthData = formattedHealthData;
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
                    console.log(`� [${requestId}] Total calories consumed today: ${dailyHealth.calories.consumed}`);
                    break;
                    
                case 'sleep':
                    // SLEEP: Update whole field (replace current value)
                    console.log(`😴 [${requestId}] Updating sleep duration: ${dailyHealth.sleep?.duration || 0} → ${value} hours`);
                    
                    if (!dailyHealth.sleep) {
                        dailyHealth.sleep = {};
                    }
                    dailyHealth.sleep.duration = value;
                    break;
                    
                default:
                    console.log(`❌ [${requestId}] Unknown metric: ${metric}`);
                    return ResponseHandler.error(res, `Unknown metric: ${metric}. Supported metrics: steps, water, sleep`);
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

    // Bulk update health data for multiple dates
    async bulkUpdateHealthData(req, res) {
        try {
            // Ensure MongoDB connection for serverless
            await ConnectionHelper.ensureConnection();
            console.log('✅ HealthController: DB connection verified for bulk update');
            
            const userId = req.user._id;
            const { health_data } = req.body;

            const results = [];
            const errors = [];
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison

            // Process each day's data
            for (const dayData of health_data) {
                try {
                    const { date, data } = dayData;

                    // Additional controller-level validation for future dates
                    const inputDate = new Date(date);
                    inputDate.setHours(0, 0, 0, 0);
                    
                    if (inputDate > today) {
                        console.log(`❌ Bulk update: Rejecting future date ${date} for user ${userId}`);
                        errors.push({
                            date: date,
                            error: `Date ${date} cannot be in the future. Only today's date or past dates are allowed.`
                        });
                        continue; // Skip processing this date
                    }
                    
                    console.log(`✅ Bulk update: Processing valid date ${date} for user ${userId}`);

                    // Simple water conversion for bulk update
                    if (data.water && data.water.consumed !== undefined) {
                        const originalGlasses = data.water.consumed;
                        data.water.consumed = WaterConverter.glassesToMl(originalGlasses);
                        console.log(`💧 Bulk update: Converted water for ${date}: ${originalGlasses} glasses → ${data.water.consumed}ml`);
                    }
                    
                    if (data.water && data.water.goal !== undefined) {
                        const originalGoalGlasses = data.water.goal;
                        data.water.goal = WaterConverter.glassesToMl(originalGoalGlasses);
                        console.log(`💧 Bulk update: Converted water goal for ${date}: ${originalGoalGlasses} glasses → ${data.water.goal}ml`);
                    }

                    // Find existing record or create new one
                    let dailyHealth = await DailyHealthData.findOne({ 
                        userId: userId, 
                        date: date 
                    });

                    if (dailyHealth) {
                        // Update existing record - Selective update to preserve manual data
                        console.log(`🔄 Bulk update: Selectively updating existing record for ${date}`);
                        
                        // Update watch-related fields only
                        if (data.sleep !== undefined) {
                            dailyHealth.sleep = data.sleep;
                            console.log(`😴 Bulk update: Updated sleep for ${date}`);
                        }
                        
                        if (data.heartRate !== undefined) {
                            dailyHealth.heartRate = data.heartRate;
                            console.log(`❤️ Bulk update: Updated heart rate for ${date}`);
                        }
                        
                        if (data.steps !== undefined) {
                            dailyHealth.steps = data.steps;
                            console.log(`👟 Bulk update: Updated steps for ${date}`);
                        }
                        
                        if (data.calories && data.calories.burned !== undefined) {
                            if (!dailyHealth.calories) {
                                dailyHealth.calories = { consumed: 0, burned: 0, entries: [] };
                            }
                            dailyHealth.calories.burned = data.calories.burned;
                            console.log(`🔥 Bulk update: Updated calories burned for ${date}`);
                        }
                        
                        // Preserve existing: water, calories.intake, calories.consumed, meals
                        console.log(`💧 Bulk update: Preserving existing water (${dailyHealth.water?.consumed || 0}ml) and manual data for ${date}`);
                        
                        await dailyHealth.save();
                        
                        results.push({
                            date: date,
                            status: 'updated',
                            recordId: dailyHealth._id
                        });
                    } else {
                        // Create new record
                        dailyHealth = new DailyHealthData({
                            userId: userId,
                            date: date,
                            ...data
                        });
                        await dailyHealth.save();
                        
                        results.push({
                            date: date,
                            status: 'created',
                            recordId: dailyHealth._id
                        });
                    }

                } catch (dayError) {
                    console.error(`Error processing ${dayData.date}:`, dayError);
                    errors.push({
                        date: dayData.date || 'undefined',
                        error: dayError.message
                    });
                }
            }

            console.log(`📊 Bulk processed ${results.length} health records for user ${userId}`);

            // Get today's health data and goals for frontend
            const todayDateString = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            
            // Find today's health data
            const todayHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: todayDateString 
            });

            // Check if user has goals, if not create default goals
            let userGoals = await Goals.findOne({ userId: userId });
            
            if (!userGoals) {
                console.log(`🎯 Creating default goals for new user ${userId} during bulk update`);
                
                // Create default goals for the user
                userGoals = new Goals({
                    userId: userId,
                    stepsGoal: 10000,
                    caloriesBurnGoal: 2000,
                    activeMinutesGoal: 30,
                    waterIntakeGoal: 8,
                    caloriesIntakeGoal: 2000,
                    sleepGoal: {
                        hours: 8,
                        bedtime: "22:00",
                        wakeupTime: "06:00"
                    }
                });
                
                await userGoals.save();
                console.log(`✅ Default goals created for user ${userId} during bulk update`);
            }

            // Prepare today's data for response
            const todayData = {
                healthData: todayHealth,
                goals: userGoals
            };

            // Convert ml back to glasses for frontend if today's health data exists
            if (todayHealth && todayHealth.water) {
                const formattedHealthData = { ...todayHealth.toObject() };
                if (formattedHealthData.water.consumed !== undefined) {
                    formattedHealthData.water.consumed = WaterConverter.mlToGlasses(formattedHealthData.water.consumed);
                }
                if (formattedHealthData.water.goal !== undefined) {
                    formattedHealthData.water.goal = WaterConverter.mlToGlasses(formattedHealthData.water.goal);
                }
                todayData.healthData = formattedHealthData;
            }

            // Return results with summary and today's data
            const responseData = {
                summary: {
                    totalProcessed: health_data.length,
                    successful: results.length,
                    errors: errors.length
                },
                results: results,
                errors: errors.length > 0 ? errors : undefined,
                todayData: todayData
            };

            console.log(`📊 Bulk update complete with today's data for user ${userId}`);

            ResponseHandler.success(res, 'Bulk health data processed with today\'s data', responseData);

        } catch (error) {
            console.error('Bulk update health data error:', error);
            ResponseHandler.serverError(res, 'Failed to process bulk health data');
        }
    }
}

module.exports = new HealthController();
