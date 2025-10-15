const mongoose = require('mongoose');

const CMSPageSchema = new mongoose.Schema({
  // Unique identifier used in the URL and by the mobile app
  slug: {
    type: String,
    required: [true, 'Slug is required for CMS pages'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  // Title for the Admin UI
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
  },
  // Raw content (e.g., Markdown) edited by the admin
  rawContent: {
    type: String,
    required: true,
  },
  // Pre-rendered, mobile-optimized HTML sent to the WebView
  htmlContent: {
    type: String,
    required: true,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt
});

const CMSPage = mongoose.model('CMSPage', CMSPageSchema);

module.exports = CMSPage;