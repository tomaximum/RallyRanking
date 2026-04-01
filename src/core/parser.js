export class GPXParser {
  /**
   * Parse a GPX string and returns tracks and waypoints
   * @param {string} gpxString 
   */
  static parse(gpxString) {
      const parser = new DOMParser();
      // Remove bad characters if any or just parse
      const xml = parser.parseFromString(gpxString, "text/xml");
      
      const errorNode = xml.querySelector("parsererror");
      if (errorNode) {
          console.error("XML Parsing Error", errorNode.textContent);
          throw new Error("Erreur lors de la lecture du fichier GPX. Le format est invalide.");
      }

      const trackPoints = this.extractTrackPoints(xml);
      const waypoints = this.extractWaypoints(xml);

      return { trackPoints, waypoints };
  }

  static extractTrackPoints(xml) {
      // Pour une trace concurrent, on peut avoir plusieurs <trkseg>
      const trkpts = Array.from(xml.getElementsByTagName("trkpt"));
      return trkpts.map((pt, index) => {
          const lat = parseFloat(pt.getAttribute("lat"));
          const lon = parseFloat(pt.getAttribute("lon"));
          const timeNode = pt.getElementsByTagName("time")[0];
          
          let time = null;
          if (timeNode && timeNode.textContent) {
              time = new Date(timeNode.textContent).getTime(); // en ms
          }
          
          return { id: index, lat, lon, time };
      }).filter(pt => pt.time !== null); // Une trace valide a besoin de temps
  }

  static getExtNode(wpt, tagName) {
      const ext = wpt.getElementsByTagName("extensions")[0];
      if (!ext) return null;

      // 1. Essai avec le namespace wildcard
      let nodes = wpt.getElementsByTagNameNS("*", tagName);
      if (nodes.length > 0 && nodes[0].parentNode.nodeName !== 'wpt') return nodes[0];
      
      // 2. Essai sans prefix (si le xml utilise le namespace par défaut mal configuré)
      nodes = wpt.getElementsByTagName(tagName);
      if (nodes.length > 0 && nodes[0].parentNode.nodeName !== 'wpt') return nodes[0];

      // 3. Essai explicite
      nodes = wpt.getElementsByTagName(`openrally:${tagName}`);
      if (nodes.length > 0) return nodes[0];

      // 4. Fallback manuel en inspectant le nom local
      const allExts = ext.getElementsByTagName("*");
      for (let i = 0; i < allExts.length; i++) {
          let nodeName = allExts[i].localName || allExts[i].nodeName;
          if (nodeName.includes(":")) nodeName = nodeName.split(":")[1];
          if (nodeName === tagName) return allExts[i];
      }

      return null;
  }

  static extractWaypoints(xml) {
      const wpts = Array.from(xml.getElementsByTagName("wpt"));
      
      let parsedWpts = wpts.map(wpt => {
          const lat = parseFloat(wpt.getAttribute("lat"));
          const lon = parseFloat(wpt.getAttribute("lon"));
          const nameNode = wpt.getElementsByTagName("name")[0];
          const name = nameNode ? nameNode.textContent : "WPT";
          const descNode = wpt.getElementsByTagName("desc")[0];
          const desc = descNode ? descNode.textContent : "";

          let type = null;
          let openRaw = null;
          let clearRaw = null;
          let speedLimit = null;
          let timecontrol = null;
          let neutralization = null;

          // 1. Recherche du noeud OpenRally (ex: <openrally:dss open="800" clear="90">)
          const ext = wpt.getElementsByTagName("extensions")[0];
          let orNode = null;
          
          if (ext) {
              const children = ext.children;
              for (let i = 0; i < children.length; i++) {
                  const child = children[i];
                  const prefix = child.prefix || (child.nodeName.includes(':') ? child.nodeName.split(':')[0] : '');
                  
                  // Si préfixe openrally ou type reconnu
                  if (prefix === 'openrally' || ['dss', 'ass', 'dz', 'fz', 'wpm', 'wpe', 'wps', 'wpc', 'wpv', 'wpp', 'wpn', 'checkpoint', 'dn', 'fn', 'dt', 'ft'].includes(child.localName)) {
                      orNode = child;
                      type = child.localName.toLowerCase();
                      
                      if (child.hasAttribute('open')) openRaw = parseFloat(child.getAttribute('open'));
                      if (child.hasAttribute('clear')) clearRaw = parseFloat(child.getAttribute('clear'));
                      if (child.hasAttribute('speed')) speedLimit = parseFloat(child.getAttribute('speed'));
                      break;
                  }
              }
          }

          // 2. Recherche des autres balises spécifiques (timecontrol, neutralization, speed) si non trouvées
          if (speedLimit === null) {
              const spNode = this.getExtNode(wpt, "speed");
              if (spNode && spNode.textContent) speedLimit = parseFloat(spNode.textContent);
          }
          
          const tcNode = this.getExtNode(wpt, "timecontrol");
          if (tcNode && tcNode.hasAttribute("allowed")) {
              timecontrol = parseFloat(tcNode.getAttribute("allowed"));
          }

          const neutralNode = this.getExtNode(wpt, "neutralization");
          if (neutralNode && neutralNode.textContent) {
              neutralization = parseFloat(neutralNode.textContent);
          }

          // 3. Fallback "Rally Navigator" (desc) uniquement si absent du XML formel
          let open = openRaw !== null ? openRaw : this.extractFromDesc(desc, "O=");
          let clear = clearRaw !== null ? clearRaw : this.extractFromDesc(desc, "C=");
          if (speedLimit === null) speedLimit = this.extractFromDesc(desc, "S=");

          // Détermination de si c'est un waypoint de compétition ou juste une info visuelle
          // Si on n'a ni OPEN ni CLEAR (malgré le XML et le Fallback DESC), ce n'est pas un waypoint validable
          let isScoringWpt = true;
          if (open === null && clear === null) {
              isScoringWpt = false;
          }

          // Defaults en cas de valeur partiel
          if (open === null) open = Math.max(800, clear || 0);
          if (clear === null) clear = 90;

          return {
              lat, lon, name, desc, 
              type: type || 'wpm', 
              open: parseFloat(open), 
              clear: parseFloat(clear), 
              speedLimit: isNaN(speedLimit) ? null : speedLimit,
              timecontrol: isNaN(timecontrol) ? null : timecontrol,
              neutralization: isNaN(neutralization) ? null : neutralization,
              isScoringWpt
          };
      });

      // Filtre : on expurge les cases du roadbook pur
      return parsedWpts.filter(w => w.isScoringWpt);
  }

  static extractFromDesc(desc, prefix) {
      if (!desc) return null;
      // Cherche par exemple 'S=50', 'C=90', 'O=3000' (en ignorant la casse)
      const regex = new RegExp(`${prefix}\\s*(\\d+(?:\\.\\d+)?)`, "i");
      const match = desc.match(regex);
      return match ? parseFloat(match[1]) : null;
  }
}
