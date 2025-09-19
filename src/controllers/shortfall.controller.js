// src/controllers/shortfall.controller.js
const shortfallModel = require('../models/shortfall.model');

const getAllShortfalls = async (req, res) => {
    try {
        const shortfalls = await shortfallModel.findAll(req.query);
        res.json(shortfalls);
    } catch (error) {
        console.error("Erreur (getAllShortfalls):", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
};

module.exports = { getAllShortfalls };