// public/js/rider.js
// Version adaptée pour la structure multi-pages
// VERSION MISE À JOUR (V6) - Correction du filtre 'relaunch'

document.addEventListener('DOMContentLoaded', () => {
    // --- Références DOM spécifiques à la page (si nécessaire) ---
    const ordersContainer = document.getElementById('ordersContainer');
    const searchInput = document.getElementById('searchInput');
    const dateFilters = document.getElementById('dateFilters'); // Conteneur des filtres
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const filterDateBtn = document.getElementById('filterDateBtn');

    // --- Variables spécifiques à la page ---
    let currentPageName = ''; // Sera déterminé au chargement

    // --- Fonctions spécifiques à la page ---

    /**
     * Détermine sur quelle page nous sommes basé sur le nom de fichier.
     * @returns {string} Le nom de la page ('today', 'myrides', 'relaunch', 'returns', ou 'unknown').
     */
    const getCurrentPageName = () => {
        const path = window.location.pathname.split('/').pop();
        if (path.includes('rider-today.html')) return 'today';
        if (path.includes('rider-myrides.html')) return 'myrides';
        if (path.includes('rider-relaunch.html')) return 'relaunch';
        if (path.includes('rider-returns.html')) return 'returns';
        return 'unknown';
    };

    /**
     * Récupère les commandes spécifiques à la page actuelle.
     * C'est la fonction appelée par rider-common.js lors des rafraîchissements (WebSocket, actions).
     */
    const fetchOrdersForCurrentPage = async () => {
        // Assure que RiderCommon est chargé
        if (typeof RiderCommon === 'undefined') {
            console.error("RiderCommon n'est pas chargé. Impossible de fetch.");
            return;
        }

        const headers = RiderCommon.getAuthHeader();
        if (!headers) return; // Erreur déjà gérée dans getAuthHeader

        const params = {};
        const searchQuery = searchInput ? searchInput.value : '';
        const today = moment().format('YYYY-MM-DD');

        // Définir les paramètres API en fonction de la page
        switch (currentPageName) {
            case 'today':
                // **CORRECTION**: Ne plus envoyer de filtre de statut spécifique
                // pour récupérer TOUTES les commandes du jour assignées au livreur
                params.status = 'today'; // <- MODIFIÉ ICI (Utilise le filtre 'today' du backend)
                params.startDate = today;
                params.endDate = today;
                break;
            case 'myrides':
                params.status = 'all';
                if (startDateFilter?.value) params.startDate = startDateFilter.value;
                if (endDateFilter?.value) params.endDate = endDateFilter.value;
                break;
            case 'relaunch':
                // --- CORRECTION BUG "PAGE VIDE" (V6) ---
                params.status = 'relaunch'; // <--- MODIFIÉ (anciennement 'reported')
                // --- FIN CORRECTION ---
                
                // Utiliser les filtres de date s'ils existent, sinon défaut
                const sDateRel = startDateFilter?.value;
                const eDateRel = endDateFilter?.value;
                if (sDateRel && eDateRel) {
                    params.startDate = sDateRel;
                    params.endDate = eDateRel;
                } else { // Par défaut, 7 derniers jours (ou laisser vide pour que le backend gère ?)
                    // On laisse vide pour que le backend utilise sa logique de date (created_at OR follow_up_at)
                    // params.startDate = moment().subtract(7, 'days').format('YYYY-MM-DD');
                    // params.endDate = today;
                }
                break;
            case 'returns':
                params.status = ['return_declared', 'returned']; // Simplifié
                const sDateRet = startDateFilter?.value;
                const eDateRet = endDateFilter?.value;
                if (sDateRet && eDateRet) {
                    params.startDate = sDateRet;
                    params.endDate = eDateRet;
                } else { // Par défaut, 30 derniers jours
                    params.startDate = moment().subtract(30, 'days').format('YYYY-MM-DD');
                    params.endDate = today;
                }
                break;
            default:
                console.error("Page inconnue, impossible de déterminer les paramètres de fetch.");
                return;
        }

        if (searchQuery) {
            params.search = searchQuery;
        }
        params.include_unread_count = true; // Toujours demander le compte pour les badges

        if (!ordersContainer) return;

        // Afficher indicateur de chargement SEULEMENT si le conteneur est vide (premier chargement)
        if (!ordersContainer.querySelector('.order-card')) {
            ordersContainer.innerHTML = `<p class="text-center text-muted mt-5"><div class="spinner-border spinner-border-sm"></div> Chargement...</p>`;
        }

        try {
            const response = await axios.get(`${RiderCommon.API_BASE_URL}/rider/orders`, { params, headers });
            
            // --- AJOUT (pour V6 de rider-common) ---
            // Stocker les commandes récupérées pour que rider-common puisse y accéder
            window.fetchOrdersForCurrentPage.currentOrders = response.data || [];
            // --- FIN AJOUT ---
            
            RiderCommon.renderOrders(response.data || [], ordersContainer); // Appel à la fonction commune de rendu
            RiderCommon.updateSidebarCounters(); // Mettre à jour les compteurs après chaque fetch réussi

        } catch (error) {
            console.error(`Erreur récupération commandes pour ${currentPageName}:`, error);
            if(ordersContainer) ordersContainer.innerHTML = `<p class="text-center text-danger mt-5">Erreur chargement. Vérifiez connexion.</p>`;
            RiderCommon.handleAuthError(error); // Gérer les erreurs communes
        }
    };

    // Exposer la fonction fetch pour qu'elle soit accessible par rider-common.js
    window.fetchOrdersForCurrentPage = fetchOrdersForCurrentPage;
    window.fetchOrdersForCurrentPage.currentOrders = []; // Initialiser le cache des commandes

    /**
     * Initialise les listeners spécifiques à la page.
     */
    const initializePageSpecificListeners = () => {
        // Recherche (présente sur toutes les pages)
        searchInput?.addEventListener('input', RiderCommon.debounce(fetchOrdersForCurrentPage));

        // Filtres de date (uniquement sur 'myrides', 'relaunch' et 'returns')
        // **MISE À JOUR**: Ajout de 'relaunch'
        if (['myrides', 'relaunch', 'returns'].includes(currentPageName)) {
            filterDateBtn?.addEventListener('click', fetchOrdersForCurrentPage);
            // Optionnel : écouter aussi les 'change' sur les inputs de date
            startDateFilter?.addEventListener('change', fetchOrdersForCurrentPage);
            endDateFilter?.addEventListener('change', fetchOrdersForCurrentPage);

            // Initialiser les dates par défaut si vides, selon la page
            if (currentPageName === 'returns' && (!startDateFilter.value || !endDateFilter.value)) {
                 startDateFilter.value = moment().subtract(30, 'days').format('YYYY-MM-DD');
                 endDateFilter.value = moment().format('YYYY-MM-DD');
            } else if (currentPageName === 'relaunch' && (!startDateFilter.value || !endDateFilter.value)) {
                 // Pas de date par défaut pour 'relaunch' pour voir tous les futurs
                 // startDateFilter.value = moment().subtract(7, 'days').format('YYYY-MM-DD');
                 // endDateFilter.value = today;
            }
             // Pas de date par défaut pour 'myrides', laisse vide ou pré-rempli par le serveur si besoin
        }
    };

    // --- INITIALISATION ---
    const initializeApp = () => {
        currentPageName = getCurrentPageName();
        console.log(`Initialisation de la page Rider : ${currentPageName}`);

        if (typeof RiderCommon !== 'undefined' && typeof RiderCommon.initializeRiderApp === 'function') {
            RiderCommon.initializeRiderApp(); // Lance Auth, WebSocket, Listeners communs
            initializePageSpecificListeners(); // Ajoute les listeners spécifiques à CETTE page
            fetchOrdersForCurrentPage(); // Lance le premier chargement des données pour CETTE page
        } else {
            console.error("RiderCommon n'est pas défini. Assurez-vous que rider-common.js est chargé AVANT rider.js.");
            alert("Erreur critique lors de l'initialisation de l'application.");
        }
    };

    // Assurer que AuthManager est prêt
    if (typeof AuthManager !== 'undefined') {
         document.addEventListener('authManagerReady', initializeApp);
         // Fallback si l'event est manqué
         if ((document.readyState === 'complete' || document.readyState === 'interactive') && typeof AuthManager.getUser === 'function' && AuthManager.getUser()) {
             setTimeout(() => { // Petit délai pour laisser rider-common s'initialiser
                 if (currentPageName === '') { // Vérifie si l'initialisation a déjà eu lieu
                    initializeApp();
                 }
             }, 50);
         }
     } else {
          console.error("AuthManager n'est pas défini lors de l'initialisation de rider.js.");
     }
});