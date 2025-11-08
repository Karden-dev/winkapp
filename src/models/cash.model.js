const moment = require('moment');
let db;

const init = (dbPool) => {
    db = dbPool;
};

const create = async (transactionData) => {
    const { user_id, type, category_id, amount, comment, created_at, status: customStatus, validated_by, validated_at } = transactionData;
    const query = `
        INSERT INTO cash_transactions (user_id, type, category_id, amount, comment, status, created_at, validated_by, validated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const status = customStatus || ((type === 'remittance') ? 'pending' : 'confirmed');
    const finalValidatedBy = validated_by !== undefined ? validated_by : (type === 'remittance' ? null : user_id);
    const finalValidatedAt = validated_at ? moment(validated_at).format('YYYY-MM-DD HH:mm:ss') : null;
    const createdAt = created_at ? moment(created_at).format('YYYY-MM-DD HH:mm:ss') : moment().format('YYYY-MM-DD HH:mm:ss');
    
    const finalCategoryId = category_id || null;

    const [result] = await db.execute(query, [user_id, type, finalCategoryId, amount, comment, status, createdAt, finalValidatedBy, finalValidatedAt]);
    return result.insertId;
};

const update = async (id, data) => {
    const query = 'UPDATE cash_transactions SET amount = ?, comment = ? WHERE id = ?';
    const [result] = await db.execute(query, [data.amount, data.comment, id]);
    return result;
};

const remove = async (id) => {
    const query = 'DELETE FROM cash_transactions WHERE id = ?';
    const [result] = await db.execute(query, [id]);
    return result;
};

const removeRemittanceByOrderId = async (orderId) => {
    const query = 'DELETE FROM cash_transactions WHERE comment LIKE ? AND type = "remittance" AND status = "pending"';
    const [result] = await db.execute(query, [`%commande n°${orderId}`]);
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
        const startDateTime = moment(filters.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const endDateTime = moment(filters.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss');
        query += ' AND ct.created_at BETWEEN ? AND ?';
        params.push(startDateTime, endDateTime);
    }
    
    if (filters.search) {
        query += ' AND (u.name LIKE ? OR ct.comment LIKE ? OR ec.name LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }
    query += ' ORDER BY ct.created_at DESC';
    const [rows] = await db.execute(query, params);
    return rows;
};

const getOrdersForCashByDate = async (deliverymanId, date) => {
    const startDate = moment(date).startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const endDate = moment(date).endOf('day').format('YYYY-MM-DD HH:mm:ss');

    // **CORRECTION: Logique d'expédition intégrée**
    const query = `
        SELECT
            o.id AS order_id,
            o.customer_phone,
            o.delivery_location,
            o.article_amount,
            s.name as shop_name,
            (SELECT GROUP_CONCAT(oi.item_name SEPARATOR ', ') FROM order_items oi WHERE oi.order_id = o.id) as item_names,
            -- Le montant attendu est maintenant conditionnel
            CASE
                WHEN o.payment_status = 'paid_to_supplier' AND o.expedition_fee > 0 THEN -o.expedition_fee
                WHEN o.status = 'delivered' THEN o.article_amount
                WHEN o.status = 'failed_delivery' THEN o.amount_received
                ELSE 0
            END AS expected_amount,
            ct.id AS remittance_transaction_id,
            ct.amount AS remittance_amount_tx,
            ct.status AS remittance_status
        FROM orders o
        LEFT JOIN shops s ON o.shop_id = s.id
        LEFT JOIN cash_transactions ct ON ct.comment LIKE CONCAT('%', o.id, '%') AND ct.type = 'remittance'
        WHERE
            o.deliveryman_id = ? 
            AND o.created_at BETWEEN ? AND ?
            -- La condition inclut maintenant les commandes avec expédition
            AND (
                (o.payment_status = 'cash' AND (o.status = 'delivered' OR (o.status = 'failed_delivery' AND o.amount_received IS NOT NULL AND o.amount_received > 0))) OR
                (o.payment_status = 'paid_to_supplier' AND o.expedition_fee > 0)
            )
        GROUP BY o.id
        ORDER BY o.id DESC
    `;
    const [rows] = await db.execute(query, [deliverymanId, startDate, endDate]);
    return rows;
};

const getExpenseCategories = async () => {
    const [rows] = await db.execute('SELECT * FROM expense_categories ORDER BY name ASC');
    return rows;
};

const findRemittanceSummary = async (startDate, endDate, search) => {
    const startDateTime = moment(startDate).format('YYYY-MM-DD');
    const endDateTime = moment(endDate).format('YYYY-MM-DD');
    
    // **CORRECTION: Logique d'expédition intégrée dans le résumé**
    let query = `
        SELECT
            u.id as user_id,
            u.name as user_name,
            COALESCE(pending_orders.pending_amount, 0) as pending_amount,
            COALESCE(confirmed_tx.confirmed_amount, 0) as confirmed_amount,
            COALESCE(pending_orders.pending_count, 0) as pending_count,
            COALESCE(confirmed_tx.confirmed_count, 0) as confirmed_count
        FROM
            users u
        LEFT JOIN (
            SELECT
                o.deliveryman_id,
                COUNT(o.id) as pending_count,
                -- Le calcul de la somme est maintenant conditionnel
                SUM(CASE
                    WHEN o.payment_status = 'paid_to_supplier' AND o.expedition_fee > 0 THEN -o.expedition_fee
                    WHEN o.status = 'delivered' THEN o.article_amount
                    WHEN o.status = 'failed_delivery' THEN o.amount_received
                    ELSE 0
                END) as pending_amount
            FROM orders o
            WHERE o.deliveryman_id IS NOT NULL
                AND DATE(o.created_at) BETWEEN ? AND ?
                AND (
                    (o.payment_status = 'cash' AND (o.status = 'delivered' OR (o.status = 'failed_delivery' AND o.amount_received > 0))) OR
                    (o.payment_status = 'paid_to_supplier' AND o.expedition_fee > 0)
                )
                AND NOT EXISTS (
                    SELECT 1 FROM cash_transactions ct 
                    WHERE ct.type = 'remittance' AND ct.comment LIKE CONCAT('%', o.id, '%') AND ct.status = 'confirmed'
                )
            GROUP BY o.deliveryman_id
        ) as pending_orders ON u.id = pending_orders.deliveryman_id
        LEFT JOIN (
            SELECT
                ct.user_id,
                COUNT(ct.id) as confirmed_count,
                SUM(ct.amount) as confirmed_amount
            FROM cash_transactions ct
            WHERE ct.type = 'remittance' 
                AND ct.status = 'confirmed'
                AND DATE(ct.created_at) BETWEEN ? AND ?
            GROUP BY ct.user_id
        ) as confirmed_tx ON u.id = confirmed_tx.user_id
        WHERE u.role = 'livreur'
    `;
    const params = [startDateTime, endDateTime, startDateTime, endDateTime];
    
    if (search) {
        query += ' AND u.name LIKE ?';
        params.push(`%${search}%`);
    }
    
    query += ` HAVING pending_amount != 0 OR confirmed_amount != 0 ORDER BY u.name ASC`;
    
    const [rows] = await db.execute(query, params);
    return rows;
};

const updateRemittanceAmount = async (transactionId, newAmount) => {
    const query = 'UPDATE cash_transactions SET amount = ? WHERE id = ? AND type = "remittance"';
    const [result] = await db.execute(query, [newAmount, transactionId]);
    return result;
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
    const [rows] = await db.execute(query, params);
    return rows;
};

const createShortfall = async (data) => {
    const { deliveryman_id, amount, comment, created_at, created_by_user_id } = data;
    const query = `
        INSERT INTO deliveryman_shortfalls (deliveryman_id, amount, comment, created_at, created_by_user_id) 
        VALUES (?, ?, ?, ?, ?)`;
    const createdAt = created_at ? moment(created_at).format('YYYY-MM-DD HH:mm:ss') : moment().format('YYYY-MM-DD HH:mm:ss');
    const [result] = await db.execute(query, [deliveryman_id, amount, comment, createdAt, created_by_user_id]);
    return result.insertId;
};

const updateShortfall = async (id, data) => {
    const query = 'UPDATE deliveryman_shortfalls SET amount = ?, comment = ? WHERE id = ? AND status = "pending"';
    const [result] = await db.execute(query, [data.amount, data.comment, id]);
    return result;
};

const deleteShortfall = async (id) => {
    const query = 'DELETE FROM deliveryman_shortfalls WHERE id = ? AND status = "pending"';
    const [result] = await db.execute(query, [id]);
    return result;
};

const settleShortfall = async (shortfallId, amountPaid, userId, settlementDate) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const [shortfallRows] = await connection.execute('SELECT * FROM deliveryman_shortfalls WHERE id = ? FOR UPDATE', [shortfallId]);
        if (shortfallRows.length === 0) throw new Error("Manquant non trouvé.");
        const shortfall = shortfallRows[0];
        if (shortfall.status === 'paid') throw new Error("Ce manquant est déjà réglé.");

        const amountToSettle = parseFloat(amountPaid);
        const remainingAmount = parseFloat(shortfall.amount) - amountToSettle;
        const newStatus = remainingAmount > 0.01 ? 'partially_paid' : 'paid';
        
        const transactionDate = settlementDate ? moment(settlementDate).format('YYYY-MM-DD HH:mm:ss') : moment().format('YYYY-MM-DD HH:mm:ss');

        await connection.execute(
            `INSERT INTO cash_transactions (user_id, type, amount, comment, status, created_at, validated_by) VALUES (?, 'remittance_correction', ?, ?, 'confirmed', ?, ?)`,
            [shortfall.deliveryman_id, amountToSettle, `Règlement du manquant #${shortfallId}`, transactionDate, userId]
        );

        if (newStatus === 'partially_paid') {
            await connection.execute('UPDATE deliveryman_shortfalls SET amount = ? WHERE id = ?', [remainingAmount, shortfallId]);
        } else {
            // Le montant n'est plus mis à 0, on conserve sa valeur initiale
            await connection.execute('UPDATE deliveryman_shortfalls SET status = "paid", settled_at = ? WHERE id = ?', [transactionDate, shortfallId]);
        }
        
        await connection.commit();
        return { success: true };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const getDeliverymanStatsForDate = async (deliverymanId, date) => {
    const startDate = moment(date).startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const endDate = moment(date).endOf('day').format('YYYY-MM-DD HH:mm:ss');
    const params = [deliverymanId, startDate, endDate];
    const connection = await db.getConnection();
    try {
        const [stats] = await connection.execute(`
            SELECT
                (SELECT COALESCE(SUM(o.article_amount), 0) FROM orders o WHERE o.deliveryman_id = ? AND o.created_at BETWEEN ? AND ? AND o.status IN ('delivered', 'failed') AND o.payment_status = 'cash') as total_collected,
                (SELECT COUNT(o.id) FROM orders o WHERE o.deliveryman_id = ? AND o.created_at BETWEEN ? AND ? AND o.status = 'delivered') as delivered_orders,
                (SELECT COALESCE(SUM(ct.amount), 0) FROM cash_transactions ct WHERE ct.user_id = ? AND ct.created_at BETWEEN ? AND ? AND ct.type = 'remittance' AND ct.status = 'confirmed') as total_remitted,
                (SELECT COALESCE(SUM(ct.amount), 0) FROM cash_transactions ct WHERE ct.user_id = ? AND ct.created_at BETWEEN ? AND ? AND ct.type = 'expense') as total_expenses,
                (SELECT COALESCE(SUM(s.amount), 0) FROM deliveryman_shortfalls s WHERE s.deliveryman_id = ? AND s.created_at BETWEEN ? AND ? AND s.status = 'pending') as total_shortfalls
        `, [...params, ...params, ...params, ...params, ...params]);
        return stats[0];
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    create,
    update,
    remove,
    removeRemittanceByOrderId,
    findAll,
    getOrdersForCashByDate,
    getExpenseCategories,
    findRemittanceSummary,
    findRemittanceDetails: async () => [], // Obsolète
    updateRemittanceAmount, 
    findShortfalls,
    settleShortfall,
    createShortfall,
    updateShortfall,
    deleteShortfall,
    getDeliverymanStatsForDate,
};