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
const monthlyReportService = require('../services/Health/reports/monthlyReport.service.js')
const weeklyReportService = require('../services/Health/reports/weeklyReport.service.js')
const addSleepService = require('../services/Health/common/addSleep.service');

class HealthController {
  
async monthlyreport(req, res) {
    const requestId = `health-monthlyreport_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    try {
        const userId = req.user._id;
        const { date } = req.body;
        const timezone = req.headers.timezone || "UTC";

        const result = await monthlyReportService({
            userId,
            date,
            timezone,
            requestId
        });

        return ResponseHandler.success(res, "Monthly health report retrieved successfully", result);

    } catch (err) {
        Logger.error("Monthly report FAILED", requestId, { error: err.message });
        return ResponseHandler.serverError(res, "Failed to get monthly report", "HEALTH_MONTHLY_REPORT_FAILED");
    }
}

async weeklyreport(req, res) {
    const requestId = `health-weeklyreport_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
    try {
        const userId = req.user._id;
        const { date } = req.body;
        const timezone = req.headers.timezone || "UTC";

        const result = await weeklyReportService({
            userId,
            date,
            timezone,
            requestId
        });

        return ResponseHandler.success(res, "Weekly health report retrieved successfully", result);

    } catch (err) {
        Logger.error("Weekly report FAILED", requestId, { error: err.message });
        return ResponseHandler.serverError(res, "Failed to get weekly report", "HEALTH_WEEKLY_REPORT_FAILED");
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

        Logger.info('Add sleep START', requestId, { 
            userId, 
            sleepDuration 
        });

        const result = await addSleepService({
            userId,
            sleepDuration,
            timezone,
            requestId
        });

        return ResponseHandler.success(
            res, 
            "Sleep consumption updated successfully", 
            result
        );

    } catch (error) {
        Logger.error("Add sleep FAILED", requestId, { 
            error: error.message 
        });

        // Handle specific validation errors
        if (error.code === 'SLEEP_DURATION_EXCEEDED') {
            return ResponseHandler.error(
                res,
                'Validation failed',
                error.message,
                400,
                'SLEEP_DURATION_EXCEEDED'
            );
        }

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
            const timezone = req.headers.timezone || 'UTC';
            Logger.info('Get water START', requestId, { userId, date });
            
            // Get user goals
            let userGoals = await Goals.findOne({ userId });
            if (!userGoals) {
            const { todayData } = await todayDataService({ userId, timezone, requestId });
            userGoals = todayData.goals; // safe fallback
        }
           
            // Get water data for requested date
            const waterdata = await DailyHealthData.findOne({userId, date: date}).select('water date -_id');
            // Always get TODAY's data for streak and goal completions
            const todayDateString = timeZoneUtil.getCurrentDateInTimezone(timezone);
            const todayHealth = await DailyHealthData.findOne({
                userId: userId,
                date: todayDateString
            }).select('goalcomplete streak -_id');
            
            if(waterdata){
                if (waterdata?.water) {
                    waterdata.water.consumed = WaterConverter.mlToGlasses(waterdata.water.consumed || 0);
                }
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
            Logger.error("failed to get steps data ", requestId, {
            errorName: err.name,
            errorMessage: err.message
        });
         return ResponseHandler.serverError(res, 'Failed to get tesp data', 'HEALTH_GET_STEPS_FAILED');
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
            at: new Date().toISOString() 
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
            at: new Date().toISOString() 
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
