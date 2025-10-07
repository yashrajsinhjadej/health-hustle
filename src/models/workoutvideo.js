const mongoose = require('mongoose');

const workoutVideoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    youtubeUrl: { // Essential link for streaming
      type: String, 
      required: true,
    },
    duration: {
      type: Number, // in seconds (entered by Admin)
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkoutVideo', workoutVideoSchema);
