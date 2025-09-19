// src/services/cash.service.js
let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

/**
 * Calcule les métriques clés de la caisse pour une période donnée.
 * @param {string} startDate - Date de début au format YYYY-MM-DD.
 * @param {string} endDate - Date de fin au format YYYY-MM-DD.
 * @returns {object} Un objet contenant les métriques calculées.
 */
const getCashMetrics = async (startDate, endDate) => {
    const connection = await dbConnection.getConnection();
    try {
        const params = [startDate, endDate];
        
        const query = `
            SELECT
                (SELECT COALESCE(SUM(CASE WHEN o.payment_status = 'cash' THEN o.article_amount ELSE o.amount_received END), 0) FROM orders o WHERE o.status IN ('delivered', 'failed_delivery') AND DATE(o.updated_at) BETWEEN ? AND ?) as total_cash_collected,
                (SELECT COALESCE(SUM(o.delivery_fee), 0) FROM orders o WHERE o.status IN ('delivered', 'failed_delivery') AND DATE(o.updated_at) BETWEEN ? AND ?) as total_delivery_fees,
                (SELECT COALESCE(SUM(amount), 0) FROM cash_transactions WHERE type = 'expense' AND status='confirmed' AND DATE(created_at) BETWEEN ? AND ?) as total_expenses,
                (SELECT COALESCE(SUM(amount), 0) FROM cash_transactions WHERE type = 'manual_withdrawal' AND status='confirmed' AND DATE(created_at) BETWEEN ? AND ?) as total_withdrawals,
                (SELECT COALESCE(SUM(amount), 0) FROM remittances WHERE status IN ('paid', 'partially_paid') AND DATE(payment_date) BETWEEN ? AND ?) as total_paid_to_shops,
                (SELECT COALESCE(SUM(amount), 0) FROM debts WHERE status = 'pending') as total_unsettled_shop_debts
        `;
        
        // On construit les paramètres dynamiquement pour correspondre aux `?` dans la requête
        const queryParams = [
            ...params, // pour total_cash_collected
            ...params, // pour total_delivery_fees
            ...params, // pour total_expenses
            ...params, // pour total_withdrawals
            ...params  // pour total_paid_to_shops
        ];

        const [rows] = await connection.execute(query, queryParams);
        const data = rows[0];

        // Formule exacte: (Total encaissé) - (Dépenses + Décaissements + Versements Partenaires + Créances Magasins non réglées)
        const cashOnHand = parseFloat(data.total_cash_collected) - 
                           (Math.abs(parseFloat(data.total_expenses)) + 
                            Math.abs(parseFloat(data.total_withdrawals)) + 
                            parseFloat(data.total_paid_to_shops) +
                            parseFloat(data.total_unsettled_shop_debts));

        return {
            total_cash_collected_from_orders: parseFloat(data.total_cash_collected),
            total_delivery_fees: parseFloat(data.total_delivery_fees),
            total_expenses: Math.abs(parseFloat(data.total_expenses)),
            total_withdrawals: Math.abs(parseFloat(data.total_withdrawals)),
            cashOnHand: cashOnHand
        };
    } finally {
        connection.release();
    }
};

// Fonctions placeholder pour la compatibilité, leur logique est gérée ailleurs
const createRemittanceTransaction = async () => {};
const getDeliverymanOwedAmount = async () => {};

module.exports = {
    init,
    getCashMetrics,
    createRemittanceTransaction,
    getDeliverymanOwedAmount
};