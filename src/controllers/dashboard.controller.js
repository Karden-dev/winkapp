// src/controllers/dashboard.controller.js
const dashboardModel = require('../models/dashboard.model');

const getDashboardStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ message: "Les dates de début et de fin sont requises." });
        }
        const stats = await dashboardModel.getStatsByDateRange(startDate, endDate);
        res.json(stats);
    } catch (error) {
        console.error("Erreur (getDashboardStats):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

module.exports = {
    getDashboardStats
};