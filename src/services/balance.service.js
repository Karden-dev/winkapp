// src/services/balance.service.js
const moment = require('moment');

let dbConnection;

/**
 * Calcule l'impact financier d'un statut de commande.
 * @param {object} order - L'objet commande (avec infos du marchand).
 * @returns {object} Un objet avec les deltas pour le bilan.
 */
const getBalanceImpactForStatus = (order) => {
    const { status, payment_status, article_amount, delivery_fee, amount_received, bill_packaging, packaging_price } = order;
    const balanceImpact = {
        orders_delivered: 0,
        revenue_articles: 0,
        delivery_fees: 0,
        packaging_fees: 0
    };

    if (status === 'delivered') {
        balanceImpact.orders_delivered = 1;
        balanceImpact.revenue_articles = payment_status === 'cash' ? parseFloat(article_amount || 0) : 0;
        balanceImpact.delivery_fees = parseFloat(delivery_fee || 0);
        if (bill_packaging) {
            balanceImpact.packaging_fees = parseFloat(packaging_price || 0);
        }
    } else if (status === 'failed_delivery') {
        balanceImpact.orders_delivered = 1; // Compte comme traitée
        balanceImpact.revenue_articles = parseFloat(amount_received || 0);
        balanceImpact.delivery_fees = parseFloat(delivery_fee || 0);
    }
    
    return balanceImpact;
};

/**
 * Met à jour dynamiquement le bilan journalier dans `daily_shop_balances`.
 * @param {object} connection - Une connexion active à la base de données.
 * @param {object} data - Les données à incrémenter/décrémenter.
 */
const updateDailyBalance = async (connection, data) => {
    const {
        shop_id,
        date,
        orders_sent = 0,
        orders_delivered = 0,
        revenue_articles = 0,
        delivery_fees = 0,
        expedition_fees = 0,
        packaging_fees = 0,
        remittance_impact_override = null // Pour les créances manuelles
    } = data;

    if (!shop_id || !date) return;

    const remittance_impact = remittance_impact_override !== null 
        ? remittance_impact_override 
        : revenue_articles - delivery_fees - expedition_fees - packaging_fees;

    const query = `
        INSERT INTO daily_shop_balances (report_date, shop_id, total_orders_sent, total_orders_delivered, total_revenue_articles, total_delivery_fees, total_expedition_fees, total_packaging_fees, remittance_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ON DUPLICATE KEY UPDATE
            total_orders_sent = total_orders_sent + VALUES(total_orders_sent),
            total_orders_delivered = total_orders_delivered + VALUES(total_orders_delivered),
            total_revenue_articles = total_revenue_articles + VALUES(total_revenue_articles),
            total_delivery_fees = total_delivery_fees + VALUES(total_delivery_fees),
            total_expedition_fees = total_expedition_fees + VALUES(total_expedition_fees),
            total_packaging_fees = total_packaging_fees + VALUES(total_packaging_fees),
            remittance_amount = remittance_amount + VALUES(remittance_amount);
    `;

    await connection.execute(query, [
        date, shop_id, orders_sent, orders_delivered, revenue_articles,
        delivery_fees, expedition_fees, packaging_fees, remittance_impact
    ]);
};

/**
 * Synchronise le bilan négatif avec la table `debts`.
 * @param {object} connection - Une connexion active à la base de données.
 * @param {number} shop_id - L'ID du marchand.
 * @param {string} date - La date du bilan au format 'YYYY-MM-DD'.
 */
const syncBalanceDebt = async (connection, shop_id, date) => {
    const [balanceRows] = await connection.execute(
        'SELECT remittance_amount FROM daily_shop_balances WHERE shop_id = ? AND report_date = ?',
        [shop_id, date]
    );

    await connection.execute(
        "DELETE FROM debts WHERE shop_id = ? AND DATE(created_at) = ? AND type = 'daily_balance'",
        [shop_id, date]
    );
    
    if (balanceRows.length > 0) {
        const remittanceAmount = parseFloat(balanceRows[0].remittance_amount);
        if (remittanceAmount < 0) {
            await connection.execute(
                `INSERT INTO debts (shop_id, amount, type, comment, status, created_by, created_at) 
                 VALUES (?, ?, 'daily_balance', ?, 'pending', 1, ?)`,
                [shop_id, Math.abs(remittanceAmount), `Bilan négatif du ${moment(date).format('DD/MM/YYYY')}`, date]
            );
        }
    }
};

module.exports = {
    init: (connection) => {
        dbConnection = connection;
    },
    updateDailyBalance,
    syncBalanceDebt,
    getBalanceImpactForStatus
};