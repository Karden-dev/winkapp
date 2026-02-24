// public/js/preparation.js
/**
 * Module de gestion de la logistique Hub (Préparation des colis et Gestion des retours).
 * CORRECTION: Ajout de WebSocket pour le rafraîchissement automatique.
 */
document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = '/api';
  // CORRECTION: Ajout URL WebSocket
  const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  let currentUser = null;
  let deliverymenCache = [];
  let ws = null; // CORRECTION: Référence WebSocket
  let allPendingReturns = []; // Cache pour les retours

  // --- Références DOM ---
  const userNameDisplay = document.getElementById('userName');
  const notificationContainer = document.getElementById('notification-container'); // Pour les toasts

  // Onglet Préparation
  const preparationContainer = document.getElementById('preparation-container');
  const prepCountSpan = document.getElementById('prepCount');
  const refreshPrepBtn = document.getElementById('refreshPrepBtn');
  const hubNotificationBadge = document.getElementById('hubNotificationBadge');
  const hubNotificationList = document.getElementById('hubNotificationList');
  const notificationModalEl = document.getElementById('notificationModal');
  const notificationModal = notificationModalEl ? new bootstrap.Modal(notificationModalEl) : null;


  // Onglet Retours
  const returnsContainer = document.getElementById('returnsContainer');
  const returnCountSpan = document.getElementById('returnCount');
  const returnFiltersForm = document.getElementById('returnFiltersForm');
  const returnDeliverymanFilter = document.getElementById('returnDeliverymanFilter');
  const returnStatusFilter = document.getElementById('returnStatusFilter'); // Ajout référence filtre statut
  const returnStartDateInput = document.getElementById('returnStartDate');
  const returnEndDateInput = document.getElementById('returnEndDate');
  const refreshReturnsBtn = document.getElementById('refreshReturnsBtn');
  const returnToShopModalEl = document.getElementById('returnToShopModal');
  const returnToShopModal = returnToShopModalEl ? new bootstrap.Modal(returnToShopModalEl) : null;
  const returnShopTrackingIdSpan = document.getElementById('returnShopTrackingId');
  const confirmReturnTrackingIdHidden = document.getElementById('confirmReturnTrackingIdHidden');
  const confirmReturnToShopBtn = document.getElementById('confirmReturnToShopBtn');


  // Modale Édition Articles
  const editItemsModalEl = document.getElementById('editItemsModal');
  const editItemsModal = editItemsModalEl ? new bootstrap.Modal(editItemsModalEl) : null;
  const editItemsForm = document.getElementById('editItemsForm');
  const editItemsOrderIdSpan = document.getElementById('editItemsOrderId');
  const editItemsOrderIdHidden = document.getElementById('editItems_OrderId_Hidden');
  const originalArticleAmountHidden = document.getElementById('originalArticleAmountHidden');
  const modalItemsContainer = document.getElementById('modalItemsContainer');
  const modalAddItemBtn = document.getElementById('modalAddItemBtn');
  const saveItemsAndMarkReadyBtn = document.getElementById('saveItemsAndMarkReadyBtn');
  const editAlert = document.getElementById('editAlert');


  // --- Constantes ---
  const statusReturnTranslations = {
    'pending_return_to_hub': 'En attente Magasin', // Mis à jour
    'received_at_hub': 'Confirmé Magasin', // Mis à jour
    'returned_to_shop': 'Retourné Marchand'
  };

  // --- Fonctions Utilitaires ---

  const showNotification = (message, type = 'success') => {
    if (!notificationContainer) return;
    const alertId = `notif-${Date.now()}`;
    const alert = document.createElement('div');
    alert.id = alertId;
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.role = 'alert';
    alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
    notificationContainer.appendChild(alert);
    setTimeout(() => {
      const activeAlert = document.getElementById(alertId);
      if (activeAlert) { try { bootstrap.Alert.getOrCreateInstance(activeAlert)?.close(); } catch (e) { activeAlert.remove(); } }
    }, 5000);
  };

  const getAuthHeader = () => {
    if (typeof AuthManager === 'undefined' || !AuthManager.getToken) { return null; }
    const token = AuthManager.getToken();
    if (!token) { AuthManager.logout(); return null; }
    return { 'Authorization': `Bearer ${token}` };
  };

  const showLoadingState = (element, isLoading) => {
    if (!element) return;
    const loadingIndicatorId = element.id === 'preparation-container' ? 'loading-prep' : 'loading-returns';
    let loadingIndicator = element.querySelector(`#${loadingIndicatorId}`);

    if (isLoading) {
      if (!loadingIndicator) {
        loadingIndicator = document.createElement('p');
        loadingIndicator.id = loadingIndicatorId;
        loadingIndicator.className = 'text-center text-muted p-5';
        loadingIndicator.innerHTML = `<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Chargement...</span></div>`;
        element.innerHTML = '';
        element.appendChild(loadingIndicator);
      }
    } else if (loadingIndicator) {
      loadingIndicator.remove();
    }
  };


  const fetchDeliverymen = async () => {
    const headers = getAuthHeader();
    if (!headers) return;
    try {
      // CORRECTION: Récupérer tous les livreurs (actifs et inactifs) pour le filtre
      const res = await axios.get(`${API_BASE_URL}/deliverymen?status=all`, { headers });
      deliverymenCache = res.data;
      renderDeliverymanFilterOptions();
    } catch (error) {
      console.error("Erreur chargement livreurs:", error);
    }
  };

  const renderDeliverymanFilterOptions = () => {
    if (!returnDeliverymanFilter) return;
    returnDeliverymanFilter.innerHTML = '<option value="">Tous les livreurs</option>';
    // Trier les livreurs par nom
    deliverymenCache.sort((a, b) => a.name.localeCompare(b.name)).forEach(dm => {
      const option = document.createElement('option');
      option.value = dm.id;
      option.textContent = dm.name + (dm.status === 'inactif' ? ' (Inactif)' : '');
      returnDeliverymanFilter.appendChild(option);
    });
  };

  const formatAmount = (amount) => `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;

  // --- CORRECTION: Fonctions WebSocket ---
  /**
   * Initialise la connexion WebSocket.
   */
  const initWebSocket = () => {
    const token = AuthManager.getToken();
    if (!token) { console.error("WebSocket Prep: Token non trouvé."); return; }
    if (ws && ws.readyState === WebSocket.OPEN) { console.log("WebSocket Prep: Déjà connecté."); return; }

    console.log(`WebSocket Prep: Tentative connexion à ${WS_URL}...`);
    ws = new WebSocket(`${WS_URL}?token=${token}`);

    ws.onopen = () => { console.log('WebSocket Prep: Connexion établie.'); };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket Prep: Message reçu:', data);
            handleWebSocketMessage(data);
        } catch (error) { console.error('WebSocket Prep: Erreur parsing message:', error); }
    };

    ws.onclose = (event) => {
        console.log(`WebSocket Prep: Connexion fermée. Code: ${event.code}, Raison: ${event.reason}`);
        ws = null;
        if (event.code !== 1000 && event.code !== 1008) {
            console.log("WebSocket Prep: Reconnexion dans 5s...");
            setTimeout(initWebSocket, 5000);
        } else if (event.code === 1008) {
             showNotification("Authentification temps réel échouée.", "warning");
             AuthManager.logout();
        }
    };
    ws.onerror = (error) => {
        console.error("WebSocket Prep: Erreur:", error);
    };
  };

  /**
   * Gère les messages WebSocket pertinents pour la page Préparation.
   */
  const handleWebSocketMessage = (data) => {
      // Rafraîchir la liste de préparation si un livreur confirme la récupération
      // CORRECTION: Utiliser le type d'événement correct (ORDER_PICKED_UP_BY_RIDER)
      if (data.type === 'ORDER_PICKED_UP_BY_RIDER' && data.payload?.order_id) {
          console.log(`WebSocket Prep: Commande ${data.payload.order_id} récupérée, rafraîchissement...`);
          fetchOrdersToPrepare();
      }
      // Rafraîchir si un nouveau retour est déclaré
      else if (data.type === 'NEW_RETURN_DECLARED') {
          console.log(`WebSocket Prep: Nouveau retour déclaré, rafraîchissement...`);
          fetchPendingReturns();
      }
      // Rafraîchir si une commande est assignée ou si son statut change (pour la liste prépa)
      else if (['NEW_ORDER_ASSIGNED', 'ORDER_STATUS_UPDATE'].includes(data.type)) {
           console.log(`WebSocket Prep: Mise à jour commande (${data.type}), rafraîchissement prépa...`);
           fetchOrdersToPrepare();
      }
      // Rafraîchir si un retour est confirmé au hub ou rendu au marchand
      else if (['RETURN_RECEIVED_AT_HUB', 'RETURN_GIVEN_TO_SHOP'].includes(data.type)) {
          console.log(`WebSocket Prep: Mise à jour retour (${data.type}), rafraîchissement retours...`);
          fetchPendingReturns();
      }
  };


  // --- Fonctions PRÉPARATION ---

  const fetchOrdersToPrepare = async () => {
    showLoadingState(preparationContainer, true);
    const headers = getAuthHeader();
    if (!headers) { showNotification("Erreur d'authentification.", "danger"); showLoadingState(preparationContainer, false); return; }

    try {
      // L'API endpoint est correct et filtre déjà côté serveur
      const response = await axios.get(`${API_BASE_URL}/orders/pending-preparation`, { headers });
      const orders = response.data || [];
      // Le backend filtre, mais on garde le filtre client par sécurité
      const ordersToRender = orders.filter(order => !order.picked_up_by_rider_at);
      renderOrders(ordersToRender);
      const ordersToPrepareCount = ordersToRender.length;
      if (prepCountSpan) prepCountSpan.textContent = ordersToPrepareCount;

      // Mise à jour badge notif (appel à fetchHubNotifications pour consolider)
      fetchHubNotifications();

    } catch (error) {
      console.error("Erreur fetchOrdersToPrepare:", error);
      showNotification("Erreur lors du chargement des commandes à préparer.", "danger");
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
      showLoadingState(preparationContainer, false);
      if(preparationContainer) preparationContainer.innerHTML = '<div class="alert alert-danger text-center">Erreur chargement.</div>';
    }
  };

  const renderOrders = (orders) => {
    if (!preparationContainer) return;
    showLoadingState(preparationContainer, false); // S'assurer que le spinner est retiré
    preparationContainer.innerHTML = '';

    const groupedByDeliveryman = orders.reduce((acc, order) => {
      const deliverymanId = order.deliveryman_id || 0;
      const deliverymanName = order.deliveryman_name || 'Non Assigné';
      if (!acc[deliverymanId]) acc[deliverymanId] = { name: deliverymanName, orders: [] };
      acc[deliverymanId].orders.push(order);
      return acc;
    }, {});

    const sortedGroupIds = Object.keys(groupedByDeliveryman).sort((a, b) => {
      if (a === '0') return -1; if (b === '0') return 1;
      return groupedByDeliveryman[a].name.localeCompare(groupedByDeliveryman[b].name);
    });

    if (sortedGroupIds.length === 0) {
      preparationContainer.innerHTML = '<div class="alert alert-secondary text-center">Aucune commande à préparer actuellement.</div>';
      return;
    }

    sortedGroupIds.forEach(deliverymanId => {
      const group = groupedByDeliveryman[deliverymanId];
      const groupSection = document.createElement('section');
      groupSection.classList.add('mb-4'); // Espacement entre groupes

      const readyCount = group.orders.filter(o => o.status === 'ready_for_pickup').length;
      const inProgressCount = group.orders.filter(o => o.status === 'in_progress').length;

      const groupHeader = document.createElement('header');
      groupHeader.className = 'deliveryman-header p-2 mb-2'; // Retire les classes Bootstrap de couleur/fond (MODIFIÉ)
      groupHeader.innerHTML = `
          <h5 class="mb-0"><i class="bi bi-person-fill me-2"></i>${group.name}</h5>
          <div class="header-counts">
              <span class="count-ready">${readyCount} Prêt(s)</span>
              <span class="count-in-progress">${inProgressCount} En cours</span>
          </div>`; // Structure mise à jour pour le style (MODIFIÉ)
      groupSection.appendChild(groupHeader);

      const gridDiv = document.createElement('div');
      gridDiv.className = 'orders-grid'; // S'assurer que le CSS pour .orders-grid existe

      group.orders.sort((a, b) => {
        if (a.status === 'in_progress' && b.status === 'ready_for_pickup') return -1;
        if (a.status === 'ready_for_pickup' && b.status === 'in_progress') return 1;
        return moment(a.created_at).diff(moment(b.created_at));
      });

      group.orders.forEach(order => {
        const isReady = order.status === 'ready_for_pickup';
        // Le filtre initial `ordersToRender` devrait déjà avoir exclu ceux-ci
        if (!!order.picked_up_by_rider_at) return;

        const card = document.createElement('article');
        card.className = `order-card-prep card shadow-sm ${isReady ? 'is-ready' : ''}`;
        card.dataset.orderId = order.id;
        card.dataset.orderData = JSON.stringify(order); // Stocker les données pour la modale

        const totalArticles = (order.items || []).reduce((sum, item) => sum + (parseFloat(item.amount || 0) * parseFloat(item.quantity || 1)), 0);

        const itemsListHtml = (order.items || []).length > 0
          ? `<ul class="items-list list-unstyled mb-1 small">${(order.items || []).map(item => `<li>- ${item.quantity} x ${item.item_name || 'Article inconnu'}</li>`).join('')}</ul>`
          : '<p class="text-muted small mb-1">Aucun article détaillé.</p>';

        const actionButtonHtml = isReady
          ? `<button class="btn btn-sm btn-success btn-ready-action confirm-ready-btn w-100" data-order-id="${order.id}" disabled>
               <i class="bi bi-check-circle-fill me-1"></i> Préparation Confirmée
             </button>`
          : `<button class="btn btn-sm btn-primary-custom btn-ready-action mark-ready-btn w-100" data-order-id="${order.id}">
               <i class="bi bi-check-lg me-1"></i> Marquer comme Prête
             </button>`;

        card.innerHTML = `
          <div class="card-body p-2">
            <div class="d-flex justify-content-between align-items-start mb-1">
              <h6 class="card-title order-id mb-0">#${order.id}</h6>
              <button class="btn btn-sm btn-outline-secondary p-0 px-1 btn-edit-items" data-order-id="${order.id}" title="Modifier Nom/Quantité Article">
                <i class="bi bi-pencil small"></i>
              </button>
            </div>
            <div class="info-line small mb-1"><i class="bi bi-shop me-1"></i> <span>${order.shop_name || 'Marchand inconnu'}</span></div>
            <div class="info-line small mb-1"><i class="bi bi-person me-1"></i> <span>${order.customer_phone || 'Tél inconnu'}</span></div>
            <div class="info-line small mb-2"><i class="bi bi-geo-alt me-1"></i> <span>${order.delivery_location || 'Lieu inconnu'}</span></div>
            <h6 class="small mb-1">Articles (${formatAmount(totalArticles)}) :</h6>
            ${itemsListHtml}
            <div class="action-button-container mt-2">
              ${actionButtonHtml}
            </div>
            <small class="text-muted d-block text-end mt-1" style="font-size: 0.7em;">Assignée ${moment(order.created_at).format('DD/MM HH:mm')}</small>
          </div>
        `;
        gridDiv.appendChild(card);
      });

      groupSection.appendChild(gridDiv);
      preparationContainer.appendChild(groupSection);
    });

    attachButtonListeners(); // Ré-attacher les listeners après le rendu
  };

  const openEditItemsModal = (orderData) => {
    if (!editItemsModal || !orderData) return;

    const isPickedUp = !!orderData.picked_up_by_rider_at;
    const totalArticleAmountOriginal = (orderData.items || []).reduce((sum, item) => sum + (parseFloat(item.amount || 0) * parseFloat(item.quantity || 1)), 0);

    editItemsOrderIdSpan.textContent = orderData.id;
    editItemsOrderIdHidden.value = orderData.id;
    originalArticleAmountHidden.value = totalArticleAmountOriginal;

    modalItemsContainer.innerHTML = '';
    if (orderData.items && orderData.items.length > 0) {
      orderData.items.forEach(item => addItemRowModal(modalItemsContainer, item, isPickedUp));
    } else {
      addItemRowModal(modalItemsContainer, { amount: totalArticleAmountOriginal }, isPickedUp); // Passer le montant si pas d'items
    }

    if (isPickedUp) {
      editItemsForm.querySelectorAll('input:not([readonly]), select, textarea, button:not([data-bs-dismiss])').forEach(el => el.disabled = true);
      saveItemsAndMarkReadyBtn.disabled = true; // Désactiver explicitement
      saveItemsAndMarkReadyBtn.innerHTML = '<i class="bi bi-lock me-1"></i> Colis déjà récupéré (Non modifiable)';
      if (editAlert) {
        editAlert.innerHTML = `<i class="bi bi-info-circle-fill me-1"></i> **Mode lecture seule:** Colis récupéré le ${moment(orderData.picked_up_by_rider_at).format('DD/MM HH:mm')}.`;
        editAlert.classList.replace('alert-warning', 'alert-secondary');
        editAlert.classList.remove('d-none');
      }

    } else {
      editItemsForm.querySelectorAll('input, select, textarea, button:not([data-bs-dismiss])').forEach(el => {
        if (!el.readOnly && !el.closest('.d-none')) el.disabled = false;
      });
       saveItemsAndMarkReadyBtn.disabled = false; // Activer explicitement
      saveItemsAndMarkReadyBtn.innerHTML = '<i class="bi bi-save me-1"></i> Sauvegarder les Modifications';

      if (editAlert) {
        editAlert.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-1"></i> Modifiez ici le **nom** et/ou la **quantité** des articles.';
        editAlert.classList.replace('alert-secondary', 'alert-warning');
        editAlert.classList.remove('d-none');
      }
    }

    editItemsModal.show();
  };

  const addItemRowModal = (container, item = {}, isReadOnly = false) => {
    const itemRow = document.createElement('div');
    itemRow.className = 'row g-2 item-row-modal mb-2';
    const isFirst = container.children.length === 0;
    const labelHiddenClass = !isFirst ? 'visually-hidden' : '';
    // Stocker le montant original dans un data attribute (important!)
    const originalAmountAttr = item.amount !== undefined ? `data-original-amount="${item.amount}"` : 'data-original-amount="0"';

    itemRow.innerHTML = `
      <div class="col-7 col-md-5"> <label class="form-label mb-1 ${labelHiddenClass}">Nom article</label>
        <input type="text" class="form-control form-control-sm item-name-input" value="${item.item_name || ''}" placeholder="Article" required ${isReadOnly ? 'readonly' : ''} ${originalAmountAttr}>
        <input type="hidden" class="item-id-input" value="${item.id || ''}">
      </div>
      <div class="col-5 col-md-3"> <label class="form-label mb-1 ${labelHiddenClass}">Qté</label>
        <input type="number" class="form-control form-control-sm item-quantity-input" value="${item.quantity || 1}" min="1" required ${isReadOnly ? 'readonly' : ''}>
      </div>
       <input type="hidden" class="item-amount-input" value="${item.amount || 0}">
      <div class="col-12 col-md-4 d-flex align-items-end justify-content-end"> <button class="btn btn-sm btn-outline-danger remove-item-btn-modal" type="button" ${isReadOnly ? 'disabled' : ''} title="Supprimer article"><i class="bi bi-trash"></i></button>
      </div>`;
    container.appendChild(itemRow);

    // Gérer l'affichage des labels pour la première ligne
    if (container.children.length === 1) {
      itemRow.querySelectorAll('label').forEach(label => label.classList.remove('visually-hidden'));
    }
  };


  const handleEditItemsSubmit = async (event) => {
    event.preventDefault();
    const headers = getAuthHeader();
    if (!headers) return;

    const orderId = editItemsOrderIdHidden.value;
    const button = saveItemsAndMarkReadyBtn;

    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Sauvegarde...';

    const items = Array.from(modalItemsContainer.querySelectorAll('.item-row-modal')).map(row => {
      const nameInput = row.querySelector('.item-name-input');
      const quantityInput = row.querySelector('.item-quantity-input');
      // Récupérer le montant original caché ou depuis data attribute
      const amountInput = row.querySelector('.item-amount-input');
      const originalAmount = nameInput.dataset.originalAmount !== undefined ? parseFloat(nameInput.dataset.originalAmount) : parseFloat(amountInput.value || 0);

      return {
        item_name: nameInput.value,
        quantity: parseInt(quantityInput.value),
        amount: originalAmount // Toujours envoyer le montant original
      };
    });

    if (items.some(item => !item.item_name || item.quantity <= 0 || item.amount === null || isNaN(item.amount))) {
      showNotification("Veuillez vérifier que le nom, la quantité (>0) et le montant original sont valides pour chaque article.", "warning");
      button.disabled = false;
      button.innerHTML = '<i class="bi bi-save me-1"></i> Sauvegarder les Modifications';
      return;
    }

    // Recalculer le montant total des articles basé sur les quantités modifiées et les montants originaux
    const newTotalArticleAmount = items.reduce((sum, item) => sum + (item.amount * item.quantity), 0);

    try {
      // Utiliser PUT /api/orders/:orderId/items pour ne modifier que les items (Nom et Qté)
      // ET mettre à jour le montant total `article_amount`
      await axios.put(`${API_BASE_URL}/orders/${orderId}/items`, {
        items: items,
        article_amount: newTotalArticleAmount // Envoyer le nouveau montant recalculé
       }, { headers });

      showNotification(`Articles de la commande #${orderId} modifiés !`, 'success');
      editItemsModal.hide();
      fetchOrdersToPrepare(); // Rafraîchir la liste

    } catch (error) {
      console.error(`Erreur sauvegarde articles Cde ${orderId}:`, error);
      showNotification(error.response?.data?.message || `Échec de la sauvegarde des modifications.`, 'danger');
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="bi bi-save me-1"></i> Sauvegarder les Modifications';
    }
  };

  const markOrderAsReady = async (orderId) => {
    const headers = getAuthHeader();
    if (!headers) return;

    const button = preparationContainer?.querySelector(`.mark-ready-btn[data-order-id="${orderId}"]`);
    if (button) button.disabled = true;

    try {
      await axios.put(`${API_BASE_URL}/orders/${orderId}/ready`, {}, { headers });
      showNotification(`Commande #${orderId} marquée comme prête !`, 'success');
      fetchOrdersToPrepare();
    } catch (error) {
      console.error(`Erreur marquage prête Cde ${orderId}:`, error);
      showNotification(error.response?.data?.message || `Échec marquage comme prête.`, 'danger');
      if (button) button.disabled = false;
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    }
  };


  // --- RETOURS (Onglet 2) ---

  const fetchPendingReturns = async () => {
    showLoadingState(returnsContainer, true);

    const headers = getAuthHeader();
    if (!headers) { showLoadingState(returnsContainer, false); return; }

    const filters = {
      status: returnStatusFilter.value, // Utiliser le filtre de statut
      deliverymanId: returnDeliverymanFilter.value,
      startDate: returnStartDateInput.value,
      endDate: returnEndDateInput.value
    };

    try {
      // L'API endpoint est correct
      const response = await axios.get(`${API_BASE_URL}/returns/pending-hub`, { params: filters, headers });
      allPendingReturns = response.data || []; // Mettre à jour le cache
      renderReturnsCards(allPendingReturns); // Afficher les retours filtrés
      
      // Mettre à jour le compteur des retours en attente UNIQUEMENT (ceux qui nécessitent une action)
       const pendingToHubCount = allPendingReturns.filter(r => r.return_status === 'pending_return_to_hub').length;
      if (returnCountSpan) returnCountSpan.textContent = pendingToHubCount;

      // Mise à jour badge notif (appel à fetchHubNotifications pour consolider)
      fetchHubNotifications();

    } catch (error) {
      console.error("Erreur fetchPendingReturns:", error);
      returnsContainer.innerHTML = `<p class="text-center text-danger p-3">Erreur lors du chargement des retours.</p>`;
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    }
  };


  const renderReturnsCards = (returns) => {
    if (!returnsContainer) return;
    showLoadingState(returnsContainer, false);

    returnsContainer.innerHTML = ''; // Vider avant de repeupler

    if (returns.length === 0) {
      returnsContainer.innerHTML = `<p class="text-center p-3 text-muted">Aucun retour trouvé pour ces filtres.</p>`;
      return;
    }

    returns.forEach(returnItem => {
      const isPendingHub = returnItem.return_status === 'pending_return_to_hub';
      const isConfirmedHub = returnItem.return_status === 'received_at_hub';
      const isReturnedToShop = returnItem.return_status === 'returned_to_shop';

      const card = document.createElement('article');
      card.className = `return-card card shadow-sm mb-3 status-${returnItem.return_status}`; // Utiliser Bootstrap card
      card.dataset.trackingId = returnItem.tracking_id;

      const statusText = statusReturnTranslations[returnItem.return_status] || returnItem.return_status;
      const statusClass = isPendingHub ? 'bg-warning text-dark' : (isConfirmedHub ? 'bg-success' : 'bg-info');

      let dropdownItemsHtml = '';
      if (isPendingHub) {
        dropdownItemsHtml += `<li><a class="dropdown-item btn-confirm-return" href="#" data-tracking-id="${returnItem.tracking_id}"><i class="bi bi-box-arrow-in-down me-2"></i> Confirmer Réception Magasin</a></li>`;
      }
      if (isConfirmedHub) {
        dropdownItemsHtml += `<li><a class="dropdown-item btn-return-to-shop" href="#" data-tracking-id="${returnItem.tracking_id}"><i class="bi bi-shop me-2"></i> Remettre au Marchand</a></li>`;
      }
      if (!dropdownItemsHtml) {
        dropdownItemsHtml = `<li><span class="dropdown-item-text text-muted">Traitement terminé</span></li>`;
      }

      const commentTooltip = returnItem.comment ? `data-bs-toggle="tooltip" title="Motif: ${returnItem.comment}"` : `data-bs-toggle="tooltip" title="Aucun motif spécifié"`;
      const orderIdTooltip = `Cliquer pour voir le détail de la commande #${returnItem.order_id}`;

      card.innerHTML = `
       <div class="card-body p-2">
         <div class="d-flex justify-content-between align-items-start mb-1">
           <h6 class="card-title tracking-id mb-0">Retour #${returnItem.tracking_id}</h6>
           <div class="dropdown return-actions">
             <button class="btn btn-sm btn-outline-secondary dropdown-toggle py-0 px-1" type="button" data-bs-toggle="dropdown" aria-expanded="false">
               <i class="bi bi-three-dots-vertical small"></i>
             </button>
             <ul class="dropdown-menu dropdown-menu-end">
               ${dropdownItemsHtml}
             </ul>
           </div>
         </div>
         <hr class="my-1">
         <div class="return-details small">
           <p class="info-line mb-1"><i class="bi bi-box-seam me-1"></i> <span><a href="orders.html?search=#${returnItem.order_id}" target="_blank" data-bs-toggle="tooltip" title="${orderIdTooltip}">Cde #${returnItem.order_id}</a></span></p>
           <p class="info-line mb-1"><i class="bi bi-person me-1"></i> <span>${returnItem.deliveryman_name || 'N/A'}</span></p>
           <p class="info-line mb-1"><i class="bi bi-shop me-1"></i> <span>${returnItem.shop_name || 'N/A'}</span></p>
           <p class="info-line mb-1"><i class="bi bi-calendar-event me-1"></i> <span>Déclaré ${moment(returnItem.declaration_date).format('DD/MM HH:mm')}</span> <i class="bi bi-chat-left-text text-muted ms-1" ${commentTooltip}></i></p>
           <p class="info-line mb-0"><i class="bi bi-flag me-1"></i> <span>Statut: <span class="badge ${statusClass} ms-1">${statusText}</span></span></p>
         </div>
       </div>
      `;
      returnsContainer.appendChild(card);
    });

    // Réinitialiser les tooltips Bootstrap
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach((tooltipTriggerEl) => {
      const existingTooltip = bootstrap.Tooltip.getInstance(tooltipTriggerEl);
      if (existingTooltip) existingTooltip.dispose();
      new bootstrap.Tooltip(tooltipTriggerEl);
    });

    attachButtonListeners(); // Ré-attacher listeners pour les nouveaux boutons
  };


  const handleConfirmHubReception = async (event) => {
    event.preventDefault();
    const link = event.currentTarget;
    const trackingId = link.dataset.trackingId;
    if (!trackingId || !confirm(`Confirmer la réception physique du retour #${trackingId} au Magasin ?`)) return;

    const headers = getAuthHeader();
    if (!headers) return;

    try {
      await axios.put(`${API_BASE_URL}/returns/${trackingId}/confirm-hub`, {}, { headers });
      showNotification(`Retour #${trackingId} confirmé au Magasin.`, 'success');
      fetchPendingReturns(); // Rafraîchir la liste des retours
    } catch (error) {
      console.error(`Erreur confirmation retour ${trackingId}:`, error);
      showNotification(error.response?.data?.message || `Erreur lors de la confirmation.`, 'danger');
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    }
  };

  const handleOpenReturnToShopModal = (trackingId) => {
    if (!returnToShopModal) return;
    returnShopTrackingIdSpan.textContent = trackingId;
    confirmReturnTrackingIdHidden.value = trackingId;
    returnToShopModal.show();
  };

  const handleConfirmReturnToShop = async () => {
    const trackingId = confirmReturnTrackingIdHidden.value;
    const button = confirmReturnToShopBtn;
    if (!trackingId) return;

    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Confirmation...';

    const headers = getAuthHeader();
    if (!headers) { button.disabled = false; return; }

    try {
      await axios.put(`${API_BASE_URL}/returns/${trackingId}/return-to-shop`, {}, { headers });
      showNotification(`Colis #${trackingId} remis au marchand confirmé !`, 'success');

      returnToShopModal.hide();
      fetchPendingReturns(); // Rafraîchir la liste
    } catch (error) {
      console.error(`Erreur remise au marchand ${trackingId}:`, error);
      showNotification(error.response?.data?.message || `Échec de la confirmation de remise.`, 'danger');
      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="bi bi-check-circle me-2"></i> Confirmer la remise';
    }
  };

  // --- GESTION NOTIFICATIONS ---

  const fetchHubNotifications = () => {
    // Les comptes sont mis à jour par fetchOrdersToPrepare et fetchPendingReturns
    const pendingReturnsCount = parseInt(returnCountSpan?.textContent || '0');
    const ordersToPrepareCount = parseInt(prepCountSpan?.textContent || '0');

    const totalNotifs = pendingReturnsCount + ordersToPrepareCount;
    if (hubNotificationBadge) {
        hubNotificationBadge.textContent = totalNotifs;
        hubNotificationBadge.classList.toggle('d-none', totalNotifs === 0);
    }

    const dismissedNotifications = JSON.parse(localStorage.getItem('dismissedHubNotifications') || '[]');
    const notifications = [];

    if (pendingReturnsCount > 0) {
      const notifId = `return-${moment().format('YYYYMMDD')}`;
      if (!dismissedNotifications.includes(notifId)) {
        notifications.push({ id: notifId, type: 'danger', message: `${pendingReturnsCount} retour(s) en attente de confirmation Magasin.`, action: '#returns-panel' });
      }
    }
    if (ordersToPrepareCount > 0) {
      const notifId = `prep-${moment().format('YYYYMMDD')}`;
      if (!dismissedNotifications.includes(notifId)) {
        notifications.push({ id: notifId, type: 'warning', message: `${ordersToPrepareCount} commande(s) à vérifier/préparer.`, action: '#preparation-panel' });
      }
    }

    if (!hubNotificationList) return;
    hubNotificationList.innerHTML = '';

    if (notifications.length === 0) {
      hubNotificationList.innerHTML = '<li class="list-group-item text-center text-muted">Aucune nouvelle notification.</li>';
      return;
    }

    notifications.forEach(notif => {
      const item = document.createElement('li');
      item.className = `list-group-item list-group-item-${notif.type} d-flex justify-content-between align-items-center`; // Utiliser flex pour aligner
      item.dataset.notifId = notif.id;

      const content = `<a href="#" data-action="${notif.action}" class="flex-grow-1 me-2 text-decoration-none text-dark notif-link">
                         <i class="bi bi-bell-fill me-2"></i> ${notif.message}
                       </a>`;
      const deleteBtn = `<button class="btn btn-sm btn-outline-secondary p-0 px-1 ms-auto delete-notif-btn" data-notif-id="${notif.id}" title="Marquer comme lu/Supprimer">
                           <i class="bi bi-x-lg small"></i>
                         </button>`;

      item.innerHTML = content + deleteBtn;
      hubNotificationList.appendChild(item);
    });

    // Attacher les listeners après ajout au DOM
    hubNotificationList.querySelectorAll('.notif-link').forEach(link => {
       link.addEventListener('click', handleNotificationClick);
    });
    hubNotificationList.querySelectorAll('.delete-notif-btn').forEach(btn => {
      btn.addEventListener('click', handleDeleteNotification);
    });
  };

  const handleNotificationClick = (e) => {
      e.preventDefault();
      const link = e.currentTarget;
      const targetPanelId = link.dataset.action; // ex: '#returns-panel'
      const targetTab = document.querySelector(`button[data-bs-target="${targetPanelId}"]`);
      if (targetTab) {
        const tabInstance = bootstrap.Tab.getInstance(targetTab) || new bootstrap.Tab(targetTab);
        tabInstance.show();
      }
      notificationModal?.hide();
  };

  const handleDeleteNotification = (e) => {
    const button = e.currentTarget;
    const notifItem = button.closest('li.list-group-item');
    const notifId = notifItem?.dataset.notifId;

    if (notifItem && notifId) {
      notifItem.remove();

      const dismissedNotifications = JSON.parse(localStorage.getItem('dismissedHubNotifications') || '[]');
      if (!dismissedNotifications.includes(notifId)) {
        dismissedNotifications.push(notifId);
        localStorage.setItem('dismissedHubNotifications', JSON.stringify(dismissedNotifications));
      }

      if (hubNotificationList.children.length === 0) {
        hubNotificationList.innerHTML = '<li class="list-group-item text-center text-muted">Aucune nouvelle notification.</li>';
      }
      // Re-calculer le badge total après suppression
      const remainingNotifsCount = hubNotificationList.querySelectorAll('li:not(.text-muted)').length;
      if (hubNotificationBadge) {
          hubNotificationBadge.textContent = remainingNotifsCount;
          hubNotificationBadge.classList.toggle('d-none', remainingNotifsCount === 0);
      }
      showNotification("Notification marquée comme lue.", 'info');
    }
  };


  // --- Attachement des Listeners ---

  function attachButtonListeners() {
    preparationContainer?.querySelectorAll('.btn-edit-items').forEach(button => {
      button.removeEventListener('click', openEditItemsModalFromButton);
      button.addEventListener('click', openEditItemsModalFromButton);
    });
    preparationContainer?.querySelectorAll('.mark-ready-btn').forEach(button => {
      button.removeEventListener('click', handleMarkReadyClick);
      button.addEventListener('click', handleMarkReadyClick);
    });

    returnsContainer?.querySelectorAll('.btn-confirm-return').forEach(link => {
      link.removeEventListener('click', handleConfirmHubReception);
      link.addEventListener('click', handleConfirmHubReception);

    });
    returnsContainer?.querySelectorAll('.btn-return-to-shop').forEach(link => {
      link.removeEventListener('click', handleOpenReturnToShopModalClick);
      link.addEventListener('click', handleOpenReturnToShopModalClick);
    });
  }

  function handleMarkReadyClick(event) {
    const button = event.currentTarget;
    const orderId = button.dataset.orderId;
    if (orderId && confirm(`Marquer la commande #${orderId} comme prête pour la récupération ?`)) {
      markOrderAsReady(orderId);
    }
  }

  function openEditItemsModalFromButton(event) {
    const button = event.currentTarget;
    const card = button.closest('.order-card-prep');
    if (card && card.dataset.orderData) {
      try {
        const orderData = JSON.parse(card.dataset.orderData);
        openEditItemsModal(orderData);
      } catch (e) {
        console.error("Impossible de parser les données de la commande :", e);
        showNotification("Erreur de données de la commande.", "danger");
      }
    }
  }

  function handleOpenReturnToShopModalClick(event) {
    event.preventDefault();
    const link = event.currentTarget;
    const trackingId = link.dataset.trackingId;
    if (trackingId) {
      handleOpenReturnToShopModal(trackingId);
    }
  }

  // --- Initialisation et Listeners ---
  const initializeApp = async () => {
    if (typeof AuthManager === 'undefined' || !AuthManager.getUser) {
      showNotification("Erreur critique d'initialisation.", "danger");
      return;
    }
    currentUser = AuthManager.getUser();
    if (userNameDisplay) userNameDisplay.textContent = currentUser.name || '{{username}}';

    const today = moment().format('YYYY-MM-DD');
    if (returnStartDateInput) returnStartDateInput.value = today;
    if (returnEndDateInput) returnEndDateInput.value = today;

    await fetchDeliverymen();

    const sidebarToggler = document.getElementById('sidebar-toggler');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');

    if (sidebarToggler) {
      sidebarToggler.addEventListener('click', () => {
        if (window.innerWidth < 992) sidebar.classList.toggle('show');
        else { sidebar.classList.toggle('collapsed'); mainContent.classList.toggle('expanded'); }
      });
    }

    refreshPrepBtn?.addEventListener('click', fetchOrdersToPrepare);
    returnFiltersForm?.addEventListener('submit', (e) => { e.preventDefault(); fetchPendingReturns(); });
    // CORRECTION: Filtrage dynamique aussi au changement des filtres
    returnStatusFilter?.addEventListener('change', fetchPendingReturns);
    returnDeliverymanFilter?.addEventListener('change', fetchPendingReturns);
    returnStartDateInput?.addEventListener('change', fetchPendingReturns);
    returnEndDateInput?.addEventListener('change', fetchPendingReturns);

    refreshReturnsBtn?.addEventListener('click', fetchPendingReturns);
    modalAddItemBtn?.addEventListener('click', () => addItemRowModal(modalItemsContainer));
    modalItemsContainer?.addEventListener('click', (e) => {
      const removeButton = e.target.closest('.remove-item-btn-modal');
      if (removeButton && !removeButton.disabled) {
        if (modalItemsContainer.children.length > 1) {
          removeButton.closest('.item-row-modal').remove();
          if (modalItemsContainer.children.length >= 1) { // >= 1 pour gérer le cas où il ne reste qu'un seul
            modalItemsContainer.children[0].querySelectorAll('label').forEach(label => label.classList.remove('visually-hidden'));
          }
        } else showNotification("Vous devez avoir au moins un article.", "warning");
      }
    });
    editItemsForm?.addEventListener('submit', handleEditItemsSubmit);

    document.getElementById('notificationBtn')?.addEventListener('click', () => fetchHubNotifications());
    confirmReturnToShopBtn?.addEventListener('click', handleConfirmReturnToShop);
    document.getElementById('logoutBtn')?.addEventListener('click', () => AuthManager.logout());

    document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tabEl => {
      tabEl.addEventListener('shown.bs.tab', (event) => {
        const targetId = event.target.getAttribute('data-bs-target');
        if (targetId === '#preparation-panel') fetchOrdersToPrepare();
        else if (targetId === '#returns-panel') fetchPendingReturns();
      });
    });

    initWebSocket(); // CORRECTION: Initialiser WebSocket
    fetchOrdersToPrepare();
    fetchPendingReturns();
  };

  if (typeof AuthManager !== 'undefined') {
    document.addEventListener('authManagerReady', initializeApp);
    setTimeout(() => { if (!currentUser && AuthManager.getUser()) initializeApp(); }, 100);
  } else {
      console.error("AuthManager non défini !");
      showNotification("Erreur critique: AuthManager manquant.", "danger");
  }
});