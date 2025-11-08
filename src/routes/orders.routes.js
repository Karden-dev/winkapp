// src/routes/orders.routes.js
const express = require('express');
const router = express.Router();
const orderModel = require('../models/order.model');
// --- AJOUT : Importer les middlewares d'authentification et d'autorisation ---
const { verifyToken, isAdmin, isRider } = require('../middleware/auth.middleware');

// --- NOUVELLE ROUTE (Admin) : Récupérer les commandes en attente de préparation (Inclut ready_for_pickup) ---
router.get('/pending-preparation', verifyToken, isAdmin, async (req, res) => {
    try {
        // Cette route exclut les commandes qui ont déjà été récupérées (picked_up_by_rider_at IS NOT NULL)
        const ordersToPrepare = await orderModel.findOrdersToPrepare();

        // Le filtre est maintenant géré par le modèle

        res.status(200).json(ordersToPrepare);
    } catch (error) {
        console.error("Erreur (GET /orders/pending-preparation):", error);
        res.status(500).json({ message: 'Erreur serveur lors de la récupération des commandes à préparer.' });
    }
});

// --- NOUVELLE ROUTE (Admin) : Marquer une commande comme prête pour la récupération ---
router.put('/:id/ready', verifyToken, isAdmin, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const preparedByUserId = req.user.id; // ID de l'admin connecté

        if (isNaN(orderId)) {
            return res.status(400).json({ message: 'ID de commande invalide.' });
        }

        const result = await orderModel.markAsReadyForPickup(orderId, preparedByUserId);

        if (result.success) {
            res.status(200).json({ message: 'Commande marquée comme prête pour la récupération.' });
        } else {
            res.status(400).json({ message: result.message || 'Impossible de marquer la commande comme prête.' });
        }
    } catch (error) {
        console.error("Erreur (PUT /orders/:id/ready):", error);
        res.status(500).json({ message: error.message || 'Erreur serveur lors du marquage comme prêt.' });
    }
});

// --- NOUVELLE ROUTE (Livreur) : Déclarer un retour ---
router.post('/:id/declare-return', verifyToken, isRider, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const riderUserId = req.user.id;
        const { comment } = req.body;

        if (isNaN(orderId)) {
            return res.status(400).json({ message: 'ID de commande invalide.' });
        }

        const result = await orderModel.declareReturn(orderId, riderUserId, comment);

        if (result.success) {
            res.status(201).json({ message: 'Retour déclaré avec succès. En attente de confirmation du Hub.', trackingId: result.trackingId });
        } else {
            res.status(400).json({ message: result.message || 'Échec de la déclaration de retour.' });
        }
    } catch (error) {
        console.error("Erreur (POST /orders/:id/declare-return):", error);
        res.status(500).json({ message: error.message || 'Erreur lors de la déclaration du retour.' });
    }
});


// --- ROUTES EXISTANTES ---

// POST / : Créer une nouvelle commande (protégée)
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { shop_id, customer_name, customer_phone, delivery_location, article_amount, delivery_fee, expedition_fee, items } = req.body;
        const created_by = req.user.id;

        if (!shop_id || !customer_phone || !delivery_location || !items || items.length === 0) {
            return res.status(400).json({ message: 'Données de commande invalides (champs obligatoires manquants).' });
        }

        const orderData = {
            shop_id,
            customer_name: (customer_name && customer_name.trim() !== '') ? customer_name : null,
            customer_phone: customer_phone || null,
            delivery_location: delivery_location || null,
            article_amount,
            delivery_fee,
            expedition_fee,
            created_by,
            items
        };

        const result = await orderModel.create(orderData);

        res.status(201).json({ message: 'Commande créée avec succès.', orderId: result.orderId });
    } catch (error) {
        console.error("Erreur (POST /orders):", error);
        res.status(500).json({ message: 'Erreur lors de la création de la commande.' });
    }
});

// GET / : Récupérer toutes les commandes avec filtres (protégée)
router.get('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const filters = {
            search: req.query.search,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            status: req.query.status
        };
        const orders = await orderModel.findAll(filters);
        res.status(200).json(orders);
    } catch (error) {
        console.error("Erreur (GET /orders):", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

// GET /:id : Récupérer une seule commande avec ses détails (protégée)
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderModel.findById(id);
        if (!order) {
            return res.status(404).json({ message: 'Commande non trouvée.' });
        }
        // Vérification d'accès supplémentaire (seul admin ou livreur assigné)
        if (req.user.role !== 'admin' && order.deliveryman_id !== req.user.id) {
            return res.status(403).json({ message: 'Accès refusé.' });
        }
        res.status(200).json(order);
    } catch (error) {
        console.error("Erreur (GET /orders/:id):", error);
        res.status(500).json({ message: 'Erreur lors de la récupération de la commande.' });
    }
});

// PUT /:id : Modifier une commande (protégée Admin)
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updated_by = req.user.id;
        const { ...orderData } = req.body;

        // Le modèle gère la restriction d'édition si la commande est déjà récupérée.
        const validOrderData = {};
        for (const key in orderData) {
            if (key !== 'updated_by' && orderData[key] !== undefined) {
                // Pour la modification Hub, nous traitons l'absence de valeur comme null
                validOrderData[key] = (orderData[key] === '' ? null : orderData[key]);
            }
        }

        await orderModel.update(id, validOrderData, updated_by);
        res.status(200).json({ message: 'Commande modifiée avec succès.' });
    } catch (error) {
        console.error("Erreur (PUT /orders/:id):", error);
        res.status(500).json({ message: error.message || 'Erreur lors de la modification de la commande.' });
    }
});

// DELETE /:id : Supprimer une commande (protégée Admin)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await orderModel.remove(id);
        if (result.affectedRows === 0) {
             return res.status(404).json({ message: 'Commande non trouvée.' });
        }
        res.status(200).json({ message: 'Commande supprimée avec succès.' });
    } catch (error) {
        console.error("Erreur (DELETE /orders/:id):", error);
        res.status(500).json({ message: 'Erreur lors de la suppression de la commande.' });
    }
});

// PUT /:id/status : Changer le statut d'une commande (protégée)
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        // MODIFICATION : Ajout de 'follow_up_at'
        const { status, amount_received, payment_status, follow_up_at } = req.body;
        const userId = req.user.id;

        // MODIFICATION : Passer 'follow_up_at' au modèle
        await orderModel.updateStatus(id, status, amount_received, payment_status, userId, follow_up_at);

        res.status(200).json({ message: `Statut mis à jour en '${status}'.` });
    } catch (error) {
        console.error("Erreur (PUT /orders/:id/status):", error);
        res.status(500).json({ message: error.message || 'Erreur lors de la mise à jour du statut.' });
    }
});

// PUT /:id/assign : Assigner un livreur (protégée Admin)
router.put('/:id/assign', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { deliverymanId } = req.body;
        const userId = req.user.id;

        if (!deliverymanId) {
            return res.status(400).json({ message: 'ID du livreur manquant.' });
        }

        await orderModel.assignDeliveryman(id, deliverymanId, userId);
        res.status(200).json({ message: 'Livreur assigné avec succès.' });
    } catch (error) {
        console.error("Erreur (PUT /orders/:id/assign):", error);
        res.status(500).json({ message: error.message || 'Erreur lors de l\'assignation du livreur.' });
    }
});

module.exports = router;