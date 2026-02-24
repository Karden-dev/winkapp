// public/js/auth.js
// Version 2.1 - Correction de getToken pour lire depuis l'objet user

/**
 * Ce module gère l'authentification côté client.
 * Il vérifie si un utilisateur est connecté, met à jour l'interface utilisateur,
 * gère la déconnexion et fournit des informations sur l'utilisateur et son token.
 */
const AuthManager = (() => {
    let currentUser = null;
    // Plus besoin de stocker le token séparément en mémoire ici

    /**
     * Tente de récupérer les informations de l'utilisateur
     * depuis localStorage ou sessionStorage. Met à jour currentUser.
     */
    const loadUser = () => {
        const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
        currentUser = null; // Réinitialiser avant de charger

        if (userJson) {
            try {
                currentUser = JSON.parse(userJson);
                // Vérifier si l'objet chargé contient bien un token
                if (!currentUser || typeof currentUser.token !== 'string' || currentUser.token === '') {
                    console.warn("Données utilisateur chargées mais token invalide ou manquant. Déconnexion.", currentUser);
                    currentUser = null; // Considérer comme non connecté si token invalide
                    logout(); // Déconnecter si le token est malformé ou absent dans l'objet user
                }
            } catch (e) {
                console.error("Erreur de parsing des données utilisateur. Déconnexion.", e);
                // Si les données sont corrompues, on déconnecte proprement.
                logout(); // Appelle la fonction logout interne
            }
        }
    };

    /**
     * Déconnecte l'utilisateur en supprimant ses informations de stockage et en le redirigeant.
     */
    const logout = () => {
        localStorage.removeItem('user');
        sessionStorage.removeItem('user');
        // S'assurer que 'token' n'est plus stocké (s'il l'était par erreur)
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        currentUser = null;
        // Redirection vers la page de connexion
        window.location.href = 'index.html';
    };

    /**
     * Vérifie si l'utilisateur est connecté et gère les redirections.
     * Met également à jour l'interface utilisateur avec les informations de l'utilisateur.
     */
    const init = () => {
        loadUser(); // Charge currentUser depuis le stockage

        const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';

        if (currentUser) {
            // Utilisateur connecté trouvé dans le stockage
            // Redirection basée sur le rôle si l'utilisateur est sur la page de connexion
            if (isLoginPage) {
                if (currentUser.role === 'livreur') {
                    window.location.href = 'rider-today.html';
                } else {
                    // Pour admin ou manager (ou autre rôle non livreur)
                    window.location.href = 'dashboard.html';
                }
                return; // Empêche l'exécution du reste si redirection
            }

            // Mettre à jour le nom de l'utilisateur dans l'en-tête (si l'élément existe)
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = currentUser.name || 'Utilisateur';
            }

            // Configurer le bouton de déconnexion (s'il existe)
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                // S'assurer qu'on n'ajoute pas le listener plusieurs fois
                logoutBtn.removeEventListener('click', handleLogoutClick); // Supprimer l'ancien listener s'il existe
                logoutBtn.addEventListener('click', handleLogoutClick); // Ajouter le nouveau
            }

            // Déclencher un événement pour indiquer que AuthManager est prêt (utile pour les scripts dépendants)
            console.log("AuthManager prêt.");
            document.dispatchEvent(new CustomEvent('authManagerReady'));


        } else {
            // Si l'utilisateur n'est pas trouvé dans le stockage
            // et qu'il n'est pas sur une page publique (login), rediriger vers la connexion.
            if (!isLoginPage) {
                console.log("Utilisateur non trouvé ou token invalide, redirection vers login.");
                // Pas besoin d'appeler logout() ici car currentUser est déjà null et le stockage est potentiellement vide ou corrompu
                window.location.href = 'index.html';
            }
            // Si on est déjà sur la page de login, on ne fait rien.
        }
    };

    // Handler séparé pour le bouton logout pour pouvoir le supprimer
    const handleLogoutClick = (e) => {
        e.preventDefault();
        logout(); // Appelle la fonction logout interne
    };

    /**
     * Renvoie l'objet utilisateur actuellement connecté. Recharge si nécessaire.
     * @returns {object|null} L'objet utilisateur ou null si personne n'est connecté.
     */
    const getUser = () => {
        // Toujours recharger depuis le stockage pour avoir la version la plus fraîche ?
        // Ou utiliser la variable 'currentUser' chargée par init() ?
        // Pour l'instant, on utilise la variable 'currentUser' chargée par init ou un rechargement manuel.
        if (!currentUser) {
            loadUser(); // Tente de recharger au cas où il aurait été effacé par erreur
        }
        return currentUser;
    };

    /**
     * Renvoie l'ID de l'utilisateur actuellement connecté.
     * @returns {number|null} L'ID de l'utilisateur ou null.
     */
    const getUserId = () => {
        const user = getUser(); // Utilise la fonction getUser() interne
        return user ? user.id : null;
    };

    /**
     * *** CORRECTION APPLIQUÉE ICI ***
     * Renvoie le token d'authentification de l'utilisateur. Essentiel pour les requêtes API.
     * Charge l'utilisateur si nécessaire avant d'extraire le token.
     * @returns {string|null} Le token JWT ou null si l'utilisateur n'est pas connecté ou si le token manque.
     */
    const getToken = () => {
        const user = getUser(); // Récupère l'objet utilisateur complet (qui contient le token)
        // Vérifie si l'utilisateur existe ET s'il a une propriété 'token' non vide
        if (user && typeof user.token === 'string' && user.token.length > 0) {
            return user.token; // Retourne la chaîne du token
        }
        // Avertissement si le token n'est pas trouvé
        console.warn("AuthManager.getToken(): Utilisateur non trouvé ou token manquant/invalide dans l'objet utilisateur stocké.");
        return null; // Retourne null si pas d'utilisateur ou pas de token valide dans l'objet
    };

    // Exposer les fonctions publiques
    return {
        init,
        getUser,
        getUserId,
        getToken, // Fonction corrigée
        logout    // Fonction logout exposée
    };
})();

// Initialiser le gestionnaire d'authentification dès que le DOM est prêt.
// Utilisation plus robuste pour s'assurer que init() est appelé une seule fois et au bon moment.
function initializeAuthManager() {
    console.log("DOMContentLoaded or readyState complete, initialisation de AuthManager...");
    AuthManager.init();
}

if (document.readyState === 'loading') {
    // Le DOM n'est pas encore prêt
    document.addEventListener('DOMContentLoaded', initializeAuthManager);
} else {
    // Le DOM est déjà prêt
    initializeAuthManager();
}