// src/controllers/schedule.controller.js
const scheduleModel = require('../models/schedule.model');
const moment = require('moment');

// --- Contrôleurs pour Monthly Objectives ---

const getObjectiveForMonth = async (req, res) => {
    try {
        const monthYear = req.query.month_year || moment().format('YYYY-MM'); // Mois courant par défaut
        if (!/^\d{4}-\d{2}$/.test(monthYear)) {
            return res.status(400).json({ message: "Format month_year invalide (YYYY-MM attendu)." });
        }
        const objective = await scheduleModel.getOrInitializeObjective(monthYear);
        if (objective) {
            res.json(objective);
        } else {
            // Renvoyer un objet vide ou avec des valeurs par défaut si aucun objectif n'est défini
            res.json({ month_year: monthYear, target_deliveries_moto: null, bonus_tiers_moto: null });
        }
    } catch (error) {
        console.error("Erreur getObjectiveForMonth:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération de l'objectif." });
    }
};

const setObjectiveForMonth = async (req, res) => {
    try {
        const { month_year, target_deliveries_moto, bonus_tiers_moto } = req.body;
        if (!month_year || !/^\d{4}-\d{2}$/.test(month_year)) {
            return res.status(400).json({ message: "Le champ month_year (YYYY-MM) est requis." });
        }
        // Valider bonus_tiers_moto si fourni (doit être un tableau d'objets)
        if (bonus_tiers_moto && !Array.isArray(bonus_tiers_moto)) {
             return res.status(400).json({ message: "bonus_tiers_moto doit être un tableau." });
        }

        const result = await scheduleModel.upsertObjective(month_year, target_deliveries_moto, bonus_tiers_moto);
        if (result.success) {
            res.json({ message: `Objectif pour ${month_year} enregistré/mis à jour.` });
        } else {
             res.status(500).json({ message: "Échec de l'enregistrement de l'objectif." });
        }
    } catch (error) {
        console.error("Erreur setObjectiveForMonth:", error);
        res.status(500).json({ message: "Erreur serveur lors de l'enregistrement de l'objectif." });
    }
};

// --- Contrôleurs pour Rider Absences ---

const createAbsenceEvent = async (req, res) => {
    try {
        const { absence_date, type, motif, user_ids } = req.body; // user_ids est un tableau ou null
        const createdByUserId = req.user.id; // ID de l'admin connecté

        if (!absence_date || !type || (type !== 'ferie' && (!user_ids || user_ids.length === 0))) {
            return res.status(400).json({ message: "Date, type et user_ids (sauf si férié) sont requis." });
        }
        if (!moment(absence_date, 'YYYY-MM-DD', true).isValid()) {
             return res.status(400).json({ message: "Format de date invalide (YYYY-MM-DD attendu)." });
        }

        const result = await scheduleModel.addAbsenceEvent(absence_date, type, motif, user_ids, createdByUserId);
        if (result.success) {
             res.status(201).json({ message: "Événement enregistré avec succès.", count: result.count });
        } else {
             res.status(500).json({ message: "Échec de l'enregistrement." });
        }

    } catch (error) {
        console.error("Erreur createAbsenceEvent:", error);
        res.status(500).json({ message: error.message || "Erreur serveur lors de l'ajout de l'événement." });
    }
};

const getAbsences = async (req, res) => {
    try {
        // Par défaut: le mois courant
        const startDate = req.query.startDate || moment().startOf('month').format('YYYY-MM-DD');
        const endDate = req.query.endDate || moment().endOf('month').format('YYYY-MM-DD');
        const userId = req.query.userId || null; // Optionnel pour filtrer par livreur

        const events = await scheduleModel.getAbsenceEvents(startDate, endDate, userId);
        res.json(events);
    } catch (error) {
        console.error("Erreur getAbsences:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des absences." });
    }
};

const deleteAbsence = async (req, res) => {
    try {
        const { absenceId } = req.params;
        if (!absenceId || isNaN(parseInt(absenceId))) {
             return res.status(400).json({ message: "ID d'absence invalide." });
        }

        const result = await scheduleModel.deleteAbsenceEvent(parseInt(absenceId));
        if (result.success) {
            res.json({ message: "Événement supprimé avec succès." });
        } else {
            res.status(404).json({ message: "Événement non trouvé." });
        }
    } catch (error) {
        console.error("Erreur deleteAbsence:", error);
        res.status(500).json({ message: "Erreur serveur lors de la suppression de l'événement." });
    }
};


module.exports = {
    getObjectiveForMonth,
    setObjectiveForMonth,
    createAbsenceEvent,
    getAbsences,
    deleteAbsence
};