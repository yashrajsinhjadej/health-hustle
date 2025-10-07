const mongoose = require('mongoose');

const workoutSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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
    
    // Image URLs (Generated from one admin upload)
    bannerUrl: { 
      type: String, // Large, high-res image for detail header
    },
    thumbnailUrl: {
      type: String, // Small, cropped image for list cards
    },
    
    // UI/Metadata fields
    introduction: {
        type: String,
        trim: true, // For the main description text
    },
    exerciseCount: {
        type: Number, // Denormalized count (videos.length)
        default: 0,
    },
    detailedInstructions: { 
      type: [String], // Structured instructions/steps
      default: [],
    },
    
    // One-to-Many Relationship: Array of WorkoutVideo references
    videos: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WorkoutVideo', 
      },
    ],
    
    // General Metadata
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Workout', workoutSchema);