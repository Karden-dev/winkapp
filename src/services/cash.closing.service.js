// src/services/cash.closing.service.js

const moment = require('moment');
const cashStatModel = require('../models/cash.stat.model'); 
let db;

const init = (dbConnection) => {
    db = dbConnection;
};

const findClosingHistory = async (filters = {}) => {
    const connection = await db.getConnection();
    try {
        const { startDate, endDate } = filters;
        let query = `
            SELECT 
                cc.*, u.name AS closed_by_user_name
            FROM cash_closings cc
            LEFT JOIN users u ON cc.closed_by_user_id = u.id
            WHERE 1=1
        `;

        if (startDate && endDate) {
            query += ` AND cc.closing_date BETWEEN '${moment(startDate).format('YYYY-MM-DD')}' AND '${moment(endDate).format('YYYY-MM-DD')}'`;
        }

        query += ` ORDER BY cc.closing_date DESC`;

        const [history] = await connection.execute(query);
        
        return Array.isArray(history) ? history : [];

    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
};

const performCashClosing = async (closingDate, actualCash, comment, userId) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [existingClosing] = await connection.execute('SELECT id FROM cash_closings WHERE closing_date = ?', [closingDate]);
        if (existingClosing.length > 0) {
            throw new Error(`La caisse est déjà clôturée pour la date du ${moment(closingDate).format('DD/MM/YYYY')}.`);
        }
        
        const [
            ca,
            cashCollected,
            cashTransactions,
            debtMetrics,
            shortfallMetrics
        ] = await Promise.all([
            cashStatModel.getRevenue(closingDate, closingDate),
            cashStatModel.getCashCollected(closingDate, closingDate),
            cashStatModel.getExpensesAndWithdrawals(closingDate, closingDate),
            cashStatModel.getDebtMetrics(closingDate, closingDate),
            cashStatModel.getShortfallMetrics(closingDate, closingDate)
        ]);

        const { totalExpenses, totalWithdrawals } = cashTransactions;
        const { paidDebts, pendingDebts } = debtMetrics;
        const { paidShortfalls, pendingShortfalls } = shortfallMetrics;

        // Formule de l'Encaisse Théorique (Montant en Caisse)
        const sortiesNettes = totalExpenses + totalWithdrawals;
        const elementsNonRembourses = pendingDebts + pendingShortfalls;
        const elementsRembourses = paidDebts + paidShortfalls;
        
        const expectedCash = ca 
            - sortiesNettes 
            - elementsNonRembourses 
            + elementsRembourses;
        
        const difference = parseFloat(actualCash) - expectedCash;
        
        // Insertion du snapshot complet dans cash_closings
        const insertQuery = `
            INSERT INTO cash_closings (
                closing_date, total_cash_collected, total_delivery_fees, total_expenses, 
                total_remitted, total_withdrawals, expected_cash, actual_cash_counted, 
                difference, comment, closed_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await connection.execute(insertQuery, [
            closingDate, cashCollected, ca, totalExpenses, elementsRembourses,
            totalWithdrawals, expectedCash, parseFloat(actualCash), difference,
            comment, userId
        ]);

        await connection.commit();
        
        return { 
            expected_cash: expectedCash, 
            actual_cash: parseFloat(actualCash), 
            difference: difference 
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    findClosingHistory,
    performCashClosing
};