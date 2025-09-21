// src/routes/cash.routes.js
const express = require('express');
const router = express.Router();
const cashController = require('../controllers/cash.controller');

// --- METRIQUES & STATISTIQUES ---
// Calcule les totaux pour les cartes "Situation de la caisse"
router.get('/metrics', cashController.getCashMetrics);


// --- TRANSACTIONS GÉNÉRIQUES (Dépenses, Décaissements) ---
// Récupère les transactions par type (utilisé pour les onglets Dépenses et Décaissements)
router.get('/transactions', cashController.getTransactions);
// Met à jour une transaction spécifique (ex: modifier une dépense)
router.put('/transactions/:id', cashController.updateTransaction);
// Supprime une transaction spécifique
router.delete('/transactions/:id', cashController.deleteTransaction);


// --- VERSEMENTS LIVREURS ---
// Récupère le résumé des versements par livreur pour la page principale
router.get('/remittance-summary', cashController.getRemittanceSummary);
// Récupère les détails des versements pour un livreur (pour la modale)
router.get('/remittance-details/:deliverymanId', cashController.getRemittanceDetails);
// Met à jour le montant d'un versement
router.put('/remittances/:id', cashController.updateRemittance);
// Confirme un ou plusieurs versements et crée un manquant si nécessaire
router.put('/remittances/confirm', cashController.confirmRemittance);


// --- DÉPENSES ---
router.get('/expense-categories', cashController.getExpenseCategories);
router.post('/expense', cashController.createExpense);


// --- DÉCAISSEMENTS ---
router.post('/withdrawal', cashController.createManualWithdrawal);


// --- MANQUANTS LIVREURS ---
router.get('/shortfalls', cashController.getShortfalls);
router.put('/shortfalls/:id/settle', cashController.settleShortfall);


// --- CLÔTURE DE CAISSE ---
router.post('/close-cash', cashController.closeCash);
router.get('/closing-history', cashController.getClosingHistory);
// Route pour l'export CSV de l'historique
router.get('/closing-history/export', cashController.exportClosingHistory);


module.exports = router;