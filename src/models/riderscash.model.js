// src/models/riderscash.model.js
const moment = require('moment');
let dbConnection;

const init = (connection) => { 
    dbConnection = connection;
};

const getRiderCashDetails = async (riderId, date) => {
    const connection = await dbConnection.getConnection();
    try {
        const startDate = moment(date).startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const endDate = moment(date).endOf('day').format('YYYY-MM-DD HH:mm:ss');
        const params = [riderId, startDate, endDate];

        // --- 1. Calcul des totaux pour le résumé (Logique mise à jour) ---
        const [summaryResult] = await connection.execute(`
            SELECT
                (SELECT COALESCE(SUM(
                    CASE
                        WHEN o.status = 'delivered' THEN o.article_amount
                        WHEN o.status = 'failed_delivery' THEN o.amount_received
                        WHEN o.payment_status = 'paid_to_supplier' AND o.expedition_fee > 0 THEN -o.expedition_fee
                        ELSE 0
                    END
                ), 0) FROM orders o WHERE o.deliveryman_id = ? AND o.created_at BETWEEN ? AND ? AND (
                    (o.status = 'delivered' AND o.payment_status = 'cash') OR
                    (o.status = 'failed_delivery' AND o.amount_received > 0) OR
                    (o.payment_status = 'paid_to_supplier' AND o.expedition_fee > 0)
                )) as totalOrdersAmount,
                (SELECT COALESCE(SUM(ct.amount), 0) FROM cash_transactions ct WHERE ct.user_id = ? AND ct.created_at BETWEEN ? AND ? AND ct.type = 'remittance' AND ct.status = 'confirmed') as totalRemittances,
                (SELECT COALESCE(SUM(ct.amount), 0) FROM cash_transactions ct WHERE ct.user_id = ? AND ct.created_at BETWEEN ? AND ? AND ct.type = 'expense') as totalExpenses,
                (SELECT COALESCE(SUM(s.amount), 0) FROM deliveryman_shortfalls s WHERE s.deliveryman_id = ? AND s.created_at BETWEEN ? AND ? AND s.status = 'pending') as totalPendingShortfalls
        `, [...params, ...params, ...params, ...params]);
        const summary = summaryResult[0];

        // --- 2. Récupération des listes de transactions ---
        const [orders] = await connection.execute(
            `SELECT 
                'order' as type, 
                o.id, o.id as tracking_number,
                CASE
                    WHEN o.payment_status = 'paid_to_supplier' AND o.expedition_fee > 0 THEN -o.expedition_fee
                    WHEN o.status = 'delivered' THEN o.article_amount
                    WHEN o.status = 'failed_delivery' THEN o.amount_received
                    ELSE 0
                END as article_amount,
                o.status, o.customer_name, o.delivery_location,
                o.created_at as event_date,
                s.name as shop_name,
                (SELECT GROUP_CONCAT(CONCAT(oi.item_name, ' (x', oi.quantity, ')') SEPARATOR ', ') 
                 FROM order_items oi WHERE oi.order_id = o.id) as items_list,
                MIN(ct.status) as remittance_status,
                MAX(CASE WHEN ct.status = 'confirmed' THEN ct.amount ELSE 0 END) as confirmedAmount
             FROM orders o
             LEFT JOIN shops s ON o.shop_id = s.id
             LEFT JOIN cash_transactions ct ON ct.type = 'remittance' AND ct.comment LIKE CONCAT('%', o.id, '%') AND ct.user_id = o.deliveryman_id
             WHERE o.deliveryman_id = ? 
             AND o.created_at BETWEEN ? AND ?
             AND (
                 (o.status = 'delivered' AND o.payment_status = 'cash') OR
                 (o.status = 'failed_delivery' AND o.amount_received > 0) OR
                 (o.payment_status = 'paid_to_supplier' AND o.expedition_fee > 0)
             )
             GROUP BY o.id`,
            params
        );

        const [expenses] = await connection.execute(
            `SELECT 'expense' as type, id, comment, amount, status, created_at as event_date
             FROM cash_transactions
             WHERE user_id = ? AND created_at BETWEEN ? AND ? AND type = 'expense'`,
            params
        );

        const [shortfalls] = await connection.execute(
            `SELECT 'shortfall' as type, id, comment, amount, status, created_at as event_date
             FROM deliveryman_shortfalls
             WHERE deliveryman_id = ? AND created_at BETWEEN ? AND ?`,
            params
        );
        
        return { 
            summary: {
                totalOrdersAmount: summary.totalOrdersAmount,
                totalRemittances: summary.totalRemittances,
                totalExpenses: summary.totalExpenses,
                totalPendingShortfalls: summary.totalPendingShortfalls
            },
            transactions: {
                orders,
                expenses,
                shortfalls
            }
        };

    } catch (error) {
        console.error("Erreur SQL dans RidersCashModel.getRiderCashDetails:", error.message);
        throw error;
    } finally {
        if (connection) connection.release();
    }
};

module.exports = { init, getRiderCashDetails };