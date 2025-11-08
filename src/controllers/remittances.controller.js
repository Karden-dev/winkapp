// src/controllers/remittances.controller.js
const remittanceModel = require('../models/remittance.model');
const remittancesService = require('../services/remittances.service');
const PDFDocument = require('pdfkit');
const moment = require('moment');
const fs = require('fs');

const getRemittances = async (req, res) => {
    const { date } = req.query; // Récupération de la date du bilan
    const connection = await remittanceModel.dbConnection.getConnection(); 

    try {
        await connection.beginTransaction();
        
        // ÉTAPE CRUCIALE: Synchroniser avant de récupérer les données si une date est fournie
        if (date) {
            // Synchronise les soldes positifs et les créances en attente vers 'remittances'
            await remittanceModel.syncDailyBalancesToRemittances(date, connection);
        }

        // Récupérer la liste (maintenant synchronisée) avec tous les filtres
        const filters = req.query;
        const allRemittances = await remittanceModel.findForRemittance(filters);

        const stats = {
            orangeMoneyTotal: 0,
            orangeMoneyTransactions: 0,
            mtnMoneyTotal: 0,
            mtnMoneyTransactions: 0,
            totalAmount: 0, // Montant NET total (selon le filtre appliqué)
            totalTransactions: allRemittances.length
        };

        allRemittances.forEach(rem => {
            // CORRECTION: On somme le montant NET pour TOUS les éléments de la liste
            // car la liste est déjà filtrée par le statut souhaité (all, pending, or paid).
            const netAmount = parseFloat(rem.net_amount);
            
            if (rem.payment_operator === 'Orange Money') {
                stats.orangeMoneyTotal += netAmount;
                stats.orangeMoneyTransactions++;
            } else if (rem.payment_operator === 'MTN Mobile Money') {
                stats.mtnMoneyTotal += netAmount;
                stats.mtnMoneyTransactions++;
            }
            stats.totalAmount += netAmount;
        });
        
        await connection.commit(); // Valider les insertions/mises à jour dans 'remittances'

        res.json({ remittances: allRemittances, stats });
    } catch (error) {
        await connection.rollback(); // Annuler si erreur
        console.error("Erreur lors de la récupération/synchronisation des versements:", error);
        res.status(500).json({ message: 'Erreur serveur lors de la synchronisation.', error: error.message });
    } finally {
        connection.release();
    }
};

const getRemittanceDetails = async (req, res) => {
    try {
        const { shopId } = req.params;
        const details = await remittanceModel.getShopDetails(shopId);
        res.json(details);
    } catch (error) {
        console.error("Erreur lors de la récupération des détails du versement:", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
};

const recordRemittance = async (req, res) => {
    try {
        const { shopId, amount, paymentOperator, status, transactionId, remittanceDate, userId } = req.body; 
        if (!shopId || !amount || !status || !userId) {
            return res.status(400).json({ message: "Les champs shopId, amount, status et userId sont requis." });
        }

        const comment = remittanceDate 
            ? `Versement du solde journalier du ${moment(remittanceDate).format('DD/MM/YYYY')}`
            : `Versement manuel du montant: ${amount}`;

        await remittanceModel.recordRemittance(shopId, amount, paymentOperator, status, transactionId, comment, userId);
        res.status(201).json({ message: "Versement enregistré avec succès." });
    } catch (error) {
        console.error("Erreur lors de l'enregistrement du versement:", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
};

const updateShopPaymentDetails = async (req, res) => {
    try {
        const { shopId } = req.params;
        const paymentData = req.body;
        await remittanceModel.updateShopPaymentDetails(shopId, paymentData);
        res.status(200).json({ message: 'Détails de paiement mis à jour avec succès.' });
    } catch (error) {
        console.error("Erreur lors de la mise à jour des détails de paiement:", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
};

const markAsPaid = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "L'ID de l'utilisateur est requis." });
        }
        
        const result = await remittanceModel.markAsPaid(id, userId); 
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Versement non trouvé ou déjà payé." });
        }
        res.status(200).json({ message: "Statut mis à jour (Paiement effectué)." });
    } catch (error) {
        console.error("Erreur lors du paiement du versement:", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
};

const exportPdf = async (req, res) => {
// ... (inchangé)
};

module.exports = {
    getRemittances,
    getRemittanceDetails,
    recordRemittance,
    updateShopPaymentDetails,
    exportPdf,
    markAsPaid
};