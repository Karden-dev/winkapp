// src/models/cash.stat.model.js

const moment = require('moment');
let db;

const init = (dbPool) => {
    db = dbPool;
};

/**
 * Génère le filtre de date SQL (AND columnName BETWEEN '...' AND '...')
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} columnName
 * @returns {string}
 */
const getDateFilter = (startDate, endDate, columnName = 'created_at') => {
    let filter = '';
    // Formatage pour couvrir toute la journée
    const start = startDate ? moment(startDate).format('YYYY-MM-DD 00:00:00') : null;
    const end = endDate ? moment(endDate).format('YYYY-MM-DD 23:59:59') : null;

    if (start && end) {
        filter = `AND ${columnName} BETWEEN '${start}' AND '${end}'`;
    } else if (start) {
        filter = `AND ${columnName} >= '${start}'`;
    } else if (end) {
        filter = `AND ${columnName} <= '${end}'`;
    }
    return filter;
};

/**
 * Calcule le Chiffre d'Affaire (CA) pour la période donnée en utilisant daily_shop_balances.
 * CA = frais de livraisons + frais d'emballage + frais de stockage
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<number>}
 */
const getRevenue = async (startDate, endDate) => {
    const connection = await db.getConnection();
    try {
        const dateFilter = getDateFilter(startDate, endDate, 'report_date'); 

        const [result] = await connection.execute(
            `
            SELECT 
                COALESCE(SUM(total_delivery_fees), 0) AS total_delivery_fees,
                COALESCE(SUM(total_packaging_fees), 0) AS total_packaging_fees,
                COALESCE(SUM(total_storage_fees), 0) AS total_storage_fees
            FROM daily_shop_balances
            WHERE 1=1 
            ${dateFilter}
            `
        );
        const revenueResult = result[0];
        const ca = (
            parseFloat(revenueResult.total_delivery_fees) +
            parseFloat(revenueResult.total_packaging_fees) +
            parseFloat(revenueResult.total_storage_fees)
        );
        return ca;
    } finally {
        connection.release();
    }
};

/**
 * Calcule l'encaissement (somme des montants de type remittance CONFIRMÉS).
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<number>}
 */
const getCashCollected = async (startDate, endDate) => {
    const connection = await db.getConnection();
    try {
        // CORRECTION: La date de référence est maintenant 'created_at' pour la cohérence
        const dateFilter = getDateFilter(startDate, endDate, 'created_at'); 

        const [result] = await connection.execute(
            `
            SELECT 
                COALESCE(SUM(amount), 0) AS total_collected
            FROM cash_transactions
            WHERE type = 'remittance' AND status = 'confirmed'
            ${dateFilter}
            `
        );
        return parseFloat(result[0].total_collected);
    } finally {
        connection.release();
    }
};

/**
 * Calcule les totaux pour les Dépenses et Décaissements (sorties de caisse).
 * Retourne les montants en VALEUR ABSOLUE.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<{totalExpenses: number, totalWithdrawals: number}>}
 */
const getExpensesAndWithdrawals = async (startDate, endDate) => {
    const connection = await db.getConnection();
    try {
        const dateFilter = getDateFilter(startDate, endDate, 'created_at');

        const [result] = await connection.execute(
            `
            SELECT 
                COALESCE(SUM(CASE WHEN type = 'expense' THEN -amount ELSE 0 END), 0) AS total_expenses,
                COALESCE(SUM(CASE WHEN type IN ('withdrawal', 'manual_withdrawal') THEN -amount ELSE 0 END), 0) AS total_withdrawals
            FROM cash_transactions
            WHERE status = 'confirmed' 
            ${dateFilter}
            `
        );
        const metrics = result[0];
        return {
            totalExpenses: parseFloat(metrics.total_expenses),
            totalWithdrawals: parseFloat(metrics.total_withdrawals)
        };
    } finally {
        connection.release();
    }
};

/**
 * Calcule les totaux de Créances.
 * paidDebts: Créances remboursées sur la période (basé sur settled_at).
 * pendingDebts: Total des créances créées sur la période (basé sur created_at), peu importe leur statut.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<{paidDebts: number, pendingDebts: number}>}
 */
const getDebtMetrics = async (startDate, endDate) => {
    const connection = await db.getConnection();
    try {
        const settledFilter = getDateFilter(startDate, endDate, 'settled_at');
        const [paidResult] = await connection.execute(
            `
            SELECT 
                COALESCE(SUM(amount), 0) AS total_paid
            FROM debts
            WHERE status = 'paid'
            ${settledFilter}
            `
        );
        const paidDebts = parseFloat(paidResult[0].total_paid);

        const createdFilter = getDateFilter(startDate, endDate, 'created_at');
        const [pendingResult] = await connection.execute(
            `
            SELECT 
                COALESCE(SUM(amount), 0) AS total_created_debts
            FROM debts
            WHERE 1=1
            ${createdFilter}
            `
        );
        const pendingDebts = parseFloat(pendingResult[0].total_created_debts);

        return {
            paidDebts,
            pendingDebts
        };
    } finally {
        connection.release();
    }
};

/**
 * Calcule les totaux de Manquants remboursés et non remboursés.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<{paidShortfalls: number, pendingShortfalls: number}>}
 */
const getShortfallMetrics = async (startDate, endDate) => {
    const connection = await db.getConnection();
    try {
        const settledFilter = getDateFilter(startDate, endDate, 'settled_at');
        const [paidResult] = await connection.execute(
            `
            SELECT 
                COALESCE(SUM(amount), 0) AS total_paid
            FROM deliveryman_shortfalls
            WHERE status = 'paid'
            ${settledFilter}
            `
        );
        const paidShortfalls = parseFloat(paidResult[0].total_paid);

        const createdFilter = getDateFilter(startDate, endDate, 'created_at');
        const [pendingResult] = await connection.execute(
            `
            SELECT 
                COALESCE(SUM(amount), 0) AS total_pending
            FROM deliveryman_shortfalls
            WHERE 1=1
            ${createdFilter}
            `
        );
        const pendingShortfalls = parseFloat(pendingResult[0].total_pending);

        return {
            paidShortfalls,
            pendingShortfalls
        };
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    getCashCollected,
    getRevenue,
    getExpensesAndWithdrawals,
    getDebtMetrics,
    getShortfallMetrics,
};