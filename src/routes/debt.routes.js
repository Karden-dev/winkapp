const express = require('express');
const router = express.Router();
const debtController = require('../controllers/debt.controller');

// GET / : Récupérer toutes les créances avec filtres
router.get('/', debtController.getAllDebts);

// GET /:id : Récupérer une seule créance par son ID (AJOUTÉ)
router.get('/:id', debtController.getDebtById);

// POST / : Créer une nouvelle créance
router.post('/', debtController.createDebt);

// PUT /:id : Modifier une créance
router.put('/:id', debtController.updateDebt);

// DELETE /:id : Supprimer une créance
router.delete('/:id', debtController.deleteDebt);

// PUT /:id/settle : Régler une créance
router.put('/:id/settle', debtController.settleDebt);

module.exports = router;