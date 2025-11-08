// src/models/schedule.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

// --- Fonctions pour Monthly Objectives ---

/**
 * Récupère ou crée l'objectif pour un mois donné.
 * Si aucun objectif n'existe pour le mois, il peut retourner null ou une valeur par défaut.
 * @param {string} monthYear - Mois au format 'YYYY-MM'.
 * @returns {Promise<object|null>}
 */
const getOrInitializeObjective = async (monthYear) => {
    const connection = await dbConnection.getConnection();
    try {
        let [rows] = await connection.execute(
            'SELECT * FROM monthly_objectives WHERE month_year = ?',
            [monthYear]
        );

        if (rows.length > 0) {
            // Convertir la chaîne JSON en objet si elle existe
            if (rows[0].bonus_tiers_moto) {
                try {
                    rows[0].bonus_tiers_moto = JSON.parse(rows[0].bonus_tiers_moto);
                } catch (e) {
                    console.error(`Erreur parsing JSON pour bonus_tiers_moto (${monthYear}):`, e);
                    rows[0].bonus_tiers_moto = null; // Retourner null en cas d'erreur
                }
            }
            return rows[0];
        } else {
            // Optionnel : Créer une entrée par défaut si elle n'existe pas ?
            // Ou simplement retourner null/undefined pour indiquer qu'aucun objectif n'est défini.
            console.warn(`Aucun objectif trouvé pour le mois ${monthYear}`);
            return null; // Pas d'objectif défini pour ce mois
        }
    } finally {
        connection.release();
    }
};

/**
 * Crée ou met à jour l'objectif pour un mois donné.
 * @param {string} monthYear - Mois au format 'YYYY-MM'.
 * @param {number|null} targetDeliveriesMoto - Objectif de courses.
 * @param {Array|null} bonusTiersMoto - Tableau des paliers de bonus (doit être stringifié en JSON).
 * @returns {Promise<object>}
 */
const upsertObjective = async (monthYear, targetDeliveriesMoto, bonusTiersMoto) => {
    const connection = await dbConnection.getConnection();
    try {
        const bonusJsonString = bonusTiersMoto ? JSON.stringify(bonusTiersMoto) : null;
        const [result] = await connection.execute(
            `INSERT INTO monthly_objectives (month_year, target_deliveries_moto, bonus_tiers_moto)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                target_deliveries_moto = VALUES(target_deliveries_moto),
                bonus_tiers_moto = VALUES(bonus_tiers_moto),
                updated_at = NOW()`,
            [monthYear, targetDeliveriesMoto, bonusJsonString]
        );
        return { success: result.affectedRows > 0 || result.insertId > 0 };
    } finally {
        connection.release();
    }
};

// --- Fonctions pour Rider Absences ---

/**
 * Ajoute un événement d'absence, permission ou jour férié.
 * @param {string} absenceDate - Date au format 'YYYY-MM-DD'.
 * @param {string} type - 'absence', 'permission', 'ferie'.
 * @param {string|null} motif - Motif ou nom de l'événement.
 * @param {number[]|null} userIds - Tableau d'IDs de livreurs (null si 'ferie').
 * @param {number} createdByUserId - ID de l'admin.
 * @returns {Promise<object>}
 */
const addAbsenceEvent = async (absenceDate, type, motif, userIds, createdByUserId) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        if (type === 'ferie') {
            // Insérer une seule ligne pour le jour férié
            const [result] = await connection.execute(
                `INSERT INTO rider_absences (absence_date, user_id, type, motif, created_by_user_id)
                 VALUES (?, NULL, ?, ?, ?)`,
                [absenceDate, type, motif, createdByUserId]
            );
             await connection.commit();
             return { success: result.insertId > 0 };
        } else if (userIds && userIds.length > 0) {
            // Insérer une ligne pour chaque livreur sélectionné
            const insertPromises = userIds.map(userId => {
                return connection.execute(
                    `INSERT INTO rider_absences (absence_date, user_id, type, motif, created_by_user_id)
                     VALUES (?, ?, ?, ?, ?)`,
                    [absenceDate, userId, type, motif, createdByUserId]
                );
            });
            await Promise.all(insertPromises);
            await connection.commit();
            return { success: true, count: userIds.length };
        } else {
             await connection.rollback(); // Rollback si type != ferie mais pas de userIds
             throw new Error("UserIds requis pour type 'absence' ou 'permission'.");
        }

    } catch (error) {
        await connection.rollback();
        console.error("Erreur dans addAbsenceEvent:", error);
        throw error;
    } finally {
        connection.release();
    }
};

/**
 * Récupère les événements d'absence/férié pour une période donnée.
 * @param {string} startDate - Date de début 'YYYY-MM-DD'.
 * @param {string} endDate - Date de fin 'YYYY-MM-DD'.
 * @param {number|null} [userId=null] - Filtrer par ID de livreur (optionnel).
 * @returns {Promise<Array>}
 */
const getAbsenceEvents = async (startDate, endDate, userId = null) => {
    const connection = await dbConnection.getConnection();
    try {
        let query = `
            SELECT ra.*, u.name as livreur_name, creator.name as creator_name
            FROM rider_absences ra
            LEFT JOIN users u ON ra.user_id = u.id -- Pour le nom du livreur si absence individuelle
            LEFT JOIN users creator ON ra.created_by_user_id = creator.id -- Pour le nom de l'admin
            WHERE ra.absence_date BETWEEN ? AND ?
        `;
        const params = [startDate, endDate];

        if (userId) {
            // Inclure les jours fériés (user_id IS NULL) ET les absences spécifiques à ce livreur
            query += ' AND (ra.user_id = ? OR ra.user_id IS NULL)';
            params.push(userId);
        }
        // Si userId n'est pas fourni, on récupère tout (absences individuelles + fériés)

        query += ' ORDER BY ra.absence_date DESC, u.name ASC';

        const [rows] = await connection.execute(query, params);
        return rows;
    } finally {
        connection.release();
    }
};

/**
 * Supprime un événement d'absence/férié par son ID.
 * @param {number} absenceId - ID de l'enregistrement dans rider_absences.
 * @returns {Promise<object>}
 */
const deleteAbsenceEvent = async (absenceId) => {
    const connection = await dbConnection.getConnection();
    try {
        const [result] = await connection.execute(
            'DELETE FROM rider_absences WHERE id = ?',
            [absenceId]
        );
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    getOrInitializeObjective,
    upsertObjective,
    addAbsenceEvent,
    getAbsenceEvents,
    deleteAbsenceEvent
};