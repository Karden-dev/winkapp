// src/models/rider.model.js
const moment = require('moment');

let dbConnection;

module.exports = {
    init: (connection) => {
        dbConnection = connection;
    },

    findRiderOrders: async (filters) => {
        const connection = await dbConnection.getConnection();
        
        // --- AJOUT : Définir les groupes de statuts ---
        // Statuts "actifs" (utilisés par l'ancien 'today_count', mais plus par le filtre 'today')
        const todayStatuses = ['in_progress', 'ready_for_pickup', 'en_route']; 
        // Inclut l'ancien 'reported' pour la compatibilité
        const relaunchStatuses = ['reported', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée'];
        // --- FIN AJOUT ---

        try {
            // Requête SQL de base
            let query = `
                SELECT
                    o.*,
                    s.name AS shop_name,
                    u.name AS deliveryman_name,
                    o.is_urgent,
                    o.picked_up_by_rider_at,
                    o.follow_up_at, -- AJOUTÉ : Exposer la date de suivi
                    (
                        SELECT GROUP_CONCAT(CONCAT(oi.item_name, ' (x', oi.quantity, ')') SEPARATOR ', ')
                        FROM order_items oi WHERE oi.order_id = o.id
                    ) as items_list,
                    (
                        SELECT COUNT(om.id)
                        FROM order_messages om
                        WHERE om.order_id = o.id
                          AND om.user_id != ? -- Placeholder 1 (subquery unread)
                          AND NOT EXISTS (
                              SELECT 1 FROM message_read_status mrs
                              WHERE mrs.message_id = om.id AND mrs.user_id = ? -- Placeholder 2 (subquery unread)
                          )
                    ) as unread_count
                FROM orders o
                LEFT JOIN shops s ON o.shop_id = s.id
                LEFT JOIN users u ON o.deliveryman_id = u.id
            `;

            // Paramètres initiaux (pour la sous-requête unread_count)
            const params = [filters.deliverymanId, filters.deliverymanId];
            const whereConditions = []; // Tableau pour stocker les conditions WHERE

            // **CONDITION OBLIGATOIRE :** Filtrer par le livreur
            whereConditions.push('o.deliveryman_id = ?');
            params.push(filters.deliverymanId); // Placeholder 3

            // --- MODIFICATION (V7) : Filtre de statut ---
            if (filters.status && filters.status !== 'all') {
                
                if (filters.status === 'today') {
                    // POUR rider-today.html : NE RIEN FAIRE.
                    // On n'ajoute AUCUN filtre de statut. Seul le filtre de DATE (géré plus bas) s'appliquera.
                    // C'est ce qui permet d'afficher TOUS les statuts (y compris finaux) pour la journée en cours.
                
                } else if (filters.status === 'relaunch') {
                    // Pour rider-relaunch.html
                    const statusPlaceholders = relaunchStatuses.map(() => '?').join(',');
                    whereConditions.push(`o.status IN (${statusPlaceholders})`);
                    params.push(...relaunchStatuses);
                
                } else if (Array.isArray(filters.status) && filters.status.length > 0) {
                    // Pour les filtres génériques
                    const statusPlaceholders = filters.status.map(() => '?').join(',');
                    whereConditions.push(`o.status IN (${statusPlaceholders})`);
                    params.push(...filters.status);
                
                } else if (!Array.isArray(filters.status)) {
                    // Pour un filtre string simple
                    whereConditions.push('o.status = ?');
                    params.push(filters.status);
                } else {
                    whereConditions.push('1=0'); // Tableau vide = ne rien retourner
                }
            }
            // Si filters.status est 'all', on n'ajoute PAS de condition de statut
            // --- FIN MODIFICATION (V7) ---


            // Filtre de recherche
            if (filters.search) {
                whereConditions.push('(o.id LIKE ? OR o.customer_phone LIKE ? OR o.customer_name LIKE ?)');
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            // --- MODIFICATION : FILTRE DE DATE (Logique OR) ---
            if (filters.startDate && filters.endDate) {
                // Utiliser DATE() pour comparer uniquement la partie date
                // Vérifie si la date de création OU la date de suivi tombe dans la plage
                whereConditions.push(`
                    (
                        DATE(o.created_at) BETWEEN ? AND ? 
                        OR 
                        DATE(o.follow_up_at) BETWEEN ? AND ?
                    )
                `);
                params.push(filters.startDate, filters.endDate, filters.startDate, filters.endDate);
            } else if (filters.startDate) {
                whereConditions.push(`(DATE(o.created_at) >= ? OR DATE(o.follow_up_at) >= ?)`);
                params.push(filters.startDate, filters.startDate);
            } else if (filters.endDate) {
                whereConditions.push(`(DATE(o.created_at) <= ? OR DATE(o.follow_up_at) <= ?)`);
                params.push(filters.endDate, filters.endDate);
            }
            // --- FIN MODIFICATION ---

            // Construire la clause WHERE finale
            if (whereConditions.length > 0) {
                query += ' WHERE ' + whereConditions.join(' AND ');
            }

            query += ` GROUP BY o.id ORDER BY o.created_at DESC`;

            const [rows] = await connection.execute(query, params);
            return rows;
        } catch (error) {
            console.error("Erreur SQL dans RiderModel.findRiderOrders (v3):", error.message);
            console.error("Requête (v3):", query);
            console.error("Paramètres (v3):", params);
            throw error;
        } finally {
            connection.release();
        }
    },

    // --- MODIFICATION : getOrdersCounts (logique de groupe) ---
    getOrdersCounts: async (riderId) => {
        const connection = await dbConnection.getConnection();
        try {
            // --- MODIFICATION (V7) : Le comptage pour 'today' doit inclure TOUS les statuts non-finaux ---
            const [rows] = await connection.execute(
                `SELECT 
                    CASE 
                        WHEN status IN ('in_progress', 'ready_for_pickup', 'en_route', 'reported', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée') THEN 'today_count'
                        WHEN status IN ('reported', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée') THEN 'relaunch_count_subset' -- Compté dans today, mais aussi séparément
                        WHEN status = 'return_declared' THEN 'returns_count'
                        ELSE status 
                    END as status_group, 
                    COUNT(*) as count 
                FROM orders 
                WHERE deliveryman_id = ? 
                AND status NOT IN ('delivered', 'cancelled', 'returned', 'pending') -- Exclure les finaux et pending
                GROUP BY status_group`,
                [riderId]
            );
            
            const counts = {
                'today_count': 0,
                'relaunch_count': 0,
                'returns_count': 0
            };

            rows.forEach(row => {
                if (row.status_group === 'today_count') {
                    counts.today_count = (counts.today_count || 0) + row.count;
                }
                if (row.status_group === 'relaunch_count_subset') {
                    counts.relaunch_count = (counts.relaunch_count || 0) + row.count;
                }
                if (row.status_group === 'returns_count') {
                    counts.returns_count = (counts.returns_count || 0) + row.count;
                }
            });
            
            // S'assurer que le comptage de "À relancer" (le badge) est correct
            // (Le 'today_count' inclut déjà les relances)
            const [relaunchRows] = await connection.execute(
                 `SELECT COUNT(*) as count FROM orders 
                  WHERE deliveryman_id = ? 
                  AND status IN ('reported', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée')`, 
                 [riderId]
            );
            counts.relaunch_count = relaunchRows[0].count;
            
            
            return counts;

        } catch(error) {
            console.error("Erreur SQL dans RiderModel.getOrdersCounts:", error.message);
            throw error;
        } finally {
            connection.release();
        }
    },
    // --- FIN MODIFICATION ---

    findRiderNotifications: async (riderId) => {
        const connection = await dbConnection.getConnection();
        try {
            const [rows] = await connection.execute(
                `SELECT
                    oh.id, oh.action, oh.created_at, oh.order_id, o.id as tracking_id
                FROM order_history oh JOIN orders o ON oh.order_id = o.id
                WHERE oh.user_id = ? AND oh.action = 'assigned'
                ORDER BY oh.created_at DESC LIMIT 10`,
                [riderId]
            );
            return rows;
        } catch(error) {
            console.error("Erreur SQL dans RiderModel.findRiderNotifications:", error.message);
            throw error;
        } finally {
            connection.release();
        }
    }
};