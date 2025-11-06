const mongoose = require('mongoose');

const WorkoutSchema = new mongoose.Schema({
  name: { type: String, required: true},
  thumbnailUrl: { type: String, required: true },
  thumbnailKey: { type: String },        // S3 key for thumbnail
  bannerUrl: { type: String, required: true },
  bannerKey: { type: String },           // S3 key for banner

  description: { type: String },         // general description
  introduction: { type: String },        // intro text
  equipment: [{ type: String }],         // e.g. ["Dumbbell", "Mat"]


  duration: { type: Number , default:0},            // in minutes
  exerciseCount: { type: Number, default: 0 },

  videos: [
    {
      video: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutVideo' },
      sequence: { type: Number, default: 0 }
    }
  ],

  level: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced'],
    default: 'Beginner'
  },
  caloriesBurned: { type: Number },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for search/filter
WorkoutSchema.index({ level: 1 });
// Compound unique index - allows same name for inactive workouts
WorkoutSchema.index({ name: 1, isActive: 1 }, { 
  unique: true,
  partialFilterExpression: { isActive: true }
});

module.exports = mongoose.model('Workout', WorkoutSchema);
