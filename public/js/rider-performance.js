// public/js/rider-performance.js
// Script de gestion de l'affichage des performances du Livreur
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = '/api';
    let currentUser = null;
    let currentPerformanceData = null; // Stocke les données brutes de la dernière requête
    let deliveryTrendChart = null; // Instance du graphique Chart.js

    // --- RÉFÉRENCES DOM ---
    const riderNameElement = document.getElementById('riderName');
    const periodSelect = document.getElementById('period-select');
    const encouragementMessageEl = document.getElementById('encouragement-message');
    const remunerationPeriodEl = document.getElementById('remuneration-period');
    const objectifAdminPeriodEl = document.getElementById('objectif-admin-period');

    // Indicateurs (les spans pour les valeurs)
    const valCoursesRecues = document.getElementById('val-courses-recues');
    const valCoursesLivrées = document.getElementById('val-courses-livrees');
    const tauxLivrabiliteEl = document.getElementById('taux-livrabilite');
    const tauxLivrabiliteBarEl = document.getElementById('taux-livrabilite-bar');
    const valJoursTravailles = document.getElementById('val-jours-travailles');

    // Rémunération
    const remunerationContentEl = document.getElementById('remuneration-content');

    // Objectifs Admin
    const objectifsAdminSectionEl = document.getElementById('objectifs-admin-section');
    const objectifAdminCoursesEl = document.getElementById('objectif-admin-courses');
    const objectifAdminProgressBarEl = document.getElementById('objectif-admin-progress-bar');
    const primeParCourseEl = document.getElementById('prime-par-course');
    const primeTotaleEstimeeEl = document.getElementById('prime-totale-estimee');

    // Objectifs Personnels
    const displayPersonalGoalsEl = document.getElementById('display-personal-goals');
    const editPersonalGoalsEl = document.getElementById('edit-personal-goals');
    const editPersonalGoalsBtn = document.getElementById('edit-personal-goals-btn');
    const cancelEditGoalsBtn = document.getElementById('cancel-edit-goals-btn');
    const savePersonalGoalsBtn = document.getElementById('save-personal-goals-btn');
    const displayGoalDailyEl = document.getElementById('display-goal-daily');
    const displayGoalWeeklyEl = document.getElementById('display-goal-weekly');
    const displayGoalMonthlyEl = document.getElementById('display-goal-monthly');
    const inputGoalDailyEl = document.getElementById('input-goal-daily');
    const inputGoalWeeklyEl = document.getElementById('input-goal-weekly');
    const inputGoalMonthlyEl = document.getElementById('input-goal-monthly');
    const personalGoalMonthlyBarEl = document.getElementById('personal-goal-monthly-bar');
    const personalGoalsFeedbackEl = document.getElementById('personal-goals-feedback');
    const chartCanvas = document.getElementById('delivery-trend-chart');

    // --- FONCTIONS UTILITAIRES ---

    const formatAmount = (amount, currency = 'FCFA') => {
        const num = Number(amount || 0);
        if (isNaN(num)) return `0 ${currency}`;
        // Utilise Math.round pour arrondir à l'entier avant d'appliquer toLocaleString
        return `${Math.round(num).toLocaleString('fr-FR')} ${currency}`;
    };


    const showLoading = (element) => {
        if (element) element.innerHTML = '<div class="text-center p-3 text-muted"><div class="spinner-border spinner-border-sm" role="status"></div> Chargement...</div>';
    };

    const showError = (element, message = "Erreur de chargement.") => {
         if (element) element.innerHTML = `<div class="text-center p-3 text-danger">${message}</div>`;
    };

    const getAuthHeader = () => {
        if (typeof AuthManager === 'undefined' || !AuthManager.getToken) {
            console.error("AuthManager n'est pas chargé ou .getToken() n'existe pas.");
            return null;
        }
        const token = AuthManager.getToken();
        if (!token) {
            console.error("Token non trouvé par AuthManager.");
            AuthManager.logout();
            return null;
        }
        return { 'Authorization': `Bearer ${token}` };
    };

    // --- NOUVELLE FONCTION DE CALCUL DE DATE (Filtres étendus) ---
    const getPeriodDates = (period) => {
        const now = moment();
        let startDate, endDate, display;

        switch (period) {
            case 'today':
                startDate = now.clone().startOf('day');
                endDate = now.clone().endOf('day');
                display = "Aujourd'hui";
                break;
            case 'yesterday': // Nouveau filtre
                startDate = now.clone().subtract(1, 'days').startOf('day');
                endDate = now.clone().subtract(1, 'days').endOf('day');
                display = "Hier";
                break;
            case 'current_week':
                startDate = now.clone().startOf('isoWeek'); // Lundi
                endDate = now.clone().endOf('day'); // Jusqu'à maintenant
                display = "Cette Semaine";
                break;
            case 'last_week': // Nouveau filtre
                startDate = now.clone().subtract(1, 'week').startOf('isoWeek'); // Lundi dernier
                endDate = now.clone().subtract(1, 'week').endOf('isoWeek'); // Dimanche dernier
                display = "Semaine Dernière";
                break;
            case 'last_month':
                startDate = now.clone().subtract(1, 'month').startOf('month');
                endDate = now.clone().subtract(1, 'month').endOf('month');
                display = "Mois Dernier";
                break;
            case 'current_month':
            default: // Mois courant par défaut
                startDate = now.clone().startOf('month');
                endDate = now.clone().endOf('day'); // Jusqu'à maintenant
                display = "Ce Mois-ci";
        }

        // Retourne les dates au format YYYY-MM-DD pour l'API
        return {
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: endDate.format('YYYY-MM-DD'),
            display: display // Texte à afficher
        };
    };

    // --- Logique Confettis (Ajout) ---
    const triggerConfetti = () => {
        // Assurez-vous que le CDN de confetti est inclus dans rider-performance.html
        if (typeof confetti !== 'undefined') {
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
            function randomInRange(min, max) { return Math.random() * (max - min) + min; }
            const particleCount = 100;
            // Lance les confettis depuis plusieurs points
            confetti({ ...defaults, particleCount, origin: { y: 0.8, x: randomInRange(0.1, 0.3) } });
            confetti({ ...defaults, particleCount, origin: { y: 0.8, x: randomInRange(0.7, 0.9) } });
            confetti({ ...defaults, particleCount: 50, origin: { y: 0.9, x: 0.5 } });
        } else {
            console.warn("La librairie Confetti n'est pas chargée. Impossible d'afficher l'animation.");
        }
    };

    // --- FONCTIONS DE MISE À JOUR UI ---

    const updateKeyIndicators = (stats) => {
        const delivered = stats?.delivered || 0; // Pour la période sélectionnée
        const received = stats?.received || 0; // Pour la période sélectionnée

        // Mise à jour des valeurs pour les indicateurs (à côté des icônes)
        if(valCoursesRecues) valCoursesRecues.textContent = received || '--';
        if(valCoursesLivrées) valCoursesLivrées.textContent = delivered || '--';

        const rate = (received > 0) ? ((delivered / received) * 100).toFixed(1) : 0;
        if(tauxLivrabiliteEl) tauxLivrabiliteEl.textContent = `${rate} %`;

        if(tauxLivrabiliteBarEl) {
            tauxLivrabiliteBarEl.style.width = `${rate}%`;
            const barEl = tauxLivrabiliteBarEl;
            if (rate < 70) barEl.className = 'gauge-bar bg-danger';
            else if (rate < 90) barEl.className = 'gauge-bar bg-warning';
            else barEl.className = 'gauge-bar bg-success';
        }

        if(valJoursTravailles) valJoursTravailles.textContent = stats?.workedDays || '--';
    };

    const updateEncouragement = (stats) => {
        let message = "Continuez vos efforts !";
        const delivered = stats?.delivered || 0;
        const received = stats?.received || 0;
        const rate = (received > 0) ? ((delivered / received) * 100) : 0;

        if (rate >= 95 && delivered > 10) message = "🏆 Excellent travail ! Votre taux de livraison est remarquable !";
        else if (rate >= 80 && delivered > 5) message = "👍 Très bonnes performances cette période !";
        else if (delivered > 0) message = "💪 Vos efforts portent leurs fruits, concentrez-vous sur l'efficacité !";

        if(encouragementMessageEl) encouragementMessageEl.textContent = message;
    };

    // --- CORRECTION + MISE EN PAGE : updateRemuneration ---
    const updateRemuneration = (data) => {
        if(!remunerationContentEl) return;

        let content = '';
        const remuneration = data.remuneration; // Contient baseSalary, performanceBonus, totalPay calculé au backend

        if (data.riderType === 'pied' && remuneration) {
            const bonusText = remuneration.bonusApplied ? '<span class="badge bg-success ms-1">+5% Bonus</span>' : '';
            content = `
                <p><small>Type : Livreur à Pied (Commission)</small></p>
                <div class="row">
                    <div class="col-sm-6 mb-2">CA (Frais liv.) : <strong>${formatAmount(remuneration.ca)}</strong></div>
                    <div class="col-sm-6 mb-2">Dépenses : <strong>${formatAmount(remuneration.expenses)}</strong> (${(remuneration.expenseRatio * 100).toFixed(1)}%)</div>
                    <div class="col-sm-6 mb-2">Solde Net : <strong>${formatAmount(remuneration.netBalance)}</strong></div>
                    <div class="col-sm-6 mb-2">Taux appliqué : <strong>${(remuneration.rate * 100).toFixed(0)}%</strong> ${bonusText}</div>
                </div>
                <hr>
                <div class="text-center mt-3">
                    <div class="stat-label mb-1">Rémunération Estimée</div>
                    <div class="stat-value text-success justify-content-center">
                        <i class="bi bi-wallet2 me-2 fs-4"></i> <span class="fs-4">${formatAmount(remuneration.totalPay)}</span> </div>
                </div>
            `;
        } else if (data.riderType === 'moto' && remuneration) {
             // Affiche le totalPay qui inclut base + bonus
             content = `
                 <p><small>Type : Livreur à Moto (Salaire Fixe + Prime)</small></p>
                 <div class="row">
                     <div class="col-sm-6 mb-2">Salaire de Base : <strong>${formatAmount(remuneration.baseSalary)}</strong></div>
                     <div class="col-sm-6 mb-2">Prime Performance : <strong>${formatAmount(remuneration.performanceBonus)}</strong></div>
                 </div>
                 <hr>
                 <div class="text-center mt-3">
                     <div class="stat-label mb-1">Rémunération Totale Estimée</div>
                     <div class="stat-value text-success justify-content-center">
                         <i class="bi bi-wallet2 me-2 fs-4"></i> <span class="fs-4">${formatAmount(remuneration.totalPay)}</span> </div>
                 </div>
             `;
        } else {
            content = '<p class="text-muted">Type de livreur non défini ou données de rémunération indisponibles. Contactez l\'administrateur.</p>';
        }
        remunerationContentEl.innerHTML = content;
    };
    // --- FIN CORRECTION ---

    const updateAdminObjectives = (data) => {
        if (!objectifsAdminSectionEl) return;

        if (data.riderType === 'moto' && data.objectivesAdmin) {
            objectifsAdminSectionEl.classList.remove('d-none');

            const obj = data.objectivesAdmin;
            const achieved = Number(obj.achieved) || 0;
            const target = Number(obj.target) || 0;
            const bonusThreshold = Number(obj.bonusThreshold) || 0;
            const percentage = target > 0 ? Math.min(100, (achieved / target * 100)) : 0;

            // Déterminer la classe de couleur de la barre de progression
            let progressClass = 'bg-secondary'; // Couleur par défaut
             if (target > 0 && achieved >= bonusThreshold) { // Eligible à la prime
                 if (percentage >= 100) progressClass = 'bg-success';
                 else if (percentage >= 85) progressClass = 'bg-primary';
                 else progressClass = 'bg-info';
            } else if (target > 0) { // Sous le seuil
                 progressClass = 'bg-warning';
            }


            if(objectifAdminCoursesEl) objectifAdminCoursesEl.textContent = target > 0 ? target : '--';
            if(objectifAdminProgressBarEl) {
                objectifAdminProgressBarEl.style.width = `${percentage.toFixed(1)}%`;
                objectifAdminProgressBarEl.textContent = `${percentage.toFixed(1)}%`;
                objectifAdminProgressBarEl.setAttribute('aria-valuenow', percentage);
                // Appliquer la classe de couleur calculée
                objectifAdminProgressBarEl.className = `progress-bar progress-bar-striped progress-bar-animated ${progressClass}`;
            }

            if(primeParCourseEl) primeParCourseEl.textContent = formatAmount(obj.bonusPerDelivery, '');
            // Afficher la prime totale calculée au backend
            if(primeTotaleEstimeeEl) primeTotaleEstimeeEl.textContent = formatAmount(data.remuneration?.performanceBonus);

        } else {
            objectifsAdminSectionEl.classList.add('d-none');
        }
    };

    const updatePersonalGoalsDisplay = (stats) => {
        if(!displayPersonalGoalsEl || !personalGoalMonthlyBarEl) return;

        // Utilisation des stats spécifiques renvoyées par l'API
        const deliveredMonth = stats?.delivered || 0; // Stats de la période sélectionnée
        const deliveredToday = (periodSelect.value === 'today') ? stats?.delivered : 0; // Utiliser stats.delivered SI la période est 'today'
        const deliveredCurrentWeek = stats?.deliveredCurrentWeek || 0; // Nouvelle stat fournie par l'API

        const goalsData = currentPerformanceData?.personalGoals || {}; // Utilise les données chargées depuis l'API

        // Objectifs
        const dailyGoal = goalsData.daily || 0;
        const weeklyGoal = goalsData.weekly || 0;
        const monthlyGoal = goalsData.monthly || 0;

        // Affichage des objectifs
        if(displayGoalDailyEl) displayGoalDailyEl.textContent = dailyGoal ? `${dailyGoal} courses` : 'Non défini';
        if(displayGoalWeeklyEl) displayGoalWeeklyEl.textContent = weeklyGoal ? `${weeklyGoal} courses` : 'Non défini';
        if(displayGoalMonthlyEl) displayGoalMonthlyEl.textContent = monthlyGoal ? `${monthlyGoal} courses` : 'Non défini';

        // Progression Quotidienne
        const progressDaily = dailyGoal > 0 ? Math.min(deliveredToday, dailyGoal) : 0;
        document.querySelector('#display-personal-goals div:nth-child(1) .text-muted').textContent = `(Progression : ${progressDaily}/${dailyGoal || '--'})`;

        // --- MISE À JOUR: Progression Hebdomadaire ---
        const progressWeekly = weeklyGoal > 0 ? Math.min(deliveredCurrentWeek, weeklyGoal) : 0;
        document.querySelector('#display-personal-goals div:nth-child(2) .text-muted').textContent = `(Progression : ${progressWeekly}/${weeklyGoal || '--'})`;

        // Progression Mensuelle
        const progressMonthlyValue = monthlyGoal > 0 ? Math.min(deliveredMonth, monthlyGoal) : 0; // Renommé pour clarté
        const monthlyProgressPercent = monthlyGoal > 0 ? Math.min(100, (deliveredMonth / monthlyGoal) * 100) : 0;
        document.querySelector('#display-personal-goals div:nth-child(3) .text-muted').textContent = `(Progression : ${progressMonthlyValue}/${monthlyGoal || '--'})`;

        // Barre de progression Mensuelle Perso
        personalGoalMonthlyBarEl.style.width = `${monthlyProgressPercent.toFixed(1)}%`;
        personalGoalMonthlyBarEl.textContent = `${monthlyProgressPercent.toFixed(1)}%`;
        personalGoalMonthlyBarEl.setAttribute('aria-valuenow', monthlyProgressPercent);

        // Déclenchement de la célébration (confettis)
        const currentPeriod = periodSelect.value;
        const lastGoalCompletion = localStorage.getItem('lastDailyGoalCompletion');
        const today = moment().format('YYYY-MM-DD');

        // Déclencher si période = today ET objectif quotidien défini ET objectif atteint
        if (currentPeriod === 'today' && dailyGoal > 0 && progressDaily >= dailyGoal) {
            // Vérifier si on ne l'a pas déjà affiché aujourd'hui
            if (lastGoalCompletion !== today) {
                triggerConfetti();
                localStorage.setItem('lastDailyGoalCompletion', today);
                 // showNotification("Félicitations ! Objectif journalier atteint !", 'success'); // Optionnel
            }
        } else if (lastGoalCompletion === today && (currentPeriod !== 'today' || progressDaily < dailyGoal)) {
            // Réinitialiser si on quitte le mode "today" ou si l'objectif n'est plus atteint.
             localStorage.removeItem('lastDailyGoalCompletion');
        }
    };

    const updateDeliveryTrendChart = (chartData) => {
        const canvas = chartCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (deliveryTrendChart) deliveryTrendChart.destroy();

        if (!chartData || !chartData.labels || chartData.labels.length === 0 || !chartData.data || chartData.data.length === 0) {
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             ctx.font = "14px Arial";
             ctx.fillStyle = "#6c757d";
             ctx.textAlign = "center";
             ctx.fillText("Aucune donnée pour le graphique.", canvas.width / 2, canvas.height / 2);
             return;
         }

        deliveryTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Courses Livrées',
                    data: chartData.data,
                    borderColor: 'rgb(255, 127, 80)',
                    backgroundColor: 'rgba(255, 127, 80, 0.2)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } },
                plugins: { legend: { display: false } }
            }
        });
    };

    // --- LOGIQUE DE GESTION DES OBJECTIFS PERSONNELS ---

    const savePersonalGoals = async () => {
        if(!inputGoalDailyEl || !inputGoalWeeklyEl || !inputGoalMonthlyEl) return;

        const goals = {
            daily: parseInt(inputGoalDailyEl.value) || null,
            weekly: parseInt(inputGoalWeeklyEl.value) || null,
            monthly: parseInt(inputGoalMonthlyEl.value) || null,
        };

        if(savePersonalGoalsBtn) savePersonalGoalsBtn.disabled = true;
        if(personalGoalsFeedbackEl) personalGoalsFeedbackEl.textContent = 'Enregistrement...';

        const headers = getAuthHeader();
        if (!headers) {
             if(personalGoalsFeedbackEl) personalGoalsFeedbackEl.textContent = 'Erreur d\'authentification.';
             if(savePersonalGoalsBtn) savePersonalGoalsBtn.disabled = false;
             return;
        }

        try {
            // ** APPEL API ** : PUT /api/performance/personal-goals
            await axios.put(`${API_BASE_URL}/performance/personal-goals`, goals, { headers });

            if(personalGoalsFeedbackEl) {
                personalGoalsFeedbackEl.textContent = 'Objectifs sauvegardés sur le serveur.';
                personalGoalsFeedbackEl.className = 'form-text mt-2 text-success';
            }

            // Mise à jour de l'affichage (re-fetch)
            await fetchPerformanceData();
            toggleEditPersonalGoals(false); // Revenir au mode affichage

        } catch (error) {
            console.error("Erreur sauvegarde objectifs perso:", error);
            if (error.response?.status === 400 && error.response?.data?.message) {
                 personalGoalsFeedbackEl.textContent = error.response.data.message;
            } else {
                 personalGoalsFeedbackEl.textContent = 'Erreur lors de la sauvegarde.';
            }
            personalGoalsFeedbackEl.className = 'form-text mt-2 text-danger';

             if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
        } finally {
             if(savePersonalGoalsBtn) savePersonalGoalsBtn.disabled = false;
             setTimeout(() => { if(personalGoalsFeedbackEl) personalGoalsFeedbackEl.textContent = ''; }, 4000);
        }
    };

    const toggleEditPersonalGoals = (editMode) => {
        if(!displayPersonalGoalsEl || !editPersonalGoalsEl || !editPersonalGoalsBtn) return;

        if (editMode) {
            displayPersonalGoalsEl.classList.add('d-none');
            editPersonalGoalsEl.classList.remove('d-none');
            editPersonalGoalsBtn.innerHTML = '<i class="bi bi-x-lg"></i> Annuler'; // Change icon to Cancel

            // Pré-remplir les inputs avec la valeur de la BDD (contenue dans currentPerformanceData)
            const goals = currentPerformanceData?.personalGoals || {};
            if(inputGoalDailyEl) inputGoalDailyEl.value = goals.daily || '';
            if(inputGoalWeeklyEl) inputGoalWeeklyEl.value = goals.weekly || '';
            if(inputGoalMonthlyEl) inputGoalMonthlyEl.value = goals.monthly || '';

        } else {
            displayPersonalGoalsEl.classList.remove('d-none');
            editPersonalGoalsEl.classList.add('d-none');
            editPersonalGoalsBtn.innerHTML = '<i class="bi bi-pencil"></i> Modifier'; // Change icon back to Edit
             if(personalGoalsFeedbackEl) personalGoalsFeedbackEl.textContent = '';
        }
    };

    // --- FONCTION PRINCIPALE DE CHARGEMENT ---

    const fetchPerformanceData = async () => {
        if (!remunerationContentEl || !AuthManager) {
             console.error("Éléments DOM ou AuthManager manquants. Arrêt de fetchPerformanceData.");
             return;
        }

        const period = periodSelect.value;
        const headers = getAuthHeader();

        if (!headers || !AuthManager.getUserId()) {
            showLoading(remunerationContentEl);
            console.warn("Token ou UserID manquant, appel API annulé.");
            return;
        }

        // Utilisation de la fonction getPeriodDates étendue
        const { startDate, endDate, display } = getPeriodDates(period);

        showLoading(remunerationContentEl);
        if(objectifsAdminSectionEl) objectifsAdminSectionEl.classList.add('d-none');
        if(encouragementMessageEl) encouragementMessageEl.textContent = 'Analyse des performances...';

        // Mettre les valeurs à "--" en attendant
        if(valCoursesRecues) valCoursesRecues.textContent = '--';
        if(valCoursesLivrées) valCoursesLivrées.textContent = '--';
        if(tauxLivrabiliteEl) tauxLivrabiliteEl.textContent = '-- %';
        if(tauxLivrabiliteBarEl) tauxLivrabiliteBarEl.style.width = '0%';
        if(valJoursTravailles) valJoursTravailles.textContent = '--';
        if(remunerationPeriodEl) remunerationPeriodEl.textContent = display;
        if(objectifAdminPeriodEl) objectifAdminPeriodEl.textContent = display;


        try {
            // ** APPEL API ** : GET /api/performance
            // L'API reçoit maintenant 'period' mais les dates calculées sont aussi envoyées
            const response = await axios.get(`${API_BASE_URL}/performance`, {
                params: { period, startDate, endDate }, // Envoi de la période ET des dates
                headers,
                timeout: 10000
            });

            currentPerformanceData = response.data; // Stocker les données
            const stats = currentPerformanceData.stats;

            if (!currentPerformanceData || !stats) {
                 showError(remunerationContentEl, "Aucune donnée de performance reçue pour la période.");
                 return;
            }

            // Mettre à jour toutes les sections de l'UI
            updateKeyIndicators(stats);
            updateEncouragement(stats);
            updateRemuneration(currentPerformanceData); // Affiche le totalPay calculé au backend
            updateAdminObjectives(currentPerformanceData);
            updatePersonalGoalsDisplay(stats); // Passer les stats pour la progression
            updateDeliveryTrendChart(currentPerformanceData.chartData);

        } catch (error) {
            console.error("Erreur fetchPerformanceData:", error);
            if (error.code === 'ECONNABORTED') {
                showError(remunerationContentEl, "La requête a expiré. Le serveur met trop de temps à répondre.");
            } else if (error.response) {
                showError(remunerationContentEl, `Erreur: ${error.response.data?.message || 'Impossible de charger les données.'} (Code: ${error.response.status})`);
                if (error.response.status === 401 || error.response.status === 403) {
                    AuthManager.logout();
                }
            } else if (error.request) {
                showError(remunerationContentEl, "Impossible de contacter le serveur. Vérifiez votre connexion.");
            } else {
                showError(remunerationContentEl, `Erreur inattendue: ${error.message}`);
            }
            if(encouragementMessageEl) encouragementMessageEl.textContent = "Erreur de chargement des données.";
        }
    };

    // --- INITIALISATION ---
    const initializeApp = () => {
        if (typeof AuthManager === 'undefined') {
            console.error("AuthManager n'est pas chargé. Arrêt de l'initialisation.");
            return;
        }

        currentUser = AuthManager.getUser();
        if (!currentUser || currentUser.role !== 'livreur') {
             if (currentUser) console.error("Rôle incorrect.");
             // La redirection est déjà gérée par le script <script> dans le HTML
             return;
        }

        if (document.getElementById('riderName')) document.getElementById('riderName').textContent = currentUser.name;
        if (document.getElementById('riderRole')) document.getElementById('riderRole').textContent = 'Livreur';

        // --- Attachement des Événements ---
        if (periodSelect) {
            periodSelect.addEventListener('change', fetchPerformanceData);
        } else {
            console.error("Élément DOM 'period-select' introuvable.");
        }

        if (editPersonalGoalsBtn) {
            editPersonalGoalsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const isEditing = editPersonalGoalsEl && editPersonalGoalsEl.classList.contains('d-none');
                toggleEditPersonalGoals(isEditing);
            });
        }

        if (cancelEditGoalsBtn) {
            cancelEditGoalsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                toggleEditPersonalGoals(false);
            });
        }

        if (savePersonalGoalsBtn) {
            savePersonalGoalsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                savePersonalGoals();
            });
        }

        // Configuration Bouton Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => AuthManager.logout());
        }

        // Lancement initial
        fetchPerformanceData();
    };

    // Attendre que AuthManager soit prêt avant d'initialiser
    document.addEventListener('authManagerReady', () => {
        console.log("Événement 'authManagerReady' reçu. Initialisation de l'application.");
        initializeApp();
    });

    // Fallback au cas où l'événement ne serait pas capturé (ex: timing)
     setTimeout(() => {
         if (!currentUser && typeof AuthManager !== 'undefined' && AuthManager.getUser()) {
             console.warn("AuthManager était prêt mais l'événement n'a pas été capturé ? Initialisation par fallback.");
             initializeApp();
         } else if (currentUser) {
             // App déjà initialisée, ne rien faire
         } else {
              console.error("AuthManager n'est pas prêt après le timeout.");
              // Afficher un message d'erreur persistant si nécessaire
         }
     }, 500);
});