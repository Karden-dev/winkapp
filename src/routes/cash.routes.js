// src/routes/cash.routes.js
const express = require('express');
const router = express.Router();
const cashController = require('../controllers/cash.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Routes protégées pour les administrateurs
router.use(authMiddleware.verifyToken, authMiddleware.isAdmin);

// Route pour le mini tableau de bord (métriques)
router.get('/metrics', cashController.getCashMetrics);

// Routes pour les transactions générales
router.get('/transactions', cashController.getTransactions);

// Routes pour les versements
router.get('/remittance-summary', cashController.getRemittanceSummary);
router.get('/remittance-details/:deliverymanId', cashController.getRemittanceDetails);

// Routes pour les dépenses
router.get('/expense-categories', cashController.getExpenseCategories);
router.post('/expense', cashController.createExpense);

// Route pour le décaissement manuel
router.post('/withdrawal', cashController.createManualWithdrawal);

// Routes pour la gestion des transactions
router.put('/transactions/:id', cashController.updateTransaction);
router.put('/confirm/:id', cashController.confirmTransaction);
router.put('/confirm-batch', cashController.confirmBatch);

// Routes pour la clôture de caisse
router.post('/close', cashController.closeCash);
router.get('/closings', cashController.getCashClosings);

module.exports = router;