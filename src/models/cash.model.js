// src/models/cash.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const create = async (transactionData) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'INSERT INTO cash_transactions (user_id, type, category_id, amount, comment, status) VALUES (?, ?, ?, ?, ?, ?)';
        const [result] = await connection.execute(query, [transactionData.user_id, transactionData.type, transactionData.category_id, transactionData.amount, transactionData.comment, transactionData.status]);
        return result.insertId;
    } finally {
        connection.release();
    }
};

const findAll = async (filters) => {
    const connection = await dbConnection.getConnection();
    try {
        let query = `
            SELECT ct.*, u.name as user_name, v.name as validated_by_name, ec.name as category_name
            FROM cash_transactions ct
            LEFT JOIN users u ON ct.user_id = u.id
            LEFT JOIN users v ON ct.validated_by = v.id
            LEFT JOIN expense_categories ec ON ct.category_id = ec.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.search) {
            query += ` AND (u.name LIKE ? OR ct.comment LIKE ?)`;
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

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

const confirm = async (transactionId, validatedByUserId) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'UPDATE cash_transactions SET status = "confirmed", validated_by = ?, created_at = NOW() WHERE id = ? AND status = "pending"';
        const [result] = await connection.execute(query, [validatedByUserId, transactionId]);
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

const getExpenseCategories = async (type) => {
    const connection = await dbConnection.getConnection();
    try {
        let query = 'SELECT * FROM expense_categories';
        const params = [];
        if (type) {
            query += ' WHERE type = ?';
            params.push(type);
        }
        const [rows] = await connection.execute(query, params);
        return rows;
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    create,
    findAll,
    confirm,
    getExpenseCategories
};