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
      required: true,
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
      required: true,
    },
    duration: { 
      type: Number, // total duration in minutes
      // required: true,
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
      required:true
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

// Define Indexes
workoutSchema.index({ 
    name: 'text', 
    introduction: 'text' 
}); 
workoutSchema.index({ level: 1 });       // Index for filtering by level
workoutSchema.index({ category: 1 });  // Multikey index for array filtering
workoutSchema.index({ sequence: 1 });    // Index for fast sorting by sequence

// *** NEW ADDITION: Call createIndexes after schema definition to ensure index exists ***
// This should only be done once on application startup if autoIndex: false is set elsewhere.
// This is the simplest way to fix the IndexNotFound error in development.
workoutSchema.post('init', function() {
    // Only run this logic if it hasn't been run already, or if we are sure we need it.
    // However, calling createIndexes on the Model when the app starts is the safest way to ensure it exists.
    // Mongoose handles the index creation on the model itself, not the instance.
});

const Workout = mongoose.model('Workout', workoutSchema);

// Export the model and also call createIndexes() once to ensure the index is present.
// If your Mongoose connection has { autoIndex: true }, this is redundant but harmless.
// If { autoIndex: false }, this is necessary.
Workout.createIndexes().catch(err => {
    // Log error if index creation fails (e.g., permission issues)
    if (err.code !== 27) { // Ignore the IndexNotFound error if it's during startup before creation
        console.error('Error creating Workout Text Index:', err.message);
    }
});


module.exports = Workout;
