const API_BASE_URL = 'http://localhost:3000';
const sidebar = document.getElementById('sidebar');
const usersTableBody = document.getElementById('usersTableBody');
const searchInput = document.getElementById('searchInput');
// Modale principale
const userForm = document.getElementById('userForm');
const addUserModal = new bootstrap.Modal(document.getElementById('addUserModal'));
const addUserModalLabel = document.getElementById('addUserModalLabel');
const formSubmitBtn = document.getElementById('formSubmitBtn');
const userRoleSelect = document.getElementById('userRole');
const userStatusSelect = document.getElementById('userStatus');
const userStatusContainer = document.getElementById('userStatusContainer');
const pinFieldContainer = document.getElementById('pin-field-container');
const userPinInput = document.getElementById('userPin');
// Modale PIN
const changePinBtn = document.getElementById('changePinBtn');
const changePinModal = new bootstrap.Modal(document.getElementById('changePinModal'));
const changePinForm = document.getElementById('changePinForm');

let isEditMode = false;
let currentUserId = null;

const formatDate = (dateString) => new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const fetchAndRenderUsers = async () => {
    try {
        const searchQuery = searchInput.value;
        const params = new URLSearchParams();
        if (searchQuery) params.append('search', searchQuery);

        const response = await axios.get(`${API_BASE_URL}/users?${params.toString()}`);
        const users = response.data;
        usersTableBody.innerHTML = '';

        if (!Array.isArray(users) || users.length === 0) {
            usersTableBody.innerHTML = '<tr><td colspan="5" class="text-center p-3">Aucun utilisateur trouvé.</td></tr>';
            return;
        }

        users.forEach(user => {
            const row = document.createElement('tr');
            row.className = user.status === 'inactif' ? 'inactive-row' : '';
            const displayRole = user.role === 'admin' ? 'Administrateur' : 'Livreur';
            const statusClass = user.status === 'actif' ? 'status-actif' : 'status-inactif';
            const statusText = user.status.charAt(0).toUpperCase() + user.status.slice(1);

            const toggleStatusBtn = user.status === 'actif'
                ? `<button class="btn btn-sm btn-outline-warning status-btn" data-id="${user.id}" data-status="inactif" title="Désactiver"><i class="bi bi-toggle-off"></i></button>`
                : `<button class="btn btn-sm btn-outline-success status-btn" data-id="${user.id}" data-status="actif" title="Activer"><i class="bi bi-toggle-on"></i></button>`;

            row.innerHTML = `
                <td data-bs-toggle="tooltip" data-bs-placement="top" title="${user.phone_number}"><strong>${user.name}</strong></td>
                <td>${displayRole}</td>
                <td class="${statusClass}"><span class="status-dot"></span><span class="status-text">${statusText}</span></td>
                <td>${formatDate(user.created_at)}</td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${user.id}" title="Modifier"><i class="bi bi-pencil-square"></i></button>
                        ${toggleStatusBtn}
                    </div>
                </td>`;
            usersTableBody.appendChild(row);
        });

        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });

    } catch (error) { console.error("Erreur (fetchUsers):", error); }
};

searchInput.addEventListener('input', fetchAndRenderUsers);

userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userData = {
        name: document.getElementById('userName').value,
        phone_number: document.getElementById('userPhone').value,
        role: userRoleSelect.value,
        status: userStatusSelect.value
    };
    try {
        if (isEditMode) {
            await axios.put(`${API_BASE_URL}/users/${currentUserId}`, userData);
        } else {
            userData.pin = userPinInput.value;
            await axios.post(`${API_BASE_URL}/users`, userData);
        }
        addUserModal.hide();
        fetchAndRenderUsers();
    } catch (error) { alert(error.response?.data?.message || "Erreur."); }
});

usersTableBody.addEventListener('click', async (e) => {
    const target = e.target.closest('button');
    if (!target) return;
    const userId = target.dataset.id;

    if (target.classList.contains('edit-btn')) {
        const response = await axios.get(`${API_BASE_URL}/users/${userId}`);
        const user = response.data;
        isEditMode = true;
        currentUserId = userId;
        addUserModalLabel.textContent = "Modifier l'utilisateur";
        formSubmitBtn.textContent = 'Sauvegarder';
        document.getElementById('userName').value = user.name;
        document.getElementById('userPhone').value = user.phone_number;
        userRoleSelect.value = user.role;
        userStatusSelect.value = user.status;
        pinFieldContainer.style.display = 'none';
        userPinInput.removeAttribute('required');
        userStatusContainer.style.display = 'block';
        changePinBtn.style.display = 'block';
        addUserModal.show();
    } else if (target.classList.contains('status-btn')) {
        const newStatus = target.dataset.status;
        const actionText = newStatus === 'inactif' ? 'désactiver' : 'activer';
        if (confirm(`Voulez-vous vraiment ${actionText} cet utilisateur ?`)) {
            await axios.put(`${API_BASE_URL}/users/${userId}/status`, { status: newStatus });
            fetchAndRenderUsers();
        }
    }
});

changePinBtn.addEventListener('click', () => { changePinModal.show(); });
changePinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPin = document.getElementById('newPin').value;
    try {
        await axios.put(`${API_BASE_URL}/users/${currentUserId}/pin`, { pin: newPin });
        alert('PIN mis à jour !');
        changePinModal.hide();
        addUserModal.hide();
    } catch (error) { alert(error.response?.data?.message || "Erreur."); }
});

document.getElementById('addUserModal').addEventListener('hidden.bs.modal', () => {
    userForm.reset();
    isEditMode = false;
    currentUserId = null;
    addUserModalLabel.textContent = 'Ajouter un utilisateur';
    formSubmitBtn.textContent = "Ajouter";
    pinFieldContainer.style.display = 'block';
    userPinInput.setAttribute('required', 'required');
    userStatusContainer.style.display = 'none';
    changePinBtn.style.display = 'none';
});

document.addEventListener('DOMContentLoaded', () => {
    const toggler = document.getElementById('sidebar-toggler');
    const mainContent = document.getElementById('main-content');
    if (toggler) {
        toggler.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn) logoutBtn.addEventListener('click', () => { window.location.href = 'index.html'; });

    userRoleSelect.innerHTML = `<option value="admin">Administrateur</option><option value="livreur">Livreur</option>`;

    const currentPath = window.location.pathname.split('/').pop();
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) link.classList.add('active');
    });
    fetchAndRenderUsers();
});