// src/models/cash.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const getRemittanceSummary = async () => {
    const connection = await dbConnection.getConnection();
    try {
        const query = `
            SELECT
                u.id AS user_id,
                u.name AS user_name,
                COUNT(ct.id) AS pending_count,
                COALESCE(SUM(ct.amount), 0) AS pending_amount
            FROM users u
            JOIN cash_transactions ct ON u.id = ct.user_id
            WHERE u.role = 'livreur' AND ct.type = 'remittance' AND ct.status = 'pending'
            GROUP BY u.id, u.name
            ORDER BY u.name ASC;
        `;
        const [rows] = await connection.execute(query);
        const [confirmedRows] = await connection.execute(`
            SELECT
                u.id AS user_id,
                COALESCE(COUNT(ct.id), 0) AS confirmed_count,
                COALESCE(SUM(ct.amount), 0) AS confirmed_amount
            FROM users u
            LEFT JOIN cash_transactions ct ON u.id = ct.user_id AND ct.type = 'remittance' AND ct.status = 'confirmed'
            WHERE u.role = 'livreur'
            GROUP BY u.id
        `);

        const summaryMap = new Map(rows.map(item => [item.user_id, item]));
        confirmedRows.forEach(confirmedItem => {
            const item = summaryMap.get(confirmedItem.user_id);
            if (item) {
                item.confirmed_count = confirmedItem.confirmed_count;
                item.confirmed_amount = confirmedItem.confirmed_amount;
            } else {
                summaryMap.set(confirmedItem.user_id, {
                    ...confirmedItem,
                    pending_count: 0,
                    pending_amount: 0,
                });
            }
        });
        
        return Array.from(summaryMap.values());
    } finally {
        connection.release();
    }
};

const getRemittanceDetails = async (deliverymanId) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = `
            SELECT *
            FROM cash_transactions
            WHERE user_id = ? AND type = 'remittance'
            ORDER BY created_at DESC;
        `;
        const [rows] = await connection.execute(query, [deliverymanId]);
        return rows;
    } finally {
        connection.release();
    }
};

const getExpenseCategories = async () => {
    const connection = await dbConnection.getConnection();
    try {
        const [rows] = await connection.execute('SELECT * FROM expense_categories');
        return rows;
    } finally {
        connection.release();
    }
};

const createTransaction = async (transactionData) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        const categoryId = transactionData.category_id || null;
        const validatedBy = (transactionData.type !== 'remittance' ? transactionData.user_id : null);
        
        const query = 'INSERT INTO cash_transactions (user_id, type, category_id, amount, comment, validated_by) VALUES (?, ?, ?, ?, ?, ?)';
        const params = [
            transactionData.user_id,
            transactionData.type,
            categoryId,
            transactionData.amount,
            transactionData.comment,
            validatedBy
        ];
        const [result] = await connection.execute(query, params);
        
        await connection.commit();
        return result.insertId;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const updateTransaction = async (id, transactionData) => {
    const connection = await dbConnection.getConnection();
    try {
        const fieldsToUpdate = [];
        const params = [];

        if (transactionData.amount !== undefined) {
            fieldsToUpdate.push('amount = ?');
            params.push(transactionData.amount);
        }
        if (transactionData.comment !== undefined) {
            fieldsToUpdate.push('comment = ?');
            params.push(transactionData.comment);
        }
        
        if (fieldsToUpdate.length === 0) {
            return { success: false, message: 'No data to update' };
        }

        const query = `UPDATE cash_transactions SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
        params.push(id);
        
        const [result] = await connection.execute(query, params);
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

const deleteTransaction = async (id) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'DELETE FROM cash_transactions WHERE id = ?';
        const [result] = await connection.execute(query, [id]);
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

const confirmTransaction = async (transactionId, validatedBy) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'UPDATE cash_transactions SET status = ?, validated_by = ?, validated_at = NOW() WHERE id = ? AND status = "pending"';
        const [result] = await connection.execute(query, ['confirmed', validatedBy, transactionId]);
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

const confirmBatch = async (transactionIds, validatedBy) => {
    const connection = await dbConnection.getConnection();
    try {
        const placeholders = transactionIds.map(() => '?').join(', ');
        const query = `UPDATE cash_transactions SET status = 'confirmed', validated_by = ?, validated_at = NOW() WHERE id IN (${placeholders}) AND status = 'pending'`;
        const params = [validatedBy, ...transactionIds];
        const [result] = await connection.execute(query, params);
        return { success: result.affectedRows > 0, affectedRows: result.affectedRows };
    } finally {
        connection.release();
    }
};

const findAllTransactions = async (filters) => {
    const connection = await dbConnection.getConnection();
    try {
        let query = `
            SELECT ct.*, u.name AS user_name, ec.name AS category_name
            FROM cash_transactions ct
            LEFT JOIN users u ON ct.user_id = u.id
            LEFT JOIN expense_categories ec ON ct.category_id = ec.id
            WHERE 1=1
        `;
        const params = [];
        if (filters.type) {
            query += ` AND ct.type = ?`;
            params.push(filters.type);
        }
        if (filters.status) {
            query += ` AND ct.status = ?`;
            params.push(filters.status);
        }
        if (filters.startDate) {
             query += ` AND ct.created_at >= ?`;
             params.push(moment(filters.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'));
         }
 
        if (filters.endDate) {
             query += ` AND ct.created_at <= ?`;
             params.push(moment(filters.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss'));
         }
        query += ` ORDER BY ct.created_at DESC`;

        const [rows] = await connection.execute(query, params);
        return rows;
    } finally {
        connection.release();
    }
};

const findTransactionById = async (id) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'SELECT * FROM cash_transactions WHERE id = ?';
        const [rows] = await connection.execute(query, [id]);
        return rows[0];
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    getRemittanceSummary,
    getRemittanceDetails,
    getExpenseCategories,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    confirmTransaction,
    confirmBatch,
    findAllTransactions,
    findTransactionById
};