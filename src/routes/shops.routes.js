// src/routes/shops.routes.js
const express = require('express');
const router = express.Router();
const shopModel = require('../models/shop.model');

// POST / : Créer une nouvelle boutique
router.post('/', async (req, res) => {
    try {
        const shopData = {
            name: req.body.name,
            phone_number: req.body.phone_number,
            created_by: req.body.created_by,
            bill_packaging: !!req.body.bill_packaging,
            bill_storage: !!req.body.bill_storage,
            packaging_price: req.body.packaging_price || 50.00,
            storage_price: req.body.storage_price || 100.00
        };
        const result = await shopModel.create(shopData);
        res.status(201).json({ message: 'Boutique créée avec succès.', shopId: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la création de la boutique.' });
    }
});

// GET / : Récupérer les boutiques avec filtres et recherche
router.get('/', async (req, res) => {
    try {
        const filters = {
            status: req.query.status || null,
            search: req.query.search || null
        };
        const shops = await shopModel.findAll(filters);
        res.status(200).json(shops);
    } catch (error) {
        console.error("Erreur (GET /shops):", error);
        res.status(500).json({ message: 'Erreur lors de la récupération des boutiques.' });
    }
});

// GET /stats : Récupérer les statistiques
router.get('/stats', async (req, res) => {
    try {
        const stats = await shopModel.countAll();
        res.status(200).json(stats);
    } catch (error) {
        console.error("Erreur (GET /shops/stats):", error);
        res.status(500).json({ message: 'Erreur lors de la récupération des statistiques.' });
    }
});

// GET /:id : Récupérer une boutique par ID
router.get('/:id', async (req, res) => {
    try {
        const shop = await shopModel.findById(req.params.id);
        if (!shop) { return res.status(404).json({ message: 'Boutique non trouvée.' }); }
        res.status(200).json(shop);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la récupération de la boutique.' });
    }
});

// PUT /:id : Mettre à jour une boutique
router.put('/:id', async (req, res) => {
    try {
        const shopData = {
            name: req.body.name,
            phone_number: req.body.phone_number,
            bill_packaging: !!req.body.bill_packaging,
            bill_storage: !!req.body.bill_storage,
            packaging_price: req.body.packaging_price,
            storage_price: req.body.storage_price
        };
        const result = await shopModel.update(req.params.id, shopData);
        if (result.affectedRows === 0) { return res.status(404).json({ message: 'Boutique non trouvée.' }); }
        res.status(200).json({ message: 'Boutique mise à jour avec succès.' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors de la mise à jour de la boutique.' });
    }
});

// PUT /:id/status : Changer le statut d'une boutique
router.put('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const result = await shopModel.updateStatus(req.params.id, status);
        if (result.affectedRows === 0) { return res.status(404).json({ message: 'Boutique non trouvée.' }); }
        res.status(200).json({ message: 'Statut mis à jour.' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors du changement de statut.' });
    }
});

module.exports = router;