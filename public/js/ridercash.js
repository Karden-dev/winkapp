// public/js/ridercash.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = '/api';
    let currentUser;

    // --- Références DOM ---
    const dateFilter = document.getElementById('date-filter');
    const amountExpectedEl = document.getElementById('amount-expected');
    const amountConfirmedEl = document.getElementById('amount-confirmed');
    const totalExpensesEl = document.getElementById('total-expenses');
    const transactionsList = document.getElementById('transactions-list');
    
    // --- Fonctions utilitaires ---
    const formatAmount = (amount) => `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;

    const handleAuthError = (error) => {
        if (error.response?.status === 401 || error.response?.status === 403) {
            alert("Votre session a expiré. Veuillez vous reconnecter.");
            localStorage.clear(); sessionStorage.clear();
            window.location.href = 'index.html';
        } else {
            console.error(error);
            alert("Une erreur inattendue est survenue.");
        }
    };

    // --- Fonctions de rendu ---
    const renderSummary = (summary) => {
        amountExpectedEl.textContent = formatAmount(summary.amountExpected);
        amountConfirmedEl.textContent = formatAmount(summary.amountConfirmed);
        totalExpensesEl.textContent = formatAmount(Math.abs(summary.totalExpenses));
    };

    const getOrderStatusBadge = (remittanceStatus, confirmedAmount, totalAmount) => {
        let dotClass = 'bg-info';
        let textClass = 'text-info';
        let statusText = 'Cash à verser';
        
        // Si le montant total de la transaction est négatif, c'est une expédition
        if (totalAmount < 0) {
            statusText = 'Frais à confirmer';
        }

        let finalConfirmedAmount = 0;

        if (remittanceStatus === 'confirmed') {
            dotClass = 'bg-success';
            textClass = 'text-success';
            statusText = 'Confirmé';
            finalConfirmedAmount = confirmedAmount; // On affiche le montant du versement
        }
        
        return `<div class="mt-1">
                    <div class="d-flex align-items-center justify-content-end">
                        <span class="dot ${dotClass} me-2"></span>
                        <small class="${textClass}">${statusText}</small>
                    </div>
                    <small class="text-muted d-block text-end">${formatAmount(finalConfirmedAmount)} / ${formatAmount(totalAmount)}</small>
                </div>`;
    };

    const getTransactionStatusBadge = (status) => {
        let dotClass = 'bg-secondary', textClass = 'text-secondary', statusText = status;
        switch(status) {
            case 'pending': dotClass = 'bg-warning'; textClass = 'text-warning'; statusText = 'En attente'; break;
            case 'confirmed': case 'paid': dotClass = 'bg-success'; textClass = 'text-success'; statusText = 'Réglé'; break;
        }
        return `<div class="d-flex align-items-center justify-content-end mt-1"><span class="dot ${dotClass} me-2"></span><small class="${textClass}">${statusText}</small></div>`;
    };

    const renderTransactions = (transactions) => {
        transactionsList.innerHTML = '';
        if (transactions.length === 0) {
            transactionsList.innerHTML = '<li class="list-group-item text-center text-muted">Aucune transaction pour cette date.</li>';
            return;
        }

        let html = '';
        transactions.forEach(tx => {
            if (tx.type === 'order') {
                const isExpedition = parseFloat(tx.article_amount) < 0;
                const title = isExpedition ? `Expédition  #${tx.tracking_number}` : `Commande #${tx.tracking_number}`;
                const amountColor = isExpedition ? 'text-warning' : 'text-corail';
                const icon = isExpedition ? 'bi-truck' : 'bi-box-seam';

                html += `
                    <li class="list-group-item">
                        <div class="d-flex justify-content-between align-items-start">
                            <div style="flex-grow: 1; margin-right: 10px;">
                                <h6 class="mb-1 fw-bold text-primary"><i class="bi ${icon} me-2"></i>${title}</h6>
                                <p class="mb-1 text-muted small"><i class="bi bi-shop me-2"></i>${tx.shop_name || 'N/A'}</p>
                                <p class="mb-1 text-muted small"><i class="bi bi-box-seam me-2"></i>${tx.items_list || 'Article non spécifié'}</p>
                                <p class="mb-0 text-muted small"><i class="bi bi-geo-alt me-2"></i>${tx.delivery_location || 'N/A'}</p>
                            </div>
                            <div class="text-end" style="min-width: 120px;">
                                <span class="fw-bold ${amountColor} fs-5">${formatAmount(tx.article_amount)}</span>
                                ${getOrderStatusBadge(tx.remittance_status, tx.confirmedAmount, tx.article_amount)}
                            </div>
                        </div>
                    </li>`;
            } else if (tx.type === 'expense' || tx.type === 'shortfall') {
                const isExpense = tx.type === 'expense';
                const icon = isExpense ? 'bi-wallet2 text-warning' : 'bi-exclamation-triangle text-danger';
                const title = isExpense ? 'Dépense' : 'Manquant';
                const amountClass = isExpense ? 'text-warning' : 'text-danger';
                html += `
                    <li class="list-group-item">
                        <div class="d-flex w-100 justify-content-between">
                            <div class="d-flex align-items-center"><i class="bi ${icon} fs-4 me-3"></i>
                                <div><h6 class="mb-0">${title}</h6><small class="text-muted">${tx.comment || ''}</small></div>
                            </div>
                            <div class="text-end">
                                <span class="fw-bold ${amountClass}">${formatAmount(tx.amount)}</span>
                                ${getTransactionStatusBadge(tx.status)}
                            </div>
                        </div>
                    </li>`;
            }
        });
        transactionsList.innerHTML = `<ul class="list-group list-group-flush">${html}</ul>`;
    };
    
    const fetchAndRenderCashDetails = async (date) => {
        transactionsList.innerHTML = '<p class="text-center text-muted">Chargement...</p>';
        try {
            const response = await axios.get(`${API_BASE_URL}/rider/cash-details`, { params: { date } });
            renderSummary(response.data.summary);
            renderTransactions(response.data.transactions);
        } catch (error) {
            handleAuthError(error);
            transactionsList.innerHTML = '<p class="text-center text-danger">Erreur de chargement.</p>';
        }
    };

    const init = () => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        if (!storedUser) { window.location.href = 'index.html'; return; }
        currentUser = JSON.parse(storedUser);
        axios.defaults.headers.common['Authorization'] = `Bearer ${currentUser.token}`;

        const today = new Date().toISOString().split('T')[0];
        dateFilter.value = today;
        fetchAndRenderCashDetails(today);
        dateFilter.addEventListener('change', () => fetchAndRenderCashDetails(dateFilter.value));
    };

    init();
});