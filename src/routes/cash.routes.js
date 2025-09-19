const express = require('express');
const router = express.Router();
const cashController = require('../controllers/cash.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Route pour le mini tableau de bord (métriques)
router.get('/metrics', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.getCashMetrics);

// Routes pour les transactions générales (avec filtres de recherche)
router.get('/transactions', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.getTransactions);

// Routes pour les versements (regroupés par livreur)
router.get('/remittance-summary', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.getRemittanceSummary);
router.get('/remittance-details/:deliverymanId', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.getRemittanceDetails);

// Routes pour les dépenses
router.get('/expense-categories', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.getExpenseCategories);
router.post('/expense', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.createExpense);

// Route pour le décaissement manuel
router.post('/withdrawal', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.createManualWithdrawal);

// Routes pour la gestion des transactions (modification, confirmation)
router.put('/transactions/:id', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.updateTransaction);
router.put('/confirm/:id', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.confirmTransaction);
router.put('/confirm-batch', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.confirmBatch);

// Route pour la clôture de caisse
router.post('/close-cash', authMiddleware.verifyToken, authMiddleware.isAdmin, cashController.closeCash);

module.exports = router;