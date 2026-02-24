// js/remittances.js

document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const API_BASE_URL = '/api';
    const CURRENT_USER_ID = 1; // À remplacer par l'ID de l'utilisateur connecté

    // --- CACHES & ÉTAT ---
    let allRemittances = [];
    let paginatedRemittances = [];
    let currentPage = 1;
    let itemsPerPage = 25;
    let currentRemittanceSelection = []; 

    // --- RÉFÉRENCES DOM ---
    const remittanceTableBody = document.getElementById('remittanceTableBody');
    const searchInput = document.getElementById('searchInput');
    const remittanceDateInput = document.getElementById('remittanceDate');
    const statusFilter = document.getElementById('statusFilter');
    const resyncBtn = document.getElementById('resyncBtn'); 
    
    // Éléments de pagination et de stats
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    const paginationInfo = document.getElementById('paginationInfo');
    const currentPageDisplay = document.getElementById('currentPageDisplay');
    const firstPageBtn = document.getElementById('firstPage');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const lastPageBtn = document.getElementById('lastPage');
    const bulkPayBtn = document.getElementById('bulkPayBtn');
    
    // Références Modales
    const editPaymentModal = new bootstrap.Modal(document.getElementById('editPaymentModal'));
    const payConfirmModal = new bootstrap.Modal(document.getElementById('payConfirmModal'));
    const editPaymentForm = document.getElementById('editPaymentForm');
    const confirmPayBtn = document.getElementById('confirmPayBtn');
    
    // Références pour la modale de confirmation
    const confirmShopName = document.getElementById('confirmShopName');
    const confirmAmount = document.getElementById('confirmAmount');
    const payConfirmShopId = document.getElementById('payConfirmShopId');
    const payConfirmAmount = document.getElementById('payConfirmAmount');
    
    // Références pour l'édition des infos de paiement
    const editShopIdInput = document.getElementById('editShopId');
    const paymentNameInput = document.getElementById('paymentNameInput');
    const phoneNumberInput = document.getElementById('phoneNumberInput');
    const paymentOperatorSelect = document.getElementById('paymentOperatorSelect');
    
    // Placeholders pour les filtres masqués (pour la compatibilité)
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');

    // --- TRADUCTIONS ET COULEURS ---
    const statusTranslations = { 'pending': 'En attente', 'paid': 'Payé' };
    const statusColors = { 'pending': 'status-pending', 'paid': 'status-paid' };
    const paymentOperatorsColors = {
        'Orange Money': 'bg-orange-money-dot',
        'MTN Mobile Money': 'bg-mtn-money-dot'
    };

    // --- FONCTIONS UTILITAIRES ---
    
    const showNotification = (message, type = 'success') => {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        container.appendChild(alert);
        setTimeout(() => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }, 4000); 
    };

    const addSafeEventListener = (element, event, handler, elementId) => {
        if (element) {
            element.addEventListener(event, handler);
        }
    };
    
    const formatAmount = (amount) => {
        return parseFloat(amount || 0).toLocaleString('fr-FR') + ' FCFA';
    };
    
    const formatPhoneNumber = (phone) => {
        if (!phone) return 'N/A';
        const cleaned = ('' + phone).replace(/\D/g, '');
        const match = cleaned.match(/^(\d{1})(\d{2})(\d{2})(\d{2})(\d{2})$/);
        // Format demandé : 0 00 00 00 00 en gras
        if (match) {
            return `<strong>${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}</strong>`;
        }
        return `<strong>${phone}</strong>`;
    };


    // --- FONCTIONS PRINCIPALES ---
    
    /**
     * Récupère les versements (et synchronise d'abord si la date est définie).
     */
    const fetchRemittances = async () => {
        try {
            const params = {};
            const date = remittanceDateInput.value;
            
            if (!date) {
                 remittanceTableBody.innerHTML = `<tr><td colspan="9" class="text-center p-3">Veuillez sélectionner une date de bilan.</td></tr>`;
                 updateStatsCards({ orangeMoneyTotal: 0, orangeMoneyTransactions: 0, mtnMoneyTotal: 0, mtnMoneyTransactions: 0, totalAmount: 0 });
                 return;
            }
            
            // Filtres envoyés au contrôleur (synchronise la date en cours, puis filtre par statut)
            params.date = date;
            params.search = searchInput.value;
            params.status = statusFilter.value;

            const response = await axios.get(`${API_BASE_URL}/remittances`, { params });
            allRemittances = response.data.remittances;
            updateStatsCards(response.data.stats);
            
            currentPage = 1; 
            applyPaginationAndRender();
        } catch (error) {
            console.error("Erreur fetchRemittances:", error);
            const errorMessage = error.response?.data?.message || "Erreur de chargement.";
            remittanceTableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">${errorMessage}</td></tr>`;
            showNotification(errorMessage, "danger");
        }
    };

    /**
     * Applique les paramètres de pagination et lance le rendu du tableau.
     */
    const applyPaginationAndRender = () => {
        const totalItems = allRemittances.length;
        itemsPerPage = parseInt(itemsPerPageSelect.value);

        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        paginatedRemittances = allRemittances.slice(startIndex, startIndex + itemsPerPage);
        
        renderRemittanceTable(paginatedRemittances);
        updatePaginationInfo();
    };

    /**
     * Génère et affiche les lignes du tableau des versements.
     */
    const renderRemittanceTable = (remittances) => {
        if (!remittanceTableBody) return;
        remittanceTableBody.innerHTML = '';
        
        if (remittances.length === 0) {
            remittanceTableBody.innerHTML = `<tr><td colspan="9" class="text-center p-3">Aucun versement à afficher pour les filtres sélectionnés.</td></tr>`;
            return;
        }
        
        const startIndex = (currentPage - 1) * itemsPerPage;

        remittances.forEach((rem, index) => {
            const row = document.createElement('tr');
            const operatorColor = paymentOperatorsColors[rem.payment_operator] || 'bg-secondary';
            const statusColor = statusColors[rem.status] || 'bg-secondary';
            const isPending = rem.status === 'pending';
            
            // Colonne fusionnée : Nom Versement (Téléphone en gras)
            const remittanceInfo = `
                ${rem.payment_name || 'N/A'}
                <br>
                ${formatPhoneNumber(rem.phone_number_for_payment)}
            `;
            
            // Montants et Créances (nouvelles colonnes)
            const debtsAmount = formatAmount(rem.debts_consolidated || 0); // Créances consolidées
            const grossAmount = formatAmount(rem.gross_amount || 0);
            const netAmount = rem.net_amount || 0;
            const formattedNetAmount = formatAmount(netAmount);

            // L'ID du versement est l'ID de la ligne dans la table 'remittances' (r.id)
            const remittanceId = rem.id; 

            // PROTECTION CLÉ: Le paiement n'est possible que si le statut est pending ET que le montant net est > 0
            const isPayable = isPending && netAmount > 0; 

            row.innerHTML = `
                <td>${startIndex + index + 1}</td>
                <td>${rem.shop_name}</td>
                <td>${remittanceInfo}</td>
                <td>${rem.payment_operator ? `<span class="operator-dot ${operatorColor}"></span>` : ''} ${rem.payment_operator || 'N/A'}</td>
                <td class="text-success fw-bold">${grossAmount}</td>
                <td class="text-danger fw-bold">${debtsAmount}</td>
                <td class="fw-bold">${formattedNetAmount}</td>
                <td>
                    <span class="status-badge-container">
                        <span class="status-dot ${statusColor}"></span>
                        ${statusTranslations[rem.status]}
                    </span>
                </td>
                <td>
                    <div class="dropdown">
                        <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-gear"></i></button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item edit-payment-details-btn" href="#" data-shop-id="${rem.shop_id}" title="Modifier infos de paiement"><i class="bi bi-pencil"></i> Modifier infos</a></li>
                            ${isPayable ? `<li><a class="dropdown-item pay-btn" href="#" data-remittance-id="${remittanceId}" data-shop-name="${rem.shop_name}" data-amount="${netAmount}"><i class="bi bi-check-circle"></i> Effectuer le versement</a></li>` : ''}
                        </ul>
                    </div>
                </td>
            `;
            remittanceTableBody.appendChild(row);
        });
    };

    /**
     * Met à jour les cartes de statistiques en haut de page.
     */
    const updateStatsCards = (stats) => {
        const orangeMoneyTotal = document.getElementById('orangeMoneyTotal');
        const orangeMoneyTransactions = document.getElementById('orangeMoneyTransactions');
        const mtnMoneyTotal = document.getElementById('mtnMoneyTotal');
        const mtnMoneyTransactions = document.getElementById('mtnMoneyTransactions');
        const totalRemittanceAmount = document.getElementById('totalRemittanceAmount');
        const totalTransactions = document.getElementById('totalTransactions');
        
        if (orangeMoneyTotal) orangeMoneyTotal.textContent = formatAmount(stats.orangeMoneyTotal);
        if (orangeMoneyTransactions) orangeMoneyTransactions.textContent = `${stats.orangeMoneyTransactions} trans.`;
        if (mtnMoneyTotal) mtnMoneyTotal.textContent = formatAmount(stats.mtnMoneyTotal);
        if (mtnMoneyTransactions) mtnMoneyTransactions.textContent = `${stats.mtnMoneyTransactions} trans.`;
        
        if (totalRemittanceAmount) totalRemittanceAmount.textContent = formatAmount(stats.totalAmount); 
        
        const pendingCount = allRemittances.filter(r => r.status === 'pending').length;
        if (totalTransactions) totalTransactions.textContent = `${pendingCount} trans. en attente`;
        
        // Gère l'état du bouton "Tout Payer"
        // Le paiement groupé n'est possible que si le montant total net est > 0
        bulkPayBtn.disabled = pendingCount === 0 || stats.totalAmount <= 0;
    };
    
    /**
     * Met à jour l'affichage des informations de pagination.
     */
    const updatePaginationInfo = () => {
        const totalItems = allRemittances.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        
        if (paginationInfo) paginationInfo.textContent = `Page ${currentPage} sur ${totalPages} (${totalItems} entrées)`;
        if (currentPageDisplay) currentPageDisplay.textContent = currentPage;
        
        firstPageBtn?.classList.toggle('disabled', currentPage === 1);
        prevPageBtn?.classList.toggle('disabled', currentPage === 1);
        nextPageBtn?.classList.toggle('disabled', currentPage >= totalPages);
        lastPageBtn?.classList.toggle('disabled', currentPage >= totalPages);
    };
    
    /**
     * Gère le changement de page dans les contrôles de pagination.
     */
    const handlePageChange = (newPage) => {
        const totalPages = Math.ceil(allRemittances.length / itemsPerPage);
        if (newPage < 1 || newPage > totalPages) return;
        currentPage = newPage;
        applyPaginationAndRender();
    };

    /**
     * Ouvre la modale de confirmation pour un versement (individuel ou groupé).
     */
    const openConfirmModal = (mode, totalAmount, shopName, remittanceId = null) => {
        currentRemittanceSelection = []; 
        
        if (mode === 'individual') {
            const remittance = allRemittances.find(r => r.id == remittanceId);
            currentRemittanceSelection = [remittance];
            confirmShopName.textContent = `Marchand: ${shopName}`;
            payConfirmShopId.value = remittanceId; // Stocker l'ID de la transaction
            
        } else { // Mode Bulk
            const pending = allRemittances.filter(r => r.status === 'pending' && r.net_amount > 0);
            currentRemittanceSelection = pending;
            confirmShopName.textContent = `${pending.length} Marchands en attente`;
            payConfirmShopId.value = 'BULK_PAYMENT'; 
        }
        
        confirmAmount.textContent = formatAmount(totalAmount);
        payConfirmAmount.value = totalAmount;
        payConfirmModal.show();
    };
    
    /**
     * Gère la confirmation de paiement depuis la modale (Individuel ou Groupé).
     */
    const handleConfirmPayment = async () => {
        const targetId = payConfirmShopId.value;
        const isBulk = targetId === 'BULK_PAYMENT';

        confirmPayBtn.disabled = true;
        confirmPayBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Paiement...';

        try {
            const remittancesToPay = currentRemittanceSelection.filter(rem => rem.status === 'pending' && rem.net_amount > 0);
            let successCount = 0;
            
            if (remittancesToPay.length === 0) {
                 throw new Error("Aucun versement en attente à traiter (montant net inférieur ou égal à zéro).");
            }

            for (const rem of remittancesToPay) {
                // Utilise la route /:id/pay qui appelle markAsPaid et règle les dettes
                await axios.put(`${API_BASE_URL}/remittances/${rem.id}/pay`, {
                    userId: CURRENT_USER_ID
                });
                successCount++;
            }
            
            const message = isBulk 
                ? `${successCount} versement(s) marqué(s) comme payé(s) !`
                : `Versement pour ${remittancesToPay[0].shop_name} marqué comme payé.`;
            showNotification(message, 'success');

        } catch (error) {
            showNotification(error.response?.data?.message || 'Erreur lors du changement de statut.', 'danger');
        } finally {
            payConfirmModal.hide();
            confirmPayBtn.disabled = false;
            confirmPayBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i> Confirmer';
            fetchRemittances();
        }
    };

    /**
     * Gère les actions sur les lignes du tableau (Paiement, Modification des détails).
     */
    const handleTableActions = async (e) => {
        const target = e.target.closest('a');
        if (!target) return;

        const shopId = target.dataset.shopId;
        const remittanceId = target.dataset.remittanceId;
        
        if (target.classList.contains('edit-payment-details-btn')) {
            try {
                // Ouvre la modale d'édition.
                const { data: shop } = await axios.get(`${API_BASE_URL}/shops/${shopId}`);
                editShopIdInput.value = shop.id;
                paymentNameInput.value = shop.payment_name || '';
                phoneNumberInput.value = shop.phone_number_for_payment || '';
                paymentOperatorSelect.value = shop.payment_operator || '';
                
                document.getElementById('editPaymentModal').querySelector('.modal-title').textContent = `Modifier infos de ${shop.name}`;
                editPaymentModal.show();
            } catch (error) { 
                showNotification("Impossible de charger les détails de paiement.", "danger"); 
            }
        } else if (target.classList.contains('pay-btn')) {
            const shopName = target.dataset.shopName;
            const amount = parseFloat(target.dataset.amount);
            
            // Paiement individuel : Ouvre la modale de confirmation
            payConfirmShopId.value = remittanceId; // Stocker l'ID de la transaction dans remittances
            openConfirmModal('individual', amount, shopName, remittanceId);
        }
    };
    
    /**
     * Gère la soumission du formulaire de modification des infos de paiement du marchand.
     */
    const handleEditPaymentSubmit = async (e) => {
        e.preventDefault();
        const shopId = editShopIdInput.value;
        const paymentData = { 
            payment_name: paymentNameInput.value, 
            phone_number_for_payment: phoneNumberInput.value, 
            payment_operator: paymentOperatorSelect.value 
        };
        try {
            await axios.put(`${API_BASE_URL}/remittances/shop-details/${shopId}`, paymentData);
            showNotification("Informations mises à jour !");
            editPaymentModal.hide();
            await fetchRemittances(); // Recharger pour voir les changements dans le tableau
        } catch (error) { 
            showNotification("Erreur de mise à jour.", "danger"); 
        }
    };


    // --- INITIALISATION ---
    const initializeApp = () => {
        const today = new Date().toISOString().slice(0, 10);
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('main-content');
        const sidebarToggler = document.getElementById('sidebar-toggler');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (remittanceDateInput) remittanceDateInput.value = today;
        if (statusFilter) statusFilter.value = "pending"; // Filtre par défaut 'En attente'
        if (itemsPerPageSelect) itemsPerPage = parseInt(itemsPerPageSelect.value);

        // --- CORRECTION: Gestion du menu latéral (Bouton Hamburger) ---
        addSafeEventListener(sidebarToggler, 'click', () => {
            if (window.innerWidth < 992) {
                // Logique mobile : basculer la classe 'show'
                sidebar?.classList.toggle('show');
            } else {
                // Logique Desktop : basculer la classe 'collapsed'
                sidebar?.classList.toggle('collapsed');
                mainContent?.classList.toggle('expanded');
            }
        }, 'sidebar-toggler');
        
        addSafeEventListener(logoutBtn, 'click', () => { 
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
            window.location.href = 'index.html'; 
        }, 'logoutBtn');

        // Écouteurs pour le filtre (automatique) et la recherche (déclenche fetchRemittances)
        addSafeEventListener(remittanceDateInput, 'change', fetchRemittances, 'remittanceDate');
        addSafeEventListener(searchInput, 'input', fetchRemittances, 'searchInput');
        addSafeEventListener(statusFilter, 'change', fetchRemittances, 'statusFilter');
        addSafeEventListener(remittanceTableBody, 'click', handleTableActions, 'remittanceTableBody');
        
        // Écouteurs Modale
        addSafeEventListener(editPaymentForm, 'submit', handleEditPaymentSubmit, 'editPaymentForm');
        addSafeEventListener(confirmPayBtn, 'click', handleConfirmPayment, 'confirmPayBtn');
        
        // Écouteur pour le bouton "Tout Payer"
        addSafeEventListener(bulkPayBtn, 'click', () => {
             const pending = allRemittances.filter(r => r.status === 'pending');
             const totalAmount = pending.reduce((sum, rem) => sum + rem.net_amount, 0); // Utiliser le net_amount
             if (pending.length > 0 && totalAmount > 0) { // Protection du montant total négatif
                 payConfirmShopId.value = 'BULK_PAYMENT'; 
                 openConfirmModal('bulk', totalAmount, `${pending.length} Marchands`);
             }
        }, 'bulkPayBtn');
        
        // Écouteur pour le bouton "Re-sync"
        addSafeEventListener(resyncBtn, 'click', async () => {
            const date = remittanceDateInput.value;
            if (!date) return showNotification('Veuillez sélectionner une date.', 'warning');
            
            resyncBtn.disabled = true;
            resyncBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sync...';

            try {
                // L'appel à fetchRemittances force la synchronisation côté backend
                await fetchRemittances(date);
                showNotification('Synchronisation forcée réussie. Les montants sont à jour.', 'info');
            } catch (error) {
                showNotification(`Erreur lors de la re-synchronisation.`, 'danger');
            } finally {
                resyncBtn.disabled = false;
                resyncBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Re-sync';
            }
        }, 'resyncBtn');

        // Pagination
        addSafeEventListener(itemsPerPageSelect, 'change', (e) => { itemsPerPage = parseInt(e.target.value); applyPaginationAndRender(); }, 'itemsPerPage');
        addSafeEventListener(firstPageBtn, 'click', (e) => { e.preventDefault(); handlePageChange(1); }, 'firstPage');
        addSafeEventListener(prevPageBtn, 'click', (e) => { e.preventDefault(); handlePageChange(currentPage - 1); }, 'prevPage');
        addSafeEventListener(nextPageBtn, 'click', (e) => { e.preventDefault(); handlePageChange(currentPage + 1); }, 'nextPage');
        addSafeEventListener(lastPageBtn, 'click', (e) => { e.preventDefault(); handlePageChange(Math.ceil(allRemittances.length / itemsPerPage)); }, 'lastPage');
        
        // Lancement du chargement initial
        fetchRemittances();
    };

    initializeApp();
});