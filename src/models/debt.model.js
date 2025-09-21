// src/models/debt.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const findAll = async (filters) => {
    const connection = await dbConnection.getConnection();
    try {
        let query = `
            SELECT d.*, s.name AS shop_name, s.payment_name AS payment_name
            FROM debts d
            LEFT JOIN shops s ON d.shop_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.search) {
            query += ` AND (s.name LIKE ? OR s.payment_name LIKE ?)`;
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        if (filters.status) {
            query += ` AND d.status = ?`;
            params.push(filters.status);
        }

        if (filters.startDate) {
            query += ` AND d.created_at >= ?`;
            params.push(moment(filters.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'));
        }

        if (filters.endDate) {
            query += ` AND d.created_at <= ?`;
            params.push(moment(filters.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss'));
        }

        query += ` ORDER BY d.created_at DESC`;

        const [rows] = await connection.execute(query, params);
        return rows;
    } finally {
        connection.release();
    }
};

const findById = async (id) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'SELECT * FROM debts WHERE id = ?';
        const [rows] = await connection.execute(query, [id]);
        return rows[0];
    } finally {
        connection.release();
    }
};

const create = async (debtData) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'INSERT INTO debts (shop_id, amount, type, comment, status, created_by) VALUES (?, ?, ?, ?, ?, ?)';
        const [result] = await connection.execute(query, [debtData.shop_id, debtData.amount, debtData.type, debtData.comment, 'pending', debtData.created_by]);
        return result.insertId;
    } finally {
        connection.release();
    }
};

const update = async (id, debtData, userId) => {
    const connection = await dbConnection.getConnection();
    try {
        const fieldsToUpdate = [];
        const params = [];

        if (debtData.amount !== undefined) {
            fieldsToUpdate.push('amount = ?');
            params.push(debtData.amount);
        }
        if (debtData.comment !== undefined) {
            fieldsToUpdate.push('comment = ?');
            params.push(debtData.comment);
        }
        
        if (fieldsToUpdate.length === 0) {
            return { success: false, message: 'No data to update' };
        }

        fieldsToUpdate.push('updated_by = ?');
        params.push(userId);
        fieldsToUpdate.push('updated_at = NOW()');

        const query = `UPDATE debts SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
        params.push(id);
        
        const [result] = await connection.execute(query, params);
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

const remove = async (id) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'DELETE FROM debts WHERE id = ?';
        const [result] = await connection.execute(query, [id]);
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

const settle = async (id, userId) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'UPDATE debts SET status = ?, settled_at = NOW(), updated_by = ? WHERE id = ?';
        const [result] = await connection.execute(query, ['paid', userId, id]);
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    findAll,
    findById,
    create,
    update,
    remove,
    settle
};