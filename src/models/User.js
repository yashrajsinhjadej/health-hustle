// User Model - Simple Mongoose schema
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        unique: true,
        match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    dateOfBirth: {
        type: Date
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
        lowercase: true
    },
    height: {
        type: Number, // in cm
        min: [50, 'Height must be at least 50cm'],
        max: [300, 'Height cannot exceed 300cm']
    },
    weight: {
        type: Number, // in kg
        min: [10, 'Weight must be at least 10kg'],
        max: [500, 'Weight cannot exceed 500kg']
    },
    fitnessGoal: {
        type: String,
        trim: true,
        maxlength: [100, 'Fitness goal cannot exceed 100 characters']
    },
    activityLevel: {
        type: String,
        enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
        lowercase: true
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    profileCompleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
