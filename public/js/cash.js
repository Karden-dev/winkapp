// js/cash.js

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = 'http://localhost:3000';
    
    // --- GESTION DE L'AUTHENTIFICATION ---
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (!storedUser) {
        window.location.href = 'index.html';
        return;
    }
    const user = JSON.parse(storedUser);
    if (user.token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${user.token}`;
    }
    document.getElementById('userName').textContent = user.name;
    // --- FIN GESTION DE L'AUTHENTIFICATION ---

    // --- Références DOM ---
    const summaryTableBody = document.getElementById('summaryTableBody');
    const modalTransactionsTableBody = document.getElementById('modalTransactionsTableBody');
    const refreshBtn = document.getElementById('refreshBtn');

    // Modales
    const addExpenseModalElement = document.getElementById('addExpenseModal');
    const editExpenseModalElement = document.getElementById('editExpenseModal');
    const manualWithdrawalModalElement = document.getElementById('manualWithdrawalModal');
    const editWithdrawalModalElement = document.getElementById('editWithdrawalModal');
    const remittanceDetailsModalElement = document.getElementById('remittanceDetailsModal');
    
    let addExpenseModal, editExpenseModal, manualWithdrawalModal, editWithdrawalModal, remittanceDetailsModal;
    if (addExpenseModalElement) addExpenseModal = new bootstrap.Modal(addExpenseModalElement);
    if (editExpenseModalElement) editExpenseModal = new bootstrap.Modal(editExpenseModalElement);
    if (manualWithdrawalModalElement) manualWithdrawalModal = new bootstrap.Modal(manualWithdrawalModalElement);
    if (editWithdrawalModalElement) editWithdrawalModal = new bootstrap.Modal(editWithdrawalModalElement);
    if (remittanceDetailsModalElement) remittanceDetailsModal = new bootstrap.Modal(remittanceDetailsModalElement);

    const modalDeliverymanName = document.getElementById('modalDeliverymanName');
    const confirmBatchBtn = document.getElementById('confirmBatchBtn');

    // Filtres
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const globalSearchInput = document.getElementById('globalSearchInput');
    const filterBtn = document.getElementById('filterBtn');

    // Formulaires et leurs éléments
    const expenseForm = document.getElementById('expenseForm');
    const editExpenseForm = document.getElementById('editExpenseForm');
    const expenseUserSelect = document.getElementById('expenseUserSelect');
    const expenseCategorySelect = document.getElementById('expenseCategorySelect');
    const expenseAmountInput = document.getElementById('expenseAmountInput');
    const expenseCommentInput = document.getElementById('expenseCommentInput');
    
    const withdrawalForm = document.getElementById('withdrawalForm');
    const editWithdrawalForm = document.getElementById('editWithdrawalForm');
    const withdrawalAmountInput = document.getElementById('withdrawalAmountInput');
    const withdrawalCommentInput = document.getElementById('withdrawalCommentInput');
    
    const expensesTableBody = document.getElementById('expensesTableBody');
    const withdrawalsTableBody = document.getElementById('withdrawalsTableBody');
    
    // Variables de cache et d'état
    let usersCache = [];
    let categoriesCache = [];
    let currentDeliverymanId = null;
    let transactionIdToEdit = null;

    // --- Fonctions utilitaires ---
    const getTodayDate = () => new Date().toISOString().slice(0, 10);
    const showNotification = (message, type = 'success') => {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alert);
        setTimeout(() => alert.remove(), 5000);
    };

    const fetchCashMetrics = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/cash/metrics`);
            const metrics = response.data;
            document.getElementById('db-total-collected').textContent = `${(metrics.total_cash_collected || 0).toLocaleString('fr-FR')} FCFA`;
            document.getElementById('db-total-expenses').textContent = `${(metrics.total_expenses || 0).toLocaleString('fr-FR')} FCFA`;
            document.getElementById('db-total-withdrawals').textContent = `${(metrics.total_withdrawals || 0).toLocaleString('fr-FR')} FCFA`;
            document.getElementById('db-cash-on-hand').textContent = `${(metrics.total_cash || 0).toLocaleString('fr-FR')} FCFA`;
        } catch (error) {
            console.error("Erreur lors de la récupération des métriques:", error);
            showNotification("Erreur lors du chargement des métriques de caisse.", 'danger');
        }
    };
    
    const fetchUsersAndCategories = async () => {
        const expenseUserSelect = document.getElementById('expenseUserSelect');
        const expenseCategorySelect = document.getElementById('expenseCategorySelect');
        if (!expenseUserSelect || !expenseCategorySelect) {
            console.error('Les éléments des formulaires de dépense sont introuvables.');
            return;
        }

        try {
            const [usersRes, categoriesRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/users`),
                axios.get(`${API_BASE_URL}/cash/expense-categories`)
            ]);
            usersCache = usersRes.data;
            categoriesCache = categoriesRes.data;
            
            expenseUserSelect.innerHTML = '<option value="">Sélectionner un utilisateur</option>';
            usersCache.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.name} (${user.role})`;
                expenseUserSelect.appendChild(option);
            });

            expenseCategorySelect.innerHTML = '<option value="">Sélectionner une catégorie</option>';
            categoriesCache.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                expenseCategorySelect.appendChild(option);
            });
        } catch (error) {
            console.error("Erreur lors du chargement des données initiales:", error);
            showNotification("Erreur lors du chargement des listes de données. Vérifiez les logs.", 'danger');
        }
    };
    
    const fetchAndRenderSummary = async (filters = {}) => {
        if (!summaryTableBody) return;
        try {
            const params = new URLSearchParams(filters);
            const response = await axios.get(`${API_BASE_URL}/cash/remittance-summary?${params.toString()}`);
            renderSummaryTable(response.data);
        } catch (error) {
            console.error("Erreur lors de la récupération du résumé des versements:", error);
            summaryTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erreur lors du chargement des données.</td></tr>`;
        }
    };

    const fetchAndRenderExpenses = async (filters = {}) => {
        if (!expensesTableBody) return;
        try {
            const params = new URLSearchParams({ ...filters, type: 'expense' });
            const response = await axios.get(`${API_BASE_URL}/cash/transactions?${params.toString()}`);
            expensesTableBody.innerHTML = '';
            if (response.data.length === 0) {
                expensesTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucune dépense à afficher.</td></tr>`;
                return;
            }
            response.data.forEach(tx => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${moment(tx.created_at).format('DD/MM/YYYY')}</td>
                    <td>${tx.user_name}</td>
                    <td>${tx.category_name || 'N/A'}</td>
                    <td class="text-danger">${Math.abs(parseFloat(tx.amount)).toLocaleString('fr-FR')} FCFA</td>
                    <td>${tx.comment || 'N/A'}</td>
                    <td>
                        <div class="dropdown">
                            <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-gear"></i></button>
                            <ul class="dropdown-menu">
                                <li><a class="dropdown-item edit-btn" href="#" data-id="${tx.id}"><i class="bi bi-pencil"></i> Modifier</a></li>
                                <li><a class="dropdown-item delete-btn text-danger" href="#" data-id="${tx.id}"><i class="bi bi-trash"></i> Supprimer</a></li>
                            </ul>
                        </div>
                    </td>
                `;
                expensesTableBody.appendChild(row);
            });
        } catch (error) {
            console.error("Erreur lors de la récupération des dépenses:", error);
            expensesTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erreur lors du chargement des dépenses.</td></tr>`;
        }
    };
    
    const fetchAndRenderWithdrawals = async (filters = {}) => {
        if (!withdrawalsTableBody) return;
        try {
            const params = new URLSearchParams({ ...filters, type: 'manual_withdrawal' });
            const response = await axios.get(`${API_BASE_URL}/cash/transactions?${params.toString()}`);
            withdrawalsTableBody.innerHTML = '';
            if (response.data.length === 0) {
                withdrawalsTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-3">Aucun décaissement à afficher.</td></tr>`;
                return;
            }
            response.data.forEach(tx => {
                 const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${moment(tx.created_at).format('DD/MM/YYYY')}</td>
                    <td>${tx.user_name}</td>
                    <td class="text-danger">${Math.abs(parseFloat(tx.amount)).toLocaleString('fr-FR')} FCFA</td>
                    <td>${tx.comment || 'N/A'}</td>
                    <td>
                        <div class="dropdown">
                            <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-gear"></i></button>
                            <ul class="dropdown-menu">
                                <li><a class="dropdown-item edit-btn" href="#" data-id="${tx.id}"><i class="bi bi-pencil"></i> Modifier</a></li>
                                <li><a class="dropdown-item delete-btn text-danger" href="#" data-id="${tx.id}"><i class="bi bi-trash"></i> Supprimer</a></li>
                            </ul>
                        </div>
                    </td>
                `;
                withdrawalsTableBody.appendChild(row);
            });
        } catch (error) {
            console.error("Erreur lors de la récupération des décaissements:", error);
            withdrawalsTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger p-4">Erreur lors du chargement des décaissements.</td></tr>`;
        }
    };

    const renderSummaryTable = (summary) => {
        if (!summaryTableBody) return;
        summaryTableBody.innerHTML = '';
        if (summary.length === 0) {
            summaryTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucun versement en attente.</td></tr>`;
            return;
        }

        summary.forEach((item) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.user_name}</td>
                <td>${item.pending_count}</td>
                <td class="fw-bold text-success">${parseFloat(item.pending_amount).toLocaleString('fr-FR')} FCFA</td>
                <td>${item.confirmed_count}</td>
                <td>${parseFloat(item.confirmed_amount).toLocaleString('fr-FR')} FCFA</td>
                <td>
                    <div class="dropdown">
                        <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-gear"></i></button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item details-btn" href="#" data-id="${item.user_id}"><i class="bi bi-eye"></i> Détails</a></li>
                        </ul>
                    </div>
                </td>
            `;
            summaryTableBody.appendChild(row);
        });
    };
    
    const fetchRemittanceDetails = async (deliverymanId) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/cash/remittance-details/${deliverymanId}`);
            return response.data;
        } catch (error) {
            showNotification("Erreur lors de la récupération des détails du livreur.", 'danger');
            return null;
        }
    };

    const renderDetailsModal = (deliveryman, transactions) => {
        if (!modalDeliverymanName || !modalTransactionsTableBody) return;
        modalDeliverymanName.textContent = deliveryman.user_name;
        const totalPendingAmount = transactions.filter(t => t.status === 'pending').reduce((sum, t) => sum + parseFloat(t.amount), 0);
        document.getElementById('modalTotalPendingAmount').textContent = `${totalPendingAmount.toLocaleString('fr-FR')} FCFA`;

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
        
        if (remittanceDetailsModal) remittanceDetailsModal.show();
    };
    
    const applyFiltersAndRender = () => {
        const filters = {
            startDate: startDateInput.value,
            endDate: endDateInput.value,
            search: globalSearchInput.value
        };
        const activeTab = document.querySelector('#cashTabs button.active');
        if (activeTab) {
            const targetTab = activeTab.getAttribute('data-bs-target');
            if (targetTab === '#remittances-panel') {
                fetchAndRenderSummary(filters);
            } else if (targetTab === '#expenses-panel') {
                fetchAndRenderExpenses(filters);
            } else if (targetTab === '#withdrawals-panel') {
                fetchAndRenderWithdrawals(filters);
            }
        }
    };

    // Gestion du changement d'onglet pour charger les bonnes données
    const cashTabs = document.getElementById('cashTabs');
    if (cashTabs) {
        cashTabs.addEventListener('shown.bs.tab', async (event) => {
            applyFiltersAndRender();
        });
    }

    // --- Écouteurs d'événements ---
    if (refreshBtn) refreshBtn.addEventListener('click', fetchAndRenderSummary);
    if (filterBtn) filterBtn.addEventListener('click', applyFiltersAndRender);

    if (summaryTableBody) {
        summaryTableBody.addEventListener('click', async (e) => {
            const target = e.target.closest('button.details-btn');
            if (!target) return;
            const deliverymanId = target.dataset.id;
            const deliverymanName = e.target.closest('tr').querySelector('td:nth-child(1)').textContent;
            
            const details = await fetchRemittanceDetails(deliverymanId);
            if (details) {
                const summaryItem = { user_id: deliverymanId, user_name: deliverymanName };
                renderDetailsModal(summaryItem, details);
            }
        });
    }

    if (modalTransactionsTableBody) {
        modalTransactionsTableBody.addEventListener('click', async (e) => {
            const target = e.target.closest('button.confirm-btn');
            if (!target) return;
            const transactionId = target.dataset.id;

            if (confirm("Confirmer ce versement ?")) {
                try {
                    await axios.put(`${API_BASE_URL}/cash/confirm/${transactionId}`, { validated_by: user.id });
                    showNotification("Versement confirmé avec succès.");
                    if (remittanceDetailsModal) remittanceDetailsModal.hide();
                    fetchAndRenderSummary();
                } catch (error) {
                    showNotification("Erreur lors de la confirmation du versement.", 'danger');
                }
            }
        });
    }

    if (confirmBatchBtn) {
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
                        validated_by: user.id
                    };
                    await axios.put(`${API_BASE_URL}/cash/confirm-batch`, payload);
                    showNotification("Versements confirmés avec succès.");
                    if (remittanceDetailsModal) remittanceDetailsModal.hide();
                    fetchAndRenderSummary();
                } catch (error) {
                    showNotification(error.response?.data?.message || "Erreur lors de la confirmation des versements.", 'danger');
                }
            }
        });
    }

    if (expenseForm) {
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
                if (addExpenseModal) addExpenseModal.hide();
                await fetchAndRenderExpenses();
                await fetchCashMetrics();
            } catch (error) {
                showNotification(error.response?.data?.message || "Erreur lors de l'enregistrement de la dépense.", 'danger');
            }
        });
    }

    if (expensesTableBody) {
        expensesTableBody.addEventListener('click', async (e) => {
            const target = e.target.closest('a.edit-btn');
            const deleteTarget = e.target.closest('a.delete-btn');
            if (target) {
                const transactionId = target.dataset.id;
                transactionIdToEdit = transactionId;
                try {
                    const response = await axios.get(`${API_BASE_URL}/cash/transactions/${transactionId}`);
                    const transaction = response.data;
                    document.getElementById('editExpenseAmount').value = Math.abs(transaction.amount);
                    document.getElementById('editExpenseComment').value = transaction.comment;
                    if (editExpenseModal) editExpenseModal.show();
                } catch (error) {
                    showNotification("Impossible de récupérer les détails de la dépense.", "danger");
                }
            } else if (deleteTarget) {
                const transactionId = deleteTarget.dataset.id;
                if (confirm("Voulez-vous vraiment supprimer cette dépense ?")) {
                    try {
                        await axios.delete(`${API_BASE_URL}/cash/transactions/${transactionId}`);
                        showNotification("Dépense supprimée avec succès.");
                        await fetchAndRenderExpenses();
                        await fetchCashMetrics();
                    } catch (error) {
                        showNotification("Erreur lors de la suppression de la dépense.", "danger");
                    }
                }
            }
        });
    }
    
    if (editExpenseForm) {
        editExpenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('editExpenseAmount').value;
            const comment = document.getElementById('editExpenseComment').value;
            try {
                await axios.put(`${API_BASE_URL}/cash/transactions/${transactionIdToEdit}`, { amount: -Math.abs(amount), comment });
                showNotification("Dépense modifiée avec succès !");
                if (editExpenseModal) editExpenseModal.hide();
                await fetchAndRenderExpenses();
                await fetchCashMetrics();
            } catch (error) {
                showNotification(error.response?.data?.message || "Erreur lors de la modification de la dépense.", 'danger');
            }
        });
    }
    
    if (withdrawalForm) {
        withdrawalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await axios.post(`${API_BASE_URL}/cash/withdrawal`, {
                    user_id: user.id,
                    amount: withdrawalAmountInput.value,
                    comment: withdrawalCommentInput.value
                });
                showNotification("Décaissement manuel enregistré avec succès !");
                if (manualWithdrawalModal) manualWithdrawalModal.hide();
                await fetchAndRenderWithdrawals();
                await fetchCashMetrics();
            } catch (error) {
                showNotification(error.response?.data?.message || "Erreur lors de l'enregistrement du décaissement.", 'danger');
            }
        });
    }

    if (withdrawalsTableBody) {
        withdrawalsTableBody.addEventListener('click', async (e) => {
            const target = e.target.closest('a.edit-btn');
            const deleteTarget = e.target.closest('a.delete-btn');
            if (target) {
                const transactionId = target.dataset.id;
                transactionIdToEdit = transactionId;
                try {
                    const response = await axios.get(`${API_BASE_URL}/cash/transactions/${transactionId}`);
                    const transaction = response.data;
                    document.getElementById('editWithdrawalAmount').value = Math.abs(transaction.amount);
                    document.getElementById('editWithdrawalComment').value = transaction.comment;
                    if (editWithdrawalModal) editWithdrawalModal.show();
                } catch (error) {
                    showNotification("Impossible de récupérer les détails du décaissement.", "danger");
                }
            } else if (deleteTarget) {
                const transactionId = deleteTarget.dataset.id;
                if (confirm("Voulez-vous vraiment supprimer ce décaissement ?")) {
                    try {
                        await axios.delete(`${API_BASE_URL}/cash/transactions/${transactionId}`);
                        showNotification("Décaissement supprimé avec succès.");
                        await fetchAndRenderWithdrawals();
                        await fetchCashMetrics();
                    } catch (error) {
                        showNotification("Erreur lors de la suppression du décaissement.", "danger");
                    }
                }
            }
        });
    }

    if (editWithdrawalForm) {
        editWithdrawalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('editWithdrawalAmount').value;
            const comment = document.getElementById('editWithdrawalComment').value;
            try {
                await axios.put(`${API_BASE_URL}/cash/transactions/${transactionIdToEdit}`, { amount: -Math.abs(amount), comment });
                showNotification("Décaissement modifié avec succès !");
                if (editWithdrawalModal) editWithdrawalModal.hide();
                await fetchAndRenderWithdrawals();
                await fetchCashMetrics();
            } catch (error) {
                showNotification(error.response?.data?.message || "Erreur lors de la modification du décaissement.", 'danger');
            }
        });
    }
    
    // --- Initialisation de la page ---
    await fetchCashMetrics();
    await fetchUsersAndCategories();
    
    // Initialisation des dates par défaut
    if (startDateInput && endDateInput) {
        const today = getTodayDate();
        startDateInput.value = today;
        endDateInput.value = today;
    }
    
    const activeTab = document.querySelector('#cashTabs button.active');
    if (activeTab && activeTab.getAttribute('data-bs-target') === '#remittances-panel') {
        await fetchAndRenderSummary();
    } else if (activeTab && activeTab.getAttribute('data-bs-target') === '#expenses-panel') {
        await fetchAndRenderExpenses();
    } else if (activeTab && activeTab.getAttribute('data-bs-target') === '#withdrawals-panel') {
        await fetchAndRenderWithdrawals();
    }

    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const sidebarToggler = document.getElementById('sidebar-toggler');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (sidebarToggler) {
        sidebarToggler.addEventListener('click', () => {
            if (sidebar && mainContent) {
                sidebar.classList.toggle('collapsed');
                mainContent.classList.toggle('expanded');
            }
        });
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
            window.location.href = 'index.html';
        });
    }

    const currentPath = window.location.pathname.split('/').pop();
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) link.classList.add('active');
    });
});