// Health Controller - Daily health data management
const DailyHealthData = require('../models/DailyHealthData');
const Goals = require('../models/Goals');
const ConnectionHelper = require('../utils/connectionHelper');

/**b6h
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
 * ~
 * 2. QUICK UPDATE - PUT /user/health/quick
 * Expected Body Format:
 * {
 *   "metric": "steps|water|weight|heartRate",
 *   "value": 8500
 * }
 * 
 * 3. BULK UPDATE - PUT /user/health/bulk
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
 * UNITS: Weight in kg, Height in cm, Water in liters, Duration in minutes/hours
 */

class HealthController {
    
    // Update or create daily health data
    async updateDailyHealth(req, res) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
            const { date } = req.params; // Expected format: YYYY-MM-DD
            const healthData = req.body;
            
            console.log(`📊 [${requestId}] Processing - User: ${userId}, Date: ${date}`);
            console.log(`📊 [${requestId}] Health data received:`, healthData);

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

            res.json({
                success: true,
                message: 'Daily health data updated successfully',
                data: dailyHealth
            });

        } catch (error) {
            console.error('Update daily health error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update daily health data'
            });
        }
    }

    // Get specific day health data
    async getDailyHealth(req, res) {
        try {
            // Ensure MongoDB connection for serverless
            await ConnectionHelper.ensureConnection();
            
            const userId = req.user._id;
            const { date } = req.params; // Expected format: YYYY-MM-DD

            // Find health data for specific date
            const dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: date 
            });

            if (!dailyHealth) {
                return res.status(404).json({
                    success: false,
                    message: 'No health data found for this date',
                    data: null
                });
            }

            console.log(`📊 Retrieved health data for user ${userId} on ${date}`);

            res.json({
                success: true,
                message: 'Daily health data retrieved successfully',
                data: dailyHealth
            });

        } catch (error) {
            console.error('Get daily health error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve daily health data'
            });
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

            if (!dailyHealth) {
                return res.json({
                    success: true,
                    message: 'No health data found for today, but goals are ready',
                    data: responseData,
                    date: today
                });
            } 

            console.log(`📊 Retrieved today's health data and goals for user ${userId}`);

            res.json({
                success: true,
                message: 'Today\'s health data and goals retrieved successfully',
                data: responseData,
                date: today
            });

        } catch (error) {
            console.error('Get today health error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve today\'s health data and goals'
            });
        }
    }

    // Quick update for specific health metrics
    async quickUpdate(req, res) {
        try {
            // Ensure MongoDB connection before proceeding
            await ConnectionHelper.ensureConnection();
            
            const userId = req.user._id;
            const today = new Date().toISOString().split('T')[0];
            const { metric, value } = req.body;

            // Find or create today's record
            let dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: today 
            });

            if (!dailyHealth) {
                dailyHealth = new DailyHealthData({
                    userId: userId,
                    date: today
                });
            }

            // Update specific metric based on type
            switch (metric) {
                case 'steps':
                    dailyHealth.steps.count = value;
                    break;
                case 'water':
                    dailyHealth.water.consumed = value;
                    break;
                case 'weight':
                    dailyHealth.bodyMetrics.weight = value;
                    break;
                case 'heartRate':
                    if (!dailyHealth.heartRate.readings) {
                        dailyHealth.heartRate.readings = [];
                    }
                    dailyHealth.heartRate.readings.push({
                        time: new Date().toLocaleTimeString('en-US', { 
                            hour12: false, 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        }),
                        bpm: value,
                        activity: 'manual'
                    });
                    break;
            }

            await dailyHealth.save();

            console.log(`📊 Quick updated ${metric} for user ${userId}`);

            res.json({
                success: true,
                message: `${metric} updated successfully`,
                data: {
                    date: today,
                    metric: metric,
                    value: value,
                    updatedData: dailyHealth
                }
            });

        } catch (error) {
            console.error('Quick update error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update health metric'
            });
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

            // Process each day's data
            for (const dayData of health_data) {
                try {
                    const { date, data } = dayData;

                    // Find existing record or create new one
                    let dailyHealth = await DailyHealthData.findOne({ 
                        userId: userId, 
                        date: date 
                    });

                    if (dailyHealth) {
                        // Update existing record
                        Object.assign(dailyHealth, data);
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

            // Return results with summary
            res.json({
                success: true,
                message: 'Bulk health data processed',
                summary: {
                    totalProcessed: health_data.length,
                    successful: results.length,
                    errors: errors.length
                },
                results: results,
                errors: errors.length > 0 ? errors : undefined
            });

        } catch (error) {
            console.error('Bulk update health data error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to process bulk health data'
            });
        }
    }
}

module.exports = new HealthController();
