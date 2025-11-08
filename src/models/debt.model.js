// src/models/debt.model.js
const moment = require('moment');
const balanceService = require('../services/balance.service');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const findAll = async (filters) => {
    const connection = await dbConnection.getConnection();
    try {
        let query = `
            SELECT d.*, s.name AS shop_name
            FROM debts d
            JOIN shops s ON d.shop_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.search) {
            query += ` AND s.name LIKE ?`;
            params.push(`%${filters.search}%`);
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
        await connection.beginTransaction();

        const query = 'INSERT INTO debts (shop_id, amount, type, comment, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const [result] = await connection.execute(query, [
            debtData.shop_id, debtData.amount, debtData.type,
            debtData.comment, 'pending', debtData.created_by, debtData.created_at
        ]);

        // Mettre à jour le bilan dynamique avec l'impact de cette nouvelle créance manuelle
        await balanceService.updateDailyBalance(connection, {
            shop_id: debtData.shop_id,
            date: moment(debtData.created_at).format('YYYY-MM-DD'),
            remittance_impact_override: -parseFloat(debtData.amount)
        });

        await connection.commit();
        return result.insertId;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const update = async (id, debtData, userId) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        const [oldDebtRows] = await connection.execute('SELECT * FROM debts WHERE id = ?', [id]);
        if (oldDebtRows.length === 0) throw new Error("Créance non trouvée");
        const oldDebt = oldDebtRows[0];

        // Annuler l'ancien impact sur le bilan
        await balanceService.updateDailyBalance(connection, {
            shop_id: oldDebt.shop_id,
            date: moment(oldDebt.created_at).format('YYYY-MM-DD'),
            remittance_impact_override: parseFloat(oldDebt.amount) // On l'ajoute pour annuler la soustraction
        });

        const query = 'UPDATE debts SET amount = ?, comment = ?, updated_by = ?, updated_at = NOW() WHERE id = ? AND type != "daily_balance"';
        const [result] = await connection.execute(query, [debtData.amount, debtData.comment, userId, id]);

        // Appliquer le nouvel impact sur le bilan
        await balanceService.updateDailyBalance(connection, {
            shop_id: oldDebt.shop_id,
            date: moment(oldDebt.created_at).format('YYYY-MM-DD'),
            remittance_impact_override: -parseFloat(debtData.amount) // On soustrait le nouveau montant
        });

        await connection.commit();
        return { success: result.affectedRows > 0 };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const remove = async (id) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();
        const [oldDebtRows] = await connection.execute('SELECT * FROM debts WHERE id = ?', [id]);
        if (oldDebtRows.length === 0) throw new Error("Créance non trouvée");
        const oldDebt = oldDebtRows[0];

        await balanceService.updateDailyBalance(connection, {
            shop_id: oldDebt.shop_id,
            date: moment(oldDebt.created_at).format('YYYY-MM-DD'),
            remittance_impact_override: parseFloat(oldDebt.amount)
        });

        const query = 'DELETE FROM debts WHERE id = ? AND type != "daily_balance"';
        const [result] = await connection.execute(query, [id]);

        await connection.commit();
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