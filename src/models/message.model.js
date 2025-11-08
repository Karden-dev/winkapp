// src/models/message.model.js
const moment = require('moment');
let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

/**
 * Récupère les messages d'une commande spécifique, après un certain timestamp si fourni.
 * Inclut le nom de l'auteur.
 */
const findMessagesByOrderId = async (orderId, userId, userRole, since = null) => {
    const connection = await dbConnection.getConnection();
    try {
        // Vérification d'accès : l'utilisateur doit être admin ou le livreur assigné
        const [orderCheck] = await connection.execute(
            'SELECT deliveryman_id FROM orders WHERE id = ?',
            [orderId]
        );
        if (orderCheck.length === 0) throw new Error("Commande non trouvée.");
        // Autoriser si admin OU si c'est le livreur assigné
        if (userRole !== 'admin' && orderCheck[0].deliveryman_id != userId) { 
            throw new Error(`Accès non autorisé à la conversation pour la commande ${orderId}.`);
        }

        let query = `
            SELECT om.*, u.name as user_name
            FROM order_messages om
            JOIN users u ON om.user_id = u.id
            WHERE om.order_id = ?
        `;
        const params = [orderId];

        if (since) {
            const sinceTimestamp = moment(since).utc().format('YYYY-MM-DD HH:mm:ss.SSS');
            query += ' AND om.created_at > ?';
            params.push(sinceTimestamp);
        }

        query += ' ORDER BY om.created_at ASC';

        const [messages] = await connection.execute(query, params);
        return messages;
    } finally {
        connection.release();
    }
};

/**
 * Crée un nouveau message (utilisateur ou système).
 */
const createMessage = async (orderId, userId, messageContent, messageType = 'user') => {
    const connection = await dbConnection.getConnection();
    try {
        const query = `
            INSERT INTO order_messages (order_id, user_id, message_content, message_type, created_at)
            VALUES (?, ?, ?, ?, NOW(3))
        `;
        const [result] = await connection.execute(query, [orderId, userId, messageContent, messageType]);

        const [newMessage] = await connection.execute(
            'SELECT om.*, u.name as user_name FROM order_messages om JOIN users u ON om.user_id = u.id WHERE om.id = ?',
            [result.insertId]
        );
        return newMessage[0];
    } finally {
        connection.release();
    }
};

/**
 * Marque les messages d'une conversation comme lus par un utilisateur jusqu'à un certain ID.
 */
const markMessagesAsRead = async (orderId, userId, lastMessageId) => {
    const connection = await dbConnection.getConnection();
    try {
        const [unreadMessages] = await connection.execute(`
            SELECT om.id FROM order_messages om
            WHERE om.order_id = ?
            AND om.id <= ?
            AND om.user_id != ?
            AND NOT EXISTS (
                SELECT 1 FROM message_read_status mrs
                WHERE mrs.message_id = om.id AND mrs.user_id = ?
            )
        `, [orderId, lastMessageId, userId, userId]);

        let markedCount = 0;
        if (unreadMessages.length > 0) {
            const valuesPlaceholder = unreadMessages.map(() => '(?, ?, NOW())').join(',');
            const valuesParams = unreadMessages.flatMap(msg => [msg.id, userId]);
            const [insertResult] = await connection.execute(`
                INSERT IGNORE INTO message_read_status (message_id, user_id, read_at) VALUES ${valuesPlaceholder}
            `, valuesParams);
            markedCount = insertResult.affectedRows;
        }
        return { markedCount };
    }
     finally {
        connection.release();
    }
};


/**
 * Récupère la liste des conversations avec métadonnées pour l'admin.
 * CORRECTION: Logique des filtres 'showArchived' et 'showUrgentOnly'
 */
const findConversationsForAdmin = async (adminUserId, filters) => {
    const connection = await dbConnection.getConnection();
    try {
        const { search, showArchived, showUrgentOnly } = filters;
        
        let query = `
            SELECT
                o.id as order_id,
                o.customer_phone,
                s.name as shop_name,
                u_del.name as deliveryman_name,
                o.is_urgent,
                o.is_archived,
                (
                    SELECT message_content
                    FROM order_messages
                    WHERE order_id = o.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) as last_message,
                (
                    SELECT created_at
                    FROM order_messages
                    WHERE order_id = o.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) as last_message_time,
                (SELECT COUNT(*)
                   FROM order_messages om_unread
                   WHERE om_unread.order_id = o.id
                     AND om_unread.user_id != ?
                     AND NOT EXISTS (
                        SELECT 1 FROM message_read_status mrs
                        WHERE mrs.message_id = om_unread.id AND mrs.user_id = ?
                     )
                ) as unread_count
            FROM orders o
            JOIN shops s ON o.shop_id = s.id
            LEFT JOIN users u_del ON o.deliveryman_id = u_del.id
            WHERE EXISTS (SELECT 1 FROM order_messages WHERE order_id = o.id)
        `;
        const params = [adminUserId, adminUserId];

        // --- DÉBUT CORRECTION LOGIQUE FILTRES ---
        if (showArchived) {
            // Si coché, montrer UNIQUEMENT les archivées
            query += ' AND o.is_archived = 1';
        } else {
            // Sinon, montrer UNIQUEMENT les non-archivées
            query += ' AND o.is_archived = 0';
        }

        if (showUrgentOnly) {
            // Si coché, montrer UNIQUEMENT les urgentes
            query += ' AND o.is_urgent = 1';
        }
        // Si 'showUrgentOnly' est false, on ne filtre pas (on montre urgentes ET non urgentes)
        // --- FIN CORRECTION LOGIQUE FILTRES ---
        
        let searchConditions = [];
        if (search) {
            searchConditions.push(`CAST(o.id AS CHAR) LIKE ?`);
            searchConditions.push(`o.customer_phone LIKE ?`);
            searchConditions.push(`s.name LIKE ?`);
            searchConditions.push(`u_del.name LIKE ?`);
            searchConditions.push(`o.delivery_location LIKE ?`);
            
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            
            query += ' AND (' + searchConditions.join(' OR ') + ')';
        }
        
        const [conversations] = await connection.execute(query, params);
        return conversations;
    } finally {
        connection.release();
    }
};

/**
 * Compte total des messages non lus pour un utilisateur (admin ou livreur).
 */
const countAllUnreadMessages = async (userId, userRole) => {
     const connection = await dbConnection.getConnection();
     try {
         let condition = '';
         const params = [userId, userId];

         if (userRole === 'livreur') {
             condition = 'AND om.order_id IN (SELECT id FROM orders WHERE deliveryman_id = ?)';
             params.push(userId);
         }

         const query = `
             SELECT COUNT(om.id) as total_unread
             FROM order_messages om
             WHERE om.user_id != ?
             ${condition}
             AND NOT EXISTS (
                 SELECT 1 FROM message_read_status mrs
                 WHERE mrs.message_id = om.id AND mrs.user_id = ?
             )
         `;

         const [result] = await connection.execute(query, params);
         return result[0]?.total_unread || 0;
     } finally {
         connection.release();
     }
};


/**
 * Récupère les messages rapides actifs pour un rôle donné.
 */
const findQuickRepliesByRole = async (role) => {
    const connection = await dbConnection.getConnection();
    try {
        const query = `
            SELECT message_text FROM quick_replies
            WHERE (role = ? OR role = 'all') AND is_active = 1
            ORDER BY display_order ASC, message_text ASC
        `;
        const effectiveRole = (role === 'admin' || role === 'livreur') ? role : 'all';
        const [replies] = await connection.execute(query, [effectiveRole]);
        return replies.map(r => r.message_text);
    } finally {
        connection.release();
    }
};

/**
 * Met à jour le flag 'is_urgent' d'une commande.
 */
const setOrderUrgency = async (orderId, isUrgent) => {
     const connection = await dbConnection.getConnection();
     try {
         const [result] = await connection.execute(
             'UPDATE orders SET is_urgent = ? WHERE id = ?',
             [isUrgent ? 1 : 0, orderId]
         );
         return result.affectedRows > 0;
     } finally {
         connection.release();
     }
};

/**
 * Met à jour le flag 'is_archived' d'une commande.
 */
const setOrderArchived = async (orderId, isArchived) => {
     const connection = await dbConnection.getConnection();
     try {
         const [result] = await connection.execute(
             'UPDATE orders SET is_archived = ? WHERE id = ?',
             [isArchived ? 1 : 0, orderId]
         );
         return result.affectedRows > 0;
     }
     finally {
         if (connection) connection.release();
     }
};


module.exports = {
    init,
    findMessagesByOrderId,
    createMessage,
    markMessagesAsRead,
    findConversationsForAdmin,
    countAllUnreadMessages,
    findQuickRepliesByRole,
    setOrderUrgency,
    setOrderArchived
};