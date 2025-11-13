const { body, validationResult } = require("express-validator");

/**
 * Validation rules for admin notification send API
 */
const validateAdminNotification = [
  // Title validation
  body("title")
    .notEmpty()
    .withMessage("Title is required")
    .isString()
    .withMessage("Title must be a string")
    .isLength({ max: 65 })
    .withMessage("Title cannot exceed 65 characters"),

  // Body validation
  body("body")
    .notEmpty()
    .withMessage("Body is required")
    .isString()
    .withMessage("Body must be a string")
    .isLength({ max: 240 })
    .withMessage("Body cannot exceed 240 characters"),

  // Optional data payload
  body("data")
    .optional()
    .custom((value) => {
      if (typeof value !== "object") {
        throw new Error("Data must be a JSON object");
      }
      return true;
    }),

  // --- New fields for scheduling ---
  body("scheduleType")
    .optional()
    .isIn(["instant", "scheduled_once", "daily"])
    .withMessage(
      "scheduleType must be one of: instant, scheduled_once, daily"
    ),

  // Required if scheduleType = scheduled_once
  body("scheduledDate")
    .if(body("scheduleType").equals("scheduled_once"))
    .notEmpty()
    .withMessage("scheduledDate is required for scheduled_once type")
    .isISO8601()
    .withMessage("scheduledDate must be a valid ISO date string")
    .custom((value) => {
      const date = new Date(value);
      if (date <= new Date()) {
        throw new Error("scheduledDate must be in the future");
      }
      return true;
    }),

  // Required if scheduleType = daily
  body("scheduledTime")
    .if(body("scheduleType").equals("daily"))
    .notEmpty()
    .withMessage("scheduledTime is required for daily type")
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("scheduledTime must be in HH:mm 24-hour format"),
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
      errors: errors.array().map((err) => ({
        field: err.param,
        message: err.msg,
      })),
    });
  }
  next();
};

module.exports = {
  validateAdminNotification,
  handleValidationErrors,
};
