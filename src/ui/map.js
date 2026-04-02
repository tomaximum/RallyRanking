/**
 * RallyMap — Carte interactive Leaflet pour RallyRanking
 */
export class RallyMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.roadbookLayer = null;
        this.competitorLayers = {}; // { name: { group, polyline, color } }
        this.highlightedName = null;

        this.palette = [
            '#FF6B6B', '#4ECDC4', '#FFE66D', '#A29BFE',
            '#FD79A8', '#00CEC9', '#FDCB6E', '#74B9FF',
            '#E17055', '#55EFC4', '#6C5CE7', '#FAB1A0'
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

        const osm = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution: '© OpenStreetMap contributors', maxZoom: 19 }
        );
        const sat = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { attribution: '© Esri World Imagery', maxZoom: 19 }
        );
        // Hybride = satellite + OSM labels en overlay
        const hybrid = L.layerGroup([
            L.tileLayer(
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                { attribution: '© Esri', maxZoom: 19 }
            ),
            L.tileLayer(
                'https://stamen-tiles.a.ssl.fastly.net/toner-hybrid/{z}/{x}/{y}.png',
                { attribution: '© Stamen', maxZoom: 19, opacity: 0.6 }
            )
        ]);

        osm.addTo(this.map);

        this._baseLayers = { 'OpenStreetMap': osm, 'Satellite': sat, 'Hybride': hybrid };
        this._overlays = {};

        this._layerControl = L.control.layers(this._baseLayers, this._overlays, {
            position: 'topright',
            collapsed: false
        }).addTo(this.map);

        // ── Ré-appliquer les styles après un toggle du contrôle de couches ──
        this.map.on('overlayadd overlayremove', () => {
            // Quand une couche est rajoutée, s'assurer que les styles highlight sont corrects
            if (this.highlightedName) {
                this._applyHighlightStyles(this.highlightedName);
            } else {
                this._resetAllStyles();
            }
        });
    }

    // ── Roadbook ──────────────────────────────────────────────────────

    renderRoadbook(waypoints, trackPoints) {
        if (this.roadbookLayer) {
            this.map.removeLayer(this.roadbookLayer);
            this._layerControl.removeLayer(this.roadbookLayer);
        }
        this.roadbookLayer = L.layerGroup();

        // Trace GPS du roadbook — trait plein épaisseur 5, haute visibilité
        if (trackPoints && trackPoints.length > 1) {
            const latlngs = trackPoints.map(p => [p.lat, p.lon]);
            L.polyline(latlngs, {
                color: '#1565C0',   // bleu foncé
                weight: 5,
                opacity: 1,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(this.roadbookLayer);

            // Halo blanc dessous pour contraste sur fond sombre/satellite
            L.polyline(latlngs, {
                color: '#FFFFFF',
                weight: 8,
                opacity: 0.35,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(this.roadbookLayer);
        }

        // Marqueurs WP
        waypoints.forEach((w, idx) => {
            const fillColor = this._wptColor(w.type);
            const marker = L.circleMarker([w.lat, w.lon], {
                radius: 9,
                fillColor,
                color: '#fff',
                weight: 2.5,
                fillOpacity: 1,
                zIndexOffset: 500
            });
            marker.bindTooltip(
                `<strong>${w.name || idx + 1}</strong> — ${(w.type || '').toUpperCase()}<br>Open: ${w.open} m / Clear: ${w.clear} m`,
                { direction: 'top', offset: [0, -10] }
            );
            marker.addTo(this.roadbookLayer);

            // Numéro centré sur le marqueur
            L.marker([w.lat, w.lon], {
                icon: L.divIcon({
                    className: '',
                    html: `<span style="font:bold 9px/9px sans-serif;color:#fff">${w.name || idx + 1}</span>`,
                    iconSize: [20, 10],
                    iconAnchor: [10, 5]
                }),
                zIndexOffset: 600
            }).addTo(this.roadbookLayer);
        });

        this.roadbookLayer.addTo(this.map);
        this._overlays['📍 Roadbook'] = this.roadbookLayer;
        this._layerControl.addOverlay(this.roadbookLayer, '📍 Roadbook');

        // Zoom automatique
        const pts = (trackPoints && trackPoints.length > 0) ? trackPoints : waypoints.map(w => ({ lat: w.lat, lon: w.lon }));
        if (pts.length > 0) {
            this.map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])), { padding: [30, 30] });
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
        this.removeCompetitor(name);

        const color = this.getColor(name);
        const group = L.layerGroup();
        let polyline = null;

        // Trace GPS — épaisseur 4, pleine opacité
        if (tracks && tracks.length > 1) {
            const latlngs = tracks.map(p => [p.lat, p.lon]);
            polyline = L.polyline(latlngs, {
                color,
                weight: 4,
                opacity: 1,
                lineJoin: 'round',
                lineCap: 'round'
            });
            polyline.bindTooltip(name, { sticky: true });
            polyline.addTo(group);
        }

        // Marqueurs WP avec statut
        if (wpLog) {
            wpLog.forEach(entry => {
                const w = entry.waypoint;
                const isValid = entry.status === 'VALID';
                const dot = L.circleMarker([w.lat, w.lon], {
                    radius: 7,
                    fillColor: isValid ? '#00b894' : '#d63031',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 1,
                    zIndexOffset: 400
                });
                dot.bindTooltip(
                    `${name} — ${w.name || '?'} (${isValid ? '✓ Validé' : '✗ Raté'})`,
                    { direction: 'top', offset: [0, -8] }
                );
                dot.addTo(group);
            });
        }

        group.addTo(this.map);
        this.competitorLayers[name] = { group, polyline, color };
        this._overlays[name] = group;
        this._layerControl.addOverlay(group, `<span style="color:${color};font-size:1.1em">●</span> ${name}`);
    }

    removeCompetitor(name) {
        if (this.competitorLayers[name]) {
            this.map.removeLayer(this.competitorLayers[name].group);
            this._layerControl.removeLayer(this.competitorLayers[name].group);
            delete this.competitorLayers[name];
            delete this._overlays[name];
        }
    }

    changeCompetitorColor(name, newColor) {
        const entry = this.competitorLayers[name];
        if (!entry) return;
        entry.color = newColor;
        this.competitorColors[name] = newColor;
        // Mise à jour de la polyline
        if (entry.polyline) {
            entry.polyline.setStyle({ color: newColor });
        }
        // Mise à jour du label dans le contrôle de couches
        // Leaflet ne permet pas de modifier le label directement, on retire/rajoute
        this._layerControl.removeLayer(entry.group);
        this._layerControl.addOverlay(entry.group, `<span style="color:${newColor};font-size:1.1em">●</span> ${name}`);
    }

    clearAllCompetitors() {
        Object.keys(this.competitorLayers).forEach(n => this.removeCompetitor(n));
        this.colorIndex = 0;
        this.competitorColors = {};
    }

    // ── Mise en évidence ─────────────────────────────────────────────

    highlightCompetitor(name) {
        this.highlightedName = name;
        this._applyHighlightStyles(name);

        // Zoom sur la trace sélectionnée
        const entry = this.competitorLayers[name];
        if (entry && entry.polyline) {
            const latlngs = entry.polyline.getLatLngs();
            if (latlngs.length > 0) {
                this.map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
            }
        }
    }

    clearHighlight() {
        this.highlightedName = null;
        this._resetAllStyles();
    }

    // ── Styles internes ───────────────────────────────────────────────

    _applyHighlightStyles(selectedName) {
        Object.entries(this.competitorLayers).forEach(([n, { polyline }]) => {
            if (!polyline || !this.map.hasLayer(polyline)) return;
            const isSelected = n === selectedName;
            polyline.setStyle({
                opacity: isSelected ? 1 : 0.12,
                weight:  isSelected ? 5 : 3
            });
            if (isSelected) polyline.bringToFront();
        });
    }

    _resetAllStyles() {
        Object.values(this.competitorLayers).forEach(({ polyline }) => {
            if (!polyline || !this.map.hasLayer(polyline)) return;
            polyline.setStyle({ opacity: 1, weight: 4 });
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────

    _wptColor(type) {
        const colors = {
            dss: '#2ECC71', ass: '#E74C3C',
            dz: '#F39C12',  fz: '#27AE60',
            wpm: '#3498DB', wpe: '#3498DB', wpv: '#9B59B6',
            wps: '#E67E22', wpn: '#C0392B', wpc: '#1ABC9C',
            checkpoint: '#1ABC9C',
            dn: '#95A5A6', fn: '#95A5A6',
            dt: '#BDC3C7', ft: '#BDC3C7'
        };
        return colors[(type || '').toLowerCase()] || '#3498DB';
    }
}
