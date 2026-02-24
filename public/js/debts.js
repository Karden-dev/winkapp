// js/debts.js

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = '/api';
   // Simulation de la récupération de l'utilisateur connecté
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    const user = storedUser ? JSON.parse(storedUser) : { id: 1, name: 'Admin Test', token: 'mock-token' };
    const CURRENT_USER_ID = user.id;

    // --- RÉFÉRENCES DOM (Onglet 1: En attente) ---
    const debtsTableBody = document.getElementById('debtsTableBody');
    const searchInput = document.getElementById('searchInput');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const filterBtn = document.getElementById('filterBtn');
    
    // --- RÉFÉRENCES DOM (Onglet 2: Historique) ---
    const paidDatePicker = document.getElementById('paid-date-picker');
    const searchPaidDebtsBtn = document.getElementById('search-paid-debts-btn');
    const paidDebtsTableBody = document.getElementById('paidDebtsTableBody');
    
    // --- RÉFÉRENCES DOM (Cartes de statistiques) ---
    const debtorsCount = document.getElementById('debtorsCount');
    const totalPendingDebts = document.getElementById('totalPendingDebts');
    const totalPaidDebts = document.getElementById('totalPaidDebts');
    const settlementRate = document.getElementById('settlementRate');

    // --- RÉFÉRENCES DOM (Modale) ---
    const debtModal = new bootstrap.Modal(document.getElementById('addDebtModal'));
    const debtForm = document.getElementById('debtForm');
    const debtIdInput = document.getElementById('debtId');
    const shopSelect = document.getElementById('shopSelect');
    const amountInput = document.getElementById('amountInput');
    const typeSelect = document.getElementById('typeSelect');
    const dateInput = document.getElementById('dateInput');
    const commentInput = document.getElementById('commentInput');
    const debtSubmitBtn = document.getElementById('debtSubmitBtn');
    const addDebtModalLabel = document.getElementById('addDebtModalLabel');

    // --- RÉFÉRENCES DOM (Général) ---
    const sidebarToggler = document.getElementById('sidebar-toggler');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const logoutBtn = document.getElementById('logoutBtn');

    // --- Caches de données ---
    let shopsCache = [];
    let pendingDebtsCache = []; // Cache pour les dettes "En attente" filtrées
    let paidDebtsCache = [];   // Cache pour les dettes "Réglées" filtrées

    // (NOUVEAU) Mémorise la dernière action de filtrage pour les rafraîchissements
    let lastFetchFunction = async () => {};

    // --- Dictionnaires ---
    const statusTranslations = { 'pending': 'En attente', 'paid': 'Réglé' };
    const typeTranslations = {
        'daily_balance': 'Bilan Négatif',
        'storage_fee': 'Frais de Stockage',
        'packaging': 'Frais d\'Emballage',
        'expedition': 'Frais d\'Expédition',
        'other': 'Autre'
    };
    const statusClasses = { 'pending': 'text-warning', 'paid': 'text-success' };

    // --- FONCTIONS UTILITAIRES ---
    
    const showNotification = (message, type = 'success') => {
        const container = document.getElementById('notification-container');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alert);
        
        setTimeout(() => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }, 4000); 
    };

    const formatAmount = (amount) => `${parseFloat(amount || 0).toLocaleString('fr-FR')} FCFA`;

    // --- FONCTIONS PRINCIPALES (LOGIQUE SYNCHRONISÉE) ---
    
    /**
     * (MODIFIÉ)
     * Filtre sur l'onglet "En attente".
     * Déclenche une mise à jour des *deux* ensembles de données en utilisant les dates de *création* comme référence.
     */
    const fetchPendingDebts = async () => {
        // Mémorise cette action pour les futurs rafraîchissements
        lastFetchFunction = fetchPendingDebts;

        const startDate = startDateFilter.value;
        const endDate = endDateFilter.value;
        const search = searchInput.value;

        // 1. Paramètres pour les dettes "En attente" (basé sur la date de création)
        const pendingParams = {
            search: search,
            startDate: startDate,
            endDate: endDate,
            status: 'pending'
        };

        // 2. Paramètres pour les dettes "Réglées" (basé sur la *même* plage de dates, mais pour le règlement)
        const paidParams = {
            search: search,
            settledStartDate: startDate, // Le backend devra gérer settledStartDate
            settledEndDate: endDate,     // et settledEndDate
            status: 'paid'
        };

        try {
            // Lance les deux requêtes en parallèle
            const [pendingResponse, paidResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/debts`, { params: pendingParams }),
                axios.get(`${API_BASE_URL}/debts`, { params: paidParams })
            ]);

            pendingDebtsCache = pendingResponse.data;
            paidDebtsCache = paidResponse.data;

            // Met à jour les deux tableaux
            renderDebtsTable(pendingDebtsCache);
            renderPaidDebtsTable(paidDebtsCache);
            
            // Met à jour les stats globales
            updateGlobalStats();
        } catch (error) {
            console.error("Erreur lors de la récupération synchronisée (pending):", error);
            showNotification("Erreur lors du chargement des données.", "danger");
        }
    };

    /**
     * (MODIFIÉ)
     * Filtre sur l'onglet "Historique".
     * Déclenche une mise à jour des *deux* ensembles de données en utilisant la date de *paiement* comme référence.
     */
    const fetchPaidDebts = async () => {
        // Mémorise cette action pour les futurs rafraîchissements
        lastFetchFunction = fetchPaidDebts;
        
        const settledDate = paidDatePicker.value;
        const search = searchInput.value; // Utilise aussi le champ de recherche global

        if (!settledDate) {
            paidDebtsTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Veuillez sélectionner une date de paiement.</td></tr>`;
            debtsTableBody.innerHTML = `<tr><td colspan="8" class="text-center p-3">Synchronisé avec l'onglet "Historique".</td></tr>`;
            pendingDebtsCache = [];
            paidDebtsCache = [];
            updateGlobalStats();
            return;
        }

        // 1. Paramètres pour les dettes "En attente" (basé sur la date de l'historique, appliquée à la création)
        const pendingParams = {
            search: search,
            startDate: settledDate, // Date unique
            endDate: settledDate,   // Date unique
            status: 'pending'
        };

        // 2. Paramètres pour les dettes "Réglées" (basé sur la date de paiement)
        const paidParams = {
            search: search,
            settledStartDate: settledDate, // Le backend gérera "settledStartDate" et "settledEndDate"
            settledEndDate: settledDate,
            status: 'paid'
        };

        try {
            // Lance les deux requêtes en parallèle
            const [pendingResponse, paidResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/debts`, { params: pendingParams }),
                axios.get(`${API_BASE_URL}/debts`, { params: paidParams })
            ]);

            pendingDebtsCache = pendingResponse.data;
            paidDebtsCache = paidResponse.data;

            // Met à jour les deux tableaux
            renderDebtsTable(pendingDebtsCache);
            renderPaidDebtsTable(paidDebtsCache);
            
            // Met à jour les stats globales
            updateGlobalStats();
        } catch (error) {
             console.error("Erreur lors de la récupération synchronisée (paid):", error);
            showNotification("Erreur lors du chargement des données.", "danger");
        }
    };
    
    const fetchShops = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/shops?status=actif`);
            shopsCache = response.data;
            shopSelect.innerHTML = '<option value="">Sélectionner un marchand</option>';
            shopsCache.forEach(shop => {
                const option = document.createElement('option');
                option.value = shop.id;
                option.textContent = shop.name;
                shopSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Erreur lors du chargement des marchands:", error);
            showNotification("Erreur lors du chargement de la liste des marchands.", "danger");
        }
    };

    /**
     * (INCHANGÉ)
     * Met à jour les cartes de statistiques en se basant sur les DEUX caches de données.
     */
    const updateGlobalStats = () => {
        let pendingSum = 0;
        let paidSum = 0;
        const pendingDebtors = new Set();

        // 1. Calculer les totaux "En attente" (basé sur le filtre de l'onglet 1)
        pendingDebtsCache.forEach(debt => {
            if (debt.status === 'pending') {
                pendingSum += parseFloat(debt.amount);
                pendingDebtors.add(debt.shop_id);
            }
        });

        // 2. Calculer les totaux "Réglés" (basé sur le filtre de l'onglet 2)
        paidDebtsCache.forEach(debt => {
            if (debt.status === 'paid') {
                paidSum += parseFloat(debt.amount);
            }
        });

        // 3. Calculer les stats globales
        const totalDebtAmount = pendingSum + paidSum;
        const rate = totalDebtAmount > 0 ? (paidSum / totalDebtAmount) * 100 : 0;

        // 4. Mettre à jour les cartes
        debtorsCount.textContent = pendingDebtors.size;
        totalPendingDebts.textContent = formatAmount(pendingSum);
        totalPaidDebts.textContent = formatAmount(paidSum);
        settlementRate.textContent = `${rate.toFixed(1)}%`;
    };

    /**
     * (INCHANGÉ) Génère et affiche les lignes du tableau des créances "En attente".
     */
    const renderDebtsTable = (debts) => {
        debtsTableBody.innerHTML = '';
        if (debts.length === 0) {
            debtsTableBody.innerHTML = `<tr><td colspan="8" class="text-center p-3">Aucune créance en attente pour les filtres sélectionnés.</td></tr>`;
            return;
        }

        debts.forEach(debt => {
            const row = document.createElement('tr');
            const statusClass = statusClasses[debt.status] || 'text-secondary';
            const isManual = debt.type !== 'daily_balance';
            const settledAtDisplay = debt.settled_at ? moment(debt.settled_at).format('DD/MM/YYYY') : 'N/A';
            
            row.innerHTML = `
                <td>${moment(debt.created_at).format('DD/MM/YYYY')}</td>
                <td>${debt.shop_name}</td>
                <td class="text-danger fw-bold">${formatAmount(debt.amount)}</td>
                <td><span class="badge bg-secondary">${typeTranslations[debt.type] || debt.type}</span></td>
                <td>${debt.comment || 'N/A'}</td>
                <td><span class="${statusClass} fw-bold">${statusTranslations[debt.status]}</span></td>
                <td>${settledAtDisplay}</td>
                <td class="text-center">
                    <div class="dropdown">
                        <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i class="bi bi-gear"></i>
                        </button>
                        <ul class="dropdown-menu">
                            ${debt.status === 'pending' ? `<li><a class="dropdown-item settle-btn" href="#" data-id="${debt.id}"><i class="bi bi-check-circle"></i> Régler</a></li>` : ''}
                            <li><a class="dropdown-item edit-btn ${!isManual || debt.status !== 'pending' ? 'disabled' : ''}" href="#" data-id="${debt.id}"><i class="bi bi-pencil"></i> Modifier</a></li>
                            <li><a class="dropdown-item delete-btn text-danger ${!isManual || debt.status !== 'pending' ? 'disabled' : ''}" href="#" data-id="${debt.id}"><i class="bi bi-trash"></i> Supprimer</a></li>
                        </ul>
                    </div>
                </td>
            `;
            debtsTableBody.appendChild(row);
        });
    };

    /**
     * (INCHANGÉ) Génère et affiche les lignes du tableau des créances "Réglées".
     */
    const renderPaidDebtsTable = (debts) => {
        paidDebtsTableBody.innerHTML = '';
        if (debts.length === 0) {
            paidDebtsTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucune créance réglée trouvée pour les filtres sélectionnés.</td></tr>`;
            return;
        }

        debts.forEach(debt => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${debt.shop_name}</td>
                <td>${moment(debt.created_at).format('DD/MM/YYYY')}</td>
                <td>${moment(debt.settled_at).format('DD/MM/YYYY')}</td>
                <td class="text-success fw-bold">${formatAmount(debt.amount)}</td>
                <td><span class="badge bg-secondary">${typeTranslations[debt.type] || debt.type}</span></td>
                <td>${debt.comment || 'N/A'}</td>
            `;
            paidDebtsTableBody.appendChild(row);
        });
    };

    /**
     * (MODIFIÉ)
     * Gère la soumission du formulaire d'ajout/modification de créance.
     */
    const handleDebtFormSubmit = async (e) => {
        e.preventDefault();
        const debtData = {
            shop_id: shopSelect.value,
            amount: amountInput.value,
            type: typeSelect.value,
            comment: commentInput.value,
            created_at: dateInput.value,
            created_by: CURRENT_USER_ID,
            updated_by: CURRENT_USER_ID
        };

        try {
            if (debtIdInput.value) {
                await axios.put(`${API_BASE_URL}/debts/${debtIdInput.value}`, debtData);
                showNotification("Créance modifiée avec succès !");
            } else {
                await axios.post(`${API_BASE_URL}/debts`, debtData);
                showNotification("Créance manuelle ajoutée avec succès !");
            }
            debtModal.hide();
            await lastFetchFunction(); // Recharge les données en utilisant le dernier filtre appliqué
        } catch (error) {
            showNotification(error.response?.data?.message || "Erreur lors de l'enregistrement.", 'danger');
        }
    };

    /**
     * (MODIFIÉ)
     * Gère les actions sur les lignes du tableau "En attente".
     */
    const handleTableActions = async (e) => {
        const target = e.target.closest('a');
        if (!target || target.classList.contains('disabled')) return;
        
        e.preventDefault(); 

        const debtId = target.dataset.id;
        
        if (target.classList.contains('edit-btn')) {
            const debt = pendingDebtsCache.find(d => d.id == debtId);
            if (debt) {
                // Logique de remplissage de la modale (inchangée)
                debtIdInput.value = debt.id;
                shopSelect.value = debt.shop_id;
                amountInput.value = debt.amount;
                typeSelect.value = debt.type;
                commentInput.value = debt.comment;
                dateInput.value = moment(debt.created_at).format('YYYY-MM-DD');
                addDebtModalLabel.textContent = "Modifier la créance manuelle";
                debtSubmitBtn.textContent = "Sauvegarder";
                debtModal.show();
            }
        } else if (target.classList.contains('delete-btn')) {
            if (confirm("Êtes-vous sûr de vouloir supprimer cette créance manuelle ?")) {
                try {
                    await axios.delete(`${API_BASE_URL}/debts/${debtId}`);
                    showNotification("Créance supprimée.");
                    await lastFetchFunction(); // Recharge les données
                } catch (error) {
                    showNotification("Erreur lors de la suppression.", "danger");
                }
            }
        } else if (target.classList.contains('settle-btn')) {
             if (confirm("Confirmer le règlement de cette créance ?")) {
                try {
                    await axios.put(`${API_BASE_URL}/debts/${debtId}/settle`, { userId: CURRENT_USER_ID });
                    showNotification("Créance réglée avec succès.");
                    await lastFetchFunction(); // Recharge les données
                } catch (error) {
                    showNotification(error.response?.data?.message || "Erreur lors du règlement.", "danger");
                }
            }
        }
    };

    // --- INITIALISATION ---
    
    const initializeApp = async () => {
        const today = moment().format('YYYY-MM-DD');
        startDateFilter.value = today;
        endDateFilter.value = today;
        dateInput.value = today;
        paidDatePicker.value = today; 
        
        // Définit le fetch par défaut
        lastFetchFunction = fetchPendingDebts;

        // --- Sidebar et déconnexion ---
        sidebarToggler?.addEventListener('click', () => {
            if (window.innerWidth < 992) {
                sidebar?.classList.toggle('show');
            } else {
                sidebar?.classList.toggle('collapsed');
                mainContent?.classList.toggle('expanded');
            }
        });
        logoutBtn?.addEventListener('click', () => { 
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
            window.location.href = 'index.html'; 
        });
        
        // --- Écouteurs pour l'onglet "En attente" ---
        filterBtn.addEventListener('click', fetchPendingDebts);
        searchInput.addEventListener('input', fetchPendingDebts);
        startDateFilter.addEventListener('change', fetchPendingDebts);
        endDateFilter.addEventListener('change', fetchPendingDebts);

        // --- Écouteurs pour l'onglet "Historique (Réglé)" ---
        searchPaidDebtsBtn.addEventListener('click', fetchPaidDebts);
        paidDatePicker.addEventListener('change', fetchPaidDebts);

        // --- Écouteurs de la modale ---
        debtForm.addEventListener('submit', handleDebtFormSubmit);
        debtsTableBody.addEventListener('click', handleTableActions);
        
        // Réinitialisation de la modale
        document.getElementById('addDebtModal').addEventListener('hidden.bs.modal', () => {
            debtForm.reset();
            debtIdInput.value = '';
            dateInput.value = moment().format('YYYY-MM-DD');
            addDebtModalLabel.textContent = "Ajouter une créance manuelle";
            debtSubmitBtn.textContent = "Ajouter";
        });
        
        // Mise en évidence du lien actif
        const currentPath = window.location.pathname.split('/').pop();
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        const activeDebtLink = document.querySelector(`.dropdown-item[href="${currentPath}"]`);
        if (activeDebtLink) {
            activeDebtLink.classList.add('active');
            const parentDropdownToggle = activeDebtLink.closest('.dropdown').querySelector('.dropdown-toggle');
            if (parentDropdownToggle) {
                parentDropdownToggle.classList.add('active');
            }
        }

        // Chargement initial
        await fetchShops();
        await fetchPendingDebts(); // Charge les données initiales (basé sur 'today')
    };

    initializeApp();
});