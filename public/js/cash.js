// js/cash.js

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = 'http://localhost:3000';
    const CURRENT_USER_ID = 1;

    // --- Références DOM ---
    const summaryTableBody = document.getElementById('summaryTableBody');
    const modalTransactionsTableBody = document.getElementById('modalTransactionsTableBody');
    const refreshBtn = document.getElementById('refreshBtn');

    // Modales
    const addExpenseModal = new bootstrap.Modal(document.getElementById('addExpenseModal'));
    const manualWithdrawalModal = new bootstrap.Modal(document.getElementById('manualWithdrawalModal'));
    const remittanceDetailsModal = new bootstrap.Modal(document.getElementById('remittanceDetailsModal'));
    const modalDeliverymanName = document.getElementById('modalDeliverymanName');
    const modalTotalPendingAmount = document.getElementById('modalTotalPendingAmount');
    const confirmBatchBtn = document.getElementById('confirmBatchBtn');

    // Formulaires et leurs éléments
    const expenseForm = document.getElementById('expenseForm');
    const expenseUserSelect = document.getElementById('expenseUserSelect');
    const expenseCategorySelect = document.getElementById('expenseCategorySelect');
    const expenseAmountInput = document.getElementById('expenseAmountInput');
    const expenseCommentInput = document.getElementById('expenseCommentInput');
    
    const withdrawalForm = document.getElementById('withdrawalForm');
    const withdrawalAmountInput = document.getElementById('withdrawalAmountInput');
    const withdrawalCommentInput = document.getElementById('withdrawalCommentInput');
    
    // Variables de cache et d'état
    let usersCache = [];
    let categoriesCache = [];
    let currentDeliverymanId = null;

    // --- Fonctions utilitaires ---
    const showNotification = (message, type = 'success') => {
        const container = document.getElementById('notification-container');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alert);
        setTimeout(() => alert.remove(), 5000);
    };
    
    const fetchUsersAndCategories = async () => {
        try {
            const [usersRes, categoriesRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/users`),
                axios.get(`${API_BASE_URL}/cash/expense-categories`)
            ]);
            usersCache = usersRes.data;
            categoriesCache = categoriesRes.data;
            
            // Remplir la liste déroulante des utilisateurs pour le formulaire de dépense
            expenseUserSelect.innerHTML = '<option value="">Sélectionner un utilisateur</option>';
            usersCache.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.name} (${user.role})`;
                expenseUserSelect.appendChild(option);
            });

            // Remplir la liste déroulante des catégories de dépenses
            expenseCategorySelect.innerHTML = '<option value="">Sélectionner une catégorie</option>';
            categoriesCache.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                expenseCategorySelect.appendChild(option);
            });
        } catch (error) {
            console.error("Erreur lors du chargement des données initiales:", error);
            showNotification("Erreur lors du chargement des listes de données.", 'danger');
        }
    };
    
    const fetchAndRenderSummary = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/cash/remittances/summary`);
            renderSummaryTable(response.data);
        } catch (error) {
            console.error("Erreur lors de la récupération du résumé des versements:", error);
            summaryTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger p-4">Erreur lors du chargement des données.</td></tr>`;
        }
    };

    const renderSummaryTable = (summary) => {
        summaryTableBody.innerHTML = '';
        if (summary.length === 0) {
            summaryTableBody.innerHTML = `<tr><td colspan="4" class="text-center p-3">Aucun versement en attente.</td></tr>`;
            return;
        }

        summary.forEach((item) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.user_name}</td>
                <td>${item.pending_count}</td>
                <td class="fw-bold text-success">${parseFloat(item.pending_amount).toLocaleString('fr-FR')} FCFA</td>
                <td>
                    <button class="btn btn-sm btn-info details-btn" data-id="${item.user_id}">
                        <i class="bi bi-eye me-1"></i> Détails
                    </button>
                </td>
            `;
            summaryTableBody.appendChild(row);
        });
    };
    
    const fetchRemittanceDetails = async (deliverymanId) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/cash/remittances/details/${deliverymanId}`);
            return response.data;
        } catch (error) {
            showNotification("Erreur lors de la récupération des détails du livreur.", 'danger');
            return null;
        }
    };

    const renderDetailsModal = (deliveryman, transactions) => {
        modalDeliverymanName.textContent = deliveryman.user_name;
        modalTotalPendingAmount.textContent = `${parseFloat(deliveryman.pending_amount).toLocaleString('fr-FR')} FCFA`;
        currentDeliverymanId = deliveryman.user_id; // Stocker l'ID du livreur actuel

        modalTransactionsTableBody.innerHTML = '';
        if (transactions.length === 0) {
            modalTransactionsTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucune transaction en attente.</td></tr>`;
            return;
        }

        transactions.forEach((tx) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="checkbox" class="transaction-checkbox" data-id="${tx.id}"></td>
                <td>${tx.id}</td>
                <td>${moment(tx.created_at).format('DD/MM/YYYY')}</td>
                <td>${parseFloat(tx.amount).toLocaleString('fr-FR')} FCFA</td>
                <td>${tx.comment}</td>
                <td>
                    <button class="btn btn-sm btn-success confirm-btn" data-id="${tx.id}"><i class="bi bi-check-circle"></i> Confirmer</button>
                </td>
            `;
            modalTransactionsTableBody.appendChild(row);
        });
        
        remittanceDetailsModal.show();
    };

    // --- Écouteurs d'événements ---
    refreshBtn.addEventListener('click', fetchAndRenderSummary);

    summaryTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button.details-btn');
        if (!target) return;
        const deliverymanId = target.dataset.id;
        
        const summaryItem = Array.from(summaryTableBody.querySelectorAll('tr')).find(row => row.querySelector('.details-btn').dataset.id === deliverymanId);
        const deliverymanName = summaryItem.querySelector('td:nth-child(1)').textContent;
        const pendingAmount = summaryItem.querySelector('td:nth-child(3)').textContent;

        const details = await fetchRemittanceDetails(deliverymanId);
        if (details) {
            renderDetailsModal({ user_id: deliverymanId, user_name: deliverymanName, pending_amount: pendingAmount }, details);
        }
    });

    modalTransactionsTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button.confirm-btn');
        if (!target) return;
        const transactionId = target.dataset.id;

        if (confirm("Confirmer ce versement ?")) {
            try {
                await axios.put(`${API_BASE_URL}/cash/confirm/${transactionId}`, { validated_by: CURRENT_USER_ID });
                showNotification("Versement confirmé avec succès.");
                remittanceDetailsModal.hide();
                fetchAndRenderSummary();
            } catch (error) {
                showNotification("Erreur lors de la confirmation du versement.", 'danger');
            }
        }
    });
    
    confirmBatchBtn.addEventListener('click', async () => {
        const selectedIds = Array.from(modalTransactionsTableBody.querySelectorAll('.transaction-checkbox:checked')).map(cb => cb.dataset.id);
        
        if (selectedIds.length === 0) {
            showNotification("Veuillez sélectionner au moins une transaction.", 'warning');
            return;
        }

        if (confirm(`Confirmer ${selectedIds.length} versement(s) ?`)) {
            try {
                const payload = {
                    transactionIds: selectedIds,
                    validated_by: CURRENT_USER_ID
                };
                await axios.put(`${API_BASE_URL}/cash/confirm-batch`, payload);
                showNotification("Versements confirmés avec succès.");
                remittanceDetailsModal.hide();
                fetchAndRenderSummary();
            } catch (error) {
                showNotification("Erreur lors de la confirmation des versements.", 'danger');
            }
        }
    });

    expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_BASE_URL}/cash/expense`, {
                user_id: expenseUserSelect.value,
                category_id: expenseCategorySelect.value,
                amount: expenseAmountInput.value,
                comment: expenseCommentInput.value
            });
            showNotification("Dépense enregistrée avec succès !");
            expenseModal.hide();
            fetchAndRenderSummary();
        } catch (error) {
            showNotification(error.response?.data?.message || "Erreur lors de l'enregistrement de la dépense.", 'danger');
        }
    });

    withdrawalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_BASE_URL}/cash/withdrawal`, {
                user_id: CURRENT_USER_ID,
                amount: withdrawalAmountInput.value,
                comment: withdrawalCommentInput.value
            });
            showNotification("Décaissement manuel enregistré avec succès !");
            withdrawalModal.hide();
            fetchAndRenderSummary();
        } catch (error) {
            showNotification(error.response?.data?.message || "Erreur lors de l'enregistrement du décaissement.", 'danger');
        }
    });
    
    // --- Initialisation de la page ---
    fetchAndRenderSummary();

    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const sidebarToggler = document.getElementById('sidebar-toggler');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (sidebarToggler) {
        sidebarToggler.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    const currentPath = window.location.pathname.split('/').pop();
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) link.classList.add('active');
    });

    fetchUsersAndCategories();
});