require('dotenv').config();
const mysql = require('mysql2/promise');

// Configuration de la base de données, comme dans vos autres scripts
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
};

/**
 * Ce script reconstitue les transactions de versement (remittance) manquantes
 * dans la table cash_transactions en se basant sur les commandes de la table orders.
 */
async function reconstituteRemittances() {
  console.log('--- Début du script de reconstitution des versements ---');

  const query = `
    INSERT INTO cash_transactions (user_id, type, amount, comment, status, created_at, validated_by)
    SELECT
        o.deliveryman_id,
        'remittance',
        CASE
            WHEN o.status = 'delivered' THEN o.article_amount
            WHEN o.status = 'failed_delivery' THEN o.amount_received
        END,
        CASE
            WHEN o.status = 'delivered' THEN CONCAT('Versement pour la commande livrée n°', o.id)
            WHEN o.status = 'failed_delivery' THEN CONCAT('Versement (Échec CDE n°', o.id, ')')
        END,
        'pending',
        o.created_at,
        1
    FROM
        orders AS o
    WHERE
        o.payment_status = 'cash'
        AND o.deliveryman_id IS NOT NULL
        AND (
            o.status = 'delivered'
            OR
            (o.status = 'failed_delivery' AND o.amount_received IS NOT NULL AND o.amount_received > 0)
        )
        AND NOT EXISTS (
            SELECT 1
            FROM cash_transactions AS ct
            WHERE ct.comment LIKE CONCAT('%n°', o.id, '%')
        );
  `;

  let connection;
  try {
    // Création d'une nouvelle connexion directe
    connection = await mysql.createConnection(dbConfig);
    console.log('Connecté à la base de données.');
    
    console.log('Exécution de la requête de reconstitution...');
    const [result] = await connection.execute(query);

    if (result.affectedRows > 0) {
      console.log('\x1b[32m%s\x1b[0m', `✅ Succès ! ${result.affectedRows} transaction(s) de versement manquante(s) ont été recréées.`);
    } else {
      console.log('\x1b[33m%s\x1b[0m', 'ℹ️ Aucune transaction de versement manquante n\'a été trouvée. La table est déjà à jour.');
    }

  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Une erreur est survenue lors de la reconstitution :', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Connexion à la base de données fermée.');
    }
    console.log('--- Fin du script ---');
  }
}

// Lancement de la fonction
reconstituteRemittances();