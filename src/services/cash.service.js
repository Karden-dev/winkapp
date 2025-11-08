const moment = require('moment');
const cashStatModel = require('../models/cash.stat.model'); 
const Cash = require('../models/cash.model');
const Order = require('../models/order.model');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
    cashStatModel.init(connection); 
};

/**
 * Crée une transaction de caisse générique (dépense, etc.).
 * Si la transaction est liée à une commande, le montant de l'article de la commande est utilisé.
 * @param {object} transactionData - Données de la transaction.
 * @returns {Promise<any>}
 */
const createCashTransaction = async (transactionData) => {
  const { orderId } = transactionData;

  // Si la transaction est liée à une commande, on utilise le montant de l'article comme source de vérité
  if (orderId) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    // On force l'utilisation du prix de l'article pour éviter les écarts
    transactionData.amount = order.article_price;
  }

  return await Cash.create(transactionData);
};


/**
 * Crée une transaction de type 'remittance' en attente de confirmation.
 */
const createRemittanceTransaction = async (deliverymanId, amount, comment) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = 'INSERT INTO cash_transactions (user_id, type, amount, comment, status) VALUES (?, ?, ?, ?, ?)';
        await connection.execute(query, [deliverymanId, 'remittance', amount, comment, 'pending']);
    } finally {
        connection.release();
    }
};

/**
 * Calcule le montant total que le livreur doit à l'entreprise.
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

        const owedAmount = (netGains + totalExpenses) - totalRemittances;

        return owedAmount;
    } finally {
        connection.release();
    }
};

/**
 * Calcule la situation de la caisse complète en utilisant la formule demandée.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<Object>}
 */
const getCashMetrics = async (startDate, endDate) => {
    try {
        // 1. Récupérer toutes les métriques en parallèle
        const [
            ca,
            cashCollected, // NOUVELLE MÉTRIQUE
            cashTransactions,
            debtMetrics,
            shortfallMetrics
        ] = await Promise.all([
            cashStatModel.getRevenue(startDate, endDate),
            cashStatModel.getCashCollected(startDate, endDate), // Appel à la nouvelle fonction
            cashStatModel.getExpensesAndWithdrawals(startDate, endDate),
            cashStatModel.getDebtMetrics(startDate, endDate),
            cashStatModel.getShortfallMetrics(startDate, endDate)
        ]);
        
        const { totalExpenses, totalWithdrawals } = cashTransactions;
        const { paidDebts, pendingDebts } = debtMetrics;
        const { paidShortfalls, pendingShortfalls } = shortfallMetrics;

        // 2. Formule du Montant en Caisse (Encaisse Théorique) :
        const sortiesNettes = totalExpenses + totalWithdrawals;
        const elementsNonRembourses = pendingDebts + pendingShortfalls;
        const elementsRembourses = paidDebts + paidShortfalls;
        
        const montantEnCaisse = ca 
            - sortiesNettes 
            - elementsNonRembourses 
            + elementsRembourses;

        // 3. Retourner le résultat avec toutes les métriques détaillées
        return {
            montant_en_caisse: parseFloat(montantEnCaisse.toFixed(2)), 
            chiffre_affaire_ca: parseFloat(ca.toFixed(2)),
            encaisser: parseFloat(cashCollected.toFixed(2)),
            depenses: parseFloat(totalExpenses.toFixed(2)),
            decaissements: parseFloat(totalWithdrawals.toFixed(2)),
            creances_remboursees: parseFloat(paidDebts.toFixed(2)),
            creances_non_remboursees: parseFloat(pendingDebts.toFixed(2)),
            manquants_rembourses: parseFloat(paidShortfalls.toFixed(2)),
            manquants_non_remboursees: parseFloat(pendingShortfalls.toFixed(2)),
        };

    } catch (error) {
        throw error;
    }
};

module.exports = {
    init,
    createCashTransaction, // La nouvelle fonction corrigée est ajoutée ici
    createRemittanceTransaction,
    getDeliverymanOwedAmount,
    getCashMetrics
};