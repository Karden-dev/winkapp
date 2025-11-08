// src/routes/performance.routes.js
const express = require('express');
const router = express.Router();
// Importe le contrôleur que nous avons défini à l'étape précédente
const performanceController = require('../controllers/performance.controller');
// Importe les middlewares pour vérifier l'authentification et le rôle
const { verifyToken, isRider } = require('../middleware/auth.middleware'); //

/**
 * @route   GET /api/performance
 * @desc    Récupère les données de performance détaillées pour le livreur connecté.
 * @access  Privé (Livreur uniquement)
 * @query   period - La période souhaitée (ex: 'current_month', 'today', 'last_month')
 */
router.get('/', verifyToken, isRider, performanceController.getRiderPerformance); //

/**
 * @route   PUT /api/performance/personal-goals
 * @desc    Met à jour les objectifs personnels pour le livreur connecté.
 * @access  Privé (Livreur uniquement)
 * @body    { daily: number|null, weekly: number|null, monthly: number|null }
 */
router.put('/personal-goals', verifyToken, isRider, performanceController.updatePersonalGoals); //

// --- Routes pour l'Admin (Gestion via deliverymen.html) ---
// Note : Ces routes nécessiteront un middleware isAdmin si elles sont placées ici,
// ou elles pourraient être intégrées dans deliverymen.routes.js.
// Pour l'instant, on se concentre sur l'accès livreur.

/* Exemple de routes admin possibles (à définir et sécuriser avec isAdmin)
const { isAdmin } = require('../middleware/auth.middleware');

// Route pour récupérer les détails de performance d'un livreur spécifique (pour l'admin)
router.get('/admin/:userId', verifyToken, isAdmin, performanceController.getSpecificRiderPerformanceForAdmin);

// Route pour mettre à jour les paramètres d'un livreur (type, salaire, objectif admin...)
router.put('/admin/:userId/settings', verifyToken, isAdmin, performanceController.updateRiderSettingsByAdmin);

// Routes pour gérer les absences (ajoutées séparément ou ici)
router.post('/admin/absences', verifyToken, isAdmin, performanceController.addAbsenceEvent);
router.get('/admin/absences', verifyToken, isAdmin, performanceController.getAbsenceEvents);
router.delete('/admin/absences/:absenceId', verifyToken, isAdmin, performanceController.deleteAbsenceEvent);
*/

module.exports = router;