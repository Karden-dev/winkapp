// src/routes/dashboard.routes.js
const express = require('express');
const router = express.Router();
const dashboardModel = require('../models/dashboard.model'); // UTILISE LE NOUVEAU MODÈLE

// Contrôleur pour agréger toutes les données du tableau de bord
const getDashboardData = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ message: "La période (startDate, endDate) est requise." });
        }

        // 1. Métriques et CA (via dashboardModel)
        const metrics = await dashboardModel.getDashboardMetrics(startDate, endDate);
        
        // 2. Classement des marchands
        const ranking = await dashboardModel.getShopRanking(startDate, endDate);
        
        res.json({
            metrics: metrics,
            ranking: ranking,
        });

    } catch (error) {
        console.error("Erreur getDashboardData:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des données du tableau de bord." });
    }
};

router.get('/stats', getDashboardData);

module.exports = router;