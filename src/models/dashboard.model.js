// src/models/dashboard.model.js
let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const getStatsByDateRange = async (startDate, endDate) => {
    const connection = await dbConnection.getConnection();
    try {
        const params = [startDate, endDate];
        
        // Requête pour les statistiques des commandes
        const ordersQuery = `
            SELECT
                COUNT(id) as totalOrders,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as deliveredOrders,
                COALESCE(SUM(CASE WHEN status = 'delivered' THEN article_amount ELSE 0 END), 0) as totalRevenue,
                COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee ELSE 0 END), 0) as totalFees
            FROM orders
            WHERE DATE(created_at) BETWEEN ? AND ?;
        `;
        const [ordersStats] = await connection.execute(ordersQuery, params);

        // Requête pour le montant en caisse
        const cashQuery = `
            SELECT
                (SELECT COALESCE(SUM(amount), 0) FROM cash_transactions WHERE type = 'remittance' AND status = 'confirmed' AND DATE(validated_at) BETWEEN ? AND ?) as totalRemittances,
                (SELECT COALESCE(SUM(amount), 0) FROM cash_transactions WHERE type = 'expense' AND status = 'confirmed' AND DATE(created_at) BETWEEN ? AND ?) as totalExpenses,
                (SELECT COALESCE(SUM(amount), 0) FROM cash_transactions WHERE type = 'manual_withdrawal' AND status = 'confirmed' AND DATE(created_at) BETWEEN ? AND ?) as totalWithdrawals
        `;
        const [cashStats] = await connection.execute(cashQuery, [...params, ...params, ...params]);

        // Requêtes pour les TOP 5
        const topDeliverymenQuery = `SELECT u.name, COUNT(o.id) as count FROM orders o JOIN users u ON o.deliveryman_id = u.id WHERE o.status = 'delivered' AND DATE(o.created_at) BETWEEN ? AND ? GROUP BY u.name ORDER BY count DESC LIMIT 5`;
        const [topDeliverymen] = await connection.execute(topDeliverymenQuery, params);

        const topShopsQuery = `SELECT s.name, SUM(o.article_amount) as total FROM orders o JOIN shops s ON o.shop_id = s.id WHERE o.status = 'delivered' AND DATE(o.created_at) BETWEEN ? AND ? GROUP BY s.name ORDER BY total DESC LIMIT 5`;
        const [topShops] = await connection.execute(topShopsQuery, params);

        // Calcul du montant en caisse (Simplifié pour le dashboard principal)
        const cashOnHand = (parseFloat(ordersStats[0].totalRevenue) + parseFloat(cashStats[0].totalRemittances)) - (Math.abs(parseFloat(cashStats[0].totalExpenses)) + Math.abs(parseFloat(cashStats[0].totalWithdrawals)));

        return {
            ...ordersStats[0],
            cashOnHand,
            topDeliverymen,
            topShops
        };

    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    getStatsByDateRange
};