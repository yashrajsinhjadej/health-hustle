const express = require('express');
const router = express.Router();


router.use('/',(req,res)=>{
    res.json({
        message: "Notification API Endpoints",
        availableEndpoints: [
            "GET /api/notification/admin - Admin notification management endpoints",
            "GET /api/notification/user - User notification access endpoints"
        ]
    });
});

module.exports = router;