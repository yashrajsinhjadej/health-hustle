const mongoose = require('mongoose');

const WorkoutSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  thumbnailUrl: { type: String, required: true },
  bannerUrl: { type: String, required: true },

  description: { type: String },         // general description
  introduction: { type: String },        // intro text
  equipment: [{ type: String }],         // e.g. ["Dumbbell", "Mat"]

  // ✅ Removed category (will add later)
  // ✅ Removed sequence (will add later using drag & drop)

  duration: { type: Number },            // in minutes
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

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for search/filter
WorkoutSchema.index({ level: 1 });
WorkoutSchema.index({ name: 1 });

module.exports = mongoose.model('Workout', WorkoutSchema);
