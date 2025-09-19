// public/js/shops.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:3000';

    // --- Configuration d'Axios pour l'Authentification ---
    const token = localStorage.getItem('winkToken') || sessionStorage.getItem('winkToken');
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    const axiosInstance = axios.create({
        baseURL: API_BASE_URL,
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const currentUser = JSON.parse(localStorage.getItem('winkUser') || sessionStorage.getItem('winkUser'));
    const CURRENT_USER_ID = currentUser ? currentUser.id : null;


    // --- DOM Elements ---
    const shopsTableBody = document.getElementById('shopsTableBody');
    const shopModal = new bootstrap.Modal(document.getElementById('shopModal'));
    const detailsModal = new bootstrap.Modal(document.getElementById('detailsModal'));
    const shopForm = document.getElementById('shopForm');
    const searchInput = document.getElementById('searchInput');

    let isEditMode = false;
    let currentShopId = null;

    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

    const fetchData = async () => {
        try {
            // Fetch stats
            const statsResponse = await axiosInstance.get('/shops/stats');
            document.getElementById('totalShops').textContent = statsResponse.data.total || 0;
            document.getElementById('activeShops').textContent = statsResponse.data.active || 0;
            document.getElementById('inactiveShops').textContent = statsResponse.data.inactive || 0;

            // Fetch shops list
            const statusFilter = document.querySelector('input[name="statusFilter"]:checked').value;
            const searchQuery = searchInput.value;
            
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            if (searchQuery) params.append('search', searchQuery);

            const response = await axiosInstance.get(`/shops?${params.toString()}`);
            renderTable(response.data);
        } catch (error) {
            console.error("Erreur lors de la récupération des données:", error);
            if(error.response && error.response.status === 403) {
                window.location.href = 'index.html';
            }
            alert("Impossible de charger les données des marchands.");
        }
    };

    const renderTable = (shops) => {
        shopsTableBody.innerHTML = '';
        if (shops.length === 0) {
            shopsTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-4">Aucun marchand ne correspond à votre recherche.</td></tr>`;
            return;
        }
        shops.forEach(shop => {
            const row = document.createElement('tr');
            row.className = shop.status === 'inactif' ? 'inactive-row' : '';

            const statusClass = shop.status === 'actif' ? 'active' : 'inactive';
            const statusText = shop.status === 'actif' ? 'Actif' : 'Inactif';
            const statusDisplay = `<span class="status-dot ${statusClass}"></span> ${statusText}`;

            const packagingIcon = shop.bill_packaging ? '<i class="bi bi-check-circle-fill billing-icon active"></i>' : '<i class="bi bi-x-circle-fill billing-icon inactive"></i>';
            const storageIcon = shop.bill_storage ? '<i class="bi bi-check-circle-fill billing-icon active"></i>' : '<i class="bi bi-x-circle-fill billing-icon inactive"></i>';

            const toggleStatusBtn = shop.status === 'actif'
                ? `<button class="btn btn-sm btn-outline-warning status-btn" data-id="${shop.id}" data-status="inactif" title="Désactiver"><i class="bi bi-toggle-on"></i></button>`
                : `<button class="btn btn-sm btn-outline-success status-btn" data-id="${shop.id}" data-status="actif" title="Activer"><i class="bi bi-toggle-off"></i></button>`;

            row.innerHTML = `
                <td>${shop.name}</td>
                <td>${shop.phone_number}</td>
                <td class="text-center">${packagingIcon}</td>
                <td class="text-center">${storageIcon}</td>
                <td class="text-center">${statusDisplay}</td>
                <td class="text-center">
                    <div class="d-flex justify-content-center gap-2">
                        <button class="btn btn-sm btn-outline-info details-btn" data-id="${shop.id}" title="Détails"><i class="bi bi-eye"></i></button>
                        <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${shop.id}" title="Modifier"><i class="bi bi-pencil"></i></button>
                        ${toggleStatusBtn}
                    </div>
                </td>`;
            shopsTableBody.appendChild(row);
        });
    };

    // --- Event Listeners ---
    shopForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const shopData = {
            name: document.getElementById('shopName').value,
            phone_number: document.getElementById('shopPhone').value,
            bill_packaging: document.getElementById('billPackaging').checked,
            bill_storage: document.getElementById('billStorage').checked,
            packaging_price: parseFloat(document.getElementById('packagingPrice').value),
            storage_price: parseFloat(document.getElementById('storagePrice').value),
            created_by: CURRENT_USER_ID
        };
        try {
            if (isEditMode) {
                await axiosInstance.put(`/shops/${currentShopId}`, shopData);
            } else {
                await axiosInstance.post('/shops', shopData);
            }
            shopModal.hide();
            fetchData();
        } catch (error) {
            alert(error.response?.data?.message || "Une erreur est survenue.");
        }
    });

    shopsTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const shopId = target.dataset.id;

        if (target.classList.contains('edit-btn')) {
            const response = await axiosInstance.get(`/shops/${shopId}`);
            const shop = response.data;
            isEditMode = true;
            currentShopId = shop.id;
            document.getElementById('shopModalLabel').textContent = 'Modifier le marchand';
            document.getElementById('shopSubmitBtn').textContent = 'Sauvegarder';
            document.getElementById('shopName').value = shop.name;
            document.getElementById('shopPhone').value = shop.phone_number;
            document.getElementById('billPackaging').checked = shop.bill_packaging;
            document.getElementById('billStorage').checked = shop.bill_storage;
            document.getElementById('packagingPrice').value = shop.packaging_price;
            document.getElementById('storagePrice').value = shop.storage_price;
            shopModal.show();
        } else if (target.classList.contains('status-btn')) {
            const newStatus = target.dataset.status;
            const actionVerb = newStatus === 'inactif' ? 'désactiver' : 'activer';
            if (confirm(`Voulez-vous vraiment ${actionVerb} ce marchand ?`)) {
                await axiosInstance.put(`/shops/${shopId}/status`, { status: newStatus });
                fetchData();
            }
        } else if (target.classList.contains('details-btn')) {
            const response = await axiosInstance.get(`/shops/${shopId}`);
            const shop = response.data;
            document.getElementById('detailsModalBody').innerHTML = `
                <p><strong>Nom:</strong> ${shop.name}</p>
                <p><strong>Téléphone:</strong> ${shop.phone_number}</p>
                <hr>
                <p><strong>Statut:</strong> <span class="status-dot ${shop.status === 'actif' ? 'active' : 'inactive'}"></span> ${shop.status === 'actif' ? 'Actif' : 'Inactif'}</p>
                <p><strong>Créé le:</strong> ${formatDate(shop.created_at)}</p>
                <p><strong>Créé par:</strong> ${shop.creator_name || 'N/A'}</p>
                <hr>
                <p><strong>Facturation Emballage:</strong> ${shop.bill_packaging ? `Oui (${shop.packaging_price} FCFA)` : 'Non'}</p>
                <p><strong>Facturation Stockage:</strong> ${shop.bill_storage ? `Oui (${shop.storage_price} FCFA/jour)` : 'Non'}</p>
            `;
            detailsModal.show();
        }
    });

    document.querySelectorAll('input[name="statusFilter"]').forEach(radio => radio.addEventListener('change', fetchData));
    searchInput.addEventListener('input', fetchData);

    document.getElementById('shopModal').addEventListener('hidden.bs.modal', () => {
        shopForm.reset();
        isEditMode = false;
        currentShopId = null;
        document.getElementById('shopModalLabel').textContent = 'Ajouter un nouveau marchand';
        document.getElementById('shopSubmitBtn').textContent = 'Ajouter';
        document.getElementById('packagingPrice').value = 50;
        document.getElementById('storagePrice').value = 100;
    });

    // --- Initialisation ---
    if (currentUser) {
        document.querySelector('.header-actions span').textContent = currentUser.name;
    }
    
    document.getElementById('sidebar-toggler').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        document.getElementById('main-content').classList.toggle('expanded');
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('winkToken');
        localStorage.removeItem('winkUser');
        sessionStorage.removeItem('winkToken');
        sessionStorage.removeItem('winkUser');
        window.location.href = 'index.html';
    });
    
    const currentPath = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) link.classList.add('active');
    });

    fetchData();
});