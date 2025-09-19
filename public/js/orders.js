// js/orders.js

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = 'http://localhost:3000';

    // --- Configuration d'Axios pour l'Authentification ---
    const token = localStorage.getItem('winkToken') || sessionStorage.getItem('winkToken');
    if (!token) {
        // Si aucun token n'est trouvé, l'utilisateur n'est pas connecté.
        // On le redirige vers la page de connexion.
        window.location.href = 'index.html';
        return; // Arrête l'exécution du script pour éviter les erreurs
    }

    // Crée une instance d'axios qui inclura automatiquement le token
    // dans l'en-tête de chaque requête.
    const axiosInstance = axios.create({
        baseURL: API_BASE_URL,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    // Récupère les informations de l'utilisateur stockées lors de la connexion
    const currentUser = JSON.parse(localStorage.getItem('winkUser') || sessionStorage.getItem('winkUser'));
    const CURRENT_USER_ID = currentUser ? currentUser.id : null;


    // --- Références DOM ---
    const ordersTableBody = document.getElementById('ordersTableBody');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const bulkActionsDropdown = document.getElementById('bulkActionsDropdown');
    const addOrderModal = new bootstrap.Modal(document.getElementById('addOrderModal'));
    const editOrderModal = new bootstrap.Modal(document.getElementById('editOrderModal'));
    const statusActionModal = new bootstrap.Modal(document.getElementById('statusActionModal'));
    const assignDeliveryModal = new bootstrap.Modal(document.getElementById('assignDeliveryModal'));
    const orderDetailsModal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
    
    const bulkStatusActionModal = new bootstrap.Modal(document.getElementById('bulkStatusActionModal'));
    const bulkFailedDeliveryModal = new bootstrap.Modal(document.getElementById('bulkFailedDeliveryModal'));

    const addOrderForm = document.getElementById('addOrderForm');
    const editOrderForm = document.getElementById('editOrderForm');
    const failedDeliveryForm = document.getElementById('failedDeliveryForm');
    const deliveredPaymentForm = document.getElementById('deliveredPaymentForm');
    const assignDeliveryForm = document.getElementById('assignDeliveryForm');
    const deliverymanSearchInput = document.getElementById('deliverymanSearchInput');
    const deliverymanSearchResultsContainer = document.getElementById('deliverymanSearchResults');
    const assignDeliverymanIdInput = document.getElementById('assignDeliverymanId');
    const filterBtn = document.getElementById('filterBtn');
    const searchInput = document.getElementById('searchInput');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    
    const statusFilterBtn = document.getElementById('statusFilterBtn');
    const statusFilterMenu = document.getElementById('statusFilterMenu');
    let selectedStatusFilter = '';

    const bulkDeliveredPaymentForm = document.getElementById('bulkDeliveredPaymentForm');
    const bulkFailedDeliveryForm = document.getElementById('bulkFailedDeliveryForm');

    const addShopSearchInput = document.getElementById('shopSearchInput');
    const addSearchResultsContainer = document.getElementById('searchResults');
    const addSelectedShopIdInput = document.getElementById('selectedShopId');
    const itemsContainer = document.getElementById('itemsContainer');
    const addItemBtn = document.getElementById('addItemBtn');

    const editShopSearchInput = document.getElementById('editShopSearchInput');
    const editSearchResultsContainer = document.getElementById('editSearchResults');
    const editSelectedShopIdInput = document.getElementById('editSelectedShopId');
    const editItemsContainer = document.getElementById('editItemsContainer');
    const editAddItemBtn = document.getElementById('editAddItemBtn');
    const editOrderIdInput = document.getElementById('editOrderId');
    const editDeliverymanIdInput = document.getElementById('editDeliverymanId');
    const editCreatedAtInput = document.getElementById('editCreatedAt');

    const isExpeditionCheckbox = document.getElementById('isExpedition');
    const expeditionFeeContainer = document.getElementById('expeditionFeeContainer');
    const expeditionFeeInput = document.getElementById('expeditionFee');
    const editIsExpeditionCheckbox = document.getElementById('editIsExpedition');
    const editExpeditionFeeContainer = document.getElementById('editExpeditionFeeContainer');
    const editExpeditionFeeInput = document.getElementById('editExpeditionFee');

    const selectedOrdersIdsSpan = document.getElementById('selectedOrdersIds');
    
    let allOrders = [];
    let shopsCache = [];
    let deliverymenCache = [];
    let currentOrdersToAssign = [];

    const statusTranslations = {
        'pending': 'En attente', 'in_progress': 'En cours', 'delivered': 'Livrée',
        'cancelled': 'Annulée', 'failed_delivery': 'Livraison ratée', 'reported': 'À relancer'
    };
    const paymentTranslations = {
        'pending': 'En attente', 'cash': 'En espèces', 'paid_to_supplier': 'Payé au marchand', 'cancelled': 'Annulé'
    };
    const statusColors = {
        'pending': 'status-pending', 'in_progress': 'status-in_progress', 'delivered': 'status-delivered',
        'cancelled': 'status-cancelled', 'failed_delivery': 'status-failed_delivery', 'reported': 'status-reported'
    };
    const paymentColors = {
        'pending': 'payment-pending', 'cash': 'payment-cash', 'paid_to_supplier': 'payment-supplier_paid', 'cancelled': 'payment-cancelled'
    };
    
    const fetchShops = async () => {
        try {
            const res = await axiosInstance.get('/shops?status=actif');
            shopsCache = res.data;
        } catch (error) {
            console.error("Erreur lors du chargement des marchands:", error);
        }
    };
    
    const fetchDeliverymen = async () => {
        try {
            const res = await axiosInstance.get('/users?role=livreur&status=actif');
            deliverymenCache = res.data;
        } catch (error) {
            console.error("Erreur lors du chargement des livreurs:", error);
        }
    };

    const showNotification = (message, type = 'success') => {
        const container = document.getElementById('notification-container');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        container.appendChild(alert);
        setTimeout(() => alert.remove(), 5000);
    };

    const showLoading = (element) => {
        element.innerHTML = '<tr><td colspan="12" class="text-center p-4"><div class="spinner-border text-corail" role="status"><span class="visually-hidden">Chargement...</span></div></td></tr>';
    };

    const applyFilters = async () => {
        const searchText = searchInput.value;
        const startDate = startDateFilter.value;
        const endDate = endDateFilter.value;
        const status = selectedStatusFilter;
        try {
            const params = {};
            if (searchText) params.search = searchText;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            if (status) params.status = status;

            const ordersRes = await axiosInstance.get('/orders', { params });
            allOrders = ordersRes.data;
            renderOrdersTable(allOrders);
        } catch (error) {
            console.error("Erreur lors de l'application des filtres:", error);
            ordersTableBody.innerHTML = `<tr><td colspan="12" class="text-center text-danger p-4">Erreur lors du filtrage des données.</td></tr>`;
        }
    };
    
    const fetchAllData = async () => {
        showLoading(ordersTableBody);
        await applyFilters();
    };


    const renderOrdersTable = (orders) => {
        ordersTableBody.innerHTML = '';
        if (!orders || orders.length === 0) {
            ordersTableBody.innerHTML = `<tr><td colspan="12" class="text-center p-3">Aucune commande trouvée.</td></tr>`;
            return;
        }

        orders.forEach(order => {
            const row = document.createElement('tr');
            const totalArticleAmount = parseFloat(order.article_amount || 0);
            const deliveryFee = parseFloat(order.delivery_fee || 0);
            const deliverymanName = order.deliveryman_name || 'Non assigné';
            const shopName = order.shop_name || 'N/A';
            
            let payoutAmount = 0;
            if (order.status === 'delivered') {
                if (order.payment_status === 'cash') {
                    payoutAmount = totalArticleAmount - deliveryFee;
                } else if (order.payment_status === 'paid_to_supplier') {
                    payoutAmount = -deliveryFee;
                }
            } else if (order.status === 'failed_delivery') {
                const amountReceived = parseFloat(order.amount_received || 0);
                payoutAmount = amountReceived - deliveryFee;
            } else {
                payoutAmount = 0;
            }
            
            const displayStatus = statusTranslations[order.status] || 'Non spécifié';
            const displayPaymentStatus = paymentTranslations[order.payment_status] || 'Non spécifié';
            const statusClass = statusColors[order.status] || 'bg-secondary text-white';
            const paymentClass = paymentColors[order.payment_status] || 'bg-secondary text-white';
            
            const itemTooltip = order.items && order.items.length > 0
                ? order.items.map(item => `Article: ${item.quantity} x ${item.item_name}<br>Montant: ${item.amount.toLocaleString('fr-FR')} FCFA`).join('<br>')
                : 'N/A';
            
            row.innerHTML = `
                <td><input type="checkbox" class="order-checkbox" data-order-id="${order.id}"></td>
                <td>${shopName}</td>
                <td><span data-bs-toggle="tooltip" data-bs-html="true" title="Client: ${order.customer_name || 'N/A'}">${order.customer_phone}</span></td>
                <td>${order.delivery_location}</td>
                <td><span data-bs-toggle="tooltip" data-bs-html="true" title="${itemTooltip}">${order.items && order.items.length > 0 ? order.items[0].item_name : 'N/A'}</span></td>
                <td>${totalArticleAmount.toLocaleString('fr-FR')} FCFA</td>
                <td>${deliveryFee.toLocaleString('fr-FR')} FCFA</td>
                <td>${payoutAmount.toLocaleString('fr-FR')} FCFA</td>
                <td><div class="payment-container"><i class="bi bi-circle-fill ${paymentClass}"></i>${displayPaymentStatus}</div></td>
                <td><div class="status-container"><i class="bi bi-circle-fill ${statusClass}"></i>${displayStatus}</div></td>
                <td>${deliverymanName}</td>
                <td>
                    <div class="dropdown">
                        <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-gear"></i></button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item details-btn" href="#" data-order-id="${order.id}"><i class="bi bi-eye"></i> Afficher les détails</a></li>
                            <li><a class="dropdown-item edit-btn" href="#" data-order-id="${order.id}"><i class="bi bi-pencil"></i> Modifier</a></li>
                            <li><a class="dropdown-item assign-btn" href="#" data-order-id="${order.id}"><i class="bi bi-person"></i> Assigner</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item status-delivered-btn" href="#" data-order-id="${order.id}"><i class="bi bi-check-circle"></i> Livrée</a></li>
                            <li><a class="dropdown-item status-failed-btn" href="#" data-order-id="${order.id}"><i class="bi bi-x-circle"></i> Livraison ratée</a></li>
                            <li><a class="dropdown-item status-reported-btn" href="#" data-order-id="${order.id}"><i class="bi bi-clock"></i> À relancer</a></li>
                            <li><a class="dropdown-item status-cancelled-btn" href="#" data-order-id="${order.id}"><i class="bi bi-slash-circle"></i> Annulée</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item delete-btn text-danger" href="#" data-order-id="${order.id}"><i class="bi bi-trash"></i> Supprimer</a></li>
                        </ul>
                    </div>
                </td>
                `;
            ordersTableBody.appendChild(row);
        });

        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function(tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    };

    const addItemRow = (container, item = {}) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'row g-2 item-row mb-2';
        const nameId = `itemName-${Date.now()}`;
        const quantityId = `itemQuantity-${Date.now()}`;
        const amountId = `itemAmount-${Date.now()}`;
        
        itemRow.innerHTML = `
            <div class="col-md-5">
                <label for="${nameId}" class="form-label mb-1">Nom article</label>
                <input type="text" class="form-control form-control-sm item-name-input" id="${nameId}" value="${item.item_name || ''}" placeholder="Ex: T-shirt" required>
            </div>
            <div class="col-md-3">
                <label for="${quantityId}" class="form-label mb-1">Qté</label>
                <input type="number" class="form-control form-control-sm item-quantity-input" id="${quantityId}" value="${item.quantity || 1}" min="1" required>
            </div>
            <div class="col-md-4">
                <label for="${amountId}" class="form-label mb-1">Montant</label>
                <div class="input-group input-group-sm">
                    <input type="number" class="form-control item-amount-input" id="${amountId}" value="${item.amount || 0}" min="0" required>
                    <button class="btn btn-outline-danger remove-item-btn" type="button"><i class="bi bi-trash"></i></button>
                </div>
            </div>
        `;
        container.appendChild(itemRow);
        
        if (container.children.length > 1) {
            itemRow.querySelectorAll('label').forEach(label => label.classList.add('visually-hidden'));
        }
    };

    const handleRemoveItem = (container) => {
        container.addEventListener('click', (e) => {
            if (e.target.closest('.remove-item-btn') && container.children.length > 1) {
                e.target.closest('.item-row').remove();
            }
        });
    };
    
    if (isExpeditionCheckbox) {
        isExpeditionCheckbox.addEventListener('change', () => {
            expeditionFeeContainer.style.display = isExpeditionCheckbox.checked ? 'block' : 'none';
            if (!isExpeditionCheckbox.checked) expeditionFeeInput.value = 0;
        });
    }

    if (editIsExpeditionCheckbox) {
        editIsExpeditionCheckbox.addEventListener('change', () => {
            editExpeditionFeeContainer.style.display = editIsExpeditionCheckbox.checked ? 'block' : 'none';
            if (!editIsExpeditionCheckbox.checked) editExpeditionFeeInput.value = 0;
        });
    }

    addOrderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const items = Array.from(itemsContainer.querySelectorAll('.item-row')).map(row => ({
            item_name: row.querySelector('.item-name-input').value,
            quantity: parseInt(row.querySelector('.item-quantity-input').value),
            amount: parseFloat(row.querySelector('.item-amount-input').value)
        }));
        
        if (items.length === 0 || !items[0].item_name) {
             showNotification('Veuillez ajouter au moins un article.', 'danger');
             return;
        }

        const totalArticleAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);

        const orderData = {
            shop_id: addSelectedShopIdInput.value,
            customer_name: document.getElementById('customerName').value,
            customer_phone: document.getElementById('customerPhone').value,
            delivery_location: document.getElementById('deliveryLocation').value,
            article_amount: totalArticleAmount,
            delivery_fee: document.getElementById('deliveryFee').value,
            expedition_fee: isExpeditionCheckbox.checked ? parseFloat(expeditionFeeInput.value) : 0,
            created_by: CURRENT_USER_ID,
            items: items
        };
        
        try {
            await axiosInstance.post('/orders', orderData);
            showNotification('Commande créée avec succès !');
            addOrderModal.hide();
            await fetchAllData();
        } catch (error) {
            console.error("Erreur (ajout commande):", error);
            showNotification('Erreur lors de la création de la commande.', 'danger');
        }
    });

    editOrderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const orderId = editOrderIdInput.value;
        const items = Array.from(editItemsContainer.querySelectorAll('.item-row')).map(row => ({
            item_name: row.querySelector('.item-name-input').value,
            quantity: parseInt(row.querySelector('.item-quantity-input').value),
            amount: parseFloat(row.querySelector('.item-amount-input').value)
        }));
        
        const totalArticleAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
        
        const expeditionFee = editIsExpeditionCheckbox.checked ? parseFloat(editExpeditionFeeInput.value) : 0;

        const updatedData = {
            shop_id: editSelectedShopIdInput.value,
            customer_name: document.getElementById('editCustomerName').value,
            customer_phone: document.getElementById('editCustomerPhone').value,
            delivery_location: document.getElementById('editDeliveryLocation').value,
            article_amount: totalArticleAmount,
            delivery_fee: document.getElementById('editDeliveryFee').value,
            expedition_fee: expeditionFee,
            items: items,
            deliveryman_id: editDeliverymanIdInput.value || null,
            created_at: editCreatedAtInput.value,
            updated_by: CURRENT_USER_ID
        };
        
        try {
            await axiosInstance.put(`/orders/${orderId}`, updatedData);
            showNotification('Commande modifiée avec succès !');
            editOrderModal.hide();
            await fetchAllData();
        } catch (error) {
            console.error("Erreur (modif commande):", error);
            showNotification('Erreur lors de la modification de la commande.', 'danger');
        }
    });

    ordersTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('.dropdown-item');
        if (!target) return;

        const orderId = target.dataset.orderId;

        if (target.classList.contains('details-btn')) {
            try {
                const res = await axiosInstance.get(`/orders/${orderId}`);
                const order = res.data;
                const shopName = order.shop_name || 'N/A';
                const deliverymanName = order.deliveryman_name || 'Non assigné';

                const itemsHtml = order.items.map(item => `
                    <li>${item.item_name} (x${item.quantity}) - ${item.amount.toLocaleString('fr-FR')} FCFA</li>
                `).join('');

                const historyHtml = order.history.map(hist => {
                    let actionText = hist.action;
                    return `
                        <div class="border-start border-3 ps-3 mb-2">
                            <small class="text-muted">${new Date(hist.created_at).toLocaleString()}</small>
                            <p class="mb-0">${actionText}</p>
                            <small>Par: ${hist.user_name || 'N/A'}</small>
                        </div>
                    `;
                }).join('');

                document.getElementById('orderDetailsContent').innerHTML = `
                    <h6>Détails de la commande #${order.id}</h6>
                    <ul class="list-unstyled">
                        <li><strong>Marchand:</strong> ${shopName}</li>
                        <li><strong>Client:</strong> ${order.customer_name} (${order.customer_phone})</li>
                        <li><strong>Lieu de livraison:</strong> ${order.delivery_location}</li>
                        <li><strong>Montant article:</strong> ${order.article_amount.toLocaleString('fr-FR')} FCFA</li>
                        <li><strong>Frais de livraison:</strong> ${order.delivery_fee.toLocaleString('fr-FR')} FCFA</li>
                        <li><strong>Statut:</strong> <span class="badge bg-secondary">${statusTranslations[order.status] || 'Non spécifié'}</span></li>
                        <li><strong>Paiement:</strong> <span class="badge bg-secondary">${paymentTranslations[order.payment_status] || 'Non spécifié'}</span></li>
                        <li><strong>Livreur:</strong> ${deliverymanName}</li>
                        <li><strong>Date de création:</strong> ${new Date(order.created_at).toLocaleString()}</li>
                    </ul>
                    <hr>
                    <h6>Articles commandés</h6>
                    <ul class="list-unstyled">
                        ${itemsHtml}
                    </ul>
                    <hr>
                    <h6>Historique</h6>
                    ${historyHtml.length > 0 ? historyHtml : '<p>Aucun historique disponible.</p>'}
                `;
                orderDetailsModal.show();
            } catch (error) {
                console.error("Erreur lors de la récupération des détails:", error);
                showNotification("Impossible de charger les données de la commande.", 'danger');
            }
        } else if (target.classList.contains('delete-btn')) {
            if (confirm("Êtes-vous sûr de vouloir supprimer cette commande ?")) {
                try {
                    await axiosInstance.delete(`/orders/${orderId}`);
                    showNotification('Commande supprimée avec succès.');
                    await fetchAllData();
                } catch (error) {
                    console.error(error);
                    showNotification('Erreur lors de la suppression de la commande.', 'danger');
                }
            }
        } else if (target.classList.contains('status-delivered-btn')) {
            document.getElementById('statusActionModalLabel').textContent = `Paiement pour Commande #${orderId}`;
            deliveredPaymentForm.classList.remove('d-none');
            failedDeliveryForm.classList.add('d-none');
            statusActionModal.show();
            
            document.getElementById('paymentCashBtn').onclick = async () => {
                try {
                    await axiosInstance.put(`/orders/${orderId}/status`, { status: 'delivered', payment_status: 'cash', userId: CURRENT_USER_ID });
                    showNotification('Statut mis à jour en Livré (paiement cash).');
                    statusActionModal.hide();
                    await fetchAllData();
                } catch (error) {
                    console.error(error);
                    showNotification('Erreur lors de la mise à jour du statut.', 'danger');
                }
            };

            document.getElementById('paymentSupplierBtn').onclick = async () => {
                 try {
                    await axiosInstance.put(`/orders/${orderId}/status`, { status: 'delivered', payment_status: 'paid_to_supplier', userId: CURRENT_USER_ID });
                    showNotification('Statut mis à jour en Livré (paiement au marchand).');
                    statusActionModal.hide();
                    await fetchAllData();
                } catch (error) {
                    console.error(error);
                    showNotification('Erreur lors de la mise à jour du statut.', 'danger');
                }
            };

        } else if (target.classList.contains('status-failed-btn')) {
            document.getElementById('statusActionModalLabel').textContent = `Livraison ratée pour Commande #${orderId}`;
            deliveredPaymentForm.classList.add('d-none');
            failedDeliveryForm.classList.remove('d-none');
            statusActionModal.show();

            document.getElementById('amountReceived').value = 0;
            failedDeliveryForm.onsubmit = async (e) => {
                e.preventDefault();
                const amountReceived = document.getElementById('amountReceived').value;
                try {
                    await axiosInstance.put(`/orders/${orderId}/status`, { status: 'failed_delivery', amount_received: amountReceived, userId: CURRENT_USER_ID });
                    showNotification('Statut mis à jour en Livraison ratée.');
                    statusActionModal.hide();
                    await fetchAllData();
                } catch (error) {
                    console.error(error);
                    showNotification('Erreur lors de la mise à jour du statut.', 'danger');
                }
            };

        } else if (target.classList.contains('status-reported-btn')) {
            try {
                await axiosInstance.put(`/orders/${orderId}/status`, { status: 'reported', payment_status: 'pending', userId: CURRENT_USER_ID });
                showNotification('Statut mis à jour en À relancer.');
                await fetchAllData();
            } catch (error) {
                console.error(error);
                showNotification('Erreur lors de la mise à jour du statut.', 'danger');
            }
        } else if (target.classList.contains('status-cancelled-btn')) {
            try {
                await axiosInstance.put(`/orders/${orderId}/status`, { status: 'cancelled', payment_status: 'cancelled', userId: CURRENT_USER_ID });
                showNotification('Commande annulée.');
                await fetchAllData();
            } catch (error) {
                console.error(error);
                showNotification('Erreur lors de l\'annulation de la commande.', 'danger');
            }
        } else if (target.classList.contains('assign-btn')) {
            currentOrdersToAssign = [orderId];
            assignDeliveryModal.show();
            deliverymanSearchInput.value = '';
            assignDeliverymanIdInput.value = '';
        } else if (target.classList.contains('edit-btn')) {
            try {
                const res = await axiosInstance.get(`/orders/${orderId}`);
                const order = res.data;
                const shop = shopsCache.find(s => s.id === order.shop_id);
                
                editOrderIdInput.value = order.id;
                editShopSearchInput.value = shop?.name || '';
                editSelectedShopIdInput.value = order.shop_id;
                document.getElementById('editCustomerName').value = order.customer_name;
                document.getElementById('editCustomerPhone').value = order.customer_phone;
                document.getElementById('editDeliveryLocation').value = order.delivery_location;
                document.getElementById('editDeliveryFee').value = order.delivery_fee;
                editDeliverymanIdInput.value = order.deliveryman_id || '';
                
                const expeditionFee = parseFloat(order.expedition_fee || 0);
                editIsExpeditionCheckbox.checked = expeditionFee > 0;
                editExpeditionFeeContainer.style.display = expeditionFee > 0 ? 'block' : 'none';
                editExpeditionFeeInput.value = expeditionFee;
                
                const formattedDate = new Date(order.created_at).toISOString().slice(0, 16);
                editCreatedAtInput.value = formattedDate;

                editItemsContainer.innerHTML = '';
                if (order.items && order.items.length > 0) {
                    order.items.forEach(item => addItemRow(editItemsContainer, item));
                } else {
                    addItemRow(editItemsContainer);
                }
                editOrderModal.show();
            } catch (error) {
                console.error("Erreur lors de la récupération des données de modification:", error);
                showNotification("Impossible de charger les données de la commande.", 'danger');
            }
        }
    });

    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = e.target.checked);
        const selectedIds = Array.from(document.querySelectorAll('.order-checkbox:checked')).map(cb => cb.dataset.orderId);
        selectedOrdersIdsSpan.textContent = selectedIds.join(', ') || 'Aucune';
    });

    ordersTableBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('order-checkbox')) {
            const selectedIds = Array.from(document.querySelectorAll('.order-checkbox:checked')).map(cb => cb.dataset.orderId);
            selectedOrdersIdsSpan.textContent = selectedIds.join(', ') || 'Aucune';
        }
    });

    bulkActionsDropdown.addEventListener('click', async (e) => {
        const selectedIds = Array.from(document.querySelectorAll('.order-checkbox:checked')).map(cb => cb.dataset.orderId);
        
        if (selectedIds.length === 0) {
            showNotification("Veuillez sélectionner au moins une commande.", 'warning');
            return;
        }

        const action = e.target.closest('.dropdown-item');
        if (!action) return;
        
        try {
            if (action.classList.contains('bulk-assign-btn')) {
                currentOrdersToAssign = selectedIds;
                assignDeliveryModal.show();
                deliverymanSearchInput.value = '';
                assignDeliverymanIdInput.value = '';
            } else if (action.classList.contains('bulk-status-delivered-btn')) {
                bulkStatusActionModal.show();
                
                document.getElementById('bulkPaymentCashBtn').onclick = async () => {
                    await bulkUpdateStatus(selectedIds, 'delivered', 'cash');
                    bulkStatusActionModal.hide();
                };
                
                document.getElementById('bulkPaymentSupplierBtn').onclick = async () => {
                    await bulkUpdateStatus(selectedIds, 'delivered', 'paid_to_supplier');
                    bulkStatusActionModal.hide();
                };

            } else if (action.classList.contains('bulk-status-failed-btn')) {
                bulkFailedDeliveryModal.show();
                bulkFailedDeliveryForm.onsubmit = async (e) => {
                    e.preventDefault();
                    const amountReceived = document.getElementById('bulkAmountReceived').value;
                    await bulkUpdateStatus(selectedIds, 'failed_delivery', null, amountReceived);
                    bulkFailedDeliveryModal.hide();
                };
            } else if (action.classList.contains('bulk-status-reported-btn')) {
                await bulkUpdateStatus(selectedIds, 'reported', 'pending');
            } else if (action.classList.contains('bulk-status-cancel-btn')) {
                if (confirm(`Voulez-vous vraiment annuler ${selectedIds.length} commande(s) ?`)) {
                    await bulkUpdateStatus(selectedIds, 'cancelled', 'cancelled');
                }
            } else if (action.classList.contains('bulk-delete-btn')) {
                if (confirm(`Voulez-vous vraiment supprimer ${selectedIds.length} commande(s) ?`)) {
                    const promises = selectedIds.map(id => axiosInstance.delete(`/orders/${id}`));
                    await Promise.all(promises);
                    showNotification(`${selectedIds.length} commande(s) supprimée(s).`);
                    await fetchAllData();
                }
            }
        } catch(err) {
            console.error(err);
            showNotification("Une erreur inattendue est survenue.", 'danger');
            await fetchAllData();
        }
    });
    
    const bulkUpdateStatus = async (ids, status, paymentStatus, amountReceived = null) => {
        try {
            const promises = ids.map(id =>
                axiosInstance.put(`/orders/${id}/status`, { status, payment_status: paymentStatus, amount_received: amountReceived, userId: CURRENT_USER_ID })
            );
            await Promise.all(promises);
            showNotification(`${ids.length} commande(s) mise(s) à jour.`);
        } catch (error) {
            showNotification("Erreur lors de la mise à jour des statuts.", 'danger');
        } finally {
            await fetchAllData();
        }
    };

    assignDeliveryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const deliverymanId = assignDeliverymanIdInput.value;
        
        if (!deliverymanId) {
            showNotification('Veuillez sélectionner un livreur valide.', 'warning');
            return;
        }
        
        if (currentOrdersToAssign.length === 0) {
            showNotification('Aucune commande à assigner.', 'warning');
            return;
        }

        try {
            const promises = currentOrdersToAssign.map(orderId =>
                axiosInstance.put(`/orders/${orderId}/assign`, { deliverymanId, userId: CURRENT_USER_ID })
            );
            await Promise.all(promises);
            
            showNotification(`${currentOrdersToAssign.length} commande(s) assignée(s) avec succès.`);
        } catch (error) {
            console.error(error);
            showNotification("Erreur lors de l'assignation du livreur.", 'danger');
        } finally {
            assignDeliveryModal.hide();
            currentOrdersToAssign = [];
            await fetchAllData();
        }
    });

    const setupShopSearch = (searchInputId, resultsContainerId, selectedIdInputId) => {
        const input = document.getElementById(searchInputId);
        const resultsContainer = document.getElementById(resultsContainerId);
        const hiddenInput = document.getElementById(selectedIdInputId);

        input.addEventListener('input', () => {
            const searchTerm = input.value.toLowerCase();
            resultsContainer.innerHTML = '';
            if (searchTerm.length > 1) {
                const filteredShops = shopsCache.filter(shop => shop.name.toLowerCase().includes(searchTerm));
                resultsContainer.classList.toggle('d-none', filteredShops.length === 0);
                filteredShops.forEach(shop => {
                    const div = document.createElement('div');
                    div.className = 'p-2';
                    div.textContent = shop.name;
                    div.dataset.id = shop.id;
                    resultsContainer.appendChild(div);
                });
            } else {
                resultsContainer.classList.add('d-none');
            }
        });

        resultsContainer.addEventListener('click', (e) => {
            if (e.target.dataset.id) {
                input.value = e.target.textContent;
                hiddenInput.value = e.target.dataset.id;
                resultsContainer.classList.add('d-none');
            }
        });
    };
    
    const setupDeliverymanSearch = () => {
        deliverymanSearchInput.addEventListener('input', () => {
            const searchTerm = deliverymanSearchInput.value.toLowerCase();
            deliverymanSearchResultsContainer.innerHTML = '';
            if (searchTerm.length > 1) {
                const filteredDeliverymen = deliverymenCache.filter(dm => dm.name.toLowerCase().includes(searchTerm));
                deliverymanSearchResultsContainer.classList.toggle('d-none', filteredDeliverymen.length === 0);
                filteredDeliverymen.forEach(dm => {
                    const div = document.createElement('div');
                    div.className = 'p-2';
                    div.textContent = dm.name;
                    div.dataset.id = dm.id;
                    deliverymanSearchResultsContainer.appendChild(div);
                });
            } else {
                deliverymanSearchResultsContainer.classList.add('d-none');
            }
        });

        deliverymanSearchResultsContainer.addEventListener('click', (e) => {
            if (e.target.dataset.id) {
                deliverymanSearchInput.value = e.target.textContent;
                assignDeliverymanIdInput.value = e.target.dataset.id;
                deliverymanSearchResultsContainer.classList.add('d-none');
            }
        });
    };
    
    // --- Initialisation ---
    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.name;
    }

    const today = new Date().toISOString().slice(0, 10);
    startDateFilter.value = today;
    endDateFilter.value = today;

    searchInput.addEventListener('input', applyFilters);
    startDateFilter.addEventListener('change', applyFilters);
    endDateFilter.addEventListener('change', applyFilters);
    
    statusFilterMenu.addEventListener('click', (e) => {
        const option = e.target.closest('.status-filter-option');
        if (option) {
            selectedStatusFilter = option.dataset.status;
            statusFilterBtn.textContent = `Statut : ${option.textContent}`;
            applyFilters();
        }
    });

    await Promise.all([fetchShops(), fetchDeliverymen()]);
    await fetchAllData();
    setupShopSearch('shopSearchInput', 'searchResults', 'selectedShopId');
    setupShopSearch('editShopSearchInput', 'editSearchResults', 'editSelectedShopId');
    setupDeliverymanSearch();
    addItemBtn.addEventListener('click', () => addItemRow(itemsContainer));
    editAddItemBtn.addEventListener('click', () => addItemRow(editItemsContainer));
    handleRemoveItem(itemsContainer);
    handleRemoveItem(editItemsContainer);
    filterBtn.addEventListener('click', applyFilters);
    
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

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
            localStorage.removeItem('winkToken');
            localStorage.removeItem('winkUser');
            sessionStorage.removeItem('winkToken');
            sessionStorage.removeItem('winkUser');
            window.location.href = 'index.html';
        });
    }
});