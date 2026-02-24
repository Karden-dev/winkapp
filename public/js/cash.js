// js/cash.js
document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    const API_BASE_URL = '/api';
    
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (!storedUser) {
        // window.location.href = 'index.html';
        // return; 
    }
    const user = storedUser ? JSON.parse(storedUser) : { id: 1, name: 'Admin Test', token: 'some-token' };
    const CURRENT_USER_ID = user.id;

    if (user.token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${user.token}`;
    }

    if (document.getElementById('userName')) {
        document.getElementById('userName').textContent = user.name;
    }

    // --- CACHES & ÉTAT ---
    let allUsersCache = [];
    let deliverymenCache = [];
    let categoriesCache = [];
    let transactionIdToEdit = null;
    let remittanceDataToConfirm = null;
    let shortfallToSettle = null;
    let shortfallToEdit = null;
    let currentDeliverymanId = null;

    // --- RÉFÉRENCES DOM ---
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const sidebarToggler = document.getElementById('sidebar-toggler');
    const logoutBtn = document.getElementById('logoutBtn');
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const globalSearchInput = document.getElementById('globalSearchInput');
    const filterBtn = document.getElementById('filterBtn');
    const headerActionsContainer = document.getElementById('header-actions-container');

    const summaryTableBody = document.getElementById('summaryTableBody');
    const shortfallsTableBody = document.getElementById('shortfallsTableBody');
    const expensesTableBody = document.getElementById('expensesTableBody');
    const withdrawalsTableBody = document.getElementById('withdrawalsTableBody');
    const closingsHistoryTableBody = document.getElementById('closingsHistoryTableBody');

    // Modales
    const addExpenseModal = new bootstrap.Modal(document.getElementById('addExpenseModal'));
    const manualWithdrawalModal = new bootstrap.Modal(document.getElementById('manualWithdrawalModal'));
    const remittanceDetailsModal = new bootstrap.Modal(document.getElementById('remittanceDetailsModal'));
    const closingManagerModal = new bootstrap.Modal(document.getElementById('closingManagerModal'));
    const editExpenseModal = new bootstrap.Modal(document.getElementById('editExpenseModal'));
    const editWithdrawalModal = new bootstrap.Modal(document.getElementById('editWithdrawalModal'));
    const createShortfallModal = new bootstrap.Modal(document.getElementById('createShortfallModal'));
    const editShortfallModal = new bootstrap.Modal(document.getElementById('editShortfallModal'));
    const confirmAmountModal = new bootstrap.Modal(document.getElementById('confirmAmountModal'));
    const settleShortfallModal = new bootstrap.Modal(document.getElementById('settleShortfallModal'));
    // **CORRECTION: La référence à la modale supprimée est enlevée, ce qui corrige le bug**

    // Formulaires
    const confirmAmountForm = document.getElementById('confirmAmountForm');
    const confirmAmountInput = document.getElementById('confirmAmountInput');
    const expectedAmountDisplay = document.getElementById('expectedAmountDisplay');
    const amountError = document.getElementById('amountError');
    const settleShortfallForm = document.getElementById('settleShortfallForm');
    const expenseForm = document.getElementById('expenseForm');
    const expenseDateInput = document.getElementById('expenseDateInput');
    const expenseUserSearchInput = document.getElementById('expenseUserSearch');
    const expenseUserSearchResults = document.getElementById('expenseUserSearchResults');
    const expenseUserIdInput = document.getElementById('expenseUserId');
    const withdrawalForm = document.getElementById('withdrawalForm');
    const withdrawalDateInput = document.getElementById('withdrawalDateInput');
    const editExpenseForm = document.getElementById('editExpenseForm');
    const editWithdrawalForm = document.getElementById('editWithdrawalForm');
    const closeCashForm = document.getElementById('closeCashForm');
    const createShortfallForm = document.getElementById('createShortfallForm');
    const editShortfallForm = document.getElementById('editShortfallForm');
    
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
        
        setTimeout(() => {
            const instance = bootstrap.Alert.getOrCreateInstance(alertDiv);
            if (instance) {
                instance.close();
            }
        }, 4000); 
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

    // --- GESTION DYNAMIQUE DES BOUTONS DU HEADER ---

    const tabActions = {
        remittances: '',
        shortfalls: `
            <button class="btn btn-sm btn-primary" data-bs-toggle="modal" data-bs-target="#createShortfallModal">
                <i class="bi bi-plus-circle"></i> Créer Manquant
            </button>
        `,
        expenses: `
            <button class="btn btn-sm btn-primary" data-bs-toggle="modal" data-bs-target="#addExpenseModal">
                <i class="bi bi-plus-circle"></i> Ajouter une Dépense
            </button>
        `,
        withdrawals: `
            <button class="btn btn-sm btn-warning" data-bs-toggle="modal" data-bs-target="#manualWithdrawalModal">
                <i class="bi bi-box-arrow-down"></i> Ajouter un Décaissement
            </button>
        `
    };

    const updateHeaderActions = (tabId) => {
        headerActionsContainer.innerHTML = tabActions[tabId] || '';
    };
    
    // --- FONCTIONS DE CHARGEMENT DES DONNÉES ---

    const applyFiltersAndRender = async () => {
        filterBtn.disabled = true;
        filterBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

        try {
            const activeTab = document.querySelector('#cashTabs .nav-link.active');
            if (!activeTab) return;
            
            const targetPanelId = activeTab.getAttribute('data-bs-target');
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            const search = globalSearchInput.value;

            if (!startDate || !endDate) {
                showNotification("Période invalide.", "warning");
                return;
            }
            
            await fetchCashMetrics(startDate, endDate);

            switch (targetPanelId) {
                case '#remittances-panel':
                    await fetchAndRenderSummary(startDate, endDate, search);
                    break;
                case '#shortfalls-panel':
                    await fetchAndRenderShortfalls(search);
                    break;
                case '#expenses-panel':
                    await fetchAndRenderTransactions('expense', expensesTableBody, startDate, endDate, search);
                    break;
                case '#withdrawals-panel':
                    await fetchAndRenderTransactions('manual_withdrawal', withdrawalsTableBody, startDate, endDate, search);
                    break;
            }
        } catch (error) {
             console.error("Erreur lors de l'actualisation des données:", error);
        } finally {
            filterBtn.disabled = false;
            filterBtn.innerHTML = '<i class="bi bi-funnel me-1"></i>Filtrer';
        }
    };

    const fetchCashMetrics = async (startDate, endDate) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/metrics`, { params: { startDate, endDate } });
            
            document.getElementById('db-cash-on-hand').textContent = formatAmount(res.data.montant_en_caisse);
            document.getElementById('db-total-collected').textContent = formatAmount(res.data.encaisser);
            const totalRemittedFlow = res.data.creances_remboursees + res.data.manquants_rembourses;
            document.getElementById('db-total-debts-settled').textContent = formatAmount(totalRemittedFlow);
            document.getElementById('db-total-expenses').textContent = formatAmount(res.data.depenses);
            document.getElementById('db-total-withdrawals').textContent = formatAmount(res.data.decaissements);
            
        } catch (error) {
            console.error("Erreur de chargement des métriques:", error);
        }
    };
    
    const fetchAndRenderSummary = async (startDate, endDate, search) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/remittance-summary`, { params: { startDate, endDate, search } });
            summaryTableBody.innerHTML = res.data.length === 0 ? `<tr><td colspan="6" class="text-center p-3">Aucun versement à afficher.</td></tr>` : '';
            res.data.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.user_name}</td>
                    <td>${item.pending_count || 0}</td>
                    <td class="text-warning fw-bold">${formatAmount(item.pending_amount)}</td>
                    <td>${item.confirmed_count || 0}</td>
                    <td class="text-success fw-bold">${formatAmount(item.confirmed_amount)}</td>
                    <td><button class="btn btn-sm btn-primary-custom details-btn" data-id="${item.user_id}" data-name="${item.user_name}">Gérer</button></td>
                `;
                summaryTableBody.appendChild(row);
            });
        } catch (error) {
            summaryTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erreur de chargement.</td></tr>`;
            throw error;
        }
    };

    const fetchAndRenderShortfalls = async (search) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/shortfalls`, { params: { search, status: '' } });
            shortfallsTableBody.innerHTML = res.data.length === 0 ? `<tr><td colspan="6" class="text-center p-3">Aucun manquant à afficher.</td></tr>` : '';
            res.data.forEach(item => {
                const row = document.createElement('tr');
                const settledDate = item.settled_at ? moment(item.settled_at).format('DD/MM/YYYY HH:mm') : '—';
                
                const statusInfo = {
                    pending: { text: 'En attente', class: 'text-warning', icon: 'bi-clock-history' },
                    paid: { text: 'Réglé', class: 'text-success', icon: 'bi-check-circle-fill' },
                    partially_paid: { text: 'Partiel', class: 'text-info', icon: 'bi-pie-chart-fill' }
                };
                const currentStatus = statusInfo[item.status] || { text: item.status, class: '', icon: 'bi-question-circle' };
                const statusBadge = `<span class="${currentStatus.class}"><i class="bi ${currentStatus.icon} me-1"></i>${currentStatus.text}</span>`;

                row.innerHTML = `
                    <td>${item.deliveryman_name}</td>
                    <td class="text-danger fw-bold">${formatAmount(item.amount)}</td>
                    <td>${statusBadge}</td>
                    <td>${moment(item.created_at).format('DD/MM/YYYY')}</td>
                    <td>${settledDate}</td>
                    <td>
                        <div class="btn-group">
                            <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">Actions</button>
                            <ul class="dropdown-menu">
                                ${item.status !== 'paid' ? `<li><a class="dropdown-item settle-shortfall-btn" href="#" data-id="${item.id}" data-amount="${item.amount}">Régler</a></li>` : ''}
                                ${item.status === 'pending' ? `<li><a class="dropdown-item edit-shortfall-btn" href="#" data-id="${item.id}" data-amount="${item.amount}" data-comment="${item.comment || ''}">Modifier</a></li>` : ''}
                                ${item.status === 'pending' ? `<li><hr class="dropdown-divider"></li>` : ''}
                                ${item.status === 'pending' ? `<li><a class="dropdown-item delete-shortfall-btn" href="#" data-id="${item.id}">Supprimer</a></li>` : ''}
                                ${item.status === 'paid' ? `<li><span class="dropdown-item-text">Aucune action disponible</span></li>` : ''}
                            </ul>
                        </div>
                    </td>
                `;
                shortfallsTableBody.appendChild(row);
            });
        } catch (error) {
            shortfallsTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erreur de chargement.</td></tr>`;
            throw error;
        }
    };

    const fetchAndRenderTransactions = async (type, tableBody, startDate, endDate, search) => {
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/transactions`, { params: { type, startDate, endDate, search } });
            tableBody.innerHTML = res.data.length === 0 ? `<tr><td colspan="6" class="text-center p-3">Aucune transaction.</td></tr>` : '';
            res.data.forEach(tx => {
                const row = document.createElement('tr');
                const userDisplayName = type === 'expense' ? tx.user_name : (tx.validated_by_name || 'Admin');
                const category = tx.category_name || '';
                
                row.innerHTML = `
                    <td>${moment(tx.created_at).format('DD/MM/YYYY HH:mm')}</td>
                    <td>${userDisplayName}</td>
                    ${type === 'expense' ? `<td>${category}</td>` : ''}
                    <td class="text-danger fw-bold">${formatAmount(Math.abs(tx.amount))}</td>
                    <td>${tx.comment || ''}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-info edit-tx-btn" data-id="${tx.id}" data-type="${type}" data-amount="${Math.abs(tx.amount)}" data-comment="${tx.comment || ''}" title="Modifier"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger delete-tx-btn" data-id="${tx.id}" title="Supprimer"><i class="bi bi-trash"></i></button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erreur de chargement.</td></tr>`;
            throw error;
        }
    };
    
    const fetchClosingHistory = async () => {
        const startDate = document.getElementById('historyStartDate').value;
        const endDate = document.getElementById('historyEndDate').value;
        try {
            const res = await axios.get(`${API_BASE_URL}/cash/closing-history`, { params: { startDate, endDate } });
            if (!Array.isArray(res.data)) {
                 closingsHistoryTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Format de données invalide.</td></tr>`;
                 return;
            }
            closingsHistoryTableBody.innerHTML = res.data.length === 0 ? `<tr><td colspan="4" class="text-center p-3">Aucun historique.</td></tr>` : '';
            res.data.forEach(item => {
                const difference = parseFloat(item.difference || 0);
                const diffClass = difference < 0 ? 'text-danger' : (difference > 0 ? 'text-success' : '');
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${moment(item.closing_date).format('DD/MM/YYYY')}</td>
                    <td>${formatAmount(item.expected_cash)}</td>
                    <td>${formatAmount(item.actual_cash_counted)}</td>
                    <td class="fw-bold ${diffClass}">${formatAmount(difference)}</td>
                `;
                closingsHistoryTableBody.appendChild(row);
            });
        } catch (error) {
            closingsHistoryTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Erreur de chargement.</td></tr>`;
            throw error;
        }
    };
    
    const fetchInitialData = async () => {
        try {
            const [usersRes, categoriesRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/users`),
                axios.get(`${API_BASE_URL}/cash/expense-categories`)
            ]);
            allUsersCache = usersRes.data;
            deliverymenCache = allUsersCache.filter(u => u.role === 'livreur');
            categoriesCache = categoriesRes.data;
            
            const expenseCategorySelect = document.getElementById('expenseCategorySelect');
            expenseCategorySelect.innerHTML = '<option value="">Sélectionner une catégorie</option>';
            categoriesCache.forEach(cat => expenseCategorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`);

            const shortfallDeliverymanSelect = document.getElementById('shortfallDeliverymanSelect');
            if(shortfallDeliverymanSelect) {
                shortfallDeliverymanSelect.innerHTML = '<option value="">Sélectionner un livreur...</option>';
                deliverymenCache.forEach(d => shortfallDeliverymanSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`);
            }

        } catch (error) {
            showNotification("Erreur de chargement des données de base. Vérifiez que vous êtes autorisé.", "danger");
            throw error;
        }
    };
    
    // --- GESTION DES ÉVÉNEMENTS & MODALES ---

    const handleTransactionFormSubmit = (form, endpoint, successMsg) => async (e) => {
        e.preventDefault();
        const formData = {};
        
        try {
            if (form === expenseForm) {
                formData.user_id = expenseUserIdInput.value;
                formData.created_at = expenseDateInput.value;
                formData.category_id = document.getElementById('expenseCategorySelect').value;
                formData.amount = document.getElementById('expenseAmountInput').value;
                formData.comment = document.getElementById('expenseCommentInput').value;
                if (!formData.user_id) throw new Error("Veuillez sélectionner un utilisateur.");
            } else if (form === withdrawalForm) {
                formData.amount = document.getElementById('withdrawalAmountInput').value;
                formData.created_at = document.getElementById('withdrawalDateInput').value;
                formData.comment = document.getElementById('withdrawalCommentInput').value;
                formData.user_id = CURRENT_USER_ID;
            }
            
            await axios.post(`${API_BASE_URL}/cash/${endpoint}`, formData);
            showNotification(successMsg);
            
            if (form === expenseForm) addExpenseModal.hide();
            else if (form === withdrawalForm) manualWithdrawalModal.hide();
            
            form.reset();
            resetModalForms();
            applyFiltersAndRender();
        } catch (error) { 
            const message = error.response?.data?.message || error.message || "Erreur inconnue.";
            showNotification(message, "danger"); 
        }
    };

    const handleEditFormSubmit = (type) => async (e) => {
        e.preventDefault();
        const amount = document.getElementById(`edit${type}Amount`).value;
        const comment = document.getElementById(`edit${type}Comment`).value;
        
        try {
            await axios.put(`${API_BASE_URL}/cash/transactions/${transactionIdToEdit}`, { amount, comment });
            showNotification(`${type} modifiée.`);
            if (type === 'Expense') editExpenseModal.hide();
            else if (type === 'Withdrawal') editWithdrawalModal.hide();
            applyFiltersAndRender();
        } catch (error) { 
            showNotification("Erreur de modification.", 'danger'); 
        }
    };

    const renderOrdersToRemit = (orders) => {
        const tableBody = document.getElementById('modalTransactionsTableBody');
        tableBody.innerHTML = '';

        if (!orders || orders.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucune commande à verser pour ce livreur à cette date.</td></tr>`;
            return;
        }

        orders.forEach(order => {
            const row = document.createElement('tr');
            
            const commentDetails = [
                order.shop_name,
                order.item_names,
                order.delivery_location
            ].filter(Boolean).join(', ');

            const isConfirmed = order.remittance_status === 'confirmed';
            const confirmedAmount = isConfirmed ? order.remittance_amount_tx : 0;
            const statusBadge = isConfirmed 
                ? `<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Confirmé</span>`
                : `<span class="text-warning"><i class="bi bi-clock-history me-1"></i>En attente</span>`;

            const actionsHtml = `
                <div class="btn-group">
                    <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">Actions</button>
                    <ul class="dropdown-menu">
                        ${!isConfirmed ? `<li><a class="dropdown-item confirm-single-remittance-btn" href="#" data-order-id="${order.order_id}" data-amount="${order.expected_amount}"><i class="bi bi-check2 me-2"></i>Confirmer</a></li>` : ''}
                        <li><a class="dropdown-item disabled" href="#" title="Modification désactivée car les frais d'expédition sont gérés automatiquement"><i class="bi bi-pencil me-2"></i>Modifier</a></li>
                    </ul>
                </div>
            `;
            
            row.innerHTML = `
                <td><input type="checkbox" class="order-checkbox" data-id="${order.order_id}" data-amount="${order.expected_amount}" ${isConfirmed ? 'disabled' : ''}></td>
                <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${commentDetails}">
                    ${commentDetails}
                </td>
                <td class="fw-bold">${formatAmount(order.expected_amount)}</td>
                <td class="text-success">${formatAmount(confirmedAmount)}</td>
                <td>${statusBadge}</td>
                <td>${actionsHtml}</td>
            `;
            tableBody.appendChild(row);
        });
    };
    
    const handleRemittanceDetails = async (deliverymanId, deliverymanName) => {
        currentDeliverymanId = deliverymanId;
        document.getElementById('modalDeliverymanName').textContent = deliverymanName;
        
        const tableBody = document.getElementById('modalTransactionsTableBody');
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4"><div class="spinner-border spinner-border-sm" role="status"></div> Chargement...</td></tr>';
        
        const totalExpectedEl = document.getElementById('modalTotalExpected');
        if (totalExpectedEl) {
            totalExpectedEl.textContent = "Calcul...";
        }
        
        remittanceDetailsModal.show();

        try {
            const selectedDate = startDateInput.value;
            const res = await axios.get(`${API_BASE_URL}/cash/remittance-details/${deliverymanId}`, { 
                params: { date: selectedDate } 
            });

            const totalPending = res.data.orders
                .filter(o => o.remittance_status !== 'confirmed')
                .reduce((sum, order) => sum + parseFloat(order.expected_amount), 0);
            
            if (totalExpectedEl) {
                totalExpectedEl.textContent = formatAmount(totalPending);
            }
            renderOrdersToRemit(res.data.orders);
            
        } catch (error) {
            console.error("Erreur détaillée lors du chargement des détails de versement:", error);
            if (error.response) {
                console.error("Données de la réponse d'erreur:", error.response.data);
                showNotification(`Erreur du serveur: ${error.response.data.message || 'Erreur inconnue.'}`, "danger");
            } else {
                showNotification("Erreur réseau ou impossible de joindre le serveur.", "danger");
            }
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger p-4">Erreur de chargement des versements.</td></tr>';
        }
    };
    
    const handleConfirmBatch = () => {
        const selectedCheckboxes = document.querySelectorAll('#modalTransactionsTableBody .order-checkbox:checked:not([disabled])');
        const orderIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);

        if (orderIds.length === 0) return showNotification("Sélectionnez au moins une commande non confirmée.", 'warning');

        const expectedAmount = Array.from(selectedCheckboxes).reduce((sum, cb) => sum + parseFloat(cb.dataset.amount), 0);

        remittanceDataToConfirm = { orderIds, expectedAmount, deliverymanId: currentDeliverymanId };
        
        expectedAmountDisplay.textContent = formatAmount(expectedAmount);
        confirmAmountInput.value = expectedAmount.toFixed(0);
        amountError.classList.add('d-none');
        confirmAmountModal.show();
    };
    
    const handleConfirmSingleRemittance = (target) => {
        const orderIds = [target.dataset.orderId];
        const expectedAmount = parseFloat(target.dataset.amount);
        
        remittanceDataToConfirm = { orderIds, expectedAmount, deliverymanId: currentDeliverymanId };

        expectedAmountDisplay.textContent = formatAmount(expectedAmount);
        confirmAmountInput.value = expectedAmount.toFixed(0);
        amountError.classList.add('d-none');
        confirmAmountModal.show();
    };

    const handleAmountConfirmationSubmit = async (e) => {
        e.preventDefault();
        const paidAmount = parseFloat(confirmAmountInput.value.trim());

        // **CORRECTION: La validation permet les montants négatifs**
        if (isNaN(paidAmount)) {
            amountError.textContent = "Veuillez entrer un montant numérique valide.";
            amountError.classList.remove('d-none');
            return;
        }
        amountError.classList.add('d-none');

        if (!remittanceDataToConfirm) return;
        
        const { orderIds, expectedAmount, deliverymanId } = remittanceDataToConfirm;

        try {
            const res = await axios.put(`${API_BASE_URL}/cash/remittances/confirm`, { 
                deliverymanId,
                expectedAmount,
                paidAmount,
                orderIds,
                date: startDateInput.value
            });
            showNotification(res.data.message);
            confirmAmountModal.hide();
            remittanceDetailsModal.hide();
            applyFiltersAndRender();
        } catch (error) { 
            showNotification(error.response?.data?.message || "Erreur lors de la confirmation.", "danger"); 
        }
    };
    
    const handleSettleShortfall = (target) => {
        shortfallToSettle = { id: target.dataset.id, amountDue: parseFloat(target.dataset.amount) };
        const shortfallDueDisplay = document.getElementById('shortfallDueDisplay');
        if (shortfallDueDisplay) {
            shortfallDueDisplay.textContent = formatAmount(shortfallToSettle.amountDue);
        }
        const settleShortfallAmountInput = document.getElementById('settleShortfallAmountInput');
        if (settleShortfallAmountInput) {
            settleShortfallAmountInput.value = shortfallToSettle.amountDue;
        }
        document.getElementById('settlementDateInput').value = new Date().toISOString().slice(0, 10);
        settleShortfallModal.show();
    };
    
    const handleSettleShortfallSubmit = async (e) => {
        e.preventDefault();
        const amountPaid = document.getElementById('settleShortfallAmountInput').value;
        const settlementDate = document.getElementById('settlementDateInput').value;
        
        if (!shortfallToSettle || amountPaid === '' || isNaN(amountPaid) || parseFloat(amountPaid) <= 0 || !settlementDate) {
            showNotification("Veuillez entrer un montant et une date de règlement valides.", "warning");
            return;
        }

        try {
            await axios.put(`${API_BASE_URL}/cash/shortfalls/${shortfallToSettle.id}/settle`, { 
                amountPaid: parseFloat(amountPaid),
                settlementDate: settlementDate
            });
            showNotification("Règlement enregistré.");
            settleShortfallModal.hide();
            applyFiltersAndRender();
            shortfallToSettle = null;
        } catch (error) { 
            showNotification(error.response?.data?.message || "Erreur lors du règlement.", "danger"); 
        }
    };

    const handleCreateShortfallSubmit = async (e) => {
        e.preventDefault();
        const deliverymanId = document.getElementById('shortfallDeliverymanSelect').value;
        const amount = document.getElementById('shortfallAmountInput').value;
        const comment = document.getElementById('shortfallCommentInput').value;
        const date = document.getElementById('shortfallDateInput').value;

        try {
            await axios.post(`${API_BASE_URL}/cash/shortfalls`, { deliverymanId, amount, comment, date });
            createShortfallModal.hide();
            showNotification('Manquant créé avec succès !');
            applyFiltersAndRender(); 
        } catch (error) {
            showNotification(error.response?.data?.message || 'Erreur lors de la création du manquant.', "danger");
        }
    };
    
    const handleEditShortfall = (target) => {
        shortfallToEdit = {
            id: target.dataset.id,
            amount: target.dataset.amount,
            comment: target.dataset.comment
        };
        document.getElementById('editShortfallId').value = shortfallToEdit.id;
        document.getElementById('editShortfallAmount').value = shortfallToEdit.amount;
        document.getElementById('editShortfallComment').value = shortfallToEdit.comment;
        editShortfallModal.show();
    };

    const handleEditShortfallSubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('editShortfallId').value;
        const amount = document.getElementById('editShortfallAmount').value;
        const comment = document.getElementById('editShortfallComment').value;
        
        try {
            await axios.put(`${API_BASE_URL}/cash/shortfalls/${id}`, { amount, comment });
            editShortfallModal.hide();
            showNotification('Manquant modifié avec succès !');
            applyFiltersAndRender();
        } catch(error) {
            showNotification(error.response?.data?.message || 'Erreur lors de la modification.', "danger");
        }
    };
    
    const handleDeleteShortfall = async (target) => {
        const id = target.dataset.id;
        if (confirm(`Voulez-vous vraiment supprimer le manquant n°${id} ? Cette action est irréversible.`)) {
            try {
                await axios.delete(`${API_BASE_URL}/cash/shortfalls/${id}`);
                showNotification('Manquant supprimé avec succès.');
                applyFiltersAndRender();
            } catch (error) {
                showNotification(error.response?.data?.message || 'Erreur lors de la suppression.', "danger");
            }
        }
    };

    const handleEditTransaction = (target) => {
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
    };

    const handleDeleteTransaction = async (target) => {
        const txId = target.dataset.id;
        if (confirm('Voulez-vous vraiment supprimer cette transaction ?')) {
            try {
                await axios.delete(`${API_BASE_URL}/cash/transactions/${txId}`);
                showNotification('Transaction supprimée.');
                applyFiltersAndRender();
            } catch (error) { showNotification("Erreur de suppression.", "danger"); }
        }
    };

    const resetModalForms = () => {
        const today = new Date().toISOString().slice(0, 10);
        if (expenseDateInput) expenseDateInput.value = today;
        if (withdrawalDateInput) withdrawalDateInput.value = today;
        document.getElementById('shortfallDateInput').value = today;
        if (expenseUserSearchResults) expenseUserSearchResults.classList.add('d-none');
        if (createShortfallForm) createShortfallForm.reset();
    };
    
    const setupUserSearchExpense = () => {
        expenseUserSearchInput.addEventListener('input', () => {
            const searchTerm = expenseUserSearchInput.value.toLowerCase();
            expenseUserSearchResults.innerHTML = '';
            if (searchTerm.length > 1) {
                const filteredUsers = allUsersCache.filter(user => user.name.toLowerCase().includes(searchTerm));
                if (filteredUsers.length > 0) {
                    filteredUsers.forEach(user => {
                        const div = document.createElement('div');
                        div.className = 'p-2 dropdown-item';
                        div.textContent = user.name;
                        div.dataset.id = user.id;
                        div.addEventListener('click', () => {
                            expenseUserSearchInput.value = user.name;
                            expenseUserIdInput.value = user.id;
                            expenseUserSearchResults.classList.add('d-none');
                        });
                        expenseUserSearchResults.appendChild(div);
                    });
                    expenseUserSearchResults.classList.remove('d-none');
                } else {
                    expenseUserSearchResults.innerHTML = '<div class="p-2 text-muted">Aucun résultat.</div>';
                    expenseUserSearchResults.classList.remove('d-none');
                }
            } else {
                expenseUserSearchResults.classList.add('d-none');
            }
        });
        
        document.body.addEventListener('click', (e) => {
            if (expenseUserSearchResults && !expenseUserSearchResults.contains(e.target) && e.target !== expenseUserSearchInput) {
                expenseUserSearchResults.classList.add('d-none');
            }
        });
    };
    
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
        
        document.querySelectorAll('#cashTabs .nav-link').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (event) => {
                const tabId = event.target.getAttribute('data-bs-target').substring(1).replace('-panel', '');
                updateHeaderActions(tabId);
                applyFiltersAndRender();
            });
        });

        if (confirmAmountForm) confirmAmountForm.addEventListener('submit', handleAmountConfirmationSubmit);
        if (settleShortfallForm) settleShortfallForm.addEventListener('submit', handleSettleShortfallSubmit);
        if (createShortfallForm) createShortfallForm.addEventListener('submit', handleCreateShortfallSubmit);
        if (editShortfallForm) editShortfallForm.addEventListener('submit', handleEditShortfallSubmit);

        document.getElementById('historyStartDate').addEventListener('change', fetchClosingHistory);
        document.getElementById('historyEndDate').addEventListener('change', fetchClosingHistory);
        document.getElementById('exportHistoryBtn')?.addEventListener('click', () => {
            const startDate = document.getElementById('historyStartDate').value;
            const endDate = document.getElementById('historyEndDate').value;
            window.open(`${API_BASE_URL}/cash/closing-history/export?startDate=${startDate}&endDate=${endDate}`, '_blank');
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

        expenseForm.addEventListener('submit', handleTransactionFormSubmit(expenseForm, 'expense', "Dépense enregistrée."));
        withdrawalForm.addEventListener('submit', handleTransactionFormSubmit(withdrawalForm, 'withdrawal', "Décaissement enregistré."));
        editExpenseForm.addEventListener('submit', handleEditFormSubmit('Expense'));
        editWithdrawalForm.addEventListener('submit', handleEditFormSubmit('Withdrawal'));

        // **CORRECTION: Le gestionnaire d'événements est simplifié et plus robuste**
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('button, a');
            if (!target) return;
            
            const isLink = target.tagName === 'A' && target.getAttribute('href') === '#';
            if(isLink) e.preventDefault();

            if (target.matches('.details-btn')) {
                handleRemittanceDetails(target.dataset.id, target.dataset.name);
            } else if (target.matches('.settle-shortfall-btn')) {
                handleSettleShortfall(target);
            } else if (target.matches('.edit-shortfall-btn')) {
                handleEditShortfall(target);
            } else if (target.matches('.delete-shortfall-btn')) {
                handleDeleteShortfall(target);
            } else if (target.matches('.edit-tx-btn')) {
                handleEditTransaction(target);
            } else if (target.matches('.delete-tx-btn')) {
                handleDeleteTransaction(target);
            } else if (target.matches('.confirm-single-remittance-btn')) {
                handleConfirmSingleRemittance(target);
            }
        });
        
        confirmBatchBtn.addEventListener('click', handleConfirmBatch);
        
        setupUserSearchExpense();
    };

    // --- Lancement de la page ---
    const initializeApp = async () => {
        const today = new Date().toISOString().slice(0, 10);
        startDateInput.value = today; 
        endDateInput.value = today;
        document.getElementById('closeDate').value = today;
        document.getElementById('shortfallDateInput').value = today;
        document.getElementById('historyStartDate').value = moment().subtract(30, 'days').format('YYYY-MM-DD');
        document.getElementById('historyEndDate').value = today;

        initializeEventListeners();
        
        try {
            await fetchInitialData();
            const initialTabId = document.querySelector('#cashTabs .nav-link.active').getAttribute('data-bs-target').substring(1).replace('-panel', '');
            updateHeaderActions(initialTabId);
            applyFiltersAndRender();
            fetchClosingHistory();
        } catch (error) {
            console.error("Erreur à l'initialisation de l'application", error);
        }
    };

    initializeApp();
});