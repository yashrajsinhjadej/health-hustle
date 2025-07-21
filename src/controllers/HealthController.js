// Health Controller - Daily health data management
const DailyHealthData = require('../models/DailyHealthData');

/**
 * HEALTH DATA FORMAT DOCUMENTATION
 * ===============================
 * 
 * 1. UPDATE DAILY HEALTH DATA - PUT /user/health/:date
 * Expected Body Format:
 * {
 *   "steps": {
 *     "count": 8500,
 *     "goal": 10000,
 *     "calories": 340
 *   },
 *   "water": {
 *     "consumed": 2.5,
 *     "goal": 3.0,
 *     "unit": "liters"
 *   },
 *   "bodyMetrics": {
 *     "weight": 75.5,
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
        try {
            const userId = req.user._id;
            const { date } = req.params; // Expected format: YYYY-MM-DD
            const healthData = req.body;

            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid date format. Use YYYY-MM-DD format.'
                });
            }

            // Find existing record or create new one
            let dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: date 
            });

            if (dailyHealth) {
                // Update existing record
                Object.assign(dailyHealth, healthData);
                await dailyHealth.save();
                
                console.log(`📊 Updated health data for user ${userId} on ${date}`);
            } else {
                // Create new record
                dailyHealth = new DailyHealthData({
                    userId: userId,
                    date: date,
                    ...healthData
                });
                await dailyHealth.save();
                
                console.log(`📊 Created new health data for user ${userId} on ${date}`);
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
            const userId = req.user._id;
            const { date } = req.params; // Expected format: YYYY-MM-DD

            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid date format. Use YYYY-MM-DD format.'
                });
            }

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
            const userId = req.user._id;
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

            // Find today's health data
            const dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: today 
            });

            if (!dailyHealth) {
                return res.json({
                    success: true,
                    message: 'No health data found for today',
                    data: null,
                    date: today
                });
            }

            console.log(`📊 Retrieved today's health data for user ${userId}`);

            res.json({
                success: true,
                message: 'Today\'s health data retrieved successfully',
                data: dailyHealth,
                date: today
            });

        } catch (error) {
            console.error('Get today health error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve today\'s health data'
            });
        }
    }

    // Quick update for specific health metrics
    async quickUpdate(req, res) {
        try {
            const userId = req.user._id;
            const today = new Date().toISOString().split('T')[0];
            const { metric, value } = req.body;

            // Validate metric and value
            if (!metric || value === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Metric and value are required'
                });
            }

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
                default:
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid metric type'
                    });
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
            const userId = req.user._id;
            const { health_data } = req.body;

            // Validate health_data array
            if (!health_data || !Array.isArray(health_data)) {
                return res.status(400).json({
                    success: false,
                    error: 'health_data must be an array'
                });
            }

            if (health_data.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'health_data array cannot be empty'
                });
            }

            const results = [];
            const errors = [];

            // Process each day's data
            for (const dayData of health_data) {
                try {
                    const { date, data } = dayData;

                    // Validate date format
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!date || !dateRegex.test(date)) {
                        errors.push({
                            date: date || 'undefined',
                            error: 'Invalid date format. Use YYYY-MM-DD format.'
                        });
                        continue;
                    }

                    // Validate data object
                    if (!data || typeof data !== 'object') {
                        errors.push({
                            date: date,
                            error: 'Data object is required'
                        });
                        continue;
                    }

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
