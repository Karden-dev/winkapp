const remittanceModel = require('../models/remittance.model');
const remittancesService = require('../services/remittances.service');
const PDFDocument = require('pdfkit');
const moment = require('moment');
const fs = require('fs');

const getRemittances = async (req, res) => {
    try {
        const filters = req.query;
        // On ne force plus le statut 'pending', on utilise le filtre de l'utilisateur
        const remittances = await remittanceModel.findForRemittance(filters);

        const stats = {
            orangeMoneyTotal: 0,
            orangeMoneyTransactions: 0,
            mtnMoneyTotal: 0,
            mtnMoneyTransactions: 0,
            totalRemittanceAmount: 0,
            totalTransactions: remittances.length
        };

        remittances.forEach(rem => {
            if (rem.payment_operator === 'Orange Money') {
                stats.orangeMoneyTotal += rem.total_payout_amount;
                stats.orangeMoneyTransactions++;
            } else if (rem.payment_operator === 'MTN Mobile Money') {
                stats.mtnMoneyTotal += rem.total_payout_amount;
                stats.mtnMoneyTransactions++;
            }
            stats.totalRemittanceAmount += rem.total_payout_amount;
        });

        res.json({ remittances, stats });
    } catch (error) {
        console.error("Erreur lors de la récupération des versements:", error);
        res.status(500).json({ message: 'Erreur serveur lors de la récupération des versements', error: error.message });
    }
};

const getRemittanceDetails = async (req, res) => {
    try {
        const { shopId } = req.params;
        const details = await remittanceModel.getShopDetails(shopId);
        res.json(details);
    } catch (error) {
        console.error("Erreur lors de la récupération des détails du versement:", error);
        res.status(500).json({ message: 'Erreur serveur lors de la récupération des détails', error: error.message });
    }
};

const recordRemittance = async (req, res) => {
    try {
        const { shopId, amount, paymentOperator, status, transactionId, comment, userId } = req.body;
        if (!shopId || !amount || !status || !userId) {
            return res.status(400).json({ message: "Les champs shopId, amount, status et userId sont requis." });
        }
        await remittancesService.recordRemittance(shopId, amount, paymentOperator, status, transactionId, comment, userId);
        res.status(201).json({ message: "Versement enregistré avec succès." });
    } catch (error) {
        console.error("Erreur lors de l'enregistrement du versement:", error);
        res.status(500).json({ message: 'Erreur serveur lors de l\'enregistrement du versement', error: error.message });
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
        res.status(500).json({ message: 'Erreur serveur lors de la mise à jour des détails', error: error.message });
    }
};

const exportPdf = async (req, res) => {
    try {
        const pendingRemittances = await remittanceModel.findForRemittance({ status: 'pending' });

        if (pendingRemittances.length === 0) {
            return res.status(404).json({ message: "Aucun versement en attente à exporter." });
        }
        
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            let pdfData = Buffer.concat(buffers);
            res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment;filename=rapport_versements_en_attente.pdf',
                'Content-Length': pdfData.length
            }).end(pdfData);
        });

        doc.fontSize(20).text('Rapport de Versements en Attente', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Date du rapport : ${moment().format('DD/MM/YYYY')}`, { align: 'center' });
        doc.moveDown(2);

        const createTable = (data, headers, title) => {
            const tableStartY = doc.y;
            const columnWidths = [150, 100, 100, 150];
            const startX = 50;

            doc.fontSize(14).text(title, { underline: true });
            doc.moveDown(0.5);

            doc.font('Helvetica-Bold');
            let currentX = startX;
            headers.forEach((header, i) => {
                doc.text(header, currentX, doc.y, { width: columnWidths[i] });
                currentX += columnWidths[i] + 10;
            });
            doc.moveDown();
            
            doc.font('Helvetica');
            data.forEach(row => {
                currentX = startX;
                row.forEach((cell, i) => {
                    doc.text(cell, currentX, doc.y, { width: columnWidths[i] });
                    currentX += columnWidths[i] + 10;
                });
                doc.moveDown();
            });
        };

        const tableHeaders = ['Marchand', 'Téléphone', 'Opérateur', 'Montant à verser'];
        const tableData = pendingRemittances.map(rem => [
            rem.shop_name,
            rem.phone_number_for_payment || 'N/A',
            rem.payment_operator || 'N/A',
            `${rem.total_payout_amount.toLocaleString('fr-FR')} FCFA`
        ]);

        createTable(tableData, tableHeaders, "Liste des Marchands avec Solde Positif");

        doc.end();

    } catch (error) {
        console.error("Erreur lors de la génération du PDF:", error);
        res.status(500).json({ message: 'Erreur serveur lors de la génération du PDF', error: error.message });
    }
};


module.exports = {
    getRemittances,
    getRemittanceDetails,
    recordRemittance,
    updateShopPaymentDetails,
    exportPdf
};