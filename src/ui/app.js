import { GPXParser } from '../core/parser.js';
import { ScoringEngine } from '../core/scoring.js';
import { ExportTools } from './export.js';
import { RallyMap } from './map.js';

class RallyApp {
    constructor() {
        this.roadbook = null;
        this.competitors = [];
        this.currentResults = null;
        this.currentEngine = null;

        this.initDOM();
        this.rallyMap = new RallyMap('main-map');
    }

    initDOM() {
        // Dropzones
        this.roadzone = document.getElementById('dropzone-roadbook');
        this.roadInput = document.getElementById('file-roadbook');
        this.roadStatus = document.getElementById('status-roadbook');

        this.compzone = document.getElementById('dropzone-competitors');
        this.compInput = document.getElementById('file-competitors');
        this.compStatus = document.getElementById('status-competitors');

        // Setup Event Listeners for Drag and Drop
        this.setupDropzone(this.roadzone, this.roadInput, (files) => this.handleRoadbookFile(files[0]));
        this.setupDropzone(this.compzone, this.compInput, (files) => this.handleCompetitorFiles(files));

        // Export button
        this.btnExport = document.getElementById('btn-export');
        this.btnExport.addEventListener('click', () => {
            if (this.currentResults && this.currentEngine) {
                ExportTools.generateCSV(this.currentResults, this.currentEngine);
            }
        });

        // Setup Modals
        const btnConfig = document.getElementById('btn-config');
        const configModal = document.getElementById('config-modal');
        const btnCloseConfig = document.getElementById('btn-close-config');
        const configForm = document.getElementById('config-form');

        btnConfig.addEventListener('click', () => configModal.showModal());
        btnCloseConfig.addEventListener('click', () => configModal.close());
        configForm.addEventListener('submit', (e) => {
            e.preventDefault();
            configModal.close();
            this.recalculateAll(); // Trigger recount if config changed
        });
    }

    setupDropzone(zone, input, callback) {
        zone.addEventListener('click', () => input.click());
        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) callback(e.target.files);
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) callback(e.dataTransfer.files);
        });
    }

    async handleRoadbookFile(file) {
        if (!file.name.toLowerCase().endsWith('.gpx')) {
            alert("Veuillez fournir un fichier GPX.");
            return;
        }

        this.roadStatus.textContent = "Analyse en cours...";

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const xmlString = e.target.result;
                const data = GPXParser.parse(xmlString);
                
                if (data.waypoints.length === 0) {
                    throw new Error("Aucun waypoint trouvé. Ce roadbook OpenRally semble vide.");
                }

                this.roadbook = data;
                this.roadStatus.textContent = `${data.waypoints.length} waypoints chargés`;
                this.roadStatus.classList.add('success');

                // Afficher le roadbook sur la carte (routePoints = tous les pts, même sans timestamp)
                this.rallyMap.renderRoadbook(data.waypoints, data.routePoints);

                console.log("Roadbook Parsed", this.roadbook);
                this.triggerCalculation();

            } catch(err) {
                console.error(err);
                this.roadStatus.textContent = "Erreur fichier !";
                alert(err.message);
            }
        };
        reader.readAsText(file);
    }

    async handleCompetitorFiles(files) {
        let validFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.gpx'));
        if (validFiles.length === 0) return;

        this.compStatus.textContent = "Chargement...";
        
        for (let file of validFiles) {
            const xmlString = await file.text();
            try {
                const data = GPXParser.parse(xmlString);
                if (data.trackPoints.length === 0) {
                    console.warn(`Le fichier ${file.name} ne contient aucune trace temporelle valide.`);
                    continue;
                }

                // Check if already exists to prevent duplicate
                const exist = this.competitors.find(c => c.name === file.name);
                if (!exist) {
                    this.competitors.push({
                        name: file.name.replace('.gpx', ''),
                        tracks: data.trackPoints
                    });
                }
            } catch(e) {
                console.error(`Erreur sur le concurrent ${file.name}`, e);
            }
        }

        this.compStatus.textContent = `${this.competitors.length} concurrent(s)`;
        this.compStatus.classList.add('success');
        this.triggerCalculation();
    }

    getConfig() {
        return {
            wptPenalties: {
                default: parseInt(document.getElementById('cfg-wpt-default').value) || 900,
                wpm: parseInt(document.getElementById('cfg-wpt-wpm').value) || 900,
                wpe: parseInt(document.getElementById('cfg-wpt-wpe').value) || 900,
                wpv: parseInt(document.getElementById('cfg-wpt-wpv').value) || 900,
                wps: parseInt(document.getElementById('cfg-wpt-wps').value) || 1200,
                wpn: parseInt(document.getElementById('cfg-wpt-wpn').value) || 3600,
                wpc: parseInt(document.getElementById('cfg-wpt-wpc').value) || 900,
                dss: parseInt(document.getElementById('cfg-wpt-dss').value) || 3600,
                ass: parseInt(document.getElementById('cfg-wpt-dss').value) || 3600,
                dz: parseInt(document.getElementById('cfg-wpt-dz').value) || 900,
                fz: parseInt(document.getElementById('cfg-wpt-dz').value) || 900,
                checkpoint: parseInt(document.getElementById('cfg-wpt-cp').value) || 3600
            },
            speedLimit: parseInt(document.getElementById('cfg-speed-limit').value) || 130,
            speedCoef: parseFloat(document.getElementById('cfg-speed-coef').value) || 1
        };
    }

    recalculateAll() {
        console.log("Forced recalculation with new settings.");
        this.triggerCalculation();
    }

    triggerCalculation() {
        if (!this.roadbook || this.competitors.length === 0) return;

        console.log('Démarrage du Scoring Engine...');
        const config = this.getConfig();
        const engine = new ScoringEngine(this.roadbook, config);
        this.currentEngine = engine;

        // Réinitialise les couches concurrents sur la carte
        this.rallyMap.clearAllCompetitors();

        let results = [];
        for (let comp of this.competitors) {
            let res = engine.calculateCompetitor(comp);
            // Inclure les tracks dans le résultat pour que le PDF puisse tracer la trace
            results.push({ name: comp.name, tracks: comp.tracks, ...res });

            // Afficher la trace sur la carte
            this.rallyMap.renderCompetitor(comp.name, comp.tracks, res.wpLog);
        }

        results.sort((a, b) => a.score - b.score);
        this.currentResults = results;
        this.renderTable(results, engine);
        this.btnExport.disabled = false;
    }

    renderTable(results, engine) {
        const tbody = document.getElementById('ranking-body');
        tbody.innerHTML = '';

        results.forEach((r, i) => {
            const color = this.rallyMap.getColor(r.name);
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';

            // Clic sur la ligne → zoom sur le concurrent dans la carte
            tr.addEventListener('click', () => {
                if (this.rallyMap.highlightedName === r.name) {
                    this.rallyMap.clearHighlight();
                    tr.classList.remove('selected');
                } else {
                    // Retirer la surbrillance des autres lignes
                    tbody.querySelectorAll('tr.selected').forEach(el => el.classList.remove('selected'));
                    tr.classList.add('selected');
                    this.rallyMap.highlightCompetitor(r.name);
                    document.getElementById('main-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            let missedCount = r.penaltiesBox.filter(p => p.type === 'WPT_MISSED').length;
            let speedCount  = r.penaltiesBox.filter(p => p.type === 'OVERSPEED').length;
            let otherCount  = r.penaltiesBox.length - missedCount - speedCount;
            let errText = [];
            if (missedCount > 0) errText.push(`${missedCount} WPT`);
            if (speedCount  > 0) errText.push(`${speedCount} Vit`);
            if (otherCount  > 0) errText.push(`${otherCount} Autre`);
            let details = errText.length > 0 ? ` (${errText.join(', ')})` : '';

            tr.innerHTML = `
                <td><strong>${i + 1}</strong></td>
                <td class="td-name">
                    <input type="color" class="comp-color-picker" value="${color}" title="Changer la couleur de la trace">
                    <span class="comp-name">${r.name}</span>
                </td>
                <td>${engine.formatTime(r.grossTime)}</td>
                <td style="color:var(--text-secondary)">-${engine.formatTime(r.neutralizedTime)}</td>
                <td style="color:var(--accent)">+${engine.formatTime(r.totalPenalties)}${details}</td>
                <td><strong>${engine.formatTime(r.score)}</strong></td>
                <td class="td-actions"></td>
            `;

            // Changement de couleur en temps réel
            const colorPicker = tr.querySelector('.comp-color-picker');
            colorPicker.addEventListener('input', (e) => {
                e.stopPropagation();
                const newColor = e.target.value;
                this.rallyMap.changeCompetitorColor(r.name, newColor);
            });
            colorPicker.addEventListener('click', e => e.stopPropagation());

            const actions = tr.querySelector('.td-actions');

            // ── Bouton Fiche PDF ──────────────────────────────────────
            const btnPdf = document.createElement('button');
            btnPdf.className = 'btn-secondary btn-icon';
            btnPdf.title = 'Générer la Fiche PDF';
            btnPdf.innerHTML = '📄 PDF';
            btnPdf.onclick = (e) => {
                e.stopPropagation();
                const canvas = document.getElementById('pdf-canvas');
                ExportTools.generatePDF(r, engine, this.roadbook, canvas);
            };

            // ── Bouton Renommer ───────────────────────────────────────
            const btnRename = document.createElement('button');
            btnRename.className = 'btn-secondary btn-icon';
            btnRename.title = 'Renommer le concurrent';
            btnRename.innerHTML = '✏️';
            btnRename.onclick = (e) => {
                e.stopPropagation();
                const oldName = r.name;
                const nameSpan = tr.querySelector('.comp-name');
                const input = document.createElement('input');
                input.type = 'text';
                input.value = oldName;
                input.className = 'rename-input';
                nameSpan.replaceWith(input);
                input.focus();
                input.select();

                const commit = () => {
                    const newName = input.value.trim() || oldName;
                    r.name = newName;
                    const comp = this.competitors.find(c => c.name === oldName);
                    if (comp) {
                        comp.name = newName;
                        r.tracks = comp.tracks; // re-sync tracks
                    }
                    // Mise à jour carte
                    if (this.rallyMap.competitorLayers[oldName]) {
                        this.rallyMap.competitorLayers[newName] = this.rallyMap.competitorLayers[oldName];
                        this.rallyMap.competitorColors[newName] = this.rallyMap.competitorColors[oldName];
                        delete this.rallyMap.competitorLayers[oldName];
                        delete this.rallyMap.competitorColors[oldName];
                    }
                    this.renderTable(this.currentResults, this.currentEngine);
                };

                input.addEventListener('blur', commit);
                input.addEventListener('keydown', ev => {
                    if (ev.key === 'Enter') commit();
                    if (ev.key === 'Escape') { input.value = oldName; commit(); }
                });
            };

            // ── Bouton Supprimer ──────────────────────────────────────
            const btnDel = document.createElement('button');
            btnDel.className = 'btn-danger btn-icon';
            btnDel.title = 'Supprimer ce concurrent';
            btnDel.innerHTML = '🗑';
            btnDel.onclick = (e) => {
                e.stopPropagation();
                if (!confirm(`Supprimer "${r.name}" de la liste ?`)) return;
                // Retirer de la carte
                this.rallyMap.removeCompetitor(r.name);
                // Retirer des données
                this.competitors = this.competitors.filter(c => c.name !== r.name);
                this.currentResults = this.currentResults.filter(res => res.name !== r.name);
                // Mise à jour statut
                this.compStatus.textContent = `${this.competitors.length} concurrent(s)`;
                // Re-render tableau
                this.renderTable(this.currentResults, this.currentEngine);
            };

            actions.appendChild(btnPdf);
            actions.appendChild(btnRename);
            actions.appendChild(btnDel);
            tbody.appendChild(tr);
        });
    }
}

// Initialise l'application au chargement
document.addEventListener('DOMContentLoaded', () => {
    window.App = new RallyApp();
});
