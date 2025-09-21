// src/controllers/auth.controller.js
const userModel = require('../models/user.model');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    const { phoneNumber, pin } = req.body;

    if (!phoneNumber || !pin) {
        return res.status(400).json({ message: 'Le numéro de téléphone et le code PIN sont requis.' });
    }

    try {
        const user = await userModel.findByPhoneNumber(phoneNumber);

        if (!user) {
            return res.status(401).json({ message: 'Numéro de téléphone non trouvé.' });
        }

        if (user.pin !== pin) {
            return res.status(401).json({ message: 'Code PIN incorrect.' });
        }
        
        console.log('Connexion réussie. Tentative de génération de jeton avec la clé :', process.env.JWT_SECRET);
        
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({
            message: 'Connexion réussie',
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                phoneNumber: user.phone_number,
                token: token
            }
        });

    } catch (error) {
        console.error("Erreur lors de la connexion :", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
};