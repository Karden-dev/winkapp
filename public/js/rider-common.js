// public/js/rider-common.js
// Fichier contenant les fonctions communes pour les pages livreur
// VERSION MISE À JOUR (V7) - Correction du bug de la modale de statut (Suivi vs Clôture)

// Utilisation de Moment.js s'il est chargé globalement
const moment = (typeof window.moment === 'function') ? window.moment : (date) => new Date(date);

// --- CONFIGURATION & ÉTAT GLOBAL ---
const API_BASE_URL = '/api';
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
let currentUser = null;
let currentOrderId = null; // Utilisé par plusieurs modales
let chatOrderId = null; // Spécifique à la modale de chat
let ws = null;
let lastMessageTimestamp = null; // Pour la modale de chat

// Constantes
const statusTranslations = {
    'pending': 'En attente',
    'in_progress': 'Assignée',
    'ready_for_pickup': 'Prête à prendre',
    'en_route': 'En route',
    'return_declared': 'Retour déclaré',
    'delivered': 'Livrée',
    'cancelled': 'Annulée',
    'failed_delivery': 'Livraison ratée',
    'reported': 'À relancer (Ancien)', // Gardé pour compatibilité
    'returned': 'Retournée',
    // --- AJOUT NOUVEAUX STATUTS ---
    'Ne decroche pas': 'Ne décroche pas',
    'Injoignable': 'Injoignable',
    'A relancer': 'À relancer',
    'Reportée': 'Reportée'
};
const paymentTranslations = { 'pending': 'En attente', 'cash': 'En espèces', 'paid_to_supplier': 'Mobile Money', 'cancelled': 'Annulé' };
// Statuts où le livreur est "actif"
const activeStatuses = ['in_progress', 'ready_for_pickup', 'en_route', 'reported', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée'];
const finalStatuses = ['delivered', 'cancelled', 'returned']; // Statuts finaux

const notificationSound = new Audio('/sound.mp3');

// --- RÉFÉRENCES DOM COMMUNES (Modales, etc.) ---
const globalNotificationBadge = document.getElementById('globalNotificationBadge');
const statusActionModalEl = document.getElementById('statusActionModal');
const statusActionModal = statusActionModalEl ? new bootstrap.Modal(statusActionModalEl) : null;
const deliveredPaymentModalEl = document.getElementById('deliveredPaymentModal');
const deliveredPaymentModal = deliveredPaymentModalEl ? new bootstrap.Modal(deliveredPaymentModalEl) : null;
const failedDeliveryModalEl = document.getElementById('failedDeliveryModal');
const failedDeliveryModal = failedDeliveryModalEl ? new bootstrap.Modal(failedDeliveryModalEl) : null;
const returnModalEl = document.getElementById('returnModal');
const returnModal = returnModalEl ? new bootstrap.Modal(returnModalEl) : null;
const chatModalRiderEl = document.getElementById('chatModalRider');
const chatModalRider = chatModalRiderEl ? new bootstrap.Modal(chatModalRiderEl) : null;
const chatRiderOrderIdSpan = document.getElementById('chatRiderOrderId');
const chatMessagesRider = document.getElementById('chatMessagesRider');
const quickReplyButtonsRider = document.getElementById('quickReplyButtonsRider');
const messageInputRider = document.getElementById('messageInputRider');
const sendMessageBtnRider = document.getElementById('sendMessageBtnRider');
const requestModificationBtn = document.getElementById('requestModificationBtn');
const actionModalOrderIdSpan = document.getElementById('actionModalOrderId');
const statusSelectionDiv = document.getElementById('statusSelection');
const deliveredModalOrderIdSpan = document.getElementById('deliveredModalOrderId');
const failedModalOrderIdSpan = document.getElementById('failedModalOrderId');
const failedDeliveryForm = document.getElementById('failedDeliveryForm');
const paymentCashBtn = document.getElementById('paymentCashBtn');
const paymentSupplierBtn = document.getElementById('paymentSupplierBtn');
const returnModalOrderIdSpan = document.getElementById('returnModalOrderId');
const confirmReturnBtn = document.getElementById('confirmReturnBtn');

// --- AJOUT : Références nouvelle modale de planification ---
const riderScheduleModalEl = document.getElementById('riderScheduleModal');
const riderScheduleModal = riderScheduleModalEl ? new bootstrap.Modal(riderScheduleModalEl) : null;
const riderScheduleForm = document.getElementById('riderScheduleForm');
// --- FIN AJOUT ---


// --- FONCTIONS UTILITAIRES ---

const debounce = (func, delay = 300) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
};

const showNotification = (message, type = 'success') => {
    const container = document.body;
    const alertId = `notif-${Date.now()}`;
    const alert = document.createElement('div');
    alert.id = alertId;
    alert.style.position = 'fixed';
    alert.style.top = '10px';
    alert.style.right = '10px';
    alert.style.zIndex = '1060';
    alert.style.minWidth = '250px';
    alert.style.maxWidth = '90%';
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.role = 'alert';
    alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
    container.appendChild(alert);
    setTimeout(() => {
        const activeAlert = document.getElementById(alertId);
        if(activeAlert) { try { bootstrap.Alert.getOrCreateInstance(activeAlert)?.close(); } catch (e) { activeAlert.remove(); } }
    }, 5000);
};

const formatDate = (dateString) => dateString ? moment(dateString).format('DD MMM YYYY') : 'N/A';
const formatAmount = (amount) => `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;

const getAuthHeader = () => {
    if (typeof AuthManager === 'undefined' || !AuthManager.getToken) {
        console.error("AuthManager non disponible.");
        showNotification("Erreur d'authentification.", "danger");
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

const handleAuthError = (error) => {
    console.error("Erreur API:", error);
    if (error.response?.status === 401 || error.response?.status === 403) {
        showNotification("Session expirée. Reconnexion...", "danger");
        if (ws) { ws.close(1008, "Session expirée"); }
        AuthManager.logout();
    } else if (!navigator.onLine) {
        showNotification("Hors ligne. Actions mises en file d'attente si possible.", "warning");
    } else {
         const errMsg = error.response?.data?.message || error.message || "Erreur serveur.";
         if (error.response?.status !== 404) { showNotification(`Erreur: ${errMsg}`, "danger"); }
         else { console.warn("Ressource API non trouvée (404)"); }
    }
};

// --- LOGIQUE WEBSOCKET ---

const initWebSocket = () => {
    const token = AuthManager.getToken();
    if (!token) { console.error("WebSocket Rider: Token non trouvé."); return; }
    if (ws && ws.readyState === WebSocket.OPEN) { console.log("WebSocket Rider: Déjà connecté."); return; }

    console.log(`WebSocket Rider: Tentative connexion à ${WS_URL}...`);
    ws = new WebSocket(`${WS_URL}?token=${token}`);

    ws.onopen = () => {
        console.log('WebSocket Rider: Connexion établie.');
        updateSidebarCounters();
        // Le fetch initial des commandes sera déclenché par rider.js en fonction de la page
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket Rider: Message reçu:', data);
            handleWebSocketMessage(data);
        } catch (error) { console.error('WebSocket Rider: Erreur parsing message:', error); }
    };

    ws.onerror = (error) => { // Ajouté pour plus de robustesse
        console.error('WebSocket Rider: Erreur de connexion:', error);
        showNotification("Erreur de connexion temps réel.", "danger");
    };

    ws.onclose = (event) => {
        console.log(`WebSocket Rider: Connexion fermée. Code: ${event.code}, Raison: ${event.reason}`);
        ws = null;
        if (event.code !== 1000 && event.code !== 1008) {
            console.log("WebSocket Rider: Reconnexion dans 5s...");
            setTimeout(initWebSocket, 5000);
        } else if (event.code === 1008) {
             showNotification("Authentification temps réel échouée.", "warning");
             AuthManager.logout();
        }
    };
};

const handleWebSocketMessage = (data) => {
    // Fonction fetchOrdersForCurrentPage sera définie dans rider.js
    const fetchOrdersForCurrentPage = window.fetchOrdersForCurrentPage || function() { console.warn("fetchOrdersForCurrentPage non définie"); };

    switch (data.type) {
        case 'NEW_MESSAGE':
            if (data.payload && data.payload.order_id === chatOrderId && chatModalRiderEl?.classList.contains('show')) {
                renderRiderMessages([data.payload], false);
                if (document.visibilityState === 'visible') { markMessagesAsRead(chatOrderId, data.payload.id); }
            } else if (data.payload) {
                updateOrderCardBadge(data.payload.order_id);
                 if (currentUser && data.payload.user_id !== currentUser.id) { notificationSound.play().catch(e => console.warn("Impossible jouer son:", e)); }
            }
            updateSidebarCounters();
            break;
        case 'UNREAD_COUNT_UPDATE':
            if (globalNotificationBadge && data.payload) {
                const count = data.payload.unreadCount || 0;
                globalNotificationBadge.textContent = count;
                globalNotificationBadge.classList.toggle('d-none', count === 0);
            }
            break;
        case 'CONVERSATION_LIST_UPDATE':
             fetchOrdersForCurrentPage();
             break;
        case 'NEW_ORDER_ASSIGNED':
             if (data.payload && data.payload.deliveryman_id === currentUser?.id) {
                 showNotification(`🔔 Nouvelle commande #${data.payload.order_id} assignée !`, 'info');
                 notificationSound.play().catch(e => console.warn("Impossible jouer son:", e));
                 updateSidebarCounters();
                 fetchOrdersForCurrentPage(); // Recharge la page actuelle
             }
             break;
        case 'ORDER_STATUS_UPDATE':
             if (data.payload && data.payload.deliveryman_id === currentUser?.id) {
                 console.log(`WebSocket Rider: MAJ statut Cde #${data.payload.order_id}`);
                 fetchOrdersForCurrentPage();
                 updateSidebarCounters();
             }
             break;
        case 'ERROR':
             console.error("WebSocket Rider: Erreur serveur:", data.message);
             break;
        default:
            console.warn(`WebSocket Rider: Type message non géré: ${data.type}`);
    }
};

const joinConversation = (orderId) => {
    if (ws && ws.readyState === WebSocket.OPEN && orderId) {
        ws.send(JSON.stringify({ type: 'JOIN_CONVERSATION', payload: { orderId } }));
    }
};

const leaveConversation = (orderId) => {
     if (ws && ws.readyState === WebSocket.OPEN && orderId) {
        ws.send(JSON.stringify({ type: 'LEAVE_CONVERSATION', payload: { orderId } }));
     }
};

const markMessagesAsRead = async (orderId, lastMessageId) => {
     const headers = getAuthHeader();
     if (!headers || !orderId || !lastMessageId || !currentUser) return;
     try {
         // L'API GET messages marque comme lu si triggerRead est fourni
         await axios.get(`${API_BASE_URL}/orders/${orderId}/messages?triggerRead=${lastMessageId}`, { headers });
         updateSidebarCounters();
         updateOrderCardBadge(orderId, 0);
     } catch (error) {
          if (error.response?.status !== 401 && error.response?.status !== 403) { console.error(`Erreur marquage lu Cde ${orderId}:`, error); }
     }
};

// --- FONCTIONS DE RENDU ---

const sortRiderOrders = (orders) => {
     // Tri complexe pour rider-today.html
     return orders.sort((a, b) => {
         const a_isUnprocessed = activeStatuses.includes(a.status);
         const b_isUnprocessed = activeStatuses.includes(b.status);
         if (a_isUnprocessed && !b_isUnprocessed) return -1;
         if (!a_isUnprocessed && b_isUnprocessed) return 1;
         if (a_isUnprocessed && b_isUnprocessed) {
             const a_isReadyNotPickedUp = a.status === 'ready_for_pickup' && !a.picked_up_by_rider_at;
             const b_isReadyNotPickedUp = b.status === 'ready_for_pickup' && !b.picked_up_by_rider_at;
             if (a_isReadyNotPickedUp && !b_isReadyNotPickedUp) return -1;
             if (!a_isReadyNotPickedUp && b_isReadyNotPickedUp) return 1;
             if (a.is_urgent !== b.is_urgent) return a.is_urgent ? -1 : 1;
         }
         return moment(a.created_at).diff(moment(b.created_at));
     });
};

const renderOrders = (orders, containerElement) => {
    // Détermine la page actuelle pour le tri
    const currentPageId = document.body.id;
    
    if (currentPageId === 'page-today') {
        orders = sortRiderOrders(orders);
    } else {
        // Tri simple par date pour 'page-myrides', 'page-relaunch', etc.
        orders.sort((a,b) => moment(b.created_at).diff(moment(a.created_at)));
    }

    if (!containerElement) {
        console.error("renderOrders: containerElement non fourni.");
        return;
    }

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
        containerElement.innerHTML = `<p class="text-center text-muted mt-5">Aucune commande ici.</p>`;
        return;
    }

    containerElement.innerHTML = ''; // Vider le conteneur
    orders.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = `order-card ${order.is_urgent || order.status === 'return_declared' ? 'urgent' : ''}`;

        const shopName = order.shop_name || 'N/A';
        const customerName = order.customer_name || 'Inconnu';
        const customerPhone = order.customer_phone || 'N/A';
        const deliveryLocation = order.delivery_location || 'Non spécifiée';
        const itemNames = order.items_list || 'Non spécifié';
        const clientInfo = customerName !== 'Inconnu' ? `${customerPhone} (${customerName})` : customerPhone;
        const amountToDisplay = (parseFloat(order.article_amount) || 0);
        const statusText = statusTranslations[order.status] || order.status;
        const paymentText = paymentTranslations[order.payment_status] || order.payment_status;
        const statusDotClass = `status-dot status-${order.status.replace(/ /g, '.')}`; // Gère les espaces
        const paymentDotClass = `payment-dot payment-${order.payment_status}`;
        const unreadCount = order.unread_count || 0;
        const unreadBadgeHtml = unreadCount > 0 ? `<span class="badge bg-danger rounded-pill">${unreadCount}</span>` : '';
        const urgentIconHtml = order.is_urgent ? '<i class="bi bi-exclamation-triangle-fill text-danger ms-1" title="URGENT"></i>' : '';

        // --- AJOUT : Logique d'affichage de la date de suivi (V3) ---
        let followUpHtml = '';
        if (order.follow_up_at) {
            const followUpTime = moment(order.follow_up_at);
            const now = moment();
            let iconClass = "text-muted bi-clock"; // Défaut (futur)
            let title = `Suivi: ${followUpTime.format('DD/MM HH:mm')}`;

            if (followUpTime.isBefore(now)) {
                iconClass = "text-danger bi-exclamation-triangle-fill"; // Retard
                title = `${title} (En retard)`;
            } else if (followUpTime.isBefore(now.clone().add(1, 'hour'))) {
                iconClass = "text-info bi-clock-fill"; // Imminent
                title = `${title} (Imminent)`;
            }
            
            followUpHtml = `<p class="card-text text-info fw-bold mb-2" data-bs-toggle="tooltip" title="${title}">
                                <i class="bi ${iconClass} me-1"></i> 
                                Suivi le: ${followUpTime.format('DD/MM HH:mm')}
                           </p>`;
        }
        
        // --- MODIFICATION : Logique de bouton d'action conditionnel (V7) ---
        // Rétablissement de la logique du fichier source
        
        const isFinal = finalStatuses.includes(order.status);
        let showStatusBtnInMenu = false; // Par défaut, le bouton "Statuer" dans le menu est caché
        
        if (!isFinal) { // Si la commande n'est pas déjà finie
            if (currentPageId === 'page-today') {
                // Sur 'page-today', on affiche toujours le bouton si non-final
                showStatusBtnInMenu = true;
            } else if (currentPageId === 'page-relaunch') {
                // Sur 'page-relaunch', on affiche si la date de suivi est aujourd'hui ou passée
                if (order.follow_up_at && moment(order.follow_up_at).isSameOrBefore(moment(), 'day')) {
                    showStatusBtnInMenu = true;
                }
            }
        }
        
        // Logique pour "Déclarer un retour" (corrigée)
        // On peut déclarer un retour si la course est active, OU si elle a échoué/été annulée
        const canDeclareReturn = activeStatuses.includes(order.status) || order.status === 'failed_delivery' || order.status === 'cancelled';
        const disableReturnBtn = !canDeclareReturn;
        
        // Logique pour "Confirmer Récupération / Démarrer Course" (basé sur le fichier source)
        const isReady = order.status === 'ready_for_pickup';
        const isPickedUp = !!order.picked_up_by_rider_at;
        const isEnRoute = order.status === 'en_route';

        let pickupStartBtnHtml = '';
        if (isReady && !isPickedUp) {
            pickupStartBtnHtml = `
                <li><a class="dropdown-item btn-warning pickup-btn" data-order-id="${order.id}" data-action="pickup" href="#">
                   <i class="bi bi-box-arrow-in-down me-2"></i> Confirmer Récupération
                </a></li>`;
        } else if (isReady && isPickedUp && !isEnRoute) {
            pickupStartBtnHtml = `
                <li><a class="dropdown-item btn-success start-delivery-btn" data-order-id="${order.id}" data-action="start" href="#">
                   <i class="bi bi-play-circle me-2"></i> Démarrer Course
                </a></li>`;
        }
        // --- FIN MODIFICATION V7 ---

        orderCard.innerHTML = `
            <div class="order-card-header">
                <h6 class="order-id mb-0">Commande #${order.id} ${urgentIconHtml}</h6>
                <div class="order-actions">
                    <button class="btn chat-btn" data-order-id="${order.id}" type="button" title="Discussion">
                        <i class="bi bi-chat-dots"></i>
                        ${unreadBadgeHtml}
                    </button>
                    <div class="dropdown">
                        <button class="btn" type="button" data-bs-toggle="dropdown" title="Actions"><i class="bi bi-gear"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            ${pickupStartBtnHtml}
                            ${pickupStartBtnHtml ? '<li><hr class="dropdown-divider"></li>' : ''}
                            
                            <li>
                                <a class="dropdown-item status-btn ${!showStatusBtnInMenu ? 'disabled text-muted' : ''}"
                                   data-order-id="${order.id}" href="#"><i class="bi bi-check2-circle me-2"></i> Statuer la commande</a>
                            </li>
                            
                            <li>
                                <a class="dropdown-item return-btn ${disableReturnBtn ? 'disabled text-muted' : ''}"
                                   data-order-id="${order.id}" href="#"><i class="bi bi-box-arrow-left me-2"></i> Déclarer un retour</a>
                            </li>
                        </ul>
                    </div>
                    <div class="dropdown">
                        <button class="btn btn-corail" type="button" data-bs-toggle="dropdown" title="Contacter"><i class="bi bi-telephone"></i></button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li><a class="dropdown-item" href="tel:${(customerPhone || '').replace(/\s/g, '')}"><i class="bi bi-telephone-outbound me-2"></i> Appeler Client</a></li>
                            <li><a class="dropdown-item" href="sms:${(customerPhone || '').replace(/\s/g, '')}"><i class="bi bi-chat-text me-2"></i> Envoyer SMS Client</a></li>
                            <li><a class="dropdown-item" href="https://wa.me/${(customerPhone || '').replace(/\D/g, '')}" target="_blank"><i class="bi bi-whatsapp me-2"></i> WhatsApp Client</a></li>
                            </ul>
                    </div>
                </div>
            </div>
            <hr class="my-2">
            <div class="order-details">
                <p><span class="detail-label">Marchand:</span> <span class="detail-value">${shopName}</span></p>
                <p><span class="detail-label">Client:</span> <span class="detail-value">${clientInfo}</span></p>
                <p><span class="detail-label">Adresse:</span> <span class="detail-value">${deliveryLocation}</span></p>
                <p><span class="detail-label">Article(s):</span> <span class="detail-value">${itemNames}</span></p>
                <p class="status-line">
                    <span class="detail-label">Statut:</span>
                    <span class="status-badge"><span class="${statusDotClass}"></span>${statusText}</span>
                    <span class="payment-badge"><span class="${paymentDotClass}"></span>${paymentText}</span>
                </p>
                ${followUpHtml}
                <p><span class="detail-label">À encaisser:</span> <span class="detail-value fw-bold text-success">${formatAmount(amountToDisplay)}</span></p>
                <p class="text-muted text-end" style="font-size: 0.75rem;">Créée le ${formatDate(order.created_at)}</p>
                
                </div>
        `;
        containerElement.appendChild(orderCard);
    });
    
    // Ré-init des tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach((tooltipTriggerEl) => {
      const existingTooltip = bootstrap.Tooltip.getInstance(tooltipTriggerEl);
      if (existingTooltip) existingTooltip.dispose();
      new bootstrap.Tooltip(tooltipTriggerEl, { html: true });
    });
};

const renderRiderMessages = (messages, replace = true) => {
    if (!chatMessagesRider) return;
    if (replace) chatMessagesRider.innerHTML = '';
    const isScrolledDown = chatMessagesRider.scrollHeight - chatMessagesRider.scrollTop - chatMessagesRider.clientHeight < 50;

    messages.forEach(msg => {
        if (!msg || typeof msg.id === 'undefined') { console.warn("Message ignoré car ID manquant ou message invalide."); return; }
        const currentUserIdValid = currentUser && typeof currentUser.id !== 'undefined';
        if (!replace && chatMessagesRider.querySelector(`[data-message-id="${msg.id}"]`)) return;

        const messageDiv = document.createElement('div');
        messageDiv.dataset.messageId = msg.id;
        const isSentByMe = currentUserIdValid ? (msg.user_id === currentUser.id) : false;
        const isSystem = msg.message_type === 'system';
        let messageClass = 'message';
        if (isSystem) messageClass += ' message-system';
        else if (isSentByMe) messageClass += ' message-sent';
        else messageClass += ' message-received';
        messageDiv.className = messageClass;
        const time = moment(msg.created_at).format('HH:mm');
        const author = isSystem ? '' : `<strong>${isSentByMe ? 'Moi' : (msg.user_name || 'Admin')}:</strong><br>`;
        const messageContent = (msg.message_content || '').replace(/#(\d+)/g, '<span class="text-info">#$1</span>');
        messageDiv.innerHTML = `${author}${messageContent}<div class="message-meta">${time}</div>`;
        chatMessagesRider.appendChild(messageDiv);
    });

    if (isScrolledDown || replace) {
        setTimeout(() => { if(chatMessagesRider) chatMessagesRider.scrollTop = chatMessagesRider.scrollHeight; }, 50); // Léger délai
    }
 };

const updateOrderCardBadge = (orderId, count = null) => {
     // Nécessite que renderOrders ait été appelée pour que les cartes existent
     const ordersContainer = document.getElementById('ordersContainer');
     const chatButton = ordersContainer?.querySelector(`.order-card .chat-btn[data-order-id="${orderId}"]`);
     if (!chatButton) return;

     let finalCount = count;
     if (finalCount === null) {
         const badge = chatButton.querySelector('.badge');
         finalCount = (badge ? parseInt(badge.textContent) : 0) + 1;
     }

     const badge = chatButton.querySelector('.badge');
     if (finalCount > 0) {
         if (badge) {
             badge.textContent = finalCount;
             badge.classList.remove('d-none');
         } else {
             const newBadge = document.createElement('span');
             newBadge.className = 'badge bg-danger rounded-pill';
             newBadge.textContent = finalCount;
             chatButton.appendChild(newBadge);
         }
     } else {
         if (badge) {
             badge.classList.add('d-none');
             badge.textContent = '0';
         }
     }
};

const loadRiderQuickReplies = async () => {
    const headers = getAuthHeader(); if (!headers || !quickReplyButtonsRider) return;
    quickReplyButtonsRider.innerHTML = '';
    try {
        const response = await axios.get(`${API_BASE_URL}/suivis/quick-replies`, { headers });
        const quickReplies = response.data || [];
        quickReplies.forEach(replyText => {
             const button = document.createElement('button');
             button.className = 'btn btn-sm btn-outline-secondary';
             button.textContent = replyText;
             button.type = 'button';
             button.addEventListener('click', () => {
                  if(messageInputRider) {
                      messageInputRider.value += (messageInputRider.value ? ' ' : '') + replyText;
                      messageInputRider.focus();
                      messageInputRider.dispatchEvent(new Event('input', { bubbles: true }));
                  }
             });
             quickReplyButtonsRider.appendChild(button);
         });
    } catch (error) { console.error("Erreur chargement messages rapides:", error); }
};

// --- LOGIQUE ACTIONS API ---

const confirmPickup = async (orderId) => {
    const headers = getAuthHeader(); if(!headers) return;
    const button = document.querySelector(`#ordersContainer [data-order-id="${orderId}"][data-action="pickup"]`);
    if (button) { button.disabled = true; button.innerHTML = `<i class="bi bi-check-lg me-2"></i> Confirmation...`; }

    try {
        await axios.put(`${API_BASE_URL}/rider/orders/${orderId}/confirm-pickup-rider`, {}, { headers });
        showNotification(`Colis #${orderId} confirmé récupéré ! Vous pouvez démarrer la course.`, 'success');
        // Appel à la fonction globale qui sera définie dans rider.js
        if (window.fetchOrdersForCurrentPage) window.fetchOrdersForCurrentPage();

    } catch (error) {
        showNotification(error.response?.data?.message || 'Échec de la confirmation de récupération.', 'danger');
        if (button) { button.disabled = false; button.innerHTML = `<i class="bi bi-box-arrow-in-down me-2"></i> Confirmer Récupération Colis`; }
        handleAuthError(error);
    }
};

const startDelivery = async (orderId) => {
    const headers = getAuthHeader(); if(!headers) return;
    const button = document.querySelector(`#ordersContainer [data-order-id="${orderId}"][data-action="start"]`);
    if (button) { button.disabled = true; button.innerHTML = `<i class="bi bi-play-fill me-2"></i> Démarrage...`; }

    try {
        await axios.put(`${API_BASE_URL}/rider/orders/${orderId}/start-delivery`, {}, { headers });
        showNotification(`Course #${orderId} démarrée !`, 'success');
        if (window.fetchOrdersForCurrentPage) window.fetchOrdersForCurrentPage();

    } catch (error) {
        showNotification(error.response?.data?.message || 'Échec du démarrage de la course.', 'danger');
        if (button) { button.disabled = false; button.innerHTML = `<i class="bi bi-play-circle me-2"></i> Démarrer Course`; }
        handleAuthError(error);
    }
};

const updateOrderStatus = async (orderId, status, paymentStatus = null, amountReceived = 0, followUpAt = null) => {
    const headers = getAuthHeader(); if(!headers) return;
    const currentUser = AuthManager.getUser(); if(!currentUser) return;
    
    // --- MODIFICATION : Ajout de follow_up_at au payload ---
    const payload = { 
        status, 
        userId: currentUser.id,
        follow_up_at: followUpAt // Ajouté
    };
    if (paymentStatus) payload.payment_status = paymentStatus;
    if (status === 'failed_delivery') { payload.amount_received = parseFloat(amountReceived) || 0; }
    const url = `${API_BASE_URL}/orders/${orderId}/status`;

    try {
        if (!navigator.onLine && typeof syncManager !== 'undefined') throw new Error("Offline"); // Force offline logic

        await axios.put(url, payload, { headers });
        showNotification(`Statut Cde #${orderId} mis à jour !`, 'success');
        if (window.fetchOrdersForCurrentPage) window.fetchOrdersForCurrentPage();
        updateSidebarCounters();
    } catch (error) {
        if (!navigator.onLine && typeof syncManager !== 'undefined') {
             try {
                 const request = { url, method: 'PUT', payload, token: AuthManager.getToken() };
                 await syncManager.put(request);
                 navigator.serviceWorker.ready.then(sw => sw.sync.register('sync-failed-requests'));
                 showNotification('Mode hors ligne. MAJ statut mise en attente.', 'info');
                 // Optionnel : Mettre à jour l'UI de manière optimiste ici
                 if (window.fetchOrdersForCurrentPage) window.fetchOrdersForCurrentPage(); // Recharger pour montrer l'état actuel (peut revenir en arrière si sync échoue)
                 updateSidebarCounters(); // Mettre à jour les compteurs (peut être imprécis offline)
             } catch (dbError) {
                  console.error("Erreur mise en file d'attente:", dbError);
                  showNotification("Erreur sauvegarde hors ligne.", 'danger');
             }
        } else {
             showNotification(`Erreur MAJ Cde #${orderId}.`, 'danger');
             handleAuthError(error);
        }
    } finally {
        // Fermer les modales associées
        if (statusActionModal) statusActionModal.hide();
        if (deliveredPaymentModal) deliveredPaymentModal.hide();
        if (failedDeliveryModal) failedDeliveryModal.hide();
        if (riderScheduleModal) riderScheduleModal.hide(); // Fermer la nouvelle modale
    }
};

const declareReturn = async (orderId, comment = null) => { // Ajout du paramètre comment
    const headers = getAuthHeader(); if (!headers) return;
    
    // Utilisation de la nouvelle modale de retour (si elle existe) ou de l'ancienne
    const currentReturnModal = returnModalEl ? returnModal : null; // À adapter si vous avez changé le nom
    const currentConfirmBtn = confirmReturnBtn || document.getElementById('confirmDeclareReturnBtn'); // S'adapte aux deux
    
    if(currentConfirmBtn) currentConfirmBtn.disabled = true;

    try {
        if (!navigator.onLine && typeof syncManager !== 'undefined') throw new Error("Offline");

        await axios.post(`${API_BASE_URL}/orders/${orderId}/declare-return`, { comment: comment || 'Déclaré depuis app Livreur.' }, { headers });
        showNotification(`Retour Cde #${orderId} déclaré ! En attente de réception au Hub.`, 'info');
        if(currentReturnModal) currentReturnModal.hide();
        if (window.fetchOrdersForCurrentPage) window.fetchOrdersForCurrentPage();
        updateSidebarCounters(); // Mettre à jour les compteurs

    } catch (error) {
        if (!navigator.onLine && typeof syncManager !== 'undefined') {
             try {
                const request = { url: `${API_BASE_URL}/orders/${orderId}/declare-return`, method: 'POST', payload: { comment: comment || 'Déclaré depuis app Livreur.' }, token: AuthManager.getToken() };
                await syncManager.put(request);
                navigator.serviceWorker.ready.then(sw => sw.sync.register('sync-failed-requests'));
                showNotification("Offline. Déclaration mise en attente.", 'info');
                if(currentReturnModal) currentReturnModal.hide();
                // Optionnel: Mettre à jour l'UI de manière optimiste
                if (window.fetchOrdersForCurrentPage) window.fetchOrdersForCurrentPage();
                updateSidebarCounters();
             } catch (dbError) { console.error("Erreur file d'attente retour:", dbError); showNotification("Erreur sauvegarde hors ligne.", 'danger'); }
        } else {
            showNotification(`Erreur: ${error.response?.data?.message || error.message}`, 'danger');
            handleAuthError(error);
        }
    } finally {
        if(currentConfirmBtn) currentConfirmBtn.disabled = false; // Réactiver bouton
    }
};

const loadRiderMessages = async (orderId) => {
    const headers = getAuthHeader(); if (!headers) return;
    if (chatMessagesRider) chatMessagesRider.innerHTML = `<p class="text-center text-muted p-5"><div class="spinner-border spinner-border-sm"></div> Chargement...</p>`;

    try {
        const response = await axios.get(`${API_BASE_URL}/orders/${orderId}/messages`, { headers });
        const messages = response.data || [];
        if (messages.length > 0) {
             renderRiderMessages(messages, true);
             lastMessageTimestamp = messages[messages.length - 1].created_at;
             markMessagesAsRead(orderId, messages[messages.length - 1].id);
        } else if (chatMessagesRider) {
             chatMessagesRider.innerHTML = `<p class="text-center text-muted p-5">Aucun message.</p>`;
        }
        updateSidebarCounters();
        // Rafraîchir la liste des commandes pour màj le badge si nécessaire
        if (window.fetchOrdersForCurrentPage) window.fetchOrdersForCurrentPage();

    } catch (error) {
        console.error(`Erreur messages Cde ${orderId}:`, error);
        if (error.response?.status === 403) { showNotification("Accès refusé à cette conversation.", "warning"); if(chatModalRider) chatModalRider.hide(); }
        else if (chatMessagesRider) { chatMessagesRider.innerHTML = `<p class="text-center text-danger p-5">Erreur chargement.</p>`; }
        handleAuthError(error);
    }
};

const sendRiderMessage = async () => {
    const content = messageInputRider?.value.trim();
    if (!content || !chatOrderId) return;
    const headers = getAuthHeader(); if (!headers) return;
    if (!currentUser || typeof currentUser.id === 'undefined') { showNotification("Erreur d'utilisateur.", "danger"); return; }

    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = { id: tempId, user_id: currentUser.id, user_name: currentUser.name, message_content: content, created_at: new Date().toISOString(), message_type: 'user' };

    renderRiderMessages([optimisticMessage], false);
    if(messageInputRider) { messageInputRider.value = ''; messageInputRider.rows = 1; }
    if(sendMessageBtnRider) sendMessageBtnRider.disabled = true; // Utiliser la bonne référence

    try {
        await axios.post(`${API_BASE_URL}/orders/${chatOrderId}/messages`, { message_content: content }, { headers });
    } catch (error) {
        console.error(`Erreur envoi Cde ${chatOrderId}:`, error);
        showNotification("Erreur d'envoi.", 'danger');
        const msgElement = chatMessagesRider?.querySelector(`[data-message-id="${tempId}"]`);
        if (msgElement) { msgElement.style.opacity = '0.5'; msgElement.title = "Échec."; }
        handleAuthError(error);
    } finally { if(sendMessageBtnRider) sendMessageBtnRider.disabled = false; } // Utiliser la bonne référence
};

const requestOrderModification = () => {
     if(!messageInputRider) return;
     const prefix = "Demande de modification : ";
     const detailedMessage = prefix + "Veuillez préciser ici l'erreur (client, adresse, articles, montant...).";
     messageInputRider.value = detailedMessage;
     messageInputRider.focus();

     if (messageInputRider.setSelectionRange) {
         const startPos = prefix.length;
         messageInputRider.setSelectionRange(startPos, startPos);
     }
     showNotification("Précisez la modification et cliquez sur Envoyer.", 'info');
};

const updateSidebarCounters = async () => {
    const headers = getAuthHeader(); if(!headers) return;
    try {
        const [countsResponse, unreadResponse] = await Promise.all([
             // --- MODIFICATION : Utilisation de la nouvelle route de comptage ---
             axios.get(`${API_BASE_URL}/rider/counts-grouped`, { headers }), // Endpoint groupé
             axios.get(`${API_BASE_URL}/suivis/unread-count`, { headers }) // Endpoint commun
        ]);
        const counts = countsResponse.data || {};
        const unreadMsgCount = unreadResponse.data.unreadCount || 0;

        // --- MODIFICATION : Utilisation des nouveaux noms de compteurs ---
        const totalToday = counts.today_count || 0;
        const totalReturns = counts.returns_count || 0;
        const totalRelaunch = counts.relaunch_count || 0;
        
        // Calculer "Mes courses" (Total des 3 groupes + statuts finaux si nécessaire)
        const totalMyRides = counts.total_my_rides || 0; // Utilise le compte du backend s'il existe
        
        if(document.getElementById('todayCount')) document.getElementById('todayCount').textContent = totalToday;
        if(document.getElementById('returnsCount')) document.getElementById('returnsCount').textContent = totalReturns;
        if(document.getElementById('relaunchCount')) document.getElementById('relaunchCount').textContent = totalRelaunch;
        if(document.getElementById('myRidesCount')) document.getElementById('myRidesCount').textContent = totalMyRides;
        // --- FIN MODIFICATION ---


         if (globalNotificationBadge) {
             globalNotificationBadge.textContent = unreadMsgCount;
             globalNotificationBadge.classList.toggle('d-none', unreadMsgCount === 0);
         }

    } catch (error) {
        console.error('Erreur compteurs:', error);
        // Ne pas appeler handleAuthError ici pour éviter une boucle de déconnexion si l'API est momentanément indisponible
    }
 };

// --- AJOUT : Fonction d'ouverture modale planification ---
function openRiderScheduleModal(orderId, newStatus) {
    if (!riderScheduleModalEl) {
        console.error("Modale de planification introuvable");
        return;
    }
    // Pré-remplir les infos
    riderScheduleModalEl.querySelector('#riderScheduleOrderId').value = orderId;
    riderScheduleModalEl.querySelector('#riderScheduleNewStatus').value = newStatus;
    riderScheduleModalEl.querySelector('#riderScheduleModalLabel').textContent = `Planifier: ${newStatus}`;

    // Pré-remplir date/heure
    const dateInput = riderScheduleModalEl.querySelector('#riderFollowUpDate');
    const timeInput = riderScheduleModalEl.querySelector('#riderFollowUpTime');
    if (newStatus === 'A relancer') {
        dateInput.value = moment().format('YYYY-MM-DD');
        timeInput.value = moment().add(1, 'hour').format('HH:mm');
    } else { // Reportée
        dateInput.value = moment().add(1, 'days').format('YYYY-MM-DD');
        timeInput.value = "10:00";
    }
    
    if(statusActionModal) statusActionModal.hide();
    if(riderScheduleModal) riderScheduleModal.show();
}
// --- FIN AJOUT ---


// --- LISTENERS COMMUNS (modales, actions générales) ---

const initializeCommonEventListeners = () => {
    const ordersContainer = document.getElementById('ordersContainer'); // Référence locale
    
    // --- MODIFICATION : Logique d'action conditionnelle ---
    // Les écouteurs d'action ne sont attachés que si on est sur une page d'action
    const currentPageId = document.body.id;
    const isActionPage = (currentPageId === 'page-today' || currentPageId === 'page-relaunch');

    ordersContainer?.addEventListener('click', async (e) => {
        const target = e.target.closest('a, button');
        if (!target) { return; }

        const isDropdownItem = target.closest('.dropdown-item');
        if(isDropdownItem) { e.preventDefault(); }
        if (target.classList.contains('disabled')) { return; }

        currentOrderId = target.dataset.orderId; // Stocke l'ID pour les modales

        if (target.classList.contains('chat-btn')) {
            if (chatModalRider && currentOrderId) {
                 chatOrderId = currentOrderId;
                 if(chatRiderOrderIdSpan) { chatRiderOrderIdSpan.textContent = chatOrderId; }
                 lastMessageTimestamp = null;
                 joinConversation(chatOrderId);
                 loadRiderMessages(chatOrderId);
                 loadRiderQuickReplies();
                 chatModalRider.show();
             }
        } 
        
        // --- ÉCOUTEURS D'ACTION (SI PAGE AUTORISÉE) ---
        else if (isActionPage) {
            // Actions du menu "Engrenage" (bi-gear)
            if (target.closest('.dropdown-item')?.dataset.action === 'pickup') {
                 if (confirm(`Confirmez-vous avoir physiquement récupéré le colis #${currentOrderId} ?`)) {
                    confirmPickup(currentOrderId);
                 }
            } else if (target.closest('.dropdown-item')?.dataset.action === 'start') {
                 startDelivery(currentOrderId);
            } else if (target.classList.contains('status-btn')) { // Bouton "Statuer" dans le menu "Engrenage"
                 if(actionModalOrderIdSpan) { actionModalOrderIdSpan.textContent = currentOrderId; }
                 
                 // --- LOGIQUE V7 (CORRECTION) : Afficher/Cacher les boutons de la modale ---
                 const order = window.fetchOrdersForCurrentPage.currentOrders?.find(o => o.id == currentOrderId); // Nécessite que fetchOrders... stocke les commandes
                 
                 if (!order) {
                     console.error("Impossible de trouver les détails de la commande pour statuer.");
                     showNotification("Erreur: Données de commande introuvables.", "danger");
                     return;
                 }
                 
                 const statutsDeSuivi = ['Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée', 'reported'];
                 const statutsActifs = ['in_progress', 'ready_for_pickup'];
                 
                 const estEnRoute = order.status === 'en_route';
                 const estEnSuivi = statutsDeSuivi.includes(order.status);
                 const estActif = statutsActifs.includes(order.status);

                 // Règle Clôture : Visible si 'en_route' OU déjà 'en_suivi'
                 const showClotureBtns = estEnRoute || estEnSuivi;
                 // Règle Suivi : Visible si 'actif', 'en_route' OU 'en_suivi' (donc toujours visible si le bouton "Statuer" l'est)
                 const showSuiviBtns = estActif || estEnRoute || estEnSuivi;
                 
                 // Cacher/Afficher les actions de Clôture
                 document.querySelectorAll('.status-action-btn[data-status="delivered"], .status-action-btn[data-status="failed_delivery"], .status-action-btn[data-status="cancelled"]')
                    .forEach(btn => btn.classList.toggle('d-none', !showClotureBtns));
                 
                 // Cacher/Afficher les actions de Suivi
                 document.querySelectorAll('.status-action-btn[data-status="Ne decroche pas"], .status-action-btn[data-status="Injoignable"], .status-action-btn[data-status="A relancer"], .status-action-btn[data-status="Reportée"]')
                    .forEach(btn => btn.classList.toggle('d-none', !showSuiviBtns));
                 
                 if(statusActionModal) { statusActionModal.show(); }
                 
            } else if (target.classList.contains('return-btn')) { // Bouton "Déclarer un retour" dans le menu "Engrenage"
                 if(returnModalOrderIdSpan) { returnModalOrderIdSpan.textContent = currentOrderId; }
                 if(returnModal) { returnModal.show(); }
            }
        }
    });

    // Listeners Modale Chat
    if (sendMessageBtnRider) { sendMessageBtnRider.addEventListener('click', sendRiderMessage); }
    if (messageInputRider) { messageInputRider.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendRiderMessage(); } }); }
    if (requestModificationBtn) { requestModificationBtn.addEventListener('click', requestOrderModification); }
    if (chatModalRiderEl) { chatModalRiderEl.addEventListener('hidden.bs.modal', () => {
        leaveConversation(chatOrderId);
        chatOrderId = null;
    }); }
    if(messageInputRider) { messageInputRider.addEventListener('input', () => { if(messageInputRider){ messageInputRider.rows = 1; const lines = messageInputRider.value.split('\n').length; const neededRows = Math.max(1, Math.min(lines, 4)); messageInputRider.rows = neededRows; } }); }

    // --- MODIFICATION : Écouteurs d'action (SI PAGE AUTORISÉE) ---
    if (isActionPage) {
        // Listeners autres modales (status, paiement, retour)
        if(statusSelectionDiv) {
            statusSelectionDiv.addEventListener('click', (e) => {
                const button = e.target.closest('.status-action-btn'); if(!button) { return; } 
                const status = button.dataset.status; 
                
                const amountInput = document.getElementById('amountReceived');

                if (status === 'delivered') { 
                    if(deliveredModalOrderIdSpan) { deliveredModalOrderIdSpan.textContent = currentOrderId; } 
                    if(deliveredPaymentModal) { statusActionModal.hide(); deliveredPaymentModal.show(); }
                }
                else if (status === 'failed_delivery') { 
                    if(failedModalOrderIdSpan) { failedModalOrderIdSpan.textContent = currentOrderId; } 
                    if(amountInput) { amountInput.value = '0'; } 
                    if(failedDeliveryModal) { statusActionModal.hide(); failedDeliveryModal.show(); }
                }
                // --- AJOUT : Logique nouveaux statuts ---
                else if (status === 'Ne decroche pas' || status === 'Injoignable') {
                    if(statusActionModal) { statusActionModal.hide(); }
                    updateOrderStatus(currentOrderId, status, 'pending', null, null);
                }
                else if (status === 'A relancer' || status === 'Reportée') {
                    openRiderScheduleModal(currentOrderId, status); // Ouvre la modale de planification
                }
                // --- FIN AJOUT ---
                else { 
                    // Cas "Annulée"
                    if(statusActionModal) { statusActionModal.hide(); }
                    updateOrderStatus(currentOrderId, status); 
                }
            });
        }

        if(paymentCashBtn) { paymentCashBtn.addEventListener('click', () => { updateOrderStatus(currentOrderId, 'delivered', 'cash'); if(deliveredPaymentModal) { deliveredPaymentModal.hide(); } }); }
        if(paymentSupplierBtn) { paymentSupplierBtn.addEventListener('click', () => { updateOrderStatus(currentOrderId, 'delivered', 'paid_to_supplier'); if(deliveredPaymentModal) { deliveredPaymentModal.hide(); } }); }
        if(failedDeliveryForm) { failedDeliveryForm.addEventListener('submit', (e) => { e.preventDefault(); const amount = document.getElementById('amountReceived').value; updateOrderStatus(currentOrderId, 'failed_delivery', null, amount); if(failedDeliveryModal) { failedDeliveryModal.hide(); } }); }
        if(confirmReturnBtn) {
            confirmReturnBtn.addEventListener('click', async () => {
                const orderId = returnModalOrderIdSpan?.textContent;
                // Note: La logique de 'declareReturn' gère sa propre modale de commentaire si elle existe
                if(orderId) { declareReturn(orderId, null); } // Commentaire simple pour l'instant
            });
        }
        
        // --- AJOUT : Écouteur pour la modale de planification (AVEC VALIDATION V4) ---
        if(riderScheduleForm) {
            riderScheduleForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                // --- CORRECTION LOGIQUE V4 ---
                const orderId = riderScheduleModalEl.querySelector('#riderScheduleOrderId').value;
                const newStatus = riderScheduleModalEl.querySelector('#riderScheduleNewStatus').value;
                const followUpDate = riderScheduleModalEl.querySelector('#riderFollowUpDate').value;
                const followUpTime = riderScheduleModalEl.querySelector('#riderFollowUpTime').value;
        
                // 1. Vérification de base
                if (!orderId || !newStatus || !followUpDate || !followUpTime) {
                    return showNotification('Veuillez remplir tous les champs.', 'warning');
                }
                
                const followUpMoment = moment(`${followUpDate} ${followUpTime}`);
        
                // 2. Vérification de validité
                if (!followUpMoment.isValid()) {
                     return showNotification('Le format de la date ou de lheure est invalide.', 'danger');
                }

                // 3. Vérification sémantique (pas dans le passé)
                // On autorise une marge de 5 minutes pour les clics lents
                if (followUpMoment.isBefore(moment().subtract(5, 'minutes'))) {
                     return showNotification('Vous ne pouvez pas programmer une action dans le passé.', 'danger');
                }

                const followUpAt = followUpMoment.format('YYYY-MM-DD HH:mm:ss');
                // --- FIN CORRECTION ---
                
                await updateOrderStatus(orderId, newStatus, 'pending', null, followUpAt);
                // updateOrderStatus s'occupe de fermer la modale
            });
        }
        // --- FIN AJOUT ---

    } // --- FIN if (isActionPage) ---


    // Gestion visibilité onglet
    document.addEventListener('visibilitychange', () => {
         if (document.visibilityState === 'visible') {
             if (!ws || ws.readyState !== WebSocket.OPEN) { initWebSocket(); }
             else if (chatOrderId && chatModalRiderEl?.classList.contains('show')) {
                 const lastMsgEl = chatMessagesRider?.lastElementChild;
                 if(lastMsgEl && lastMsgEl.dataset.messageId) { markMessagesAsRead(chatOrderId, lastMsgEl.dataset.messageId); }
             }
             updateSidebarCounters();
         }
     });

    // Déconnexion
     document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (ws) { ws.close(1000, "Déconnexion manuelle"); }
        AuthManager.logout();
    });
};

// --- INITIALISATION COMMUNE ---
// Appelée par rider.js après chargement du DOM

const initializeRiderApp = () => {
    currentUser = AuthManager.getUser(); // Assure que currentUser est défini
    if (!currentUser || currentUser.role !== 'livreur') {
        console.error("Auth échouée ou rôle incorrect.");
        AuthManager.logout(); // Sécurité
        return;
    }

    // Mettre à jour nom/rôle dans la sidebar
    if (document.getElementById('riderName')) { document.getElementById('riderName').textContent = currentUser.name || 'Livreur'; }
    if (document.getElementById('riderRole')) { document.getElementById('riderRole').textContent = 'Livreur'; }


    initWebSocket(); // Lance la connexion WebSocket
    initializeCommonEventListeners(); // Attache les listeners des modales, etc.

    console.log("Application Rider initialisée (common).");
};

// Exposer les fonctions nécessaires à rider.js
window.RiderCommon = {
    initializeRiderApp,
    initWebSocket,
    updateSidebarCounters,
    renderOrders,
    debounce,
    formatAmount,
    formatDate,
    getAuthHeader,
    handleAuthError,
    API_BASE_URL,
    statusTranslations,
    paymentTranslations, // <-- VIRGULE AJOUTÉE (V4)
    activeStatuses // Exporté pour rider.js si besoin
};