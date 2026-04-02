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
        this.map.on('overlayadd', (e) => {
            // On cherche quel concurrent correspond à cette couche
            const entry = Object.entries(this.competitorLayers).find(([n, v]) => v.group === e.layer);
            if (entry) {
                const [name, data] = entry;
                // Si quelqu'un est mis en évidence, on applique le style correspondant (faded ou non)
                if (this.highlightedName) {
                    this._applyStyleToEntry(name, data, name === this.highlightedName);
                } else {
                    this._applyStyleToEntry(name, data, true); // Reset normal
                }
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

        if (trackPoints && trackPoints.length > 1) {
            const latlngs = trackPoints.map(p => [p.lat, p.lon]);
            L.polyline(latlngs, {
                color: '#1565C0',
                weight: 5,
                opacity: 1,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(this.roadbookLayer);

            L.polyline(latlngs, {
                color: '#FFFFFF',
                weight: 8,
                opacity: 0.35,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(this.roadbookLayer);
        }

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
        // Utilisation de FeatureGroup pour un meilleur support des styles et bringToFront
        const group = L.featureGroup();
        let polyline = null;

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
        if (entry.polyline) {
            entry.polyline.setStyle({ color: newColor });
        }
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
        Object.entries(this.competitorLayers).forEach(([n, data]) => {
            this._applyStyleToEntry(n, data, n === name);
        });

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
        Object.entries(this.competitorLayers).forEach(([n, data]) => {
            this._applyStyleToEntry(n, data, true);
        });
    }

    // ── Styles internes ───────────────────────────────────────────────

    _applyStyleToEntry(name, data, isActive) {
        const { polyline, group } = data;
        if (!polyline) return;

        // Mise à jour de l'opacité et de l'épaisseur
        polyline.setStyle({
            opacity: isActive ? 1 : 0.12,
            weight: isActive ? 5 : 3
        });

        // Gestion de l'ordre d'affichage (Z-index)
        if (isActive) {
            group.bringToFront();
        }
    }

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
