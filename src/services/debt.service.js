// src/services/debt.service.js
const moment = require('moment');
// AJOUTÉ: Import du service de bilan pour synchroniser les dettes
const balanceService = require('./balance.service');

let dbConnection;

const init = (connection) => { 
    dbConnection = connection; 
};

/**
 * Traite les frais de stockage pour les jours non facturés.
 * Met à jour ou crée la ligne dans `daily_shop_balances` si le frais n'a pas été appliqué (total_storage_fees = 0).
 */
const processStorageFees = async (processingDate) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Récupérer tous les marchands qui facturent le stockage
        const [shopsWithStorage] = await connection.execute(
            `SELECT id, storage_price FROM shops WHERE bill_storage = 1 AND status = 'actif'`
        );

        let processedCount = 0;

        for (const shop of shopsWithStorage) {
            const storagePrice = parseFloat(shop.storage_price);
            
            // ÉTAPE CRUCIALE: Utiliser INSERT... ON DUPLICATE KEY UPDATE
            const query = `
                INSERT INTO daily_shop_balances 
                (report_date, shop_id, total_storage_fees, remittance_amount, status)
                VALUES (?, ?, ?, ?, 'pending')
                ON DUPLICATE KEY UPDATE
                    -- Condition: n'applique le frais que si total_storage_fees était à 0 (évite la double facturation)
                    remittance_amount = CASE WHEN total_storage_fees = 0 THEN remittance_amount - VALUES(total_storage_fees) ELSE remittance_amount END,
                    total_storage_fees = CASE WHEN total_storage_fees = 0 THEN VALUES(total_storage_fees) ELSE total_storage_fees END
            `;
            
            const [result] = await connection.execute(query, [
                processingDate, 
                shop.id, 
                storagePrice, 
                -storagePrice // L'impact du frais de stockage seul
            ]);

            // Si la ligne a été insérée (1) ou mise à jour (2), on compte le processus et on synchronise les dettes.
            if (result.affectedRows > 0) {
                 processedCount++;
                 // Synchronisation des dettes: Met à jour la table debts si le bilan est passé en négatif.
                 await balanceService.syncBalanceDebt(connection, shop.id, processingDate);
            }
        }

        await connection.commit();
        return { message: `${processedCount} bilan(s) mis à jour/créés avec les frais de stockage pour le ${processingDate}.` };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

/**
 * Consolide les soldes négatifs de la veille en créances.
 * FONCTIONNALITÉ DÉSACTIVÉE.
 */
const consolidateDailyBalances = async (dateToConsolidate) => {
    console.log(`[AVERTISSEMENT] La consolidation des soldes pour le ${dateToConsolidate} a été appelée, mais cette fonctionnalité est désactivée.`);
    return { message: `La consolidation automatique des soldes est désactivée.` };
};

module.exports = {
    init,
    processStorageFees,
    consolidateDailyBalances,
};