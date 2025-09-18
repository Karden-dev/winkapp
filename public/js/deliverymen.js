// js/deliverymen.js
document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTES ET VARIABLES ---
    const API_BASE_URL = 'http://localhost:3000';
    const sidebar = document.getElementById('sidebar');
    const tableBody = document.getElementById('deliverymenTableBody');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const searchInput = document.getElementById('searchInput');
    const filterBtn = document.getElementById('filterBtn');

    // --- FONCTIONS ---

    /**
     * Retourne la date du jour au format AAAA-MM-JJ.
     */
    const getTodayDate = () => new Date().toISOString().split('T')[0];

    /**
     * Fonction Debounce : retarde l'exécution d'une fonction.
     * @param {Function} func - La fonction à exécuter après le délai.
     * @param {number} delay - Le délai d'attente en millisecondes.
     * @returns {Function} La nouvelle fonction "debounced".
     */
    const debounce = (func, delay = 400) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    /**
     * Récupère les données depuis l'API et met à jour l'interface.
     */
    const updateData = async () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const searchQuery = searchInput.value;
        
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (searchQuery) params.append('search', searchQuery);
        
        try {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-5"><div class="spinner-border" role="status"><span class="visually-hidden">Chargement...</span></div></td></tr>';

            const [statsRes, perfRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/deliverymen/stats?${params.toString()}`),
                axios.get(`${API_BASE_URL}/deliverymen/performance?${params.toString()}`)
            ]);

            // Mise à jour des cartes de statistiques
            const stats = statsRes.data;
            document.getElementById('total-deliverymen').textContent = stats.total;
            document.getElementById('working-deliverymen').textContent = stats.working;
            document.getElementById('absent-deliverymen').textContent = stats.absent;
            document.getElementById('availability-rate').textContent = `${parseFloat(stats.availability_rate).toFixed(0)}%`;
            document.getElementById('received-courses').textContent = stats.received;
            document.getElementById('inprogress-courses').textContent = stats.in_progress;
            document.getElementById('delivered-courses').textContent = stats.delivered;
            document.getElementById('canceled-courses').textContent = stats.cancelled;

            // Mise à jour du tableau de performance
            const deliverymen = perfRes.data;
            tableBody.innerHTML = '';
            if (deliverymen.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4">Aucun livreur trouvé pour les filtres sélectionnés.</td></tr>';
                return;
            }
            deliverymen.forEach((livreur, index) => {
                const row = document.createElement('tr');
                const revenue = parseFloat(livreur.total_revenue || 0).toLocaleString('fr-FR');
                let distinction = '';
                if (index === 0) distinction = '<span class="distinction"><i class="bi bi-trophy-fill distinction-icon gold"></i></span>';
                else if (index === 1) distinction = '<span class="distinction"><i class="bi bi-trophy-fill distinction-icon silver"></i></span>';
                else if (index === 2) distinction = '<span class="distinction"><i class="bi bi-trophy-fill distinction-icon bronze"></i></span>';
                else distinction = `<span class="distinction text-muted">#${index + 1}</span>`;
                
                row.innerHTML = `
                    <td>${distinction}${livreur.name}</td>
                    <td>${livreur.received_orders || 0}</td>
                    <td class="text-warning fw-bold">${livreur.in_progress_orders || 0}</td>
                    <td class="text-danger fw-bold">${livreur.cancelled_orders || 0}</td>
                    <td class="text-success fw-bold">${livreur.delivered_orders || 0}</td>
                    <td>${revenue} FCFA</td>`;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error("Erreur lors de la mise à jour des données:", error);
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger p-4">Erreur lors du chargement des données.</td></tr>';
        }
    };

    // --- GESTION DES ÉVÉNEMENTS ---

    // Le bouton "Filtrer" lance la mise à jour immédiatement.
    filterBtn.addEventListener('click', updateData);

    // La barre de recherche lance la mise à jour après une pause de 400ms.
    searchInput.addEventListener('input', debounce(updateData));

    // --- INITIALISATION DE LA PAGE ---

    
    // Logique du menu et de la déconnexion
    document.getElementById('sidebar-toggler').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        document.getElementById('main-content').classList.toggle('expanded');
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => { window.location.href = 'index.html'; });

    // Initialisation des filtres et premier chargement des données
    startDateInput.value = getTodayDate();
    endDateInput.value = getTodayDate();
    updateData();
});