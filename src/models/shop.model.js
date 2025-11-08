// src/models/shop.model.js
let dbConnection;

// Fonction interne pour gérer l'historique de stockage
const manageStorageHistory = async (shopId, newShopData, connection) => {
    const [oldShopData] = await connection.execute('SELECT bill_storage, storage_price, status FROM shops WHERE id = ?', [shopId]);
    if (!oldShopData.length) return;

    const oldStatus = oldShopData[0].status;
    const oldBillStorage = oldShopData[0].bill_storage;
    const newStatus = newShopData.status !== undefined ? newShopData.status : oldStatus;
    const newBillStorage = newShopData.bill_storage !== undefined ? newShopData.bill_storage : oldBillStorage;
    const newStoragePrice = newShopData.storage_price !== undefined ? newShopData.storage_price : oldShopData[0].storage_price;

    const [activeHistory] = await connection.execute(
        'SELECT id FROM shop_storage_history WHERE shop_id = ? AND end_date IS NULL',
        [shopId]
    );
    const hasActiveHistory = activeHistory.length > 0;

    const closeActiveHistory = async () => {
        if (hasActiveHistory) {
            await connection.execute('UPDATE shop_storage_history SET end_date = CURDATE() WHERE id = ?', [activeHistory[0].id]);
        }
    };
    
    const openNewHistory = async () => {
        await connection.execute(
            'INSERT INTO shop_storage_history (shop_id, start_date, price) VALUES (?, CURDATE(), ?)',
            [shopId, newStoragePrice]
        );
    };

    // Scénario 1: Le statut du marchand change
    if (newStatus !== oldStatus) {
        if (newStatus === 'inactif' && hasActiveHistory) {
            await closeActiveHistory();
        } else if (newStatus === 'actif' && newBillStorage && !hasActiveHistory) {
            await openNewHistory();
        }
    }
    // Scénario 2: La facturation du stockage change
    else if (newBillStorage !== oldBillStorage) {
        if (!newBillStorage && hasActiveHistory) { // Désactivation
            await closeActiveHistory();
        } else if (newBillStorage && !hasActiveHistory) { // Activation
            await openNewHistory();
        }
    }
    // Scénario 3: Le prix change alors que la facturation est active
    else if (newBillStorage && hasActiveHistory && newStoragePrice !== oldShopData[0].storage_price) {
        await closeActiveHistory();
        await openNewHistory();
    }
};


module.exports = {
    init: (connection) => {
        dbConnection = connection;
    },

    create: async (shopData) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            const { name, phone_number, created_by, bill_packaging, bill_storage, packaging_price, storage_price } = shopData;
            const query = 'INSERT INTO shops (name, phone_number, created_by, bill_packaging, bill_storage, packaging_price, storage_price, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)';
            const [result] = await connection.execute(query, [name, phone_number, created_by, bill_packaging, bill_storage, packaging_price, storage_price, 'actif']);
            const newShopId = result.insertId;

            // NOUVEAU: Création automatique de l'historique de stockage si l'option est activée
            if (bill_storage) {
                await connection.execute(
                    'INSERT INTO shop_storage_history (shop_id, start_date, price) VALUES (?, CURDATE(), ?)',
                    [newShopId, storage_price]
                );
            }
            
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
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
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            
            // NOUVEAU: Gérer l'historique avant de mettre à jour
            await manageStorageHistory(id, shopData, connection);
            
            const { name, phone_number, bill_packaging, bill_storage, packaging_price, storage_price } = shopData;
            const query = 'UPDATE shops SET name = ?, phone_number = ?, bill_packaging = ?, bill_storage = ?, packaging_price = ?, storage_price = ? WHERE id = ?';
            const [result] = await connection.execute(query, [name, phone_number, bill_packaging, bill_storage, packaging_price, storage_price, id]);
            
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },
    
    updateStatus: async (id, status) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            
            // NOUVEAU: Gérer l'historique avant de mettre à jour
            await manageStorageHistory(id, { status }, connection);
            
            const query = 'UPDATE shops SET status = ? WHERE id = ?';
            const [result] = await connection.execute(query, [status, id]);

            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
};