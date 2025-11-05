// Health Controller - Daily health data management
const DailyHealthData = require('../models/DailyHealthData');
const Goals = require('../models/Goals');
const ConnectionHelper = require('../utils/connectionHelper');
const WaterConverter = require('../utils/waterConverter');
const ResponseHandler = require('../utils/ResponseHandler');
const goalcounter = require('../utils/goalcounter');
const sleepduration = require('../utils/sleepduration');
const calorieService = require('../services/calorieService');



// CONFIGURABLE GOAL SYSTEM - Easy to modify which goals count for streaks
const STREAK_GOALS = [
    'steps',
    // 'sleep', 
    // 'caloriesBurn',
    // 'water',           // Include water in streak calculation
    // 'caloriesIntake'   // Uncomment to include calorie intake in streaks
];

// Goal calculation helper functions
function calculateAllGoals(data, existingHealthData, goals) {
    const goalResults = {
        steps: data.steps && data.steps.count >= (goals.stepsGoal || 10000),
        sleep: data.sleep && data.sleep.duration >= (goals.sleepGoal?.hours || 8),
        caloriesBurn: data.calories && data.calories.burned >= (goals.caloriesBurnGoal || 2000),
        water: (existingHealthData?.water?.consumed || 0) >= ((goals.waterIntakeGoal || 8) * 200), // Convert glasses to ml
        caloriesIntake: (existingHealthData?.calories?.consumed || 0) >= (goals.caloriesIntakeGoal || 2000)
    };
    
    return goalResults;
}

function calculateStreakCompletion(goalResults, streakGoals = STREAK_GOALS) {
    const completedGoals = streakGoals.filter(goal => goalResults[goal]);
    const totalStreakGoals = streakGoals.length;
    const allStreakGoalsCompleted = completedGoals.length === totalStreakGoals;
    
    return {
        completedGoals: completedGoals,
        totalStreakGoals: totalStreakGoals,
        allCompleted: allStreakGoalsCompleted,
        goalResults: goalResults
    };
}

class HealthController {

    async monthlyreport(req, res) {
        const requestId = `health-monthlyreport_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            const userId = req.user._id;
            const { date } = req.body;
            
            // Calculate month boundaries
            const inputDate = new Date(date);
            const year = inputDate.getFullYear();
            const month = inputDate.getMonth(); // 0-based (0 = January)
            
            // First day of month (e.g., "2025-10-01")
            const monthStartString = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            
            // Last day of month (e.g., "2025-10-31")  
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthEndString = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
            
            Logger.info('Monthly report START', requestId, { 
                userId, 
                monthStartString, 
                monthEndString, 
                daysInMonth 
            });
            
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
            
            // Always get TODAY's data for streak and goal completions
            const todayDateString = new Date().toISOString().split('T')[0];
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
                    goalCompletion: existingData?.goalcomplete || false,  // Add goalCompletion for each day
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
                goalcompletions: todayHealth?.goalcomplete || false,
                streak: todayHealth?.streak || 0,
                goals: {
                    stepsGoal: userGoals.stepsGoal,
                    caloriesBurnGoal: userGoals.caloriesBurnGoal,
                    waterIntakeGoal: userGoals.waterIntakeGoal,
                    caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                    sleepGoal: { hours: userGoals.sleepGoal?.hours }
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
            
        } catch (error) {
            Logger.error('Monthly report FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res, 'Failed to get monthly report', 'HEALTH_MONTHLY_REPORT_FAILED');
        }
    }

    // Get specific day health data
    async weeklyreport(req, res) {
        const requestId = `health-weeklyreport_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try{
            const userId=req.user._id;
            const {date} = req.body;
            
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
            
            const inputDate = new Date(date); // incoming date from client
            
            // Check if date is valid
            if (isNaN(inputDate.getTime())) {
                Logger.warn('Weekly report invalid date', requestId, { date });
                return ResponseHandler.badRequest(res, 'Invalid date provided');
            }
            
            Logger.info('Weekly report START', requestId, { userId, date });
            
            inputDate.setUTCHours(0, 0, 0, 0);

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
            
            // Get current streak from today's data
            const today = new Date();
            const dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: today.toISOString().split('T')[0]
            });
            const streak = dailyHealth ? dailyHealth.streak : 0;
            
            Logger.info('Weekly report SUCCESS', requestId, { 
                weekStartString, 
                weekEndString,
                recordsFound: weeklyHealthData.length 
            });
            
            return ResponseHandler.success(res, 'Weekly water report retrieved successfully', {
                weekInfo:{
                    "inputDate": date,
                    "inputDayName": dayNames[dayOfWeek],
                    "weekStartDate": weekStartString,
                    "weekEndDate": weekEndString,
                    "weekRange": `${weekStartString} to ${weekEndString}`
                },
                userGoals: userGoals,
                "dailyBreakdown": dailyBreakdown,
                "streak": streak,
                "weekSummary":{
                    "water":{
                        "totalGlasses": WaterConverter.mlToGlasses(totalWaterIntake),
                        "totalConsumed": totalWaterIntake
                    },
                    "calories":{
                        "totalConsumed": totalCaloriesConsumed,
                        "totalBurned": totalCaloriesBurned
                    },
                    "sleep":{
                        "totalDuration": totalSleepDuration
                    },
                    "steps":{
                        "totalCount": totalSteps
                    }
                }
            });

        }
        catch(error){
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



    async addsleep(req,res){
        const requestId = `health-sleep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try{
            const { duration } = req.body.sleep;
            // Use duration directly from frontend
            const sleepDuration = Number(duration);
            const userId = req.user._id;
            const todayDate = new Date().toISOString().split('T')[0];

            Logger.info('Add sleep START', requestId, { userId, duration: sleepDuration, date: todayDate });

            let healthdatatoday = await DailyHealthData.findOne({ userId, date: todayDate });

            if(healthdatatoday){
                // Ensure sleep duration is a valid number, default to 0 if undefined/null
                const currentDuration = healthdatatoday.sleep?.duration || 0;
                if(currentDuration + sleepDuration > 12){
                    Logger.warn('Sleep duration exceeds 12 hours', requestId, { currentDuration, newDuration: sleepDuration });
                    return ResponseHandler.error(res, 'Validation failed', 'Sleep duration cannot be greater than 12 hours');
                }
                if (!healthdatatoday.sleep) {
                    healthdatatoday.sleep = { duration: 0, entries: [] };
                }
                if (!healthdatatoday.sleep.entries) {
                    healthdatatoday.sleep.entries = [];
                }
                healthdatatoday.sleep.entries.push({        
                    duration: sleepDuration,
                    at: new Date()
                });
                healthdatatoday.sleep.duration = Number((currentDuration + sleepDuration).toFixed(2));
                await healthdatatoday.save();
                Logger.info('Sleep updated in existing health data', requestId);
            }
            else{
                healthdatatoday = new DailyHealthData({
                    userId,
                    date: todayDate,
                    sleep: {
                        duration: sleepDuration,
                        entries: [{
                            duration: sleepDuration,
                            at: new Date()
                        }]
                    }
                });
                await healthdatatoday.save();
                Logger.info('Created new health data with sleep', requestId);
            }

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

            // Build last 7 days array (today and previous 6 days) and fill missing days with zeros
            const today = new Date();
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Include today => previous 6 days
            const sevenDaysAgoString = sevenDaysAgo.toISOString().split('T')[0];

            const last7DaysData = await DailyHealthData.find({
                userId,
                date: { $gte: sevenDaysAgoString, $lte: todayDate }
            }).sort({ date: 1 }).select('date sleep').lean();

            const dataByDate = {};
            last7DaysData.forEach(d => { dataByDate[d.date] = d; });

            const sleepHistory = [];
            for (let i = 0; i < 7; i++) {
                const current = new Date(sevenDaysAgo);
                current.setDate(sevenDaysAgo.getDate() + i);
                const dateString = current.toISOString().split('T')[0];
                const dayData = dataByDate[dateString];

                sleepHistory.push({
                    date: dateString,
                    totalDuration: dayData?.sleep?.duration || 0,
                    entries: dayData?.sleep?.entries || []
                });
            }

            // Get today's updated health data for goals and streak
            const updatedTodayData = await DailyHealthData.findOne({ userId, date: todayDate });
            
            Logger.info('Add sleep SUCCESS', requestId);
            return ResponseHandler.success(res, 'Sleep consumption updated successfully', { 
                goalcompletions: updatedTodayData.goalcomplete,
                streak: updatedTodayData.streak,
                goals: {
                    stepsGoal: userGoals.stepsGoal,
                    caloriesBurnGoal: userGoals.caloriesBurnGoal,
                    waterIntakeGoal: userGoals.waterIntakeGoal,
                    caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                    sleepGoal: {
                        hours: userGoals.sleepGoal?.hours
                    }
                },
                last7Days: sleepHistory
            });
        }
        catch(error){
            Logger.error('Add sleep FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res, 'Failed to update sleep consumption', 'HEALTH_ADD_SLEEP_FAILED');
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
            
            // Always get TODAY's data for streak and goal completions
            const todayDateString = new Date().toISOString().split('T')[0];
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

     async getsleep(req,res){
        const requestId = `health-getsleep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try{
            const userId=req.user._id;
            const todayDate = new Date().toISOString().split('T')[0];
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Include today, so -6 days
            const sevenDaysAgoString = sevenDaysAgo.toISOString().split('T')[0];
            
            Logger.info('Get sleep START', requestId, { userId, dateRange: `${sevenDaysAgoString} to ${todayDate}` });
            
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

            const last7DaysData = await DailyHealthData.find({
                userId,
                date: { $gte: sevenDaysAgoString, $lte: todayDate }
            }).sort({ date: 1 }).select('date sleep goalcomplete streak').lean();

            // Build a 7-day array (sevenDaysAgo -> today) and fill missing days with zeros
            const sleepHistory = [];
            const dataByDate = {};
            last7DaysData.forEach(d => { dataByDate[d.date] = d; });

            for (let i = 0; i < 7; i++) {
                const current = new Date(sevenDaysAgo);
                current.setDate(sevenDaysAgo.getDate() + i);
                const dateString = current.toISOString().split('T')[0];
                const dayData = dataByDate[dateString];

                sleepHistory.push({
                    date: dateString,
                    totalDuration: dayData?.sleep?.duration || 0,
                    entries: dayData?.sleep?.entries || []
                });
            }

            // Get today's health data for goals and streak (from the constructed array)
            const todayHealthData = sleepHistory.find(d => d.date === todayDate) || { totalDuration: 0, entries: [] };
            
            Logger.info('Get sleep SUCCESS', requestId);
            return ResponseHandler.success(res, 'Sleep data retrieved successfully', {
                goalcompletions: todayHealthData?.goalcomplete,
                streak: todayHealthData?.streak,
                goals: {
                    stepsGoal: userGoals.stepsGoal,
                    caloriesBurnGoal: userGoals.caloriesBurnGoal,
                    waterIntakeGoal: userGoals.waterIntakeGoal,
                    caloriesIntakeGoal: userGoals.caloriesIntakeGoal,
                    sleepGoal: {
                        hours: userGoals.sleepGoal?.hours
                    }
                },
                last7Days: sleepHistory
            });
        }
        catch(error){
            Logger.error('Get sleep FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res,'Failed to get sleep data', 'HEALTH_GET_SLEEP_FAILED');
        }
    }

    async getsteps(req,res){
        const requestId = `health-getsteps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try{
            const userId=req.user._id;
            const todayDate = new Date().toISOString().split('T')[0];
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Include today, so -6 days
            const sevenDaysAgoString = sevenDaysAgo.toISOString().split('T')[0];
            
            Logger.info('Get steps START', requestId, { userId, dateRange: `${sevenDaysAgoString} to ${todayDate}` });
            
            const last7DaysData = await DailyHealthData.find({
                userId,
                date: { $gte: sevenDaysAgoString, $lte: todayDate }
            }).sort({ date: 1 }).select('date steps').lean();
    
            // Helper function to calculate step estimates
            const calculateStepEstimates = (steps) => {
                if (!steps || steps === 0) {
                    return {
                        estimatedCaloriesBurned: 0,
                        estimatedWalkingTimeMinutes: 0,
                        estimatedDistanceKm: 0
                    };
                }
                
                // Standard estimates (can be customized per user later)
                const CALORIES_PER_STEP = 0.04; // Average: 40 calories per 1000 steps
                const STEPS_PER_MINUTE = 100; // Average walking pace: 100 steps per minute
                const STEPS_PER_KM = 1250; // Average: 1250 steps = 1 km (0.8m per step)
                
                return {
                    estimatedCaloriesBurned: Math.round(steps * CALORIES_PER_STEP),
                    estimatedWalkingTimeMinutes: Math.round(steps / STEPS_PER_MINUTE),
                    estimatedDistanceKm: Math.round((steps / STEPS_PER_KM) * 100) / 100 // Round to 2 decimal places
                };
            };
    
            // Build last 7 days array (sevenDaysAgo -> today) and ensure zeros for missing days
            const dataByDate = {};
            last7DaysData.forEach(d => { dataByDate[d.date] = d; });

            const stepsHistory = [];
            for (let i = 0; i < 7; i++) {
                const current = new Date(sevenDaysAgo);
                current.setDate(sevenDaysAgo.getDate() + i);
                const dateString = current.toISOString().split('T')[0];
                const dayData = dataByDate[dateString];

                const totalSteps = dayData?.steps?.count || 0;
                const estimates = calculateStepEstimates(totalSteps);

                stepsHistory.push({
                    date: dateString,
                    totalSteps: totalSteps,
                    entries: dayData?.steps?.entries || [],
                    estimates: estimates
                });
            }
            
            Logger.info('Get steps SUCCESS', requestId);
            return ResponseHandler.success(res, 'Steps data retrieved successfully', {
                last7Days: stepsHistory
            });
        }
        catch(error){
            Logger.error('Get steps FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res,'Failed to get steps data', 'HEALTH_GET_STEPS_FAILED');
        }
    }

    async getcalories(req,res){
        const requestId = `health-getcalories_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try{
            const userId=req.user._id;
            const date = req.body.date;
            
            Logger.info('Get calories START', requestId, { userId, date });
            
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
            
            // Get calories data for requested date
            const caloriesdata = await DailyHealthData.findOne({userId, date: date}).select('calories date -_id');
            
            // Always get TODAY's data for streak and goal completions
            const todayDateString = new Date().toISOString().split('T')[0];
            const todayHealth = await DailyHealthData.findOne({
                userId: userId,
                date: todayDateString
            }).select('goalcomplete streak -_id');
            
            if(caloriesdata){
                Logger.info('Get calories SUCCESS - Data found', requestId);
                return ResponseHandler.success(res, 'Calories data retrieved successfully', {
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
                    calories: caloriesdata.calories,
                    date: caloriesdata.date
                });
            }
            Logger.info('Get calories SUCCESS - No data found', requestId);
            return ResponseHandler.success(res,'No calories data found for the specified date',{
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
            Logger.error('Get calories FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res,'Failed to get calories data', 'HEALTH_GET_CALORIES_FAILED');
        }   
    }

    async addwater(req, res) {
        const requestId = `health-water_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            const waterconsumedinglasses = req.body.water.consumed;
            const userId = req.user._id;
            const todayDate = new Date().toISOString().split('T')[0];

            Logger.info('Add water START', requestId, { 
                userId, 
                waterGlasses: waterconsumedinglasses, 
                date: todayDate 
            });

            const waterInMl = WaterConverter.glassesToMl(waterconsumedinglasses);
            let healthdatatoday = await DailyHealthData.findOne({ userId, date: todayDate });

            if (healthdatatoday) {
                healthdatatoday.water.consumed += waterInMl;
                healthdatatoday.water.entries.push({ 
                    glasses: waterconsumedinglasses, 
                    ml: waterInMl,
                    at: new Date()
                });
                await healthdatatoday.save();
                Logger.info('Water updated in existing health data', requestId);
            } else {
                // If no health data for today, create a new record
                healthdatatoday = new DailyHealthData({
                    userId,
                    date: todayDate,
                    water: {
                        consumed: waterInMl,
                        entries: [{ 
                            glasses: waterconsumedinglasses, 
                            ml: waterInMl,
                            at: new Date()
                        }]
                    }
                });
                await healthdatatoday.save();
                Logger.info('Created new health data with water', requestId);
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
                Logger.info('Created default goals', requestId);
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
                    burned: responseData.calories.burned || 0,
                    entries: responseData.calories.entries || []
                } : undefined,
                sleep: responseData.sleep ? { 
                    duration: responseData.sleep.duration,
                    entries: responseData.sleep.entries || []
                } : undefined,
                date: responseData.date,
                goalcompletions: responseData.goalcomplete,  // Map DB field to API response for frontend UI logic
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

            Logger.info('Add water SUCCESS', requestId);
            return ResponseHandler.success(res, 'Water consumption updated successfully', { todayData });

        } catch (error) {
            Logger.error('Add water FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res, 'Failed to update water consumption', 'HEALTH_ADD_WATER_FAILED');
        }
    }
    
    async getDailyHealth(req, res) {
        const requestId = `health-date_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            Logger.info('Get daily health START', requestId, { 
                userId: req.user._id,
                requestedDate: req.body.date,
                ip: req.ip || req.connection.remoteAddress
            });
            
            // Ensure MongoDB connection for serverless
            await ConnectionHelper.ensureConnection();
            
            const userId = req.user._id;
            const date = req.body.date;

            // Additional controller-level validation for future dates
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const inputDate = new Date(date);
            inputDate.setHours(0, 0, 0, 0);
            
            if (inputDate > today) {
                Logger.warn('Rejecting future date request', requestId, { 
                    userId,
                    requestedDate: date 
                });
                return ResponseHandler.error(
                    res, 
                    'Validation failed',
                    `Date ${date} cannot be in the future. Only today's date or past dates are allowed.`, 
                    400,
                    'HEALTH_FUTURE_DATE_NOT_ALLOWED'
                );
            }

            Logger.info('Fetching health data for date', requestId, { 
                userId,
                date 
            });

            // Find health data for specific date
            const dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: date 
            });

            // Always get TODAY's data for streak and goal completions
            const todayDateString = new Date().toISOString().split('T')[0];
            const todayHealth = await DailyHealthData.findOne({
                userId: userId,
                date: todayDateString
            });

            // Always fetch user goals
            let userGoals = await Goals.findOne({ userId: userId });
            if (!userGoals) {
                Logger.info('Creating default goals for user', requestId, { userId });
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
                    sleep: responseData.sleep ? { 
                        duration: responseData.sleep.duration,
                        entries: responseData.sleep.entries || []
                    } : undefined,
                    date: responseData.date
                };
                // Remove undefined fields
                Object.keys(cleanHealthData).forEach(key => {
                    if (cleanHealthData[key] === undefined) {
                        delete cleanHealthData[key];
                    }
                });
            }

            // Always add TODAY's streak and goal completions, regardless of whether data exists for requested date
            if (cleanHealthData) {
                cleanHealthData.goalcompletions = todayHealth?.goalcomplete || false;
                cleanHealthData.streak = todayHealth?.streak || 0;
            } else {
                // No data for requested date, but still send today's streak and goal completions
                cleanHealthData = {
                    date: date,
                    goalcompletions: todayHealth?.goalcomplete || false,
                    streak: todayHealth?.streak || 0
                };
            }

            // Always return both healthData and goals in todayData
            const responseData = {
                todayData: {
                    healthData: cleanHealthData,
                    goals: cleanGoals
                }
            };

            Logger.info('Daily health data retrieved successfully', requestId, { 
                userId,
                date,
                hasData: !!dailyHealth 
            });

            ResponseHandler.success(res, 'Daily health data and goals retrieved successfully', responseData);

        } catch (error) {
            Logger.error('Get daily health error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            ResponseHandler.error(
                res, 
                'Server error', 
                'Failed to retrieve daily health data', 
                500,
                'HEALTH_GET_DAILY_FAILED'
            );
        }
    }

    // Get today's health data (convenience endpoint)
    async getTodayHealth(req, res) {
        const requestId = `health-today_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        try {
            Logger.info('Get today health START', requestId, { 
                userId: req.user._id 
            });
            
            // Ensure MongoDB connection before proceeding
            await ConnectionHelper.ensureConnection();
            
            const userId = req.user._id;
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            
            Logger.info('Fetching today health data', requestId, { 
                userId,
                date: today 
            });

            // Find today's health data
            const dailyHealth = await DailyHealthData.findOne({ 
                userId: userId, 
                date: today 
            });

            // Check if user has goals, if not create default goals
            let userGoals = await Goals.findOne({ userId: userId });
            
            if (!userGoals) {
                Logger.info('Creating default goals for new user', requestId, { userId });
                
                // Create default goals for the user
                userGoals = new Goals({
                    userId: userId,
                    stepsGoal: 10000,
                    caloriesBurnGoal: 2000,
                    waterIntakeGoal: 8,
                    caloriesIntakeGoal: 2000,
                    sleepGoal: {
                        hours: 8
                    }
                });
                
                await userGoals.save();
                Logger.info('Default goals created successfully', requestId, { userId });
            }

            // Prepare response data
            let todayData;
            
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

            // Convert ml back to glasses for frontend if health data exists
            if (dailyHealth) {
                const formattedHealthData = { ...dailyHealth.toObject() };
                
                // Filter out unwanted fields and keep only essential data
                const cleanHealthData = {
                    heartRate: formattedHealthData.heartRate ? { avgBpm: formattedHealthData.heartRate.avgBpm } : undefined,
                    steps: formattedHealthData.steps ? { count: formattedHealthData.steps.count } : undefined,
                    water: formattedHealthData.water ? { 
                        consumed: WaterConverter.mlToGlasses(formattedHealthData.water.consumed || 0),
                        entries: formattedHealthData.water.entries || []
                    } : undefined,
                    calories: formattedHealthData.calories ? { 
                        consumed: formattedHealthData.calories.consumed || 0, 
                        burned: formattedHealthData.calories.burned || 0,
                        entries: formattedHealthData.calories.entries || []
                    } : undefined,
                    sleep: formattedHealthData.sleep ? { 
                        duration: formattedHealthData.sleep.duration,
                        entries: formattedHealthData.sleep.entries || []
                    } : undefined,
                    date: formattedHealthData.date,
                    goalcompletions: formattedHealthData.goalcomplete,
                    streak: formattedHealthData.streak
                };
                
                // Remove undefined fields
                Object.keys(cleanHealthData).forEach(key => {
                    if (cleanHealthData[key] === undefined) {
                        delete cleanHealthData[key];
                    }
                });
                
                todayData = { healthData: cleanHealthData, goals: cleanGoals };
            } else {
                todayData = { healthData: null, goals: cleanGoals };
            }
            
            const responseData = {
                todayData: todayData
            };

            if (!dailyHealth) {
                Logger.info('No health data found for today, returning goals only', requestId);
                return ResponseHandler.success(res, 'No health data found for today, but goals are ready', responseData);
            } 

            Logger.info('Today health data retrieved successfully', requestId, { 
                hasHealthData: !!dailyHealth,
                hasGoals: !!userGoals 
            });

            ResponseHandler.success(res, 'Today\'s health data and goals retrieved successfully', responseData);

        } catch (error) {
            Logger.error('Get today health error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            ResponseHandler.error(
                res, 
                'Server error', 
                'Failed to retrieve today\'s health data and goals', 
                500,
                'HEALTH_TODAY_FAILED'
            );
        }
    }

    // Bulk update health data for multiple dates - ULTRA OPTIMIZED VERSION
    async bulkUpdateHealthData(req, res) {
        const requestId = `health-bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            Logger.info('Bulk update health data START', requestId, { 
                userId: req.user._id 
            });
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
                Logger.warn('No valid data to process', requestId);
                return ResponseHandler.error(
                    res, 
                    'Validation failed', 
                    'No valid data to process', 
                    400,
                    'HEALTH_NO_VALID_DATA'
                );
            }

            const allDates = sortedData.map(d => d.date);
            const firstDate = sortedData[0].date;

            Logger.info('Processing bulk records', requestId, { 
                totalRecords: sortedData.length,
                dateRange: `${sortedData[0].date} to ${sortedData[sortedData.length - 1].date}`
            });

            // CONDITIONAL STREAK STRATEGY: Only calculate streaks for ≤2 days
            const isStreakMode = sortedData.length <= 2;
            const isBulkMode = sortedData.length > 2;

            Logger.info('Bulk update mode determined', requestId, { 
                mode: isStreakMode ? 'STREAK' : 'BULK',
                recordCount: sortedData.length 
            });

            if (isStreakMode) {
                // STREAK MODE: Calculate streaks for 1-2 days
                Logger.info('STREAK MODE: Processing with streak calculation', requestId, { 
                    recordCount: sortedData.length 
                });
                
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
                let prevGoalCompleted = prevRecord ? prevRecord.goalcomplete : false;

                const bulkOps = [];
                const results = [];

                for (const { date, data } of sortedData) {
                    try {
                        // Get existing health data for this date (for additive fields reference)
                        const existing = recordMap[date];
                        
                        // IMPORTANT: Make sleep additive (do not overwrite via bulk)
                        // If incoming payload contains sleep, ignore it for persistence and goal calc input here.
                        const sanitizedData = { ...data };
                        if (sanitizedData.sleep !== undefined) {
                            delete sanitizedData.sleep;
                        }
                        
                        // Calculate all possible goals using the configurable system
                        const allGoalResults = calculateAllGoals(sanitizedData, existing, goals);
                        const streakResults = calculateStreakCompletion(allGoalResults, STREAK_GOALS);
                        
                        // Extract individual goal completion status for logging
                        const { goalResults } = streakResults;
                        const totalGoalsCompleted = streakResults.completedGoals.length;
                        const goalcompletions = streakResults.allCompleted;
                        
                        Logger.info('Goals calculated for date', requestId, {
                            date,
                            steps: goalResults.steps ? 'completed' : 'not completed',
                            sleep: goalResults.sleep ? 'completed' : 'not completed',
                            caloriesBurn: goalResults.caloriesBurn ? 'completed' : 'not completed',
                            water: goalResults.water ? 'completed' : 'not completed',
                            caloriesIntake: goalResults.caloriesIntake ? 'completed' : 'not completed',
                            completedCount: `${totalGoalsCompleted}/${streakResults.totalStreakGoals}`
                        });
                
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
                        Logger.error('Streak increment error', requestId, { 
                            date,
                            expected: prevStreak + 1,
                            got: streak 
                        });
                    }
                } else if (!goalcompletions && prevGoalCompleted) {
                    // If today doesn't complete goals but yesterday did, streak should maintain yesterday's value
                    if (streak !== prevStreak) {
                        Logger.error('Streak maintenance error', requestId, { 
                            date,
                            expected: prevStreak,
                            got: streak 
                        });
                    }
                } else if (goalcompletions && !prevGoalCompleted) {
                    // If today completes goals but yesterday didn't, streak should start at 1
                    if (streak !== 1) {
                        Logger.error('New streak start error', requestId, { 
                            date,
                            expected: 1,
                            got: streak 
                        });
                    }
                } else if (!goalcompletions && !prevGoalCompleted) {
                    // If today doesn't complete goals and yesterday didn't, streak should be 0
                    if (streak !== 0) {
                        Logger.error('No streak error', requestId, { 
                            date,
                            expected: 0,
                            got: streak 
                        });
                    }
                }

                        // Prepare update data with streak
                        let updateData = {
                            userId,
                            date,
                            streak,
                            goalcomplete: goalcompletions
                        };

                        // Process each field individually, excluding additive fields
                        if (data.steps) {
                            updateData.steps = data.steps;
                        }
                        if (data.sleep) {
                            updateData.sleep = data.sleep;
                        }
                        if (data.heartRate) {
                            updateData.heartRate = data.heartRate;
                        }
                        
                        // Handle calories - ONLY calories.burned, NOT calories.consumed
                        if (data.calories) {
                            updateData.calories = {};
                            if (data.calories.burned !== undefined) {
                                updateData.calories.burned = data.calories.burned;
                            }
                            // If no valid calories fields, don't include calories
                            if (Object.keys(updateData.calories).length === 0) {
                                delete updateData.calories;
                            }
                        }
                        
                        // Handle water - exclude consumed, allow other fields if any
                        if (data.water) {
                            updateData.water = {};
                            // Only include non-consumed water fields if they exist
                            Object.keys(data.water).forEach(key => {
                                if (key !== 'consumed') {
                                    updateData.water[key] = data.water[key];
                                }
                            });
                            // If no non-consumed fields, don't include water at all
                            if (Object.keys(updateData.water).length === 0) {
                                delete updateData.water;
                            }
                        }

                      
                        

                        // Build granular $set update so we don't overwrite additive fields like calories.consumed or water.consumed
                        const setDoc = {
                            userId,
                            date,
                            streak: updateData.streak,
                            goalcomplete: updateData.goalcomplete
                        };

                        if (updateData.steps) {
                            if (updateData.steps.count !== undefined) setDoc['steps.count'] = updateData.steps.count;
                        }
                        if (updateData.sleep) {
                            if (updateData.sleep.duration !== undefined) setDoc['sleep.duration'] = updateData.sleep.duration;
                        }
                        if (updateData.heartRate) {
                            if (updateData.heartRate.avgBpm !== undefined) setDoc['heartRate.avgBpm'] = updateData.heartRate.avgBpm;
                        }
                        // Only set burned calories; preserve existing consumed
                        if (updateData.calories && updateData.calories.burned !== undefined) {
                            setDoc['calories.burned'] = updateData.calories.burned;
                        }

                        // (We intentionally skip water & calories consumed here)

                        // Build $setOnInsert ensuring we do NOT duplicate a field already in $set (Mongo conflict code 40)
                        const setOnInsertDoc = {
                            'calories.consumed': 0,
                            'calories.entries': [],
                            'water.consumed': 0,
                            'water.entries': []
                        };
                        // Only seed burned on insert if we did NOT already include it in $set
                        if (setDoc['calories.burned'] === undefined) {
                            setOnInsertDoc['calories.burned'] = 0;
                        }

                        bulkOps.push({
                            updateOne: {
                                filter: { userId, date },
                                update: { $set: setDoc, $setOnInsert: setOnInsertDoc },
                                upsert: true
                            }
                        });

                        // Update tracking
                        prevStreak = streak;
                        prevGoalCompleted = goalcompletions;
                
                        const streakStatus = goalcompletions ? (prevGoalCompleted ? 'INCREMENTED' : 'NEW_STREAK') : (prevGoalCompleted ? 'MAINTAINED' : 'NO_STREAK');
                        Logger.info('Day processed in STREAK MODE', requestId, {
                            date,
                            goalsCompleted: `${totalGoalsCompleted}/${streakResults.totalStreakGoals}`,
                            completed: goalcompletions,
                            streak: `${prevStreak} → ${streak}`,
                            status: streakStatus
                        });
                        results.push({ 
                            date, 
                            status: existing ? 'updated' : 'created', 
                            streak, 
                            mode: 'streak',
                            goalsCompleted: {
                                steps: goalResults.steps,
                                sleep: goalResults.sleep,
                                caloriesBurn: goalResults.caloriesBurn,
                                water: goalResults.water,
                                caloriesIntake: goalResults.caloriesIntake,
                                streakGoals: STREAK_GOALS,
                                completedCount: totalGoalsCompleted,
                                totalStreakGoals: streakResults.totalStreakGoals,
                                allCompleted: goalcompletions
                            }
                        });

                    } catch (err) {
                        Logger.error('Error processing date in STREAK MODE', requestId, { 
                            date,
                            errorMessage: err.message 
                        });
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
                        water: formattedHealthData.water ? { 
                            consumed: WaterConverter.mlToGlasses(formattedHealthData.water.consumed || 0),
                            entries: formattedHealthData.water.entries || []
                        } : undefined,
                        calories: formattedHealthData.calories ? { 
                            consumed: formattedHealthData.calories.consumed || 0, 
                            burned: formattedHealthData.calories.burned || 0,
                            entries: formattedHealthData.calories.entries || []
                        } : undefined,
                        sleep: formattedHealthData.sleep ? { 
                            duration: formattedHealthData.sleep.duration,
                            entries: formattedHealthData.sleep.entries || []
                        } : undefined,
                        date: formattedHealthData.date,
                        goalcompletions: formattedHealthData.goalcomplete  ,  // Map DB field to API response
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
                Logger.info('STREAK MODE complete', requestId, { 
                    recordsProcessed: results.length 
                });
                ResponseHandler.success(res, 'Health data processed with streak calculation', responseData);

            } else {
                // BULK MODE: Skip streak calculation for maximum speed
                Logger.info('BULK MODE: Processing without streak calculation', requestId, { 
                    recordCount: sortedData.length 
                });
                
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
                        
                        // Prepare update data - exclude additive fields completely
                        let updateData = {
                            userId,
                            date
                        };

                        // Process each field individually, excluding additive fields
                        if (data.steps) {
                            updateData.steps = data.steps;
                        }
                        // Sleep is additive and managed outside bulk. Ignore any incoming sleep in bulk.
                        // if (data.sleep) { /* intentionally ignored */ }
                        if (data.heartRate) {
                            updateData.heartRate = data.heartRate;
                        }
                        
                        // Handle calories - ONLY calories.burned, NOT calories.consumed
                        if (data.calories) {
                            updateData.calories = {};
                            if (data.calories.burned !== undefined) {
                                updateData.calories.burned = data.calories.burned;
                            }
                            // Explicitly exclude calories.consumed from bulk update
                            // If no valid calories fields, don't include calories
                            if (Object.keys(updateData.calories).length === 0) {
                                delete updateData.calories;
                            }
                        }
                        
                        // Handle water - exclude consumed, allow other fields if any
                        if (data.water) {
                            updateData.water = {};
                            // Only include non-consumed water fields if they exist
                            Object.keys(data.water).forEach(key => {
                                if (key !== 'consumed') {
                                    updateData.water[key] = data.water[key];
                                }
                            });
                            // If no non-consumed fields, don't include water at all
                            if (Object.keys(updateData.water).length === 0) {
                                delete updateData.water;
                            }
                        }

                        // Also persist goal completion compatibility flag if present in input (optional)
                        if (data.goalcompletions !== undefined) {
                            updateData.goalcompletions = data.goalcompletions;
                            updateData.goalcomplete = data.goalcompletions;
                        }

                        // Build granular $set update so we don't overwrite additive fields like calories.consumed or water.consumed
                        const setDoc = { userId, date };
                        if (updateData.steps && updateData.steps.count !== undefined) setDoc['steps.count'] = updateData.steps.count;
                        if (updateData.sleep && updateData.sleep.duration !== undefined) setDoc['sleep.duration'] = updateData.sleep.duration;
                        if (updateData.heartRate && updateData.heartRate.avgBpm !== undefined) setDoc['heartRate.avgBpm'] = updateData.heartRate.avgBpm;
                        if (updateData.calories && updateData.calories.burned !== undefined) setDoc['calories.burned'] = updateData.calories.burned;
                        if (updateData.goalcompletions !== undefined) {
                            setDoc['goalcompletions'] = updateData.goalcompletions;
                            setDoc['goalcomplete'] = updateData.goalcompletions;
                        }

                        const setOnInsertDoc = {
                            'calories.consumed': 0,
                            'calories.entries': [],
                            'water.consumed': 0,
                            'water.entries': []
                        };
                        if (setDoc['calories.burned'] === undefined) {
                            setOnInsertDoc['calories.burned'] = 0; // seed only if not being set
                        }

                        bulkOps.push({
                            updateOne: {
                                filter: { userId, date },
                                update: { $set: setDoc, $setOnInsert: setOnInsertDoc },
                                upsert: true
                            }
                        });

                        results.push({ date, status: existing ? 'updated' : 'created', mode: 'bulk' });

                    } catch (err) {
                        Logger.error('Error processing date in BULK MODE', requestId, { 
                            date,
                            errorMessage: err.message 
                        });
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
                        water: formattedHealthData.water ? { 
                            consumed: WaterConverter.mlToGlasses(formattedHealthData.water.consumed || 0),
                            entries: formattedHealthData.water.entries || []
                        } : undefined,
                        calories: formattedHealthData.calories ? { 
                            consumed: formattedHealthData.calories.consumed || 0, 
                            burned: formattedHealthData.calories.burned || 0,
                            entries: formattedHealthData.calories.entries || []
                        } : undefined,
                        sleep: formattedHealthData.sleep ? { 
                            duration: formattedHealthData.sleep.duration,
                            entries: formattedHealthData.sleep.entries || []
                        } : undefined,
                        date: formattedHealthData.date,
                        goalcompletions: formattedHealthData.goalcomplete  ,  // Map DB field to API response
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
                Logger.info('BULK MODE complete', requestId, { 
                    recordsProcessed: results.length 
                });
                ResponseHandler.success(res, 'Bulk health data processed (streaks skipped for performance)', responseData);
            }

        } catch (error) {
            Logger.error('Bulk update error', requestId, { 
                errorName: error.name,
                errorMessage: error.message 
            });
            ResponseHandler.error(
                res, 
                'Server error', 
                'Failed to process bulk health data', 
                500,
                'HEALTH_BULK_UPDATE_FAILED'
            );
        }
    }

    async addCalories(req, res) {
        const requestId = `health-calories_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            const caloriesConsumed = req.body.calories.consumed;
            const userId = req.user._id;
            const todayDate = new Date().toISOString().split('T')[0];

            Logger.info('Add calories START', requestId, { userId, calories: caloriesConsumed, date: todayDate });

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
                Logger.info('Calories updated in existing health data', requestId);
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
                Logger.info('Created new health data with calories', requestId);
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
                Logger.info('Created default goals', requestId);
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
                goalcompletions: responseData.goalcomplete,  // Map DB field to API response for frontend UI logic
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

            Logger.info('Add calories SUCCESS', requestId);
            return ResponseHandler.success(res, 'Calories consumed updated successfully', { todayData });

        } catch (error) {
            Logger.error('Add calories FAILED', requestId, { error: error.message, stack: error.stack });
            return ResponseHandler.serverError(res, 'Failed to update calories consumed', 'HEALTH_ADD_CALORIES_FAILED');
        }
    }
}



module.exports = new HealthController();
