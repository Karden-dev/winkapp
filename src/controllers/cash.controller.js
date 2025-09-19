// src/controllers/cash.controller.js
const cashModel = require('../models/cash.model');
const cashService = require('../services/cash.service');

const getCashMetrics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ message: "La plage de dates est requise pour les métriques." });
        }
        const metrics = await cashService.getCashMetrics(startDate, endDate);
        res.json(metrics);
    } catch (error) {
        console.error("Erreur (getCashMetrics):", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des métriques." });
    }
};

const getTransactions = async (req, res) => {
    try {
        const filters = {
            type: req.query.type || null,
            search: req.query.search || null,
            startDate: req.query.startDate || null,
            endDate: req.query.endDate || null,
            page: req.query.page || 1,
            limit: req.query.limit || 1000
        };
        const result = await cashModel.findTransactions(filters);
        res.json(result.data);
    } catch (error) {
        console.error("Erreur (getTransactions):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const getRemittanceSummary = async (req, res) => {
    try {
        const filters = {
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            search: req.query.search
        };
        const summary = await cashModel.findRemittanceSummary(filters);
        res.json(summary);
    } catch (error) {
        console.error("Erreur (getRemittanceSummary):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const getRemittanceDetails = async (req, res) => {
    try {
        const { deliverymanId } = req.params;
        const details = await cashModel.findRemittanceDetails(deliverymanId);
        res.json(details);
    } catch (error) {
        console.error("Erreur (getRemittanceDetails):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const getExpenseCategories = async (req, res) => {
    try {
        const categories = await cashModel.getExpenseCategories();
        res.json(categories);
    } catch (error) {
        console.error("Erreur (getExpenseCategories):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const createExpense = async (req, res) => {
    try {
        const { user_id, category_id, amount, comment } = req.body;
        if (!user_id || !category_id || !amount) {
            return res.status(400).json({ message: "Tous les champs sont requis." });
        }
        await cashModel.create({ user_id, category_id, amount: -Math.abs(amount), comment, type: 'expense' });
        res.status(201).json({ message: "Dépense enregistrée." });
    } catch (error) {
        console.error("Erreur (createExpense):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const createManualWithdrawal = async (req, res) => {
    try {
        const { user_id, amount, comment } = req.body;
        if (!user_id || !amount) {
            return res.status(400).json({ message: "L'utilisateur et le montant sont requis." });
        }
        await cashModel.create({ user_id, amount: -Math.abs(amount), comment, type: 'manual_withdrawal' });
        res.status(201).json({ message: "Décaissement enregistré." });
    } catch (error) {
        console.error("Erreur (createManualWithdrawal):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const updateTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, comment } = req.body;
        const result = await cashModel.updateTransaction(id, { amount, comment }, req.user.id);
        if (result.success) {
            res.json({ message: "Transaction mise à jour." });
        } else {
            res.status(404).json({ message: "Transaction non trouvée ou déjà confirmée." });
        }
    } catch (error) {
        console.error("Erreur (updateTransaction):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const confirmTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await cashModel.confirm(id, req.user.id);
        if (result.success) {
            res.json({ message: "Transaction confirmée." });
        } else {
            res.status(404).json({ message: "Transaction non trouvée ou déjà confirmée." });
        }
    } catch (error) {
        console.error("Erreur (confirmTransaction):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const confirmBatch = async (req, res) => {
    try {
        const { transactionIds } = req.body;
        if (!transactionIds || !Array.isArray(transactionIds)) {
            return res.status(400).json({ message: "transactionIds doit être un tableau." });
        }
        const result = await cashModel.confirmBatch(transactionIds, req.user.id);
        res.json({ message: `${result.affectedRows} transactions confirmées.` });
    } catch (error) {
        console.error("Erreur (confirmBatch):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const closeCash = async (req, res) => {
    try {
        const { date, actual_cash_counted, comment } = req.body;
        if (!date || actual_cash_counted === undefined) {
            return res.status(400).json({ message: "La date et le montant compté sont requis." });
        }
        const summary = await cashModel.getDailySummaryForClosing(date);
        const total_expenses = Math.abs(parseFloat(summary.total_expenses));
        const total_withdrawals = Math.abs(parseFloat(summary.total_withdrawals));
        const total_remitted = parseFloat(summary.total_remitted);
        const total_cash_collected = parseFloat(summary.total_cash_collected);

        const expected_cash = (total_cash_collected + total_remitted) - (total_expenses + total_withdrawals);
        const difference = parseFloat(actual_cash_counted) - expected_cash;
        
        const closingData = {
            closing_date: date,
            total_cash_collected: total_cash_collected,
            total_delivery_fees: 0,
            total_expenses: total_expenses,
            total_remitted: total_remitted,
            total_withdrawals: total_withdrawals,
            expected_cash: expected_cash,
            actual_cash_counted: parseFloat(actual_cash_counted),
            difference: difference,
            comment: comment,
            closed_by_user_id: req.user.id
        };

        await cashModel.closeCashRegister(closingData);
        res.status(200).json({ message: `La caisse du ${date} a été clôturée avec succès.` });

    } catch (error) {
        console.error("Erreur (closeCash):", error);
        res.status(500).json({ message: error.message || "Erreur serveur." });
    }
};

const getCashClosings = async (req, res) => {
    try {
        const closings = await cashModel.findCashClosings(req.query);
        res.json(closings);
    } catch (error) {
        console.error("Erreur (getCashClosings):", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

const exportClosingsPdf = async (req, res) => {
    res.status(501).json({ message: "L'export PDF n'est pas encore implémenté." });
};

module.exports = {
    getCashMetrics,
    getTransactions,
    getRemittanceSummary,
    getRemittanceDetails,
    getExpenseCategories,
    createExpense,
    createManualWithdrawal,
    updateTransaction,
    confirmTransaction,
    confirmBatch,
    closeCash,
    getCashClosings,
    exportClosingsPdf
};