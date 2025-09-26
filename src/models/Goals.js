const mongoose = require('mongoose');

const goalsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
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
        }
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
