// src/controllers/rider.controller.js
// CE FICHIER GÈRE LES ROUTES SPÉCIFIQUES AU LIVREUR (/api/rider/...)

const riderModel = require('../models/rider.model'); // Modèle pour les données spécifiques rider
const ridersCashModel = require('../models/riderscash.model'); // Modèle pour la page "Ma Caisse"
const cashService = require('../services/cash.service'); // Service pour logique métier caisse
const CashTransaction = require('../models/cash.model'); // Modèle pour transactions cash
const moment = require('moment'); // Pour la gestion des dates

/**
 * Récupère les commandes assignées au livreur connecté, avec filtres possibles.
 * Gère la route GET /api/rider/orders
 */
const getRiderOrders = async (req, res) => {
    try {
        const riderId = req.user.id; // ID du livreur connecté via le token
        const filters = {
            deliverymanId: riderId,
            status: req.query.status, // Peut être 'pending', 'in_progress', tableau ['pending', 'in_progress'], etc.
            search: req.query.search,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        };
        const orders = await riderModel.findRiderOrders(filters); // Appel au modèle rider
        res.status(200).json(orders);
    } catch (error) {
        console.error("Erreur (GET /rider/orders):", error);
        res.status(500).json({ message: 'Erreur serveur lors de la récupération des commandes.' });
    }
};

/**
 * Calcule le montant total dû par un livreur spécifique.
 * Gère la route GET /api/rider/cash-owed/:riderId
 * Note: Utilise riderId de l'URL, pourrait être remplacé par req.user.id si destiné au livreur connecté.
 */
const getRiderOwedAmount = async (req, res) => {
    try {
        const { riderId } = req.params;
        // Utilisation de req.user.id serait plus sécurisé si c'est pour le livreur connecté lui-même
        // const riderId = req.user.id;
        const owedAmount = await cashService.getDeliverymanOwedAmount(riderId); // Appel au service cash
        res.status(200).json({ owedAmount });
    } catch (error) {
        console.error("Erreur (GET /rider/cash-owed):", error);
        res.status(500).json({ message: 'Erreur lors du calcul du montant dû.' });
    }
};

/**
 * Récupère l'historique des transactions de caisse pour un livreur spécifique.
 * Gère la route GET /api/rider/cash-transactions/:riderId
 * Note: Utilise riderId de l'URL.
 */
const getRiderCashTransactions = async (req, res) => {
    try {
        const { riderId } = req.params;
        // Utilisation de req.user.id serait plus sécurisé
        // const riderId = req.user.id;

        // Utilise CashTransaction.findAll avec filtre user_id
        const transactions = await CashTransaction.findAll({ user_id: riderId });
        res.status(200).json(transactions);
    } catch (error) {
        console.error("Erreur (GET /rider/cash-transactions):", error);
        res.status(500).json({ message: 'Erreur lors de la récupération des transactions.' });
    }
};

/**
 * Permet à un livreur de soumettre un versement (qui sera en statut 'pending').
 * Gère la route POST /api/rider/remittance
 */
const submitRemittance = async (req, res) => {
    try {
        const riderId = req.user.id; // Utilise l'ID du livreur connecté depuis le token
        const { amount, comment } = req.body;

        // Validation simple du montant
        if (amount === undefined || amount === null || isNaN(parseFloat(amount))) {
             return res.status(400).json({ message: "Le montant est requis et doit être numérique." });
        }

        // Crée une transaction de type 'remittance' avec statut 'pending'
        const insertId = await CashTransaction.create({
            user_id: riderId,
            type: 'remittance',
            amount: parseFloat(amount), // S'assurer que c'est un nombre
            comment: comment || `Versement soumis par livreur ID ${riderId}`,
            status: 'pending', // Le modèle met 'pending' par défaut pour remittance mais on peut le forcer
            created_at: moment().format('YYYY-MM-DD HH:mm:ss') // Date/heure de soumission
        });

        res.status(201).json({ message: "Versement soumis avec succès.", transactionId: insertId });
    } catch (error) {
        console.error("Erreur (POST /rider/remittance):", error);
        res.status(500).json({ message: 'Erreur lors de la soumission du versement.' });
    }
};

/**
 * Récupère les compteurs de commandes par statut pour le livreur connecté (pour sidebar).
 * Gère la route GET /api/rider/counts
 */
const getOrdersCounts = async (req, res) => {
    try {
        const riderId = req.user.id;
        const counts = await riderModel.getOrdersCounts(riderId); // Appel modèle rider
        res.status(200).json(counts);
    } catch (error) {
        console.error("Erreur (GET /rider/counts):", error);
        res.status(500).json({ message: 'Erreur lors de la récupération des compteurs.' });
    }
};

/**
 * Récupère les notifications pour le livreur connecté.
 * Gère la route GET /api/rider/notifications
 */
const getRiderNotifications = async (req, res) => {
    try {
        // Logique actuellement désactivée selon le code original
        // const riderId = req.user.id;
        // const notifications = await riderModel.findRiderNotifications(riderId); // Appel modèle rider
        res.status(200).json([]); // Renvoie un tableau vide
    } catch (error) {
        console.error("Erreur (GET /rider/notifications):", error);
        res.status(500).json({ message: 'Erreur serveur lors de la récupération des notifications.' });
    }
};

/**
 * Récupère les données agrégées (résumé + transactions) pour la page 'Ma Caisse' du livreur.
 * Gère la route GET /api/rider/cash-details
 */
const getRiderCashPageDetails = async (req, res) => {
    try {
        const riderId = req.user.id;
        const date = req.query.date || moment().format('YYYY-MM-DD'); // Date du jour par défaut

        // Validation de la date
        if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
             return res.status(400).json({ message: "Format de date invalide (YYYY-MM-DD attendu)." });
        }

        // Appel au modèle spécifique pour la page caisse
        const { summary: rawSummary, transactions: rawTransactions } = await ridersCashModel.getRiderCashDetails(riderId, date);

        // Combinaison et tri des transactions
        const allTransactions = [
            ...(rawTransactions.orders || []),
            ...(rawTransactions.expenses || []),
            ...(rawTransactions.shortfalls || [])
        ].sort((a, b) => new Date(b.event_date) - new Date(a.event_date)); // Tri antichronologique

        // Calcul du résumé pour l'affichage frontend
        const amountExpected = (rawTransactions.orders || [])
            .filter(o => o.remittance_status !== 'confirmed') // Uniquement non confirmé
            .reduce((sum, order) => {
                const amount = parseFloat(order.article_amount); // Montant ajusté (inclut expédition négative)
                return sum + (isNaN(amount) ? 0 : amount);
             }, 0);

        const amountConfirmed = parseFloat(rawSummary.totalRemittances || 0); // Versements confirmés du jour
        const totalExpenses = Math.abs(parseFloat(rawSummary.totalExpenses || 0)); // Dépenses du jour

        const finalSummary = {
            amountExpected: amountExpected,
            amountConfirmed: amountConfirmed,
            totalExpenses: totalExpenses
        };

        res.status(200).json({ summary: finalSummary, transactions: allTransactions });

    } catch (error) {
        console.error("Erreur (GET /rider/cash-details):", error);
        res.status(500).json({ message: 'Erreur lors de la récupération des détails de la caisse.' });
    }
};

// Exporte toutes les fonctions nécessaires pour les routes rider
module.exports = {
    getRiderOrders,
    getRiderOwedAmount,
    getRiderCashTransactions,
    submitRemittance,
    getOrdersCounts,
    getRiderNotifications,
    getRiderCashPageDetails
};