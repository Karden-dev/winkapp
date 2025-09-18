// src/routes/deliverymen.routes.js
const express = require('express');
const router = express.Router();
const userModel = require('../models/user.model');

// GET / : Récupérer la liste des livreurs actifs
router.get('/', async (req, res) => {
    try {
        const filters = {
            status: req.query.status || 'actif', // Filtre par défaut pour les livreurs actifs
            search: req.query.search || null
        };
        const deliverymen = await userModel.findAllDeliverymen(filters);
        res.status(200).json(deliverymen);
    } catch (error) {
        console.error("Erreur (GET /deliverymen):", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des livreurs." });
    }
});

// GET /performance : Récupérer le classement des livreurs
router.get('/performance', async (req, res) => {
    try {
        const filters = {
            startDate: req.query.startDate || null,
            endDate: req.query.endDate || null,
            search: req.query.search || null,
        };
        const performance = await userModel.findDeliverymenPerformance(filters);
        res.status(200).json(performance);
    } catch (error) {
        console.error("Erreur (performance livreurs):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
});

// GET /stats : Récupérer les statistiques globales des livreurs
router.get('/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await userModel.getDeliverymenStats(startDate, endDate);
        res.status(200).json(stats);
    } catch (error) {
        console.error("Erreur (stats livreurs):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
});

module.exports = router;