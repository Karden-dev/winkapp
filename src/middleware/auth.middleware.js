const jwt = require('jsonwebtoken'); // Assurez-vous d'installer jsonwebtoken si ce n'est pas déjà fait

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(403).json({ message: 'Aucun token fourni.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Utilisez une clé secrète dans votre fichier .env
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide.' });
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