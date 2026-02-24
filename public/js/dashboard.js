// js/dashboard.js
document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const API_BASE_URL = '/api';
    // --- État des graphiques ---
    let revenueChart, statusChart;
    
    // --- Références DOM ---
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const sidebarToggler = document.getElementById('sidebar-toggler');
    const logoutBtn = document.getElementById('logoutBtn');
    const applyFilterBtn = document.getElementById('applyFilterBtn'); // Nouveau bouton filtre

    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    // Références pour les nouvelles cartes
    const caNetDisplay = document.getElementById('caNet');
    const totalExpensesDisplay = document.getElementById('totalExpenses');
    const soldeNetDisplay = document.getElementById('soldeNet');
    const totalDeliveryFeesDisplay = document.getElementById('totalDeliveryFees');
    const totalCoursesSentDisplay = document.getElementById('totalCoursesSentDisplay');
    const rankingTableBody = document.getElementById('rankingTableBody');

    // --- FONCTIONS UTILITAIRES ---
    
    const formatAmount = (amount) => {
        return parseFloat(amount || 0).toLocaleString('fr-FR') + ' FCFA';
    };

    /**
     * Calcule la plage de dates par défaut (7 derniers jours) et applique les valeurs.
     */
    const setDefaultDateRange = () => {
        const today = moment().format('YYYY-MM-DD');
        const lastWeek = moment().subtract(7, 'days').format('YYYY-MM-DD');
        
        startDateInput.value = lastWeek;
        endDateInput.value = today;
    };
    
    /**
     * Affiche les données du classement des marchands dans le tableau.
     * @param {Array<Object>} ranking - Liste des marchands.
     */
    const renderRankingTable = (ranking) => {
        rankingTableBody.innerHTML = '';
        if (ranking.length === 0) {
            rankingTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-3">Aucun marchand classé pour cette période.</td></tr>`;
            return;
        }

        ranking.forEach((shop, index) => {
            const row = document.createElement('tr');
            let rankIcon;
            if (index === 0) rankIcon = '<i class="bi bi-trophy-fill rank-icon text-warning-dark"></i>';
            else if (index === 1) rankIcon = '<i class="bi bi-award-fill rank-icon text-info-dark"></i>';
            else if (index === 2) rankIcon = '<i class="bi bi-gem rank-icon text-success-dark"></i>';
            else rankIcon = `<span class="rank-icon text-muted">${index + 1}</span>`;

            row.innerHTML = `
                <td>${rankIcon}</td>
                <td>${shop.shop_name}</td>
                <td>${shop.orders_sent_count}</td>
                <td>${shop.orders_processed_count}</td>
                <td class="text-end fw-bold">${formatAmount(shop.total_delivery_fees_generated)}</td>
            `;
            rankingTableBody.appendChild(row);
        });
    };

    // --- FONCTIONS PRINCIPALES ---
    
    /**
     * Récupère les données agrégées du backend et met à jour les cartes/graphiques.
     */
    const updateDashboard = async () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) return;

        try {
            // Afficher le chargement
            caNetDisplay.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
            // ... autres cartes ...
            
            const response = await axios.get(`${API_BASE_URL}/dashboard/stats`, { 
                params: { startDate, endDate } 
            });
            
            const { metrics, ranking } = response.data;

            // 1. Mise à jour des cartes de Métriques Financières
            caNetDisplay.innerHTML = `<i class="bi bi-cash-stack card-stat-icon text-primary-dark"></i> ${formatAmount(metrics.ca_net)}`;
            totalExpensesDisplay.innerHTML = `<i class="bi bi-arrow-down-left-square card-stat-icon text-danger-dark"></i> ${formatAmount(metrics.total_expenses)}`;
            soldeNetDisplay.innerHTML = `<i class="bi bi-wallet2 card-stat-icon text-success-dark"></i> ${formatAmount(metrics.solde_net)}`;
            totalDeliveryFeesDisplay.innerHTML = `<i class="bi bi-truck card-stat-icon text-info-dark"></i> ${formatAmount(metrics.total_delivery_fees)}`;
            
            // 2. Mise à jour du classement des partenaires
            renderRankingTable(ranking);

            // 3. Mise à jour du graphique des statuts
            updateStatusChart(metrics);

            // 4. Mettre à jour l'ancien graphique (Revenu Journalier) - Simulation pour l'exemple
            // NOTE: Pour avoir des données réelles journalières, une autre route API devrait être créée.
            // Nous conservons ici la simulation simplifiée pour le revenu (CA) agrégé.
            
            // Simulation de données journalières pour l'exemple (remplace l'ancienne simulation)
            const simulatedDates = [];
            const simulatedRevenue = [];
            let currentDate = moment(startDate);
            const stopDate = moment(endDate);

            while (currentDate.isSameOrBefore(stopDate, 'day')) {
                simulatedDates.push(currentDate.format('YYYY-MM-DD'));
                // Simuler un revenu quotidien variant autour d'une moyenne
                simulatedRevenue.push(metrics.total_delivery_fees / 7 + (Math.random() * metrics.total_delivery_fees * 0.1));
                currentDate.add(1, 'days');
            }

            // Utiliser total_delivery_fees comme revenu pour la démo
            updateRevenueChart(simulatedDates, simulatedRevenue);


        } catch (error) {
            console.error("Erreur lors de la récupération des données du tableau de bord:", error);
            caNetDisplay.innerHTML = 'Erreur';
            // ... affichage d'erreur pour les autres cartes
        }
    };
    
    /**
     * Met à jour le graphique circulaire de distribution des statuts.
     */
    const updateStatusChart = (metrics) => {
        if (statusChart) statusChart.destroy();
        
        const totalSent = metrics.total_sent;
        totalCoursesSentDisplay.textContent = `Total : ${totalSent} commandes envoyées`;

        if (totalSent === 0) return;

        const data = {
            labels: ['Livrée', 'En Cours', 'Annulée/Échouée/Reportée'],
            datasets: [{
                data: [metrics.total_delivered, metrics.total_in_progress, metrics.total_failed_cancelled],
                backgroundColor: [
                    'rgba(40, 167, 69, 0.8)', // Vert
                    'rgba(255, 193, 7, 0.8)',  // Jaune
                    'rgba(220, 53, 69, 0.8)'   // Rouge
                ],
                hoverOffset: 4
            }]
        };

        statusChart = new Chart(document.getElementById('statusChart'), {
            type: 'doughnut',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    title: {
                        display: true,
                        text: 'Taux de Traitement des Courses'
                    }
                }
            }
        });
    };

    /**
     * Met à jour l'ancien graphique de revenu (conservé pour l'exemple de type Ligne).
     */
    const updateRevenueChart = (labels, data) => {
         if (revenueChart) revenueChart.destroy();

        const corailColor = 'rgb(255, 127, 80)';

        revenueChart = new Chart(document.getElementById('revenueChart'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Frais de Livraison (XAF)',
                    data: data,
                    borderColor: corailColor,
                    backgroundColor: 'rgba(255, 127, 80, 0.2)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    };
    
    /**
     * Initialise les écouteurs d'événements et la vue de départ.
     */
    const initializeApp = () => {
        // Définir la plage de dates par défaut (7 derniers jours)
        setDefaultDateRange();

        // Logique du menu rétractable et de la déconnexion
        sidebarToggler.addEventListener('click', () => {
            if (window.innerWidth < 992) {
                // Logique mobile : basculer la classe 'show'
                sidebar.classList.toggle('show');
            } else {
                // Logique Desktop : basculer la classe 'collapsed'
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('expanded');
            }
        });

        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
            window.location.href = 'index.html';
        });

        // Écouteur pour le bouton Appliquer les filtres
        applyFilterBtn.addEventListener('click', updateDashboard);
        
        // Lancement du chargement initial
        updateDashboard();
    };
    
    initializeApp();
});