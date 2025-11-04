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
        required: function() {
            return this.role !== 'admin'; // Phone not required for admin users
        },
        unique: true,
        sparse: true, // Allow multiple null values but unique non-null values
        match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    email: {
        type: String,
        required: function() {
            return this.profileCompleted === true || this.role === 'admin';
        },
        trim: true,
        lowercase: true,
        unique: true,
        sparse: true, // Allow multiple null values but unique non-null values
        match: [/^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: function() {
            return this.role === 'admin';
        },
        minlength: [6, 'Password must be at least 6 characters long']
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
        enum: ['weight_loss', 'build_muscles', 'full_body_detox', 'fit_body','weight_gain','athletic_performance'],
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
    profilePictureUrl: {
        type: String,
        default: null
    },
    profilePictureKey: {
        type: String,
        default: null
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
    },
    signupAt: {
        type: Date,
        default: Date.now
    }

}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
