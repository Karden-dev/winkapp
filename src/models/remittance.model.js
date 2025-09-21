// src/models/remittance.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const findForRemittance = async (filters = {}) => {
    const { search, startDate, endDate, status } = filters;
    const params = [];

    let query = `
        SELECT
            s.id AS shop_id,
            s.name AS shop_name,
            s.payment_name AS payment_name,
            s.phone_number_for_payment AS phone_number_for_payment,
            s.payment_operator AS payment_operator,
            COALESCE(SUM(
                CASE
                    WHEN o.status = 'delivered' AND o.payment_status = 'cash' THEN o.article_amount - o.delivery_fee
                    WHEN o.status = 'delivered' AND o.payment_status = 'paid_to_supplier' THEN -o.delivery_fee
                    WHEN o.status = 'failed_delivery' THEN o.amount_received - o.delivery_fee
                    ELSE 0
                END
            ), 0) AS orders_payout_amount,
            (SELECT COALESCE(SUM(amount), 0) FROM debts WHERE shop_id = s.id AND status = 'pending') AS total_debt_amount,
            (SELECT COALESCE(SUM(amount), 0) FROM remittances WHERE shop_id = s.id AND status IN ('paid', 'partially_paid')) AS total_remitted_amount
        FROM shops s
        LEFT JOIN orders o ON s.id = o.shop_id
    `;

    let whereClause = ` WHERE 1=1 `;
    
    if (search) {
        whereClause += ` AND (s.name LIKE ? OR s.payment_name LIKE ? OR s.phone_number_for_payment LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (startDate && endDate) {
        whereClause += ` AND o.created_at BETWEEN ? AND ?`;
        params.push(moment(startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'), moment(endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss'));
    }

    query += whereClause + ` GROUP BY s.id ORDER BY s.name ASC`;
    const [shops] = await dbConnection.execute(query, params);

    const remittancesWithStatus = shops.map(shop => {
        const totalOrdersPayout = parseFloat(shop.orders_payout_amount);
        const totalDebt = parseFloat(shop.total_debt_amount);
        const totalRemitted = parseFloat(shop.total_remitted_amount);
        
        const currentBalance = totalOrdersPayout - totalDebt - totalRemitted;

        let shopStatus;
        if (currentBalance > 0) {
            shopStatus = 'pending';
        } else if (currentBalance === 0) {
            shopStatus = 'paid';
        } else if (currentBalance < 0) {
            shopStatus = 'partially_paid';
        }

        return {
            ...shop,
            total_payout_amount: currentBalance,
            status: shopStatus
        };
    });

    // Si le statut est spécifié, on filtre la liste. Sinon, on retourne la liste complète.
    if (status) {
        return remittancesWithStatus.filter(shop => shop.status === status);
    }
    
    return remittancesWithStatus;
};

const getShopDetails = async (shopId) => {
    const connection = await dbConnection.getConnection();
    try {
        const [remittances] = await connection.execute(
            'SELECT * FROM remittances WHERE shop_id = ? ORDER BY payment_date DESC',
            [shopId]
        );

        const [debts] = await connection.execute(
            'SELECT * FROM debts WHERE shop_id = ? AND status = "pending" ORDER BY created_at DESC',
            [shopId]
        );
        
        const [ordersPayout] = await connection.execute(
             `
             SELECT
                COALESCE(SUM(
                    CASE
                        WHEN status = 'delivered' AND payment_status = 'cash' THEN article_amount - delivery_fee
                        WHEN status = 'delivered' AND payment_status = 'paid_to_supplier' THEN -delivery_fee
                        WHEN status = 'failed_delivery' THEN amount_received - delivery_fee
                        ELSE 0
                    END
                ), 0) AS orders_payout_amount
            FROM orders
            WHERE shop_id = ? AND (status IN ('delivered', 'failed_delivery'))
             `,
             [shopId]
        );
        const ordersPayoutAmount = ordersPayout[0].orders_payout_amount || 0;

        const totalDebt = debts.reduce((sum, debt) => sum + parseFloat(debt.amount), 0);
        const totalRemitted = remittances.reduce((sum, rem) => sum + parseFloat(rem.amount), 0);
        const currentBalance = ordersPayoutAmount - totalDebt - totalRemitted;

        return { remittances, debts, currentBalance };
    } finally {
        connection.release();
    }
};

const updateShopPaymentDetails = async (shopId, paymentData) => {
    const { payment_name, phone_number_for_payment, payment_operator } = paymentData;
    const query = 'UPDATE shops SET payment_name = ?, phone_number_for_payment = ?, payment_operator = ? WHERE id = ?';
    const [result] = await dbConnection.execute(query, [payment_name, phone_number_for_payment, payment_operator, shopId]);
    return result;
};

const recordRemittance = async (shopId, amount, paymentOperator, status, transactionId = null, comment = null, userId) => {
    const query = 'INSERT INTO remittances (shop_id, amount, payment_date, payment_operator, status, transaction_id, comment, user_id) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?)';
    const [result] = await dbConnection.execute(query, [shopId, amount, paymentOperator, status, transactionId, comment, userId]);
    
    if (status === 'paid') {
        await dbConnection.execute('UPDATE debts SET status = "paid" WHERE shop_id = ? AND status = "pending"', [shopId]);
    }

    return result;
};

module.exports = {
    init,
    findForRemittance,
    getShopDetails,
    updateShopPaymentDetails,
    recordRemittance,
};