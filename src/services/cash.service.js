// src/services/cash.service.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

/**
 * Crée une transaction de type 'remittance' en attente de confirmation.
 */
const createRemittanceTransaction = async (deliverymanId, amount, comment) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'INSERT INTO cash_transactions (user_id, type, amount, comment, status) VALUES (?, ?, ?, ?, ?)';
        await connection.execute(query, [deliverymanId, 'remittance', amount, comment, 'pending']);
    } finally {
        connection.release();
    }
};

/**
 * Calcule le montant total que le livreur doit à l'entreprise.
 */
const getDeliverymanOwedAmount = async (deliverymanId) => {
    const connection = await dbConnection.getConnection();
    try {
        // 1. Calcul des gains nets du livreur (encaissements des commandes - frais de livraison)
        const [gainsResult] = await connection.execute(
            `
            SELECT
                COALESCE(SUM(
                    CASE
                        WHEN o.status = 'delivered' AND o.payment_status = 'cash' THEN o.article_amount
                        WHEN o.status = 'failed_delivery' THEN o.amount_received
                        ELSE 0
                    END
                ), 0) AS total_encaissements,
                COALESCE(SUM(o.delivery_fee), 0) AS total_frais_livraison
            FROM orders o
            WHERE o.deliveryman_id = ? AND o.status IN ('delivered', 'failed_delivery')
            `,
            [deliverymanId]
        );
        const netGains = parseFloat(gainsResult[0].total_encaissements || 0) - parseFloat(gainsResult[0].total_frais_livraison || 0);
        
        // 2. Calcul des dépenses du livreur validées
        const [expensesResult] = await connection.execute(
            `
            SELECT COALESCE(SUM(amount), 0) AS total_expenses
            FROM cash_transactions
            WHERE user_id = ? AND type = 'expense' AND status = 'confirmed'
            `,
            [deliverymanId]
        );
        const totalExpenses = parseFloat(expensesResult[0].total_expenses || 0);
        
        // 3. Calcul des versements déjà effectués et validés par le livreur
        const [remittancesResult] = await connection.execute(
            `
            SELECT COALESCE(SUM(amount), 0) AS total_remittances
            FROM cash_transactions
            WHERE user_id = ? AND type = 'remittance' AND status = 'confirmed'
            `,
            [deliverymanId]
        );
        const totalRemittances = parseFloat(remittancesResult[0].total_remittances || 0);

        const owedAmount = (netGains + totalExpenses) - totalRemittances;

        return owedAmount;
    } finally {
        connection.release();
    }
};

const getCashMetrics = async () => {
    const connection = await dbConnection.getConnection();
    try {
        const [metricsResult] = await connection.execute(
            `
            SELECT
                COALESCE(SUM(CASE WHEN type = 'remittance' AND status = 'confirmed' THEN amount ELSE 0 END), 0) AS total_remitted,
                COALESCE(SUM(CASE WHEN type = 'remittance' AND status = 'pending' THEN amount ELSE 0 END), 0) AS total_pending_remittances,
                COALESCE(SUM(CASE WHEN type = 'expense' AND status = 'confirmed' THEN amount ELSE 0 END), 0) AS total_expenses,
                COALESCE(SUM(CASE WHEN type = 'manual_withdrawal' AND status = 'confirmed' THEN amount ELSE 0 END), 0) AS total_withdrawals
            FROM cash_transactions
            `
        );

        const [ordersMetricsResult] = await connection.execute(
            `
            SELECT
                COALESCE(SUM(CASE WHEN payment_status = 'cash' THEN article_amount ELSE 0 END), 0) AS total_cash_collected,
                COALESCE(SUM(delivery_fee), 0) AS total_delivery_fees
            FROM orders
            WHERE status IN ('delivered', 'failed_delivery')
            `
        );
        
        const metrics = metricsResult[0];
        const ordersMetrics = ordersMetricsResult[0];

        const totalCash = parseFloat(ordersMetrics.total_cash_collected) - parseFloat(metrics.total_expenses) - parseFloat(metrics.total_withdrawals);
        
        return {
            total_cash: totalCash,
            total_remitted: parseFloat(metrics.total_remitted),
            total_pending_remittances: parseFloat(metrics.total_pending_remittances),
            total_expenses: Math.abs(parseFloat(metrics.total_expenses)),
            total_withdrawals: Math.abs(parseFloat(metrics.total_withdrawals)),
            total_cash_collected_from_orders: parseFloat(ordersMetrics.total_cash_collected),
            total_delivery_fees: parseFloat(ordersMetrics.total_delivery_fees)
        };
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    createRemittanceTransaction,
    getDeliverymanOwedAmount,
    getCashMetrics
};