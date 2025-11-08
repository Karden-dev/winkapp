// src/routes/returns.routes.js
const express = require('express');
const router = express.Router();
const orderModel = require('../models/order.model'); // Le modèle contient les fonctions de retour
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

// Protéger toutes les routes de ce module (réservé à l'Admin du Hub)
router.use(verifyToken, isAdmin);

// GET /api/returns/pending-hub : Récupère la liste des retours à gérer avec filtres
router.get('/pending-hub', async (req, res) => {
    try {
        // Les filtres sont passés via query params (date, livreur, statut de retour)
        const filters = {
            status: req.query.status, // Ex: 'pending_return_to_hub', 'received_at_hub', 'all'
            deliverymanId: req.query.deliverymanId,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        };
        
        const returns = await orderModel.findPendingReturns(filters);
        res.status(200).json(returns);
    } catch (error) {
        console.error("Erreur (GET /returns/pending-hub):", error);
        res.status(500).json({ message: 'Erreur serveur lors du chargement des retours.' });
    }
});

// PUT /api/returns/:trackingId/confirm-hub : Confirme la réception physique d'un colis retourné
router.put('/:trackingId/confirm-hub', async (req, res) => {
    try {
        const trackingId = parseInt(req.params.trackingId);
        const adminUserId = req.user.id; // L'administrateur qui confirme

        if (isNaN(trackingId)) {
            return res.status(400).json({ message: 'ID de suivi invalide.' });
        }

        const result = await orderModel.confirmHubReception(trackingId, adminUserId);

        if (result.success) {
            res.status(200).json({ message: 'Réception du retour confirmée au Hub.' });
        } else {
            res.status(400).json({ message: result.message || 'Échec de la confirmation de réception.' });
        }
    } catch (error) {
        console.error("Erreur (PUT /returns/:trackingId/confirm-hub):", error);
        res.status(500).json({ message: error.message || 'Erreur serveur lors de la confirmation du retour.' });
    }
});


module.exports = router;