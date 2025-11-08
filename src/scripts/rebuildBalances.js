// src/scripts/rebuildBalances.js
require('dotenv').config(); // Chemin corrigé pour charger les variables d'environnement
const mysql = require('mysql2/promise');
const moment = require('moment');

const balanceService = require('../services/balance.service');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
};

const runRebuild = async () => {
    let connection;
    try {
        console.log('Connexion à la base de données...');
        connection = await mysql.createConnection(dbConfig);
        balanceService.init(connection);
        console.log('Connexion réussie.');

        console.log('Nettoyage des anciennes données...');
        await connection.execute('TRUNCATE TABLE daily_shop_balances');
        await connection.execute("DELETE FROM debts WHERE type = 'daily_balance'");
        console.log('Tables nettoyées.');

        console.log('Lecture de toutes les commandes...');
        const [orders] = await connection.execute(`
            SELECT o.*, s.bill_packaging, s.packaging_price 
            FROM orders o 
            JOIN shops s ON o.shop_id = s.id
            ORDER BY o.created_at ASC
        `);
        console.log(`${orders.length} commandes trouvées. Début du recalcul...`);

        for (const order of orders) {
            const orderDate = moment(order.created_at).format('YYYY-MM-DD');
            
            await balanceService.updateDailyBalance(connection, {
                shop_id: order.shop_id,
                date: orderDate,
                orders_sent: 1,
                expedition_fees: parseFloat(order.expedition_fee || 0)
            });

            const statusImpact = balanceService.getBalanceImpactForStatus(order);
            await balanceService.updateDailyBalance(connection, {
                shop_id: order.shop_id,
                date: orderDate,
                ...statusImpact
            });
        }
        console.log('Tous les bilans ont été recalculés.');

        console.log('Synchronisation des créances de bilan...');
        const [distinctBalances] = await connection.execute(
            'SELECT DISTINCT shop_id, report_date FROM daily_shop_balances'
        );

        for (const balance of distinctBalances) {
            await balanceService.syncBalanceDebt(connection, balance.shop_id, moment(balance.report_date).format('YYYY-MM-DD'));
        }
        console.log('Synchronisation des créances terminée.');

        console.log('\n✅ Reconstruction terminée avec succès !');

    } catch (error) {
        console.error('❌ Une erreur est survenue durant la reconstruction :', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Connexion à la base de données fermée.');
        }
    }
};

runRebuild();