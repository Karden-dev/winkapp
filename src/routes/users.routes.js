// src/routes/users.routes.js
const express = require('express');
const router = express.Router();
const userModel = require('../models/user.model');

router.get('/', async (req, res) => {
    try {
        const filters = { search: req.query.search || null };
        const users = await userModel.findAll(filters);
        res.json(users);
    } catch (err) { res.status(500).json({ message: "Erreur serveur." }); }
});
router.get('/:id', async (req, res) => {
    try {
        const user = await userModel.findById(req.params.id);
        if (user) res.json(user);
        else res.status(404).json({ message: "Utilisateur non trouvé." });
    } catch (err) { res.status(500).json({ message: "Erreur serveur." }); }
});
router.post('/', async (req, res) => {
    try {
        // --- CORRECTION : Récupérer et nettoyer les valeurs des champs ---
        const name = req.body.name ? String(req.body.name).trim() : '';
        const phone_number = req.body.phone_number ? String(req.body.phone_number).trim() : '';
        const pin = req.body.pin ? String(req.body.pin).trim() : '';
        const role = req.body.role ? String(req.body.role).trim() : '';
        // -------------------------------------------------------------

        // --- Validation des champs requis ---
        if (!phone_number || !pin || !name || !role) {
            return res.status(400).json({ message: "Les champs 'name', 'phone_number', 'pin' et 'role' sont requis." });
        }
        if (pin.length !== 4) {
             return res.status(400).json({ message: "Le code PIN doit comporter 4 chiffres." });
        }

        // Vérification de l'unicité du numéro de téléphone
        const existingUser = await userModel.findByPhoneNumber(phone_number);
        if (existingUser) {
            return res.status(409).json({ message: "Un utilisateur avec ce numéro de téléphone existe déjà." });
        }

        await userModel.create(phone_number, pin, name, role);
        res.status(201).json({ message: "Utilisateur créé." });
    } catch (err) {
        console.error("Erreur lors de la création d'utilisateur (détails non gérés):", err);
        return res.status(400).json({ message: "Erreur de création: Données invalides ou champs requis manquants." });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { name, phone_number, role, status } = req.body;
        await userModel.update(req.params.id, name, phone_number, role, status);
        res.json({ message: "Utilisateur mis à jour." });
    } catch (err) { res.status(500).json({ message: "Erreur serveur." }); }
});
router.put('/:id/pin', async (req, res) => {
    try {
        await userModel.updatePin(req.params.id, req.body.pin);
        res.json({ message: "PIN mis à jour." });
    } catch (err) { res.status(500).json({ message: "Erreur serveur." }); }
});
router.put('/:id/status', async (req, res) => {
    try {
        await userModel.updateStatus(req.params.id, req.body.status);
        res.json({ message: "Statut mis à jour." });
    } catch (err) { res.status(500).json({ message: "Erreur serveur." }); }
});
router.post('/login', async (req, res) => { /* ... */ });

module.exports = router;