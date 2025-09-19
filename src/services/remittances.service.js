// src/services/remittances.service.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const calculateShopPayoutAmount = async (shopId, startDate, endDate) => {
    const connection = await dbConnection.getConnection();
    try {
        let query = `
            SELECT
                COALESCE(SUM(
                    CASE
                        WHEN o.status = 'delivered' AND o.payment_status = 'cash' THEN o.article_amount - o.delivery_fee
                        WHEN o.status = 'delivered' AND o.payment_status = 'paid_to_supplier' THEN -o.delivery_fee
                        WHEN o.status = 'failed_delivery' THEN o.amount_received - o.delivery_fee
                        ELSE 0
                    END
                ), 0) AS total_payout_amount
            FROM orders o
            WHERE o.shop_id = ? AND o.status IN ('delivered', 'failed_delivery')
        `;
        const params = [shopId];

        if (startDate && endDate) {
            query += ' AND o.created_at BETWEEN ? AND ?';
            params.push(moment(startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'), moment(endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss'));
        }

        const [ordersPayout] = await connection.execute(query, params);
        const ordersPayoutAmount = parseFloat(ordersPayout[0].total_payout_amount || 0);

        const [debts] = await connection.execute(
            'SELECT COALESCE(SUM(amount), 0) AS total_debt FROM debts WHERE shop_id = ? AND status = "pending"',
            [shopId]
        );
        const totalDebt = parseFloat(debts[0].total_debt || 0);

        return ordersPayoutAmount - totalDebt;
    } finally {
        connection.release();
    }
};

const markDebtsAsPaid = async (debtIds) => {
    if (!debtIds || debtIds.length === 0) {
        return;
    }
    const placeholders = debtIds.map(() => '?').join(', ');
    const query = `UPDATE debts SET status = 'paid' WHERE id IN (${placeholders})`;
    await dbConnection.execute(query, debtIds);
};

const recordRemittance = async (shopId, amount, paymentOperator, status, transactionId = null, comment = null, userId) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        const remittanceQuery = 'INSERT INTO remittances (shop_id, amount, payment_date, payment_operator, status, transaction_id, comment, user_id) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?)';
        const [result] = await connection.execute(remittanceQuery, [shopId, amount, paymentOperator, status, transactionId, comment, userId]);
        
        if (status === 'paid') {
            await connection.execute('UPDATE debts SET status = "paid" WHERE shop_id = ? AND status = "pending"', [shopId]);
        }

        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    calculateShopPayoutAmount,
    markDebtsAsPaid,
    recordRemittance,
};