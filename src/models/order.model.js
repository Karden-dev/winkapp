// src/models/order.model.js
const moment = require('moment');
let cashService;

let dbConnection;

module.exports = {
    init: (connection) => { 
        dbConnection = connection;
    },
    setCashService: (service) => {
        cashService = service;
    },

    create: async (orderData) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            const orderQuery = `
                INSERT INTO orders (shop_id, customer_name, customer_phone, delivery_location, article_amount, delivery_fee, expedition_fee, status, payment_status, created_by, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;
            const [orderResult] = await connection.execute(orderQuery, [
                orderData.shop_id,
                orderData.customer_name,
                orderData.customer_phone,
                orderData.delivery_location,
                orderData.article_amount,
                orderData.delivery_fee,
                orderData.expedition_fee,
                'pending',
                'pending',
                orderData.created_by
            ]);
            const orderId = orderResult.insertId;

            const itemQuery = 'INSERT INTO order_items (order_id, item_name, quantity, amount) VALUES (?, ?, ?, ?)';
            for (const item of orderData.items) {
                await connection.execute(itemQuery, [orderId, item.item_name, item.quantity, item.amount]);
            }
            
            const historyQuery = 'INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)';
            await connection.execute(historyQuery, [orderId, 'Commande créée', orderData.created_by]);
            
            if (orderData.expedition_fee && orderData.expedition_fee > 0) {
                const comment = `Frais d'expédition pour la commande n°${orderId}`;
                await connection.execute(
                    'INSERT INTO debts (shop_id, order_id, amount, type, comment) VALUES (?, ?, ?, ?, ?)',
                    [orderData.shop_id, orderId, orderData.expedition_fee, 'expedition', comment]
                );
            }

            await connection.commit();
            return { success: true, orderId: orderId };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    findAll: async (filters) => {
        const connection = await dbConnection.getConnection();
        try {
            let query = `
                SELECT 
                    o.*, s.name AS shop_name, u.name AS deliveryman_name,
                    GROUP_CONCAT(oi.item_name) AS item_names
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                LEFT JOIN shops s ON o.shop_id = s.id
                LEFT JOIN users u ON o.deliveryman_id = u.id
                WHERE 1=1
            `;
            const params = [];

            if (filters.search) {
                query += ` AND (o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.delivery_location LIKE ? OR s.name LIKE ?)`;
                params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
            }
            
            if (filters.startDate) {
                query += ` AND o.created_at >= ?`;
                params.push(moment(filters.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'));
            }

            if (filters.endDate) {
                query += ` AND o.created_at <= ?`;
                params.push(moment(filters.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss'));
            }

            if (filters.status) {
                query += ` AND o.status = ?`;
                params.push(filters.status);
            }

            query += ` GROUP BY o.id ORDER BY o.created_at DESC`;

            const [rows] = await connection.execute(query, params);
            const ordersWithDetails = await Promise.all(rows.map(async (order) => {
                const [items] = await connection.execute('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
                const [history] = await connection.execute(`
                    SELECT oh.*, u.name as user_name
                    FROM order_history oh
                    LEFT JOIN users u ON oh.user_id = u.id
                    WHERE oh.order_id = ?
                    ORDER BY oh.created_at ASC`, [order.id]);
                return { ...order, items, history };
            }));
            return ordersWithDetails;
        } finally {
            connection.release();
        }
    },
    
    findById: async (id) => {
        const connection = await dbConnection.getConnection();
        try {
            const orderQuery = 'SELECT o.*, u.name AS deliveryman_name, s.name AS shop_name FROM orders o LEFT JOIN users u ON o.deliveryman_id = u.id LEFT JOIN shops s ON o.shop_id = s.id WHERE o.id = ?';
            const [orders] = await connection.execute(orderQuery, [id]);
            const order = orders[0];
            if (!order) return null;

            const itemsQuery = 'SELECT * FROM order_items WHERE order_id = ?';
            const [items] = await connection.execute(itemsQuery, [id]);
            order.items = items;
            
            const historyQuery = 'SELECT oh.*, u.name AS user_name FROM order_history oh LEFT JOIN users u ON oh.user_id = u.id WHERE oh.order_id = ? ORDER BY oh.created_at DESC';
            const [history] = await connection.execute(historyQuery, [id]);
            order.history = history;

            return order;
        } finally {
            connection.release();
        }
    },

    update: async (orderId, orderData, userId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            const fieldsToUpdate = [];
            const params = [];
            const previousExpeditionFee = (await connection.execute('SELECT expedition_fee FROM orders WHERE id = ?', [orderId]))[0][0].expedition_fee;

            const validFields = [
                'shop_id', 'customer_name', 'customer_phone', 'delivery_location',
                'article_amount', 'delivery_fee', 'deliveryman_id', 'created_at', 'expedition_fee'
            ];
            
            for (const field of validFields) {
                if (Object.prototype.hasOwnProperty.call(orderData, field) && orderData[field] !== undefined) {
                    fieldsToUpdate.push(`${field} = ?`);
                    params.push(orderData[field] === '' ? null : orderData[field]);
                }
            }
            
            if (fieldsToUpdate.length > 0) {
                fieldsToUpdate.push('updated_by = ?');
                params.push(userId);
                fieldsToUpdate.push('updated_at = NOW()');
            
                const orderQuery = `UPDATE orders SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
                params.push(orderId);
            
                await connection.execute(orderQuery, params);
            }
            
            if (orderData.items) {
                await connection.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
                const itemQuery = 'INSERT INTO order_items (order_id, item_name, quantity, amount) VALUES (?, ?, ?, ?)';
                for (const item of orderData.items) {
                    await connection.execute(itemQuery, [orderId, item.item_name, item.quantity, item.amount]);
                }
            }

            const newExpeditionFee = parseFloat(orderData.expedition_fee || 0);

            if (newExpeditionFee > 0 && newExpeditionFee !== previousExpeditionFee) {
                const [existingDebt] = await connection.execute(
                    'SELECT id FROM debts WHERE order_id = ? AND type = "expedition"',
                    [orderId]
                );

                const comment = `Mise à jour des frais d'expédition pour la commande n°${orderId}`;

                if (existingDebt.length > 0) {
                    await connection.execute(
                        'UPDATE debts SET amount = ?, comment = ?, updated_at = NOW() WHERE id = ?',
                        [newExpeditionFee, comment, existingDebt[0].id]
                    );
                } else {
                    await connection.execute(
                        'INSERT INTO debts (shop_id, order_id, amount, type, comment) VALUES (?, ?, ?, ?, ?)',
                        [orderData.shop_id, orderId, newExpeditionFee, 'expedition', comment]
                    );
                }
            } else if (newExpeditionFee === 0 && previousExpeditionFee > 0) {
                await connection.execute(
                    'DELETE FROM debts WHERE order_id = ? AND type = "expedition"',
                    [orderId]
                );
            }
            
            const historyQuery = 'INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)';
            await connection.execute(historyQuery, [orderId, 'Mise à jour de la commande', userId]);

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },
    
    remove: async (orderId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
            await connection.execute('DELETE FROM debts WHERE order_id = ?', [orderId]);
            const [result] = await connection.execute('DELETE FROM orders WHERE id = ?', [orderId]);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    updateStatus: async (orderId, status, amountReceived = null, paymentStatus = null, userId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            let query = 'UPDATE orders SET status = ?, updated_by = ?, updated_at = NOW()';
            const params = [status, userId];
            let historyMessage = '';
            
            if (status === 'failed_delivery') {
                query += ', amount_received = ?, payment_status = ?';
                const finalPaymentStatus = (amountReceived > 0) ? 'cash' : 'paid_to_supplier';
                params.push(amountReceived, finalPaymentStatus);
                historyMessage = `Statut changé en Livraison ratée (Montant perçu: ${amountReceived} FCFA)`;
            } else if (status === 'delivered') {
                query += ', payment_status = ?';
                params.push(paymentStatus);
                historyMessage = `Statut changé en Livré`;
            } else if (status === 'cancelled') {
                query += ', payment_status = ?';
                params.push('cancelled');
                historyMessage = `Statut changé en Annulé`;
            } else if (status === 'reported') {
                 query += ', payment_status = ?';
                params.push('pending');
                historyMessage = `Statut changé en À relancer`;
            }

            query += ' WHERE id = ?';
            params.push(orderId);
            
            await connection.execute(query, params);

            const historyQuery = 'INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)';
            await connection.execute(historyQuery, [orderId, historyMessage, userId]);

            if (cashService && ((status === 'delivered' && paymentStatus === 'cash') || (status === 'failed_delivery' && amountReceived > 0))) {
                const [order] = await connection.execute('SELECT deliveryman_id, article_amount, amount_received, delivery_fee FROM orders WHERE id = ?', [orderId]);
                
                if (order[0] && order[0].deliveryman_id) {
                    const amount = (status === 'delivered') ? parseFloat(order[0].article_amount) : parseFloat(order[0].amount_received);
                    const comment = `Versement en attente pour la commande n°${orderId}`;
                    await cashService.createRemittanceTransaction(order[0].deliveryman_id, amount, comment);
                }
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },
    
    assignDeliveryman: async (orderId, deliverymanId, userId) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();

            const [deliverymanRows] = await connection.execute('SELECT name FROM users WHERE id = ?', [deliverymanId]);
            const deliverymanName = deliverymanRows[0]?.name || 'Inconnu';

            const query = 'UPDATE orders SET deliveryman_id = ?, status = ?, payment_status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?';
            await connection.execute(query, [deliverymanId, 'in_progress', 'pending', userId, orderId]);

            const historyQuery = 'INSERT INTO order_history (order_id, action, user_id) VALUES (?, ?, ?)';
            const historyMessage = `Commande assignée au livreur : ${deliverymanName}`;
            
            await connection.execute(historyQuery, [orderId, historyMessage, userId]);

            await connection.commit();
            return { success: true };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },
    
    findReportsByDateRange: async (startDate, endDate) => {
        const connection = await dbConnection.getConnection();
        try {
            const query = `
                SELECT
                    s.id AS shop_id,
                    s.name AS shop_name,
                    COUNT(o.id) AS total_orders_sent,
                    COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) AS total_orders_delivered,
                    SUM(CASE WHEN o.status = 'delivered' THEN o.delivery_fee ELSE 0 END) AS total_delivery_fees,
                    SUM(CASE WHEN o.status = 'delivered' AND o.payment_status = 'cash' THEN o.article_amount - o.delivery_fee
                             WHEN o.status = 'delivered' AND o.payment_status = 'paid_to_supplier' THEN -o.delivery_fee
                             ELSE 0 END) AS amount_to_remit
                FROM shops s
                LEFT JOIN orders o ON s.id = o.shop_id AND o.created_at >= ? AND o.created_at <= ?
                GROUP BY s.id
                ORDER BY s.name ASC;
            `;
            const params = [
                moment(startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'),
                moment(endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
            ];
            const [reports] = await connection.execute(query, params);
            return reports;
        } finally {
            connection.release();
        }
    }
};