// js/cash.js
document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const API_BASE_URL = 'http://localhost:3000';
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (!storedUser) {
        window.location.href = 'index.html';
        return;
    }
    const user = JSON.parse(storedUser);
    const CURRENT_USER_ID = user.id;
    if (user.token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${user.token}`;
    }
    document.getElementById('userName').textContent = user.name;

    // --- CACHES & ÉTAT ---
    let usersCache = [];
    let categoriesCache = [];
    let transactionIdToEdit = null;

    // --- RÉFÉRENCES DOM ---
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const sidebarToggler = document.getElementById('sidebar-toggler');
    const logoutBtn = document.getElementById('logoutBtn');
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const globalSearchInput = document.getElementById('globalSearchInput');
    const filterBtn = document.getElementById('filterBtn');

    const summaryTableBody = document.getElementById('summaryTableBody');
    const shortfallsTableBody = document.getElementById('shortfallsTableBody');
    const expensesTableBody = document.getElementById('expensesTableBody');
    const withdrawalsTableBody = document.getElementById('withdrawalsTableBody');
    const closingsHistoryTableBody = document.getElementById('closingsHistoryTableBody');

    const remittanceDetailsModalEl = document.getElementById('remittanceDetailsModal');
    const remittanceDetailsModal = new bootstrap.Modal(remittanceDetailsModalEl);
    const closingManagerModalEl = document.getElementById('closingManagerModal');
    const closingManagerModal = new bootstrap.Modal(closingManagerModalEl);
    const addExpenseModal = new bootstrap.Modal(document.getElementById('addExpenseModal'));
    const manualWithdrawalModal = new bootstrap.Modal(document.getElementById('manualWithdrawalModal'));
    const editExpenseModal = new bootstrap.Modal(document.getElementById('editExpenseModal'));
    const editWithdrawalModal = new bootstrap.Modal(document.getElementById('editWithdrawalModal'));

    const expenseForm = document.getElementById('expenseForm');
    const withdrawalForm = document.getElementById('withdrawalForm');
    const editExpenseForm = document.getElementById('editExpenseForm');
    const editWithdrawalForm = document.getElementById('editWithdrawalForm');
    const closeCashForm = document.getElementById('closeCashForm');
    
    const confirmBatchBtn = document.getElementById('confirmBatchBtn');
    
    // --- FONCTIONS UTILITAIRES ---
    const showNotification = (message, type = 'success') => {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.role = 'alert';
        alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    };

    const formatAmount = (amount) => `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;
    
    const debounce = (func, delay = 500) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    // --- FONCTIONS DE CHARGEMENT ---

    const applyFiltersAndRender = () => {
        const activeTab = document.querySelector('#cashTabs .nav-link.active');
        if (!activeTab) return;
        
        const targetPanelId = activeTab.getAttribute('data-bs-target');
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const search = globalSearchInput.value;

        if (!startDate || !endDate) return showNotification("Période invalide.", "warning");
        
        fetchCashMetrics(startDate, endDate);

        switch (targetPanelId) {
            case '#remittances-panel':
                fetchAndRenderSummary(startDate, endDate, search);
                break;
            case '#shortfalls-panel':
                fetchAndRenderShortfalls(search);
                break;
            case '#expenses-panel':
                fetchAndRenderTransactions('expense', expensesTableBody, startDate, endDate, search);
                break;
            case '#withdrawals-panel':
                fetchAndRenderTransactions('manual_withdrawal', withdrawalsTableBody, startDate, endDate, search);
                break;
        }
    };

    const fetchCashMetrics = async (startDate, endDate) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/metrics`, { params: { startDate, endDate } });
            document.getElementById('db-total-collected').textContent = formatAmount(res.data.total_collected);
            document.getElementById('db-total-expenses').textContent = formatAmount(res.data.total_expenses);
            document.getElementById('db-total-withdrawals').textContent = formatAmount(res.data.total_withdrawals);
            document.getElementById('db-cash-on-hand').textContent = formatAmount(res.data.cash_on_hand);
        } catch (error) {
            console.error("Erreur de chargement des métriques:", error);
            document.getElementById('db-total-collected').textContent = "0 FCFA";
            document.getElementById('db-total-expenses').textContent = "0 FCFA";
            document.getElementById('db-total-withdrawals').textContent = "0 FCFA";
            document.getElementById('db-cash-on-hand').textContent = "0 FCFA";
        }
    };
    
    const fetchAndRenderSummary = async (startDate, endDate, search) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/remittance-summary`, { params: { startDate, endDate, search } });
            summaryTableBody.innerHTML = '';
            if (res.data.length === 0) {
                summaryTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucun versement à afficher.</td></tr>`;
                return;
            }
            res.data.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.user_name}</td>
                    <td>${item.pending_count || 0}</td>
                    <td class="text-warning fw-bold">${formatAmount(item.pending_amount)}</td>
                    <td>${item.confirmed_count || 0}</td>
                    <td class="text-success fw-bold">${formatAmount(item.confirmed_amount)}</td>
                    <td><button class="btn btn-sm btn-primary details-btn" data-id="${item.user_id}" data-name="${item.user_name}">Gérer</button></td>
                `;
                summaryTableBody.appendChild(row);
            });
        } catch (error) {
            summaryTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erreur de chargement.</td></tr>`;
        }
    };

    const fetchAndRenderShortfalls = async (search) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/shortfalls`, { params: { search } });
            shortfallsTableBody.innerHTML = '';
            if (res.data.length === 0) {
                shortfallsTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-3">Aucun manquant en attente.</td></tr>`;
                return;
            }
            res.data.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.deliveryman_name}</td>
                    <td class="text-danger fw-bold">${formatAmount(item.amount)}</td>
                    <td><span class="badge bg-warning text-dark">${item.status}</span></td>
                    <td>${moment(item.created_at).format('DD/MM/YYYY')}</td>
                    <td><button class="btn btn-sm btn-success settle-btn" data-id="${item.id}" data-amount="${item.amount}">Régler</button></td>
                `;
                shortfallsTableBody.appendChild(row);
            });
        } catch (error) {
            shortfallsTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger p-4">Erreur de chargement.</td></tr>`;
        }
    };

    const fetchAndRenderTransactions = async (type, tableBody, startDate, endDate, search) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/transactions`, { params: { type, startDate, endDate, search } });
            tableBody.innerHTML = '';
            if (res.data.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucune transaction.</td></tr>`;
                return;
            }
            res.data.forEach(tx => {
                const row = document.createElement('tr');
                const user = type === 'expense' ? tx.user_name : (tx.validated_by_name || 'Admin');
                const category = tx.category_name || '';
                row.innerHTML = `
                    <td>${moment(tx.created_at).format('DD/MM/YYYY HH:mm')}</td>
                    <td>${user}</td>
                    ${type === 'expense' ? `<td>${category}</td>` : ''}
                    <td class="text-danger fw-bold">${formatAmount(Math.abs(tx.amount))}</td>
                    <td>${tx.comment || ''}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-info edit-tx-btn" data-id="${tx.id}" data-type="${type}" data-amount="${Math.abs(tx.amount)}" data-comment="${tx.comment || ''}"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger delete-tx-btn" data-id="${tx.id}"><i class="bi bi-trash"></i></button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erreur de chargement.</td></tr>`;
        }
    };
    
    const fetchClosingHistory = async () => {
        const startDate = document.getElementById('historyStartDate').value;
        const endDate = document.getElementById('historyEndDate').value;
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/closing-history`, { params: { startDate, endDate } });
            closingsHistoryTableBody.innerHTML = '';
            if (res.data.length === 0) {
                closingsHistoryTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-3">Aucun historique.</td></tr>`;
                return;
            }
            res.data.forEach(item => {
                const diffClass = item.difference < 0 ? 'text-danger' : (item.difference > 0 ? 'text-success' : '');
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${moment(item.closing_date).format('DD/MM/YYYY')}</td>
                    <td>${formatAmount(item.expected_cash)}</td>
                    <td>${formatAmount(item.actual_cash_counted)}</td>
                    <td class="fw-bold ${diffClass}">${formatAmount(item.difference)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-success export-single-closing-btn" data-id="${item.id}" title="Exporter ce rapport"><i class="bi bi-file-earmark-spreadsheet"></i></button>
                    </td>
                `;
                closingsHistoryTableBody.appendChild(row);
            });
        } catch (error) {
            closingsHistoryTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Erreur de chargement.</td></tr>`;
        }
    };
    
    const fetchInitialData = async () => {
        try {
            const [usersRes, categoriesRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/users`),
                axios.get(`${API_BASE_URL}/cash/expense-categories`)
            ]);
            usersCache = usersRes.data;
            categoriesCache = categoriesRes.data;
            
            const expenseUserSelect = document.getElementById('expenseUserSelect');
            expenseUserSelect.innerHTML = '<option value="">Sélectionner un utilisateur</option>';
            usersCache.forEach(u => expenseUserSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`);

            const expenseCategorySelect = document.getElementById('expenseCategorySelect');
            expenseCategorySelect.innerHTML = '<option value="">Sélectionner une catégorie</option>';
            categoriesCache.forEach(cat => expenseCategorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`);
        } catch (error) {
            showNotification("Erreur de chargement des données de base.", "danger");
        }
    };
    
    // --- GESTION DES ÉVÉNEMENTS ---

    const initializeEventListeners = () => {
        sidebarToggler.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
        
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
            window.location.href = 'index.html';
        });

        filterBtn.addEventListener('click', applyFiltersAndRender);
        globalSearchInput.addEventListener('input', debounce(applyFiltersAndRender));
        
        document.querySelectorAll('#cashTabs .nav-link').forEach(tab => tab.addEventListener('shown.bs.tab', applyFiltersAndRender));

        document.getElementById('historyStartDate').addEventListener('change', fetchClosingHistory);
        document.getElementById('historyEndDate').addEventListener('change', fetchClosingHistory);
        document.getElementById('exportHistoryBtn').addEventListener('click', () => {
            const startDate = document.getElementById('historyStartDate').value;
            const endDate = document.getElementById('historyEndDate').value;
            window.open(`${API_BASE_URL}/cash/closing-history/export?startDate=${startDate}&endDate=${endDate}`, '_blank');
        });

        expenseForm.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                await axios.post(`${API_BASE_URL}/cash/expense`, {
                    user_id: document.getElementById('expenseUserSelect').value,
                    category_id: document.getElementById('expenseCategorySelect').value,
                    amount: document.getElementById('expenseAmountInput').value,
                    comment: document.getElementById('expenseCommentInput').value
                });
                showNotification("Dépense enregistrée.");
                addExpenseModal.hide();
                expenseForm.reset();
                applyFiltersAndRender();
            } catch (error) { showNotification(error.response?.data?.message || "Erreur.", "danger"); }
        });

        withdrawalForm.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                await axios.post(`${API_BASE_URL}/cash/withdrawal`, {
                    amount: document.getElementById('withdrawalAmountInput').value,
                    comment: document.getElementById('withdrawalCommentInput').value,
                    user_id: CURRENT_USER_ID
                });
                showNotification("Décaissement enregistré.");
                manualWithdrawalModal.hide();
                withdrawalForm.reset();
                applyFiltersAndRender();
            } catch (error) { showNotification(error.response?.data?.message || "Erreur.", "danger"); }
        });

        editExpenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('editExpenseAmount').value;
            const comment = document.getElementById('editExpenseComment').value;
            try {
                await axios.put(`${API_BASE_URL}/cash/transactions/${transactionIdToEdit}`, { amount, comment });
                showNotification("Dépense modifiée.");
                editExpenseModal.hide();
                applyFiltersAndRender();
            } catch (error) { showNotification("Erreur de modification.", 'danger'); }
        });

        editWithdrawalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('editWithdrawalAmount').value;
            const comment = document.getElementById('editWithdrawalComment').value;
            try {
                await axios.put(`${API_BASE_URL}/cash/transactions/${transactionIdToEdit}`, { amount, comment });
                showNotification("Décaissement modifié.");
                editWithdrawalModal.hide();
                applyFiltersAndRender();
            } catch (error) { showNotification("Erreur de modification.", 'danger'); }
        });
        
        closeCashForm.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                await axios.post(`${API_BASE_URL}/cash/close-cash`, {
                    closingDate: document.getElementById('closeDate').value,
                    actualCash: document.getElementById('actualAmount').value,
                    comment: document.getElementById('closeComment').value,
                    userId: CURRENT_USER_ID
                });
                showNotification("Caisse clôturée avec succès !");
                closingManagerModal.hide();
                fetchClosingHistory();
                applyFiltersAndRender();
            } catch(error) { showNotification(error.response?.data?.message || "Erreur.", "danger"); }
        });
        
        document.body.addEventListener('click', async (e) => {
            const target = e.target.closest('button, a');
            if (!target) return;

            if (target.matches('.details-btn')) {
                const deliverymanId = target.dataset.id;
                const deliverymanName = target.dataset.name;
                document.getElementById('modalDeliverymanName').textContent = deliverymanName;
                try {
                    const res = await axios.get(`${API_BASE_URL}/cash/remittance-details/${deliverymanId}`, { params: { startDate: startDateInput.value, endDate: endDateInput.value } });
                    const tableBody = document.getElementById('modalTransactionsTableBody');
                    tableBody.innerHTML = '';
                     if (res.data.length === 0) {
                         tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucune transaction à gérer.</td></tr>`;
                     } else {
                        res.data.forEach(tx => {
                            const row = document.createElement('tr');
                            const statusBadge = tx.status === 'pending' ? `<span class="badge bg-warning text-dark">En attente</span>` : `<span class="badge bg-success">Confirmé</span>`;
                            row.innerHTML = `
                                <td><input type="checkbox" class="transaction-checkbox" data-id="${tx.id}" data-amount="${tx.amount}" ${tx.status !== 'pending' ? 'disabled' : ''}></td>
                                <td>${moment(tx.created_at).format('DD/MM HH:mm')}</td>
                                <td>${formatAmount(tx.amount)}</td>
                                <td>
                                    <div>${tx.comment}</div>
                                    <small class="text-muted">${tx.shop_name || 'Info'} - ${tx.item_names || 'non'} - ${tx.delivery_location || 'disponible'}</small>
                                </td>
                                <td>${statusBadge}</td>
                                <td>
                                    <button class="btn btn-sm btn-outline-info edit-remittance-btn" title="Modifier le montant" data-id="${tx.id}" data-amount="${tx.amount}"><i class="bi bi-pencil"></i></button>
                                    ${tx.status === 'pending' ? `<button class="btn btn-sm btn-outline-success confirm-single-remittance-btn" title="Confirmer ce versement" data-id="${tx.id}" data-amount="${tx.amount}"><i class="bi bi-check2"></i></button>` : ''}
                                </td>
                            `;
                            tableBody.appendChild(row);
                        });
                     }
                    remittanceDetailsModal.show();
                } catch (error) {
                    showNotification("Erreur au chargement des détails.", "danger");
                }
            }
            
            if (target.matches('.settle-btn')) {
                const shortfallId = target.dataset.id;
                const amountDue = target.dataset.amount;
                const amountPaid = prompt(`Montant à régler sur les ${formatAmount(amountDue)} ?`, amountDue);
                if (amountPaid && !isNaN(amountPaid) && amountPaid > 0) {
                    try {
                        await axios.put(`${API_BASE_URL}/cash/shortfalls/${shortfallId}/settle`, { amount: amountPaid, userId: CURRENT_USER_ID });
                        showNotification("Règlement enregistré.");
                        fetchAndRenderShortfalls();
                    } catch (error) { showNotification(error.response?.data?.message || "Erreur.", "danger"); }
                }
            }

            if (target.matches('.edit-tx-btn')) {
                transactionIdToEdit = target.dataset.id;
                const type = target.dataset.type;
                const amount = target.dataset.amount;
                const comment = target.dataset.comment;
                
                if(type === 'expense'){
                    document.getElementById('editExpenseAmount').value = amount;
                    document.getElementById('editExpenseComment').value = comment;
                    editExpenseModal.show();
                } else {
                    document.getElementById('editWithdrawalAmount').value = amount;
                    document.getElementById('editWithdrawalComment').value = comment;
                    editWithdrawalModal.show();
                }
            }

            if (target.matches('.delete-tx-btn')) {
                const txId = target.dataset.id;
                if (confirm('Voulez-vous vraiment supprimer cette transaction ?')) {
                    try {
                        await axios.delete(`${API_BASE_URL}/cash/transactions/${txId}`);
                        showNotification('Transaction supprimée.');
                        applyFiltersAndRender();
                    } catch (error) { showNotification("Erreur de suppression.", "danger"); }
                }
            }
            
            if (target.matches('.edit-remittance-btn')) {
                const txId = target.dataset.id;
                const oldAmount = target.dataset.amount;
                const newAmount = prompt(`Modifier le montant du versement :`, oldAmount);
                if(newAmount && !isNaN(newAmount)){
                    try {
                        await axios.put(`${API_BASE_URL}/cash/remittances/${txId}`, { amount: newAmount });
                        showNotification("Montant mis à jour.");
                        remittanceDetailsModal.hide();
                    } catch (error) {
                        showNotification(error.response?.data?.message || "Erreur.", "danger");
                    }
                }
            }
            
            if (target.matches('.confirm-single-remittance-btn')) {
                const txId = target.dataset.id;
                const expectedAmount = target.dataset.amount;
                const paidAmount = prompt(`Montant attendu : ${formatAmount(expectedAmount)}. Montant versé ?`, expectedAmount);
                if (paidAmount !== null && !isNaN(paidAmount)) {
                    try {
                        const res = await axios.put(`${API_BASE_URL}/cash/remittances/confirm`, { transactionIds: [txId], paidAmount: parseFloat(paidAmount), validated_by: CURRENT_USER_ID });
                        showNotification(res.data.message);
                        remittanceDetailsModal.hide();
                        applyFiltersAndRender();
                        fetchAndRenderShortfalls();
                    } catch (error) { showNotification(error.response?.data?.message || "Erreur.", "danger"); }
                }
            }
        });
        
        if (confirmBatchBtn) {
            confirmBatchBtn.addEventListener('click', async () => {
                const selectedCheckboxes = document.querySelectorAll('#modalTransactionsTableBody .transaction-checkbox:checked');
                const transactionIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);

                if (transactionIds.length === 0) return showNotification("Sélectionnez au moins une transaction.", 'warning');

                const expectedAmount = Array.from(selectedCheckboxes).reduce((sum, cb) => sum + parseFloat(cb.dataset.amount), 0);
                const paidAmount = prompt(`Total sélectionné : ${formatAmount(expectedAmount)}. Montant total versé ?`, expectedAmount);

                if (paidAmount !== null && !isNaN(paidAmount)) {
                    try {
                        const res = await axios.put(`${API_BASE_URL}/cash/remittances/confirm`, { transactionIds, paidAmount: parseFloat(paidAmount), validated_by: CURRENT_USER_ID });
                        showNotification(res.data.message);
                        remittanceDetailsModal.hide();
                        applyFiltersAndRender();
                        fetchAndRenderShortfalls();
                    } catch (error) { showNotification(error.response?.data?.message || "Erreur.", "danger"); }
                }
            });
        }
    };
    
    // --- Lancement de la page ---
    const initializeApp = async () => {
        const today = new Date().toISOString().slice(0, 10);
        startDateInput.value = today;
        endDateInput.value = today;
        document.getElementById('closeDate').value = today;
        document.getElementById('historyStartDate').value = moment().subtract(30, 'days').format('YYYY-MM-DD');
        document.getElementById('historyEndDate').value = today;

        initializeEventListeners();
        
        await fetchInitialData();
        applyFiltersAndRender();
        fetchClosingHistory();
    };

    initializeApp();
});