// models/CMSPage.js
const mongoose = require('mongoose');

const cmsPageSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  htmlContent: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Note: slug index removed - unique: true already creates an index automatically
// Keeping this line would cause "Duplicate schema index" warning

module.exports = mongoose.model('CMSPage', cmsPageSchema);