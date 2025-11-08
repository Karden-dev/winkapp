// src/models/remittance.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
    module.exports.dbConnection = connection;
};

/**
 * Synchronise les soldes journaliers positifs avec la table des versements,
 * en consolidant les créances en attente au moment de la synchronisation.
 */
const syncDailyBalancesToRemittances = async (date, connection) => {
    // 1. Lire tous les soldes journaliers positifs (Montant Brut > 0)
    const [dailyBalances] = await connection.execute(
        `SELECT
            dsb.shop_id,
            dsb.remittance_amount,
            s.payment_operator
         FROM daily_shop_balances dsb
         JOIN shops s ON dsb.shop_id = s.id
         WHERE dsb.report_date = ? AND dsb.remittance_amount > 0`,
        [date]
    );

    for (const balance of dailyBalances) {
        // 1.5. Calculer la somme des créances en attente (status = 'pending') pour ce marchand.
        const [debtRow] = await connection.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total_pending_debts
             FROM debts
             WHERE shop_id = ? AND status = 'pending'`,
            [balance.shop_id]
        );
        const debtsAmount = parseFloat(debtRow[0]?.total_pending_debts || 0);

        // 2. Tente de créer/mettre à jour l'entrée dans 'remittances' (UPSERT)
        // La colonne net_amount_paid n'est pas mise à jour ici, seulement lors du paiement.
        await connection.execute(
            `INSERT INTO remittances
                (shop_id, amount, remittance_date, payment_operator, status, user_id, debts_consolidated)
             VALUES (?, ?, ?, ?, 'pending', 1, ?)
             ON DUPLICATE KEY UPDATE
                amount = VALUES(amount),
                payment_operator = VALUES(payment_operator),
                debts_consolidated = VALUES(debts_consolidated),
                remittance_date = VALUES(remittance_date),
                -- Ne pas toucher à net_amount_paid ici
                updated_at = NOW()`,
            [
                balance.shop_id,
                balance.remittance_amount,
                date,
                balance.payment_operator || null,
                debtsAmount
            ]
        );
    }
};

/**
 * Récupère les versements pour l'affichage, AVEC FILTRE ET CALCUL DE MONTANT NET.
 * Utilise net_amount_paid pour les versements payés.
 */
const findForRemittance = async (filters = {}) => {
    const { date, status, search } = filters;
    const params = [];

    // Le Montant Net est calculé dans le SELECT en utilisant net_amount_paid si 'paid'
    let query = `
        SELECT
            r.id,
            s.id AS shop_id,
            s.name AS shop_name,
            s.payment_name,
            s.phone_number_for_payment,
            s.payment_operator,
            r.amount AS gross_amount,
            r.debts_consolidated,
            r.net_amount_paid, -- Ajouté pour info si besoin, mais le calcul est dans net_amount
            -- *** MODIFICATION ICI: Utilise net_amount_paid si payé, sinon calcule dynamiquement ***
            CASE WHEN r.status = 'paid' THEN r.net_amount_paid ELSE (r.amount - r.debts_consolidated) END AS net_amount,
            r.status,
            r.remittance_date,
            r.payment_date,
            r.transaction_id,
            r.comment,
            u.name as user_name
        FROM remittances r
        JOIN shops s ON r.shop_id = s.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE 1=1
    `;

    let whereConditions = [];

    // Filtrage par Montant Net à Verser (Bug 1 - N'affiche que les lignes payées OU les lignes en attente avec un Montant Net > 0)
    // Le calcul du net_amount dans le WHERE doit aussi utiliser le CASE pour être cohérent
    whereConditions.push(`
        (
            r.status = 'paid' OR
            (r.status = 'pending' AND (r.amount - r.debts_consolidated) > 0)
        )
    `);

    // Filtrage par date journalière (applique après le filtre de Montant Net)
    if (date) {
        whereConditions.push(`r.remittance_date = ?`);
        params.push(date);
    }

    // Filtrage par statut
    if (status && status !== 'all') {
        whereConditions.push(`r.status = ?`);
        params.push(status);
    }

    // Recherche par mot-clé
    if (search) {
        const searchTerm = `%${search}%`;
        whereConditions.push(`(s.name LIKE ? OR s.payment_name LIKE ? OR s.phone_number_for_payment LIKE ?)`);
        params.push(searchTerm, searchTerm, searchTerm);
    }

    if (whereConditions.length > 0) {
        query += ' AND ' + whereConditions.join(' AND ');
    }

    query += ` ORDER BY r.status DESC, s.name ASC`;
    const [rows] = await dbConnection.execute(query, params);

    // Formatter les montants
    return rows.map(row => ({
        ...row,
        gross_amount: parseFloat(row.gross_amount || 0),
        debts_consolidated: parseFloat(row.debts_consolidated || 0),
        net_amount: parseFloat(row.net_amount || 0), // net_amount est déjà calculé correctement dans la requête
        net_amount_paid: row.net_amount_paid !== null ? parseFloat(row.net_amount_paid) : null // Formatter aussi celui-ci
    }));
};

/**
 * Marque un versement comme payé, enregistre le montant net payé, et règle TOUTES les créances en attente associées.
 */
const markAsPaid = async (remittanceId, userId) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Récupérer les informations actuelles du versement AVANT la mise à jour
        // FOR UPDATE verrouille la ligne pour éviter les conditions de course
        const [remittanceRow] = await connection.execute(
            'SELECT shop_id, amount, debts_consolidated FROM remittances WHERE id = ? AND status = ? FOR UPDATE',
            [remittanceId, 'pending']
        );
        if (remittanceRow.length === 0) {
            // Pas besoin de rollback ici car aucune modification n'a été faite
            throw new Error('Versement non trouvé ou déjà payé.');
        }
        const shopId = remittanceRow[0].shop_id;
        const grossAmount = parseFloat(remittanceRow[0].amount);
        const consolidatedDebts = parseFloat(remittanceRow[0].debts_consolidated);
        // *** MODIFICATION ICI: Calculer le montant net AU MOMENT du paiement ***
        const netAmountPaid = grossAmount - consolidatedDebts;

        // 2. Mettre à jour le statut, la date ET le montant net payé dans 'remittances'
        // *** MODIFICATION ICI: Ajout de net_amount_paid = ? ***
        const [updateResult] = await connection.execute(
            'UPDATE remittances SET status = ?, payment_date = CURDATE(), user_id = ?, net_amount_paid = ? WHERE id = ? AND status = ?',
            ['paid', userId, netAmountPaid, remittanceId, 'pending']
        );

        // 3. RÉGLER (passer à 'paid') TOUTES les créances EN ATTENTE pour ce marchand si la mise à jour a réussi.
        if (updateResult.affectedRows > 0) {
             await connection.execute(
                 'UPDATE debts SET status = "paid", settled_at = NOW(), updated_by = ? WHERE shop_id = ? AND status = "pending"',
                 [userId, shopId]
             );
        }

        await connection.commit();
        return updateResult;
    } catch (error) {
        await connection.rollback(); // Annuler toutes les modifications en cas d'erreur
        console.error("Erreur dans markAsPaid:", error); // Log l'erreur pour le débogage
        throw error; // Renvoyer l'erreur au contrôleur
    } finally {
        connection.release();
    }
};

// --- AUTRES FONCTIONS (INCHANGÉES) ---

const getShopDetails = async (shopId) => {
    const connection = await dbConnection.getConnection();
    try {
        // Sélectionne net_amount_paid pour l'historique aussi
        const [remittances] = await connection.execute(
            'SELECT id, shop_id, amount, remittance_date, payment_date, payment_operator, status, transaction_id, comment, debts_consolidated, net_amount_paid FROM remittances WHERE shop_id = ? ORDER BY payment_date DESC',
            [shopId]
        );
        const [debts] = await connection.execute(
            'SELECT * FROM debts WHERE shop_id = ? AND status = "pending" ORDER BY created_at DESC',
            [shopId]
        );
        // Simplification de la requête de solde (cette logique est complexe et peut nécessiter une révision séparée)
        const [ordersPayout] = await connection.execute(
             `SELECT COALESCE(SUM(CASE WHEN status = 'delivered' AND payment_status = 'cash' THEN article_amount - delivery_fee - expedition_fee WHEN status = 'delivered' AND payment_status = 'paid_to_supplier' THEN -delivery_fee - expedition_fee WHEN status = 'failed_delivery' THEN amount_received - delivery_fee - expedition_fee ELSE 0 END), 0) AS orders_payout_amount
              FROM orders
              WHERE shop_id = ? AND (status IN ('delivered', 'failed_delivery'))`,
             [shopId]
        );
        const ordersPayoutAmount = ordersPayout[0].orders_payout_amount || 0;
        const totalDebt = debts.reduce((sum, debt) => sum + parseFloat(debt.amount), 0);
        // Le total versé devrait idéalement utiliser net_amount_paid pour les versements payés
        const totalRemitted = remittances.reduce((sum, rem) => {
            const amountConsidered = rem.status === 'paid' ? parseFloat(rem.net_amount_paid || 0) : parseFloat(rem.amount - rem.debts_consolidated);
            return sum + (amountConsidered > 0 ? amountConsidered : 0); // Ne compter que les versements positifs
        }, 0);

        // Note: Le calcul du 'currentBalance' peut être complexe et dépendre de la définition exacte.
        // Celui-ci est une approximation basée sur les infos disponibles.
        const currentBalance = ordersPayoutAmount - totalDebt; // Le solde avant versement
        return { remittances, debts, currentBalance };
    } finally {
        connection.release();
    }
};

const updateShopPaymentDetails = async (shopId, paymentData) => {
    const { payment_name, phone_number_for_payment, payment_operator } = paymentData;
    const query = 'UPDATE shops SET payment_name = ?, phone_number_for_payment = ?, payment_operator = ? WHERE id = ?';
    const [result] = await dbConnection.execute(query, [payment_name, phone_number_for_payment, payment_operator, shopId]);
    return result;
};

const recordRemittance = async (shopId, amount, paymentOperator, status, transactionId = null, comment = null, userId) => {
    // Cette fonction semble être pour des enregistrements manuels et ne devrait pas affecter net_amount_paid directement.
    const query = 'INSERT INTO remittances (shop_id, amount, remittance_date, payment_operator, status, transaction_id, comment, user_id) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?)';
    const [result] = await dbConnection.execute(query, [shopId, amount, paymentOperator, status, transactionId, comment, userId]);
    return result;
};


module.exports = {
    init,
    findForRemittance, // Modifié
    syncDailyBalancesToRemittances, // Inchangé (ne touche pas net_amount_paid)
    getShopDetails, // Modifié légèrement pour utiliser net_amount_paid dans le calcul du solde
    updateShopPaymentDetails, // Inchangé
    recordRemittance, // Inchangé
    markAsPaid // Modifié
};