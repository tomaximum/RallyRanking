import { GPXParser } from '../core/parser.js';
import { ScoringEngine } from '../core/scoring.js';
import { ExportTools } from './export.js';

class RallyApp {
    constructor() {
        this.roadbook = null; // { tracks, waypoints }
        this.competitors = []; // Array of { file, name, tracks }
        
        this.initDOM();
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
            speedCoef: parseInt(document.getElementById('cfg-speed-coef').value) || 60
        };
    }

    recalculateAll() {
        console.log("Forced recalculation with new settings.");
        this.triggerCalculation();
    }

    triggerCalculation() {
        if (!this.roadbook || this.competitors.length === 0) return;
        
        console.log("Démarrage du Scoring Engine...");
        const config = this.getConfig();
        const engine = new ScoringEngine(this.roadbook, config);
        this.currentEngine = engine;

        let results = [];
        for (let comp of this.competitors) {
            let res = engine.calculateCompetitor(comp);
            results.push({
                name: comp.name,
                ...res
            });
        }

        results.sort((a, b) => a.score - b.score);
        this.currentResults = results;
        this.renderTable(results, engine);
        
        // Activer le bouton d'export
        this.btnExport.disabled = false;
    }

    renderTable(results, engine) {
        const tbody = document.getElementById('ranking-body');
        tbody.innerHTML = '';
        
        results.forEach((r, i) => {
            const tr = document.createElement('tr');
            
            // Fiche A4 Bouton
            const btnPdf = document.createElement('button');
            btnPdf.className = 'btn-secondary';
            btnPdf.textContent = 'Fiche PDF';
            btnPdf.style.fontSize = '0.75rem';
            btnPdf.style.padding = '0.2rem 0.5rem';
            btnPdf.onclick = () => ExportTools.generatePDF(r, engine);

            tr.innerHTML = `
                <td><strong>${i+1}</strong></td>
                <td>${r.name}</td>
                <td>${engine.formatTime(r.grossTime)}</td>
                <td style="color:var(--text-secondary)">-${engine.formatTime(r.neutralizedTime)}</td>
                <td style="color:var(--accent)">+${engine.formatTime(r.totalPenalties)} (${r.penaltiesBox.length} erreurs)</td>
                <td><strong>${engine.formatTime(r.score)}</strong></td>
                <td class="td-actions"></td>
            `;
            
            tr.querySelector('.td-actions').appendChild(btnPdf);
            tbody.appendChild(tr);
        });
    }
}

// Initialise l'application au chargement
document.addEventListener('DOMContentLoaded', () => {
    window.App = new RallyApp();
});
