const mongoose = require('mongoose');

const workoutSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique:true
    },
    category: {
      type: [String], // array allows multiple categories
      default: [],
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    duration: { 
      type: Number, // total duration in minutes
      required: true,
    },
    bannerUrl: { 
      type: String, // Large, high-res image for detail header
    },
    thumbnailUrl: {
      type: String, // Small, cropped image for list cards
    },
    introduction: {
      type: String,
      trim: true,
    },
    exerciseCount: {
      type: Number, // Denormalized count (videos.length)
      default: 0,
    },
    detailedInstructions: { 
      type: [String], // Structured instructions/steps
      default: [],
    },
    
    // One-to-Many Relationship with sequence
    videos: [
      {
        video: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutVideo' },
        sequence: { type: Number, default: 0 }, // Order inside the workout
      },
    ],

    equipment: {
      type: [String], 
      default: [],
    },
    targetMuscles: {
      type: [String],
      default: [],
    },
    caloriesBurnedEstimate: {
      type: Number,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    sequence: {
      type: Number,
      default: 0, // Order of workouts for frontend
    },
  },
  { timestamps: true }
);

// Index for fast sorting by sequence
workoutSchema.index({ sequence: 1 });

module.exports = mongoose.model('Workout', workoutSchema);
