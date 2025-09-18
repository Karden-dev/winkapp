// src/services/cash.service.js
let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

/**
 * Crée une transaction de type 'remittance' en attente de confirmation.
 */
const createRemittanceTransaction = async (deliverymanId, amount, orderId, comment) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'INSERT INTO cash_transactions (user_id, type, amount, comment, status) VALUES (?, ?, ?, ?, ?)';
        // Remarque : Le montant d'un versement est une entrée positive pour l'entreprise
        await connection.execute(query, [deliverymanId, 'remittance', amount, comment, 'pending']);
    } finally {
        connection.release();
    }
};

/**
 * Calcule le montant total que le livreur doit à l'entreprise.
 * Ce montant est le total des encaissements (cash, livraison ratée) moins les dépenses validées.
 */
const getDeliverymanOwedAmount = async (deliverymanId) => {
    const connection = await dbConnection.getConnection();
    try {
        // 1. Calcul des gains nets du livreur (encaissements des commandes - frais de livraison)
        const [gainsResult] = await connection.execute(
            `
            SELECT
                COALESCE(SUM(
                    CASE
                        WHEN o.status = 'delivered' AND o.payment_status = 'cash' THEN o.article_amount
                        WHEN o.status = 'failed_delivery' THEN o.amount_received
                        ELSE 0
                    END
                ), 0) AS total_encaissements,
                COALESCE(SUM(o.delivery_fee), 0) AS total_frais_livraison
            FROM orders o
            WHERE o.deliveryman_id = ? AND o.status IN ('delivered', 'failed_delivery')
            `,
            [deliverymanId]
        );
        const netGains = parseFloat(gainsResult[0].total_encaissements || 0) - parseFloat(gainsResult[0].total_frais_livraison || 0);
        
        // 2. Calcul des dépenses du livreur validées
        const [expensesResult] = await connection.execute(
            `
            SELECT COALESCE(SUM(amount), 0) AS total_expenses
            FROM cash_transactions
            WHERE user_id = ? AND type = 'expense' AND status = 'confirmed'
            `,
            [deliverymanId]
        );
        const totalExpenses = parseFloat(expensesResult[0].total_expenses || 0);
        
        // 3. Calcul des versements déjà effectués et validés par le livreur
        const [remittancesResult] = await connection.execute(
            `
            SELECT COALESCE(SUM(amount), 0) AS total_remittances
            FROM cash_transactions
            WHERE user_id = ? AND type = 'remittance' AND status = 'confirmed'
            `,
            [deliverymanId]
        );
        const totalRemittances = parseFloat(remittancesResult[0].total_remittances || 0);

        // Montant dû = (Gains nets + Dépenses) - Versements
        // Le montant dû est ce qui doit être remboursé par le livreur.
        const owedAmount = (netGains + totalExpenses) - totalRemittances;

        return owedAmount;
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    createRemittanceTransaction,
    getDeliverymanOwedAmount
};