const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  designId: { type: Number, required: true },
  categorySequence: { type: Number, required: true, default: 1 }, // order on frontend
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});


// Optional: index for fast sorting by sequence
CategorySchema.index({ categorySequence: 1 });

module.exports = mongoose.model('Category', CategorySchema);
