/**
 * SERVICE WORKER — Revue Juridique PWA
 * Gère la mise en cache pour une ouverture instantanée hors-ligne.
 */

const CACHE_NAME = "revue-juridique-v1";
const CACHE_DURATION_MS = 1000 * 60 * 30; // 30 minutes pour les données JSON

// Ressources statiques à mettre en cache immédiatement à l'installation
const STATIC_ASSETS = [
  "/index.html",
  "/manifest.json",
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap"
];

// --- INSTALLATION ---
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn("[SW] Impossible de mettre en cache certaines ressources :", err);
      });
    })
  );
  self.skipWaiting();
});

// --- ACTIVATION (nettoyage des anciens caches) ---
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log("[SW] Suppression du cache obsolète :", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// --- INTERCEPTION DES REQUÊTES ---
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes POST (likes, commentaires, sauvegarde admin)
  if (event.request.method !== "GET") return;

  // Stratégie pour les requêtes vers Google Apps Script (données JSON) :
  // Network First — essaie le réseau, sinon renvoie le cache
  if (url.hostname.includes("script.google.com")) {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }

  // Stratégie pour les polices Google : Cache First
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(cacheFirstStrategy(event.request));
    return;
  }

  // Stratégie pour les ressources statiques locales : Cache First avec fallback réseau
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStrategy(event.request));
    return;
  }

  // Par défaut : réseau normal
  event.respondWith(fetch(event.request));
});

// Network First : réseau prioritaire, cache en fallback
async function networkFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "Hors-ligne et aucun cache disponible.", articles: [] }), {
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Cache First : cache prioritaire, réseau en fallback
async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_) {
    // Ressource indisponible — retour silencieux
    return new Response("", { status: 503 });
  }
}
