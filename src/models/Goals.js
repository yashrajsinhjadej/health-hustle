const mongoose = require('mongoose');

const goalsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Activity Goals
    stepsGoal: {
        type: Number,
        default: 10000,
        min: 0,
        max: 100000
    },
    caloriesBurnGoal: {
        type: Number,
        default: 2000,
        min: 0,
        max: 10000
    },
    activeMinutesGoal: {
        type: Number,
        default: 30,
        min: 0,
        max: 1440 // max minutes in a day
    },
    
    // Nutrition Goals
    waterIntakeGoal: {
        type: Number,
        default: 8, // glasses per day
        min: 0,
        max: 20
    },
    caloriesIntakeGoal: {
        type: Number,
        default: 2000,
        min: 500,
        max: 5000
    },
    
    // Sleep Goals
    sleepGoal: {
        hours: {
            type: Number,
            default: 8,
            min: 4,
            max: 12
        },
        bedtime: {
            type: String, // Format: "22:00"
            default: "22:00"
        },
        wakeupTime: {
            type: String, // Format: "06:00"
            default: "06:00"
        }
    },
    
    // Body Metrics Goals
    weightGoal: {
        target: {
            type: Number,
            min: 20,
            max: 500
        },
        unit: {
            type: String,
            enum: ['kg', 'lbs'],
            default: 'kg'
        }
    },
    
    // Workout Goals
    workoutGoals: {
        weeklyWorkouts: {
            type: Number,
            default: 3,
            min: 0,
            max: 14
        },
        preferredWorkoutTypes: [{
            type: String,
            enum: ['cardio', 'strength', 'yoga', 'pilates', 'running', 'cycling', 'swimming', 'sports', 'other']
        }],
        sessionDuration: {
            type: Number, // in minutes
            default: 30,
            min: 5,
            max: 300
        }
    },
    
    // Health Monitoring Goals
    heartRateTargets: {
        restingHR: {
            type: Number,
            min: 30,
            max: 120
        },
        maxHR: {
            type: Number,
            min: 100,
            max: 220
        }
    },
    
    // Medication Reminders
    medicationReminders: [{
        name: {
            type: String,
            required: true
        },
        dosage: String,
        frequency: {
            type: String,
            enum: ['daily', 'twice-daily', 'thrice-daily', 'weekly', 'as-needed'],
            default: 'daily'
        },
        reminderTimes: [String], // Array of times like ["08:00", "20:00"]
        isActive: {
            type: Boolean,
            default: true
        }
    }],
    
    // Goal Settings
    goalPeriod: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'daily'
    },
    
    // Notification Preferences
    notifications: {
        stepReminders: {
            type: Boolean,
            default: true
        },
        waterReminders: {
            type: Boolean,
            default: true
        },
        sleepReminders: {
            type: Boolean,
            default: true
        },
        workoutReminders: {
            type: Boolean,
            default: true
        },
        medicationReminders: {
            type: Boolean,
            default: true
        }
    },
    
    // Goal Achievement Tracking
    achievements: {
        totalGoalsAchieved: {
            type: Number,
            default: 0
        },
        streaks: {
            steps: {
                current: { type: Number, default: 0 },
                longest: { type: Number, default: 0 }
            },
            water: {
                current: { type: Number, default: 0 },
                longest: { type: Number, default: 0 }
            },
            sleep: {
                current: { type: Number, default: 0 },
                longest: { type: Number, default: 0 }
            },
            workout: {
                current: { type: Number, default: 0 },
                longest: { type: Number, default: 0 }
            }
        }
    },
    
    // Goal History (for tracking changes)
    goalHistory: [{
        changedAt: {
            type: Date,
            default: Date.now
        },
        changes: {
            type: mongoose.Schema.Types.Mixed // Stores what goals were changed
        },
        reason: String // Why the goal was changed
    }],
    
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true // createdAt and updatedAt
});

// Indexes for better query performance
goalsSchema.index({ userId: 1 });
goalsSchema.index({ userId: 1, isActive: 1 });
goalsSchema.index({ 'medicationReminders.isActive': 1 });

module.exports = mongoose.model('Goals', goalsSchema);
