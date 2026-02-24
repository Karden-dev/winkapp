// public/js/users.js
document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const API_BASE_URL = '/api';
    const CURRENT_USER_ID = AuthManager.getUserId(); // Récupérer l'ID utilisateur connecté

    // --- RÉFÉRENCES DOM ---
    const usersTableBody = document.getElementById('usersTableBody');
    const userModalEl = document.getElementById('addUserModal');
    const userModal = new bootstrap.Modal(userModalEl);
    const changePinModal = new bootstrap.Modal(document.getElementById('changePinModal'));
    
    const userForm = document.getElementById('userForm');
    const userIdInput = document.getElementById('userId');
    const userNameInput = document.getElementById('userName');
    const userPhoneInput = document.getElementById('userPhone');
    const userRoleSelect = document.getElementById('userRole');
    const userStatusSelect = document.getElementById('userStatus');
    const userStatusContainer = document.getElementById('userStatusContainer');
    const userPinInput = document.getElementById('userPin');
    const pinFieldContainer = document.getElementById('pin-field-container');
    const formSubmitBtn = document.getElementById('formSubmitBtn');
    const changePinBtn = document.getElementById('changePinBtn');
    const changePinForm = document.getElementById('changePinForm');
    const newPinInput = document.getElementById('newPin');
    const searchInput = document.getElementById('searchInput');

    // --- ÉTAT LOCAL ---
    let allUsers = [];
    let isEditMode = false;
    let currentUserId = null;


    // --- FONCTIONS UTILITAIRES ---
    
    const showNotification = (message, type = 'success') => {
        const container = document.body;
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show fixed-top m-3`;
        alertDiv.role = 'alert';
        alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alertDiv);
        
        setTimeout(() => {
            const instance = bootstrap.Alert.getOrCreateInstance(alertDiv);
            if (instance) instance.close();
            else alertDiv.remove();
        }, 5000);
    };

    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const getRoleTranslation = (role) => {
        switch(role) {
            case 'admin': return 'Administrateur';
            case 'livreur': return 'Livreur';
            default: return role;
        }
    };
    
    const getAuthHeader = () => {
        const token = AuthManager.getToken();
        return token ? { 'Authorization': `Bearer ${token}` } : null;
    };


    // --- FONCTIONS PRINCIPALES ---

    const fetchUsers = async () => {
        usersTableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4"><div class="spinner-border text-primary" role="status"></div></td></tr>';
        const headers = getAuthHeader();
        if (!headers) return;

        try {
            const params = { search: searchInput.value };
            const response = await axios.get(`${API_BASE_URL}/users`, { params, headers });
            allUsers = response.data;
            renderTable(allUsers);
        } catch (error) {
            console.error("Erreur lors de la récupération des utilisateurs:", error);
            usersTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger p-4">Erreur lors du chargement des données.</td></tr>';
            if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
        }
    };

    const renderTable = (users) => {
        usersTableBody.innerHTML = '';
        if (users.length === 0) {
            usersTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4">Aucun utilisateur trouvé.</td></tr>`;
            return;
        }

        users.forEach(user => {
            const row = document.createElement('tr');
            const isActive = user.status === 'actif';
            const statusClass = isActive ? 'status-actif' : 'status-inactif';
            const statusText = isActive ? 'Actif' : 'Inactif';
            
            row.className = isActive ? '' : 'inactive-row';

            const disableEdit = user.id === CURRENT_USER_ID;

            row.innerHTML = `
                <td>${user.name}</td>
                <td>${getRoleTranslation(user.role)}</td>
                <td class="${statusClass}"><span class="status-dot"></span><span class="status-text">${statusText}</span></td>
                <td>${user.created_at ? formatDate(user.created_at) : 'N/A'}</td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${user.id}" title="Modifier" ${disableEdit ? 'disabled' : ''}><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-warning pin-btn" data-id="${user.id}" title="Changer le code PIN" ${disableEdit ? 'disabled' : ''}><i class="bi bi-key"></i></button>
                        <button class="btn btn-sm btn-outline-${isActive ? 'danger' : 'success'} status-toggle-btn" data-id="${user.id}" data-status="${isActive ? 'inactif' : 'actif'}" title="${isActive ? 'Désactiver' : 'Activer'}" ${disableEdit ? 'disabled' : ''}><i class="bi bi-power"></i></button>
                        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${user.id}" title="Supprimer" ${disableEdit ? 'disabled' : ''}><i class="bi bi-trash"></i></button>
                    </div>
                </td>`;
            usersTableBody.appendChild(row);
        });
    };

    // --- GESTION DES ÉVÉNEMENTS ---

    const handleUserFormSubmit = async (e) => {
        e.preventDefault();
        
        // Données communes aux deux modes
        const commonData = {
            name: userNameInput.value,
            phone_number: userPhoneInput.value,
            role: userRoleSelect.value,
        };

        const headers = getAuthHeader();
        if (!headers) return;

        try {
            if (isEditMode) {
                // Mode Modification : Ajout du statut qui est requis par le backend en PUT
                const updateData = {
                    ...commonData,
                    status: userStatusSelect.value
                };
                await axios.put(`${API_BASE_URL}/users/${currentUserId}`, updateData, { headers });
                showNotification("Utilisateur modifié avec succès !");
            } else {
                // Mode Création
                const pin = userPinInput.value;
                if (!pin || pin.length !== 4) {
                    return showNotification("Le code PIN doit comporter 4 chiffres.", "warning");
                }
                
                // --- CORRECTION : Création de l'objet de données pour n'envoyer que le nécessaire ---
                const createData = {
                    ...commonData,
                    pin: pin 
                    // 'status' n'est pas inclus car il est géré par défaut à 'actif' dans le modèle MySQL
                }; 
                
                await axios.post(`${API_BASE_URL}/users`, createData, { headers });
                showNotification("Utilisateur créé avec succès !");
            }
            userModal.hide();
            fetchUsers();
        } catch (error) {
            // Le message d'erreur sera maintenant précis (doublon, validation PIN, etc.)
            showNotification(error.response?.data?.message || "Une erreur est survenue lors de l'enregistrement.", "danger");
             if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
        }
    };

    const handleChangePinSubmit = async (e) => {
        e.preventDefault();
        const newPin = newPinInput.value;

        if (!newPin || newPin.length !== 4) {
            return showNotification("Le nouveau PIN doit comporter 4 chiffres.", "warning");
        }

        const headers = getAuthHeader();
        if (!headers) return;

        try {
            await axios.put(`${API_BASE_URL}/users/${currentUserId}/pin`, { pin: newPin }, { headers });
            showNotification("Code PIN mis à jour avec succès !");
            changePinModal.hide();
        } catch (error) {
            showNotification(error.response?.data?.message || "Erreur lors de la mise à jour du PIN.", "danger");
             if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
        }
    };


    const handleTableActions = async (e) => {
        const target = e.target.closest('button');
        if (!target || target.disabled) return;
        const userId = target.dataset.id;
        const headers = getAuthHeader();
        if (!headers) return;

        if (target.classList.contains('edit-btn')) {
            try {
                const response = await axios.get(`${API_BASE_URL}/users/${userId}`, { headers });
                const user = response.data;
                isEditMode = true;
                currentUserId = user.id;
                
                document.getElementById('addUserModalLabel').textContent = 'Modifier l\'utilisateur';
                formSubmitBtn.textContent = 'Sauvegarder';
                changePinBtn.style.display = 'inline-block';
                pinFieldContainer.style.display = 'none';
                userStatusContainer.style.display = 'block';

                userNameInput.value = user.name;
                userPhoneInput.value = user.phone_number;
                userRoleSelect.value = user.role;
                userStatusSelect.value = user.status;
                
                userModal.show();
            } catch (error) {
                showNotification("Erreur lors du chargement des données de l'utilisateur.", "danger");
                 if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
            }

        } else if (target.classList.contains('pin-btn')) {
            currentUserId = userId;
            newPinInput.value = '';
            changePinModal.show();

        } else if (target.classList.contains('status-toggle-btn')) {
            const newStatus = target.dataset.status;
            const actionVerb = newStatus === 'inactif' ? 'désactiver' : 'activer';
            if (confirm(`Voulez-vous vraiment ${actionVerb} cet utilisateur ?`)) {
                try {
                    await axios.put(`${API_BASE_URL}/users/${userId}/status`, { status: newStatus }, { headers });
                    showNotification(`Utilisateur ${actionVerb} avec succès.`);
                    fetchUsers();
                } catch (error) {
                     showNotification("Erreur lors du changement de statut.", "danger");
                      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
                }
            }
        } else if (target.classList.contains('delete-btn')) {
             if (confirm("Voulez-vous vraiment supprimer cet utilisateur ? Cette action est irréversible.")) {
                 try {
                     await axios.delete(`${API_BASE_URL}/users/${userId}`, { headers });
                     showNotification("Utilisateur supprimé avec succès.");
                     fetchUsers();
                 } catch (error) {
                     showNotification(error.response?.data?.message || "Erreur lors de la suppression.", "danger");
                      if (error.response?.status === 401 || error.response?.status === 403) AuthManager.logout();
                 }
             }
        }
    };


    // --- INITIALISATION ---

    const initializePage = () => {
        // Remplir la sélection de rôle
        userRoleSelect.innerHTML = `
            <option value="admin">${getRoleTranslation('admin')}</option>
            <option value="livreur">${getRoleTranslation('livreur')}</option>
        `;
        
        // Écouteurs de formulaire et d'actions
        userForm.addEventListener('submit', handleUserFormSubmit);
        changePinForm.addEventListener('submit', handleChangePinSubmit);
        usersTableBody.addEventListener('click', handleTableActions);
        searchInput.addEventListener('input', fetchUsers);
        
        // Réinitialisation de la modale à la fermeture
        userModalEl.addEventListener('hidden.bs.modal', () => {
            userForm.reset();
            isEditMode = false;
            currentUserId = null;
            document.getElementById('addUserModalLabel').textContent = 'Ajouter un utilisateur';
            formSubmitBtn.textContent = 'Ajouter';
            changePinBtn.style.display = 'none';
            pinFieldContainer.style.display = 'block';
            userStatusContainer.style.display = 'none';
        });
        
        // Bouton pour ouvrir la modale de PIN depuis la modale d'édition
        changePinBtn.addEventListener('click', (e) => {
            e.preventDefault();
            userModal.hide();
            newPinInput.value = '';
            changePinModal.show();
        });

        // Toggle Sidebar & Logout
        document.getElementById('sidebar-toggler')?.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('main-content');
            if (window.innerWidth < 992) {
                sidebar?.classList.toggle('show');
            } else {
                sidebar?.classList.toggle('collapsed');
                mainContent?.classList.toggle('expanded');
            }
        });
        document.getElementById('logoutBtn')?.addEventListener('click', () => AuthManager.logout());

        fetchUsers();
    };
    
    initializePage();
});