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
     * Génère une fiche A4 en PDF pour un concurrent
     */
    static async generatePDF(competitorResult, engine) {
        if (!window.jspdf) {
            console.error("jsPDF not loaded");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });

        // Tête de page
        doc.setFontSize(22);
        doc.text("Fiche de Résultat Officiel", 105, 20, null, null, "center");

        doc.setFontSize(14);
        doc.text(`Concurrent: ${competitorResult.name}`, 20, 35);
        
        doc.setFontSize(11);
        doc.text(`Temps Spéciale Brut : ${engine.formatTime(competitorResult.grossTime)}`, 20, 45);
        doc.text(`Temps Neutralisé : ${engine.formatTime(competitorResult.neutralizedTime)}`, 20, 50);
        doc.text(`Pénalités Cumulées : ${engine.formatTime(competitorResult.totalPenalties)}`, 20, 55);
        doc.setFont(undefined, 'bold');
        doc.text(`Temps Final : ${engine.formatTime(competitorResult.score)}`, 20, 65);
        doc.setFont(undefined, 'normal');

        // Tableau des Pénalités
        doc.setFontSize(14);
        doc.text("Détail des Pénalités", 20, 80);
        
        let y = 90;
        doc.setFontSize(9);
        if (competitorResult.penaltiesBox.length === 0) {
            doc.text("Aucune pénalité !", 20, y);
        } else {
            competitorResult.penaltiesBox.forEach(p => {
                doc.text(`- [${p.type}] ${p.desc} => +${Math.round(p.cost)} secondes`, 20, y);
                y += 6;
                if(y > 270) {
                    doc.addPage();
                    y = 20;
                }
            });
        }

        // TODO: Leaflet map screenshot to PDF (requires hidden div and html2canvas)

        doc.save(`Fiche_${competitorResult.name}.pdf`);
    }
}
