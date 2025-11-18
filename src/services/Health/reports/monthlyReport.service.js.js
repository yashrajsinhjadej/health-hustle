// services/Health/reports/monthlyReport.service.js

const DailyHealthData = require('../../../models/DailyHealthData');
const Goals = require('../../../models/Goals');
const WaterConverter = require('../../../utils/waterConverter');
const Logger = require('../../../utils/logger');
const timeZoneUtil = require('../../../utils/timeZone');

module.exports = async function monthlyReportService({
    userId,
    date,
    timezone,
    requestId
}) {
    try {
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!date || !dateRegex.test(date)) {
            return { error: true, message: 'Invalid date format. Please use YYYY-MM-DD format' };
        }

        const inputDate = new Date(date + "T00:00:00Z");
        if (isNaN(inputDate.getTime())) {
            return { error: true, message: 'Invalid date provided' };
        }

        const year = inputDate.getUTCFullYear();
        const month = inputDate.getUTCMonth();

        const monthStartString = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const monthEndString = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

        Logger.info('Monthly report START', requestId, {
            userId,
            monthStartString,
            monthEndString,
            daysInMonth
        });

        const userGoals = await Goals.findOne({ userId });

        const monthlyData = await DailyHealthData.aggregate([
            {
                $match: {
                    userId,
                    date: { $gte: monthStartString, $lte: monthEndString }
                }
            },
            { $sort: { date: 1 } },
            {
                $project: {
                    date: 1,
                    steps: 1,
                    water: 1,
                    calories: 1,
                    sleep: 1,
                    goalcomplete: 1,
                    _id: 0
                }
            }
        ]);

        const todayDateString = timeZoneUtil.getCurrentDateInTimezone(timezone);

        const todayHealth = await DailyHealthData.findOne({
            userId,
            date: todayDateString
        }).select('goalcomplete streak -_id');

        const dataMap = {};
        monthlyData.forEach(d => (dataMap[d.date] = d));

        const dailyBreakdown = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const d = dataMap[dateString];

            dailyBreakdown.push({
                date: dateString,
                goalCompletion: Boolean(d?.goalcomplete),
                water: {
                    ml: d?.water?.consumed || 0,
                    glasses: WaterConverter.mlToGlasses(d?.water?.consumed || 0)
                },
                calories: {
                    consumed: d?.calories?.consumed || 0,
                    burned: d?.calories?.burned || 0
                },
                steps: { count: d?.steps?.count || 0 },
                sleep: { duration: d?.sleep?.duration || 0 }
            });
        }

        const totalWaterIntake = monthlyData.reduce((sum, d) => sum + (d.water?.consumed || 0), 0);
        const totalCaloriesConsumed = monthlyData.reduce((sum, d) => sum + (d.calories?.consumed || 0), 0);
        const totalCaloriesBurned = monthlyData.reduce((sum, d) => sum + (d.calories?.burned || 0), 0);
        const totalSleepDuration = monthlyData.reduce((sum, d) => sum + (d.sleep?.duration || 0), 0);
        const totalSteps = monthlyData.reduce((sum, d) => sum + (d.steps?.count || 0), 0);


        return {
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
                year,
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
                sleep: { totalDuration: totalSleepDuration },
                steps: { totalCount: totalSteps }
            },
            dailyBreakdown
        };

    } catch (err) {
        Logger.error("Monthly report FAILED", requestId, {
            message: err.message
        });
        return { error: true, message: "Failed to get monthly report" };
    }
};
