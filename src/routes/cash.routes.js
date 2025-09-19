const express = require('express');
const router = express.Router();
const cashController = require('../controllers/cash.controller');

// Récupérer toutes les transactions de caisse
router.get('/transactions', cashController.getTransactions);

// Récupérer le récapitulatif des versements par livreur
router.get('/remittances/summary', cashController.getRemittanceSummary);

// Récupérer les détails des versements en attente pour un livreur
router.get('/remittances/details/:deliverymanId', cashController.getRemittanceDetails);

// Récupérer les catégories de dépenses
router.get('/expense-categories', cashController.getExpenseCategories);

// Enregistrer une nouvelle dépense
router.post('/expense', cashController.createExpense);

// Enregistrer un décaissement manuel
router.post('/withdrawal', cashController.createManualWithdrawal);

// Confirmer un versement en attente d'un livreur
router.put('/confirm/:id', cashController.confirmTransaction);

// Confirmer plusieurs versements en bloc
router.put('/confirm-batch', cashController.confirmBatch);

module.exports = router;