import { GeoTools } from './geo.js';

export class ScoringEngine {
    constructor(roadbook, config) {
        this.roadbook = roadbook;
        this.config = config;
    }

    getMissedWptPenalty(type) {
        let t = type ? type.toLowerCase() : '';
        if (this.config.wptPenalties[t] !== undefined) {
            return this.config.wptPenalties[t];
        }
        return this.config.wptPenalties.default || 900;
    }

    calculateCompetitor(competitor) {
        let tracks = competitor.tracks;
        let wpts = this.roadbook.waypoints;

        let result = {
            grossTime: 0,
            neutralizedTime: 0,
            netTime: 0,
            penaltiesBox: [],
            totalPenalties: 0,
            wpLog: [],
            score: 0,
            distanceTraveled: 0
        };

        if (tracks.length < 2) return result;

        let nextWptIdx = 0;
        let p_prev = tracks[0];
        
        // Status vars
        let inSpecial = false;
        let inDZ = false;
        let currentSpeedLimit = this.config.speedLimit;
        
        let inNeutral = false;
        let neutralStartPt = null;
        let neutralWpt = null;

        let dssTime = null;
        let assTime = null;

        for (let i = 1; i < tracks.length; i++) {
            let p_curr = tracks[i];
            
            // Advance distance
            result.distanceTraveled += GeoTools.distance(p_prev.lat, p_prev.lon, p_curr.lat, p_curr.lon);

            // 1. Waypoint Validation Validation (Look ahead for missed wpts)
            for (let j = nextWptIdx; j < wpts.length; j++) {
                let w = wpts[j];
                let d = GeoTools.distance(p_curr.lat, p_curr.lon, w.lat, w.lon);
                
                if (d <= w.clear) {
                    // Validé !
                    w.validationDist = d;
                    w.validationTime = p_curr.time;

                    // Les WPT précédents sont ratés
                    for (let k = nextWptIdx; k < j; k++) {
                        let missed = wpts[k];
                        result.penaltiesBox.push({
                            type: 'WPT_MISSED',
                            desc: `Waypoint non validé: ${missed.name} (${missed.type.toUpperCase()})`,
                            cost: this.getMissedWptPenalty(missed.type)
                        });
                        result.wpLog.push({ waypoint: missed, status: 'MISSED' });
                    }

                    result.wpLog.push({ waypoint: w, status: 'VALID', dist: d });
                    
                    // State mutations
                    if (w.type === 'dss') {
                        inSpecial = true;
                        dssTime = p_curr.time;
                    }
                    if (w.type === 'ass') {
                        inSpecial = false;
                        assTime = p_curr.time;
                    }

                    if (w.type === 'dz' || w.type === 'fz') {
                         inDZ = (w.type === 'dz');
                         if (inDZ && w.speedLimit) currentSpeedLimit = w.speedLimit;
                         if (!inDZ) currentSpeedLimit = this.config.speedLimit; // Revert to global
                    }

                    if (w.type === 'dn' || w.type === 'dt') {
                        inNeutral = true;
                        neutralStartPt = p_curr;
                        neutralWpt = w;
                    }

                    if (w.type === 'fn' || w.type === 'ft') {
                        if (inNeutral && neutralStartPt) {
                            let durMs = p_curr.time - neutralStartPt.time;
                            let durS = durMs / 1000;
                            result.neutralizedTime += durS;

                            // Check time window
                            let allowedMins = neutralWpt.timecontrol;
                            if (allowedMins) {
                                let allowedS = allowedMins * 60;
                                let late = durS - (allowedS + 59);
                                let early = allowedS - durS;

                                if (early > 0) {
                                    result.penaltiesBox.push({
                                        type: 'EARLY_CH',
                                        desc: `Sortie de neutralisation en avance (${Math.round(early)}s)`,
                                        cost: Math.round(early) * 60 // 1 minute per second early (stricte)
                                    });
                                } else if (late > 0) {
                                    result.penaltiesBox.push({
                                        type: 'LATE_CH',
                                        desc: `Sortie de neutralisation en retard (${Math.round(late)}s)`,
                                        cost: Math.round(late) // 1s per 1s late
                                    });
                                }
                            }
                        }
                        inNeutral = false;
                    }

                    nextWptIdx = j + 1;
                    break; // Move to next track point
                }
            } // end WPT loop

            // 2. Speed checking
            let v = GeoTools.speed(p_prev, p_curr);
            let limit = currentSpeedLimit;
            
            // On calcule seulement si vitesse anormale
            if (limit && v > limit) {
                let over = v - limit;
                let dtSeconds = (p_curr.time - p_prev.time) / 1000;
                // Formule: km/h au dessus * dt * coeff
                // coef par defaut: p. ex 0.05 seconde de penalty par m traversé... 
                // On utilise config.speedCoef
                let pen = over * dtSeconds * (this.config.speedCoef / 60); 

                // Optimisation: On devrait regrouper ces pénalités en segments continus sinon on a 10,000 pénalités
                let lastPen = result.penaltiesBox[result.penaltiesBox.length - 1];
                if (lastPen && lastPen.type === 'OVERSPEED' && lastPen.limit === limit && (p_curr.time - lastPen.lastTime) < 5000) {
                     lastPen.cost += pen;
                     lastPen.maxOver = Math.max(lastPen.maxOver, over);
                     lastPen.lastTime = p_curr.time;
                     lastPen.desc = `Survitesse continue (${Math.round(v)} km/h max, limite ${limit})`;
                } else {
                     result.penaltiesBox.push({
                        type: 'OVERSPEED',
                        desc: `Survitesse (${Math.round(v)} km/h > ${limit})`,
                        cost: pen,
                        limit: limit,
                        maxOver: over,
                        lastTime: p_curr.time
                    });
                }
            }

            p_prev = p_curr;
        }

        // Check unreached ASS
        for (let j = nextWptIdx; j < wpts.length; j++) {
            let missed = wpts[j];
            result.penaltiesBox.push({
                type: 'WPT_MISSED',
                desc: `Waypoint non atteint: ${missed.name} (${missed.type.toUpperCase()})`,
                cost: this.getMissedWptPenalty(missed.type)
            });
            result.wpLog.push({ waypoint: missed, status: 'NOT_REACHED' });
        }

        // Calculs temps
        if (dssTime && assTime) {
            result.grossTime = (assTime - dssTime) / 1000; // secondes
            result.netTime = result.grossTime - result.neutralizedTime;
        } else if (tracks.length > 0) {
            // mode dégradé si pas de DSS/ASS
            result.grossTime = (tracks[tracks.length-1].time - tracks[0].time) / 1000;
            result.netTime = result.grossTime;
        }

        // Totaux
        result.totalPenalties = result.penaltiesBox.reduce((acc, p) => acc + Math.round(p.cost), 0);
        result.score = result.netTime + result.totalPenalties;

        return result;
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "N/A";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
}
