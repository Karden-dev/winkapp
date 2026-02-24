// public/js/deliverymenManager.js
/**
 * Gère la page refondue de gestion des livreurs pour l'admin (deliverymen.html).
 */
document.addEventListener('DOMContentLoaded', () => {
  // --- CONFIGURATION ---
  const API_BASE_URL = '/api';
  let currentUser = null;
  let currentLivreurDetails = null;
  let performanceChart = null;

  // --- RÉFÉRENCES DOM ---
  // Éléments principaux
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');
  const sidebarToggler = document.getElementById('sidebar-toggler');
  const logoutBtn = document.getElementById('logoutBtn');
  const userNameDisplay = document.getElementById('userName');
  const notificationContainer = document.getElementById('notification-container');

  // Filtres principaux
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const searchInput = document.getElementById('searchInput');
  const filterBtn = document.getElementById('filterBtn');
  const statsPeriodDisplayActivite = document.getElementById('stats-period-display-activite');
  const statsPeriodDisplayCourses = document.getElementById('stats-period-display-courses');

  // Cartes de statistiques globales
  const totalDeliverymenEl = document.getElementById('total-deliverymen');
  const workingDeliverymenEl = document.getElementById('working-deliverymen');
  const absentDeliverymenEl = document.getElementById('absent-deliverymen');
  const availabilityRateEl = document.getElementById('availability-rate');
  const receivedCoursesEl = document.getElementById('received-courses');
  const inprogressCoursesEl = document.getElementById('inprogress-courses');
  const deliveredCoursesEl = document.getElementById('delivered-courses');
  const canceledCoursesEl = document.getElementById('canceled-courses');

  // Tableau principal
  const deliverymenTableBody = document.getElementById('deliverymenTableBody');

  // Modale Détails Livreur
  const livreurDetailsModalEl = document.getElementById('livreurDetailsModal');
  const livreurDetailsModal = livreurDetailsModalEl ? new bootstrap.Modal(livreurDetailsModalEl) : null;
  const modalLivreurNameEl = document.getElementById('modalLivreurName');
  const modalPerformancePeriodSelect = document.getElementById('modalPerformancePeriod');
  const modalPerformanceContentEl = document.getElementById('modalPerformanceContent');
  const performanceJournalBody = document.getElementById('performanceJournalBody'); // Ajout pour le journal

  // Formulaires Modale Détails
  const livreurSettingsForm = document.getElementById('livreurSettingsForm');
  const settingLivreurUserIdInput = document.getElementById('settingLivreurUserId');
  const settingVehicleTypeSelect = document.getElementById('settingVehicleType');
  const settingBaseSalaryInput = document.getElementById('settingBaseSalary');
  const settingCommissionRateInput = document.getElementById('settingCommissionRate');
  const settingMonthlyObjectiveInput = document.getElementById('settingMonthlyObjective');
  const settingUserStatusSelect = document.getElementById('settingUserStatus');
  const settingsFeedbackEl = document.getElementById('settingsFeedback');
  const modalAbsencesListEl = document.getElementById('modalAbsencesList');

  // Autres Modales
  const addAbsenceModalEl = document.getElementById('addAbsenceModal');
  const addAbsenceModal = addAbsenceModalEl ? new bootstrap.Modal(addAbsenceModalEl) : null;
  const addAbsenceForm = document.getElementById('addAbsenceForm');
  const absenceLivreurUserIdInput = document.getElementById('absenceLivreurUserId');
  const absenceDateInput = document.getElementById('absenceDate');
  const absenceTypeSelect = document.getElementById('absenceType');
  const absenceMotifInput = document.getElementById('absenceMotif');
  const absencesModalEl = document.getElementById('absencesModal');
  const absencesModal = absencesModalEl ? new bootstrap.Modal(absencesModalEl) : null;
  const manageAbsenceForm = document.getElementById('manageAbsenceForm');
  const manageAbsenceDateInput = document.getElementById('manageAbsenceDate');
  const manageAbsenceTypeSelect = document.getElementById('manageAbsenceType');
  const manageAbsenceLivreurSelect = document.getElementById('manageAbsenceLivreurSelect');
  const manageAbsenceMotifInput = document.getElementById('manageAbsenceMotif');
  const absencesEventsListEl = document.getElementById('absencesEventsList');
  const absenceListPeriodEl = document.getElementById('absenceListPeriod');


  // --- FONCTIONS UTILITAIRES ---

  /**
   * Affiche une notification toast.
   * @param {string} message - Le message à afficher.
   * @param {string} [type='success'] - Le type de notification.
   */
  const showNotification = (message, type = 'success') => {
    if (!notificationContainer) {
      console.warn("Conteneur de notification introuvable.");
      return;
    }
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show m-2`;
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
    notificationContainer.appendChild(alertDiv);
    setTimeout(() => {
      const instance = bootstrap.Alert.getOrCreateInstance(alertDiv);
      if (instance) instance.close();
    }, 5000);
  };

  /**
   * Formate un montant en FCFA.
   * @param {number|string} amount - Le montant.
   * @param {string} [currency='FCFA'] - La devise.
   * @returns {string} Le montant formaté.
   */
  const formatAmount = (amount, currency = 'FCFA') => {
    const num = Number(amount);
    if (isNaN(num)) return `0 ${currency}`;
    return `${Math.round(num).toLocaleString('fr-FR')} ${currency}`;
  };

  /**
   * Obtient la date du jour au format YYYY-MM-DD.
   * @returns {string} La date du jour.
   */
  const getTodayDate = () => moment().format('YYYY-MM-DD');

  /**
   * Fonction de debounce.
   * @param {Function} func - La fonction à débouncer.
   * @param {number} [delay=400] - Le délai en ms.
   * @returns {Function} La fonction débouncée.
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
   * Affiche un spinner de chargement.
   * @param {HTMLElement} element - L'élément cible.
   * @param {number} [colspan=7] - Nombre de colonnes (pour les tableaux).
   */
  const showLoading = (element, colspan = 7) => {
    if (!element) return;
    const content = `<tr><td colspan="${colspan}" class="text-center p-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Chargement...</span></div></td></tr>`;
    if (element.tagName === 'TBODY') {
      element.innerHTML = content;
    } else {
      element.innerHTML = `<div class="text-center p-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Chargement...</span></div></div>`;
    }
  };

  /**
   * Affiche un message d'erreur.
   * @param {HTMLElement} element - L'élément cible.
   * @param {string} [message="Erreur de chargement."] - Le message d'erreur.
   * @param {number} [colspan=7] - Nombre de colonnes (pour les tableaux).
   */
  const showError = (element, message = "Erreur de chargement.", colspan = 7) => {
    if (!element) return;
    const content = `<tr><td colspan="${colspan}" class="text-center text-danger p-4">${message}</td></tr>`;
    if (element.tagName === 'TBODY') {
      element.innerHTML = content;
    } else {
      element.innerHTML = `<div class="text-center text-danger p-4">${message}</div>`;
    }
  };

  /**
   * Récupère l'en-tête d'authentification.
   * @returns {Object|null} L'objet headers ou null.
   */
  const getAuthHeader = () => {
    if (typeof AuthManager === 'undefined') {
      console.error("AuthManager non défini.");
      showNotification("Erreur critique d'authentification.", "danger");
      return null;
    }
    const token = AuthManager.getToken();
    if (!token) {
      console.error("Token non trouvé. Déconnexion...");
      showNotification("Session expirée, veuillez vous reconnecter.", "danger");
      AuthManager.logout();
      return null;
    }
    return { 'Authorization': `Bearer ${token}` };
  };

  // --- FONCTIONS PRINCIPALES (Chargement Données & Rendu) ---

  /**
   * Récupère les données principales et met à jour les cartes et le tableau.
   */
  const fetchAndRenderMainData = async () => {
    const startDate = startDateInput.value || getTodayDate();
    const endDate = endDateInput.value || startDate;
    const searchQuery = searchInput.value;

    const periodText = startDate === endDate ? moment(startDate).format('DD/MM/YYYY') : `Du ${moment(startDate).format('DD/MM/YYYY')} au ${moment(endDate).format('DD/MM/YYYY')}`;
    if (statsPeriodDisplayActivite) statsPeriodDisplayActivite.textContent = periodText;
    if (statsPeriodDisplayCourses) statsPeriodDisplayCourses.textContent = periodText;

    showLoading(deliverymenTableBody, 7);
    filterBtn.disabled = true;
    filterBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Chargement...';

    const headers = getAuthHeader();
    if (!headers) return;

    try {
      const params = { startDate, endDate };
      if (searchQuery) params.search = searchQuery;

      // Appel des API
      const [statsRes, perfRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/deliverymen/stats`, { params, headers }),
        axios.get(`${API_BASE_URL}/deliverymen/performance`, { params, headers })
      ]);

      updateStatsCards(statsRes.data);
      renderDeliverymenTable(perfRes.data);

    } catch (error) {
      console.error("Erreur fetchAndRenderMainData:", error);
      showError(deliverymenTableBody, "Erreur lors du chargement des données.", 7);
      updateStatsCards({});
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    } finally {
      filterBtn.disabled = false;
      filterBtn.innerHTML = '<i class="bi bi-funnel me-1"></i> Filtrer';
    }
  };

  /**
   * Met à jour les cartes de statistiques globales.
   * @param {Object} [stats={}] - Les données des statistiques.
   */
  const updateStatsCards = (stats = {}) => {
    if (totalDeliverymenEl) totalDeliverymenEl.textContent = stats.total ?? '--';
    if (workingDeliverymenEl) workingDeliverymenEl.textContent = stats.working ?? '--';
    if (absentDeliverymenEl) absentDeliverymenEl.textContent = stats.absent ?? '--';
    if (availabilityRateEl) availabilityRateEl.textContent = `${parseFloat(stats.availability_rate || 0).toFixed(0)}%`;
    if (receivedCoursesEl) receivedCoursesEl.textContent = stats.received ?? '--';
    if (inprogressCoursesEl) inprogressCoursesEl.textContent = stats.in_progress ?? '--';
    if (deliveredCoursesEl) deliveredCoursesEl.textContent = stats.delivered ?? '--';
    if (canceledCoursesEl) canceledCoursesEl.textContent = stats.cancelled ?? '--';
  };

  /**
   * Génère et affiche le tableau des livreurs.
   * @param {Array<Object>} livreurs - Liste des livreurs et leurs performances.
   */
  const renderDeliverymenTable = (livreurs) => {
    deliverymenTableBody.innerHTML = '';
    if (!livreurs || livreurs.length === 0) {
      showError(deliverymenTableBody, "Aucun livreur trouvé.", 7);
      return;
    }

    livreurs.forEach((livreur, index) => {
      const row = document.createElement('tr');
      const received = livreur.received_orders || 0;
      const inProgress = livreur.in_progress_orders || 0;
      const cancelled = livreur.cancelled_orders || 0;
      const delivered = livreur.delivered_orders || 0;
      const caGenere = livreur.total_revenue || 0;

      let distinctionHtml = '';
      if (index === 0) distinctionHtml = '<span class="distinction"><i class="bi bi-trophy-fill distinction-icon gold"></i></span>';
      else if (index === 1) distinctionHtml = '<span class="distinction"><i class="bi bi-trophy-fill distinction-icon silver"></i></span>';
      else if (index === 2) distinctionHtml = '<span class="distinction"><i class="bi bi-trophy-fill distinction-icon bronze"></i></span>';
      else distinctionHtml = `<span class="distinction rank-number">#${index + 1}</span>`;


      row.innerHTML = `
                <td>${distinctionHtml} ${livreur.name || 'Inconnu'}</td>
                <td>${received}</td>
                <td class="text-warning fw-bold">${inProgress}</td>
                <td class="text-danger fw-bold">${cancelled}</td>
                <td class="text-success fw-bold">${delivered}</td>
                <td class="text-end fw-bold">${formatAmount(caGenere)}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-info details-btn" data-userid="${livreur.id}" data-name="${livreur.name}" title="Gérer les détails et performances">
                        <i class="bi bi-gear-fill"></i> Gérer
                    </button>
                </td>
            `;
      deliverymenTableBody.appendChild(row);
    });
  };

  // --- FONCTIONS MODALE DETAILS ---

  /**
   * Ouvre la modale de détails et déclenche le chargement des données.
   * @param {string} userId - ID de l'utilisateur.
   * @param {string} userName - Nom de l'utilisateur.
   */
  const openLivreurDetailsModal = async (userId, userName) => {
    if (!livreurDetailsModal) return showNotification("Erreur: Modale Détails non trouvée.", "danger");
    modalLivreurNameEl.textContent = userName;
    settingLivreurUserIdInput.value = userId;
    absenceLivreurUserIdInput.value = userId;

    const firstTabEl = document.getElementById('performance-tab');
    if (firstTabEl) {
      try {
        const firstTab = new bootstrap.Tab(firstTabEl);
        firstTab.show();
      } catch (e) { console.warn("Erreur activation onglet:", e); }
    }

    showLoading(modalPerformanceContentEl);
    settingsFeedbackEl.textContent = '';
    settingsFeedbackEl.className = 'mt-2 small';
    if (livreurSettingsForm) livreurSettingsForm.reset();
    showLoading(modalAbsencesListEl);
    showLoading(performanceJournalBody, 6); // Afficher chargement pour le journal

    livreurDetailsModal.show();

    try {
      // Charger les données pour les onglets
      await Promise.all([
        fetchAndRenderModalPerformance(userId, modalPerformancePeriodSelect?.value || 'current_month'),
        fetchAndPopulateSettings(userId),
        fetchAndRenderAbsences(userId)
      ]);
    } catch (error) {
      console.error("Erreur chargement détails livreur:", error);
      showNotification("Erreur lors du chargement des détails complets.", "danger");
    }
  };

  /**
   * Récupère et affiche les données de performance de la modale.
   * @param {string} userId - ID de l'utilisateur.
   * @param {string} period - La période sélectionnée.
   */
  const fetchAndRenderModalPerformance = async (userId, period) => {
    showLoading(modalPerformanceContentEl);
    const headers = getAuthHeader();
    if (!headers) return showError(modalPerformanceContentEl, "Erreur d'authentification.");

    try {
      // Appel API performance-details
      const response = await axios.get(`${API_BASE_URL}/deliverymen/${userId}/performance-details`, {
        params: { period: period }, headers
      });
      currentLivreurDetails = response.data;

      renderModalPerformance(currentLivreurDetails);
      await fetchAndRenderPerformanceJournal(userId, period); // Recharger le journal

    } catch (error) {
      console.error("Erreur fetchAndRenderModalPerformance:", error);
      showError(modalPerformanceContentEl, "Erreur chargement performance.");
      showError(performanceJournalBody, "Erreur chargement journal.", 6);
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    }
  };

  /**
   * Rend le contenu de l'onglet performance dans la modale.
   * @param {Object} data - Les données de performance.
   */
  const renderModalPerformance = (data) => {
    if (!data || !data.stats) {
      showError(modalPerformanceContentEl, "Données de performance indisponibles.");
      return;
    }
    const stats = data.stats;
    const rate = (stats?.received && stats?.delivered) ? ((stats.delivered / stats.received) * 100).toFixed(1) : 0;

    modalPerformanceContentEl.innerHTML = `
            <div class="row g-3 mb-3">
                 <div class="col-md-3"><div class="livreur-stat-card text-center"><div class="stat-label">Reçues</div><div class="stat-value">${stats.received ?? '--'}</div></div></div>
                 <div class="col-md-3"><div class="livreur-stat-card text-center"><div class="stat-label">Livrées*</div><div class="stat-value text-success">${stats.delivered ?? '--'}</div></div></div>
                 <div class="col-md-3"><div class="livreur-stat-card text-center"><div class="stat-label">Taux Livr.</div><div class="stat-value text-info">${rate}%</div></div></div>
                 <div class="col-md-3"><div class="livreur-stat-card text-center"><div class="stat-label">Jours Actifs</div><div class="stat-value">${stats.workedDays ?? '--'}</div></div></div>
            </div>
            <h6>Rémunération Estimée (Période)</h6>
            <div id="modal-remuneration-details" class="p-3 bg-light rounded mb-3">
                 Chargement rémunération...
            </div>
            <h6 class="mt-3">Objectif Admin (Période)</h6>
            <div id="modal-admin-objectives" class="p-3 bg-light rounded mb-3 ${data.riderType !== 'moto' ? 'd-none' : ''}">
                 Chargement objectif admin...
            </div>
            <h6 class="mt-3">Graphique Évolution (Courses Livrées*)</h6>
            <div style="position: relative; height: 250px;"><canvas id="modalPerformanceChart"></canvas></div>
            <small class="text-muted d-block mt-2">* Livrées inclut les livraisons réussies et ratées.</small>
        `;

    updateModalRemuneration(data);
    updateModalAdminObjectives(data);
    renderModalChart(data.chartData);
  };

  /**
   * Met à jour les détails de la rémunération dans la modale.
   * @param {Object} data - Les données de performance.
   */
  const updateModalRemuneration = (data) => {
    const container = document.getElementById('modal-remuneration-details');
    if (!container) return;
    let content = '';
    const remuneration = data.remuneration || {};

    if (data.riderType === 'pied') {
      const bonusText = remuneration.bonusApplied ? '<span class="badge bg-success ms-1">+5% Bonus</span>' : '';
      content = `
                <p><small>Type : Livreur à Pied</small></p>
                <div class="row">
                    <div class="col-sm-6">CA (Frais liv.) : <strong>${formatAmount(remuneration.ca)}</strong></div>
                    <div class="col-sm-6">Dépenses : <strong>${formatAmount(remuneration.expenses)}</strong> (${(remuneration.expenseRatio * 100).toFixed(1)}%)</div>
                </div>
                <div class="row mt-2">
                     <div class="col-sm-6">Solde Net : <strong>${formatAmount(remuneration.netBalance)}</strong></div>
                     <div class="col-sm-6">Taux appliqué : <strong>${(remuneration.rate * 100)}%</strong> ${bonusText}</div>
                </div>
                <hr>
                <p class="fs-5">Rémunération Estimée : <strong class="text-success">${formatAmount(remuneration.totalPay)}</strong></p>
            `;
    } else if (data.riderType === 'moto') {
      content = `
                 <p><small>Type : Livreur à Moto</small></p>
                 <div class="row">
                     <div class="col-sm-6">Salaire de Base : <strong>${formatAmount(remuneration.baseSalary)}</strong></div>
                     <div class="col-sm-6">Prime Performance : <strong>${formatAmount(remuneration.performanceBonus)}</strong></div>
                 </div>
                 <hr>
                 <p class="fs-5">Rémunération Totale Estimée : <strong class="text-success">${formatAmount(remuneration.totalPay)}</strong></p>
             `;
    } else {
      content = '<p class="text-muted">Type de livreur non défini ou données de rémunération manquantes.</p>';
    }
    container.innerHTML = content;
  };

  /**
   * Met à jour les objectifs admin dans la modale.
   * @param {Object} data - Les données de performance.
   */
  const updateModalAdminObjectives = (data) => {
    const container = document.getElementById('modal-admin-objectives');
    if (!container || data.riderType !== 'moto' || !data.objectivesAdmin) {
      if (container) container.innerHTML = '<p class="text-muted">Aucun objectif admin défini pour cette période.</p>';
      return;
    }
    const obj = data.objectivesAdmin;
    const achieved = Number(obj.achieved) || 0;
    const target = Number(obj.target) || 0;
    const bonusThreshold = Number(obj.bonusThreshold) || 0;
    const percentage = target > 0 ? Math.min(100, (achieved / target * 100)) : 0;

    let progressClass = 'bg-secondary';
    if (target > 0 && achieved >= bonusThreshold) {
      if (percentage >= 100) progressClass = 'bg-success';
      else if (percentage >= 85) progressClass = 'bg-primary';
      else progressClass = 'bg-info';
    } else if (target > 0) {
      progressClass = 'bg-warning';
    }

    container.innerHTML = `
             <div>Objectif fixé : <strong>${target > 0 ? target : '--'}</strong> courses</div>
             <div class="progress mt-2 mb-2" style="height: 1.25rem;" title="${achieved} / ${target > 0 ? target : '--'} courses">
                 <div class="progress-bar ${progressClass} progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${percentage.toFixed(1)}%;"
                      aria-valuenow="${percentage.toFixed(1)}" aria-valuemin="0" aria-valuemax="100">
                      ${percentage.toFixed(1)}%
                 </div>
             </div>
             <div class="d-flex justify-content-between flex-wrap">
                 <small>Prime/course : <strong>${formatAmount(obj.bonusPerDelivery, '')}</strong></small>
                 <small>Prime estimée : <strong>${formatAmount(data.remuneration?.performanceBonus)}</strong></small>
             </div>
         `;
  };

  /**
   * Rend le graphique de performance dans la modale.
   * @param {Object} chartData - Les données pour Chart.js.
   */
  const renderModalChart = (chartData) => {
    const canvas = document.getElementById('modalPerformanceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (performanceChart) performanceChart.destroy();

    if (!chartData || !chartData.labels || chartData.labels.length === 0 || !chartData.data || chartData.data.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "14px Arial";
      ctx.fillStyle = "#6c757d";
      ctx.textAlign = "center";
      ctx.fillText("Aucune donnée pour le graphique.", canvas.width / 2, canvas.height / 2);
      return;
    }

    performanceChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [{
          label: 'Courses Livrées*',
          data: chartData.data,
          backgroundColor: 'rgba(74, 100, 145, 0.6)',
          borderColor: 'rgba(74, 100, 145, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              precision: 0
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                let label = context.dataset.label || '';
                if (label) { label += ': '; }
                if (context.parsed.y !== null) {
                  label += context.parsed.y;
                }
                return label;
              }
            }
          }
        }
      }
    });
  };


  /**
   * Récupère et affiche le journal de performance.
   * @param {string} userId - ID de l'utilisateur.
   * @param {string} period - La période sélectionnée.
   */
  const fetchAndRenderPerformanceJournal = async (userId, period) => {
    if (!performanceJournalBody) return;
    showLoading(performanceJournalBody, 6);
    const headers = getAuthHeader();
    if (!headers) return showError(performanceJournalBody, "Erreur d'authentification.", 6);

    try {
      // Appel API performance-journal
      const response = await axios.get(`${API_BASE_URL}/deliverymen/${userId}/performance-journal`, {
        params: { period: period }, headers
      });
      const journalData = response.data;

      performanceJournalBody.innerHTML = '';
      if (!journalData || journalData.length === 0) {
        showError(performanceJournalBody, "Aucune donnée journalière pour cette période.", 6);
        return;
      }

      journalData.forEach(day => {
        const row = performanceJournalBody.insertRow();
        const netResult = (day.ca || 0) - (day.expenses || 0);
        row.innerHTML = `
                    <td>${moment(day.date).format('DD/MM/YYYY')}</td>
                    <td class="text-center">${day.received || 0}</td>
                    <td class="text-center text-success">${day.delivered || 0}</td>
                    <td class="text-end">${formatAmount(day.ca)}</td>
                    <td class="text-end text-danger">${formatAmount(day.expenses)}</td>
                    <td class="text-end fw-bold ${netResult >= 0 ? 'text-success' : 'text-danger'}">${formatAmount(netResult)}</td>
                `;
      });

    } catch (error) {
      console.error("Erreur fetchAndRenderPerformanceJournal:", error);
      showError(performanceJournalBody, "Erreur chargement journal.", 6);
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    }
  };


  /**
   * Récupère et peuple les paramètres du livreur.
   * @param {string} userId - ID de l'utilisateur.
   */
  const fetchAndPopulateSettings = async (userId) => {
    const headers = getAuthHeader();
    if (!headers) {
      settingsFeedbackEl.textContent = "Erreur d'authentification.";
      settingsFeedbackEl.className = 'mt-2 text-danger small';
      return;
    }
    try {
      // Appel API settings
      const response = await axios.get(`${API_BASE_URL}/deliverymen/${userId}/settings`, { headers });
      const settings = response.data;

      settingVehicleTypeSelect.value = settings.vehicle_type || '';
      settingBaseSalaryInput.value = settings.base_salary ?? '';
      settingCommissionRateInput.value = settings.commission_rate ?? '';
      settingMonthlyObjectiveInput.value = settings.monthly_objective ?? '';
      settingUserStatusSelect.value = settings.status || 'inactif';

      toggleSettingsFields(settings.vehicle_type);
      settingsFeedbackEl.textContent = '';

    } catch (error) {
      console.error("Erreur fetchAndPopulateSettings:", error);
      settingsFeedbackEl.textContent = error.response?.data?.message || "Erreur chargement paramètres.";
      settingsFeedbackEl.className = 'mt-2 text-danger small';
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    }
  };

  /**
   * Active ou désactive les champs de salaire/commission selon le type de véhicule.
   * @param {string} vehicleType - Type de véhicule.
   */
  const toggleSettingsFields = (vehicleType) => {
    const isMoto = vehicleType === 'moto';
    const isPied = vehicleType === 'pied';

    settingBaseSalaryInput.disabled = !isMoto;
    settingMonthlyObjectiveInput.disabled = !isMoto;
    settingCommissionRateInput.disabled = !isPied;

    if (!isMoto) {
      settingBaseSalaryInput.value = '';
      settingMonthlyObjectiveInput.value = '';
    }
    if (!isPied) {
      settingCommissionRateInput.value = '';
    }
  };

  /**
   * Récupère et affiche la liste des absences individuelles.
   * @param {string} userId - ID de l'utilisateur.
   */
  const fetchAndRenderAbsences = async (userId) => {
    showLoading(modalAbsencesListEl, 1);
    const headers = getAuthHeader();
    if (!headers) return showError(modalAbsencesListEl, "Erreur d'authentification.", 1);

    try {
      // Appel API absences
      const response = await axios.get(`${API_BASE_URL}/schedule/absences`, { params: { userId }, headers });
      const absences = response.data;

      if (!absences || absences.length === 0) {
        modalAbsencesListEl.innerHTML = '<p class="text-muted text-center p-3">Aucune absence enregistrée.</p>';
        return;
      }

      let listHtml = '<ul class="list-group list-group-flush">';
      absences.sort((a, b) => moment(b.absence_date).diff(moment(a.absence_date)));
      absences.forEach(abs => {
        if (abs.type !== 'ferie') {
          listHtml += `<li class="list-group-item d-flex justify-content-between align-items-center flex-wrap">
                        <div class="me-3 mb-1 mb-sm-0">
                            <strong>${moment(abs.absence_date).format('DD/MM/YYYY')}</strong> - <span class="badge bg-secondary">${abs.type}</span>
                            <br><small class="text-muted">${abs.motif || 'Aucun motif'}</small>
                        </div>
                        <button class="btn btn-sm btn-outline-danger delete-absence-btn" data-absence-id="${abs.id}" title="Supprimer cet enregistrement"><i class="bi bi-trash"></i></button>
                     </li>`;
        }
      });
      listHtml += '</ul>';
      modalAbsencesListEl.innerHTML = listHtml || '<p class="text-muted text-center p-3">Aucune absence individuelle enregistrée.</p>';

    } catch (error) {
      console.error("Erreur fetchAndRenderAbsences:", error);
      showError(modalAbsencesListEl, "Erreur chargement absences.", 1);
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    }
  };

  /**
   * Récupère et affiche la liste globale des absences/fériés.
   */
  const fetchGlobalAbsencesList = async () => {
    showLoading(absencesEventsListEl, 1);
    const headers = getAuthHeader();
    if (!headers) return showError(absencesEventsListEl, "Erreur d'authentification.", 1);

    try {
      const response = await axios.get(`${API_BASE_URL}/schedule/absences`, { headers });
      const events = response.data;

      if (!Array.isArray(events) || events.length === 0) {
        absencesEventsListEl.innerHTML = '<p class="text-muted text-center p-3">Aucun événement enregistré.</p>';
        if (absenceListPeriodEl) absenceListPeriodEl.textContent = "Période par défaut";
        return;
      }

      if (absenceListPeriodEl) absenceListPeriodEl.textContent = "Historique";


      let listHtml = '<ul class="list-group list-group-flush">';
      events.sort((a, b) => moment(b.absence_date).diff(moment(a.absence_date)));
      events.forEach(evt => {
        let livreurInfo = evt.type === 'ferie' ? '<i>(Tous les livreurs)</i>' : (evt.livreur_name || `Livreur ID: ${evt.user_id || '?'}`);
        listHtml += `<li class="list-group-item d-flex justify-content-between align-items-center flex-wrap">
                    <div class="me-3 mb-1 mb-sm-0">
                        <strong>${moment(evt.absence_date).format('DD/MM/YYYY')}</strong> - <span class="badge bg-info text-dark">${evt.type}</span> : ${evt.motif || ''}
                        <br><small class="text-muted">${livreurInfo}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-danger delete-absence-btn" data-absence-id="${evt.id}" title="Supprimer"><i class="bi bi-trash"></i></button>
                 </li>`;
      });
      listHtml += '</ul>';
      absencesEventsListEl.innerHTML = listHtml;

    } catch (error) {
      console.error("Erreur fetchGlobalAbsencesList:", error);
      showError(absencesEventsListEl, "Erreur chargement événements.", 1);
      if (absenceListPeriodEl) absenceListPeriodEl.textContent = "Erreur";
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    }
  };


  // --- GESTION ÉVÉNEMENTS ---

  /**
   * Initialise les écouteurs d'événements principaux.
   */
  const initializeEventListeners = () => {
    // Sidebar & Logout
    sidebarToggler?.addEventListener('click', () => {
      if (window.innerWidth < 992) sidebar?.classList.toggle('show');
      else { sidebar?.classList.toggle('collapsed'); mainContent?.classList.toggle('expanded'); }
    });
    logoutBtn?.addEventListener('click', () => AuthManager.logout());

    // Filtres principaux
    filterBtn?.addEventListener('click', fetchAndRenderMainData);
    searchInput?.addEventListener('input', debounce(fetchAndRenderMainData));
    startDateInput?.addEventListener('change', fetchAndRenderMainData);
    endDateInput?.addEventListener('change', fetchAndRenderMainData);

    // Clic bouton "Gérer / Détails"
    deliverymenTableBody?.addEventListener('click', (e) => {
      const detailsButton = e.target.closest('.details-btn');
      if (detailsButton) {
        const userId = detailsButton.dataset.userid;
        const userName = detailsButton.dataset.name;
        if (userId && userName) {
          openLivreurDetailsModal(userId, userName);
        } else {
          console.error("User ID ou Nom manquant sur le bouton Gérer");
          showNotification("Données du livreur manquantes.", "warning");
        }
      }
    });

    // Modale Détails: Changement période performance (déclenche deux chargements)
    modalPerformancePeriodSelect?.addEventListener('change', (e) => {
      const userId = settingLivreurUserIdInput.value;
      if (userId) {
        // Déclenche l'appel principal qui va recharger le journal ensuite
        fetchAndRenderModalPerformance(userId, e.target.value);
      }
    });

    // Modale Détails: Changement type livreur
    settingVehicleTypeSelect?.addEventListener('change', (e) => toggleSettingsFields(e.target.value));

    // Modale Détails: Sauvegarde Paramètres
    livreurSettingsForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      settingsFeedbackEl.textContent = 'Enregistrement...';
      settingsFeedbackEl.className = 'mt-2 text-info small';
      const userId = settingLivreurUserIdInput.value;
      const headers = getAuthHeader();
      if (!headers) return;

      const settingsData = {
        vehicle_type: settingVehicleTypeSelect.value,
        base_salary: settingVehicleTypeSelect.value === 'moto' ? (Number(settingBaseSalaryInput.value) || null) : null,
        commission_rate: settingVehicleTypeSelect.value === 'pied' ? (Number(settingCommissionRateInput.value) || null) : null,
        monthly_objective: settingVehicleTypeSelect.value === 'moto' ? (Number(settingMonthlyObjectiveInput.value) || null) : null,
        status: settingUserStatusSelect.value
      };

      if (!settingsData.vehicle_type) { settingsFeedbackEl.textContent = 'Veuillez choisir un type.'; settingsFeedbackEl.className = 'mt-2 text-danger small'; return; }
      if (settingsData.vehicle_type === 'moto' && (settingsData.base_salary === null || settingsData.base_salary < 0)) { settingsFeedbackEl.textContent = 'Salaire de base invalide pour moto.'; settingsFeedbackEl.className = 'mt-2 text-danger small'; return; }
      if (settingsData.vehicle_type === 'pied' && (settingsData.commission_rate === null || settingsData.commission_rate < 0 || settingsData.commission_rate > 100)) { settingsFeedbackEl.textContent = 'Taux de commission invalide (0-100) pour pied.'; settingsFeedbackEl.className = 'mt-2 text-danger small'; return; }
      if (!settingsData.status) { settingsFeedbackEl.textContent = 'Veuillez choisir un statut.'; settingsFeedbackEl.className = 'mt-2 text-danger small'; return; }


      try {
        await axios.put(`${API_BASE_URL}/deliverymen/${userId}/settings`, settingsData, { headers });
        settingsFeedbackEl.textContent = 'Paramètres enregistrés !';
        settingsFeedbackEl.className = 'mt-2 text-success small';
        fetchAndRenderMainData();
      } catch (error) {
        console.error("Erreur sauvegarde paramètres:", error);
        settingsFeedbackEl.textContent = error.response?.data?.message || 'Erreur sauvegarde.';
        settingsFeedbackEl.className = 'mt-2 text-danger small';
        if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
      } finally {
        setTimeout(() => { settingsFeedbackEl.textContent = ''; }, 4000);
      }
    });

    // Modale Détails: Soumission Ajout Absence
    addAbsenceForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = absenceLivreurUserIdInput.value;
      const headers = getAuthHeader();
      if (!headers) return;

      const absenceData = {
        user_ids: [userId],
        absence_date: absenceDateInput.value,
        type: absenceTypeSelect.value,
        motif: absenceMotifInput.value.trim()
      };

      if (!absenceData.absence_date) { showNotification("Veuillez choisir une date.", "warning"); return; }

      try {
        await axios.post(`${API_BASE_URL}/schedule/absences`, absenceData, { headers });
        showNotification('Absence enregistrée.');
        addAbsenceModal.hide();
        addAbsenceForm.reset();
        if (absenceDateInput) absenceDateInput.value = getTodayDate();
        await fetchAndRenderAbsences(userId);
        fetchAndRenderMainData();
      } catch (error) {
        console.error("Erreur ajout absence:", error);
        showNotification(error.response?.data?.message || 'Erreur enregistrement.', 'danger');
        if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
      }
    });

    // Modale Détails: Clic Suppression Absence
    modalAbsencesListEl?.addEventListener('click', async (e) => {
      const deleteButton = e.target.closest('.delete-absence-btn');
      if (deleteButton) {
        const absenceId = deleteButton.dataset.absenceId;
        const userId = settingLivreurUserIdInput.value;
        const headers = getAuthHeader();
        if (!headers || !absenceId || !userId) return;

        if (confirm('Voulez-vous vraiment supprimer cet enregistrement ?')) {
          try {
            await axios.delete(`${API_BASE_URL}/schedule/absences/${absenceId}`, { headers });
            showNotification('Absence supprimée.');
            await fetchAndRenderAbsences(userId);
            fetchAndRenderMainData();
          } catch (error) {
            console.error("Erreur suppression absence:", error);
            showNotification(error.response?.data?.message || 'Erreur suppression.', 'danger');
            if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
          }
        }
      }
    });

    // Modale Globale Absences: Changement Type
    manageAbsenceTypeSelect?.addEventListener('change', (e) => {
      const isFerie = e.target.value === 'ferie';
      manageAbsenceLivreurSelect.disabled = isFerie;
      manageAbsenceLivreurSelect.required = !isFerie;
      if (isFerie) {
        Array.from(manageAbsenceLivreurSelect.options).forEach(opt => opt.selected = false);
      }
    });

    // Modale Globale Absences: Soumission Formulaire
    manageAbsenceForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const selectedLivreurIds = Array.from(manageAbsenceLivreurSelect.selectedOptions).map(opt => opt.value);
      const type = manageAbsenceTypeSelect.value;
      const headers = getAuthHeader();
      if (!headers) return;

      if (type !== 'ferie' && selectedLivreurIds.length === 0) { showNotification("Sélectionnez livreur(s) ou 'Jour Férié'.", "warning"); return; }
      if (!manageAbsenceMotifInput.value.trim()) { showNotification("Veuillez indiquer un motif/nom.", "warning"); return; }
      if (!manageAbsenceDateInput.value) { showNotification("Veuillez choisir une date.", "warning"); return; }

      const absenceData = {
        absence_date: manageAbsenceDateInput.value,
        type: type,
        motif: manageAbsenceMotifInput.value.trim(),
        user_ids: type === 'ferie' ? null : selectedLivreurIds
      };

      try {
        await axios.post(`${API_BASE_URL}/schedule/absences`, absenceData, { headers });
        showNotification('Événement enregistré.');
        manageAbsenceForm.reset();
        if (manageAbsenceDateInput) manageAbsenceDateInput.value = getTodayDate();
        manageAbsenceLivreurSelect.disabled = true;
        await fetchGlobalAbsencesList();
        fetchAndRenderMainData();
      } catch (error) {
        console.error("Erreur ajout événement global:", error);
        showNotification(error.response?.data?.message || 'Erreur enregistrement.', 'danger');
        if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
      }
    });

    // Modale Globale Absences: Chargement Livreurs et Liste à l'ouverture
    absencesModalEl?.addEventListener('show.bs.modal', async () => {
      manageAbsenceLivreurSelect.innerHTML = '<option value="" disabled>Chargement...</option>';
      absencesEventsListEl.innerHTML = '<p class="text-muted p-3">Chargement...</p>';
      const headers = getAuthHeader();
      if (!headers) return;

      try {
        const response = await axios.get(`${API_BASE_URL}/deliverymen`, { params: { status: 'actif' }, headers });
        manageAbsenceLivreurSelect.innerHTML = '';
        response.data.forEach(livreur => {
          const option = document.createElement('option');
          option.value = livreur.id;
          option.textContent = livreur.name;
          manageAbsenceLivreurSelect.appendChild(option);
        });
        manageAbsenceLivreurSelect.disabled = (manageAbsenceTypeSelect.value === 'ferie');
        await fetchGlobalAbsencesList();
      } catch (error) {
        manageAbsenceLivreurSelect.innerHTML = '<option value="" disabled>Erreur</option>';
        showError(absencesEventsListEl, "Erreur chargement.", 1);
        console.error("Erreur chargement modale absences globale:", error);
        if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
      }
    });

    // Modale Globale Absences: Clic Suppression Événement
    absencesEventsListEl?.addEventListener('click', async (e) => {
      const deleteButton = e.target.closest('.delete-absence-btn');
      if (deleteButton) {
        const absenceId = deleteButton.dataset.absenceId;
        const headers = getAuthHeader();
        if (!headers || !absenceId) return;

        if (confirm('Voulez-vous vraiment supprimer cet événement ?')) {
          try {
            await axios.delete(`${API_BASE_URL}/schedule/absences/${absenceId}`, { headers });
            showNotification('Événement supprimé.');
            await fetchGlobalAbsencesList();
            fetchAndRenderMainData();
          } catch (error) {
            console.error("Erreur suppression événement global:", error);
            showNotification(error.response?.data?.message || 'Erreur suppression.', 'danger');
            if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
          }
        }
      }
    });

    // TODO: Ajouter les listeners pour les ACTIONS GROUPÉES (la logique API est similaire aux appels unitaires/manuels)
  };

  // --- INITIALISATION ---
  const initializeApp = async () => {
    currentUser = AuthManager.getUser();
    if (!currentUser) {
      console.error("Utilisateur non connecté ou AuthManager non initialisé.");
      return;
    }

    if (userNameDisplay) userNameDisplay.textContent = currentUser.name;

    const today = getTodayDate();
    if (startDateInput) startDateInput.value = today;
    if (endDateInput) endDateInput.value = today;
    if (manageAbsenceDateInput) manageAbsenceDateInput.value = today;
    if (absenceDateInput) absenceDateInput.value = today;

    initializeEventListeners();
    await fetchAndRenderMainData();
  };

  // Attendre que AuthManager soit prêt
  if (typeof AuthManager !== 'undefined' && AuthManager.getToken()) {
    initializeApp();
  } else {
    document.addEventListener('authManagerReady', initializeApp);
    setTimeout(() => {
      if (typeof AuthManager !== 'undefined' && AuthManager.getToken()) {
        if (!currentUser) initializeApp();
      } else {
        console.error("AuthManager non prêt après timeout.");
        showNotification("Erreur critique d'initialisation.", "danger");
      }
    }, 1000);
  }
});