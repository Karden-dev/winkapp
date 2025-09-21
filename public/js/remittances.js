// js/remittances.js

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = 'http://localhost:3000';
    const remittanceTableBody = document.getElementById('remittanceTableBody');
    const searchInput = document.getElementById('searchInput');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const statusFilter = document.getElementById('statusFilter');
    const filterBtn = document.getElementById('filterBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const bulkPayBtn = document.getElementById('bulkPayBtn');

    const orangeMoneyTotal = document.getElementById('orangeMoneyTotal');
    const orangeMoneyTransactions = document.getElementById('orangeMoneyTransactions');
    const mtnMoneyTotal = document.getElementById('mtnMoneyTotal');
    const mtnMoneyTransactions = document.getElementById('mtnMoneyTransactions');
    const totalRemittanceAmount = document.getElementById('totalRemittanceAmount');
    const totalTransactions = document.getElementById('totalTransactions');
    
    const editPaymentModal = new bootstrap.Modal(document.getElementById('editPaymentModal'));
    const editPaymentForm = document.getElementById('editPaymentForm');
    const editShopIdInput = document.getElementById('editShopId');
    const paymentNameInput = document.getElementById('paymentNameInput');
    const phoneNumberInput = document.getElementById('phoneNumberInput');
    const paymentOperatorSelect = document.getElementById('paymentOperatorSelect');

    const partiallyPaidModal = new bootstrap.Modal(document.getElementById('partiallyPaidModal'));
    const partiallyPaidForm = document.getElementById('partiallyPaidForm');
    const partialAmountInput = document.getElementById('partialAmountInput');

    const remittanceDetailsModal = new bootstrap.Modal(document.getElementById('remittanceDetailsModal'));
    const detailsShopName = document.getElementById('detailsShopName');
    const detailsAmountDue = document.getElementById('detailsAmountDue');
    const detailsStatusBadge = document.getElementById('detailsStatusBadge');
    const remittanceHistoryContainer = document.getElementById('remittanceHistoryContainer');
    const pendingDebtsContainer = document.getElementById('pendingDebtsContainer');

    const statusTranslations = {
        'pending': 'En attente',
        'paid': 'Payé',
        'partially_paid': 'Partiellement payé'
    };
    const statusColors = {
        'pending': 'status-pending',
        'paid': 'status-paid',
        'partially_paid': 'status-partially_paid'
    };

    const paymentOperatorsColors = {
        'Orange Money': 'bg-orange-money',
        'MTN Mobile Money': 'bg-mtn-money'
    };
    
    const CURRENT_USER_ID = 1;

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

    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    startDateFilter.value = formattedDate;
    endDateFilter.value = formattedDate;
    statusFilter.value = 'pending';

    const fetchRemittances = async () => {
        try {
            const params = {
                search: searchInput.value,
                startDate: startDateFilter.value,
                endDate: endDateFilter.value,
                status: statusFilter.value
            };
            const response = await axios.get(`${API_BASE_URL}/remittances`, { params });
            const { remittances, stats } = response.data;
            renderRemittanceTable(remittances);
            updateStatsCards(stats);
        } catch (error) {
            console.error("Erreur lors de la récupération des versements:", error);
            remittanceTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-4">Erreur lors du chargement des données.</td></tr>`;
        }
    };

    const renderRemittanceTable = (remittances) => {
        remittanceTableBody.innerHTML = '';
        if (remittances.length === 0) {
            remittanceTableBody.innerHTML = `<tr><td colspan="8" class="text-center p-3">Aucun versement à afficher.</td></tr>`;
            return;
        }

        remittances.forEach((rem, index) => {
            const row = document.createElement('tr');
            const operatorColor = paymentOperatorsColors[rem.payment_operator] || 'bg-secondary';
            const statusColor = statusColors[rem.status] || 'bg-secondary';

            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${rem.shop_name}</td>
                <td>${rem.payment_name || 'N/A'}</td>
                <td>${rem.phone_number_for_payment || 'N/A'}</td>
                <td>
                    ${rem.payment_operator ? `<span class="operator-dot ${operatorColor}"></span>` : ''}
                    ${rem.payment_operator || 'N/A'}
                </td>
                <td>${rem.total_payout_amount ? rem.total_payout_amount.toLocaleString('fr-FR') : '0'} FCFA</td>
                <td>
                    <span class="status-badge">
                        <span class="status-dot ${statusColor}"></span>
                        ${statusTranslations[rem.status]}
                    </span>
                </td>
                <td>
                    <div class="dropdown">
                        <button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i class="bi bi-gear-fill"></i>
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item view-details-btn" href="#" data-shop-id="${rem.shop_id}"><i class="bi bi-eye"></i> Détails</a></li>
                            <li><a class="dropdown-item edit-payment-btn" href="#" data-shop-id="${rem.shop_id}"><i class="bi bi-pencil"></i> Modifier</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item full-pay-btn" href="#" data-shop-id="${rem.shop_id}" data-amount="${rem.total_payout_amount}"><i class="bi bi-check-circle"></i> Payer</a></li>
                            <li><a class="dropdown-item partial-pay-btn" href="#" data-shop-id="${rem.shop_id}" data-amount="${rem.total_payout_amount}"><i class="bi bi-cash"></i> Partiel</a></li>
                        </ul>
                    </div>
                </td>
            `;
            remittanceTableBody.appendChild(row);
        });
    };

    const updateStatsCards = (stats) => {
        orangeMoneyTotal.textContent = `${stats.orangeMoneyTotal.toLocaleString('fr-FR')} FCFA`;
        orangeMoneyTransactions.textContent = `${stats.orangeMoneyTransactions} transactions`;
        mtnMoneyTotal.textContent = `${stats.mtnMoneyTotal.toLocaleString('fr-FR')} FCFA`;
        mtnMoneyTransactions.textContent = `${stats.mtnMoneyTransactions} transactions`;
        totalRemittanceAmount.textContent = `${stats.totalRemittanceAmount.toLocaleString('fr-FR')} FCFA`;
        totalTransactions.textContent = `${stats.totalTransactions} transactions`;
    };

    filterBtn.addEventListener('click', fetchRemittances);
    searchInput.addEventListener('input', fetchRemittances);
    startDateFilter.addEventListener('change', fetchRemittances);
    endDateFilter.addEventListener('change', fetchRemittances);
    statusFilter.addEventListener('change', fetchRemittances);
    
    remittanceTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('a');
        if (!target) return;

        const shopId = target.dataset.shopId;
        
        if (target.classList.contains('edit-payment-btn')) {
            try {
                const response = await axios.get(`${API_BASE_URL}/shops/${shopId}`);
                const shop = response.data;
                editShopIdInput.value = shop.id;
                paymentNameInput.value = shop.payment_name || '';
                phoneNumberInput.value = shop.phone_number_for_payment || '';
                paymentOperatorSelect.value = shop.payment_operator || '';
                editPaymentModal.show();
            } catch (error) {
                console.error("Erreur lors de la récupération des détails du marchand:", error);
                showNotification("Impossible de charger les détails du marchand.", "danger");
            }
        } else if (target.classList.contains('full-pay-btn')) {
            const amount = parseFloat(target.dataset.amount);
            const shop = (await axios.get(`${API_BASE_URL}/shops/${shopId}`)).data;
            if (confirm(`Confirmer le versement complet de ${amount.toLocaleString('fr-FR')} FCFA à ${shop.name} ?`)) {
                try {
                    await axios.post(`${API_BASE_URL}/remittances/record`, {
                        shopId: shopId,
                        amount: amount,
                        paymentOperator: shop.payment_operator,
                        status: 'paid',
                        userId: CURRENT_USER_ID
                    });
                    showNotification("Versement complet enregistré avec succès !");
                    await fetchRemittances();
                } catch (error) {
                    console.error("Erreur lors de l'enregistrement du versement:", error);
                    showNotification("Erreur lors de l'enregistrement du versement.", "danger");
                }
            }
        } else if (target.classList.contains('partial-pay-btn')) {
            const amount = parseFloat(target.dataset.amount);
            partiallyPaidForm.dataset.shopId = shopId;
            document.getElementById('partiallyPaidInfo').textContent = `Montant total à verser: ${amount.toLocaleString('fr-FR')} FCFA`;
            partialAmountInput.max = amount;
            partiallyPaidModal.show();
        } else if (target.classList.contains('view-details-btn')) {
            try {
                const response = await axios.get(`${API_BASE_URL}/remittances/details/${shopId}`);
                const { remittances, debts, currentBalance } = response.data;
                const shop = (await axios.get(`${API_BASE_URL}/shops/${shopId}`)).data;

                detailsShopName.textContent = shop.name;
                detailsAmountDue.textContent = `${currentBalance.toLocaleString('fr-FR')} FCFA`;

                let statusText = 'En attente';
                let statusClass = 'bg-warning';
                if (currentBalance <= 0) {
                    statusText = 'Solde nul ou négatif';
                    statusClass = 'bg-success';
                }

                detailsStatusBadge.textContent = statusText;
                detailsStatusBadge.className = `badge ${statusClass}`;

                remittanceHistoryContainer.innerHTML = remittances.length > 0
                    ? remittances.map(rem => `
                        <div class="history-item">
                            <small class="text-muted">${moment(rem.payment_date).format('DD/MM/YYYY')}</small>
                            <p class="mb-0">Versement de ${rem.amount.toLocaleString('fr-FR')} FCFA</p>
                            <small>Statut: ${statusTranslations[rem.status]}</small>
                        </div>
                    `).join('')
                    : '<p class="text-muted">Aucun historique de versement.</p>';

                pendingDebtsContainer.innerHTML = debts.length > 0
                    ? debts.map(debt => `
                        <div class="history-item">
                            <small class="text-muted">${moment(debt.created_at).format('DD/MM/YYYY')}</small>
                            <p class="mb-0">Créance de ${debt.amount.toLocaleString('fr-FR')} FCFA</p>
                            <small>Type: ${debt.type}</small>
                        </div>
                    `).join('')
                    : '<p class="text-muted">Aucune créance en attente.</p>';
                
                remittanceDetailsModal.show();
            } catch (error) {
                console.error("Erreur lors de la récupération des détails:", error);
                showNotification("Impossible de charger les détails du versement.", "danger");
            }
        }
    });

    editPaymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const shopId = editShopIdInput.value;
        const paymentData = {
            payment_name: paymentNameInput.value,
            phone_number_for_payment: phoneNumberInput.value,
            payment_operator: paymentOperatorSelect.value
        };
        try {
            await axios.put(`${API_BASE_URL}/remittances/shop-details/${shopId}`, paymentData);
            showNotification("Informations de paiement mises à jour !");
            editPaymentModal.hide();
            await fetchRemittances();
        } catch (error) {
            console.error("Erreur lors de la mise à jour:", error);
            showNotification("Erreur lors de la mise à jour des informations de paiement.", "danger");
        }
    });

    partiallyPaidForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const shopId = partiallyPaidForm.dataset.shopId;
        const amount = parseFloat(partialAmountInput.value);
        const totalAmountDue = parseFloat(partialAmountInput.max);
        
        if (isNaN(amount) || amount <= 0 || amount > totalAmountDue) {
            showNotification("Veuillez entrer un montant valide, inférieur ou égal au solde dû.", "warning");
            return;
        }
        
        try {
            const shop = (await axios.get(`${API_BASE_URL}/shops/${shopId}`)).data;
            await axios.post(`${API_BASE_URL}/remittances/record`, {
                shopId: shopId,
                amount: amount,
                paymentOperator: shop.payment_operator,
                status: 'partially_paid',
                comment: `Versement partiel de ${amount.toLocaleString('fr-FR')} FCFA.`,
                userId: CURRENT_USER_ID
            });
            showNotification(`Versement partiel de ${amount.toLocaleString('fr-FR')} FCFA enregistré.`);
            partiallyPaidModal.hide();
            await fetchRemittances();
        } catch (error) {
            console.error("Erreur lors de l'enregistrement du versement partiel:", error);
            showNotification("Erreur lors de l'enregistrement du versement partiel.", "danger");
        }
    });

    bulkPayBtn.addEventListener('click', async () => {
        const remittances = (await axios.get(`${API_BASE_URL}/remittances`)).data.remittances;
        const pendingRemittances = remittances.filter(rem => rem.total_payout_amount > 0);

        if (pendingRemittances.length === 0) {
            showNotification('Aucun versement en attente.', 'info');
            return;
        }

        if (confirm(`Confirmer le versement de ${pendingRemittances.length} marchands ?`)) {
            try {
                const bulkPayPromises = pendingRemittances.map(rem =>
                    axios.post(`${API_BASE_URL}/remittances/record`, {
                        shopId: rem.shop_id,
                        amount: rem.total_payout_amount,
                        paymentOperator: rem.payment_operator,
                        status: 'paid',
                        userId: CURRENT_USER_ID
                    })
                );
                await Promise.all(bulkPayPromises);
                showNotification(`Versement de ${pendingRemittances.length} marchands effectué avec succès.`);
                await fetchRemittances();
            } catch (error) {
                console.error("Erreur lors des versements groupés:", error);
                showNotification("Erreur lors des versements groupés. Veuillez réessayer.", "danger");
            }
        }
    });

    exportPdfBtn.addEventListener('click', async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/remittances/export-pdf`, { responseType: 'blob' });
            const pdfBlob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `rapport_versements_en_attente.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showNotification("Rapport PDF généré avec succès !");
        } catch (error) {
            console.error("Erreur lors de l'exportation du PDF:", error);
            showNotification("Erreur lors de la génération du rapport PDF.", "danger");
            }
        });

    fetchRemittances();

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
});