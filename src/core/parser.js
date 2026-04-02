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

      const trackPoints = this.extractTrackPoints(xml);  // Avec timestamp obligatoire (concurrents)
      const routePoints = this.extractRoutePoints(xml);   // Sans timestamp (roadbook)
      const waypoints = this.extractWaypoints(xml);

      return { trackPoints, routePoints, waypoints };
  }

  // Points avec timestamp obligatoire — pour le calcul des concurrents
  static extractTrackPoints(xml) {
      const trkpts = Array.from(xml.getElementsByTagName('trkpt'));
      return trkpts.map((pt, index) => {
          const lat = parseFloat(pt.getAttribute('lat'));
          const lon = parseFloat(pt.getAttribute('lon'));
          const timeNode = pt.getElementsByTagName('time')[0];
          let time = null;
          if (timeNode && timeNode.textContent) {
              time = new Date(timeNode.textContent).getTime();
          }
          return { id: index, lat, lon, time };
      }).filter(pt => pt.time !== null);
  }

  // Tous les points de trace — pour l'affichage du roadbook ou de la trace sur la carte (pas de temps requis)
  static extractRoutePoints(xml) {
      // Tenter de récupérer trkpt (tracks) OU rtept (routes)
      const trkpts = Array.from(xml.getElementsByTagName('trkpt'));
      const rtepts = Array.from(xml.getElementsByTagName('rtept'));
      const allPts = trkpts.length >= rtepts.length ? trkpts : rtepts;
      
      return allPts.map((pt, index) => {
          const lat = parseFloat(pt.getAttribute('lat'));
          const lon = parseFloat(pt.getAttribute('lon'));
          return { id: index, lat, lon };
      }).filter(pt => !isNaN(pt.lat) && !isNaN(pt.lon));
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
                  const localName = child.localName ? child.localName.toLowerCase() : '';
                  const nodeNameLower = child.nodeName.toLowerCase();
                  
                  // Verification si c'est la balise du type de waypoint
                  // On trouve la balise si elle a open et clear, OU si c'est un nom connu
                  const isKnownType = ['dss', 'ass', 'dz', 'fz', 'wpm', 'wpe', 'wps', 'wpc', 'wpv', 'wpp', 'wpn', 'checkpoint', 'dn', 'fn', 'dt', 'ft'].includes(localName);
                  const hasProps = child.hasAttribute('open') || child.hasAttribute('clear');

                  // Si c'est un tag OpenRally décrivant le waypoint scoring
                  if ((prefix === 'openrally' || isKnownType) && (hasProps || isKnownType)) {
                      orNode = child;
                      
                      // Si on n'a pas encore défini de type fort, on le prend
                      if (!type || isKnownType) {
                          type = localName === 'waypointextension' ? null : localName;
                      }
                      
                      if (child.hasAttribute('open')) openRaw = parseFloat(child.getAttribute('open'));
                      if (child.hasAttribute('clear')) clearRaw = parseFloat(child.getAttribute('clear'));
                      if (child.hasAttribute('speed')) speedLimit = parseFloat(child.getAttribute('speed'));
                  }

                  // 1.b Support aussi de la structure enfant (<openrally:open>800</openrally:open>)
                  if (localName === 'open' && child.textContent) openRaw = parseFloat(child.textContent);
                  if (localName === 'clear' && child.textContent) clearRaw = parseFloat(child.textContent);
                  if (localName === 'waypointtype' && child.textContent) type = child.textContent.toLowerCase().trim();
                  if (localName === 'speed' && child.textContent) speedLimit = parseFloat(child.textContent);
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
          // Si on n'a ni OPEN ni CLEAR, ce n'est pas un waypoint validable
          let isScoringWpt = true;
          if (open === null && clear === null) {
              isScoringWpt = false;
          }

          // Defaults en cas de valeur partielle
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
