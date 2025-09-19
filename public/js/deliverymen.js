// js/deliverymen.js
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:3000';

    // --- Configuration d'Axios pour l'Authentification ---
    const token = localStorage.getItem('winkToken') || sessionStorage.getItem('winkToken');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    const axiosInstance = axios.create({
        baseURL: API_BASE_URL,
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const currentUser = JSON.parse(localStorage.getItem('winkUser') || sessionStorage.getItem('winkUser'));

    // --- CONSTANTES ET VARIABLES ---
    const tableBody = document.getElementById('deliverymenTableBody');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const searchInput = document.getElementById('searchInput');
    const filterBtn = document.getElementById('filterBtn');

    // --- FONCTIONS ---
    const getTodayDate = () => new Date().toISOString().split('T')[0];

    const debounce = (func, delay = 400) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

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
                axiosInstance.get(`/deliverymen/stats?${params.toString()}`),
                axiosInstance.get(`/deliverymen/performance?${params.toString()}`)
            ]);

            const stats = statsRes.data;
            document.getElementById('total-deliverymen').textContent = stats.total;
            document.getElementById('working-deliverymen').textContent = stats.working;
            document.getElementById('absent-deliverymen').textContent = stats.absent;
            document.getElementById('availability-rate').textContent = `${parseFloat(stats.availability_rate).toFixed(0)}%`;
            document.getElementById('received-courses').textContent = stats.received;
            document.getElementById('inprogress-courses').textContent = stats.in_progress;
            document.getElementById('delivered-courses').textContent = stats.delivered;
            document.getElementById('canceled-courses').textContent = stats.cancelled;

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
            if(error.response && error.response.status === 403) {
                window.location.href = 'index.html'; // Redirige si non autorisé
            }
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger p-4">Erreur lors du chargement des données.</td></tr>';
        }
    };

    // --- GESTION DES ÉVÉNEMENTS ---
    filterBtn.addEventListener('click', updateData);
    searchInput.addEventListener('input', debounce(updateData));

    // --- INITIALISATION DE LA PAGE ---
    if (currentUser) {
        document.querySelector('#main-content .dropdown-toggle span').textContent = currentUser.name;
    }
    
    document.getElementById('sidebar-toggler').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        document.getElementById('main-content').classList.toggle('expanded');
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('winkToken');
            localStorage.removeItem('winkUser');
            sessionStorage.removeItem('winkToken');
            sessionStorage.removeItem('winkUser');
            window.location.href = 'index.html';
        });
    }

    startDateInput.value = getTodayDate();
    endDateInput.value = getTodayDate();
    updateData();
});