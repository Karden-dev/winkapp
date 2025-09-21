// src/models/cash.model.js
const moment = require('moment');
let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const create = async (transactionData) => {
    const { user_id, type, category_id, amount, comment } = transactionData;
    const query = `
        INSERT INTO cash_transactions (user_id, type, category_id, amount, comment, status, created_at, validated_by) 
        VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
    `;
    const status = type === 'remittance' ? 'pending' : 'confirmed';
    const validatedBy = type === 'remittance' ? null : user_id;
    const [result] = await dbConnection.execute(query, [user_id, type, category_id, amount, comment, status, validatedBy]);
    return result.insertId;
};

const update = async (id, data) => {
    const query = 'UPDATE cash_transactions SET amount = ?, comment = ? WHERE id = ?';
    const [result] = await dbConnection.execute(query, [data.amount, data.comment, id]);
    return result;
};

const remove = async (id) => {
    const query = 'DELETE FROM cash_transactions WHERE id = ?';
    const [result] = await dbConnection.execute(query, [id]);
    return result;
};

const findAll = async (filters) => {
    let query = `
        SELECT ct.*, u.name as user_name, ec.name as category_name, val.name as validated_by_name
        FROM cash_transactions ct
        LEFT JOIN users u ON ct.user_id = u.id
        LEFT JOIN users val ON ct.validated_by = val.id
        LEFT JOIN expense_categories ec ON ct.category_id = ec.id
        WHERE 1=1 `;
    const params = [];
    if (filters.type) {
        query += ' AND ct.type = ?';
        params.push(filters.type);
    }
    if (filters.startDate && filters.endDate) {
        query += ' AND DATE(ct.created_at) BETWEEN ? AND ?';
        params.push(filters.startDate, filters.endDate);
    }
    if (filters.search) {
        query += ' AND (u.name LIKE ? OR ct.comment LIKE ? OR ec.name LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }
    query += ' ORDER BY ct.created_at DESC';
    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

const getExpenseCategories = async () => {
    const [rows] = await dbConnection.execute('SELECT * FROM expense_categories ORDER BY name ASC');
    return rows;
};

const findRemittanceSummary = async (startDate, endDate, search) => {
    let query = `
        SELECT 
            u.id as user_id, u.name as user_name, 
            SUM(CASE WHEN ct.status = 'pending' THEN 1 ELSE 0 END) as pending_count, 
            COALESCE(SUM(CASE WHEN ct.status = 'pending' THEN ct.amount ELSE 0 END), 0) as pending_amount,
            SUM(CASE WHEN ct.status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
            COALESCE(SUM(CASE WHEN ct.status = 'confirmed' THEN ct.amount ELSE 0 END), 0) as confirmed_amount
        FROM users u
        LEFT JOIN cash_transactions ct ON u.id = ct.user_id 
            AND ct.type = 'remittance' 
            AND DATE(ct.created_at) BETWEEN ? AND ?
        WHERE u.role = 'livreur'
    `;
    const params = [startDate, endDate];
    if (search) {
        query += ' AND u.name LIKE ?';
        params.push(`%${search}%`);
    }
    query += ` GROUP BY u.id, u.name HAVING pending_count > 0 OR confirmed_count > 0 ORDER BY u.name ASC`;
    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

const findRemittanceDetails = async (deliverymanId, startDate, endDate) => {
    let query = `
        SELECT 
            ct.*, o.id as order_id, o.delivery_location, s.name as shop_name,
            GROUP_CONCAT(oi.item_name SEPARATOR ', ') as item_names
        FROM cash_transactions ct
        LEFT JOIN orders o ON ct.comment LIKE CONCAT('%', o.id) 
        LEFT JOIN shops s ON o.shop_id = s.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE ct.user_id = ? AND ct.type = 'remittance'
    `;
    const params = [deliverymanId];
    if (startDate && endDate) {
        query += ' AND DATE(ct.created_at) BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }
    query += ` GROUP BY ct.id ORDER BY ct.status ASC, ct.created_at DESC`;
    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

const updateRemittanceAmount = async (transactionId, newAmount) => {
    const query = 'UPDATE cash_transactions SET amount = ? WHERE id = ?';
    const [result] = await dbConnection.execute(query, [newAmount, transactionId]);
    return result;
};

const confirmRemittance = async (transactionIds, paidAmount, validatedBy) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();
        const placeholders = transactionIds.map(() => '?').join(',');
        const [transactions] = await connection.execute(`SELECT * FROM cash_transactions WHERE id IN (${placeholders}) AND status = 'pending'`, transactionIds);
        
        if (transactions.length === 0) throw new Error("Aucune transaction en attente sélectionnée.");
        const deliverymanId = transactions[0].user_id;
        const expectedAmount = transactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        const difference = expectedAmount - paidAmount;

        await connection.execute(`UPDATE cash_transactions SET status = 'confirmed', validated_by = ?, validated_at = NOW() WHERE id IN (${placeholders})`, [validatedBy, ...transactionIds]);

        if (difference > 0) {
            await connection.execute(`INSERT INTO deliveryman_shortfalls (deliveryman_id, amount, comment, created_by_user_id) VALUES (?, ?, ?, ?)`, [deliverymanId, difference, `Manquant sur versement(s) ID: ${transactionIds.join(', ')}`, validatedBy]);
        }
        await connection.commit();
        return { success: true, expected: expectedAmount, paid: paidAmount, shortfall: difference };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const findShortfalls = async (filters = {}) => {
    let query = `
        SELECT ds.*, u.name as deliveryman_name
        FROM deliveryman_shortfalls ds
        JOIN users u ON ds.deliveryman_id = u.id
        WHERE 1=1
    `;
    const params = [];
    if (filters.status) {
        query += ' AND ds.status = ?';
        params.push(filters.status);
    }
    if (filters.search) {
        query += ' AND u.name LIKE ?';
        params.push(`%${filters.search}%`);
    }
    query += ' ORDER BY ds.created_at DESC';
    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

const settleShortfall = async (shortfallId, amount, userId) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();
        const [shortfalls] = await connection.execute('SELECT * FROM deliveryman_shortfalls WHERE id = ? FOR UPDATE', [shortfallId]);
        const shortfall = shortfalls[0];
        if (!shortfall) throw new Error("Manquant non trouvé.");

        const amountToSettle = parseFloat(amount);
        const currentAmount = parseFloat(shortfall.amount);
        if (amountToSettle > currentAmount) throw new Error("Le montant réglé ne peut être supérieur au montant du manquant.");

        const remainingAmount = currentAmount - amountToSettle;
        const newStatus = remainingAmount <= 0.009 ? 'paid' : 'partially_paid';

        await connection.execute('UPDATE deliveryman_shortfalls SET amount = ?, status = ?, settled_at = NOW() WHERE id = ?', [remainingAmount > 0 ? remainingAmount : 0, newStatus, shortfallId]);
        
        await connection.commit();
        return { success: true };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const performCashClosing = async (closingDate, actualCash, comment, userId) => {
    const connection = await dbConnection.getConnection();
    try {
        const startOfDay = moment(closingDate).startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const endOfDay = moment(closingDate).endOf('day').format('YYYY-MM-DD HH:mm:ss');

        const [transactions] = await connection.execute(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'remittance' AND status = 'confirmed' THEN amount ELSE 0 END), 0) as total_collected,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expenses,
                COALESCE(SUM(CASE WHEN type = 'manual_withdrawal' THEN amount ELSE 0 END), 0) as total_withdrawals
            FROM cash_transactions
            WHERE ( (type = 'remittance' AND status = 'confirmed' AND validated_at BETWEEN ? AND ?) OR 
                    (type IN ('expense', 'manual_withdrawal') AND created_at BETWEEN ? AND ?) )
        `, [startOfDay, endOfDay, startOfDay, endOfDay]);
        
        const expectedCash = parseFloat(transactions[0].total_collected) + parseFloat(transactions[0].total_expenses) + parseFloat(transactions[0].total_withdrawals);
        const difference = actualCash - expectedCash;

        const closingData = {
            closing_date: closingDate,
            total_remitted: transactions[0].total_collected,
            total_expenses: Math.abs(transactions[0].total_expenses),
            total_withdrawals: Math.abs(transactions[0].total_withdrawals),
            expected_cash: expectedCash,
            actual_cash_counted: actualCash,
            difference: difference,
            comment: comment,
            closed_by_user_id: userId
        };

        await connection.execute(`
            INSERT INTO cash_closings (closing_date, total_remitted, total_expenses, total_withdrawals, expected_cash, actual_cash_counted, difference, comment, closed_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            total_remitted=VALUES(total_remitted), total_expenses=VALUES(total_expenses), total_withdrawals=VALUES(total_withdrawals), expected_cash=VALUES(expected_cash), actual_cash_counted=VALUES(actual_cash_counted), difference=VALUES(difference), comment=VALUES(comment), closed_by_user_id=VALUES(closed_by_user_id);
        `, [closingData.closing_date, closingData.total_remitted, closingData.total_expenses, closingData.total_withdrawals, closingData.expected_cash, closingData.actual_cash_counted, closingData.difference, closingData.comment, closingData.closed_by_user_id]);

        return closingData;
    } finally {
        connection.release();
    }
};

const findClosingHistory = async (filters = {}) => {
    let query = `
        SELECT c.*, u.name as closed_by_user_name 
        FROM cash_closings c 
        LEFT JOIN users u ON c.closed_by_user_id = u.id
        WHERE 1=1 `;
    const params = [];
    if (filters.startDate && filters.endDate) {
        query += ' AND c.closing_date BETWEEN ? AND ?';
        params.push(filters.startDate, filters.endDate);
    }
    query += ' ORDER BY c.closing_date DESC';
    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

const getCashMetrics = async (startDate, endDate) => {
    const connection = await dbConnection.getConnection();
    try {
        const [transactions] = await connection.execute(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'remittance' AND status = 'confirmed' THEN amount ELSE 0 END), 0) as total_collected,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as total_expenses,
                COALESCE(SUM(CASE WHEN type = 'manual_withdrawal' THEN ABS(amount) ELSE 0 END), 0) as total_withdrawals
            FROM cash_transactions
            WHERE 
                (type = 'remittance' AND status = 'confirmed' AND DATE(validated_at) BETWEEN ? AND ?) OR 
                (type IN ('expense', 'manual_withdrawal') AND DATE(created_at) BETWEEN ? AND ?)
        `, [startDate, endDate, startDate, endDate]);

        const metrics = transactions[0];
        const cashOnHand = parseFloat(metrics.total_collected) - parseFloat(metrics.total_expenses) - parseFloat(metrics.total_withdrawals);

        return {
            total_collected: metrics.total_collected,
            total_expenses: metrics.total_expenses,
            total_withdrawals: metrics.total_withdrawals,
            cash_on_hand: cashOnHand
        };
    } finally {
        connection.release();
    }
};

module.exports = {
    init, create, update, remove, findAll, getExpenseCategories,
    findRemittanceSummary, findRemittanceDetails, updateRemittanceAmount,
    confirmRemittance, findShortfalls, settleShortfall,
    performCashClosing, findClosingHistory, getCashMetrics
};