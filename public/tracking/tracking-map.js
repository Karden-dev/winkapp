// public/tracking/tracking-map.js

const TrackingMap = {
    liveMap: null,
    liveMarkers: {},
    replayMap: null,
    replayPolyline: null,
    replayMarker: null,
    replayStops: [],
    replayPathData: [],
    animationId: null,
    isPlaying: false,
    playIndex: 0,
    playSpeed: 1,
    onProgressCallback: null,
    ICONS: {},
    DEFAULT_CENTER: { lat: 3.8480, lng: 11.5021 }, // Yaoundé

    initLiveMap: function(elementId) {
        this.initIcons();
        this.liveMap = new google.maps.Map(document.getElementById(elementId), {
            center: this.DEFAULT_CENTER,
            zoom: 13,
            disableDefaultUI: false,
            fullscreenControl: false,
            styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }]
        });
    },

    initReplayMap: function(elementId) {
        if (this.replayMap) return;
        this.replayMap = new google.maps.Map(document.getElementById(elementId), {
            center: this.DEFAULT_CENTER, zoom: 13, disableDefaultUI: false, fullscreenControl: false
        });
    },

    initIcons: function() {
        const base = { path: google.maps.SymbolPath.CIRCLE, scale: 9, strokeColor: '#fff', strokeWeight: 2, fillOpacity: 1 };
        this.ICONS = {
            online: { ...base, fillColor: '#28a745' },
            busy:   { ...base, fillColor: '#ffc107' },
            offline:{ ...base, fillColor: '#dc3545' },
            rider:  { ...base, fillColor: '#2C3E50', scale: 7 }
        };
    },

    updateRiderMarker: function(riderData, onClickCallback) {
        if (!this.liveMap) return;
        const pos = { lat: parseFloat(riderData.lat), lng: parseFloat(riderData.lng) };
        let icon = this.ICONS.online;
        if (riderData.status === 'busy') icon = this.ICONS.busy;
        if (riderData.status === 'offline') icon = this.ICONS.offline;

        if (this.liveMarkers[riderData.id]) {
            this.liveMarkers[riderData.id].setPosition(pos);
            this.liveMarkers[riderData.id].setIcon(icon);
        } else {
            const marker = new google.maps.Marker({ position: pos, map: this.liveMap, icon: icon });
            marker.addListener("click", () => { if(onClickCallback) onClickCallback(riderData.id); });
            this.liveMarkers[riderData.id] = marker;
        }
    },

    focusOnRider: function(id) {
        if (this.liveMarkers[id]) {
            this.liveMap.panTo(this.liveMarkers[id].getPosition());
            this.liveMap.setZoom(16);
        }
    },

    triggerResize: function(isReplay = false) {
        const map = isReplay ? this.replayMap : this.liveMap;
        if (map) google.maps.event.trigger(map, "resize");
    },

    loadReplayRoute: function(path, stops) {
        if (!this.replayMap) return;
        this.resetReplay();
        this.replayPathData = path;

        this.replayPolyline = new google.maps.Polyline({
            path: path, geodesic: true, strokeColor: "#FF7F50", strokeOpacity: 0.8, strokeWeight: 5, map: this.replayMap
        });

        stops.forEach(stop => {
            const m = new google.maps.Marker({
                position: stop, map: this.replayMap, label: { text: "P", color: "white", fontSize: "10px" },
                icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#dc3545", fillOpacity: 0.9, strokeColor:"white", strokeWeight:1 }
            });
            this.replayStops.push(m);
        });

        if (path.length > 0) {
            this.replayMarker = new google.maps.Marker({ position: path[0], map: this.replayMap, icon: this.ICONS.rider });
            const bounds = new google.maps.LatLngBounds();
            path.forEach(p => bounds.extend(p));
            this.replayMap.fitBounds(bounds);
        }
    },

    playReplay: function() {
        if (this.replayPathData.length === 0) return;
        this.isPlaying = true;
        this.animate();
    },

    pauseReplay: function() {
        this.isPlaying = false;
        cancelAnimationFrame(this.animationId);
    },

    seekReplay: function(index) {
        this.pauseReplay();
        this.playIndex = Math.min(index, this.replayPathData.length - 1);
        this.updateReplayVisuals();
    },

    setSpeed: function(speed) { this.playSpeed = speed; },

    resetReplay: function() {
        this.pauseReplay();
        this.playIndex = 0;
        if (this.replayPolyline) this.replayPolyline.setMap(null);
        if (this.replayMarker) this.replayMarker.setMap(null);
        this.replayStops.forEach(m => m.setMap(null));
        this.replayStops = [];
    },

    animate: function() {
        if (!this.isPlaying) return;
        this.playIndex += this.playSpeed * 0.5;
        if (this.playIndex >= this.replayPathData.length - 1) {
            this.playIndex = this.replayPathData.length - 1;
            this.isPlaying = false;
        }
        this.updateReplayVisuals();
        if (this.isPlaying) this.animationId = requestAnimationFrame(() => this.animate());
    },

    updateReplayVisuals: function() {
        const idx = Math.floor(this.playIndex);
        const pos = this.replayPathData[idx];
        if (this.replayMarker && pos) this.replayMarker.setPosition(pos);
        if (this.onProgressCallback) this.onProgressCallback(idx, this.replayPathData.length);
    }
};