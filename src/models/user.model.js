// src/models/user.model.js
let dbConnection;

/**
 * Initialise le modèle avec la connexion à la base de données.
 * @param {object} connection - Le pool de connexion à la base de données.
 */
const init = (connection) => {
    dbConnection = connection;
};

// --- Fonctions pour la gestion des UTILISATEURS (inchangées) ---

const create = async (phone_number, pin, name, role) => {
    const query = 'INSERT INTO users (phone_number, pin, name, role, status) VALUES (?, ?, ?, ?, ?)';
    const [result] = await dbConnection.execute(query, [phone_number, pin, name, role, 'actif']);
    return result;
};

const findByPhoneNumber = async (phone_number) => {
    const query = 'SELECT * FROM users WHERE phone_number = ?';
    const [rows] = await dbConnection.execute(query, [phone_number]);
    return rows[0];
};

const findById = async (id) => {
    const query = 'SELECT id, name, phone_number, role, status, created_at FROM users WHERE id = ?';
    const [rows] = await dbConnection.execute(query, [id]);
    return rows[0];
};

const findAll = async (filters = {}) => {
    let query = "SELECT id, name, phone_number, role, status, created_at FROM users";
    const params = [];
    if (filters.search) {
        query += ' WHERE name LIKE ?';
        params.push(`%${filters.search}%`);
    }
    query += ' ORDER BY name ASC';
    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

const update = async (id, name, phone_number, role, status) => {
    const query = 'UPDATE users SET name = ?, phone_number = ?, role = ?, status = ? WHERE id = ?';
    const [result] = await dbConnection.execute(query, [name, phone_number, role, status, id]);
    return result;
};

const remove = async (id) => {
    const query = 'DELETE FROM users WHERE id = ?';
    const [result] = await dbConnection.execute(query, [id]);
    return result;
};

// --- Fonctions pour les statistiques des LIVREURS (CORRIGÉES) ---

const findAllDeliverymen = async () => {
    const query = "SELECT id, name FROM users WHERE role = 'livreur' AND status = 'actif' ORDER BY name ASC";
    const [rows] = await dbConnection.execute(query);
    return rows;
};

/**
 * Calcule les performances des livreurs sur une période donnée avec filtres.
 */
const findDeliverymenPerformance = async (filters = {}) => {
    const { startDate, endDate, search } = filters;
    const params = [];
    
    let dateConditions = '';
    if (startDate && endDate) {
        dateConditions = 'AND DATE(o.created_at) BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }
    
    let searchQuery = '';
    if (search) {
        searchQuery = 'AND u.name LIKE ?';
        params.push(`%${search}%`);
    }

    const query = `
        SELECT
            u.id, u.name,
            COALESCE(SUM(CASE WHEN o.deliveryman_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS received_orders,
            COALESCE(SUM(CASE WHEN o.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress_orders,
            COALESCE(SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_orders,
            COALESCE(SUM(CASE WHEN o.status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END), 0) AS delivered_orders,
            COALESCE(SUM(CASE WHEN o.status IN ('delivered', 'failed_delivery') THEN o.delivery_fee ELSE 0 END), 0) AS total_revenue
        FROM users u
        LEFT JOIN orders o ON u.id = o.deliveryman_id ${dateConditions}
        WHERE u.role = 'livreur' AND u.status = 'actif' ${searchQuery}
        GROUP BY u.id, u.name
        ORDER BY delivered_orders DESC, total_revenue DESC;
    `;
    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

/**
 * Calcule les statistiques globales des livreurs et des courses pour une période.
 */
const getDeliverymenStats = async (startDate, endDate) => {
    // Étape 1 : Obtenir le nombre total de livreurs actifs (ne dépend pas de la date)
    const [totalRows] = await dbConnection.execute("SELECT COUNT(*) as total FROM users WHERE role = 'livreur' AND status = 'actif'");
    const totalDeliverymen = Number(totalRows[0].total);

    // Étape 2 : Obtenir les statistiques des commandes sur la période
    let statsQuery = `
        SELECT 
            COALESCE(COUNT(DISTINCT deliveryman_id), 0) as working,
            COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) as in_progress,
            COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled,
            COALESCE(SUM(CASE WHEN status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END), 0) as delivered,
            COALESCE(COUNT(id), 0) as received
        FROM orders`;
        
    const params = [];
    if (startDate && endDate) {
        statsQuery += ' WHERE DATE(created_at) BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }

    const [statsRows] = await dbConnection.execute(statsQuery, params);
    const stats = statsRows[0];
    const workingDeliverymen = Number(stats.working);

    // Étape 3 : Construire l'objet de réponse final
    return {
        total: totalDeliverymen,
        working: workingDeliverymen,
        absent: totalDeliverymen - workingDeliverymen,
        availability_rate: totalDeliverymen > 0 ? ((workingDeliverymen / totalDeliverymen) * 100) : 0,
        in_progress: Number(stats.in_progress),
        delivered: Number(stats.delivered),
        received: Number(stats.received),
        cancelled: Number(stats.cancelled) // Cette valeur sera maintenant correcte
    };
};

module.exports = {
    init,
    create,
    findByPhoneNumber,
    findById,
    findAll,
    update,
    remove,
    findAllDeliverymen,
    findDeliverymenPerformance,
    getDeliverymenStats
};