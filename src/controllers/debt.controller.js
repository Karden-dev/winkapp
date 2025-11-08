// src/controllers/debt.controller.js
const debtModel = require('../models/debt.model');

const getAllDebts = async (req, res) => {
    try {
        const filters = {
            search: req.query.search || null,
            status: req.query.status || null,
            startDate: req.query.startDate || null,
            endDate: req.query.endDate || null
        };
        const debts = await debtModel.findAll(filters);
        res.json(debts);
    } catch (error) {
        console.error("Erreur lors de la récupération des créances :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des créances." });
    }
};

const getDebtById = async (req, res) => {
    try {
        const { id } = req.params;
        const debt = await debtModel.findById(id);
        if (debt) {
            res.json(debt);
        } else {
            res.status(404).json({ message: "Créance non trouvée." });
        }
    } catch (error) {
        console.error("Erreur lors de la récupération d'une créance par ID :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération de la créance." });
    }
};

const createDebt = async (req, res) => {
    try {
        const { shop_id, amount, type, comment, created_by, created_at } = req.body;
        if (!shop_id || !amount || !type || !created_by || !created_at) {
            return res.status(400).json({ message: "Tous les champs sont requis." });
        }
        const newDebtId = await debtModel.create({ shop_id, amount, type, comment, created_by, created_at });
        res.status(201).json({ message: "Créance créée avec succès.", debtId: newDebtId });
    } catch (error) {
        console.error("Erreur lors de la création d'une créance :", error);
        res.status(500).json({ message: "Erreur serveur lors de la création de la créance." });
    }
};

const updateDebt = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, comment, updated_by } = req.body;
        const result = await debtModel.update(id, { amount, comment }, updated_by);
        if (result.success) {
            res.json({ message: "Créance mise à jour avec succès." });
        } else {
            res.status(403).json({ message: "Mise à jour non autorisée ou créance non trouvée." });
        }
    } catch (error) {
        console.error("Erreur lors de la mise à jour d'une créance :", error);
        res.status(500).json({ message: "Erreur serveur lors de la mise à jour de la créance." });
    }
};

const deleteDebt = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await debtModel.remove(id);
        if (result.success) {
            res.json({ message: "Créance supprimée avec succès." });
        } else {
            res.status(403).json({ message: "Suppression non autorisée ou créance non trouvée." });
        }
    } catch (error) {
        console.error("Erreur lors de la suppression d'une créance :", error);
        res.status(500).json({ message: "Erreur serveur lors de la suppression de la créance." });
    }
};

const settleDebt = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) {
             return res.status(400).json({ message: "Le champ userId est requis pour régler la créance." });
        }
        const result = await debtModel.settle(id, userId);
        if (result.success) {
            res.json({ message: "Créance réglée avec succès." });
        } else {
            res.status(404).json({ message: "Créance non trouvée." });
        }
    } catch (error) {
        console.error("Erreur lors du règlement d'une créance :", error);
        res.status(500).json({ message: "Erreur serveur lors du règlement de la créance." });
    }
};


module.exports = {
    getAllDebts,
    getDebtById,
    createDebt,
    updateDebt,
    deleteDebt,
    settleDebt
};