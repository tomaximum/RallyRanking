/**
 * Service Worker — RallyRanking PWA
 * Stratégie : Cache First pour les assets statiques (app shell)
 * Les fichiers GPX chargés par l'utilisateur ne sont jamais mis en cache.
 */

const CACHE_NAME = 'rally-ranking-v2';

// Assets à mettre en cache pour un fonctionnement hors-ligne
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './src/ui/app.js',
    './src/ui/export.js',
    './src/ui/map.js',
    './src/ui/mapCanvas.js',
    './src/core/parser.js',
    './src/core/scoring.js',
    './src/core/geo.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    // Libs CDN
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap'
];

// ── Installation : pré-cache des assets ────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // On ignore les erreurs individuelles (ex: CDN indisponible)
            return Promise.allSettled(
                PRECACHE_ASSETS.map(url => cache.add(url).catch(() => {}))
            );
        }).then(() => self.skipWaiting())
    );
});

// ── Activation : suppression des anciens caches ─────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch : Cache First, fallback réseau ────────────────────────────
self.addEventListener('fetch', event => {
    // Ne pas intercepter les requêtes non-GET
    if (event.request.method !== 'GET') return;

    // Ne pas mettre en cache les tuiles de carte (trop nombreuses)
    const url = event.request.url;
    if (
        url.includes('tile.openstreetmap.org') ||
        url.includes('arcgisonline.com') ||
        url.includes('stamen-tiles')
    ) {
        return; // Laisse le navigateur gérer directement (avec son cache HTTP)
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                // Mettre en cache les nouvelles ressources statiques valides
                if (response && response.status === 200 && response.type !== 'opaque') {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
                }
                return response;
            });
        })
    );
});
