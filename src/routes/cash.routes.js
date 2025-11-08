// src/routes/cash.routes.js
const express = require('express');
const router = express.Router();
const cashController = require('../controllers/cash.controller');
const authMiddleware = require('../middleware/auth.middleware'); // Assurez-vous d'avoir ce middleware

// --- METRIQUES & STATISTIQUES ---
router.get('/metrics', authMiddleware.verifyToken, cashController.getCashMetrics);


// --- TRANSACTIONS GÉNÉRIQUES (Dépenses, Décaissements) ---
router.get('/transactions', authMiddleware.verifyToken, cashController.getTransactions);
router.put('/transactions/:id', authMiddleware.verifyToken, cashController.updateTransaction);
router.delete('/transactions/:id', authMiddleware.verifyToken, cashController.deleteTransaction);


// --- VERSEMENTS LIVREURS ---
router.get('/remittance-summary', authMiddleware.verifyToken, cashController.getRemittanceSummary);
router.get('/remittance-details/:deliverymanId', authMiddleware.verifyToken, cashController.getRemittanceDetails);
router.put('/remittances/confirm', authMiddleware.verifyToken, cashController.confirmRemittance);
router.put('/remittances/:id', authMiddleware.verifyToken, cashController.updateRemittance);


// --- DÉPENSES ---
router.get('/expense-categories', authMiddleware.verifyToken, cashController.getExpenseCategories);
router.post('/expense', authMiddleware.verifyToken, cashController.createExpense);


// --- DÉCAISSEMENTS ---
router.post('/withdrawal', authMiddleware.verifyToken, cashController.createManualWithdrawal);


// --- MANQUANTS LIVREURS ---
router.get('/shortfalls', authMiddleware.verifyToken, cashController.getShortfalls);
router.put('/shortfalls/:id/settle', authMiddleware.verifyToken, cashController.settleShortfall);

// ## NOUVELLES ROUTES AJOUTÉES ICI ##
// Crée un manquant manuellement
router.post('/shortfalls', authMiddleware.verifyToken, cashController.createShortfallManually);
// Met à jour un manquant (montant, commentaire)
router.put('/shortfalls/:id', authMiddleware.verifyToken, cashController.updateShortfall);
// Supprime un manquant
router.delete('/shortfalls/:id', authMiddleware.verifyToken, cashController.deleteShortfall);


// --- CLÔTURE DE CAISSE ---
router.post('/close-cash', authMiddleware.verifyToken, cashController.closeCash);
router.get('/closing-history', authMiddleware.verifyToken, cashController.getClosingHistory);
router.get('/closing-history/export', authMiddleware.verifyToken, cashController.exportClosingHistory);


module.exports = router;