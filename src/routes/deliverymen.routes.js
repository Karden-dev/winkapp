// src/routes/deliverymen.routes.js
const express = require('express');
const router = express.Router();
const userModel = require('../models/user.model');
// Importer les middlewares nécessaires
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

// Importer le contrôleur
const deliverymenController = require('../controllers/deliverymen.controller');

// --- Routes ---

/**
 * @route   GET /api/deliverymen
 * @desc    Récupère la liste simple des livreurs actifs (id, name).
 * @access  Privé (Utilisateur connecté) - PAS DE isAdmin
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const filters = {
            status: req.query.status || 'actif',
            search: req.query.search || null
        };
        const deliverymen = await userModel.findAllDeliverymen(filters);
        res.status(200).json(deliverymen);
    } catch (error) {
        console.error("Erreur (GET /deliverymen):", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des livreurs." });
    }
});

/**
 * @route   GET /api/deliverymen/performance
 * @desc    Récupère le classement des livreurs pour la page admin.
 * @access  Privé (Admin uniquement)
 */
router.get('/performance', verifyToken, isAdmin, async (req, res) => {
    try {
        const filters = {
            startDate: req.query.startDate || null,
            endDate: req.query.endDate || null,
            search: req.query.search || null,
        };
        const performance = await userModel.findDeliverymenPerformance(filters);
        res.status(200).json(performance);
    } catch (error) {
        console.error("Erreur (GET /deliverymen/performance):", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des performances." });
    }
});

/**
 * @route   GET /api/deliverymen/stats
 * @desc    Récupère les statistiques globales des livreurs pour la page admin.
 * @access  Privé (Admin uniquement)
 */
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await userModel.getDeliverymenStats(startDate, endDate);
        res.status(200).json(stats);
    } catch (error) {
        console.error("Erreur (GET /deliverymen/stats):", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des statistiques." });
    }
});

// --- NOUVELLES ROUTES DE GESTION ET PERFORMANCE DÉTAILLÉE ---

/**
 * @route   GET /api/deliverymen/:userId/performance-details
 * @access  Privé (Admin uniquement)
 */
if (deliverymenController && deliverymenController.getDeliverymanPerformanceDetails) {
    router.get('/:userId/performance-details', verifyToken, isAdmin, deliverymenController.getDeliverymanPerformanceDetails);
} else {
    console.error("ERREUR DE CONFIGURATION: deliverymenController.getDeliverymanPerformanceDetails manquant.");
    router.get('/:userId/performance-details', verifyToken, isAdmin, (req, res) => res.status(501).json({ message: "Fonctionnalité (get perf details) non implémentée." }));
}

/**
 * @route   GET /api/deliverymen/:userId/performance-journal
 * @desc    Récupère le détail journalier de performance pour le mois sélectionné.
 * @access  Privé (Admin uniquement)
 */
if (deliverymenController && deliverymenController.getDeliverymanPerformanceJournal) {
    router.get('/:userId/performance-journal', verifyToken, isAdmin, deliverymenController.getDeliverymanPerformanceJournal); // <--- NOUVELLE ROUTE AJOUTÉE
} else {
    console.error("ERREUR DE CONFIGURATION: deliverymenController.getDeliverymanPerformanceJournal manquant.");
    router.get('/:userId/performance-journal', verifyToken, isAdmin, (req, res) => res.status(501).json({ message: "Fonctionnalité (get perf journal) non implémentée." }));
}


/**
 * @route   GET /api/deliverymen/:userId/settings
 * @access  Privé (Admin uniquement)
 */
if (deliverymenController && deliverymenController.getDeliverymanSettings) {
    router.get('/:userId/settings', verifyToken, isAdmin, deliverymenController.getDeliverymanSettings);
} else {
    console.error("ERREUR DE CONFIGURATION: deliverymenController.getDeliverymanSettings manquant.");
    router.get('/:userId/settings', verifyToken, isAdmin, (req, res) => res.status(501).json({ message: "Fonctionnalité (get settings) non implémentée." }));
}

/**
 * @route   PUT /api/deliverymen/:userId/settings
 * @desc    Met à jour les paramètres (type, salaire/%, objectif, statut) d'un livreur.
 * @access  Privé (Admin uniquement)
 */
if (deliverymenController && deliverymenController.updateDeliverymanSettings) {
    router.put('/:userId/settings', verifyToken, isAdmin, deliverymenController.updateDeliverymanSettings);
} else {
    console.error("ERREUR DE CONFIGURATION: deliverymenController.updateDeliverymanSettings manquant.");
    router.put('/:userId/settings', verifyToken, isAdmin, (req, res) => res.status(501).json({ message: "Fonctionnalité (update settings) non implémentée." }));
}

// ... (Autres routes et placeholders) ...

module.exports = router;