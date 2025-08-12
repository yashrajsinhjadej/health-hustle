const Goal = require('../models/Goals');
const DailyHealthData = require('../models/DailyHealthData');

async function checkGoalsCompleted(date, userId) {
    try {
        // Step 1: Get user's goals from database
        const userGoals = await Goal.findOne({ userId: userId, isActive: true });
        if (!userGoals) {
            throw new Error('No active goals found for user');
        }

        // Step 2: Get health data for the specific date
        const healthData = await DailyHealthData.findOne({ userId: userId, date: date });
        if (!healthData) {
            throw new Error('No health data found for the specified date');
        }

        // Step 3: Initialize result object
        const result = {
            date: date,
            userId: userId,
            goalsCompleted: {},
            totalGoals: 0,
            completedGoalsCount: 0,
            overallCompletion: 0
        };

        let completedCount = 0;
        let totalCount = 0;

        // Step 4: Check Water Intake Goal (only goal for now)
        if (userGoals.waterIntakeGoal) {
            totalCount++;
            const actualWaterMl = healthData.water ? healthData.water.consumed : 0;
            const actualWaterGlasses = Math.round(actualWaterMl / 200); // 1 glass = 240ml
            const isWaterCompleted = actualWaterGlasses >= userGoals.waterIntakeGoal;
            
            result.goalsCompleted.water = {
                goal: userGoals.waterIntakeGoal,
                actual: actualWaterGlasses,
                actualMl: actualWaterMl,
                completed: isWaterCompleted
            };
            
            if (isWaterCompleted) completedCount++;
        }

        if(userGoals.stepsGoal){
            totalCount++;
            const actualSteps = healthData.steps ? healthData.steps.count : 0;
            const isStepsCompleted = actualSteps >= userGoals.stepsGoal;   
            result.goalsCompleted.steps = {
                goal: userGoals.stepsGoal,
                actual: actualSteps,
                completed: isStepsCompleted
            };
            if(isStepsCompleted) completedCount++;
        }

        // Step 5: Calculate final results
        result.totalGoals = totalCount;
        result.completedGoalsCount = completedCount;
        
        // Calculate percentage (avoid division by zero)
        if (totalCount > 0) {
            result.overallCompletion = Math.round((completedCount / totalCount) * 100);
        }

        return result;

    } catch (error) {
        console.error('Error checking goals completion:', error);
        throw error;
    }
}

module.exports = {
    checkGoalsCompleted
};