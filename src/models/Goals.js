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
    
    // Goal Settings
    goalPeriod: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'daily'
    },
    
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

module.exports = mongoose.model('Goals', goalsSchema);
