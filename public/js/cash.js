document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = 'http://localhost:3000';

    // --- Authentification ---
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
    const CURRENT_USER_ID = currentUser ? currentUser.id : null;

    // --- Références DOM ---
    const summaryTableBody = document.getElementById('summaryTableBody');
    const expensesTableBody = document.getElementById('expensesTableBody');
    const withdrawalsTableBody = document.getElementById('withdrawalsTableBody');
    const closingsHistoryTableBody = document.getElementById('closingsHistoryTableBody');
    const modalTransactionsTableBody = document.getElementById('modalTransactionsTableBody');
    const shortfallsTableBody = document.getElementById('shortfallsTableBody');
    
    // Filtres et Dashboard DOM
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const globalSearchInput = document.getElementById('globalSearchInput');
    const filterBtn = document.getElementById('filterBtn');
    const dbTotalCollected = document.getElementById('db-total-collected');
    const dbTotalExpenses = document.getElementById('db-total-expenses');
    const dbTotalWithdrawals = document.getElementById('db-total-withdrawals');
    const dbCashOnHand = document.getElementById('db-cash-on-hand');

    // Modales
    const addExpenseModal = new bootstrap.Modal(document.getElementById('addExpenseModal'));
    const manualWithdrawalModal = new bootstrap.Modal(document.getElementById('manualWithdrawalModal'));
    const remittanceDetailsModal = new bootstrap.Modal(document.getElementById('remittanceDetailsModal'));
    const editTransactionModal = new bootstrap.Modal(document.getElementById('editTransactionModal'));
    const closingManagerModal = new bootstrap.Modal(document.getElementById('closingManagerModal'));

    // Formulaires
    const closeCashForm = document.getElementById('closeCashForm');
    const expenseForm = document.getElementById('expenseForm');
    const withdrawalForm = document.getElementById('withdrawalForm');
    const editTransactionForm = document.getElementById('editTransactionForm');
    
    // --- Initialisation ---
    const today = new Date().toISOString().split('T')[0];
    startDateInput.value = today;
    endDateInput.value = today;
    document.getElementById('closeDate').value = today;
    
    // --- Variables d'état ---
    let allTransactionsForDetails = [];
    let fullData = { remittances: [], shortfalls: [], expenses: [], withdrawals: [] };
    
    // --- Fonctions ---
    const showNotification = (message, type = 'success') => {
        const container = document.getElementById('notification-container');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alert);
        setTimeout(() => alert.remove(), 5000);
    };
    
    const formatAmount = (amount) => `${parseFloat(amount || 0).toLocaleString('fr-FR')} FCFA`;

    const debounce = (func, delay = 400) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    };

    const applyAllFilters = () => {
        fetchDashboardMetrics();
        fetchAllTransactions();
        fetchAndRenderClosings();
    };

    const fetchDashboardMetrics = async () => {
        try {
            const params = { startDate: startDateInput.value, endDate: endDateInput.value };
            const { data: metrics } = await axiosInstance.get('/cash/metrics', { params });
            dbTotalCollected.textContent = formatAmount(metrics.total_cash_collected_from_orders);
            dbTotalExpenses.textContent = formatAmount(metrics.total_expenses);
            dbTotalWithdrawals.textContent = formatAmount(metrics.total_withdrawals);
            dbCashOnHand.textContent = formatAmount(metrics.cashOnHand);
        } catch (error) { 
            console.error("Erreur (metrics):", error);
            showNotification("Impossible de charger les indicateurs de la caisse.", "danger");
        }
    };

    const fetchAllTransactions = async () => {
        try {
            const [remittanceRes, expenseRes, withdrawalRes, shortfallsRes] = await Promise.all([
                axiosInstance.get('/cash/remittance-summary'),
                axiosInstance.get('/cash/transactions?type=expense'),
                axiosInstance.get('/cash/transactions?type=manual_withdrawal'),
                axiosInstance.get('/shortfalls')
            ]);
            fullData.remittances = remittanceRes.data;
            fullData.expenses = expenseRes.data;
            fullData.withdrawals = withdrawalRes.data;
            fullData.shortfalls = shortfallsRes.data;
            
            renderFilteredTables();

        } catch(error) {
            console.error("Erreur (fetchAllTransactions):", error);
            showNotification("Erreur de chargement des listes de transactions.", "danger");
        }
    };
    
    const renderFilteredTables = () => {
        const searchTerm = globalSearchInput.value.toLowerCase();
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        const dateFilter = (item) => {
            const itemDate = moment(item.created_at).format('YYYY-MM-DD');
            return itemDate >= startDate && itemDate <= endDate;
        };

        const filteredRemittances = fullData.remittances.filter(item => item.user_name.toLowerCase().includes(searchTerm));
        renderSummaryTable(filteredRemittances);

        const filteredShortfalls = fullData.shortfalls.filter(item => item.deliveryman_name.toLowerCase().includes(searchTerm) && dateFilter(item));
        renderShortfallsTable(filteredShortfalls);

        const filteredExpenses = fullData.expenses.filter(item => (item.user_name.toLowerCase().includes(searchTerm) || item.comment?.toLowerCase().includes(searchTerm)) && dateFilter(item));
        renderSimpleTable(expensesTableBody, filteredExpenses, ['created_at', 'user_name', 'category_name', 'amount', 'comment']);
        
        const filteredWithdrawals = fullData.withdrawals.filter(item => (item.user_name.toLowerCase().includes(searchTerm) || item.comment?.toLowerCase().includes(searchTerm)) && dateFilter(item));
        renderSimpleTable(withdrawalsTableBody, filteredWithdrawals, ['created_at', 'user_name', 'amount', 'comment']);
    };
    
    const renderShortfallsTable = (data) => {
        shortfallsTableBody.innerHTML = '';
        if (data.length === 0) {
            shortfallsTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-3">Aucun montant manquant enregistré.</td></tr>`;
            return;
        }
        data.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.deliveryman_name}</td>
                <td class="text-danger">${formatAmount(item.amount)}</td>
                <td><span class="badge bg-warning text-dark">${item.status}</span></td>
                <td>${moment(item.created_at).format('DD/MM/YYYY')}</td>
                <td><button class="btn btn-sm btn-outline-primary" title="Gérer"><i class="bi bi-pencil"></i></button></td>
            `;
            shortfallsTableBody.appendChild(row);
        });
    };

    const renderSummaryTable = (summary) => {
        summaryTableBody.innerHTML = '';
        if (summary.length === 0) {
            summaryTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucun livreur trouvé.</td></tr>`;
            return;
        }
        summary.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.user_name}</td>
                <td>${item.pending_count}</td>
                <td class="fw-bold text-warning">${formatAmount(item.pending_amount)}</td>
                <td>${item.confirmed_count}</td>
                <td class="fw-bold text-success">${formatAmount(item.confirmed_amount)}</td>
                <td><button class="btn btn-sm btn-info details-btn" data-id="${item.user_id}" data-name="${item.user_name}"><i class="bi bi-eye me-1"></i> Détails</button></td>
            `;
            summaryTableBody.appendChild(row);
        });
    };

    const renderSimpleTable = (tbody, data, columns) => {
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-center p-3">Aucune donnée pour cette sélection.</td></tr>`;
            return;
        }
        data.forEach(item => {
            const row = document.createElement('tr');
            let cells = '';
            columns.forEach(col => {
                let value = item[col];
                if (col === 'created_at') value = moment(value).format('DD/MM/YYYY HH:mm');
                if (col === 'amount') value = formatAmount(Math.abs(value));
                cells += `<td>${value || 'N/A'}</td>`;
            });
            row.innerHTML = cells;
            tbody.appendChild(row);
        });
    };
    
    const fetchUsersAndCategories = async () => {
        try {
            const [usersRes, categoriesRes] = await Promise.all([
                axiosInstance.get('/users'),
                axiosInstance.get('/cash/expense-categories')
            ]);
            const expenseUserSelect = document.getElementById('expenseUserSelect');
            const expenseCategorySelect = document.getElementById('expenseCategorySelect');
            expenseUserSelect.innerHTML = '<option value="">Sélectionner</option>';
            usersRes.data.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.name} (${user.role})`;
                expenseUserSelect.appendChild(option);
            });
            expenseCategorySelect.innerHTML = '<option value="">Sélectionner</option>';
            categoriesRes.data.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                expenseCategorySelect.appendChild(option);
            });
        } catch (error) { console.error("Erreur chargement users/categories:", error); }
    };

    const fetchAndRenderClosings = async () => {
        try {
            const { data: closings } = await axiosInstance.get('/cash/closings');
            closingsHistoryTableBody.innerHTML = '';
            if (closings.length === 0) {
                closingsHistoryTableBody.innerHTML = '<tr><td colspan="4" class="text-center p-2">Aucun historique.</td></tr>`;
                return;
            }
            closings.forEach(c => {
                const diffClass = c.difference == 0 ? 'text-success' : (c.difference > 0 ? 'text-info' : 'text-danger fw-bold');
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${moment(c.closing_date).format('DD/MM/YYYY')}</td>
                    <td>${formatAmount(c.expected_cash)}</td>
                    <td>${formatAmount(c.actual_cash_counted)}</td>
                    <td class="${diffClass}">${formatAmount(c.difference)}</td>
                `;
                closingsHistoryTableBody.appendChild(row);
            });
        } catch (error) { console.error("Erreur (closings):", error); }
    };

    const renderDetailsTable = (filterStatus = 'pending') => {
        modalTransactionsTableBody.innerHTML = '';
        const filtered = allTransactionsForDetails.filter(tx => tx.status === filterStatus);
        
        if (filtered.length === 0) {
            modalTransactionsTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucune transaction pour ce statut.</td></tr>`;
            return;
        }
        const statusBadge = (status) => status === 'pending' 
            ? `<span class="badge bg-warning text-dark">${status}</span>` 
            : `<span class="badge bg-success">${status}</span>`;

        filtered.forEach(tx => {
            const row = document.createElement('tr');
            const isPending = tx.status === 'pending';
            row.innerHTML = `
                <td><input type="checkbox" class="transaction-checkbox" data-id="${tx.id}" ${!isPending ? 'disabled' : ''}></td>
                <td>${moment(tx.created_at).format('DD/MM/YYYY HH:mm')}</td>
                <td>${formatAmount(tx.amount)}</td>
                <td>${tx.comment || 'N/A'}</td>
                <td>${statusBadge(tx.status)}</td>
                <td>${isPending ? `<button class="btn btn-sm btn-outline-primary edit-tx-btn" data-id="${tx.id}"><i class="bi bi-pencil"></i></button>` : ''}</td>
            `;
            modalTransactionsTableBody.appendChild(row);
        });
    };

    // --- Événements ---
    filterBtn.addEventListener('click', applyAllFilters);
    globalSearchInput.addEventListener('input', debounce(renderFilteredTables, 400));
    
    closeCashForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('closeDate').value;
        const actual_cash_counted = document.getElementById('actualAmount').value;
        const comment = document.getElementById('closeComment').value;
        if (confirm(`Voulez-vous clôturer la caisse pour le ${moment(date).format('DD/MM/YYYY')} ? Cette action est définitive.`)) {
            try {
                const response = await axiosInstance.post('/cash/close', { date, actual_cash_counted, comment });
                showNotification(response.data.message, 'success');
                fetchAndRenderClosings();
                closeCashForm.reset();
                document.getElementById('closeDate').value = today;
            } catch (error) { showNotification(error.response?.data?.message || "Erreur.", 'danger'); }
        }
    });
    
    summaryTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button.details-btn');
        if (!target) return;
        const deliverymanId = target.dataset.id;
        document.getElementById('modalDeliverymanName').textContent = target.dataset.name;
        try {
            allTransactionsForDetails = (await axiosInstance.get(`/cash/remittance-details/${deliverymanId}`)).data;
            document.getElementById('filterPending').checked = true;
            renderDetailsTable('pending');
            remittanceDetailsModal.show();
        } catch (error) { showNotification('Impossible de charger les détails.', 'danger'); }
    });

    expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await axiosInstance.post('/cash/expense', {
                user_id: document.getElementById('expenseUserSelect').value,
                category_id: document.getElementById('expenseCategorySelect').value,
                amount: document.getElementById('expenseAmountInput').value,
                comment: document.getElementById('expenseCommentInput').value
            });
            showNotification("Dépense enregistrée !", 'success');
            addExpenseModal.hide();
            expenseForm.reset();
            applyAllFilters();
        } catch (error) { showNotification(error.response?.data?.message || "Erreur.", 'danger'); }
    });

    withdrawalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await axiosInstance.post('/cash/withdrawal', {
                user_id: CURRENT_USER_ID,
                amount: document.getElementById('withdrawalAmountInput').value,
                comment: document.getElementById('withdrawalCommentInput').value
            });
            showNotification("Décaissement enregistré !", 'success');
            manualWithdrawalModal.hide();
            withdrawalForm.reset();
            applyAllFilters();
        } catch (error) { showNotification(error.response?.data?.message || "Erreur.", 'danger'); }
    });
    
    document.querySelectorAll('input[name="detailsFilter"]').forEach(radio => {
        radio.addEventListener('change', (e) => renderDetailsTable(e.target.value));
    });

    document.getElementById('confirmBatchBtn')?.addEventListener('click', async () => {
        const selectedIds = Array.from(modalTransactionsTableBody.querySelectorAll('.transaction-checkbox:checked')).map(cb => cb.dataset.id);
        if (selectedIds.length === 0) return showNotification("Veuillez sélectionner au moins une transaction.", 'warning');
        if (confirm(`Confirmer ${selectedIds.length} versement(s) ?`)) {
            try {
                await axiosInstance.put('/cash/confirm-batch', { transactionIds: selectedIds, validated_by: CURRENT_USER_ID });
                showNotification("Versements confirmés.", 'success');
                remittanceDetailsModal.hide();
                fetchAllTransactions();
            } catch (error) { showNotification("Erreur lors de la confirmation.", 'danger'); }
        }
    });
    
    modalTransactionsTableBody.addEventListener('click', (e) => {
        const target = e.target.closest('.edit-tx-btn');
        if (!target) return;
        const txId = target.dataset.id;
        const transaction = allTransactionsForDetails.find(tx => tx.id == txId);
        if (transaction) {
            document.getElementById('editTransactionId').value = transaction.id;
            document.getElementById('editAmount').value = transaction.amount;
            document.getElementById('editComment').value = transaction.comment;
            editTransactionModal.show();
        }
    });
    
    editTransactionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editTransactionId').value;
        const data = { amount: document.getElementById('editAmount').value, comment: document.getElementById('editComment').value };
        try {
            await axiosInstance.put(`/cash/transactions/${id}`, data);
            showNotification('Transaction modifiée.', 'success');
            editTransactionModal.hide();
            remittanceDetailsModal.hide();
            fetchAllTransactions();
        } catch (error) { showNotification('Erreur de modification.', 'danger'); }
    });
    
    document.getElementById('exportHistoryBtn')?.addEventListener('click', () => {
        showNotification("L'export PDF sera bientôt disponible.", "info");
    });

    // --- Lancement & Initialisation Globale ---
    if (currentUser) document.getElementById('userName').textContent = currentUser.name;
    applyAllFilters();
    fetchUsersAndCategories();
    
    document.getElementById('sidebar-toggler')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        document.getElementById('main-content').classList.toggle('expanded');
    });
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.clear(); sessionStorage.clear();
            window.location.href = 'index.html';
        });
    }
    const currentPath = window.location.pathname.split('/').pop();
    document.querySelectorAll('.sidebar .nav-link, .sidebar .dropdown-item').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
            if(link.closest('.dropdown-menu')) {
                link.closest('.dropdown').querySelector('.dropdown-toggle').classList.add('active');
            }
        }
    });
});