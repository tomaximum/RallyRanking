/**
 * RallyMap — Carte interactive Leaflet pour RallyRanking
 * Gère l'affichage du roadbook, des traces concurrents, et la sélection.
 */
export class RallyMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.layers = {};         // { name: L.layerGroup }
        this.tileLayer = null;
        this.roadbookLayer = null;
        this.competitorLayers = {}; // { name: { polyline, markers } }
        this.highlightedName = null;

        // Couleurs cycliques pour les concurrents
        this.palette = [
            '#FF6B6B', '#4ECDC4', '#FFE66D', '#A29BFE',
            '#FD79A8', '#00B894', '#FDCB6E', '#74B9FF',
            '#E17055', '#55EFC4'
        ];
        this.colorIndex = 0;
        this.competitorColors = {};

        this._init();
    }

    _init() {
        this.map = L.map(this.containerId, {
            center: [46.5, 2.5],
            zoom: 6,
            zoomControl: true
        });

        // ── Fonds de carte ───────────────────────────────────────────
        const baseLayers = {
            'OpenStreetMap': L.tileLayer(
                'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                { attribution: '© OpenStreetMap contributors', maxZoom: 19 }
            ),
            'Satellite': L.tileLayer(
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                { attribution: '© Esri World Imagery', maxZoom: 19 }
            ),
            'Hybride': L.layerGroup([
                L.tileLayer(
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    { attribution: '© Esri World Imagery', maxZoom: 19 }
                ),
                L.tileLayer(
                    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    { attribution: '© OpenStreetMap contributors', maxZoom: 19, opacity: 0.4 }
                )
            ])
        };

        // Activer OSM par défaut
        baseLayers['OpenStreetMap'].addTo(this.map);

        // Contrôle de couches (fond de carte + concurrents)
        this._layerControl = L.control.layers(baseLayers, {}, {
            position: 'topright',
            collapsed: false
        }).addTo(this.map);

        this.baseLayers = baseLayers;
    }

    // ── Roadbook ──────────────────────────────────────────────────────

    renderRoadbook(waypoints, trackPoints) {
        // Nettoyer l'ancienne couche
        if (this.roadbookLayer) {
            this.map.removeLayer(this.roadbookLayer);
        }
        this.roadbookLayer = L.layerGroup();

        // Trace GPS du roadbook
        if (trackPoints && trackPoints.length > 1) {
            const latlngs = trackPoints.map(p => [p.lat, p.lon]);
            L.polyline(latlngs, {
                color: '#4A90D9',
                weight: 3,
                opacity: 0.7,
                dashArray: '6 4'
            }).addTo(this.roadbookLayer);
        }

        // Marqueurs WP
        waypoints.forEach((w, idx) => {
            const color = this._wptColor(w.type);
            const marker = L.circleMarker([w.lat, w.lon], {
                radius: 8,
                fillColor: color,
                color: '#fff',
                weight: 2,
                fillOpacity: 0.9
            });

            marker.bindTooltip(
                `<strong>${w.name || idx + 1}</strong><br>${(w.type || '').toUpperCase()}<br>Open: ${w.open}m / Clear: ${w.clear}m`,
                { direction: 'top', offset: [0, -8] }
            );

            marker.addTo(this.roadbookLayer);

            // Label numéro
            L.marker([w.lat, w.lon], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="font-size:9px;font-weight:700;color:#fff;text-align:center;margin-top:2px;">${w.name || idx + 1}</div>`,
                    iconSize: [20, 14],
                    iconAnchor: [10, 18]
                })
            }).addTo(this.roadbookLayer);
        });

        this.roadbookLayer.addTo(this.map);
        this._layerControl.addOverlay(this.roadbookLayer, '📍 Roadbook');

        // Zoom automatique si trackPoints disponibles
        if (trackPoints && trackPoints.length > 0) {
            const bounds = L.latLngBounds(trackPoints.map(p => [p.lat, p.lon]));
            this.map.fitBounds(bounds, { padding: [30, 30] });
        } else if (waypoints.length > 0) {
            const bounds = L.latLngBounds(waypoints.map(w => [w.lat, w.lon]));
            this.map.fitBounds(bounds, { padding: [30, 30] });
        }
    }

    // ── Concurrent ────────────────────────────────────────────────────

    getColor(name) {
        if (!this.competitorColors[name]) {
            this.competitorColors[name] = this.palette[this.colorIndex % this.palette.length];
            this.colorIndex++;
        }
        return this.competitorColors[name];
    }

    renderCompetitor(name, tracks, wpLog) {
        // Supprimer l'ancienne couche si recalcul
        this.removeCompetitor(name);

        const color = this.getColor(name);
        const group = L.layerGroup();

        // Trace GPS
        if (tracks && tracks.length > 1) {
            const latlngs = tracks.map(p => [p.lat, p.lon]);
            const polyline = L.polyline(latlngs, {
                color: color,
                weight: 2.5,
                opacity: 0.8
            });
            polyline.bindTooltip(name, { sticky: true });
            polyline.addTo(group);
        }

        // Marqueurs WP validés/ratés
        if (wpLog) {
            wpLog.forEach(entry => {
                const w = entry.waypoint;
                const isValid = entry.status === 'VALID';
                const marker = L.circleMarker([w.lat, w.lon], {
                    radius: 6,
                    fillColor: isValid ? '#00b894' : '#d63031',
                    color: '#fff',
                    weight: 1.5,
                    fillOpacity: 1
                });
                marker.bindTooltip(
                    `${name} — ${w.name || '?'} (${isValid ? '✓ Validé' : '✗ Raté'})`,
                    { direction: 'top', offset: [0, -6] }
                );
                marker.addTo(group);
            });
        }

        group.addTo(this.map);
        this.competitorLayers[name] = { group, color };
        this._layerControl.addOverlay(group, `<span style="color:${color}">●</span> ${name}`);
    }

    removeCompetitor(name) {
        if (this.competitorLayers[name]) {
            this.map.removeLayer(this.competitorLayers[name].group);
            this._layerControl.removeLayer(this.competitorLayers[name].group);
            delete this.competitorLayers[name];
        }
    }

    clearAllCompetitors() {
        Object.keys(this.competitorLayers).forEach(n => this.removeCompetitor(n));
        this.colorIndex = 0;
        this.competitorColors = {};
    }

    // ── Mise en évidence ─────────────────────────────────────────────

    highlightCompetitor(name) {
        // Reset toutes les couches
        Object.entries(this.competitorLayers).forEach(([n, { group }]) => {
            group.eachLayer(layer => {
                if (layer.setStyle) {
                    layer.setStyle({ opacity: n === name ? 1 : 0.15, fillOpacity: n === name ? 1 : 0.15 });
                }
            });
        });
        this.highlightedName = name;

        // Zoom sur la trace sélectionnée
        const layer = this.competitorLayers[name];
        if (layer) {
            const allLatLngs = [];
            layer.group.eachLayer(l => {
                if (l.getLatLngs) allLatLngs.push(...l.getLatLngs());
                if (l.getLatLng) allLatLngs.push(l.getLatLng());
            });
            if (allLatLngs.length > 0) {
                this.map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] });
            }
        }
    }

    clearHighlight() {
        Object.values(this.competitorLayers).forEach(({ group }) => {
            group.eachLayer(layer => {
                if (layer.setStyle) layer.setStyle({ opacity: 0.8, fillOpacity: 1 });
            });
        });
        this.highlightedName = null;
    }

    // ── Helpers ───────────────────────────────────────────────────────

    _wptColor(type) {
        const map = {
            dss: '#2ecc71', ass: '#e74c3c',
            dz: '#f39c12', fz: '#27ae60',
            wpm: '#3498db', wpe: '#3498db', wpv: '#9b59b6',
            wps: '#e67e22', wpn: '#c0392b', wpc: '#1abc9c',
            checkpoint: '#1abc9c', dn: '#95a5a6', fn: '#95a5a6',
            dt: '#bdc3c7', ft: '#bdc3c7'
        };
        return map[(type || '').toLowerCase()] || '#3498db';
    }
}
