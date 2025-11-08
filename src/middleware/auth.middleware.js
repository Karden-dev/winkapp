// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');

/**
 * Vérifie la validité du token JWT fourni dans l'en-tête Authorization.
 * Si valide, attache les informations décodées (payload) à req.user.
 */
const verifyToken = (req, res, next) => {
    // Récupère l'en-tête d'autorisation
    const authHeader = req.headers.authorization;

    // Vérifie si l'en-tête existe
    if (!authHeader) {
        // 403 Forbidden car aucun identifiant n'est fourni
        return res.status(403).json({ message: 'Aucun token fourni.' });
    }

    // Sépare "Bearer" du token lui-même
    const tokenParts = authHeader.split(' ');
    // Vérifie le format "Bearer <token>"
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
         // 403 Forbidden car le format n'est pas bon
         return res.status(403).json({ message: 'Format de token invalide (Bearer token attendu).' });
    }
    const token = tokenParts[1];

    // Vérifie si le token est présent après "Bearer"
    if (!token) {
         // 403 Forbidden
         return res.status(403).json({ message: 'Token manquant après Bearer.' });
    }

    // Log pour le débogage (peut être retiré en production)
    console.log('Jeton extrait et reçu :', token);
    console.log('Clé secrète utilisée pour la vérification:', process.env.JWT_SECRET);

    try {
        // Vérifie le token avec la clé secrète (doit être dans .env)
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Stocke les informations utilisateur (payload du token) dans l'objet req
        req.user = decoded; // Contient { id: ..., role: ... }
        // Passe au prochain middleware ou à la fonction de la route
        next();
    } catch (error) {
        // Gère les erreurs de vérification (token expiré, signature invalide, etc.)
        console.error('Erreur de vérification du jeton:', error.message);
        // 401 Unauthorized car le token fourni est invalide ou expiré
        return res.status(401).json({ message: 'Token invalide ou expiré.' });
    }
};

/**
 * Middleware pour vérifier si l'utilisateur connecté est un administrateur.
 * Doit être utilisé APRÈS verifyToken.
 */
const isAdmin = (req, res, next) => {
    // req.user est défini par verifyToken
    if (req.user && req.user.role === 'admin') {
        next(); // Autorisé, passe à la suite
    } else {
        // 403 Forbidden car l'utilisateur est authentifié mais n'a pas le bon rôle
        return res.status(403).json({ message: 'Accès refusé. Administrateurs uniquement.' });
    }
};

/**
 * Middleware pour vérifier si l'utilisateur connecté est un livreur.
 * Doit être utilisé APRÈS verifyToken.
 */
const isRider = (req, res, next) => {
    // req.user est défini par verifyToken
    if (req.user && req.user.role === 'livreur') {
        next(); // Autorisé, passe à la suite
    } else {
        // 403 Forbidden car l'utilisateur est authentifié mais n'a pas le bon rôle
        res.status(403).json({ message: 'Accès refusé. Rôle de livreur requis.' });
    }
};

// Exporte les fonctions pour les utiliser dans d'autres fichiers (routes)
module.exports = {
    verifyToken,
    isAdmin,
    isRider
};