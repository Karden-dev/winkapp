// src/models/cash.model.js
const moment = require('moment');
let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const create = async (transactionData) => {
    const { user_id, type, category_id, amount, comment } = transactionData;
    const status = type === 'remittance' ? 'pending' : 'confirmed';
    const query = 'INSERT INTO cash_transactions (user_id, type, category_id, amount, comment, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())';
    const [result] = await dbConnection.execute(query, [user_id, type, category_id, amount, comment, status]);
    return result.insertId;
};

const updateTransaction = async (id, data, userId) => {
    const { amount, comment } = data;
    const query = `UPDATE cash_transactions SET amount = ?, comment = ?, validated_by = ? WHERE id = ? AND status = 'pending'`;
    const [result] = await dbConnection.execute(query, [amount, comment, userId, id]);
    return { success: result.affectedRows > 0 };
};

const getExpenseCategories = async () => {
    const [rows] = await dbConnection.execute('SELECT * FROM expense_categories ORDER BY name ASC');
    return rows;
};

const findRemittanceSummary = async (filters = {}) => {
    const { startDate, endDate, search } = filters;
    let query = `
        SELECT
            u.id AS user_id, u.name AS user_name,
            SUM(CASE WHEN ct.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
            COALESCE(SUM(CASE WHEN ct.status = 'pending' THEN ct.amount ELSE 0 END), 0) AS pending_amount,
            SUM(CASE WHEN ct.status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
            COALESCE(SUM(CASE WHEN ct.status = 'confirmed' THEN ct.amount ELSE 0 END), 0) AS confirmed_amount
        FROM users u
        LEFT JOIN cash_transactions ct ON u.id = ct.user_id AND ct.type = 'remittance'
            ${(startDate && endDate) ? "AND DATE(ct.created_at) BETWEEN ? AND ?" : ""}
        WHERE u.role = 'livreur' AND u.status = 'actif'
            ${search ? "AND u.name LIKE ?" : ""}
        GROUP BY u.id, u.name
        HAVING pending_count > 0 OR confirmed_count > 0
        ORDER BY u.name ASC;
    `;
    const params = [];
    if (startDate && endDate) params.push(startDate, endDate);
    if (search) params.push(`%${search}%`);

    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

const findTransactions = async (filters = {}) => {
    const { type, search, startDate, endDate, page = 1, limit = 1000 } = filters; // Augmenté la limite par défaut
    const offset = (page - 1) * limit;

    let query = `
        SELECT SQL_CALC_FOUND_ROWS ct.*, u.name as user_name, ec.name as category_name
        FROM cash_transactions ct
        JOIN users u ON ct.user_id = u.id
        LEFT JOIN expense_categories ec ON ct.category_id = ec.id
        WHERE 1=1
    `;
    const params = [];

    if (type) {
        query += ' AND ct.type = ?';
        params.push(type);
    }
    if (startDate) {
        query += ' AND DATE(ct.created_at) >= ?';
        params.push(startDate);
    }
    if (endDate) {
        query += ' AND DATE(ct.created_at) <= ?';
        params.push(endDate);
    }
    if (search) {
        query += ' AND (u.name LIKE ? OR ct.comment LIKE ? OR ec.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY ct.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [data] = await dbConnection.execute(query, params);
    const [totalResult] = await dbConnection.execute('SELECT FOUND_ROWS() as total');
    
    return {
        data,
        totalItems: totalResult[0].total
    };
};

const findRemittanceDetails = async (deliverymanId) => {
    const query = `
        SELECT * FROM cash_transactions
        WHERE user_id = ? AND type = 'remittance'
        ORDER BY created_at DESC;
    `;
    const [rows] = await dbConnection.execute(query, [deliverymanId]);
    return rows;
};

const confirm = async (transactionId, validatedById) => {
    const query = `
        UPDATE cash_transactions
        SET status = 'confirmed', validated_by = ?, validated_at = NOW()
        WHERE id = ? AND status = 'pending';
    `;
    const [result] = await dbConnection.execute(query, [validatedById, transactionId]);
    return { success: result.affectedRows > 0 };
};

const confirmBatch = async (transactionIds, validatedById) => {
    if (transactionIds.length === 0) return { success: true, affectedRows: 0 };
    const placeholders = transactionIds.map(() => '?').join(',');
    const query = `
        UPDATE cash_transactions SET status = 'confirmed', validated_by = ?, validated_at = NOW()
        WHERE id IN (${placeholders}) AND status = 'pending';
    `;
    const params = [validatedById, ...transactionIds];
    const [result] = await dbConnection.execute(query, params);
    return { success: true, affectedRows: result.affectedRows };
};

const getDailySummaryForClosing = async (date) => {
    const connection = await dbConnection.getConnection();
    try {
        const [isClosed] = await connection.execute('SELECT id FROM cash_closings WHERE closing_date = ?', [date]);
        if (isClosed.length > 0) {
            throw new Error('Cette journée a déjà été clôturée.');
        }

        const query = `
            SELECT
                (SELECT COALESCE(SUM(CASE WHEN o.payment_status = 'cash' THEN o.article_amount ELSE o.amount_received END), 0) FROM orders o WHERE DATE(o.updated_at) = ? AND o.status IN ('delivered', 'failed_delivery')) as total_cash_collected,
                (SELECT COALESCE(SUM(ct.amount), 0) FROM cash_transactions ct WHERE DATE(ct.created_at) = ? AND ct.type = 'expense' AND ct.status='confirmed') as total_expenses,
                (SELECT COALESCE(SUM(ct.amount), 0) FROM cash_transactions ct WHERE DATE(ct.validated_at) = ? AND ct.type = 'remittance' AND ct.status='confirmed') as total_remitted,
                (SELECT COALESCE(SUM(ct.amount), 0) FROM cash_transactions ct WHERE DATE(ct.created_at) = ? AND ct.type = 'manual_withdrawal' AND ct.status='confirmed') as total_withdrawals;
        `;
        const [rows] = await connection.execute(query, [date, date, date, date]);
        return rows[0];
    } finally {
        connection.release();
    }
};

const closeCashRegister = async (closingData) => {
    const { closing_date, ...data } = closingData;
    const query = 'INSERT INTO cash_closings SET closing_date = ?, ?';
    const [result] = await dbConnection.execute(query, [closing_date, data]);
    return result.insertId;
};

const findCashClosings = async (filters = {}) => {
    const { startDate, endDate } = filters;
    let query = 'SELECT * FROM cash_closings';
    const params = [];
    if (startDate && endDate) {
        query += ' WHERE closing_date BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }
    query += ' ORDER BY closing_date DESC';
    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

module.exports = {
    init,
    create,
    updateTransaction,
    getExpenseCategories,
    findRemittanceSummary,
    findTransactions,
    findRemittanceDetails,
    confirm,
    confirmBatch,
    getDailySummaryForClosing,
    closeCashRegister,
    findCashClosings
};