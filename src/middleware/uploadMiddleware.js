const multer = require('multer');

// Use memory storage - image stays in RAM temporarily
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Middleware to check if file exists
const checkFileExists = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Please upload an image file'
    });
  }
  next();
};

module.exports = { upload, checkFileExists };