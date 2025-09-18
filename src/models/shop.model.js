// src/models/shop.model.js
let dbConnection;

module.exports = {
    init: (connection) => {
        dbConnection = connection;
    },

    create: async (shopData) => {
        const { name, phone_number, created_by, bill_packaging, bill_storage, packaging_price, storage_price } = shopData;
        const query = 'INSERT INTO shops (name, phone_number, created_by, bill_packaging, bill_storage, packaging_price, storage_price, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)';
        const [result] = await dbConnection.execute(query, [name, phone_number, created_by, bill_packaging, bill_storage, packaging_price, storage_price, 'actif']);
        return result;
    },

    findAll: async (filters = {}) => {
        let query = `
            SELECT s.*, u.name AS creator_name 
            FROM shops s
            LEFT JOIN users u ON s.created_by = u.id
        `;
        const params = [];

        let whereClauses = [];
        if (filters.status) {
            whereClauses.push('s.status = ?');
            params.push(filters.status);
        }
        if (filters.search) {
            whereClauses.push('s.name LIKE ?');
            params.push(`%${filters.search}%`);
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        
        query += ' ORDER BY s.name ASC';
        const [rows] = await dbConnection.execute(query, params);
        return rows;
    },

    countAll: async () => {
        const query = `
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'actif' THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 'inactif' THEN 1 ELSE 0 END) AS inactive
            FROM shops
        `;
        const [rows] = await dbConnection.execute(query);
        return rows[0];
    },

    findById: async (id) => {
        const query = `
            SELECT s.*, u.name AS creator_name 
            FROM shops s
            LEFT JOIN users u ON s.created_by = u.id
            WHERE s.id = ?
        `;
        const [rows] = await dbConnection.execute(query, [id]);
        return rows[0];
    },
    
    update: async (id, shopData) => {
        const { name, phone_number, bill_packaging, bill_storage, packaging_price, storage_price } = shopData;
        const query = 'UPDATE shops SET name = ?, phone_number = ?, bill_packaging = ?, bill_storage = ?, packaging_price = ?, storage_price = ? WHERE id = ?';
        const [result] = await dbConnection.execute(query, [name, phone_number, bill_packaging, bill_storage, packaging_price, storage_price, id]);
        return result;
    },
    
    updateStatus: async (id, status) => {
        const query = 'UPDATE shops SET status = ? WHERE id = ?';
        const [result] = await dbConnection.execute(query, [status, id]);
        return result;
    }
};