const cashModel = require('../models/cash.model');

const getTransactions = async (req, res) => {
    try {
        const filters = {
            search: req.query.search || null,
            type: req.query.type || null,
            status: req.query.status || null,
            startDate: req.query.startDate || null,
            endDate: req.query.endDate || null
        };
        const transactions = await cashModel.findAll(filters);
        res.json(transactions);
    } catch (error) {
        console.error("Erreur lors de la récupération des transactions :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des transactions." });
    }
};

const getExpenseCategories = async (req, res) => {
    try {
        const categories = await cashModel.getExpenseCategories();
        res.json(categories);
    } catch (error) {
        console.error("Erreur lors de la récupération des catégories de dépenses :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des catégories." });
    }
};

const createExpense = async (req, res) => {
    try {
        const { user_id, category_id, amount, comment } = req.body;
        if (!user_id || !category_id || !amount) {
            return res.status(400).json({ message: "Les champs user_id, category_id et amount sont requis." });
        }
        const transactionData = {
            user_id,
            type: 'expense',
            category_id,
            amount: -Math.abs(amount), // Les dépenses sont négatives
            comment
        };
        const newTransactionId = await cashModel.create(transactionData);
        res.status(201).json({ message: "Dépense enregistrée avec succès.", transactionId: newTransactionId });
    } catch (error) {
        console.error("Erreur lors de l'enregistrement d'une dépense :", error);
        res.status(500).json({ message: "Erreur serveur lors de l'enregistrement de la dépense." });
    }
};

const confirmTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { validated_by } = req.body;
        if (!validated_by) {
            return res.status(400).json({ message: "Le champ validated_by est requis." });
        }
        const result = await cashModel.confirm(id, validated_by);
        if (result.success) {
            res.json({ message: "Transaction confirmée avec succès." });
        } else {
            res.status(404).json({ message: "Transaction non trouvée ou déjà confirmée." });
        }
    } catch (error) {
        console.error("Erreur lors de la confirmation de la transaction :", error);
        res.status(500).json({ message: "Erreur serveur lors de la confirmation de la transaction." });
    }
};

const createManualWithdrawal = async (req, res) => {
    try {
        const { user_id, amount, comment } = req.body;
        if (!user_id || !amount) {
            return res.status(400).json({ message: "Les champs user_id et amount sont requis." });
        }
        const transactionData = {
            user_id,
            type: 'manual_withdrawal',
            amount: -Math.abs(amount), // Les retraits sont négatifs
            comment
        };
        const newTransactionId = await cashModel.create(transactionData);
        res.status(201).json({ message: "Décaissement manuel enregistré avec succès.", transactionId: newTransactionId });
    } catch (error) {
        console.error("Erreur lors de l'enregistrement d'un décaissement manuel :", error);
        res.status(500).json({ message: "Erreur serveur lors de l'enregistrement du décaissement." });
    }
};

const getRemittanceSummary = async (req, res) => {
    try {
        const summary = await cashModel.findRemittanceSummary();
        res.json(summary);
    } catch (error) {
        console.error("Erreur lors de la récupération du résumé des versements :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération du résumé." });
    }
};

const getRemittanceDetails = async (req, res) => {
    try {
        const { deliverymanId } = req.params;
        const details = await cashModel.findRemittanceDetails(deliverymanId);
        res.json(details);
    } catch (error) {
        console.error("Erreur lors de la récupération des détails des versements :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des détails." });
    }
};

const confirmBatch = async (req, res) => {
    try {
        const { transactionIds, validated_by } = req.body;
        if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0 || !validated_by) {
            return res.status(400).json({ message: "Les champs transactionIds (tableau d'ID) et validated_by sont requis." });
        }
        const result = await cashModel.confirmBatch(transactionIds, validated_by);
        if (result.success) {
            res.json({ message: `${result.affectedRows} transactions confirmées avec succès.` });
        } else {
            res.status(404).json({ message: "Aucune transaction trouvée ou confirmée." });
        }
    } catch (error) {
        console.error("Erreur lors de la confirmation par lot :", error);
        res.status(500).json({ message: "Erreur serveur lors de la confirmation par lot." });
    }
};

module.exports = {
    getTransactions,
    getExpenseCategories,
    createExpense,
    confirmTransaction,
    createManualWithdrawal,
    getRemittanceSummary,
    getRemittanceDetails,
    confirmBatch
};