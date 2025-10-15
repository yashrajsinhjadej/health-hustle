const mongoose = require('mongoose');

const WorkoutSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  thumbnailUrl: { type: String, required: true },
  bannerUrl: { type: String, required: true },
  description: { type: String },        // general description
  introduction: { type: String },       // text intro for the workout
  equipment: [{ type: String }],        // e.g., ["Dumbbell", "Mat"]
  // Category can be an array to support multiple categories per workout
  category: [{ type: String }],
  // Duration in seconds (or minutes depending on your system) - used by controllers
  duration: { type: Number },
  // Sequence is used for ordering workouts in lists
  sequence: { type: Number, default: 0, index: true },
  // Number of exercise/video items in the workout
  exerciseCount: { type: Number, default: 0 },
  // Videos array: each item references a WorkoutVideo and has a sequence/order
  videos: [
    {
      video: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutVideo' },
      sequence: { type: Number, default: 0 }
    }
  ],
  level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'beginner', 'intermediate', 'advanced'] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});


// Optional indexes for fast filtering
WorkoutSchema.index({ level: 1 });
WorkoutSchema.index({ name: 1 });

module.exports = mongoose.model('Workout', WorkoutSchema);
