// src/routes/schedule.routes.js
const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/schedule.controller');
// Assurez-vous d'importer le middleware isAdmin
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

// --- Routes pour les Objectifs Mensuels (Admin) ---

/**
 * @route   GET /api/schedule/objectives
 * @desc    Récupère l'objectif pour un mois donné (ou mois courant).
 * @access  Privé (Admin uniquement)
 * @query   month_year (format YYYY-MM, optionnel)
 */
router.get('/objectives', verifyToken, isAdmin, scheduleController.getObjectiveForMonth);

/**
 * @route   PUT /api/schedule/objectives
 * @desc    Crée ou met à jour l'objectif pour un mois donné.
 * @access  Privé (Admin uniquement)
 * @body    { month_year, target_deliveries_moto, bonus_tiers_moto }
 */
router.put('/objectives', verifyToken, isAdmin, scheduleController.setObjectiveForMonth);

// --- Routes pour les Absences/Fériés (Admin) ---

/**
 * @route   POST /api/schedule/absences
 * @desc    Enregistre un événement (absence, permission, férié).
 * @access  Privé (Admin uniquement)
 * @body    { absence_date, type, motif, user_ids (array|null) }
 */
router.post('/absences', verifyToken, isAdmin, scheduleController.createAbsenceEvent);

/**
 * @route   GET /api/schedule/absences
 * @desc    Récupère les événements pour une période donnée (et optionnellement pour un user).
 * @access  Privé (Admin uniquement)
 * @query   startDate, endDate, userId (optionnel)
 */
router.get('/absences', verifyToken, isAdmin, scheduleController.getAbsences);

/**
 * @route   DELETE /api/schedule/absences/:absenceId
 * @desc    Supprime un événement d'absence/férié.
 * @access  Privé (Admin uniquement)
 */
router.delete('/absences/:absenceId', verifyToken, isAdmin, scheduleController.deleteAbsence);


module.exports = router;