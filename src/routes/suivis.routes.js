// src/routes/suivis.routes.js
const express = require('express');
const router = express.Router();
const suivisController = require('../controllers/suivis.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

// --- Routes pour l'onglet Suivis (Admin) ---
// Fixe la 404 pour /api/suivis/conversations
router.get('/suivis/conversations', verifyToken, isAdmin, suivisController.getConversations);

// --- Routes Communes (Admin + Livreur) ---
// Fixe la 404 pour /api/suivis/unread-count
router.get('/suivis/unread-count', verifyToken, suivisController.getTotalUnreadCount);
// Fixe la 404 pour /api/suivis/quick-replies
router.get('/suivis/quick-replies', verifyToken, suivisController.getQuickReplies);

// --- Routes Messages (liées aux commandes) ---
// Ces routes sont définies sans le prefixe /suivis pour le moment, car c'est le conventionnel /api/orders/...
router.get('/orders/:orderId/messages', verifyToken, suivisController.getMessages);
router.post('/orders/:orderId/messages', verifyToken, suivisController.postMessage);

// --- Routes Actions Admin depuis le Chat (Fixe la 404 en ajoutant le préfixe) ---
router.put('/suivis/orders/:orderId/reassign-from-chat', verifyToken, isAdmin, suivisController.reassignFromChat);
router.put('/suivis/orders/:orderId/reset-status-from-chat', verifyToken, isAdmin, suivisController.resetStatusFromChat);
router.put('/suivis/orders/:orderId/toggle-urgency', verifyToken, isAdmin, suivisController.toggleUrgency);

module.exports = router;