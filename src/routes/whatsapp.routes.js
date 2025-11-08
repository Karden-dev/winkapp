// src/routes/whatsapp.routes.js

const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');

// --- DÉBUT DU BLOC DE TEST ---
// Ajoutez cette nouvelle route GET pour tester si la route est accessible
router.get('/webhook', (req, res) => {
    // Ce message DOIT apparaître dans votre log principal (stdout)
    console.log("TEST GET REÇU SUR LA ROUTE WEBHOOK"); 
    res.status(200).send('Test de route OK ! Le serveur Node.js répond.');
});
// --- FIN DU BLOC DE TEST ---


// Point d'entrée pour le Webhook Wasender.
// URL: /api/whatsapp/webhook
router.post('/webhook', whatsappController.handleWebhook);

module.exports = router;