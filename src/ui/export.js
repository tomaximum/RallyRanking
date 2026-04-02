import { MapCanvas } from './mapCanvas.js';

export class ExportTools {
    /**
     * Génère un CSV des classements
     */
    static generateCSV(results, engine) {
        let sc = "Rang,Concurrent,Temps Brut,Temps Neutralisé,Total Pénalités,Temps Final Corrigé\n";
        results.forEach((r, i) => {
            sc += `${i+1},"${r.name}",${engine.formatTime(r.grossTime)},${engine.formatTime(r.neutralizedTime)},${engine.formatTime(r.totalPenalties)},${engine.formatTime(r.score)}\n`;
        });

        const blob = new Blob([sc], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "Classement_Rally.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Génère un PDF du classement général
     * @param {Array}  results    — tableau trié par score
     * @param {object} engine
     * @param {object} eventInfo  — { name, date }
     */
    static generateRankingPDF(results, engine, eventInfo = {}) {
        if (!window.jspdf) { console.error('jsPDF not loaded'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageW  = 210;
        const margin = 12;
        const colW   = pageW - margin * 2;
        const eventName = eventInfo.name || 'Rallye';
        const eventDate = eventInfo.date || new Date().toLocaleDateString('fr-FR');

        // ── En-tête ──────────────────────────────────────────────────
        doc.setFillColor(30, 30, 60);
        doc.rect(0, 0, pageW, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(20);
        doc.text('Classement Officiel', pageW / 2, 13, { align: 'center' });
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(`${eventName}  —  ${eventDate}`, pageW / 2, 23, { align: 'center' });

        doc.setTextColor(0, 0, 0);
        let y = 36;

        // ── Tableau des résultats ─────────────────────────────────────
        const cols = [8, 20, 70, 110, 135, 158]; // offsets x depuis margin
        const headers = ['Rg', 'Concurrent', 'Tps Brut', 'Neutral.', 'Pénalités', 'Tps Corrigé'];

        doc.setFillColor(30, 30, 60);
        doc.rect(margin, y, colW, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(9);
        headers.forEach((h, i) => doc.text(h, margin + cols[i] + 1, y + 5));
        y += 7;

        results.forEach((r, i) => {
            // Fond alterné
            doc.setFillColor(i % 2 === 0 ? 245 : 255, i % 2 === 0 ? 247 : 255, i % 2 === 0 ? 250 : 255);
            doc.rect(margin, y, colW, 7, 'F');

            // Médaille podium
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
            doc.setFont(undefined, i < 3 ? 'bold' : 'normal');
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);

            doc.text(String(i + 1), margin + cols[0] + 1, y + 5);
            doc.text(r.name, margin + cols[1] + 1, y + 5);
            doc.text(engine.formatTime(r.grossTime), margin + cols[2] + 1, y + 5);
            doc.text(`-${engine.formatTime(r.neutralizedTime)}`, margin + cols[3] + 1, y + 5);

            // Pénalités avec couleur rouge si > 0
            const penStr = `+${engine.formatTime(r.totalPenalties)}`;
            if (r.totalPenalties > 0) doc.setTextColor(180, 0, 0);
            doc.text(penStr, margin + cols[4] + 1, y + 5);
            doc.setTextColor(0, 0, 0);

            // Score en gras
            doc.setFont(undefined, 'bold');
            doc.text(engine.formatTime(r.score), margin + cols[5] + 1, y + 5);
            doc.setFont(undefined, 'normal');

            y += 7;
            if (y > 272) { doc.addPage(); y = 15; }
        });

        y += 8;

        // ── Détail des pénalités par concurrent ───────────────────────
        const withPenalties = results.filter(r => r.penaltiesBox && r.penaltiesBox.length > 0);
        if (withPenalties.length > 0) {
            if (y > 230) { doc.addPage(); y = 15; }

            doc.setFont(undefined, 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30, 30, 60);
            doc.text('Détail des Pénalités', margin, y);
            y += 6;

            withPenalties.forEach(r => {
                if (y > 265) { doc.addPage(); y = 15; }

                // Sous-titre concurrent
                doc.setFillColor(220, 220, 235);
                doc.rect(margin, y, colW, 6, 'F');
                doc.setFont(undefined, 'bold');
                doc.setFontSize(9);
                doc.setTextColor(30, 30, 60);
                doc.text(r.name, margin + 2, y + 4.2);

                const missedWpt = r.penaltiesBox.filter(p => p.type === 'WPT_MISSED').length;
                const overspeed = r.penaltiesBox.filter(p => p.type === 'OVERSPEED').length;
                let summary = [];
                if (missedWpt > 0) summary.push(`${missedWpt} WP manqué(s)`);
                if (overspeed > 0) summary.push(`${overspeed} survitesse(s)`);
                if (summary.length > 0) {
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(150, 0, 0);
                    doc.text(summary.join('  |  '), margin + colW - 2, y + 4.2, { align: 'right' });
                }
                y += 6;

                // Lignes détail
                doc.setFont(undefined, 'normal');
                doc.setFontSize(8);
                r.penaltiesBox.forEach((p, idx) => {
                    if (y > 272) { doc.addPage(); y = 15; }
                    doc.setFillColor(idx % 2 === 0 ? 252 : 255, idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 248 : 255);
                    doc.rect(margin, y, colW, 5.5, 'F');
                    doc.setTextColor(0, 0, 0);

                    let desc = p.desc || '';
                    if (desc.length > 60) desc = desc.substring(0, 58) + '…';

                    // Durée excès pour OVERSPEED
                    const extra = (p.type === 'OVERSPEED' && p.durationSeconds)
                        ? `  (${Math.round(p.durationSeconds)}s en excès)`
                        : '';

                    doc.text(`  ${desc}${extra}`, margin + 2, y + 4);
                    doc.setTextColor(180, 0, 0);
                    doc.setFont(undefined, 'bold');
                    doc.text(`+${Math.round(p.cost)} s`, margin + colW - 2, y + 4, { align: 'right' });
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(0, 0, 0);
                    y += 5.5;
                });
                y += 4;
            });
        }

        // ── Pied de page ─────────────────────────────────────────────
        const pageCount = doc.getNumberOfPages();
        for (let p = 1; p <= pageCount; p++) {
            doc.setPage(p);
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(
                `RallyRanking — ${eventName} — ${eventDate}  |  Page ${p}/${pageCount}`,
                pageW / 2, 292, { align: 'center' }
            );
        }

        doc.save(`Classement_${eventName.replace(/\s+/g, '_')}.pdf`);
    }


    /**
     * Formate un timestamp (ms) en HH:MM:SS
     */
    static formatTimestamp(ms) {
        if (!ms) return '--:--:--';
        const d = new Date(ms);
        return d.toTimeString().substring(0, 8);
    }

    /**
     * Génère une fiche A4 en PDF pour un concurrent
     * @param {object} competitorResult
     * @param {object} engine
     * @param {object} roadbook  — { waypoints, trackPoints }
     * @param {HTMLCanvasElement} canvas — canvas caché pour le rendu carte
     * @param {object} eventInfo — { name, date }
     */
    static async generatePDF(competitorResult, engine, roadbook, canvas, eventInfo = {}) {
        if (!window.jspdf) {
            console.error("jsPDF not loaded");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

        const pageW = 210;
        const margin = 15;
        const colW = pageW - margin * 2;

        const eventName = eventInfo.name || 'Rallye';
        const eventDate = eventInfo.date || new Date().toLocaleDateString('fr-FR');

        // ── En-tête ──────────────────────────────────────────────────
        doc.setFillColor(30, 30, 60);
        doc.rect(0, 0, pageW, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text(eventName, pageW / 2, 10, { align: 'center' });
        doc.setFontSize(14);
        doc.text("Fiche de Résultat Officiel", pageW / 2, 18, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.text(`Concurrent : ${competitorResult.name}  —  ${eventDate}`, pageW / 2, 24, { align: 'center' });

        doc.setTextColor(0, 0, 0);
        let y = 36;

        // ── Résumé des temps ─────────────────────────────────────────
        doc.setFontSize(10);
        const times = [
            ['Temps Spéciale Brut',      engine.formatTime(competitorResult.grossTime)],
            ['Temps Neutralisé (déduit)', `- ${engine.formatTime(competitorResult.neutralizedTime)}`],
            ['Pénalités Cumulées',        `+ ${engine.formatTime(competitorResult.totalPenalties)}`],
        ];
        times.forEach(([label, val]) => {
            doc.setFont(undefined, 'normal');
            doc.text(label, margin, y);
            doc.setFont(undefined, 'bold');
            doc.text(val, pageW - margin, y, { align: 'right' });
            y += 6;
        });

        doc.setDrawColor(30, 30, 60);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageW - margin, y);
        y += 5;

        doc.setFont(undefined, 'bold');
        doc.setFontSize(12);
        doc.text('Temps Final Corrigé', margin, y);
        doc.text(engine.formatTime(competitorResult.score), pageW - margin, y, { align: 'right' });
        y += 10;

        // ── Tableau des Waypoints ─────────────────────────────────────
        doc.setFont(undefined, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 30, 60);
        doc.text("Validation des Waypoints", margin, y);
        y += 4;

        // Colonnes : N° | Type | Heure | Statut
        const wpCols  = [0, 14, 30, 62];  // offsets depuis margin
        const wpLabels = ['N°', 'Type', 'Heure', 'Statut / Détail'];

        doc.setFillColor(30, 30, 60);
        doc.rect(margin, y, colW, 6, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(8);
        wpLabels.forEach((lbl, i) => doc.text(lbl, margin + wpCols[i] + 1, y + 4.2));
        y += 6;

        doc.setFont(undefined, 'normal');
        competitorResult.wpLog.forEach((entry, idx) => {
            const w = entry.waypoint;
            const isOk = entry.status === 'VALID';
            doc.setFillColor(...(isOk ? [240, 255, 240] : [255, 232, 232]));
            doc.rect(margin, y, colW, 5.5, 'F');

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(8);
            doc.text(w.name || String(idx + 1), margin + wpCols[0] + 1, y + 4);
            doc.text((w.type || '').toUpperCase(), margin + wpCols[1] + 1, y + 4);
            doc.text(ExportTools.formatTimestamp(entry.time), margin + wpCols[2] + 1, y + 4);

            if (isOk) {
                doc.setTextColor(0, 120, 0);
                doc.text(`✓ Validé  (à ${Math.round(entry.dist || 0)} m)`, margin + wpCols[3] + 1, y + 4);
            } else {
                doc.setTextColor(180, 0, 0);
                doc.text(`✗ ${entry.status === 'MISSED' ? 'Raté' : 'Non atteint'}`, margin + wpCols[3] + 1, y + 4);
            }
            doc.setTextColor(0, 0, 0);
            y += 5.5;
            if (y > 272) { doc.addPage(); y = 15; }
        });

        y += 7;

        // ── Tableau des Pénalités ─────────────────────────────────────
        if (competitorResult.penaltiesBox.length > 0) {
            if (y > 220) { doc.addPage(); y = 15; }

            doc.setFont(undefined, 'bold');
            doc.setFontSize(11);
            doc.setTextColor(30, 30, 60);
            doc.text("Détail des Pénalités", margin, y);
            y += 4;

            // Colonnes : Type | Description | Durée excès | Pénalité
            const penCols   = [0, 32, 125, 155];
            const penLabels = ['Type', 'Description', 'Durée excès', 'Pénalité'];

            doc.setFillColor(80, 20, 20);
            doc.rect(margin, y, colW, 6, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont(undefined, 'bold');
            doc.setFontSize(8);
            penLabels.forEach((lbl, i) => doc.text(lbl, margin + penCols[i] + 1, y + 4.2));
            y += 6;

            doc.setFont(undefined, 'normal');
            competitorResult.penaltiesBox.forEach((p, idx) => {
                doc.setFillColor(...(idx % 2 === 0 ? [255, 248, 248] : [255, 255, 255]));
                doc.rect(margin, y, colW, 5.5, 'F');

                doc.setTextColor(0, 0, 0);
                doc.setFontSize(8);
                doc.text(p.type, margin + penCols[0] + 1, y + 4);

                // Description (tronquée si trop longue)
                let desc = p.desc || '';
                if (desc.length > 50) desc = desc.substring(0, 48) + '…';
                doc.text(desc, margin + penCols[1] + 1, y + 4);

                // Durée d'excès (OVERSPEED uniquement)
                if (p.type === 'OVERSPEED' && p.durationSeconds !== undefined) {
                    doc.setTextColor(180, 60, 0);
                    doc.text(`${Math.round(p.durationSeconds)} s`, margin + penCols[2] + 1, y + 4);
                } else {
                    doc.setTextColor(120, 120, 120);
                    doc.text('--', margin + penCols[2] + 1, y + 4);
                }

                doc.setTextColor(180, 0, 0);
                doc.setFont(undefined, 'bold');
                doc.text(`+ ${Math.round(p.cost)} s`, margin + penCols[3] + 1, y + 4);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(0, 0, 0);

                y += 5.5;
                if (y > 272) { doc.addPage(); y = 15; }
            });
        }

        // ── Carte ────────────────────────────────────────────────────
        if (canvas && roadbook) {
            doc.addPage();
            doc.setFont(undefined, 'bold');
            doc.setFontSize(12);
            doc.setTextColor(30, 30, 60);
            doc.text('Carte du Parcours', margin, 18);

            try {
                const mapDataUrl = MapCanvas.renderToCanvas(canvas, roadbook, competitorResult);
                // Calcul de la taille pour remplir la page (A4 = 210x297mm, marges = 15mm)
                const imgW = pageW - margin * 2;
                const imgH = Math.round(imgW * (canvas.height / canvas.width));
                doc.addImage(mapDataUrl, 'PNG', margin, 24, imgW, imgH);
            } catch (err) {
                console.error('Erreur rendu carte PDF', err);
                doc.setFontSize(10);
                doc.setTextColor(150, 0, 0);
                doc.text('Impossible de générer la carte.', margin, 30);
            }
        }

        doc.save(`Fiche_${competitorResult.name}.pdf`);
    }
}
