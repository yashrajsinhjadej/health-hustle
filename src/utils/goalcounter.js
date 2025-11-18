// src/utils/goalcounter.js

// CONFIGURABLE GOAL SYSTEM - Easy to modify which goals count for streaks
const STREAK_GOALS = [
    'steps',
    // 'sleep',
    // 'caloriesBurn',
    // 'water',
    // 'caloriesIntake'
];

/**
 * Calculate individual goal completion status for the day.
 */
function calculateAllGoals(data, existingHealthData, goals) {
    const goalResults = {
        steps: data.steps && data.steps.count >= (goals.stepsGoal || 10000),

        sleep: data.sleep && data.sleep.duration >= (goals.sleepGoal?.hours || 8),

        caloriesBurn: data.calories && data.calories.burned >= (goals.caloriesBurnGoal || 2000),

        // Convert water goal glasses → ml (1 glass = 200ml)
        water:
            (existingHealthData?.water?.consumed || 0) >=
            ((goals.waterIntakeGoal || 8) * 200),

        caloriesIntake:
            (existingHealthData?.calories?.consumed || 0) >=
            (goals.caloriesIntakeGoal || 2000)
    };

    return goalResults;
}

/**
 * Determines streak completion based on goal results.
 */
function calculateStreakCompletion(goalResults, streakGoals = STREAK_GOALS) {
    const completedGoals = streakGoals.filter(goal => goalResults[goal]);
    const totalStreakGoals = streakGoals.length;

    const allStreakGoalsCompleted = completedGoals.length === totalStreakGoals;

    return {
        completedGoals,
        totalStreakGoals,
        allCompleted: allStreakGoalsCompleted,
        goalResults
    };
}

module.exports = {
    STREAK_GOALS,
    calculateAllGoals,
    calculateStreakCompletion
};
