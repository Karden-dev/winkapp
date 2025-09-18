const express = require('express');
const router = express.Router();
const cashController = require('../controllers/cash.controller');

// Récupérer toutes les transactions de caisse
router.get('/transactions', cashController.getTransactions);

// Récupérer les catégories de dépenses
router.get('/expense-categories', cashController.getExpenseCategories);

// Enregistrer une nouvelle dépense
router.post('/expense', cashController.createExpense);

// Enregistrer un décaissement manuel
router.post('/withdrawal', cashController.createManualWithdrawal);

// Confirmer un versement en attente d'un livreur
router.put('/confirm/:id', cashController.confirmTransaction);

module.exports = router;