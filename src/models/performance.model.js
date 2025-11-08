// src/models/performance.model.js
const moment = require('moment');

let dbConnection; // Contient le Pool de connexions

/**
 * Initialise le modèle avec la connexion à la base de données.
 * @param {object} connection - Le pool de connexion à la base de données.
 */
const init = (connection) => {
    dbConnection = connection;
    // Exporter le Pool lui-même pour que d'autres modules (Contrôleurs) puissent obtenir une connexion transactionnelle
    module.exports.dbConnection = connection;
};

/**
 * Récupère les données brutes nécessaires pour calculer la performance d'un livreur
 * sur une période donnée.
 */
const getPerformanceData = async (livreurUserId, startDate, endDate) => {
    if (!livreurUserId || !startDate || !endDate) {
        throw new Error("Livreur ID, startDate et endDate sont requis.");
    }

    const connection = await dbConnection.getConnection();
    try {
        // Pour les stats de la période
        const startDateTime = `${startDate} 00:00:00`;
        const endDateTime = `${endDate} 23:59:59`;
        // Calcul spécifique pour la semaine en cours (Lundi -> Maintenant)
        const startOfWeek = moment().startOf('isoWeek').format('YYYY-MM-DD 00:00:00');
        const endOfToday = moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');

        // --- 1. Détails du livreur (JOIN users et livreurs) ---
        const [livreurDetailsRows] = await connection.execute(
            `SELECT
                u.id,
                u.name,
                u.status AS user_status,
                l.vehicle_type,
                l.base_salary,
                l.commission_rate, -- Colonne lue après l'étape SQL
                l.personal_goal_daily,
                l.personal_goal_weekly,
                l.personal_goal_monthly
             FROM users u
             LEFT JOIN livreurs l ON u.id = l.user_id
             WHERE u.id = ? AND u.role = 'livreur'`,
            [livreurUserId]
        );

        if (livreurDetailsRows.length === 0) {
            const [userCheck] = await connection.execute('SELECT role FROM users WHERE id = ?', [livreurUserId]);
            if (userCheck.length === 0) throw new Error(`Utilisateur ID ${livreurUserId} non trouvé.`);
            if (userCheck[0].role !== 'livreur') throw new Error(`Utilisateur ID ${livreurUserId} n'est pas un livreur.`);
            // Si l'utilisateur existe mais n'a pas d'entrée dans 'livreurs', renvoyer des détails partiels
            // Cela évite une erreur bloquante complète si l'entrée 'livreurs' manque.
             console.warn(`Détails spécifiques (type, salaire...) non trouvés pour le livreur ID ${livreurUserId}. Vérifiez la table 'livreurs'.`);
             // Retourner un objet par défaut pour livreurDetails si aucune ligne n'est trouvée
             livreurDetails = { id: livreurUserId, name: userCheck[0].name || 'Nom Inconnu', user_status: userCheck[0].status || 'inactif', vehicle_type: null, base_salary: null, commission_rate: null, personal_goal_daily: null, personal_goal_weekly: null, personal_goal_monthly: null };
        } else {
            livreurDetails = livreurDetailsRows[0];
        }


        // --- 2. Statistiques des courses (pour la période sélectionnée) ---
        const [courseStatsRows] = await connection.execute(
            `SELECT
                COUNT(id) AS received,
                SUM(CASE WHEN status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END) AS delivered,
                COUNT(DISTINCT DATE(created_at)) AS workedDays,
                COALESCE(SUM(CASE WHEN status IN ('delivered', 'failed_delivery') THEN delivery_fee ELSE 0 END), 0) AS ca_delivery_fees
             FROM orders
             WHERE deliveryman_id = ? AND created_at BETWEEN ? AND ?`,
            [livreurUserId, startDateTime, endDateTime]
        );
        const courseStats = courseStatsRows[0] || { received: 0, delivered: 0, workedDays: 0, ca_delivery_fees: 0 };

        // --- NOUVEAU : Calcul des courses livrées cette semaine ---
        const [weeklyDeliveredRows] = await connection.execute(
            `SELECT COUNT(id) AS deliveredCurrentWeek
             FROM orders
             WHERE deliveryman_id = ? AND status IN ('delivered', 'failed_delivery') AND created_at BETWEEN ? AND ?`,
             [livreurUserId, startOfWeek, endOfToday]
        );
        const deliveredCurrentWeek = weeklyDeliveredRows[0]?.deliveredCurrentWeek || 0;

        // --- 3. Dépenses (pour la période sélectionnée) ---
        const [expenseRows] = await connection.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total_expenses
             FROM cash_transactions
             WHERE user_id = ? AND type = 'expense' AND status = 'confirmed'
             AND created_at BETWEEN ? AND ?`,
            [livreurUserId, startDateTime, endDateTime]
        );
        const totalExpenses = Math.abs(parseFloat(expenseRows[0]?.total_expenses || 0));


        // --- 4. Données pour le graphique (pour la période sélectionnée) ---
        const [chartDataRows] = await connection.execute(
            `SELECT DATE(created_at) as date, COUNT(id) as count
             FROM orders
             WHERE deliveryman_id = ? AND status IN ('delivered', 'failed_delivery')
             AND created_at BETWEEN ? AND ?
             GROUP BY DATE(created_at) ORDER BY date ASC`,
            [livreurUserId, startDateTime, endDateTime]
        );
        const chartData = {
            labels: chartDataRows.map(row => moment(row.date).format('DD/MM')),
            data: chartDataRows.map(row => row.count)
        };

        // --- Assemblage des résultats ---
        return {
            details: {
                id: livreurDetails.id,
                name: livreurDetails.name,
                status: livreurDetails.user_status,
                vehicle_type: livreurDetails.vehicle_type,
                base_salary: livreurDetails.base_salary,
                commission_rate: livreurDetails.commission_rate
            },
            stats: {
                received: parseInt(courseStats.received || 0), // Pour la période
                delivered: parseInt(courseStats.delivered || 0), // Pour la période
                livrabilite_rate: (courseStats.received > 0) ? (parseInt(courseStats.delivered || 0) / parseInt(courseStats.received || 0)) : 0, // Pour la période
                workedDays: parseInt(courseStats.workedDays || 0), // Pour la période
                ca_delivery_fees: parseFloat(courseStats.ca_delivery_fees || 0), // Pour la période
                deliveredCurrentWeek: parseInt(deliveredCurrentWeek), // Stat spécifique à la semaine en cours
                total_expenses: totalExpenses // Pour la période
            },
            personalGoals: { // Objectifs lus depuis la table 'livreurs'
                daily: livreurDetails.personal_goal_daily,
                weekly: livreurDetails.personal_goal_weekly,
                monthly: livreurDetails.personal_goal_monthly,
            },
            chartData: chartData // Pour la période
        };

    } catch (error) {
        console.error(`Erreur dans getPerformanceData pour livreur ${livreurUserId}:`, error);
        throw error;
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Met à jour les objectifs personnels d'un livreur dans la table livreurs.
 */
const updatePersonalGoals = async (livreurUserId, goals) => {
    // Valider que les valeurs sont numériques ou null
    const dailyGoal = (goals.daily !== null && !isNaN(parseInt(goals.daily)) && goals.daily >= 0) ? parseInt(goals.daily) : null;
    const weeklyGoal = (goals.weekly !== null && !isNaN(parseInt(goals.weekly)) && goals.weekly >= 0) ? parseInt(goals.weekly) : null;
    const monthlyGoal = (goals.monthly !== null && !isNaN(parseInt(goals.monthly)) && goals.monthly >= 0) ? parseInt(goals.monthly) : null;

    const connection = await dbConnection.getConnection();
    try {
         // Vérifier si une entrée existe déjà pour ce livreur dans la table 'livreurs'
         const [existing] = await connection.execute('SELECT id FROM livreurs WHERE user_id = ?', [livreurUserId]);

         let result;
         if (existing.length > 0) {
             // Mettre à jour l'entrée existante
             [result] = await connection.execute(
                `UPDATE livreurs
                 SET personal_goal_daily = ?,
                     personal_goal_weekly = ?,
                     personal_goal_monthly = ?
                 WHERE user_id = ?`,
                [dailyGoal, weeklyGoal, monthlyGoal, livreurUserId]
             );
         } else {
            // Insérer une nouvelle entrée (peut nécessiter le type de véhicule par défaut ou une logique différente)
            // Pour l'instant, on suppose que l'entrée doit exister (créée via l'interface admin)
             console.warn(`Tentative de mise à jour des objectifs pour user_id ${livreurUserId} mais aucune entrée trouvée dans la table 'livreurs'.`);
             // Optionnel: Insérer une ligne par défaut si nécessaire
             // [result] = await connection.execute(
             //    `INSERT INTO livreurs (user_id, vehicle_type, personal_goal_daily, personal_goal_weekly, personal_goal_monthly)
             //     VALUES (?, 'pied', ?, ?, ?)`, // Assumer 'pied' par défaut ?
             //    [livreurUserId, dailyGoal, weeklyGoal, monthlyGoal]
             // );
             return { success: false, message: "Profil livreur non trouvé pour enregistrer les objectifs." }; // Ou lever une erreur
         }

        return { success: result.affectedRows > 0 };
    } catch (error) {
        console.error(`Erreur dans updatePersonalGoals pour livreur ${livreurUserId}:`, error);
        throw error;
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Met à jour les paramètres spécifiques d'un livreur (dans la table 'livreurs').
 * Crée l'entrée si elle n'existe pas.
 */
const upsertLivreurSettings = async (userId, settingsData) => {
     const connection = await dbConnection.getConnection(); // Utiliser une connexion du pool
     try {
         const [result] = await connection.execute( // Utiliser connection.execute
             `INSERT INTO livreurs (user_id, vehicle_type, base_salary, commission_rate, monthly_objective)
              VALUES (?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                 vehicle_type = VALUES(vehicle_type),
                 base_salary = VALUES(base_salary),
                 commission_rate = VALUES(commission_rate),
                 monthly_objective = VALUES(monthly_objective),
                 updated_at = NOW()`,
             [
                 userId,
                 settingsData.vehicle_type,
                 settingsData.base_salary || null,
                 settingsData.commission_rate || null,
                 settingsData.monthly_objective || null
             ]
         );
         return { success: result.affectedRows > 0 || result.insertId > 0 };
     } catch (error) {
        console.error(`Erreur dans upsertLivreurSettings pour user ${userId}:`, error);
        throw error;
     } finally {
          if (connection) connection.release(); // Relâcher la connexion
     }
};

/**
 * Récupère les paramètres spécifiques d'un livreur (depuis la table 'livreurs').
 */
const findLivreurSettings = async (userId) => {
    const connection = await dbConnection.getConnection();
    try {
        const [rows] = await connection.execute(
            `SELECT vehicle_type, base_salary, commission_rate, monthly_objective
             FROM livreurs
             WHERE user_id = ?`,
            [userId]
        );
        return rows[0] || null;
    } catch (error) {
       console.error(`Erreur dans findLivreurSettings pour user ${userId}:`, error);
       throw error;
    } finally {
        if (connection) connection.release();
    }
};


module.exports = {
    init,
    getPerformanceData,
    updatePersonalGoals,
    upsertLivreurSettings,
    findLivreurSettings
};