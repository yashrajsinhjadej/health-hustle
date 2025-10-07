export const checkFileMiddleware = (req, res, next) => {
    // Multer places the file object on req.file
    if (!req.file) {
        return res.status(400).json({ error: "No image file provided. Please upload a photo of your food." });
    }
    // Simple MIME type check
    if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: "Invalid file type. Only images are allowed." });
    }
    // File is valid, proceed to the controller
    next();
};
