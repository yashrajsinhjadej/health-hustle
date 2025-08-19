// Health Controller - Daily health data management
const DailyHealthData = require('../models/DailyHealthData');
const Goals = require('../models/Goals');
const ConnectionHelper = require('../utils/connectionHelper');
const WaterConverter = require('../utils/waterConverter');
const ResponseHandler = require('../utils/ResponseHandler');
const goalcounter = require('../utils/goalcounter');

class HealthController {
    // Get specific day health data

    async addwater(req, res) {
        try {
            const waterconsumedinglasses = req.body.water.consumed;
            const userId = req.user._id;
            const todayDate = new Date().toISOString().split('T')[0];

            const waterInMl = WaterConverter.glassesToMl(waterconsumedinglasses);
            let healthdatatoday = await DailyHealthData.findOne({ userId, date: todayDate });

            if (healthdatatoday) {
                healthdatatoday.water.consumed += waterInMl;
                healthdatatoday.water.entries.push({ glasses: waterconsumedinglasses, ml: waterInMl });
                await healthdatatoday.save();
            } else {
                // If no health data for today, create a new record
                healthdatatoday = new DailyHealthData({
                    userId,
                    date: todayDate,
                    water: {
                        consumed: waterInMl,
                        entries: [{ glasses: waterconsumedinglasses, ml: waterInMl }]
                    }
                });
                await healthdatatoday.save();
            }

            // Fetch user goals
            let userGoals = await Goals.findOne({ userId });
            if (!userGoals) {
                userGoals = new Goals({
                    userId,
                    stepsGoal: 10000,
                    caloriesBurnGoal: 2000,
                    waterIntakeGoal: 8,
                    caloriesIntakeGoal: 2000,
                    sleepGoal: { hours: 8 }
                });
                await userGoals.save();
            }

            // Clean/format health data for response
            const responseData = { ...healthdatatoday.toObject() };
            const cleanHealthData = {
                heartRate: responseData.heartRate ? { avgBpm: responseData.heartRate.avgBpm } : undefined,
                steps: responseData.steps ? { count: responseData.steps.count } : undefined,
                water: responseData.water
                    ? {
                        consumed: WaterConverter.mlToGlasses(responseData.water.consumed || 0),
                        entries: (responseData.water.entries || []).map(entry => ({
                            ...entry,
                            glasses: entry.glasses ?? WaterConverter.mlToGlasses(entry.ml ?? entry.amount ?? 0),
                            ml: entry.ml ?? entry.amount ?? 0
                        }))
                    }
                    : undefined,
                calories: responseData.calories ? {
                    consumed: responseData.calories.consumed || 0,
                    burned: responseData.calories.burned || 0
                } : undefined,
                sleep: responseData.sleep ? { duration: responseData.sleep.duration } : undefined,
                date: responseData.date,
                goalcompletions: responseData.goalcompletions,
                streak: responseData.streak
            };
            Object.keys(cleanHealthData).forEach(key => {
                if (cleanHealthData[key] === undefined) {
                    delete cleanHealthData[key];
                }
            });

            // Clean/format goals for response
            const cleanGoals = {
                stepsGoal: userGoals.stepsGoal,
                caloriesBurnGoal: userGoals.caloriesBurnGoal,
                waterIntakeGoal: userGoals.waterIntakeGoal,
                caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                sleepGoal: { hours: userGoals.sleepGoal?.hours }
            };

            // Build todayData response
            const todayData = {
                healthData: cleanHealthData,
                goals: cleanGoals
            };

            return ResponseHandler.success(res, 'Water consumption updated successfully', { todayData });

        } catch (error) {
            console.error('Add water error:', error);
            return ResponseHandler.serverError(res, 'Failed to update water consumption');
        }
    }
    
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

            // Always fetch user goals
            let userGoals = await Goals.findOne({ userId: userId });
            if (!userGoals) {
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

            // Clean/format goals
            const cleanGoals = {
                stepsGoal: userGoals.stepsGoal,
                caloriesBurnGoal: userGoals.caloriesBurnGoal,
                waterIntakeGoal: userGoals.waterIntakeGoal,
                caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                sleepGoal: { hours: userGoals.sleepGoal?.hours }
            };

            let cleanHealthData = null;
            if (dailyHealth) {
                const responseData = { ...dailyHealth.toObject() };
                cleanHealthData = {
                    heartRate: responseData.heartRate ? { avgBpm: responseData.heartRate.avgBpm } : undefined,
                    steps: responseData.steps ? { count: responseData.steps.count } : undefined,
                    water: responseData.water
                        ? {
                            consumed: WaterConverter.mlToGlasses(responseData.water.consumed || 0),
                            entries: (responseData.water.entries || []).map(entry => ({
                                ...entry,
                                glasses: entry.glasses ?? WaterConverter.mlToGlasses(entry.ml ?? entry.amount ?? 0),
                                ml: entry.ml ?? entry.amount ?? 0
                            }))
                        }
                        : undefined,
                    calories: responseData.calories
                        ? {
                            consumed: responseData.calories.consumed || 0,
                            burned: responseData.calories.burned || 0,
                            entries: responseData.calories.entries || []
                        }
                        : undefined,
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
            }

            // Always return both healthData and goals in todayData
            const responseData = {
                todayData: {
                    healthData: cleanHealthData,
                    goals: cleanGoals
                }
            };

            console.log(`📊 [${requestId}] Retrieved health data and goals for user ${userId} on ${date}`);

            ResponseHandler.success(res, 'Daily health data and goals retrieved successfully', responseData);

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

    async addCalories(req, res) {
        try {
            const caloriesConsumed = req.body.calories.consumed;
            const userId = req.user._id;
            const todayDate = new Date().toISOString().split('T')[0];

            let healthdatatoday = await DailyHealthData.findOne({ userId, date: todayDate });

            if (healthdatatoday) {
                if (!healthdatatoday.calories) {
                    healthdatatoday.calories = { consumed: 0, burned: 0, entries: [] };
                }
                healthdatatoday.calories.consumed += caloriesConsumed;
                if (!Array.isArray(healthdatatoday.calories.entries)) {
                    healthdatatoday.calories.entries = [];
                }
                healthdatatoday.calories.entries.push({ consumed: caloriesConsumed, at: new Date() });
                await healthdatatoday.save();
            } else {
                // If no health data for today, create a new record
                healthdatatoday = new DailyHealthData({
                    userId,
                    date: todayDate,
                    calories: {
                        consumed: caloriesConsumed,
                        burned: 0,
                        entries: [{ consumed: caloriesConsumed, at: new Date() }]
                    }
                });
                await healthdatatoday.save();
            }

            // Fetch user goals
            let userGoals = await Goals.findOne({ userId });
            if (!userGoals) {
                userGoals = new Goals({
                    userId,
                    stepsGoal: 10000,
                    caloriesBurnGoal: 2000,
                    waterIntakeGoal: 8,
                    caloriesIntakeGoal: 2000,
                    sleepGoal: { hours: 8 }
                });
                await userGoals.save();
            }

            // Clean/format health data for response
            const responseData = { ...healthdatatoday.toObject() };
            const cleanHealthData = {
                heartRate: responseData.heartRate ? { avgBpm: responseData.heartRate.avgBpm } : undefined,
                steps: responseData.steps ? { count: responseData.steps.count } : undefined,
                water: responseData.water
                    ? {
                    consumed: WaterConverter.mlToGlasses(responseData.water.consumed || 0),
                    entries: (responseData.water.entries || []).map(entry => ({
                        ...entry,
                        glasses: entry.glasses ?? WaterConverter.mlToGlasses(entry.ml ?? entry.amount ?? 0),
                        ml: entry.ml ?? entry.amount ?? 0
                    }))
                }
                : undefined,
                calories: responseData.calories
                    ? {
                    consumed: responseData.calories.consumed || 0,
                    burned: responseData.calories.burned || 0,
                    entries: responseData.calories.entries || []
                }
                : undefined,
                sleep: responseData.sleep ? { duration: responseData.sleep.duration } : undefined,
                date: responseData.date,
                goalcompletions: responseData.goalcompletions,
                streak: responseData.streak
            };
            Object.keys(cleanHealthData).forEach(key => {
                if (cleanHealthData[key] === undefined) {
                    delete cleanHealthData[key];
                }
            });

            // Clean/format goals for response
            const cleanGoals = {
                stepsGoal: userGoals.stepsGoal,
                caloriesBurnGoal: userGoals.caloriesBurnGoal,
                waterIntakeGoal: userGoals.waterIntakeGoal,
                caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                sleepGoal: { hours: userGoals.sleepGoal?.hours }
            };

            // Build todayData response
            const todayData = {
                healthData: cleanHealthData,
                goals: cleanGoals
            };

            return ResponseHandler.success(res, 'Calories consumed updated successfully', { todayData });

        } catch (error) {
            console.error('Add calories error:', error);
            return ResponseHandler.serverError(res, 'Failed to update calories consumed');
        }
    }
}

module.exports = new HealthController();
