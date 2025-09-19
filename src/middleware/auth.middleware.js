const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Si l'en-tête est manquant ou n'a pas le bon format
    return res.status(403).json({ message: 'Accès refusé. Token manquant ou mal formé.' });
  }

  // Extrait le token en supprimant "Bearer "
  const token = authHeader.split(' ')[1];

  try {
    // Vérifie uniquement le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Ajoute les informations de l'utilisateur à la requête
    next(); // Passe au prochain middleware ou à la route
  } catch (error) {
    // Si la vérification échoue (token expiré, invalide, etc.)
    return res.status(401).json({ message: 'Token invalide ou expiré.' });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Accès refusé. Administrateurs uniquement.' });
  }
};

module.exports = {
  verifyToken,
  isAdmin,
};