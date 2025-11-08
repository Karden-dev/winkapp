// src/models/dashboard.model.js
const moment = require('moment');

// Importation des modèles de base pour l'agrégation
const orderModel = require('./order.model');
const cashModel = require('./cash.model');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
    // Les autres modèles ont déjà été initialisés dans src/app.js
};

/**
 * Agrège les métriques financières et opérationnelles pour le tableau de bord.
 */
const getDashboardMetrics = async (startDate, endDate) => {
    // 1. Calcul des métriques financières et opérationnelles (Ordres)
    const metricsQuery = `
        SELECT
            COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN 1 ELSE 0 END), 0) AS total_orders_sent,
            COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? AND status = 'delivered' THEN 1 ELSE 0 END), 0) AS total_delivered,
            COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? AND status = 'in_progress' THEN 1 ELSE 0 END), 0) AS total_in_progress,
            COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? AND status IN ('cancelled', 'failed_delivery', 'reported') THEN 1 ELSE 0 END), 0) AS total_failed_cancelled_reported
        FROM orders
    `;
    const [orderRows] = await dbConnection.execute(metricsQuery, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate]);
    const orderMetrics = orderRows[0];

    // 2. Calcul du CA Net (en utilisant les Bilans Journaliers pour la précision sur les frais)
    const caQuery = `
        SELECT
            COALESCE(SUM(total_delivery_fees), 0) AS total_delivery_fees,
            COALESCE(SUM(total_packaging_fees), 0) AS total_packaging_fees,
            COALESCE(SUM(total_storage_fees), 0) AS total_storage_fees
        FROM daily_shop_balances
        WHERE report_date BETWEEN ? AND ?
    `;
    const [caRows] = await dbConnection.execute(caQuery, [startDate, endDate]);
    const caMetrics = caRows[0];
    
    // 3. CA et Solde
    const totalCANet = parseFloat(caMetrics.total_delivery_fees || 0) 
                     + parseFloat(caMetrics.total_packaging_fees || 0) 
                     + parseFloat(caMetrics.total_storage_fees || 0);

    // 4. Métriques des Dépenses (via cashModel, ou requête directe pour éviter une dépendance circulaire)
    // Nous utilisons une requête directe pour l'agrégation de caisse pour cette période
    const cashMetricsQuery = `
        SELECT
            COALESCE(SUM(CASE WHEN ct.type IN ('expense', 'manual_withdrawal') THEN ABS(ct.amount) ELSE 0 END), 0) AS total_expenses
        FROM cash_transactions ct
        WHERE DATE(ct.created_at) BETWEEN ? AND ?
    `;
    const [cashRows] = await dbConnection.execute(cashMetricsQuery, [startDate, endDate]);
    const totalExpenses = parseFloat(cashRows[0].total_expenses || 0);

    return {
        ca_net: totalCANet,
        total_expenses: totalExpenses,
        solde_net: totalCANet - totalExpenses,
        total_delivery_fees: parseFloat(caMetrics.total_delivery_fees || 0),
        
        // Ordres : pour les graphiques et totaux
        total_sent: parseInt(orderMetrics.total_orders_sent || 0),
        total_delivered: parseInt(orderMetrics.total_delivered || 0),
        total_in_progress: parseInt(orderMetrics.total_in_progress || 0),
        total_failed_cancelled: parseInt(orderMetrics.total_failed_cancelled_reported || 0)
    };
};

/**
 * Récupère le classement des marchands.
 */
const getShopRanking = async (startDate, endDate) => {
    const query = `
        SELECT
            s.name AS shop_name,
            COUNT(o.id) AS orders_sent_count,
            COALESCE(SUM(CASE WHEN o.status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END), 0) AS orders_processed_count,
            COALESCE(SUM(o.delivery_fee), 0) AS total_delivery_fees_generated
        FROM shops s
        JOIN orders o ON s.id = o.shop_id
        WHERE DATE(o.created_at) BETWEEN ? AND ?
        GROUP BY s.id, s.name
        ORDER BY total_delivery_fees_generated DESC
        LIMIT 5
    `;
    const [rows] = await dbConnection.execute(query, [startDate, endDate]);
    return rows;
};


module.exports = {
    init,
    getDashboardMetrics,
    getShopRanking,
};