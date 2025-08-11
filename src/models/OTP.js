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
        default: () => {
            const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
            return new Date(Date.now() + expiryMinutes * 60 * 1000);
        },
        index: { expireAfterSeconds: 0 } // MongoDB TTL - auto delete expired documents
    },
    isUsed: {
        type: Boolean,
        default: false
    },
    attempts: {
        type: Number,
        default: 0,
        max: parseInt(process.env.OTP_MAX_ATTEMPTS) || 3
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('OTP', otpSchema);
