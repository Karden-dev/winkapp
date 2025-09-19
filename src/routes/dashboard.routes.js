// src/routes/dashboard.routes.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.get('/stats', authMiddleware.verifyToken, authMiddleware.isAdmin, dashboardController.getDashboardStats);

module.exports = router;