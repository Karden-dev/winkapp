// js/debts.js

document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = 'http://localhost:3000';
    const CURRENT_USER_ID = 1;

    // --- Références DOM ---
    const debtsTableBody = document.getElementById('debtsTableBody');
    const searchInput = document.getElementById('searchInput');
    const startDateFilter = document.getElementById('startDateFilter');
    const endDateFilter = document.getElementById('endDateFilter');
    const statusFilter = document.getElementById('statusFilter');
    const filterBtn = document.getElementById('filterBtn');
    const debtModal = new bootstrap.Modal(document.getElementById('addDebtModal'));
    const debtForm = document.getElementById('debtForm');
    const debtIdInput = document.getElementById('debtId');
    const shopSelect = document.getElementById('shopSelect');
    const amountInput = document.getElementById('amountInput');
    const typeSelect = document.getElementById('typeSelect');
    const commentInput = document.getElementById('commentInput');
    const debtSubmitBtn = document.getElementById('debtSubmitBtn');
    const addDebtModalLabel = document.getElementById('addDebtModalLabel');

    let shopsCache = [];

    const statusTranslations = {
        'pending': 'En attente',
        'paid': 'Réglé'
    };
    const statusColors = {
        'pending': 'status-pending',
        'paid': 'status-paid'
    };

    // --- Fonctions utilitaires ---
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

    const fetchAndRenderDebts = async () => {
        try {
            const params = {
                search: searchInput.value,
                startDate: startDateFilter.value,
                endDate: endDateFilter.value,
                status: statusFilter.value
            };
            const response = await axios.get(`${API_BASE_URL}/debts`, { params });
            renderDebtsTable(response.data);
        } catch (error) {
            console.error("Erreur lors de la récupération des créances:", error);
            debtsTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-4">Erreur lors du chargement des données.</td></tr>`;
        }
    };
    
    const fetchShops = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/shops?status=actif`);
            shopsCache = response.data;
            shopSelect.innerHTML = '<option value="">Sélectionner un marchand</option>';
            shopsCache.forEach(shop => {
                const option = document.createElement('option');
                option.value = shop.id;
                option.textContent = shop.name;
                shopSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Erreur lors du chargement des marchands:", error);
        }
    };

    const renderDebtsTable = (debts) => {
        debtsTableBody.innerHTML = '';
        if (debts.length === 0) {
            debtsTableBody.innerHTML = `<tr><td colspan="8" class="text-center p-3">Aucune créance à afficher.</td></tr>`;
            return;
        }

        debts.forEach((debt, index) => {
            const row = document.createElement('tr');
            const statusColor = statusColors[debt.status] || 'bg-secondary';

            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${debt.shop_name}</td>
                <td class="text-danger fw-bold">${parseFloat(debt.amount).toLocaleString('fr-FR')} FCFA</td>
                <td>${debt.type}</td>
                <td>${debt.comment || 'N/A'}</td>
                <td>${moment(debt.created_at).format('DD/MM/YYYY')}</td>
                <td>
                    <span class="status-badge">
                        <span class="status-dot ${statusColor}"></span>
                        ${statusTranslations[debt.status]}
                    </span>
                </td>
                <td>
                    <div class="dropdown">
                        <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i class="bi bi-gear"></i>
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item edit-btn" href="#" data-id="${debt.id}"><i class="bi bi-pencil"></i> Modifier</a></li>
                            ${debt.status === 'pending' ? `<li><a class="dropdown-item settle-btn" href="#" data-id="${debt.id}"><i class="bi bi-check-circle"></i> Régler</a></li>` : ''}
                            <li><a class="dropdown-item delete-btn text-danger" href="#" data-id="${debt.id}"><i class="bi bi-trash"></i> Supprimer</a></li>
                        </ul>
                    </div>
                </td>
            `;
            debtsTableBody.appendChild(row);
        });
    };

    // --- Gestion des événements ---
    filterBtn.addEventListener('click', fetchAndRenderDebts);
    searchInput.addEventListener('input', fetchAndRenderDebts);
    startDateFilter.addEventListener('change', fetchAndRenderDebts);
    endDateFilter.addEventListener('change', fetchAndRenderDebts);
    statusFilter.addEventListener('change', fetchAndRenderDebts);

    debtForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const debtData = {
            shop_id: shopSelect.value,
            amount: amountInput.value,
            type: typeSelect.value,
            comment: commentInput.value,
            created_by: CURRENT_USER_ID,
            updated_by: CURRENT_USER_ID
        };

        try {
            if (debtIdInput.value) {
                // Modification
                await axios.put(`${API_BASE_URL}/debts/${debtIdInput.value}`, debtData);
                showNotification("Créance modifiée avec succès !");
            } else {
                // Création
                await axios.post(`${API_BASE_URL}/debts`, debtData);
                showNotification("Créance ajoutée avec succès !");
            }
            debtModal.hide();
            fetchAndRenderDebts();
        } catch (error) {
            console.error("Erreur lors de la soumission de la créance:", error);
            showNotification(error.response?.data?.message || "Erreur lors de l'enregistrement de la créance.", 'danger');
        }
    });

    debtsTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('a');
        if (!target) return;
        const debtId = target.dataset.id;
        
        if (target.classList.contains('edit-btn')) {
            try {
                const response = await axios.get(`${API_BASE_URL}/debts/${debtId}`);
                const debt = response.data;
                debtIdInput.value = debt.id;
                shopSelect.value = debt.shop_id;
                amountInput.value = debt.amount;
                typeSelect.value = debt.type;
                commentInput.value = debt.comment;
                
                addDebtModalLabel.textContent = "Modifier la créance";
                debtSubmitBtn.textContent = "Sauvegarder";
                debtModal.show();
            } catch (error) {
                showNotification("Impossible de charger les détails de la créance.", "danger");
            }
        } else if (target.classList.contains('delete-btn')) {
            if (confirm("Êtes-vous sûr de vouloir supprimer cette créance ?")) {
                try {
                    await axios.delete(`${API_BASE_URL}/debts/${debtId}`);
                    showNotification("Créance supprimée avec succès.");
                    fetchAndRenderDebts();
                } catch (error) {
                    showNotification("Erreur lors de la suppression de la créance.", "danger");
                }
            }
        } else if (target.classList.contains('settle-btn')) {
             if (confirm("Confirmer le règlement de cette créance ?")) {
                try {
                    await axios.put(`${API_BASE_URL}/debts/${debtId}/settle`, { userId: CURRENT_USER_ID });
                    showNotification("Créance réglée avec succès.");
                    fetchAndRenderDebts();
                } catch (error) {
                    showNotification("Erreur lors du règlement de la créance.", "danger");
                }
            }
        }
    });

    document.getElementById('addDebtModal').addEventListener('hidden.bs.modal', () => {
        debtForm.reset();
        debtIdInput.value = '';
        addDebtModalLabel.textContent = "Ajouter une créance";
        debtSubmitBtn.textContent = "Ajouter";
    });

    // --- Initialisation de la page ---
    const today = new Date().toISOString().slice(0, 10);
    startDateFilter.value = today;
    endDateFilter.value = today;
    
    await fetchShops();
    fetchAndRenderDebts();

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

    const currentPath = window.location.pathname.split('/').pop();
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) link.classList.add('active');
    });
});