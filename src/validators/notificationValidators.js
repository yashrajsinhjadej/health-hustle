const { body, validationResult } = require("express-validator");

/**
 * Validation rules for admin notification send API
 */
const validateAdminNotification = [
  body("title")
    .notEmpty()
    .withMessage("Title is required")
    .isString()
    .withMessage("Title must be a string")
    .isLength({ max: 100 })
    .withMessage("Title cannot exceed 100 characters"),

  body("body")
    .notEmpty()
    .withMessage("Body is required")
    .isString()
    .withMessage("Body must be a string")
    .isLength({ max: 300 })
    .withMessage("Body cannot exceed 300 characters"),

  body("data")
    .optional()
    .custom((value) => {
      if (typeof value !== "object") {
        throw new Error("Data must be a JSON object");
      }
      return true;
    }),
];

/**
 * Middleware to handle validation errors globally
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: errors.array().map((err) => err.msg),
    });
  }
  next();
};

module.exports = {
  validateAdminNotification,
  handleValidationErrors,
};
