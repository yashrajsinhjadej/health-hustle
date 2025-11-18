// Health Controller - Daily health data management
const DailyHealthData = require('../models/DailyHealthData');
const Goals = require('../models/Goals');
const ConnectionHelper = require('../utils/connectionHelper');
const WaterConverter = require('../utils/waterConverter');
const ResponseHandler = require('../utils/ResponseHandler');
const Logger = require('../utils/logger');
const calorieService = require('../services/calorieService');
const timeZoneUtil = require('../utils/timeZone');
const streakModeService = require('../services/Health/bulk/streakMode.service');
const bulkModeService = require('../services/Health/bulk/bulkMode.service');
const todayDataService = require('../services/Health/common/todayData.service');
const sortAndValidate = require("../services/Health/bulk/sortAndValidate.service");
const dailyHealthService = require('../services/Health/common/dailyHealth.service')
const last7DaysService = require('../services/Health/common/last7Days.service')

class HealthController {
    
async monthlyreport(req, res) {

    const requestId = `health-monthlyreport_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        const userId = req.user._id;
        const { date } = req.body;
        const timezone = req.headers.timezone || 'UTC';
        
        // Input validation
        if (!date) {
            Logger.warn('Monthly report missing date', requestId);
            return ResponseHandler.badRequest(res, 'Date is required in request body');
        }
        
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            Logger.warn('Monthly report invalid date format', requestId, { date });
            return ResponseHandler.badRequest(res, 'Invalid date format. Please use YYYY-MM-DD format');
        }
        
        // Calculate month boundaries
        const inputDate = new Date(date + 'T00:00:00Z');
        
        // Check if date is valid
        if (isNaN(inputDate.getTime())) {
            Logger.warn('Monthly report invalid date', requestId, { date });
            return ResponseHandler.badRequest(res, 'Invalid date provided');
        }
        
        const year = inputDate.getUTCFullYear();
        const month = inputDate.getUTCMonth(); // 0-based (0 = January)
        
        // First day of month (e.g., "2025-10-01")
        const monthStartString = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        
        // Last day of month (e.g., "2025-10-31")  
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const monthEndString = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
        
        Logger.info('Monthly report START', requestId, { 
            userId, 
            monthStartString, 
            monthEndString, 
            daysInMonth 
        });
        
        // Get user goals
        Goals.findOne({ userId }).then(async (foundGoals) => {
            let userGoals = foundGoals;
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
                Logger.info('Created default goals', requestId);
            }
            
            // MongoDB Aggregation Query for Monthly Data
            const monthlyData = await DailyHealthData.aggregate([
                {
                    $match: {
                        userId: userId,
                        date: {
                            $gte: monthStartString,
                            $lte: monthEndString
                        }
                    }
                },
                {
                    $sort: { date: 1 }
                },
                {
                    $project: {
                        date: 1,
                        steps: 1,
                        water: 1,
                        calories: 1,
                        sleep: 1,
                        goalcomplete: 1,  // Include goalcomplete field
                        _id: 0
                    }
                }
            ]);
            
            // Always get TODAY's data for streak and goal completions (in user's timezone)
            const todayDateString = timeZoneUtil.getCurrentDateInTimezone(timezone);
            const todayHealth = await DailyHealthData.findOne({
                userId: userId,
                date: todayDateString
            }).select('goalcomplete streak -_id');
            
            // Create complete month breakdown with zero values for missing days
            const dailyBreakdown = [];
            
            // Create a map of existing data for quick lookup
            const dataMap = {};
            monthlyData.forEach(record => {
                dataMap[record.date] = record;
            });
            
            // Generate all days of the month
            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                
                const existingData = dataMap[dateString];
                
                dailyBreakdown.push({
                    date: dateString,
                    // Normalize goalcomplete to boolean for each day
                    goalCompletion: Boolean(existingData?.goalcomplete),  
                    water: {
                        ml: existingData?.water?.consumed || 0,
                        glasses: WaterConverter.mlToGlasses(existingData?.water?.consumed || 0)
                    },
                    calories: {
                        consumed: existingData?.calories?.consumed || 0,
                        burned: existingData?.calories?.burned || 0
                    },
                    steps: {
                        count: existingData?.steps?.count || 0
                    },
                    sleep: {
                        duration: existingData?.sleep?.duration || 0
                    }
                });
            }
            
            // Calculate monthly totals
            const totalWaterIntake = monthlyData.reduce((sum, day) => sum + (day.water?.consumed || 0), 0);
            const totalCaloriesConsumed = monthlyData.reduce((sum, day) => sum + (day.calories?.consumed || 0), 0);
            const totalCaloriesBurned = monthlyData.reduce((sum, day) => sum + (day.calories?.burned || 0), 0);
            const totalSleepDuration = monthlyData.reduce((sum, day) => sum + (day.sleep?.duration || 0), 0);
            const totalSteps = monthlyData.reduce((sum, day) => sum + (day.steps?.count || 0), 0);
            
            Logger.info('Monthly report SUCCESS', requestId, { 
                recordsFound: monthlyData.length,
                totalDays: daysInMonth 
            });
            
            return ResponseHandler.success(res, 'Monthly health report retrieved successfully', {
                // Ensure boolean return for goalcompletions
                goalcompletions: Boolean(todayHealth?.goalcomplete),
                streak: todayHealth?.streak || 0,
                goals: {
                    stepsGoal: userGoals.stepsGoal,
                    caloriesBurnGoal: userGoals.caloriesBurnGoal,
                    waterIntakeGoal: userGoals.waterIntakeGoal,
                    caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                    sleepGoal: { hours: userGoals.sleepGoal?.hours || 8 }
                },
                monthPeriod: {
                    startDate: monthStartString,
                    endDate: monthEndString,
                    month: month + 1,
                    year: year,
                    totalDays: daysInMonth
                },
                monthSummary: {
                    water: {
                        totalGlasses: WaterConverter.mlToGlasses(totalWaterIntake),
                        totalConsumed: totalWaterIntake
                    },
                    calories: {
                        totalConsumed: totalCaloriesConsumed,
                        totalBurned: totalCaloriesBurned
                    },
                    sleep: {
                        totalDuration: totalSleepDuration
                    },
                    steps: {
                        totalCount: totalSteps
                    }
                },
                dailyBreakdown: dailyBreakdown
            });
        }).catch((error) => {
            Logger.error('Monthly report FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res, 'Failed to get monthly report', 'HEALTH_MONTHLY_REPORT_FAILED');
        });
        
    } catch (error) {
        Logger.error('Monthly report FAILED', requestId, { error: error.message, stack: error.stack });
        return ResponseHandler.serverError(res, 'Failed to get monthly report', 'HEALTH_MONTHLY_REPORT_FAILED');
    }
}

async weeklyreport(req, res) {
    const requestId = `health-weeklyreport_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        const userId = req.user._id;
        const { date } = req.body;
        const timezone = req.headers.timezone || 'UTC';
        
        // Input validation
        if (!date) {
            Logger.warn('Weekly report missing date', requestId);
            return ResponseHandler.badRequest(res, 'Date is required in request body');
        }
        
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            Logger.warn('Weekly report invalid date format', requestId, { date });
            return ResponseHandler.badRequest(res, 'Invalid date format. Please use YYYY-MM-DD format');
        }
        
        const inputDate = new Date(date + 'T00:00:00Z'); // Parse as UTC
        
        // Check if date is valid
        if (isNaN(inputDate.getTime())) {
            Logger.warn('Weekly report invalid date', requestId, { date });
            return ResponseHandler.badRequest(res, 'Invalid date provided');
        }
        
        Logger.info('Weekly report START', requestId, { userId, date });
        
        // Day of week (0 = Sunday, 6 = Saturday)
        const dayOfWeek = inputDate.getUTCDay();

        // Find Sunday (week start)
        const weekStart = new Date(inputDate);
        weekStart.setUTCDate(inputDate.getUTCDate() - dayOfWeek);
        weekStart.setUTCHours(0, 0, 0, 0);

        // Find Saturday (week end)
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
        weekEnd.setUTCHours(23, 59, 59, 999);

        // Convert Date objects to YYYY-MM-DD strings for database query
        const weekStartString = weekStart.toISOString().split('T')[0];
        const weekEndString = weekEnd.toISOString().split('T')[0];

        // Get user goals first
        const userGoals = await Goals.findOne({ userId })
            .select({
                _id: 0,
                "sleepGoal.hours": 1,
                stepsGoal: 1,
                caloriesBurnGoal: 1,
                waterIntakeGoal: 1,
                caloriesIntakeGoal: 1,
            })
            .lean();

        // Fetch all 7 days' data using string dates
        const weeklyHealthData = await DailyHealthData.find({
            userId,
            date: { $gte: weekStartString, $lte: weekEndString }
        })
        .select('date water.consumed calories.consumed calories.burned sleep.duration steps.count')
        .sort({ date: 1 })
        .lean();

        // Generate the last 7 dates (weekStart -> weekEnd) and compute each day's weekday name
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const weekDates = [];

        for (let i = 0; i < 7; i++) {
            const currentDate = new Date(weekStart);
            currentDate.setUTCDate(weekStart.getUTCDate() + i);
            const dateString = currentDate.toISOString().split('T')[0];
            // Use dayNames[i] because weekStart is set to Sunday when using calendar week
            const dayName = dayNames[i];
            weekDates.push({ date: dateString, dayName });
        }

        // Create complete daily breakdown with all metrics combined
        const dailyBreakdown = weekDates.map(({ date, dayName }) => {
            const dayData = weeklyHealthData.find(d => d.date === date);
            return {
                date: date,
                dayName: dayName,
                water: {
                    ml: dayData?.water?.consumed || 0,
                    glasses: WaterConverter.mlToGlasses(dayData?.water?.consumed || 0)
                },
                calories: {
                    consumed: dayData?.calories?.consumed || 0,
                    burned: dayData?.calories?.burned || 0
                },
                steps: {
                    count: dayData?.steps?.count || 0,
                    entries: dayData?.steps?.entries || []
                },
                sleep: {
                    duration: dayData?.sleep?.duration || 0,
                    entries: dayData?.sleep?.entries || []
                }
            };
        });

        // Calculate totals (only from existing data)
        const totalWaterIntake = weeklyHealthData.reduce((sum, day) => sum + (day.water?.consumed || 0), 0);
        const totalCaloriesConsumed = weeklyHealthData.reduce((sum, day) => sum + (day.calories?.consumed || 0), 0);
        const totalCaloriesBurned = weeklyHealthData.reduce((sum, day) => sum + (day.calories?.burned || 0), 0);
        const totalSleepDuration = weeklyHealthData.reduce((sum, day) => sum + (day.sleep?.duration || 0), 0);
        const totalSteps = weeklyHealthData.reduce((sum, day) => sum + (day.steps?.count || 0), 0);
        
        // Get current streak from TODAY's data (in user's timezone)
        const todayDateString = timeZoneUtil.getCurrentDateInTimezone(timezone);
        const dailyHealth = await DailyHealthData.findOne({ 
            userId: userId, 
            date: todayDateString
        });
        const streak = dailyHealth?.streak || 0;
        
        Logger.info('Weekly report SUCCESS', requestId, { 
            weekStartString, 
            weekEndString,
            recordsFound: weeklyHealthData.length 
        });
        
        return ResponseHandler.success(res, 'Weekly water report retrieved successfully', {
            weekInfo: {
                "inputDate": date,
                "inputDayName": dayNames[dayOfWeek],
                "weekStartDate": weekStartString,
                "weekEndDate": weekEndString,
                "weekRange": `${weekStartString} to ${weekEndString}`
            },
            userGoals: userGoals,
            "dailyBreakdown": dailyBreakdown,
            "streak": streak,
            "weekSummary": {
                "water": {
                    "totalGlasses": WaterConverter.mlToGlasses(totalWaterIntake),
                    "totalConsumed": totalWaterIntake
                },
                "calories": {
                    "totalConsumed": totalCaloriesConsumed,
                    "totalBurned": totalCaloriesBurned
                },
                "sleep": {
                    "totalDuration": totalSleepDuration
                },
                "steps": {
                    "totalCount": totalSteps
                }
            }
        });

    } catch (error) {
        Logger.error('Weekly report FAILED', requestId, { error: error.message, stack: error.stack });
        return ResponseHandler.serverError(res, 'Failed to get weekly water report', 'HEALTH_WEEKLY_REPORT_FAILED');
    }
}

async estimateCalories(req,res){
        const requestId = `health-estimate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            // req.file.buffer contains the image data in memory
            const imageBuffer = req.file.buffer;
            const mimeType = req.file.mimetype;
        
            Logger.info('Estimate calories START', requestId, { 
                userId: req.user._id,
                imageSize: imageBuffer.length, 
                mimeType 
            });
        
            // Call service to get calorie estimation
            const result = await calorieService.estimateCaloriesFromImage(
              imageBuffer,
              mimeType
            );
        
            Logger.info('Estimate calories SUCCESS', requestId, { 
                estimatedCalories: result.estimatedCalories 
            });
        
            // Image buffer will be garbage collected automatically
            return res.status(200).json({
              success: true,
              message: 'Calorie estimation successful.',
              data: {
                foodDescription: result.foodDescription,
                estimatedCalories: result.estimatedCalories
              }
            });
        }
        catch(error){   
            Logger.error('Estimate calories FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res, 'Failed to estimate calories', 'HEALTH_ESTIMATE_CALORIES_FAILED');
        }
}


async addsleep(req, res) {
    const requestId = `health-sleep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        const { duration } = req.body.sleep;
        const sleepDuration = Number(duration);
        const userId = req.user._id;
        const timezone = req.headers.timezone || 'UTC';

        const todayDate = timeZoneUtil.getCurrentDateInTimezone(timezone);

        Logger.info('Add sleep START', requestId, { 
            userId, 
            sleepDuration, 
            date: todayDate 
        });

        // -------------------------------------------------
        // 🔹 1. UPDATE TODAY'S SLEEP
        // -------------------------------------------------
        let todayHealth = await DailyHealthData.findOne({ userId, date: todayDate });

        if (todayHealth) {
            const currentDuration = todayHealth.sleep?.duration || 0;

            // ❗ 12 hour validation
            if (currentDuration + sleepDuration > 12) {
                Logger.warn('Sleep duration exceeds 12 hours', requestId);
                return ResponseHandler.error(
                    res,
                    'Validation failed',
                    'Sleep duration cannot be greater than 12 hours'
                );
            }

            if (!todayHealth.sleep) todayHealth.sleep = { duration: 0, entries: [] };
            if (!todayHealth.sleep.entries) todayHealth.sleep.entries = [];

            todayHealth.sleep.entries.push({
                duration: sleepDuration,
                at: timeZoneUtil.getCurrentTimeInTimezone(timezone)
            });

            todayHealth.sleep.duration = Number((currentDuration + sleepDuration).toFixed(2));

            await todayHealth.save();
            Logger.info("Sleep updated in today's record", requestId);

        } else {
            // New record for today
            todayHealth = await DailyHealthData.create({
                userId,
                date: todayDate,
                sleep: {
                    duration: sleepDuration,
                    entries: [{
                        duration: sleepDuration,
                        at: timeZoneUtil.getCurrentTimeInTimezone(timezone)
                    }]
                }
            });
            Logger.info("New sleep record created", requestId);
        }

        // -------------------------------------------------
        // 🔹 2. ENSURE USER GOALS EXIST
        // -------------------------------------------------
        let userGoals = await Goals.findOne({ userId });
        if (!userGoals) {
            userGoals = await Goals.create({
                userId,
                stepsGoal: 10000,
                caloriesBurnGoal: 2000,
                waterIntakeGoal: 8,
                caloriesIntakeGoal: 2000,
                sleepGoal: { hours: 8 }
            });
            Logger.info("Default goals created", requestId);
        }

        const cleanGoals = {
            stepsGoal: userGoals.stepsGoal,
            caloriesBurnGoal: userGoals.caloriesBurnGoal,
            waterIntakeGoal: userGoals.waterIntakeGoal,
            caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
            sleepGoal: { hours: userGoals.sleepGoal?.hours || 8 }
        };

        // -------------------------------------------------
        // 🔹 3. PREPARE 7 DAY HISTORY (timezone-correct)
        // -------------------------------------------------

        const todayObj = new Date(todayDate + "T00:00:00Z");
        const sevenDaysAgoObj = new Date(todayObj);
        sevenDaysAgoObj.setDate(todayObj.getDate() - 6);

        const sevenDaysAgoString = sevenDaysAgoObj.toISOString().split("T")[0];

        const last7Days = await DailyHealthData.find({
            userId,
            date: { $gte: sevenDaysAgoString, $lte: todayDate }
        })
        .sort({ date: 1 })
        .select("date sleep goalcomplete streak")
        .lean();

        const map = {};
        last7Days.forEach(d => map[d.date] = d);

        const sleepHistory = [];

        for (let i = 0; i < 7; i++) {
            const d = new Date(sevenDaysAgoObj);
            d.setDate(sevenDaysAgoObj.getDate() + i);

            const dateString = d.toISOString().split("T")[0];
            const record = map[dateString];

            sleepHistory.push({
                date: dateString,
                totalDuration: record?.sleep?.duration || 0,
                entries: record?.sleep?.entries || []
            });
        }

        // -------------------------------------------------
        // 🔹 4. TODAY'S STREAK + COMPLETION (already updated by bulk/streak service)
        // -------------------------------------------------

        const updatedTodayHealth = map[todayDate];

        const result = {
            goalcompletions: updatedTodayHealth?.goalcomplete || false,
            streak: updatedTodayHealth?.streak || 0,
            goals: cleanGoals,
            last7Days: sleepHistory
        };

        Logger.info("Add sleep SUCCESS", requestId);
        return ResponseHandler.success(res, "Sleep consumption updated successfully", result);

    } catch (error) {
        Logger.error("Add sleep FAILED", requestId, { error: error.message });
        return ResponseHandler.serverError(
            res,
            "Failed to update sleep consumption",
            "HEALTH_ADD_SLEEP_FAILED"
        );
    }
}
   
async getwater(req,res){
        const requestId = `health-getwater_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try{
            const userId=req.user._id;
            const date = req.body.date;
            
            Logger.info('Get water START', requestId, { userId, date });
            
            // Get user goals
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
                Logger.info('Created default goals', requestId);
            }
            
            // Get water data for requested date
            const waterdata = await DailyHealthData.findOne({userId, date: date}).select('water date -_id');
            const timezone = req.headers.timezone || 'UTC';
            // Always get TODAY's data for streak and goal completions
            const todayDateString = timeZoneUtil.getCurrentDateInTimezone(timezone);
            const todayHealth = await DailyHealthData.findOne({
                userId: userId,
                date: todayDateString
            }).select('goalcomplete streak -_id');
            
            if(waterdata){
                waterdata.water.consumed = WaterConverter.mlToGlasses(waterdata.water.consumed || 0);
                Logger.info('Get water SUCCESS - Data found', requestId);
                return ResponseHandler.success(res, 'Water data retrieved successfully', {
                    goalcompletions: todayHealth?.goalcomplete || false,
                    streak: todayHealth?.streak || 0,
                    goals: {
                        stepsGoal: userGoals.stepsGoal,
                        caloriesBurnGoal: userGoals.caloriesBurnGoal,
                        waterIntakeGoal: userGoals.waterIntakeGoal,
                        caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                        sleepGoal: {
                            hours: userGoals.sleepGoal?.hours
                        }
                    },
                    water: waterdata.water,
                    date: waterdata.date
                });
            }
            Logger.info('Get water SUCCESS - No data found', requestId);
            return ResponseHandler.success(res,'No water data found for the specified date',{
                goalcompletions: todayHealth?.goalcomplete || false,
                streak: todayHealth?.streak || 0,
                goals: {
                    stepsGoal: userGoals.stepsGoal,
                    caloriesBurnGoal: userGoals.caloriesBurnGoal,
                    waterIntakeGoal: userGoals.waterIntakeGoal,
                    caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                    sleepGoal: {
                        hours: userGoals.sleepGoal?.hours
                    }
                },
                date: date
            });
        }
        catch(error){
            Logger.error('Get water FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res,'Failed to get water data', 'HEALTH_GET_WATER_FAILED');
        }
}


async getsleep(req, res) {
    const requestId = `health-getsleep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
        const userId = req.user._id;
        const timezone = req.headers.timezone || 'UTC';

        const result = await last7DaysService({
            userId,
            timezone,
            requestId,
            field: "sleep"
        });

        return ResponseHandler.success(res, "Sleep data retrieved successfully", result);
    } catch (error) {
          return ResponseHandler.serverError(res, 'Failed to get sleep data', 'HEALTH_GET_STEPS_FAILED');
    }
}


async getsteps(req, res) {
    const requestId = `health-getsteps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
        const userId = req.user._id;
        const timezone = req.headers.timezone || 'UTC';

        const result = await last7DaysService({
            userId,
            timezone,
            requestId,
            field: "steps"
        });

        return ResponseHandler.success(res, "Steps data retrieved successfully", result);
    } catch (error) {
         return ResponseHandler.serverError(res, 'Failed to get sleep data', 'HEALTH_GET_STEPS_FAILED');
    }
}

async getcalories(req, res) {
    const requestId = `health-getcalories_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        const userId = req.user._id;
        const date = req.body.date;
        const timezone = req.headers.timezone || "UTC";

        Logger.info("Get calories START", requestId, { userId, date });

        const todayString = timeZoneUtil.getCurrentDateInTimezone(timezone);

        const today = new Date(todayString);
        today.setHours(0, 0, 0, 0);

        const inputDate = new Date(date);
        inputDate.setHours(0, 0, 0, 0);

        if (inputDate > today) {
            return ResponseHandler.error(
                res,
                "Validation failed",
                `Date ${date} cannot be in the future.`,
                400,
                "HEALTH_FUTURE_DATE_NOT_ALLOWED"
            );
        }

        // -------------------------------------------------
        // 2️⃣ FETCH CALORIES FOR REQUESTED DATE
        // -------------------------------------------------
        const caloriesData = await DailyHealthData.findOne({
            userId,
            date
        })
            .select("calories date")
            .lean();

        // -------------------------------------------------
        // 3️⃣ FETCH TODAY’S STREAK & GOALS USING FORMATTER
        // -------------------------------------------------
        const { todayData } = await todayDataService({
            userId,
            timezone,
            requestId
        });

        // -------------------------------------------------
        // 4️⃣ BUILD CLEAN RESPONSE (consistent format)
        // -------------------------------------------------
        let healthData;

        if (caloriesData) {
            // Only calories for selected date, but add today's streak/completions
            healthData = {
                calories: {
                    consumed: caloriesData.calories?.consumed || 0,
                    burned: caloriesData.calories?.burned || 0,
                    entries: caloriesData.calories?.entries || []
                },
                date: caloriesData.date,
                goalcompletions: todayData.healthData?.goalcompletions || false,
                streak: todayData.healthData?.streak || 0
            };
        } else {
            // No calories for selected date
            healthData = {
                date,
                goalcompletions: todayData.healthData?.goalcompletions || false,
                streak: todayData.healthData?.streak || 0
            };
        }

        return ResponseHandler.success(res, "Calories data retrieved successfully", {
            todayData: {
                healthData,
                goals: todayData.goals
            }
        });

    } catch (error) {
        Logger.error("Get calories FAILED", requestId, {
            error: error.message
        });

        return ResponseHandler.serverError(
            res,
            "Failed to get calories data",
            "HEALTH_GET_CALORIES_FAILED"
        );
    }
}

async addwater(req, res) {
    const requestId = `health-water_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

    try {
        const userId = req.user._id;
        const timezone = req.headers.timezone || "UTC";

        const waterGlasses = req.body.water?.consumed;
        if (typeof waterGlasses !== "number") {
            return ResponseHandler.error(
                res,
                "Validation failed",
                "water.consumed must be a number",
                400,
                "HEALTH_INVALID_WATER"
            );
        }

        const todayDate = timeZoneUtil.getCurrentDateInTimezone(timezone);
        const waterInMl = WaterConverter.glassesToMl(waterGlasses);

        Logger.info("Add water START", requestId, {
            userId,
            waterGlasses,
            todayDate
        });

        // --- Fetch existing record for today ---
        let todayHealth = await DailyHealthData.findOne({ userId, date: todayDate });

        const entry = {
            glasses: waterGlasses,
            ml: waterInMl,
            at: timeZoneUtil.getCurrentTimeInTimezone(timezone)
        };

        // --- Update existing record ---
        if (todayHealth) {
            todayHealth.water.consumed += waterInMl;
            todayHealth.water.entries.push(entry);
            await todayHealth.save();
            Logger.info("Water updated for existing record", requestId);
        } 
        // --- Create new record ---
        else {
            todayHealth = new DailyHealthData({
                userId,
                date: todayDate,
                water: {
                    consumed: waterInMl,
                    entries: [entry]
                }
            });
            await todayHealth.save();
            Logger.info("Water created for new record", requestId);
        }

        // --- Fetch formatted todayData ---
        const { todayData } = await todayDataService({
            userId,
            timezone,
            requestId
        });

        Logger.info("Add water SUCCESS", requestId);
        return ResponseHandler.success(
            res,
            "Water consumption updated successfully",
            { todayData }
        );

    } catch (error) {
        Logger.error("Add water FAILED", requestId, {
            errorMessage: error.message,
            stack: error.stack
        });

        return ResponseHandler.serverError(
            res,
            "Failed to update water consumption",
            "HEALTH_ADD_WATER_FAILED"
        );
    }
}

async getDailyHealth(req, res) {
    const requestId = `health-date_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

    try {
        Logger.info("Get daily health START", requestId, {
            userId: req.user._id,
            requestedDate: req.body.date
        });

        await ConnectionHelper.ensureConnection();

        const userId = req.user._id;
        const date = req.body.date;
        const timezone = req.headers.timezone || "UTC";

        // -------- 1️⃣ Check for future date --------
        const todayString = timeZoneUtil.getCurrentDateInTimezone(timezone);
        const today = new Date(todayString);
        today.setHours(0, 0, 0, 0);

        const inputDate = new Date(date);
        inputDate.setHours(0, 0, 0, 0);

        if (inputDate > today) {
            Logger.warn("Rejecting future date request", requestId, {
                userId,
                requestedDate: date
            });

            return ResponseHandler.error(
                res,
                "Validation failed",
                `Date ${date} cannot be in the future`,
                400,
                "HEALTH_FUTURE_DATE_NOT_ALLOWED"
            );
        }

        // -------- 2️⃣ Use shared service --------
        const result = await dailyHealthService({
            userId,
            date,
            timezone,
            requestId
        });

        Logger.info("Daily health fetched", requestId, { date });

        return ResponseHandler.success(
            res,
            "Daily health data and goals retrieved successfully",
            result
        );

    } catch (err) {
        Logger.error("Get daily health error", requestId, {
            errorName: err.name,
            errorMessage: err.message
        });

        return ResponseHandler.error(
            res,
            "Server error",
            "Failed to retrieve daily health data",
            500,
            "HEALTH_GET_DAILY_FAILED"
        );
    }
}

async getTodayHealth(req, res) {
    const requestId = `health-today_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        Logger.info("Get today health START", requestId, {
            userId: req.user._id
        });

        await ConnectionHelper.ensureConnection();

        const userId = req.user._id;
        const timezone = req.headers["timezone"] || "UTC";

        // ⬇️ Use the shared todayDataService
        const { todayData } = await todayDataService({
            userId,
            timezone,
            requestId
        });

        Logger.info("Today health data fetched successfully", requestId);

        return ResponseHandler.success(
            res,
            "Today's health data retrieved successfully",
            { todayData }
        );

    } catch (error) {
        Logger.error("Get today health error", requestId, {
            errorName: error.name,
            errorMessage: error.message
        });

        return ResponseHandler.error(
            res,
            "Server error",
            "Failed to retrieve today's health data",
            500,
            "HEALTH_TODAY_FAILED"
        );
    }
}

async bulkUpdateHealthData(req, res) {
        const requestId = `health-bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            Logger.info("Bulk update health data START", requestId, {
                userId: req.user._id
            });

            await ConnectionHelper.ensureConnection();

            const userId = req.user._id;
            const timezone = req.headers["timezone"] || "UTC";
            const { health_data } = req.body;

            // 1️⃣ SORT + VALIDATE
            const validation = sortAndValidate(health_data, timezone, requestId);

            if (validation.error) {
                return ResponseHandler.error(
                    res,
                    "Validation failed",
                    validation.message,
                    400,
                    "HEALTH_NO_VALID_DATA"
                );
            }

            const {
                sortedData,
                allDates,
                firstDate,
                isStreakMode,
            } = validation;

            // 2️⃣ SELECT MODE
            let processResults;

            if (isStreakMode) {
                processResults = await streakModeService({
                    sortedData,
                    allDates,
                    firstDate,
                    userId,
                    timezone,
                    requestId
                });
            } else {
                processResults = await bulkModeService({
                    sortedData,
                    allDates,
                    userId,
                    timezone,
                    requestId
                });
            }

            // 3️⃣ ALWAYS FETCH TODAY DATA
            const { todayData } = await todayDataService({
                userId,
                timezone,
                requestId
            });

            // 4️⃣ SEND RESPONSE
            return ResponseHandler.success(
                res,
                isStreakMode
                    ? "Health data processed with streak calculation"
                    : "Bulk health data processed (streaks skipped for performance)",
                { todayData }
            );

        } catch (error) {
            Logger.error("Bulk update error", requestId, {
                errorName: error.name,
                errorMessage: error.message
            });

            return ResponseHandler.error(
                res,
                "Server error",
                "Failed to process bulk health data",
                500,
                "HEALTH_BULK_UPDATE_FAILED"
            );
        }
}

async addCalories(req, res) {
    const requestId = `health-calories_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

    try {
        const userId = req.user._id;
        const timezone = req.headers.timezone || "UTC";

        const caloriesConsumed = req.body.calories?.consumed;
        if (typeof caloriesConsumed !== "number") {
            return ResponseHandler.error(
                res,
                "Validation failed",
                "calories.consumed must be a number",
                400,
                "HEALTH_INVALID_CALORIES"
            );
        }

        const todayDate = timeZoneUtil.getCurrentDateInTimezone(timezone);

        Logger.info("Add calories START", requestId, {
            userId,
            caloriesConsumed,
            todayDate
        });

        // --- Find today's document ---
        let todayHealth = await DailyHealthData.findOne({ userId, date: todayDate });

        const entry = {
            consumed: caloriesConsumed,
            at: timeZoneUtil.getCurrentTimeInTimezone(timezone)
        };

        // --- Update existing ---
        if (todayHealth) {
            if (!todayHealth.calories) {
                todayHealth.calories = { consumed: 0, burned: 0, entries: [] };
            }
            todayHealth.calories.consumed += caloriesConsumed;
            todayHealth.calories.entries.push(entry);

            await todayHealth.save();
            Logger.info("Calories updated (existing)", requestId);
        }
        // --- Create new record ---
        else {
            todayHealth = new DailyHealthData({
                userId,
                date: todayDate,
                calories: {
                    consumed: caloriesConsumed,
                    burned: 0,
                    entries: [entry]
                }
            });

            await todayHealth.save();
            Logger.info("Calories created (new record)", requestId);
        }

        // --- Get formatted unified todayData ---
        const { todayData } = await todayDataService({
            userId,
            timezone,
            requestId
        });

        Logger.info("Add calories SUCCESS", requestId);
        return ResponseHandler.success(
            res,
            "Calories consumed updated successfully",
            { todayData }
        );

    } catch (error) {
        Logger.error("Add calories FAILED", requestId, {
            errorMessage: error.message,
            stack: error.stack
        });

        return ResponseHandler.serverError(
            res,
            "Failed to update calories consumed",
            "HEALTH_ADD_CALORIES_FAILED"
        );
    }
}

}



module.exports = new HealthController();
