// DailyHealthData Model - Consolidated daily health tracking
const mongoose = require('mongoose');

const dailyHealthDataSchema = new mongoose.Schema({
    // User reference
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Date in YYYY-MM-DD format for easy querying
    date: {
        type: String,
        required: true,
        match: /^\d{4}-\d{2}-\d{2}$/ // Validates YYYY-MM-DD format
    },
    
    // Heart Rate Tracking
    heartRate: {
        readings: [{
            time: String,        // "09:30", "14:15"
            bpm: Number,         // Beats per minute
            activity: String     // "resting", "walking", "exercise"
        }],
        avgBpm: Number,          // Average for the day
        maxBpm: Number,          // Maximum reading
        minBpm: Number           // Minimum reading
    },
    
    // Step Counter
    steps: {
        count: {
            type: Number,
            default: 0
        },
        target: {
            type: Number,
            default: 10000
        },
        distance: Number,        // Distance in km
        activeMinutes: Number    // Minutes of active movement
    },
    
    // Water Intake
    water: {
        consumed: {
            type: Number,        // ml consumed
            default: 0
        },
        target: {
            type: Number,        // ml target
            default: 2000
        },
        entries: [{
            time: String,        // "08:30", "12:00"
            amount: Number,      // ml consumed at this time
            notes: String        // Optional notes
        }]
    },
    
    // Calorie Tracking
    calories: {
        consumed: {
            type: Number,
            default: 0
        },
        burned: {
            type: Number,
            default: 0
        },
        target: {
            type: Number,
            default: 2000
        },
        bmr: Number              // Basal Metabolic Rate
    },
    
    // Sleep Tracking
    sleep: {
        duration: Number,        // Hours slept
        quality: {
            type: String,
            enum: ['poor', 'fair', 'good', 'excellent']
        },
        bedTime: String,         // "23:30"
        wakeTime: String,        // "07:00"
        deepSleep: Number,       // Hours of deep sleep
        lightSleep: Number       // Hours of light sleep
    },
    
    // Body Measurements
    bodyMetrics: {
        weight: Number,          // kg
        bodyFat: Number,         // percentage
        muscleMass: Number,      // kg
        bmi: Number,             // Calculated BMI
        bodyTemperature: Number  // Celsius
    },
    
    // Workout Sessions
    workouts: [{
        type: String,            // "cardio", "strength", "yoga"
        duration: Number,        // minutes
        caloriesBurned: Number,
        exercises: [String],     // ["push-ups", "squats"]
        intensity: {
            type: String,
            enum: ['low', 'moderate', 'high', 'intense']
        },
        notes: String
    }],
    
    // Nutrition Overview
    nutrition: {
        meals: [{
            type: {
                type: String,
                enum: ['breakfast', 'lunch', 'dinner', 'snack']
            },
            foods: [{
                name: String,
                quantity: String,    // "1 cup", "100g"
                calories: Number,
                protein: Number,     // grams
                carbs: Number,       // grams
                fats: Number         // grams
            }],
            totalCalories: Number
        }],
        totalProtein: Number,
        totalCarbs: Number,
        totalFats: Number
    },
    
    // Mood & Wellness
    mood: {
        level: {
            type: Number,
            min: 1,
            max: 10
        },
        note: String,
        factors: [String],       // ["good_sleep", "exercise", "stress"]
        stressLevel: {
            type: Number,
            min: 1,
            max: 10
        }
    },
    
    // Vital Signs
    vitals: {
        bloodPressure: {
            systolic: Number,
            diastolic: Number,
            readings: [{
                time: String,
                systolic: Number,
                diastolic: Number
            }]
        },
        bloodSugar: {
            avg: Number,
            readings: [{
                time: String,
                value: Number,
                type: String     // "fasting", "post_meal"
            }]
        }
    },
    
    // Medications & Supplements
    medications: [{
        name: String,
        dosage: String,
        taken: Boolean,
        timeScheduled: String,
        timeTaken: String,
        notes: String
    }],
    
    // Daily Goals Progress
    goals: {
        stepsAchieved: Boolean,
        waterAchieved: Boolean,
        caloriesAchieved: Boolean,
        sleepAchieved: Boolean,
        workoutCompleted: Boolean
    },
    
    // Notes & Additional Data
    notes: String,
    weatherCondition: String,    // For outdoor activity correlation
    
    // Flexible field for future additions
    customMetrics: mongoose.Schema.Types.Mixed

}, {
    timestamps: true,
    // Allow dynamic fields for easy expansion
    strict: false
});

// Create compound index for efficient querying
dailyHealthDataSchema.index({ userId: 1, date: 1 }, { unique: true });

// Index for date range queries (7 days, monthly)
dailyHealthDataSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('DailyHealthData', dailyHealthDataSchema);
