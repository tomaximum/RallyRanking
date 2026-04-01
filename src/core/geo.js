// Mathématiques et Géospatial

export class GeoTools {
    /**
     * Calcule la distance en mètres entre deux coordonnées géographiques
     * Formule de Haversine
     */
    static distance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Rayon de la terre en mètres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // mètres
    }

    /**
     * Calcule la vitesse en km/h entre deux points horaires
     * pt1 et pt2 doivent avoir {lat, lon, time} (time en ms)
     */
    static speed(pt1, pt2) {
        if (!pt1.time || !pt2.time || pt1.time === pt2.time) return 0;
        
        const d = this.distance(pt1.lat, pt1.lon, pt2.lat, pt2.lon); // mètres
        const t = Math.abs(pt2.time - pt1.time) / 1000; // secondes
        
        return (d / t) * 3.6; // m/s vers km/h
    }

    /**
     * Distance minimale d'un point à un segment géospatial
     * (Approximation sur plan local pour de petites distances < 1km)
     * Utile pour vérifier les écarts à la trajectoire (roadbook pt-pt).
     */
    static pointToSegmentDistance(p, a, b) {
        // En mètres, on peut approximer la terre comme plate sur un très petit bout
        // 1 degré lat = 111132 m, 1 degré lon = 111132 * cos(lat) m
        const lat2m = 111132;
        const lon2m = 111132 * Math.cos(p.lat * Math.PI / 180);

        const px = p.lon * lon2m, py = p.lat * lat2m;
        const ax = a.lon * lon2m, ay = a.lat * lat2m;
        const bx = b.lon * lon2m, by = b.lat * lat2m;

        const l2 = (ax - bx) ** 2 + (ay - by) ** 2;
        if (l2 === 0) return this.distance(p.lat, p.lon, a.lat, a.lon); // A = B

        let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
        t = Math.max(0, Math.min(1, t));

        const projx = ax + t * (bx - ax);
        const projy = ay + t * (by - ay);

        // Reconvertir en lat/lon pour réutiliser haversine parfait :
        return this.distance(p.lat, p.lon, projy / lat2m, projx / lon2m);
    }
}
