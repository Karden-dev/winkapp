document.addEventListener('DOMContentLoaded', async () => {
    const API_BASE_URL = '/api';
    // --- RÉFÉRENCES DOM ---
    const reportDateInput = document.getElementById('reportDate');
    const searchMerchantInput = document.getElementById('searchMerchantInput');
    const reportsTableBody = document.getElementById('reportsTableBody');
    const totalRemittanceAmount = document.getElementById('totalRemittanceAmount');
    const totalPackagingAmount = document.getElementById('totalPackagingAmount');
    const totalStorageAmount = document.getElementById('totalStorageAmount');
    const totalDebtAmount = document.getElementById('totalDebtAmount');
    const totalActiveMerchants = document.getElementById('totalActiveMerchants');
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    const paginationInfo = document.getElementById('paginationInfo');
    const firstPageBtn = document.getElementById('firstPage');
    const prevPageBtn = document.getElementById('prevPage');
    const currentPageDisplay = document.getElementById('currentPageDisplay');
    const nextPageBtn = document.getElementById('nextPage');
    const lastPageBtn = document.getElementById('lastPage');
    const sidebarToggler = document.getElementById('sidebar-toggler');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const logoutBtn = document.getElementById('logoutBtn');
    const processStorageBtn = document.getElementById('processStorageBtn');
    const recalculateBtn = document.getElementById('recalculateBtn'); // Bouton Recalcul Global
    
    // Références pour le Recalcul Global
    const recalculateConfirmModalEl = document.getElementById('recalculateConfirmModal');
    const recalculateConfirmModal = recalculateConfirmModalEl ? new bootstrap.Modal(recalculateConfirmModalEl) : null;
    const confirmRecalculateBtn = document.getElementById('confirmRecalculateBtn');

    // --- AJOUTS POUR LA RECONSTITUTION CIBLÉE (REPARATION MARCHAND) ---
    const reconstituteMerchantBtn = document.getElementById('reconstituteMerchantBtn');
    const reconstituteMerchantModalEl = document.getElementById('reconstituteMerchantModal');
    const reconstituteMerchantModal = reconstituteMerchantModalEl ? new bootstrap.Modal(reconstituteMerchantModalEl) : null;
    const confirmReconstituteBtn = document.getElementById('confirmReconstituteBtn');
    const reconstituteShopSelect = document.getElementById('reconstituteShopSelect');
    const reconstituteDateInput = document.getElementById('reconstituteDateInput');
    
    // --- Caches de données et état ---
    let allReports = [];
    let filteredReports = [];
    let currentPage = 1;
    let itemsPerPage = 10;
    let shopsCache = null; // Cache pour ne pas recharger les boutiques à chaque fois

    // --- Fonctions utilitaires ---
    const showNotification = (message, type = 'success') => {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alert);
        
        setTimeout(() => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            if (bsAlert) bsAlert.close();
        }, 10000); // Durée un peu plus longue pour lire les warnings
    };

    const formatAmount = (amount) => `${parseFloat(amount || 0).toLocaleString('fr-FR')} FCFA`;
    
    const showLoading = (element) => {
        element.innerHTML = '<tr><td colspan="11" class="text-center p-4"><div class="spinner-border text-corail" role="status"><span class="visually-hidden">Chargement...</span></div></td></tr>';
    };

    // --- FONCTIONS PRINCIPALES ---

    const fetchReports = async (date) => {
        if (!date) {
            reportsTableBody.innerHTML = '<tr><td colspan="11" class="text-center">Veuillez sélectionner une date pour afficher les rapports.</td></tr>';
            updateGlobalTotals([]);
            return;
        }
        try {
            showLoading(reportsTableBody);
            const res = await axios.get(`${API_BASE_URL}/reports`, { params: { date } });
            allReports = res.data; 
            applyFiltersAndRender();
        } catch (error) {
            reportsTableBody.innerHTML = '<tr><td colspan="11" class="text-center text-danger">Erreur lors du chargement des rapports.</td></tr>';
            showNotification("Erreur lors du chargement des rapports.", 'danger');
        }
    };

    const applyFiltersAndRender = () => {
        const searchTerm = searchMerchantInput.value.toLowerCase();
        
        updateGlobalTotals(allReports);

        filteredReports = allReports.filter(report => 
            report.total_orders_delivered > 0 &&
            report.shop_name.toLowerCase().includes(searchTerm)
        );
        
        filteredReports.sort((a, b) => a.shop_name.localeCompare(b.shop_name));

        currentPage = 1;
        renderReportsTable(filteredReports);
        updatePaginationInfo(filteredReports.length);
    };

    const renderReportsTable = (reports) => {
        reportsTableBody.innerHTML = '';
        if (reports.length === 0) {
            reportsTableBody.innerHTML = '<tr><td colspan="11" class="text-center">Aucun rapport trouvé pour les filtres actuels.</td></tr>';
            return;
        }
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const reportsToRender = reports.slice(startIndex, endIndex);
        
        reportsToRender.forEach((report, index) => {
            const row = document.createElement('tr');
            const rank = startIndex + index + 1;
            const amountToRemitClass = report.amount_to_remit < 0 ? 'text-danger fw-bold' : 'text-success fw-bold';
            
            const expeditionFeeDisplay = formatAmount(report.total_expedition_fees || 0);

            // Style du bouton de copie
            const storageKey = `copied-report-${reportDateInput.value}-${report.shop_id}`;
            const isCopied = sessionStorage.getItem(storageKey);
            const buttonClass = isCopied ? 'btn-success' : 'btn-info';
            const buttonIcon = isCopied ? 'bi-clipboard-check' : 'bi-clipboard';
            const buttonTitle = isCopied ? 'Rapport déjà copié' : 'Copier le rapport détaillé';

            row.innerHTML = `
                <td>${rank}.</td>
                <td>${report.shop_name}</td>
                <td>${report.total_orders_sent || 0}</td>
                <td>${report.total_orders_delivered || 0}</td>
                <td class="text-end">${formatAmount(report.total_revenue_articles)}</td>
                <td class="text-end">${formatAmount(report.total_delivery_fees)}</td>
                <td class="text-end">${expeditionFeeDisplay}</td>
                <td class="text-end">${formatAmount(report.total_packaging_fees)}</td>
                <td class="text-end">${formatAmount(report.total_storage_fees)}</td>
                <td class="text-end ${amountToRemitClass}">${formatAmount(report.amount_to_remit)}</td>
                <td>
                    <button class="btn btn-sm ${buttonClass} copy-report-btn" data-shop-id="${report.shop_id}" title="${buttonTitle}">
                        <i class="bi ${buttonIcon}"></i>
                    </button>
                </td>`;
            reportsTableBody.appendChild(row);
        });
    };

    const updateGlobalTotals = (reports) => {
        let totalRemit = 0, totalDebt = 0, totalPackaging = 0, totalStorage = 0, activeMerchantsCount = 0;
        reports.forEach(report => {
            if (report.total_orders_sent > 0) activeMerchantsCount++;
            totalPackaging += parseFloat(report.total_packaging_fees || 0);
            totalStorage += parseFloat(report.total_storage_fees || 0);
            
            const amountToRemit = parseFloat(report.amount_to_remit || 0);
            if (amountToRemit > 0) {
                totalRemit += amountToRemit;
            } else if (amountToRemit < 0) {
                totalDebt += Math.abs(amountToRemit);
            }
        });
        totalActiveMerchants.textContent = activeMerchantsCount;
        totalRemittanceAmount.textContent = formatAmount(totalRemit);
        totalDebtAmount.textContent = formatAmount(totalDebt);
        totalPackagingAmount.textContent = formatAmount(totalPackaging);
        totalStorageAmount.textContent = formatAmount(totalStorage);
    };

    const updatePaginationControls = () => {
        const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
        currentPageDisplay.textContent = currentPage;
        firstPageBtn.classList.toggle('disabled', currentPage === 1);
        prevPageBtn.classList.toggle('disabled', currentPage === 1);
        nextPageBtn.classList.toggle('disabled', currentPage === totalPages || totalPages === 0);
        lastPageBtn.classList.toggle('disabled', currentPage === totalPages || totalPages === 0);
    };

    const updatePaginationInfo = (totalItems) => {
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        if (paginationInfo) paginationInfo.textContent = `Page ${currentPage} sur ${totalPages} (${totalItems} marchands)`;
        updatePaginationControls();
    };

    const handlePageChange = (newPage) => {
        const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
        if (newPage < 1 || newPage > totalPages) return;
        currentPage = newPage;
        renderReportsTable(filteredReports);
        updatePaginationInfo(filteredReports.length);
    };

    // --- Fonction pour charger les boutiques (pour la reconstitution) ---
    const loadShopsForSelect = async () => {
        if (shopsCache) return; // Utiliser le cache si disponible
        
        try {
            const res = await axios.get(`${API_BASE_URL}/shops`);
            shopsCache = res.data;
            
            reconstituteShopSelect.innerHTML = '<option value="">Sélectionner un marchand...</option>';
            
            // Tri alphabétique
            shopsCache.sort((a, b) => a.name.localeCompare(b.name));
            
            shopsCache.forEach(shop => {
                const option = document.createElement('option');
                option.value = shop.id;
                option.textContent = shop.name; // Affiche juste le nom
                reconstituteShopSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Erreur chargement boutiques:", error);
            showNotification("Impossible de charger la liste des marchands.", "danger");
        }
    };

    // --- Événements et Initialisation ---

    firstPageBtn?.addEventListener('click', (e) => { e.preventDefault(); handlePageChange(1); });
    prevPageBtn?.addEventListener('click', (e) => { e.preventDefault(); handlePageChange(currentPage - 1); });
    nextPageBtn?.addEventListener('click', (e) => { e.preventDefault(); handlePageChange(currentPage + 1); });
    lastPageBtn?.addEventListener('click', (e) => { e.preventDefault(); handlePageChange(Math.ceil(filteredReports.length / itemsPerPage)); });
    itemsPerPageSelect?.addEventListener('change', (e) => { itemsPerPage = parseInt(e.target.value); applyFiltersAndRender(); });
    reportDateInput?.addEventListener('change', () => fetchReports(reportDateInput.value));
    searchMerchantInput?.addEventListener('input', applyFiltersAndRender);

    // Clic sur "Copier rapport"
    reportsTableBody?.addEventListener('click', async (e) => {
        const button = e.target.closest('.copy-report-btn');
        if (!button) return;
        
        const shopId = button.dataset.shopId;
        const reportDate = reportDateInput.value;
        if (!reportDate || !shopId) return showNotification('Impossible de générer le rapport sans date ou marchand.', 'warning');
        
        button.disabled = true;
        
        try {
            const res = await axios.get(`${API_BASE_URL}/reports/detailed`, { params: { date: reportDate, shopId } });
            const reportDetails = res.data;
            const formattedDate = new Date(reportDate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            let reportContent = `*Rapport du :* ${formattedDate}\n`;
            reportContent += `*Magasin :* ${reportDetails.shop_name}\n\n`;
            reportContent += `*--- DETAIL DES LIVRAISONS ---*\n\n`;

            if (reportDetails.orders && reportDetails.orders.length > 0) {
                reportDetails.orders.forEach((order, index) => {
                    const productsList = order.products_list || 'Produit non spécifié';
                    const clientPhoneFormatted = order.customer_phone ? order.customer_phone.substring(0, 6) + '***' : 'N/A';
                    reportContent += `*${index + 1})* Produit(s) : ${productsList}\n`;
                    reportContent += `   Quartier : ${order.delivery_location}\n`;
                    reportContent += `   Client : ${clientPhoneFormatted}\n`;
                    const amountToDisplay = order.status === 'failed_delivery' ? parseFloat(order.amount_received || 0) : order.article_amount;
                    reportContent += `   Montant perçu : ${formatAmount(amountToDisplay)}\n`;
                    reportContent += `   Frais de livraison : ${formatAmount(order.delivery_fee)}\n`;
                    if (order.status === 'failed_delivery') {
                       reportContent += `   *Statut :* Livraison ratée\n`;
                    }
                    reportContent += "\n";
                });
            } else {
                reportContent += "Aucune livraison enregistrée pour cette journée.\n\n";
            }

            reportContent += `*--- RÉSUMÉ FINANCIER ---*\n`;
            reportContent += `*Total encaissement (Cash/Raté) :* ${formatAmount(reportDetails.total_revenue_articles)}\n`;

            if (parseFloat(reportDetails.total_delivery_fees || 0) > 0) {
                reportContent += `*Total Frais de livraison :* ${formatAmount(reportDetails.total_delivery_fees)}\n`;
            }
            if (parseFloat(reportDetails.total_packaging_fees || 0) > 0) {
                reportContent += `*Total Frais d'emballage :* ${formatAmount(reportDetails.total_packaging_fees)}\n`;
            }

            // --- MISE À JOUR : Calcul automatique des jours de stockage ---
            if (parseFloat(reportDetails.total_storage_fees || 0) > 0) {
                let storageLabel = '*Total Frais de stockage :*';
                
                // Si le backend nous a envoyé le prix unitaire, on calcule le nombre de jours
                if (reportDetails.storage_price && reportDetails.storage_price > 0) {
                    const days = Math.round(reportDetails.total_storage_fees / reportDetails.storage_price);
                    // On précise le nombre de jours entre parenthèses
                    storageLabel = `*Total Frais de stockage (${days} jrs) :*`;
                }
                
                reportContent += `${storageLabel} ${formatAmount(reportDetails.total_storage_fees)}\n`;
            }
            // -------------------------------------------------------------

            if (parseFloat(reportDetails.total_expedition_fees || 0) > 0) {
                reportContent += `*Total Frais d'expédition :* ${formatAmount(reportDetails.total_expedition_fees)}\n`;
            }
            if (parseFloat(reportDetails.previous_debts || 0) > 0) {
                reportContent += `*Créances antérieures :* ${formatAmount(reportDetails.previous_debts)}\n`;
            }

            reportContent += `\n*MONTANT NET À VERSER :* ${formatAmount(reportDetails.amount_to_remit)}\n`;
            
            await navigator.clipboard.writeText(reportContent);

            // Mise à jour visuelle du bouton
            const storageKey = `copied-report-${reportDate}-${shopId}`;
            sessionStorage.setItem(storageKey, 'true');

            button.classList.remove('btn-info');
            button.classList.add('btn-success');
            button.title = 'Rapport déjà copié';
            const icon = button.querySelector('i');
            icon.classList.remove('bi-clipboard');
            icon.classList.add('bi-clipboard-check');

            showNotification(`Le rapport détaillé pour "${reportDetails.shop_name}" a été copié !`);
        } catch (error) {
            console.error("Erreur lors de la génération du rapport détaillé:", error);
            showNotification('Erreur lors de la génération du rapport détaillé.', 'danger');
        } finally {
            button.disabled = false;
        }
    });

    // --- Gestion Boutons Actions Globales ---

    if (processStorageBtn) {
        processStorageBtn.addEventListener('click', async () => {
            const date = reportDateInput.value;
            if (!date) return showNotification('Veuillez sélectionner une date.', 'warning');
            processStorageBtn.disabled = true;
            processStorageBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Traitement...';
            try {
                const response = await axios.post(`${API_BASE_URL}/reports/process-storage`, { date });
                showNotification(response.data.message, 'success');
                fetchReports(date);
            } catch (error) {
                showNotification(`Erreur: ${error.response?.data?.message || 'Erreur inconnue.'}`, 'danger');
            } finally {
                processStorageBtn.disabled = false;
                processStorageBtn.innerHTML = '<i class="bi bi-box-seam"></i> Traiter le stockage';
            }
        });
    }

    // Gestion Recalcul Global (existant)
    if (recalculateBtn && recalculateConfirmModal) {
        recalculateBtn.addEventListener('click', async () => {
            const date = reportDateInput.value;
            if (!date) return showNotification('Veuillez sélectionner une date pour le recalcul.', 'warning');
            
            document.getElementById('recalculateDateDisplay').textContent = date;
            document.getElementById('confirmRecalculateDate').value = date;
            recalculateConfirmModal.show();
        });
    }

    if (confirmRecalculateBtn) {
        confirmRecalculateBtn.addEventListener('click', async () => {
            const date = document.getElementById('confirmRecalculateDate').value;
            confirmRecalculateBtn.disabled = true;
            confirmRecalculateBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Traitement...';

            try {
                recalculateConfirmModal.hide();
                const response = await axios.post(`${API_BASE_URL}/reports/recalculate-report`, { date });
                showNotification(response.data.message, 'success');
                fetchReports(date);
            } catch (error) {
                recalculateConfirmModal.hide();
                showNotification(`Erreur: ${error.response?.data?.message || 'Erreur inconnue lors du recalcul.'}`, 'danger');
            }  finally {
                confirmRecalculateBtn.disabled = false;
                confirmRecalculateBtn.innerHTML = '<i class="bi bi-arrow-repeat me-2"></i> Confirmer le Recalcul';
            }
        });
    }

    // --- NOUVEAU : Gestion Réparation Marchand (Reconstitution Ciblée) ---
    
    if (reconstituteMerchantBtn && reconstituteMerchantModal) {
        reconstituteMerchantBtn.addEventListener('click', async () => {
            // 1. Charger les boutiques si nécessaire
            await loadShopsForSelect();
            // 2. Pré-remplir la date avec celle actuellement consultée
            if (reconstituteDateInput) {
                reconstituteDateInput.value = reportDateInput.value;
            }
            // 3. Ouvrir la modale
            reconstituteMerchantModal.show();
        });
    }

    if (confirmReconstituteBtn) {
        confirmReconstituteBtn.addEventListener('click', async () => {
            const date = reconstituteDateInput.value;
            const shopId = reconstituteShopSelect.value;
            
            if (!date || !shopId) {
                return showNotification("Veuillez sélectionner une date ET un marchand.", "warning");
            }

            confirmReconstituteBtn.disabled = true;
            confirmReconstituteBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Réparation...';

            try {
                // Appel API
                const response = await axios.post(`${API_BASE_URL}/reports/reconstitute-merchant`, { date, shopId });
                
                reconstituteMerchantModal.hide();
                
                // Analyse de la réponse (succès ou warning ?)
                const { success, message, diff } = response.data;
                
                if (success) {
                    if (diff && diff !== 0) {
                        // Cas SPÉCIAL : Le versement était déjà payé et différent
                        showNotification(`⚠️ ${message}`, 'warning'); 
                    } else {
                        // Cas STANDARD
                        showNotification(`✅ ${message}`, 'success');
                    }
                    // Rafraîchir la liste pour voir les changements
                    fetchReports(date);
                }
            } catch (error) {
                reconstituteMerchantModal.hide();
                console.error("Erreur réparation:", error);
                showNotification(`❌ Erreur: ${error.response?.data?.message || error.message}`, 'danger');
            } finally {
                confirmReconstituteBtn.disabled = false;
                confirmReconstituteBtn.innerHTML = '<i class="bi bi-tools me-2"></i> Lancer la Réparation';
            }
        });
    }
    
    // Export PDF
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            const date = reportDateInput.value;
            if (!date) return showNotification('Veuillez sélectionner une date pour l\'export PDF.', 'warning');
            window.open(`${API_BASE_URL}/reports/export-pdf?date=${date}`, '_blank');
        });
    }

    const initializePage = () => {
        const today = new Date().toISOString().slice(0, 10);
        if (reportDateInput) {
            reportDateInput.value = today;
            itemsPerPage = parseInt(itemsPerPageSelect.value);
            fetchReports(today);
        }
        
        sidebarToggler?.addEventListener('click', () => {
            sidebar?.classList.toggle('collapsed');
            mainContent?.classList.toggle('expanded');
        });
        
        logoutBtn?.addEventListener('click', () => { 
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
            window.location.href = 'index.html'; 
        });
        
        const currentPath = window.location.pathname.split('/').pop();
        document.querySelectorAll('.sidebar .nav-link').forEach(link => {
            if (link.getAttribute('href') === currentPath) link.classList.add('active');
        });
    };
    
    initializePage();
});