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

const findById = async (id) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'SELECT * FROM cash_transactions WHERE id = ?';
        const [rows] = await connection.execute(query, [id]);
        return rows[0];
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

const updateTransaction = async (id, transactionData) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'UPDATE cash_transactions SET amount = ?, comment = ?, category_id = ? WHERE id = ?';
        const [result] = await connection.execute(query, [transactionData.amount, transactionData.comment, transactionData.category_id, id]);
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

const confirm = async (transactionId, validatedByUserId) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'UPDATE cash_transactions SET status = "confirmed", validated_by = ?, validated_at = NOW() WHERE id = ? AND status = "pending"';
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

const findRemittanceSummary = async () => {
    const connection = await dbConnection.getConnection();
    try {
        const query = `
            SELECT
                u.id AS user_id,
                u.name AS user_name,
                COALESCE(SUM(CASE WHEN ct.status = 'pending' THEN ct.amount ELSE 0 END), 0) AS pending_amount,
                COUNT(CASE WHEN ct.status = 'pending' THEN ct.id ELSE NULL END) AS pending_count
            FROM users u
            LEFT JOIN cash_transactions ct ON u.id = ct.user_id AND ct.type = 'remittance'
            WHERE u.role = 'livreur'
            GROUP BY u.id
            HAVING pending_count > 0;
        `;
        const [rows] = await connection.execute(query);
        return rows;
    } finally {
        connection.release();
    }
};

const findRemittanceDetails = async (deliverymanId) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = `
            SELECT ct.*, u.name AS user_name
            FROM cash_transactions ct
            LEFT JOIN users u ON ct.user_id = u.id
            WHERE ct.user_id = ? AND ct.type = 'remittance'
            ORDER BY ct.created_at DESC;
        `;
        const [rows] = await connection.execute(query, [deliverymanId]);
        return rows;
    } finally {
        connection.release();
    }
};

const confirmBatch = async (transactionIds, validatedByUserId) => {
    const connection = await dbConnection.getConnection();
    try {
        const placeholders = transactionIds.map(() => '?').join(', ');
        const query = `
            UPDATE cash_transactions
            SET status = 'confirmed', validated_by = ?, validated_at = NOW()
            WHERE id IN (${placeholders}) AND status = 'pending';
        `;
        const params = [validatedByUserId, ...transactionIds];
        const [result] = await connection.execute(query, params);
        return { success: result.affectedRows > 0, affectedRows: result.affectedRows };
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    create,
    findById,
    findAll,
    updateTransaction,
    confirm,
    getExpenseCategories,
    findRemittanceSummary,
    findRemittanceDetails,
    confirmBatch
};