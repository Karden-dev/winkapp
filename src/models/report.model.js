// src/models/report.model.js
const moment = require('moment');

let dbConnection;

module.exports = {
    init: (connection) => { dbConnection = connection; },

    findReportsByDate: async (date) => {
        const connection = await dbConnection.getConnection();
        try {
            const previousDebtsDate = moment(date).format('YYYY-MM-DD');
            const query = `
                SELECT
                    s.id AS shop_id, s.name AS shop_name, s.packaging_price, s.bill_packaging,
                    COALESCE(todays_orders.gains_cash, 0) AS total_revenue_articles_cash,
                    COALESCE(todays_orders.gains_failed, 0) AS total_revenue_articles_failed,
                    COALESCE(todays_orders.total_delivery_fees, 0) AS total_delivery_fees,
                    (COALESCE(todays_orders.total_orders_processed, 0) * IF(s.bill_packaging, s.packaging_price, 0)) AS total_packaging_fees,
                    COALESCE(todays_debts.storage_fee_today, 0) AS total_storage_fees,
                    COALESCE(previous_debts.total_pending_debts, 0) AS previous_debts,
                    COALESCE(todays_orders.total_orders_sent, 0) AS total_orders_sent,
                    COALESCE(todays_orders.total_orders_delivered, 0) AS total_orders_delivered
                FROM shops s
                LEFT JOIN (
                    SELECT shop_id, COUNT(id) AS total_orders_sent, SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS total_orders_delivered, SUM(CASE WHEN status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END) AS total_orders_processed, SUM(CASE WHEN status = 'delivered' AND payment_status = 'cash' THEN article_amount ELSE 0 END) AS gains_cash, SUM(CASE WHEN status = 'failed_delivery' THEN amount_received ELSE 0 END) AS gains_failed, SUM(CASE WHEN status IN ('delivered', 'failed_delivery') THEN delivery_fee ELSE 0 END) AS total_delivery_fees
                    FROM orders WHERE DATE(created_at) = ? GROUP BY shop_id
                ) AS todays_orders ON s.id = todays_orders.shop_id
                LEFT JOIN (
                    SELECT shop_id, SUM(CASE WHEN type = 'storage_fee' THEN amount ELSE 0 END) AS storage_fee_today
                    FROM debts WHERE DATE(created_at) = ? AND status = 'pending' GROUP BY shop_id
                ) AS todays_debts ON s.id = todays_debts.shop_id
                LEFT JOIN (
                    SELECT shop_id, SUM(amount) AS total_pending_debts
                    FROM debts WHERE status = 'pending' AND DATE(created_at) < ? GROUP BY shop_id
                ) AS previous_debts ON s.id = previous_debts.shop_id
                WHERE s.status = 'actif';
            `;
            const [rows] = await connection.execute(query, [date, date, previousDebtsDate]);
            return rows.map(row => {
                const merchantGains = parseFloat(row.total_revenue_articles_cash) + parseFloat(row.total_revenue_articles_failed);
                const merchantDebts = parseFloat(row.total_delivery_fees) + parseFloat(row.total_packaging_fees) + parseFloat(row.total_storage_fees) + parseFloat(row.previous_debts);
                const amountToRemit = merchantGains - merchantDebts;
                return {
                    shop_id: row.shop_id, shop_name: row.shop_name, total_orders_sent: parseInt(row.total_orders_sent, 10),
                    total_orders_delivered: parseInt(row.total_orders_delivered, 10), total_revenue_articles: merchantGains,
                    total_delivery_fees: parseFloat(row.total_delivery_fees), total_packaging_fees: parseFloat(row.total_packaging_fees),
                    total_storage_fees: parseFloat(row.total_storage_fees), previous_debts: parseFloat(row.previous_debts),
                    amount_to_remit: amountToRemit,
                };
            });
        } finally {
            connection.release();
        }
    },
    
    findDetailedReport: async (date, shopId) => {
        const connection = await dbConnection.getConnection();
        try {
            const summaryReports = await module.exports.findReportsByDate(date);
            const summary = summaryReports.find(r => r.shop_id == shopId);
            if (!summary) return null;

            const ordersQuery = `
                SELECT
                    o.id, o.delivery_location, o.customer_phone, o.article_amount,
                    o.delivery_fee, o.status, o.amount_received,
                    GROUP_CONCAT(CONCAT(oi.item_name, ' (', oi.quantity, ')') SEPARATOR ', ') as products_list
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.shop_id = ? AND DATE(o.created_at) = ? AND o.status IN ('delivered', 'failed_delivery')
                GROUP BY o.id
                ORDER BY o.created_at ASC;
            `;
            const [orders] = await connection.execute(ordersQuery, [shopId, date]);

            return { ...summary, orders: orders };
        } finally {
            connection.release();
        }
    }
};