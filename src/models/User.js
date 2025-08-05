// User Model - Simple Mongoose schema
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: function() {
            return this.profileCompleted === true;
        },
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
        required: function() {
            return this.profileCompleted === true;
        },
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    gender: {
        type: String,
        required: function() {
            return this.profileCompleted === true;
        },
        enum: ['male', 'female', 'other'],
        lowercase: true
    },
    height: {
        type: Number, // in cm
        required: function() {
            return this.profileCompleted === true;
        },
        min: [50, 'Height must be at least 50cm'],
        max: [300, 'Height cannot exceed 300cm']
    },
    weight: {
        type: Number, // in kg
        required: function() {
            return this.profileCompleted === true;
        },
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
    age: {
        type: Number,
        required: function() {
            return this.profileCompleted === true;
        },
        min: [13, 'Age must be at least 13'],
        max: [120, 'Age cannot exceed 120']
    },
    loyaltyPercentage: {
        type: Number,
        required: function() {
            return this.profileCompleted === true;
        },
        min: [0, 'Loyalty percentage must be at least 0'],
        max: [100, 'Loyalty percentage cannot exceed 100'],
        validate: {
            validator: function(v) {
                return v % 10 === 0; // Must be in intervals of 10
            },
            message: 'Loyalty percentage must be in intervals of 10 (0, 10, 20, ..., 100)'
        }
    },
    bodyProfile: {
        type: String,
        required: function() {
            return this.profileCompleted === true;
        },
        enum: ['slim', 'average', 'muscular', 'overweight'],
        lowercase: true
    },
    mainGoal: {
        type: String,
        required: function() {
            return this.profileCompleted === true;
        },
        enum: ['weight_loss', 'build_muscles', 'full_body_detox', 'fit_body'],
        lowercase: true
    },
    sportsAmbitions: {
        type: [String],
        validate: {
            validator: function(v) {
                const allowedSports = ['swimming', 'badminton', 'table_tennis', 'boxing', 'running', 'cycling'];
                return v.every(sport => allowedSports.includes(sport.toLowerCase()));
            },
            message: 'Invalid sport selected. Allowed sports: swimming, badminton, table_tennis, boxing, running, cycling'
        },
        default: []
    },
    userPreferences: {
        heightUnit: {
            type: String,
            enum: ['cm', 'ft'],
            default: 'cm'
        },
        weightUnit: {
            type: String,
            enum: ['kg', 'lbs'],
            default: 'kg'
        }
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
    },
    lastLoginAt: {
        type: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
