// src/models/shortfall.model.js
let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const findAll = async (filters = {}) => {
    // TODO: Ajouter les filtres par date et recherche plus tard
    let query = `
        SELECT ds.*, u.name as deliveryman_name
        FROM deliveryman_shortfalls ds
        JOIN users u ON ds.deliveryman_id = u.id
        ORDER BY ds.created_at DESC`;
    const [rows] = await dbConnection.execute(query);
    return rows;
};

const create = async (shortfallData) => {
    const { deliveryman_id, amount, comment, created_by_user_id } = shortfallData;
    const query = `
        INSERT INTO deliveryman_shortfalls (deliveryman_id, amount, comment, created_by_user_id)
        VALUES (?, ?, ?, ?)
    `;
    const [result] = await dbConnection.execute(query, [deliveryman_id, amount, comment, created_by_user_id]);
    return result.insertId;
};


module.exports = { init, findAll, create };