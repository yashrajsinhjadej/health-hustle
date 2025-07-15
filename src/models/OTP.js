// OTP Model - MongoDB schema for storing OTPs temporarily
const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        unique: true, // Only one OTP per phone number
        index: true
    },
    otp: {
        type: String,
        required: [true, 'OTP is required'],
        minlength: 6,
        maxlength: 6
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from creation
        index: { expireAfterSeconds: 0 } // MongoDB TTL - auto delete expired documents
    },
    isUsed: {
        type: Boolean,
        default: false
    },
    attempts: {
        type: Number,
        default: 0,
        max: 3
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('OTP', otpSchema);
