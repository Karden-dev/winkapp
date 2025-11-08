// src/routes/rider.routes.js
const express = require('express');
const router = express.Router();
const riderController = require('../controllers/rider.controller');
const orderModel = require('../models/order.model'); // Utiliser orderModel pour les actions directes
const { verifyToken, isRider } = require('../middleware/auth.middleware');

// --- NOUVELLES ROUTES AJOUTÉES POUR LE FLUX EN 2 ÉTAPES ---

// PUT /orders/:id/confirm-pickup-rider : 1ère étape du livreur (Confirmation de la récupération physique)
router.put('/orders/:id/confirm-pickup-rider', verifyToken, isRider, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const riderUserId = req.user.id;
        
        const result = await orderModel.confirmPickupByRider(orderId, riderUserId);
        res.status(200).json({ message: 'Récupération du colis confirmée.' });
    } catch (error) {
        console.error("Erreur (PUT /rider/orders/:id/confirm-pickup-rider):", error);
        // Utiliser le message d'erreur du modèle (Statut invalide, non assigné, etc.)
        res.status(400).json({ message: error.message || 'Échec de la confirmation de récupération.' });
    }
});

// PUT /orders/:id/start-delivery : 2ème étape du livreur (Démarrer la course après confirmation)
router.put('/orders/:id/start-delivery', verifyToken, isRider, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const riderUserId = req.user.id;
        
        const result = await orderModel.startDelivery(orderId, riderUserId);
        res.status(200).json({ message: 'Course démarrée (En route).' });
    } catch (error) {
        console.error("Erreur (PUT /rider/orders/:id/start-delivery):", error);
        // Utiliser le message d'erreur du modèle (Vérification 'picked_up_by_rider_at' échouée)
        res.status(400).json({ message: error.message || 'Échec du démarrage de la course.' });
    }
});

// --- ROUTES EXISTANTES ---

router.get('/orders', verifyToken, isRider, riderController.getRiderOrders);
router.get('/cash-owed/:riderId', verifyToken, isRider, riderController.getRiderOwedAmount);
router.get('/cash-transactions/:riderId', verifyToken, isRider, riderController.getRiderCashTransactions);
router.post('/remittance', verifyToken, isRider, riderController.submitRemittance);
router.get('/counts', verifyToken, isRider, riderController.getOrdersCounts);
router.get('/notifications', verifyToken, isRider, riderController.getRiderNotifications);
router.get('/cash-details', verifyToken, isRider, riderController.getRiderCashPageDetails);


module.exports = router;