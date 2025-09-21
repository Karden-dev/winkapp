// src/routes/orders.routes.js
const express = require('express');
const router = express.Router();
const orderModel = require('../models/order.model');

// POST / : Créer une nouvelle commande
router.post('/', async (req, res) => {
    try {
        const { shop_id, customer_name, customer_phone, delivery_location, article_amount, delivery_fee, expedition_fee, created_by, items } = req.body;
        
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

        await orderModel.create(orderData); 

        res.status(201).json({ message: 'Commande créée avec succès.' });
    } catch (error) {
        console.error("Erreur (POST /orders):", error);
        res.status(500).json({ message: 'Erreur lors de la création de la commande.' });
    }
});

// GET / : Récupérer toutes les commandes avec filtres
router.get('/', async (req, res) => {
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

// GET /:id : Récupérer une seule commande avec ses détails (articles et historique)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderModel.findById(id);
        if (!order) {
            return res.status(404).json({ message: 'Commande non trouvée.' });
        }
        res.status(200).json(order);
    } catch (error) {
        console.error("Erreur (GET /orders/:id):", error);
        res.status(500).json({ message: 'Erreur lors de la récupération de la commande.' });
    }
});

// PUT /:id : Modifier une commande
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { updated_by, ...orderData } = req.body;
        
        const validOrderData = {};
        for (const key in orderData) {
            if (orderData[key] !== undefined) {
                validOrderData[key] = (orderData[key] === '' ? null : orderData[key]);
            }
        }
        
        await orderModel.update(id, validOrderData, updated_by);
        res.status(200).json({ message: 'Commande modifiée avec succès.' });
    } catch (error) {
        console.error("Erreur (PUT /orders/:id):", error);
        res.status(500).json({ message: 'Erreur lors de la modification de la commande.' });
    }
});

// DELETE /:id : Supprimer une commande
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await orderModel.remove(id);
        res.status(200).json({ message: 'Commande supprimée avec succès.' });
    } catch (error) {
        console.error("Erreur (DELETE /orders/:id):", error);
        res.status(500).json({ message: 'Erreur lors de la suppression de la commande.' });
    }
});

// PUT /:id/status : Changer le statut d'une commande
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, amount_received, payment_status, userId } = req.body;
        await orderModel.updateStatus(id, status, amount_received, payment_status, userId);
        res.status(200).json({ message: 'Statut mis à jour.' });
    } catch (error) {
        console.error("Erreur (PUT /orders/:id/status):", error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour du statut.' });
    }
});

// PUT /:id/assign : Assigner un livreur
router.put('/:id/assign', async (req, res) => {
    try {
        const { id } = req.params;
        const { deliverymanId, userId } = req.body;
        
        await orderModel.assignDeliveryman(id, deliverymanId, userId);
        res.status(200).json({ message: 'Livreur assigné.' });
    } catch (error) {
        console.error("Erreur (PUT /orders/:id/assign):", error);
        res.status(500).json({ message: 'Erreur lors de l\'assignation du livreur.' });
    }
});

module.exports = router;