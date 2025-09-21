// src/services/debt.service.js
const moment = require('moment');
const reportModel = require('../models/report.model');

let dbConnection;

const init = (connection) => { 
    dbConnection = connection; 
    reportModel.init(connection); // Initialiser aussi le modèle
};

/**
 * Traite les frais de stockage pour les jours non facturés.
 */
const processStorageFees = async (processingDate) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();
        const [shopsWithStorage] = await connection.execute(
            `SELECT id, storage_price FROM shops WHERE bill_storage = 1 AND status = 'actif'`
        );
        for (const shop of shopsWithStorage) {
            const [existingDebt] = await connection.execute(
                `SELECT id FROM debts WHERE shop_id = ? AND type = 'storage_fee' AND DATE(created_at) = ?`,
                [shop.id, processingDate]
            );
            if (existingDebt.length === 0) {
                const comment = `Frais de stockage pour le ${processingDate}`;
                await connection.execute(
                    'INSERT INTO debts (shop_id, amount, type, status, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [shop.id, shop.storage_price, 'storage_fee', 'pending', comment, processingDate]
                );
            }
        }
        await connection.commit();
        return { message: `Frais de stockage pour le ${processingDate} traités avec succès.` };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

/**
 * Consolide les soldes négatifs de la veille en créances.
 */
const consolidateDailyBalances = async (dateToConsolidate) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();
        const reports = await reportModel.findReportsByDate(dateToConsolidate);
        for (const report of reports) {
            if (report.amount_to_remit < 0) {
                const debtAmount = Math.abs(report.amount_to_remit);
                const [existingDebt] = await connection.execute(
                    `SELECT id FROM debts WHERE shop_id = ? AND type = 'daily_balance' AND DATE(created_at) = ?`,
                    [report.shop_id, dateToConsolidate]
                );
                if (existingDebt.length === 0) {
                    await connection.execute(
                        'INSERT INTO debts (shop_id, amount, type, status, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                        [report.shop_id, debtAmount, 'daily_balance', 'pending', `Report du solde négatif du ${dateToConsolidate}`, dateToConsolidate]
                    );
                }
            }
        }
        await connection.commit();
        return { message: `Consolidation des soldes pour le ${dateToConsolidate} terminée avec succès.` };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    processStorageFees,
    consolidateDailyBalances,
};