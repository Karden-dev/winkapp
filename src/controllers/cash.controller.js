const cashModel = require('../models/cash.model');
const cashService = require('../services/cash.service.js');

const getCashMetrics = async (req, res) => {
    try {
        const metrics = await cashService.getCashMetrics();
        res.json(metrics);
    } catch (error) {
        console.error("Erreur lors de la récupération des métriques de caisse :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des métriques." });
    }
};

const getTransactions = async (req, res) => {
    try {
        const filters = {
            search: req.query.search || null,
            type: req.query.type || null,
            status: req.query.status || null,
            startDate: req.query.startDate || null,
            endDate: req.query.endDate || null
        };
        const transactions = await cashModel.findAllTransactions(filters);
        res.json(transactions);
    } catch (error) {
        console.error("Erreur lors de la récupération des transactions :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des transactions." });
    }
};

const getTransactionById = async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await cashModel.findTransactionById(id);
        if (transaction) {
            res.json(transaction);
        } else {
            res.status(404).json({ message: "Transaction non trouvée." });
        }
    } catch (error) {
        console.error("Erreur lors de la récupération d'une transaction par ID :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération de la transaction." });
    }
};

const getRemittanceSummary = async (req, res) => {
    try {
        const summary = await cashModel.getRemittanceSummary();
        res.json(summary);
    } catch (error) {
        console.error("Erreur lors de la récupération du résumé des versements :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération du résumé." });
    }
};

const getRemittanceDetails = async (req, res) => {
    try {
        const { deliverymanId } = req.params;
        const details = await cashModel.getRemittanceDetails(deliverymanId);
        res.json(details);
    } catch (error) {
        console.error("Erreur lors de la récupération des détails des versements :", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des détails." });
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
            amount: -Math.abs(amount),
            comment
        };
        const newTransactionId = await cashModel.createTransaction(transactionData);
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
        const result = await cashModel.confirmTransaction(id, validated_by);
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
            category_id: null,
            amount: -Math.abs(amount),
            comment
        };
        const newTransactionId = await cashModel.createTransaction(transactionData);
        res.status(201).json({ message: "Décaissement manuel enregistré avec succès.", transactionId: newTransactionId });
    } catch (error) {
        console.error("Erreur lors de l'enregistrement d'un décaissement manuel :", error);
        res.status(500).json({ message: "Erreur serveur lors de l'enregistrement du décaissement." });
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

const updateTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, comment } = req.body;
        const updatedAmount = amount < 0 ? amount : -Math.abs(amount);
        const result = await cashModel.updateTransaction(id, { amount: updatedAmount, comment });
        if (result.success) {
            res.json({ message: "Transaction mise à jour avec succès." });
        } else {
            res.status(404).json({ message: "Transaction non trouvée." });
        }
    } catch (error) {
        console.error("Erreur lors de la mise à jour de la transaction :", error);
        res.status(500).json({ message: "Erreur serveur lors de la mise à jour de la transaction." });
    }
};

const deleteTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await cashModel.deleteTransaction(id);
        if (result.success) {
            res.json({ message: "Transaction supprimée avec succès." });
        } else {
            res.status(404).json({ message: "Transaction non trouvée." });
        }
    } catch (error) {
        console.error("Erreur lors de la suppression de la transaction :", error);
        res.status(500).json({ message: "Erreur serveur lors de la suppression de la transaction." });
    }
};

const closeCash = async (req, res) => {
    res.status(501).json({ message: 'La clôture de caisse n\'est pas encore implémentée.' });
};

module.exports = {
    getCashMetrics,
    getTransactions,
    getTransactionById,
    getRemittanceSummary,
    getRemittanceDetails,
    getExpenseCategories,
    createExpense,
    confirmTransaction,
    createManualWithdrawal,
    confirmBatch,
    updateTransaction,
    deleteTransaction,
    closeCash
};