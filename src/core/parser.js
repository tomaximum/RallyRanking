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
      return wpts.map(wpt => {
          const lat = parseFloat(wpt.getAttribute("lat"));
          const lon = parseFloat(wpt.getAttribute("lon"));
          const nameNode = wpt.getElementsByTagName("name")[0];
          const name = nameNode ? nameNode.textContent : "WPT";
          const descNode = wpt.getElementsByTagName("desc")[0];
          const desc = descNode ? descNode.textContent : "";

          // Lecture des extensions OpenRally
          const typeNode = this.getExtNode(wpt, "waypointType");
          const type = typeNode ? typeNode.textContent.toLowerCase().trim() : "wpm";

          const openNode = this.getExtNode(wpt, "open");
          const clearNode = this.getExtNode(wpt, "clear");
          const speedNode = this.getExtNode(wpt, "speed"); // Often inside speedType
          const tcNode = this.getExtNode(wpt, "timecontrol");
          const neutralNode = this.getExtNode(wpt, "neutralization"); // Often inside timeType

          // Parse with rally navigator fallback if extensions are missing
          let open = openNode ? parseFloat(openNode.textContent) : this.extractFromDesc(desc, "O=");
          let clear = clearNode ? parseFloat(clearNode.textContent) : this.extractFromDesc(desc, "C=");
          let speed = speedNode ? parseFloat(speedNode.textContent) : this.extractFromDesc(desc, "S=");
          
          let timecontrol = tcNode ? parseFloat(tcNode.getAttribute("allowed")) : null; // in minutes
          if (isNaN(timecontrol)) timecontrol = null;
          
          let neutralization = neutralNode ? parseFloat(neutralNode.textContent) : null; // in seconds

          // Default radius if nothing is provided
          if (!open) open = Math.max(800, clear || 0); // OpenRally default or logical
          if (!clear) clear = 90; // OpenRally default validation radius

          return {
              lat, 
              lon, 
              name, 
              desc, 
              type, 
              open: parseFloat(open), 
              clear: parseFloat(clear), 
              speedLimit: isNaN(speed) ? null : parseFloat(speed), // km/h
              timecontrol: isNaN(timecontrol) ? null : timecontrol, 
              neutralization: isNaN(neutralization) ? null : neutralization
          };
      });
  }

  static extractFromDesc(desc, prefix) {
      if (!desc) return null;
      // Cherche par exemple 'S=50', 'C=90', 'O=3000' (en ignorant la casse)
      const regex = new RegExp(`${prefix}\\s*(\\d+(?:\\.\\d+)?)`, "i");
      const match = desc.match(regex);
      return match ? parseFloat(match[1]) : null;
  }
}
