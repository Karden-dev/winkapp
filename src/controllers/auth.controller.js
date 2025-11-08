// src/controllers/auth.controller.js
const userModel = require('../models/user.model'); //
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    const { phoneNumber, pin } = req.body;

    if (!phoneNumber || !pin) {
        return res.status(400).json({ message: 'Le numéro de téléphone et le code PIN sont requis.' });
    }

    try {
        // Recherche l'utilisateur par numéro de téléphone dans le modèle userModel
        const user = await userModel.findByPhoneNumber(phoneNumber); //

        if (!user) {
            return res.status(401).json({ message: 'Numéro de téléphone non trouvé.' });
        }

        // Vérifie si le PIN fourni correspond à celui stocké
        if (user.pin !== pin) { //
            return res.status(401).json({ message: 'Code PIN incorrect.' });
        }

        console.log('Connexion réussie. Tentative de génération de jeton avec la clé :', process.env.JWT_SECRET);

        // Génère un token JWT contenant l'ID et le rôle de l'utilisateur
        const token = jwt.sign(
            { id: user.id, role: user.role }, // Payload du token
            process.env.JWT_SECRET, // Clé secrète (doit être définie dans les variables d'environnement)
            { expiresIn: '1h' } // Durée de validité du token
        );

        // Renvoie une réponse de succès avec les informations utilisateur et le token
        res.status(200).json({
            message: 'Connexion réussie',
            user: { // Informations renvoyées au client
                id: user.id,
                name: user.name,
                role: user.role,
                phoneNumber: user.phone_number,
                token: token // Inclut le token généré
            }
        });

    } catch (error) {
        // Gère les erreurs potentielles (ex: problème base de données)
        console.error("Erreur lors de la connexion :", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
};