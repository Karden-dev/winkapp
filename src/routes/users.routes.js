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
        const { phone_number, pin, name, role } = req.body;
        await userModel.create(phone_number, pin, name, role);
        res.status(201).json({ message: "Utilisateur créé." });
    } catch (err) { res.status(500).json({ message: "Erreur serveur." }); }
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
// Changement : On utilise une seule route pour le statut
router.put('/:id/status', async (req, res) => {
    try {
        await userModel.updateStatus(req.params.id, req.body.status);
        res.json({ message: "Statut mis à jour." });
    } catch (err) { res.status(500).json({ message: "Erreur serveur." }); }
});
router.post('/login', async (req, res) => { /* ... */ });

module.exports = router;