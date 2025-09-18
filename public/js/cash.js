// js/cash.js

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = 'http://localhost:3000';
    const CURRENT_USER_ID = 1;

    // --- Références DOM ---
    const cashTableBody = document.getElementById('cashTableBody');
    const searchInput = document.getElementById('searchInput');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const typeFilter = document.getElementById('typeFilter');
    const statusFilter = document.getElementById('statusFilter');
    const filterBtn = document.getElementById('filterBtn');

    const expenseModal = new bootstrap.Modal(document.getElementById('addExpenseModal'));
    const expenseForm = document.getElementById('expenseForm');
    const expenseUserSelect = document.getElementById('expenseUserSelect');
    const expenseCategorySelect = document.getElementById('expenseCategorySelect');
    const expenseAmountInput = document.getElementById('expenseAmountInput');
    const expenseCommentInput = document.getElementById('expenseCommentInput');

    const withdrawalModal = new bootstrap.Modal(document.getElementById('manualWithdrawalModal'));
    const withdrawalForm = document.getElementById('withdrawalForm');
    const withdrawalAmountInput = document.getElementById('withdrawalAmountInput');
    const withdrawalCommentInput = document.getElementById('withdrawalCommentInput');

    const statusTranslations = {
        'pending': 'En attente',
        'confirmed': 'Confirmé'
    };
    const statusColors = {
        'pending': 'status-pending',
        'confirmed': 'status-confirmed'
    };
    const typeTranslations = {
        'remittance': 'Versement',
        'expense': 'Dépense',
        'manual_withdrawal': 'Décaissement'
    };

    let usersCache = [];
    let categoriesCache = [];

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

    const fetchAndRenderData = async () => {
        try {
            const params = {
                search: searchInput.value,
                startDate: startDateFilter.value,
                endDate: endDateFilter.value,
                type: typeFilter.value,
                status: statusFilter.value
            };
            const response = await axios.get(`${API_BASE_URL}/cash/transactions`, { params });
            renderTransactionsTable(response.data);
        } catch (error) {
            console.error("Erreur lors de la récupération des transactions:", error);
            cashTableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger p-4">Erreur lors du chargement des données.</td></tr>`;
        }
    };
    
    const fetchUsersAndCategories = async () => {
        try {
            const [usersRes, categoriesRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/users`),
                axios.get(`${API_BASE_URL}/cash/expense-categories`)
            ]);
            usersCache = usersRes.data;
            categoriesCache = categoriesRes.data;
            
            // Populate user selects
            expenseUserSelect.innerHTML = '<option value="">Sélectionner un utilisateur</option>';
            usersCache.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.name} (${user.role})`;
                expenseUserSelect.appendChild(option);
            });

            // Populate category select
            expenseCategorySelect.innerHTML = '<option value="">Sélectionner une catégorie</option>';
            categoriesCache.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                expenseCategorySelect.appendChild(option);
            });

        } catch (error) {
            console.error("Erreur lors du chargement des données initiales:", error);
        }
    };

    const renderTransactionsTable = (transactions) => {
        cashTableBody.innerHTML = '';
        if (transactions.length === 0) {
            cashTableBody.innerHTML = `<tr><td colspan="9" class="text-center p-3">Aucune transaction à afficher.</td></tr>`;
            return;
        }

        transactions.forEach((tx) => {
            const row = document.createElement('tr');
            const statusColor = statusColors[tx.status] || 'bg-secondary';
            const amountClass = tx.amount >= 0 ? 'transaction-amount-positive' : 'transaction-amount-negative';
            
            let actions = '';
            if (tx.status === 'pending') {
                actions = `<button class="btn btn-sm btn-success confirm-btn" data-id="${tx.id}"><i class="bi bi-check-circle"></i> Confirmer</button>`;
            }

            row.innerHTML = `
                <td>${tx.id}</td>
                <td>${moment(tx.created_at).format('DD/MM/YYYY')}</td>
                <td>${typeTranslations[tx.type] || 'N/A'}</td>
                <td>${tx.user_name || 'N/A'}</td>
                <td>${tx.category_name || 'N/A'}</td>
                <td class="${amountClass}">${parseFloat(tx.amount).toLocaleString('fr-FR')} FCFA</td>
                <td>${tx.comment || 'N/A'}</td>
                <td>
                    <span class="status-badge">
                        <span class="status-dot ${statusColor}"></span>
                        ${statusTranslations[tx.status]}
                    </span>
                </td>
                <td>${actions}</td>
            `;
            cashTableBody.appendChild(row);
        });
    };

    // --- Gestion des événements ---
    filterBtn.addEventListener('click', fetchAndRenderData);
    searchInput.addEventListener('input', fetchAndRenderData);
    startDateFilter.addEventListener('change', fetchAndRenderData);
    endDateFilter.addEventListener('change', fetchAndRenderData);
    typeFilter.addEventListener('change', fetchAndRenderData);
    statusFilter.addEventListener('change', fetchAndRenderData);

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
            fetchAndRenderData();
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
            fetchAndRenderData();
        } catch (error) {
            showNotification(error.response?.data?.message || "Erreur lors de l'enregistrement du décaissement.", 'danger');
        }
    });

    cashTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button.confirm-btn');
        if (!target) return;
        const transactionId = target.dataset.id;
        
        if (confirm("Confirmer le versement de ce livreur ?")) {
            try {
                await axios.put(`${API_BASE_URL}/cash/confirm/${transactionId}`, { validated_by: CURRENT_USER_ID });
                showNotification("Versement confirmé avec succès.");
                fetchAndRenderData();
            } catch (error) {
                showNotification("Erreur lors de la confirmation du versement.", 'danger');
            }
        }
    });
    
    // --- Initialisation de la page ---
    const today = new Date().toISOString().slice(0, 10);
    startDateFilter.value = today;
    endDateFilter.value = today;
    
    await fetchUsersAndCategories();
    fetchAndRenderData();

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
});