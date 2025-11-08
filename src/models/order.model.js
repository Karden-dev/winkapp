// src/models/order.model.js
const moment = require('moment');
// Import du service de bilan
const balanceService = require('../services/balance.service');
// Import du service WebSocket (ajouté pour les notifications)
const webSocketService = require('../services/websocket.service'); // <-- AJOUTER CET IMPORT
// Le messageModel sera injecté au démarrage via init()
let localMessageModel;

let dbConnection;

module.exports = {
    /**
     * Initialise le modèle avec la connexion BDD et la référence au modèle message.
     */
    init: (connection, msgModel) => {
        dbConnection = connection;
        localMessageModel = msgModel; // Stocke la référence à messageModel
        module.exports.dbConnection = connection; // Expose la connexion si besoin
    },

    /**
     * Crée une nouvelle commande et ses articles associés.
     */
    create: async (orderData) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            // Statut initial 'pending', Paiement initial 'pending'
            const orderQuery = `INSERT INTO orders (shop_id, customer_name, customer_phone, delivery_location, article_amount, delivery_fee, expedition_fee, status, payment_status, created_by, created_at, is_urgent, is_archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, 0)`;
            const [orderResult] = await connection.execute(orderQuery, [
                orderData.shop_id, orderData.customer_name, orderData.customer_phone,
                orderData.delivery_location, orderData.article_amount, orderData.delivery_fee,
                orderData.expedition_fee, 'pending', 'pending', orderData.created_by
            ]);
            const orderId = orderResult.insertId;
            const itemQuery = 'INSERT INTO order_items (order_id, item_name, quantity, amount) VALUES (?, ?, ?, ?)';
            for (const item of orderData.items) {
                await connection.execute(itemQuery, [orderId, item.item_name, item.quantity, item.amount]);
            }
            await connection.execute('INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)', [orderId, 'Commande créée', orderData.created_by]);

            // Mise à jour du bilan journalier
            const orderDate = moment().format('YYYY-MM-DD');
            await balanceService.updateDailyBalance(connection, {
                shop_id: orderData.shop_id,
                date: orderDate,
                orders_sent: 1,
                expedition_fees: parseFloat(orderData.expedition_fee || 0)
            });
            await balanceService.syncBalanceDebt(connection, orderData.shop_id, orderDate); // Synchroniser la dette si besoin

            await connection.commit();
            return { success: true, orderId };
        } catch (error) {
            await connection.rollback();
            console.error("Erreur create order:", error);
            throw error;
        } finally {
            connection.release();
        }
    },

    /**
     * Met à jour une commande existante et ses articles.
     * La modification est autorisée même si le colis a été récupéré.
     */
    update: async (orderId, orderData, userId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            // Vérifier si la commande existe et récupérer les anciennes données
            const [oldOrderRows] = await connection.execute('SELECT o.*, s.bill_packaging, s.packaging_price FROM orders o JOIN shops s ON o.shop_id = s.id WHERE o.id = ?', [orderId]);
            if (oldOrderRows.length === 0) throw new Error("Commande non trouvée.");
            const oldOrder = oldOrderRows[0];

            // --- Vérification de sécurité (picked_up_by_rider_at) SUPPRIMÉE ---

            const oldOrderDate = moment(oldOrder.created_at).format('YYYY-MM-DD');
            
            // --- MODIFICATION: Ajout des nouveaux statuts aux intermédiaires ---
            const intermediateStatuses = ['pending', 'in_progress', 'ready_for_pickup', 'en_route', 'return_declared', 'reported', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée'];

            // Annuler l'ancien impact financier sur le bilan (si la commande n'était pas 'pending' ou intermédiaire)
            if (!intermediateStatuses.includes(oldOrder.status)) { 
                const oldImpact = balanceService.getBalanceImpactForStatus(oldOrder);
                await balanceService.updateDailyBalance(connection, {
                    shop_id: oldOrder.shop_id, date: oldOrderDate,
                    orders_delivered: -oldImpact.orders_delivered,
                    revenue_articles: -oldImpact.revenue_articles,
                    delivery_fees: -oldImpact.delivery_fees,
                    packaging_fees: -oldImpact.packaging_fees
                });
            }
            // Annuler l'impact de l'envoi et des frais d'expédition
            await balanceService.updateDailyBalance(connection, {
                 shop_id: oldOrder.shop_id, date: oldOrderDate,
                 orders_sent: -1,
                 expedition_fees: -parseFloat(oldOrder.expedition_fee || 0)
            });

            // Préparer les données de mise à jour
            const { items, ...orderFields } = orderData;
            const fieldsToUpdate = Object.keys(orderFields).map(key => `${key} = ?`).join(', ');
            const fieldValues = Object.values(orderFields).map(val => val === '' ? null : val); // Gérer les chaînes vides comme NULL
            const params = [...fieldValues, userId, orderId];

            // Exécuter la mise à jour des champs de la commande
            if(fieldsToUpdate.length > 0) {
                await connection.execute(`UPDATE orders SET ${fieldsToUpdate}, updated_by = ?, updated_at = NOW() WHERE id = ?`, params);
            } else if (items) { // Si seuls les items changent, mettre à jour `updated_by` quand même
                 await connection.execute(`UPDATE orders SET updated_by = ?, updated_at = NOW() WHERE id = ?`, [userId, orderId]);
            }

            // Mettre à jour les articles (supprimer et recréer)
            if (items) {
                await connection.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
                const itemQuery = 'INSERT INTO order_items (order_id, item_name, quantity, amount) VALUES (?, ?, ?, ?)';
                for (const item of items) {
                    await connection.execute(itemQuery, [orderId, item.item_name, item.quantity, item.amount]);
                }
            }

            // Récupérer la commande mise à jour pour recalculer l'impact
            const [newOrderRows] = await connection.execute('SELECT o.*, s.bill_packaging, s.packaging_price FROM orders o JOIN shops s ON o.shop_id = s.id WHERE o.id = ?', [orderId]);
            const newOrder = newOrderRows[0];
            const newDate = moment(newOrder.created_at).format('YYYY-MM-DD');

            // Appliquer le nouvel impact sur le bilan (envoi + frais expédition)
             await balanceService.updateDailyBalance(connection, {
                 shop_id: newOrder.shop_id, date: newDate,
                 orders_sent: 1,
                 expedition_fees: parseFloat(newOrder.expedition_fee || 0)
             });
             // Appliquer l'impact du statut (si pas 'pending' ou intermédiaire)
            if (!intermediateStatuses.includes(newOrder.status)) {
                 const newImpact = balanceService.getBalanceImpactForStatus(newOrder);
                 await balanceService.updateDailyBalance(connection, {
                     shop_id: newOrder.shop_id, date: newDate,
                     ...newImpact
                 });
             }

            // Synchroniser les dettes
            await balanceService.syncBalanceDebt(connection, oldOrder.shop_id, oldOrderDate);
            if (oldOrder.shop_id != newOrder.shop_id || oldOrderDate != newDate) {
                await balanceService.syncBalanceDebt(connection, newOrder.shop_id, newDate);
            } else {
                 await balanceService.syncBalanceDebt(connection, newOrder.shop_id, newDate);
            }

            // Ajouter à l'historique si des modifications ont été faites
             if (items || Object.keys(orderFields).length > 0) {
                await connection.execute('INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)', [orderId, 'Mise à jour de la commande', userId]);
             }

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            console.error(`Erreur update order ${orderId}:`, error);
            throw error; // Renvoyer l'erreur
        } finally {
            connection.release(); // Libérer la connexion
        }
    },

    /**
     * Met à jour le statut et le statut de paiement d'une commande.
     */
    updateStatus: async (orderId, newStatus, amountReceived = null, newPaymentStatus = null, userId, followUpAt = null) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            const [orderRows] = await connection.execute('SELECT o.*, s.bill_packaging, s.packaging_price FROM orders o JOIN shops s ON o.shop_id = s.id WHERE o.id = ?', [orderId]);
            const order = orderRows[0];
            if (!order) throw new Error("Commande non trouvée.");

            const orderDate = moment(order.created_at).format('YYYY-MM-DD');
            const oldStatus = order.status;

            // Définir les statuts considérés comme "finaux" (archivables) et "intermédiaires"
            const finalStatusesForArchive = ['delivered', 'cancelled', 'failed_delivery', 'returned'];
            // --- MODIFICATION: Ajout des nouveaux statuts à la liste intermédiaire ---
            const intermediateStatuses = ['pending', 'in_progress', 'reported', 'ready_for_pickup', 'en_route', 'return_declared', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée'];

            // 1. Annuler l'ancien impact financier si l'ancien statut n'était pas intermédiaire
            if (!intermediateStatuses.includes(oldStatus)) {
                 const oldImpact = balanceService.getBalanceImpactForStatus(order);
                 await balanceService.updateDailyBalance(connection, {
                     shop_id: order.shop_id, date: orderDate,
                     orders_delivered: -oldImpact.orders_delivered,
                     revenue_articles: -oldImpact.revenue_articles,
                     delivery_fees: -oldImpact.delivery_fees,
                     packaging_fees: -oldImpact.packaging_fees
                 });
             }

            // 2. Déterminer le nouveau statut de paiement et le montant reçu
            const updatedOrderData = { ...order, status: newStatus };
            let finalPaymentStatus = order.payment_status;
            let finalAmountReceived = order.amount_received;

            if (newStatus === 'delivered') {
                finalPaymentStatus = newPaymentStatus || 'cash';
                finalAmountReceived = order.article_amount;
            } else if (newStatus === 'cancelled') {
                finalPaymentStatus = 'cancelled';
                finalAmountReceived = null;
            } else if (newStatus === 'failed_delivery') {
                finalAmountReceived = (amountReceived !== null && !isNaN(parseFloat(amountReceived))) ? parseFloat(amountReceived) : null;
                finalPaymentStatus = (finalAmountReceived !== null && finalAmountReceived > 0) ? 'cash' : 'pending';
            } else if (intermediateStatuses.includes(newStatus)) {
                 // Si on réinitialise à 'en_route', 'reported', ou un des nouveaux statuts
                 finalPaymentStatus = 'pending';
                 finalAmountReceived = null; // Réinitialiser le montant reçu
            } else if (newStatus === 'returned') {
                 finalPaymentStatus = 'cancelled';
                 finalAmountReceived = null;
            }

            // 3. Appliquer le nouvel impact financier si le nouveau statut n'est pas intermédiaire
            if (!intermediateStatuses.includes(newStatus)) {
                 updatedOrderData.payment_status = finalPaymentStatus;
                 updatedOrderData.amount_received = finalAmountReceived;
                 const newImpact = balanceService.getBalanceImpactForStatus(updatedOrderData);
                 await balanceService.updateDailyBalance(connection, {
                     shop_id: order.shop_id, date: orderDate,
                     ...newImpact
                 });
            }

            // 4. Mettre à jour la commande dans la base de données, y compris l'archivage
            const isFinal = finalStatusesForArchive.includes(newStatus);
            const wasFinal = finalStatusesForArchive.includes(oldStatus);
            let archiveUpdateSql = '';
            // Archiver si le nouveau statut est final ET que l'ancien ne l'était PAS
            if (isFinal && !wasFinal) {
                archiveUpdateSql = ', is_archived = 1';
            }
            // Désarchiver si le nouveau statut N'EST PAS final ET que l'ancien l'était (cas d'un reset)
            else if (!isFinal && wasFinal) {
                archiveUpdateSql = ', is_archived = 0';
            }

            // --- NOUVELLE LOGIQUE DE MISE À JOUR DE LA DATE DE SUIVI ---
            const scheduledStatuses = ['A relancer', 'Reportée', 'Ne decroche pas', 'Injoignable'];
            let followUpUpdateSql = ', follow_up_at = ?';
            let followUpAtValue = null;
            
            if (scheduledStatuses.includes(newStatus) && followUpAt) {
                 followUpAtValue = moment(followUpAt).format('YYYY-MM-DD HH:mm:ss');
            } else {
                 followUpAtValue = null; // Nettoyer la colonne si ce n'est pas un statut programmé
            }
            // -----------------------------------------------------------

            await connection.execute(
                `UPDATE orders SET status = ?, payment_status = ?, amount_received = ?, updated_by = ?, updated_at = NOW() ${archiveUpdateSql} ${followUpUpdateSql} WHERE id = ?`,
                [newStatus, finalPaymentStatus, finalAmountReceived, userId, followUpAtValue, orderId]
            );

            // 5. Synchroniser la dette du marchand (au cas où le bilan deviendrait négatif/positif)
            await balanceService.syncBalanceDebt(connection, order.shop_id, orderDate);

            // 6. Enregistrer l'action dans l'historique
            await connection.execute('INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)', [orderId, `Statut changé en ${newStatus}`, userId]);

            // --- AJOUT (V9) : MESSAGE SYSTÈME PERSONNALISÉ ET DIFFUSION WEBSOCKET ---
            if (localMessageModel) {
                 // 1. Récupérer le nom de l'utilisateur
                 const [userRows] = await connection.execute('SELECT name, role FROM users WHERE id = ?', [userId]);
                 const userName = userRows[0]?.name || 'Système';
                 const userRole = userRows[0]?.role ? ` (${userRows[0].role})` : '';

                 // 2. Construire le message
                 let systemMessageContent = `Statut mis à jour : ${newStatus} par ${userName}${userRole}`;
                 if ((newStatus === 'A relancer' || newStatus === 'Reportée') && followUpAtValue) {
                     systemMessageContent += ` (Suivi le: ${moment(followUpAtValue).format('DD/MM à HH:mm')})`;
                 }
                
                 // 3. Insérer le message
                 const [newMessageResult] = await connection.execute(
                     `INSERT INTO order_messages (order_id, user_id, message_content, message_type, created_at) VALUES (?, ?, ?, 'system', NOW(3))`,
                     [orderId, userId, systemMessageContent]
                 );
                 
                 // 4. Récupérer le message complet
                 const [messageRows] = await connection.execute(
                    'SELECT om.*, u.name as user_name FROM order_messages om JOIN users u ON om.user_id = u.id WHERE om.id = ?',
                    [newMessageResult.insertId]
                 );
                 
                 // 5. Diffuser
                 if (messageRows.length > 0) {
                    webSocketService.broadcastMessage(orderId, messageRows[0], userId);
                 }
            }
            // --- FIN AJOUT (V9) ---

            await connection.commit(); // Valider toutes les modifications
        } catch (error) {
            await connection.rollback(); // Annuler en cas d'erreur
            console.error(`Erreur updateStatus pour Order ${orderId}:`, error);
            throw error; // Renvoyer l'erreur
        } finally {
            connection.release(); // Libérer la connexion
        }
    },


    /**
     * Supprime une commande et ses dépendances (items, historique, messages, suivi retour).
     * Annule également son impact financier sur le bilan journalier.
     */
    remove: async (orderId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            // Récupérer les détails de la commande avant suppression pour annuler l'impact
            const [orderRows] = await connection.execute('SELECT o.*, s.bill_packaging, s.packaging_price FROM orders o JOIN shops s ON o.shop_id = s.id WHERE o.id = ?', [orderId]);
            if (orderRows.length === 0) {
                 await connection.rollback(); // Commande déjà supprimée ?
                 return { affectedRows: 0 }; // Indiquer qu'aucune ligne n'a été affectée
            }
            const order = orderRows[0];
            const orderDate = moment(order.created_at).format('YYYY-MM-DD');

            // --- MODIFICATION: Ajout des nouveaux statuts aux intermédiaires ---
            const intermediateStatuses = ['pending', 'in_progress', 'reported', 'ready_for_pickup', 'en_route', 'return_declared', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée'];
            
            if (!intermediateStatuses.includes(order.status)) {
                const impact = balanceService.getBalanceImpactForStatus(order);
                await balanceService.updateDailyBalance(connection, {
                    shop_id: order.shop_id, date: orderDate,
                    orders_delivered: -impact.orders_delivered,
                    revenue_articles: -impact.revenue_articles,
                    delivery_fees: -impact.delivery_fees,
                    packaging_fees: -impact.packaging_fees
                });
            }
            // Annuler l'impact de l'envoi et des frais d'expédition
             await balanceService.updateDailyBalance(connection, {
                 shop_id: order.shop_id, date: orderDate,
                 orders_sent: -1, // Décrémenter le compteur d'envois
                 expedition_fees: -parseFloat(order.expedition_fee || 0) // Annuler les frais d'expé
             });

            // Resynchroniser la dette après annulation de l'impact
            await balanceService.syncBalanceDebt(connection, order.shop_id, orderDate);

            // Supprimer les enregistrements liés dans les autres tables (y compris le suivi de retour)
            await connection.execute('DELETE FROM order_history WHERE order_id = ?', [orderId]);
            await connection.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
            await connection.execute('DELETE FROM order_messages WHERE order_id = ?', [orderId]);
            await connection.execute('DELETE FROM returned_stock_tracking WHERE order_id = ?', [orderId]);


            // Supprimer la commande elle-même
            const [result] = await connection.execute('DELETE FROM orders WHERE id = ?', [orderId]);

            await connection.commit(); // Valider la suppression
            return result; // Retourner le résultat de la suppression de la commande
        } catch (error) {
            await connection.rollback(); // Annuler en cas d'erreur
            console.error(`Erreur remove order ${orderId}:`, error);
            throw error; // Renvoyer l'erreur
        } finally {
            connection.release(); // Libérer la connexion
        }
    },

    /**
     * Récupère toutes les commandes avec filtres et jointures.
     */
    findAll: async (filters) => {
        const connection = await dbConnection.getConnection();
        // --- MODIFICATION: Ajout de o.follow_up_at ---
        let query = `SELECT o.*, s.name AS shop_name, u.name AS deliveryman_name, o.is_urgent, o.is_archived, o.follow_up_at
                         FROM orders o
                         LEFT JOIN shops s ON o.shop_id = s.id
                         LEFT JOIN users u ON o.deliveryman_id = u.id
                         WHERE 1=1`; // Condition de base toujours vraie
        let params = []; // Tableau pour stocker les paramètres dynamiques
        // Statuts à exclure par défaut si aucun filtre de statut n'est appliqué
        const excludedStatuses = ['return_declared', 'returned'];

        try {
            // Ajouter le filtre de recherche s'il est fourni
            if (filters.search) {
                query += ` AND (CAST(o.id AS CHAR) LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.delivery_location LIKE ? OR s.name LIKE ? OR u.name LIKE ?)`;
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            }
            
            // --- MODIFICATION: Logique de filtre de date (OR) ---
            if (filters.startDate && filters.endDate) {
                query += ` AND ( (DATE(o.created_at) BETWEEN ? AND ?) OR (DATE(o.follow_up_at) BETWEEN ? AND ?) )`;
                params.push(filters.startDate, filters.endDate, filters.startDate, filters.endDate);
            } else if (filters.startDate) {
                query += ` AND ( DATE(o.created_at) >= ? OR DATE(o.follow_up_at) >= ? )`;
                params.push(filters.startDate, filters.startDate);
            } else if (filters.endDate) {
                 query += ` AND ( DATE(o.created_at) <= ? OR DATE(o.follow_up_at) <= ? )`;
                 params.push(filters.endDate, filters.endDate);
            }
            // --- FIN MODIFICATION ---


            // Gérer le filtre de statut
            if (filters.status && filters.status !== 'all') {
                // Si un statut spécifique (autre que 'all') est demandé
                query += ` AND o.status = ?`;
                params.push(filters.status);
            } else if (!filters.status || filters.status === 'all') { 
                // Comportement par défaut (filtre vide ou "Tous")
                // Exclure uniquement les retours
                const placeholders = excludedStatuses.map(() => '?').join(',');
                query += ` AND o.status NOT IN (${placeholders})`;
                params.push(...excludedStatuses);
            }
            
            // --- MODIFICATION: Suppression du filtre des statuts futurs ---
            // (La logique qui masquait les o.follow_up_at > NOW() a été supprimée)
            // --- FIN MODIFICATION ---

            // Ajouter le tri par date de création (plus récent en premier)
            query += ` ORDER BY o.created_at DESC`;

            // Exécuter la requête avec les paramètres construits
            const [rows] = await connection.execute(query, params);

            // Récupérer les items pour chaque commande trouvée
            const ordersWithDetails = await Promise.all(rows.map(async (order) => {
                const [items] = await connection.execute('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
                return { ...order, items }; // Retourner l'objet commande enrichi avec ses items
            }));
            return ordersWithDetails;
        } catch (error) {
             console.error("Erreur détaillée dans findAll:", {
                 message: error.message, code: error.code, errno: error.errno,
                 sqlState: error.sqlState, sqlMessage: error.sqlMessage,
                 query: query, // Affiche la requête SQL construite
                 params: params // Affiche le tableau de paramètres passé
             });
             throw error; // Renvoyer l'erreur
        }
        finally {
            connection.release(); // Libérer la connexion
        }
    },


    /**
     * Récupère une commande par ID avec ses items et son historique détaillé.
     */
    findById: async (id) => {
        const connection = await dbConnection.getConnection();
        try {
            // Requête pour récupérer les détails de la commande, y compris les noms associés
            let orderQuery = `SELECT o.*, u.name AS deliveryman_name, s.name AS shop_name,
                                     o.is_urgent, o.is_archived, preparer.name AS prepared_by_name
                                FROM orders o
                                LEFT JOIN users u ON o.deliveryman_id = u.id
                                LEFT JOIN users preparer ON o.prepared_by = preparer.id
                                LEFT JOIN shops s ON o.shop_id = s.id
                                WHERE o.id = ?`;
            const [orders] = await connection.execute(orderQuery, [id]);
            const order = orders[0]; // Récupérer la première (et unique) ligne
            if (!order) return null; // Retourner null si la commande n'existe pas

            // Récupérer les articles associés à cette commande
            const itemsQuery = 'SELECT * FROM order_items WHERE order_id = ?';
            const [items] = await connection.execute(itemsQuery, [id]);
            order.items = items; // Ajouter les items à l'objet commande

            // Récupérer l'historique des actions sur cette commande, avec le nom de l'utilisateur
            const historyQuery = `SELECT oh.*, u.name AS user_name
                                  FROM order_history oh
                                  LEFT JOIN users u ON oh.user_id = u.id
                                  WHERE oh.order_id = ?
                                  ORDER BY oh.created_at DESC`; // Trier l'historique du plus récent au plus ancien
            const [history] = await connection.execute(historyQuery, [id]);
            order.history = history; // Ajouter l'historique à l'objet commande

            return order; // Retourner l'objet commande complet
        } finally {
            connection.release(); // Libérer la connexion
        }
    },

    /**
     * Assigne un livreur à une commande.
     * Met à jour le statut, supprime les transactions 'pending' de l'ancien livreur,
     * et ajoute des entrées dans l'historique et les messages système.
     */
    assignDeliveryman: async (orderId, deliverymanId, userId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            // Vérifier si la commande existe et récupérer l'ancien livreur
            const [orderData] = await connection.execute('SELECT deliveryman_id FROM orders WHERE id = ?', [orderId]);
            if (orderData.length === 0) { throw new Error("Commande non trouvée."); }
            const oldDeliverymanId = orderData[0]?.deliveryman_id;
            const assigningUserId = userId; // L'admin qui effectue l'assignation

            // Vérifier si le nouveau livreur existe et a le bon rôle
            const [deliverymanRows] = await connection.execute('SELECT name FROM users WHERE id = ? AND role = "livreur"', [deliverymanId]);
            if (deliverymanRows.length === 0) { throw new Error("Nouveau livreur non trouvé ou rôle incorrect."); }
            const deliverymanName = deliverymanRows[0].name;

            // Ajouter à l'historique de la commande
            const historyQuery = 'INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)';
            const historyMessage = `Commande assignée au livreur : ${deliverymanName}`;
            await connection.execute(historyQuery, [orderId, historyMessage, assigningUserId]);

            // Si un livreur était déjà assigné et différent du nouveau,
            // supprimer ses transactions de versement 'pending' pour cette commande
            if (oldDeliverymanId && oldDeliverymanId != deliverymanId) {
                 await connection.execute(
                    `DELETE FROM cash_transactions WHERE user_id = ? AND type = 'remittance' AND status = 'pending' AND comment LIKE ?`,
                    [oldDeliverymanId, `%${orderId}%`] // Recherche l'ID dans le commentaire
                 );
            }

            // Ajouter un message système dans le chat de la commande (si messageModel est disponible)
            let systemMessage; // Pour stocker le message créé
            if (localMessageModel && typeof localMessageModel.createMessage === 'function') {
                 // --- AJOUT (V9) : Message système personnalisé ---
                 const [adminUserRows] = await connection.execute('SELECT name FROM users WHERE id = ?', [assigningUserId]);
                 const adminName = adminUserRows[0]?.name || 'Admin';
                 const systemMessageContent = `${adminName} (Admin) a assigné la commande au livreur ${deliverymanName}.`;
                 // --- FIN AJOUT (V9) ---
                 
                 const [newMessageResult] = await connection.execute(
                     `INSERT INTO order_messages (order_id, user_id, message_content, message_type, created_at) VALUES (?, ?, ?, 'system', NOW(3))`, // NOW(3) pour timestamp avec millisecondes
                     [orderId, assigningUserId, systemMessageContent]
                 );
                 // --- AJOUT : Récupérer le message pour le diffuser ---
                 const [messageRows] = await connection.execute(
                    'SELECT om.*, u.name as user_name FROM order_messages om JOIN users u ON om.user_id = u.id WHERE om.id = ?',
                    [newMessageResult.insertId]
                 );
                 if (messageRows.length > 0) systemMessage = messageRows[0];
                 // --- FIN AJOUT ---
            } else {
                console.warn(`[assignDeliveryman Order ${orderId}] localMessageModel indisponible ou createMessage non trouvé.`);
            }

            // Mettre à jour la commande :
            // - Assigner le nouveau livreur
            // - Passer statut à 'in_progress'
            // - Passer paiement à 'pending'
            // - Désactiver urgent et archivé
            // - Enregistrer qui a fait la mise à jour et quand
            const updateQuery = `UPDATE orders SET
                                    deliveryman_id = ?, status = 'in_progress', payment_status = 'pending',
                                    is_urgent = 0, is_archived = 0,
                                    updated_by = ?, updated_at = NOW()
                                 WHERE id = ?`;
            await connection.execute(updateQuery, [deliverymanId, assigningUserId, orderId]);
            
            // --- AJOUT : Diffuser le message système ---
            if (systemMessage) {
                 webSocketService.broadcastMessage(orderId, systemMessage, assigningUserId);
            }
            // --- FIN AJOUT ---

            // Valider la transaction si tout s'est bien passé
            await connection.commit();
            return { success: true };
        } catch (error) {
            // Annuler la transaction en cas d'erreur
            await connection.rollback();
            console.error(`Erreur assignDeliveryman pour Order ${orderId}:`, error);
            throw error; // Renvoyer l'erreur pour la gestion au niveau supérieur (contrôleur)
        } finally {
            // Toujours libérer la connexion à la fin
            connection.release();
        }
    },

    /**
     * Récupère les commandes à préparer ou prêtes pour la page Logistique Hub.
     */
    findOrdersToPrepare: async () => {
        const connection = await dbConnection.getConnection();
        try {
            // Sélectionne les commandes avec statut 'in_progress' ou 'ready_for_pickup'
            // Jointures pour obtenir les noms du marchand et du livreur
            let query = `
                SELECT
                    o.id, o.shop_id, o.deliveryman_id, o.customer_phone, o.delivery_location, o.status,
                    o.created_at, o.prepared_at, o.picked_up_by_rider_at, o.delivery_fee, o.expedition_fee,
                    s.name AS shop_name, u.name AS deliveryman_name
                FROM orders o
                LEFT JOIN shops s ON o.shop_id = s.id
                LEFT JOIN users u ON o.deliveryman_id = u.id
                WHERE o.status IN ('in_progress', 'ready_for_pickup')
                AND o.picked_up_by_rider_at IS NULL -- Exclut les commandes ramassées
                ORDER BY o.deliveryman_id ASC, o.created_at ASC
            `; // Tri par livreur puis date de création

            const [rows] = await connection.execute(query);

            // Pour chaque commande, récupérer ses articles associés
            const ordersWithDetails = await Promise.all(rows.map(async (order) => {
                const [items] = await connection.execute('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
                return { ...order, items }; // Retourner l'objet commande enrichi
            }));

            return ordersWithDetails;
        } finally {
            connection.release(); // Libérer la connexion
        }
    },

    /**
     * Marque une commande comme prête pour la récupération ('ready_for_pickup').
     * Ne fonctionne que si le statut actuel est 'in_progress'.
     */
    markAsReadyForPickup: async (orderId, preparedByUserId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            // Mettre à jour le statut, enregistrer qui a préparé et quand
            const [updateResult] = await connection.execute(
                `UPDATE orders SET
                    status = 'ready_for_pickup', prepared_by = ?, prepared_at = NOW(),
                    updated_at = NOW(), updated_by = ?
                 WHERE id = ? AND status = 'in_progress'`, // Condition cruciale sur le statut actuel
                [preparedByUserId, preparedByUserId, orderId]
            );

            // Vérifier si la mise à jour a échoué
            if (updateResult.affectedRows === 0) {
                 await connection.rollback(); // Annuler
                 const [orderCheck] = await connection.execute('SELECT id, status FROM orders WHERE id = ?', [orderId]);
                 if (orderCheck.length === 0) throw new Error("Commande non trouvée.");
                 if (orderCheck[0].status !== 'in_progress') throw new Error(`Statut invalide pour la préparation. Statut actuel: ${orderCheck[0].status}.`);
                 throw new Error("Échec de la mise à jour: Ligne non modifiée.");
            }

            // Ajouter à l'historique
            await connection.execute('INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)', [orderId, 'Colis marqué comme prêt pour la récupération.', preparedByUserId]);

            // Ajouter un message système dans le chat (si disponible)
            let systemMessage;
            if (localMessageModel && typeof localMessageModel.createMessage === 'function') {
                 // --- AJOUT (V9) : Message système personnalisé ---
                 const [userRows] = await connection.execute('SELECT name FROM users WHERE id = ?', [preparedByUserId]);
                 const preparerName = userRows[0]?.name || 'Magasinier';
                 const systemMessageContent = `Colis marqué comme prêt par ${preparerName} (Logistique).`;
                 // --- FIN AJOUT (V9) ---
                 
                 const [newMessageResult] = await connection.execute(
                     `INSERT INTO order_messages (order_id, user_id, message_content, message_type, created_at) VALUES (?, ?, ?, 'system', NOW(3))`,
                     [orderId, preparedByUserId, systemMessageContent]
                 );
                 // --- AJOUT : Récupérer le message pour le diffuser ---
                 const [messageRows] = await connection.execute(
                    'SELECT om.*, u.name as user_name FROM order_messages om JOIN users u ON om.user_id = u.id WHERE om.id = ?',
                    [newMessageResult.insertId]
                 );
                 if (messageRows.length > 0) systemMessage = messageRows[0];
                 // --- FIN AJOUT ---
            }

            await connection.commit(); // Valider

            // --- AJOUT : Envoyer la notification WebSocket (Livreur ET Chat) ---
            try {
                // --- AJOUT : Diffuser le message système ---
                if (systemMessage) {
                     webSocketService.broadcastMessage(orderId, systemMessage, preparedByUserId);
                }
                // --- FIN AJOUT ---
                
                // Récupérer les détails nécessaires pour la notification
                const [orderDetails] = await connection.execute(
                    'SELECT deliveryman_id, shop_id, s.name as shop_name FROM orders o JOIN shops s ON o.shop_id = s.id WHERE o.id = ?',
                    [orderId]
                );
                if (orderDetails.length > 0 && orderDetails[0].deliveryman_id) {
                    const recipientId = orderDetails[0].deliveryman_id;
                    const payload = {
                        order_id: orderId,
                        shop_name: orderDetails[0].shop_name
                    };
                    // Utiliser sendNotification du service WebSocket pour le LIVREUR
                    webSocketService.sendNotification(recipientId, 'ORDER_READY_FOR_PICKUP', payload);
                    console.log(`Notification ORDER_READY_FOR_PICKUP envoyée au livreur ${recipientId} pour CDE ${orderId}`);
                }
            } catch (notifyError) {
                // Log l'erreur mais ne pas faire échouer la requête principale
                console.error(`Erreur lors de l'envoi de la notification WebSocket pour CDE ${orderId}:`, notifyError);
            }
            // --- FIN AJOUT ---

            return { success: true };
        } catch (error) {
            await connection.rollback(); // Annuler en cas d'erreur
            console.error(`Erreur markAsReadyForPickup pour Order ${orderId}:`, error);
            throw error; // Renvoyer l'erreur
        } finally {
            connection.release(); // Libérer la connexion
        }
    }, // Fin markAsReadyForPickup

    /**
     * Confirme la récupération physique du colis par le livreur.
     */
    confirmPickupByRider: async (orderId, riderUserId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            // Vérifier si la commande existe, appartient au livreur et est prête ('ready_for_pickup')
            const [orderCheck] = await connection.execute('SELECT deliveryman_id, status FROM orders WHERE id = ?', [orderId]);
            if (orderCheck.length === 0) throw new Error("Commande non trouvée.");
            if (orderCheck[0].deliveryman_id !== riderUserId) throw new Error("Accès non autorisé: Cette commande ne vous est pas assignée.");
            if (orderCheck[0].status !== 'ready_for_pickup') throw new Error(`Statut invalide pour la confirmation de récupération. Statut actuel: ${orderCheck[0].status}.`);

            // Mettre à jour la date de récupération
            const [updateResult] = await connection.execute(
                `UPDATE orders SET
                    picked_up_by_rider_at = NOW(), updated_at = NOW(), updated_by = ?
                 WHERE id = ? AND picked_up_by_rider_at IS NULL`,
                [riderUserId, orderId]
            );

            // Gérer l'échec (si déjà récupéré)
            if (updateResult.affectedRows === 0) {
                const [reCheck] = await connection.execute('SELECT picked_up_by_rider_at FROM orders WHERE id = ?', [orderId]);
                if (reCheck[0]?.picked_up_by_rider_at) {
                    throw new Error("Le colis a déjà été confirmé comme récupéré.");
                }
                throw new Error("Échec de la mise à jour: Ligne non modifiée.");
            }

            // Ajouter à l'historique
            await connection.execute('INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)', [orderId, 'Confirmation de récupération du colis par le livreur.', riderUserId]);

            // --- AJOUT : Notifier l'admin via WebSocket (CORRIGÉ) ---
             try {
                 const orderDetails = await module.exports.findById(orderId); // Récupérer les détails
                 if (orderDetails) {
                     const payload = {
                         order_id: orderId,
                         rider_name: orderDetails.deliveryman_name || 'Livreur inconnu'
                     };
                     // Utiliser broadcastToRole pour notifier TOUS les admins connectés
                     webSocketService.broadcastToRole('admin', 'ORDER_PICKED_UP_BY_RIDER', payload);
                     console.log(`Notification ORDER_PICKED_UP_BY_RIDER diffusée aux admins pour CDE ${orderId}`);
                 }
             } catch (notifyError) {
                 console.error(`Erreur notification WebSocket ORDER_PICKED_UP_BY_RIDER CDE ${orderId}:`, notifyError);
             }
             // --- FIN AJOUT ---

            await connection.commit(); // Valider
            return { success: true };
        } catch (error) {
            await connection.rollback(); // Annuler
            console.error(`Erreur confirmPickupByRider pour Order ${orderId}:`, error);
            throw error; // Renvoyer
        } finally {
            connection.release(); // Libérer
        }
    },


    /**
     * Démarre la course (change le statut à 'en_route').
     * Vérifie que le colis a été récupéré avant.
     */
    startDelivery: async (orderId, riderUserId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            // Vérifications : commande existe, appartient au livreur, statut 'ready_for_pickup', colis récupéré
            const [orderCheck] = await connection.execute('SELECT deliveryman_id, status, picked_up_by_rider_at FROM orders WHERE id = ?', [orderId]);
            if (orderCheck.length === 0) throw new Error("Commande non trouvée.");
            if (orderCheck[0].deliveryman_id !== riderUserId) throw new Error("Accès non autorisé: Cette commande ne vous est pas assignée.");
            if (orderCheck[0].status !== 'ready_for_pickup') throw new Error(`Statut invalide pour démarrer la course. Statut actuel: ${orderCheck[0].status}.`);
            if (!orderCheck[0].picked_up_by_rider_at) throw new Error("Veuillez confirmer la récupération du colis avant de démarrer la course.");

            // Mettre à jour le statut et la date de démarrage
            const [updateResult] = await connection.execute(
                `UPDATE orders SET
                    status = 'en_route', started_at = NOW(), updated_at = NOW(), updated_by = ?
                 WHERE id = ?`,
                [riderUserId, orderId]
            );

            if (updateResult.affectedRows === 0) { throw new Error("Échec de la mise à jour: Ligne non modifiée."); }

            // Ajouter à l'historique
            await connection.execute('INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)', [orderId, 'Course démarrée (En route).', riderUserId]);
            
            // --- AJOUT (V9) : MESSAGE SYSTÈME PERSONNALISÉ ET DIFFUSION WEBSOCKET ---
            if (localMessageModel) {
                 const [userRows] = await connection.execute('SELECT name FROM users WHERE id = ?', [riderUserId]);
                 const riderName = userRows[0]?.name || 'Livreur';
                 const systemMessageContent = `Course démarrée par ${riderName} (En route).`;
                 
                 const [newMessageResult] = await connection.execute(
                     `INSERT INTO order_messages (order_id, user_id, message_content, message_type, created_at) VALUES (?, ?, ?, 'system', NOW(3))`,
                     [orderId, riderUserId, systemMessageContent]
                 );
                 
                 const [messageRows] = await connection.execute(
                    'SELECT om.*, u.name as user_name FROM order_messages om JOIN users u ON om.user_id = u.id WHERE om.id = ?',
                    [newMessageResult.insertId]
                 );
                 if (messageRows.length > 0) {
                    webSocketService.broadcastMessage(orderId, messageRows[0], riderUserId);
                 }
            }
            // --- FIN AJOUT (V9) ---

            await connection.commit(); // Valider
            return { success: true };
        } catch (error) {
            await connection.rollback(); // Annuler
            console.error(`Erreur startDelivery pour Order ${orderId}:`, error);
            throw error; // Renvoyer
        } finally {
            connection.release(); // Libérer
        }
    },

    /**
     * Déclare un retour par le livreur. Crée une entrée dans `returned_stock_tracking`.
     * Le statut de la commande passe à 'return_declared'.
     */
    declareReturn: async (orderId, riderUserId, comment = null) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            // Vérifications : commande, appartenance, statut valide ('en_route', 'failed_delivery', 'cancelled')
            const [orderCheck] = await connection.execute('SELECT deliveryman_id, shop_id, status FROM orders WHERE id = ?', [orderId]);
            if (orderCheck.length === 0) throw new Error("Commande non trouvée.");
            if (orderCheck[0].deliveryman_id !== riderUserId) throw new Error("Accès non autorisé: Cette commande ne vous est pas assignée.");
            const currentStatus = orderCheck[0].status;
            
            // --- MODIFICATION: Ajout des nouveaux statuts à la liste des retours autorisés ---
            const allowedReturnStatuses = ['en_route', 'failed_delivery', 'cancelled', 'reported', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée'];
            if (!allowedReturnStatuses.includes(currentStatus)) {
                 throw new Error(`Statut invalide pour déclarer un retour. Statut actuel: ${currentStatus}.`);
            }

            // Vérifier qu'un retour n'est pas déjà enregistré ou en cours
            const [existingReturn] = await connection.execute(
                'SELECT id FROM returned_stock_tracking WHERE order_id = ? AND return_status IN (?, ?, ?)', // Ajout returned_to_shop
                [orderId, 'pending_return_to_hub', 'received_at_hub', 'returned_to_shop']
            );
            if (existingReturn.length > 0) {
                 throw new Error("Un retour est déjà en cours ou a été complété pour cette commande.");
            }

            // Insérer l'enregistrement de suivi du retour
            const insertTrackingQuery = `
                INSERT INTO returned_stock_tracking
                (order_id, deliveryman_id, shop_id, return_status, declaration_date, comment)
                VALUES (?, ?, ?, 'pending_return_to_hub', NOW(), ?)
            `;
            const [trackingResult] = await connection.execute(insertTrackingQuery, [
                orderId, riderUserId, orderCheck[0].shop_id, comment
            ]);
            const trackingId = trackingResult.insertId; // Récupère l'ID du suivi

            // Mettre à jour le statut de la commande à 'return_declared'
            const newStatus = 'return_declared';
            await connection.execute(
                `UPDATE orders SET status = ?, updated_at = NOW(), updated_by = ? WHERE id = ?`,
                [newStatus, riderUserId, orderId]
            );

            // Ajouter à l'historique
            await connection.execute('INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)', [orderId, `Retour déclaré : En attente de réception au Magasin.`, riderUserId]);

            // --- AJOUT (V9) : MESSAGE SYSTÈME PERSONNALISÉ ET DIFFUSION WEBSOCKET ---
            let systemMessage;
            if (localMessageModel) {
                 const [userRows] = await connection.execute('SELECT name FROM users WHERE id = ?', [riderUserId]);
                 const riderName = userRows[0]?.name || 'Livreur';
                 const systemMessageContent = `Retour déclaré par ${riderName} (En attente Magasin). ${comment ? 'Motif: ' + comment : ''}`;
                 
                 const [newMessageResult] = await connection.execute(
                     `INSERT INTO order_messages (order_id, user_id, message_content, message_type, created_at) VALUES (?, ?, ?, 'system', NOW(3))`,
                     [orderId, riderUserId, systemMessageContent]
                 );
                 const [messageRows] = await connection.execute(
                    'SELECT om.*, u.name as user_name FROM order_messages om JOIN users u ON om.user_id = u.id WHERE om.id = ?',
                    [newMessageResult.insertId]
                 );
                 if (messageRows.length > 0) systemMessage = messageRows[0];
            }
            // --- FIN AJOUT (V9) ---

            // --- AJOUT : Notifier l'admin via WebSocket (Notification ET Message) ---
             try {
                 // Diffuser le message système
                 if (systemMessage) {
                    webSocketService.broadcastMessage(orderId, systemMessage, riderUserId);
                 }
                 
                 const orderDetails = await module.exports.findById(orderId); // Récupérer les détails
                 if (orderDetails) {
                     // Envoyer la notification "Pop-up"
                     webSocketService.broadcastToRole('admin', 'NEW_RETURN_DECLARED', {
                         order_id: orderId,
                         tracking_id: trackingId, // Envoyer aussi l'ID du suivi
                         rider_name: orderDetails.deliveryman_name || 'Livreur inconnu',
                         shop_name: orderDetails.shop_name || 'Marchand inconnu'
                     });
                     console.log(`Notification NEW_RETURN_DECLARED diffusée aux admins pour CDE ${orderId}`);
                 }
             } catch (notifyError) {
                 console.error(`Erreur notification WebSocket NEW_RETURN_DECLARED CDE ${orderId}:`, notifyError);
             }
             // --- FIN AJOUT ---

            await connection.commit(); // Valider
            return { success: true, trackingId: trackingId }; // Renvoyer l'ID du suivi créé
        } catch (error) {
            await connection.rollback(); // Annuler
            console.error(`Erreur declareReturn pour Order ${orderId}:`, error);
            throw error; // Renvoyer
        } finally {
            connection.release(); // Libérer
        }
    },

    /**
     * Récupère les retours en attente ou confirmés au Hub, avec filtres possibles.
     */
    findPendingReturns: async (filters = {}) => {
        const connection = await dbConnection.getConnection();
        try {
            // Sélectionne les infos du suivi, commande, marchand, livreur
            let query = `
                SELECT
                    rst.id AS tracking_id, rst.declaration_date, rst.return_status, rst.comment,
                    o.id AS order_id, o.customer_phone,
                    s.name AS shop_name, u.name AS deliveryman_name
                FROM returned_stock_tracking rst
                JOIN orders o ON rst.order_id = o.id
                JOIN shops s ON rst.shop_id = s.id
                JOIN users u ON rst.deliveryman_id = u.id
                WHERE 1=1
            `;
            const params = [];

            // Appliquer les filtres
            if (filters.status && filters.status !== 'all') {
                query += ` AND rst.return_status = ?`;
                params.push(filters.status);
            } else if (!filters.status) {
                // Par défaut, exclure 'returned_to_shop' si aucun statut n'est spécifié
                query += ` AND rst.return_status != 'returned_to_shop'`;
            }
            if (filters.deliverymanId) {
                query += ` AND rst.deliveryman_id = ?`;
                params.push(filters.deliverymanId);
            }
            if (filters.startDate) {
                query += ` AND DATE(rst.declaration_date) >= ?`;
                params.push(filters.startDate);
            }
            if (filters.endDate) {
                 query += ` AND DATE(rst.declaration_date) <= ?`;
                 params.push(filters.endDate);
            }

            // Trier par date de déclaration (plus récent en premier)
            query += ` ORDER BY rst.declaration_date DESC`;
            const [rows] = await connection.execute(query, params);
            return rows;
        } finally {
            connection.release(); // Libérer la connexion
        }
    },

    /**
     * Confirme la réception physique d'un retour au Hub par un admin.
     * Met à jour le statut du suivi et le statut final ('returned') de la commande.
     */
    confirmHubReception: async (trackingId, adminUserId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            // Vérifier si le suivi existe et est en attente de réception
            const [trackingRow] = await connection.execute(
                'SELECT order_id, deliveryman_id FROM returned_stock_tracking WHERE id = ? AND return_status = ?', // Ajout deliveryman_id
                [trackingId, 'pending_return_to_hub']
            );
            if (trackingRow.length === 0) throw new Error("Retour non trouvé ou déjà réceptionné.");
            const orderId = trackingRow[0].order_id;
            const deliverymanId = trackingRow[0].deliveryman_id; // Récupérer l'ID du livreur

            // Mettre à jour le statut du suivi de retour
            await connection.execute(
                `UPDATE returned_stock_tracking
                 SET return_status = 'received_at_hub', hub_reception_date = NOW(), stock_received_by_user_id = ?
                 WHERE id = ?`,
                [adminUserId, trackingId]
            );

            // Mettre à jour le statut de la commande principale à 'returned' (statut final)
            // L'appel à `updateStatus` gérera aussi l'archivage, l'historique ET le message système/websocket
            await module.exports.updateStatus(orderId, 'returned', null, 'cancelled', adminUserId); // Met aussi payment_status à cancelled

            // --- AJOUT : Notifier le livreur via WebSocket ---
             try {
                 if (deliverymanId) {
                     webSocketService.sendNotification(deliverymanId, 'RETURN_RECEIVED_AT_HUB', {
                         order_id: orderId,
                         tracking_id: trackingId
                     });
                     console.log(`Notification RETURN_RECEIVED_AT_HUB envoyée au livreur ${deliverymanId} pour retour ${trackingId}`);
                 }
             } catch (notifyError) {
                 console.error(`Erreur notification WebSocket RETURN_RECEIVED_AT_HUB retour ${trackingId}:`, notifyError);
             }
             // --- FIN AJOUT ---

            await connection.commit(); // Valider
            return { success: true };
        } catch (error) {
            await connection.rollback(); // Annuler
            console.error(`Erreur confirmHubReception pour Tracking ID ${trackingId}:`, error);
            throw error; // Renvoyer
        } finally {
            connection.release(); // Libérer
        }
    }
};