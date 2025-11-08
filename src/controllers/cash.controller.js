const moment = require('moment');
const cashModel = require('../models/cash.model');
const orderModel = require('../models/order.model'); // NOUVEL IMPORT
const cashService = require('../services/cash.service'); 
const cashClosingService = require('../services/cash.closing.service'); 
const { Parser } = require('json2csv');

const formatAmount = (amount) => `${parseInt(amount || 0).toLocaleString('fr-FR')} FCFA`;

const getTransactions = async (req, res) => {
    try {
        const filters = {
            type: req.query.type || null,
            startDate: req.query.startDate || null,
            endDate: req.query.endDate || null,
            search: req.query.search || null
        };
        const transactions = await cashModel.findAll(filters);
        res.json(transactions);
    } catch (error) {
        console.error("Erreur getTransactions:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des transactions." });
    }
};

const updateTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, comment } = req.body;
        if (amount === undefined || amount === null) {
            return res.status(400).json({ message: "Le montant est requis." });
        }
        await cashModel.update(id, { amount: -Math.abs(parseFloat(amount)), comment });
        res.json({ message: "Transaction mise à jour avec succès." });
    } catch (error) {
        console.error("Erreur updateTransaction:", error);
        res.status(500).json({ message: "Erreur lors de la mise à jour de la transaction." });
    }
};

const deleteTransaction = async (req, res) => {
    try {
        const { id } = req.params;
        await cashModel.remove(id);
        res.json({ message: "Transaction supprimée avec succès." });
    } catch (error) {
        console.error("Erreur deleteTransaction:", error);
        res.status(500).json({ message: "Erreur lors de la suppression de la transaction." });
    }
};

const getExpenseCategories = async (req, res) => {
    try {
        const categories = await cashModel.getExpenseCategories();
        res.json(categories);
    } catch (error) {
        console.error("Erreur getExpenseCategories:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des catégories." });
    }
};

const createExpense = async (req, res) => {
    try {
        const { user_id, category_id, amount, comment, created_at } = req.body;
        if (!user_id || !category_id || amount === undefined || amount === null) {
            return res.status(400).json({ message: "Tous les champs (utilisateur, catégorie, montant) sont requis." });
        }
        const transactionData = { user_id, type: 'expense', category_id, amount: -Math.abs(parseFloat(amount)), comment, created_at };
        await cashModel.create(transactionData);
        res.status(201).json({ message: "Dépense enregistrée avec succès." });
    } catch (error) {
        console.error("Erreur createExpense:", error);
        res.status(500).json({ message: "Erreur serveur lors de l'enregistrement de la dépense." });
    }
};

const createManualWithdrawal = async (req, res) => {
    try {
        const { amount, comment, user_id, created_at } = req.body;
        if (amount === undefined || amount === null || !user_id) {
            return res.status(400).json({ message: "Le montant et l'ID de l'utilisateur sont requis." });
        }
        const transactionData = { user_id, type: 'manual_withdrawal', amount: -Math.abs(parseFloat(amount)), comment, created_at, category_id: null };
        await cashModel.create(transactionData);
        res.status(201).json({ message: "Décaissement enregistré avec succès." });
    } catch (error) {
        console.error("Erreur createManualWithdrawal:", error);
        res.status(500).json({ message: "Erreur serveur lors du décaissement." });
    }
};

const getRemittanceSummary = async (req, res) => {
    try {
        const { startDate, endDate, search } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ message: "La période (startDate, endDate) est requise." });
        }
        const summary = await cashModel.findRemittanceSummary(startDate, endDate, search);
        res.json(summary);
    } catch (error) {
        console.error("Erreur getRemittanceSummary:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération du résumé des versements." });
    }
};

const getRemittanceDetails = async (req, res) => {
    try {
        const { deliverymanId } = req.params;
        const { date } = req.query;

        if (!date || !moment(date, 'YYYY-MM-DD', true).isValid()) {
            return res.status(400).json({ message: "Format de date invalide ou date manquante. Format attendu: YYYY-MM-DD." });
        }

        const orders = await cashModel.getOrdersForCashByDate(deliverymanId, date);
        const totalExpected = orders.reduce((sum, order) => sum + parseFloat(order.expected_amount), 0);

        res.json({ orders: orders, totalExpected: totalExpected });
        
    } catch (error) {
        console.error("Erreur getRemittanceDetails:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des détails." });
    }
};

const updateRemittance = async (req, res) => {
    try {
        const { id } = req.params; // Ici, 'id' est l'ID de la commande
        const { amount } = req.body;
        if (amount === undefined || amount === null) {
            return res.status(400).json({ message: "Le montant est requis." });
        }
        
        await orderModel.update(id, { article_amount: parseFloat(amount) }, req.user.id);
        
        res.json({ message: "Montant de la commande mis à jour." });
    } catch (error) {
        console.error("Erreur updateRemittance (amount):", error);
        res.status(500).json({ message: "Erreur lors de la mise à jour." });
    }
};

const confirmRemittance = async (req, res) => {
    try {
        const { deliverymanId, paidAmount, orderIds, date } = req.body;
        const userId = req.user.id; // L'ID de l'admin qui confirme

        if (!deliverymanId || !orderIds || !Array.isArray(orderIds) || orderIds.length === 0 || paidAmount === undefined || !date) {
            return res.status(400).json({ message: "Données de confirmation invalides." });
        }

        await cashModel.create({
            user_id: deliverymanId,
            type: 'remittance',
            amount: parseFloat(paidAmount),
            comment: `Versement pour les commandes: ${orderIds.join(', ')}`,
            status: 'confirmed',
            created_at: date, // Utilise la date fournie par le frontend
            validated_by: userId,
            validated_at: new Date() // Utilise la date actuelle pour la validation
        });

        res.status(200).json({ 
            message: "Versement confirmé avec succès."
        });

    } catch (error) {
        console.error("Erreur dans le contrôleur confirmRemittance:", error);
        res.status(500).json({ message: error.message || "Erreur serveur lors de la confirmation." });
    }
};

const getShortfalls = async (req, res) => {
    try {
        const filters = { status: req.query.status, search: req.query.search || null };
        const shortfalls = await cashModel.findShortfalls(filters);
        res.json(shortfalls);
    } catch (error) {
        console.error("Erreur getShortfalls:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des manquants." });
    }
};

const createShortfallManually = async (req, res) => {
    try {
        const { deliverymanId, amount, comment, date } = req.body;
        const created_by_user_id = req.user.id;

        if (!deliverymanId || !amount || amount <= 0 || !date) {
            return res.status(400).json({ message: "L'ID du livreur, un montant positif et une date sont requis." });
        }

        const shortfallId = await cashModel.createShortfall({
            deliveryman_id: deliverymanId,
            amount: parseFloat(amount),
            comment: comment || 'Manquant créé manuellement',
            created_at: date,
            created_by_user_id
        });

        res.status(201).json({ message: "Manquant créé avec succès.", id: shortfallId });

    } catch (error) {
        console.error("Erreur createShortfallManually:", error);
        res.status(500).json({ message: "Erreur serveur lors de la création du manquant." });
    }
};

const updateShortfall = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, comment } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Un montant positif est requis." });
        }
        
        const result = await cashModel.updateShortfall(id, { amount: parseFloat(amount), comment });
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Manquant non trouvé ou déjà réglé." });
        }
        res.json({ message: "Manquant mis à jour avec succès." });
    } catch (error) {
        console.error("Erreur updateShortfall:", error);
        res.status(500).json({ message: "Erreur serveur lors de la mise à jour du manquant." });
    }
};

const deleteShortfall = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await cashModel.deleteShortfall(id);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Manquant non trouvé ou déjà réglé." });
        }
        res.json({ message: "Manquant supprimé avec succès." });
    } catch (error) {
        console.error("Erreur deleteShortfall:", error);
        res.status(500).json({ message: "Erreur serveur lors de la suppression du manquant." });
    }
};

const settleShortfall = async (req, res) => {
    try {
        const { id } = req.params;
        const { amountPaid, settlementDate } = req.body;
        const userId = req.user.id;

        if (!amountPaid || amountPaid <= 0 || !settlementDate) {
            return res.status(400).json({ message: "Le montant payé et la date de règlement sont requis." });
        }
        await cashModel.settleShortfall(id, parseFloat(amountPaid), userId, settlementDate);
        res.json({ message: "Règlement du manquant enregistré." });
    } catch (error) {
        console.error("Erreur settleShortfall:", error);
        res.status(500).json({ message: error.message || "Erreur serveur lors du règlement du manquant." });
    }
};

const closeCash = async (req, res) => {
    try {
        const { closingDate, actualCash, comment } = req.body;
        const userId = req.user.id;
        if (!closingDate || actualCash === undefined || !userId) {
            return res.status(400).json({ message: "La date de clôture, le montant compté et l'ID de l'utilisateur sont requis." });
        }
        const result = await cashClosingService.performCashClosing(closingDate, parseFloat(actualCash), comment, userId);
        res.status(200).json({ message: 'Caisse clôturée avec succès.', data: result });
    } catch (error) {
        console.error("Erreur closeCash:", error);
        res.status(500).json({ message: error.message || "Erreur serveur lors de la clôture de caisse." });
    }
};

const getClosingHistory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const history = await cashClosingService.findClosingHistory({ startDate, endDate });
        res.json(history);
    } catch (error) {
        console.error("Erreur getClosingHistory:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération de l'historique." });
    }
};

const getCashMetrics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const metrics = await cashService.getCashMetrics(startDate, endDate);
        res.json(metrics);
    } catch (error) {
        console.error("Erreur getCashMetrics:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des métriques." });
    }
};

const exportClosingHistory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const historyData = await cashClosingService.findClosingHistory({ startDate, endDate });

        if (historyData.length === 0) {
            return res.status(404).send('Aucun historique à exporter pour cette période.');
        }

        const fields = [
            { label: 'Date', value: row => moment(row.closing_date).format('DD/MM/YYYY') },
            { label: 'Attendu (FCFA)', value: 'expected_cash' },
            { label: 'Compté (FCFA)', value: 'actual_cash_counted' },
            { label: 'Différence (FCFA)', value: 'difference' },
            { label: 'Clôturé par', value: 'closed_by_user_name' },
            { label: 'Commentaire', value: 'comment' }
        ];
        
        const json2csvParser = new Parser({ fields, delimiter: ';' });
        const csv = json2csvParser.parse(historyData);

        res.header('Content-Type', 'text/csv; charset=utf-8');
        const fileName = `historique_cloture_${moment().format('YYYY-MM-DD')}.csv`;
        res.attachment(fileName);
        res.send(Buffer.from(csv, 'latin1'));
    } catch (error) {
        console.error("Erreur exportClosingHistory:", error);
        res.status(500).json({ message: "Erreur serveur lors de l'export de l'historique." });
    }
};

module.exports = {
    getTransactions, updateTransaction, deleteTransaction, getExpenseCategories, createExpense,
    createManualWithdrawal, getRemittanceSummary, getRemittanceDetails, updateRemittance,
    confirmRemittance, getShortfalls, settleShortfall, closeCash, getClosingHistory,
    getCashMetrics, exportClosingHistory,
    createShortfallManually, updateShortfall, deleteShortfall
};