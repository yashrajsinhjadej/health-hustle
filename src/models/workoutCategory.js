const mongoose = require('mongoose');

const workoutCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // Guarantees consistency
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
    iconUrl: {
      type: String, // For category icons in the UI
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkoutCategory', workoutCategorySchema);