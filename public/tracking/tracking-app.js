// public/tracking/tracking-app.js

const AppState = {
    socket: null,
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user')), // Récupération User
    selectedRiderId: null,
    ridersData: {}
};

// Point d'entrée global
window.initTrackingApp = function() {
    console.log("[App] Init...");
    
    // 1. Mise à jour Infos Utilisateur (App Bar)
    if (AppState.user && AppState.user.name) {
        const nameEl = document.getElementById('userName');
        if (nameEl) nameEl.innerText = AppState.user.name;
        
        const avatarEl = document.getElementById('userAvatar');
        if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${AppState.user.name}&background=2C3E50&color=fff`;
    }

    // 2. Initialiser UI (Boutons, Sidebar)
    initUIEvents();

    // 3. Initialiser Carte Live
    if (typeof TrackingMap !== 'undefined') {
        TrackingMap.initLiveMap('live-map');
    }

    // 4. Connexion WebSocket
    if (AppState.token) {
        connectSocket();
    } else {
        console.warn("Pas de token.");
    }
};

function initUIEvents() {
    // Sidebar Toggle
    const toggler = document.getElementById('sidebar-toggler');
    const sidebar = document.getElementById('sidebar');
    if(toggler && sidebar) {
        toggler.addEventListener('click', () => sidebar.classList.toggle('show'));
    }

    // Mobile Panel
    const mobToggle = document.getElementById('mobilePanelToggle');
    const panel = document.getElementById('fleetPanel');
    const closePanel = document.getElementById('closePanelBtn');
    if(mobToggle) mobToggle.addEventListener('click', () => panel.classList.add('show'));
    if(closePanel) closePanel.addEventListener('click', () => panel.classList.remove('show'));

    // --- REPLAY MODAL ---
    const replayModalEl = document.getElementById('replayModal');
    if (replayModalEl) {
        replayModalEl.addEventListener('shown.bs.modal', () => {
            TrackingMap.initReplayMap('replay-map');
            TrackingMap.triggerResize(true);
            // Auto-load si livreur sélectionné
            if (AppState.selectedRiderId) {
                document.getElementById('replayDateInput').valueAsDate = new Date();
                loadReplayData();
            }
        });
        replayModalEl.addEventListener('hidden.bs.modal', () => {
            TrackingMap.pauseReplay();
        });
    }

    // Boutons Replay
    const loadBtn = document.getElementById('loadReplayBtn');
    if(loadBtn) loadBtn.addEventListener('click', loadReplayData);

    const playBtn = document.getElementById('playBtn');
    const slider = document.getElementById('timeSlider');
    const speedBtn = document.getElementById('speedBtn');

    if(playBtn) {
        playBtn.addEventListener('click', () => {
            if (TrackingMap.isPlaying) {
                TrackingMap.pauseReplay();
                playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
            } else {
                TrackingMap.playReplay();
                playBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
            }
        });
    }

    if(slider) {
        slider.addEventListener('input', (e) => {
            TrackingMap.seekReplay(parseInt(e.target.value));
            if(playBtn) playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
        });
        TrackingMap.onProgressCallback = (curr, total) => {
            slider.max = total - 1;
            slider.value = curr;
        };
    }

    if(speedBtn) {
        speedBtn.addEventListener('click', () => {
            let s = TrackingMap.playSpeed;
            s = (s >= 8) ? 1 : s * 2;
            TrackingMap.setSpeed(s);
            speedBtn.innerText = `x${s}`;
        });
    }
}

// Helper pour ouvrir la modal depuis le HTML
window.openReplayModal = function() {
    const el = document.getElementById('replayModal');
    const modal = new bootstrap.Modal(el);
    modal.show();
};

window.openReplayModalGlobal = function(id) {
    AppState.selectedRiderId = id;
    window.openReplayModal();
};

// --- WEBSOCKET ---
function connectSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?token=${AppState.token}`;
    
    console.log("Connexion WS...", wsUrl);
    AppState.socket = new WebSocket(wsUrl);

    AppState.socket.onopen = () => {
        console.log("[WS] Connecté");
        sendMessage('ADMIN_JOIN_TRACKING', {});
    };

    AppState.socket.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'INIT_FLEET') msg.payload.forEach(updateRider);
            if (msg.type === 'RIDER_MOVED') updateRider(msg.payload);
        } catch (err) { console.error(err); }
    };
}

function sendMessage(type, payload) {
    if (AppState.socket && AppState.socket.readyState === WebSocket.OPEN) {
        AppState.socket.send(JSON.stringify({ type, payload }));
    }
}

function updateRider(data) {
    const rider = {
        id: data.riderId || data.id,
        lat: parseFloat(data.lat || data.current_lat),
        lng: parseFloat(data.lng || data.current_lng),
        status: data.status || (data.is_online ? 'online' : 'offline')
    };

    if (isNaN(rider.lat)) return;
    AppState.ridersData[rider.id] = rider;
    
    TrackingMap.updateRiderMarker(rider, (id) => {
        AppState.selectedRiderId = id;
        // Optionnel: Ouvrir modal au clic marker
        // window.openReplayModal();
    });

    updateListUI(rider);
}

function updateListUI(rider) {
    const list = document.getElementById('riderListContainer');
    if(list.querySelector('.spinner-border')) list.innerHTML = '';

    let item = document.getElementById(`rider-${rider.id}`);
    if (!item) {
        item = document.createElement('li');
        item.id = `rider-${rider.id}`;
        item.className = 'rider-item';
        item.onclick = () => {
            TrackingMap.focusOnRider(rider.id);
            AppState.selectedRiderId = rider.id;
        };
        list.appendChild(item);
    }

    const statusClass = rider.status === 'online' ? 'status-online' : (rider.status === 'busy' ? 'status-busy' : 'status-offline');
    item.innerHTML = `
        <div class="status-dot ${statusClass}"></div>
        <div class="flex-grow-1">
            <span class="fw-bold d-block small">Livreur ${rider.id}</span>
            <span class="text-muted small" style="font-size:0.7rem">${rider.status.toUpperCase()}</span>
        </div>
        <button class="btn btn-sm btn-light border" onclick="event.stopPropagation(); window.openReplayModalGlobal(${rider.id})">
            <i class="bi bi-clock-history"></i>
        </button>
    `;
    updateCounters();
}

function updateCounters() {
    const all = Object.values(AppState.ridersData);
    const set = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
    set('countOnline', all.filter(r => r.status === 'online').length);
    set('countBusy', all.filter(r => r.status === 'busy').length);
    set('countOffline', all.filter(r => r.status === 'offline').length);
}

// --- API REPLAY ---
async function loadReplayData() {
    const date = document.getElementById('replayDateInput').value;
    const id = AppState.selectedRiderId;
    
    if(!id || !date) return alert("Sélectionnez un livreur (clic liste ou carte) et une date");

    const btn = document.getElementById('loadReplayBtn');
    btn.innerHTML = '...'; btn.disabled = true;

    try {
        const res = await axios.get(`/api/geo/history/${id}?date=${date}`, {
            headers: { Authorization: `Bearer ${AppState.token}` }
        });

        if (res.data.success && res.data.hasData) {
            document.getElementById('statDistance').innerText = res.data.summary.totalDistance;
            document.getElementById('statStops').innerText = res.data.summary.stopTime;

            const path = res.data.path.map(p => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));
            const stops = res.data.stops.map(s => ({ lat: parseFloat(s.lat), lng: parseFloat(s.lng) }));

            TrackingMap.loadReplayRoute(path, stops);
            document.getElementById('timeSlider').disabled = false;
        } else {
            alert("Aucun trajet.");
            TrackingMap.resetReplay();
        }
    } catch (e) {
        console.error(e);
        alert("Erreur chargement");
    } finally {
        btn.innerHTML = '<i class="bi bi-search"></i>'; btn.disabled = false;
    }
}