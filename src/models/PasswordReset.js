const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Index for faster user lookups
    },
    token: {
        type: String,
        required: true,
        unique: true,
        index: true // Index for token lookups
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 } // MongoDB will automatically delete documents when expiresAt is reached
    },
    used: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Remove duplicate index declarations - they're already defined in the schema fields above
// passwordResetSchema.index({ token: 1 }); // ❌ REMOVED - duplicate
// passwordResetSchema.index({ userId: 1 }); // ❌ REMOVED - duplicate  
// passwordResetSchema.index({ expiresAt: 1 }); // ❌ REMOVED - duplicate

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
