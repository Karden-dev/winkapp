// public/sw.js
// Version 2.4 - Mise à jour pour les pages Rider séparées et rider-common.js

// Import du script helper pour la base de données locale (IndexedDB)
importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js');

// --- MISE À JOUR ICI : Version incrémentée ---
const STATIC_CACHE_NAME = 'wink-express-static-v23'; // Cache pour les fichiers de l'application
// --- FIN MISE À JOUR ---
const DATA_CACHE_NAME = 'wink-express-data-v4';   // Cache pour les données API (inchangé)

// Liste complète des fichiers essentiels
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/orders.html',
  '/preparation.html', // Ajouté (était manquant dans l'original mais présent dans l'HTML)
  '/deliverymen.html',
  '/shops.html',
  '/reports.html',
  '/remittances.html',
  '/debts.html',
  '/cash.html',
  '/users.html',
  '/suivis.html', // Ajouté (était manquant dans l'original mais présent dans l'HTML)

  // --- NOUVELLES PAGES RIDER ---
  '/rider-today.html',
  '/rider-myrides.html',
  '/rider-relaunch.html',
  '/rider-returns.html',
  // --- FIN NOUVELLES PAGES ---

  '/ridercash.html',
  '/rider-performance.html',

  // --- SCRIPTS JS ---
  '/js/auth.js',
  '/js/login.js',
  '/js/pwa-loader.js',
  '/js/db-helper.js',
  '/js/rider-common.js', // Ajout du fichier commun
  '/js/rider.js',        // Fichier adapté
  '/js/reports.js',
  '/js/cash.js',
  '/js/ridercash.js',
  '/js/orders.js',
  '/js/shops.js',
  '/js/users.js',
  '/js/deliverymenManager.js',
  '/js/rider-performance.js',
  '/js/remittances.js',
  '/js/debts.js',
  '/js/dashboard.js',    // Ajouté (était manquant dans l'original)
  '/js/preparation.js',  // Ajouté (était manquant dans l'original)
  '/js/suivis.js',       // Ajouté (était manquant dans l'original)

  // --- LIENS CDN ---
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/bootstrap-icons/1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js',
  'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js',
  'https://cdn.jsdelivr.net/npm/moment@2.29.1/moment.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/locale/fr.min.js', // Ajouté locale fr
  'https://cdn.jsdelivr.net/npm/chart.js',

  // --- RESSOURCES STATIQUES ---
  '/wink.png',
  '/wink-logo.png',
  '/favicon.ico',
  '/icons/wink-icon-192x192.png',
  '/icons/wink-icon-512x512.png',
  '/sound.mp3'
  // Ne pas inclure manifest.json ici, il est géré par le navigateur
];

const DB_NAME = 'wink-sync-db';
const STORE_NAME = 'sync-requests';

// --- Événements du Cycle de Vie (Installation, Activation) ---

self.addEventListener('install', event => {
  console.log('[Service Worker] Tentative d\'installation (v16)...'); // Version mise à jour
  self.skipWaiting(); // Force l'activation immédiate
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then(cache => {
      console.log('[Service Worker] Mise en cache des fichiers de l\'application (v16).');
      // Utiliser addAll avec { cache: 'reload' } peut aider à forcer le rafraîchissement depuis le réseau
      // mais peut échouer si une seule ressource est indisponible. addAll standard est plus robuste.
      return cache.addAll(URLS_TO_CACHE);
    }).catch(error => {
        console.error('[Service Worker] Échec de la mise en cache lors de l\'installation:', error);
        // Tenter de mettre en cache individuellement pour identifier le fichier problématique
        URLS_TO_CACHE.forEach(url => {
            caches.open(STATIC_CACHE_NAME).then(cache => cache.add(url).catch(err => console.warn(`Échec cache pour ${url}:`, err)));
        });
    })
  );
});

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activation (v16)...'); // Version mise à jour
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('wink-express-static-') && name !== STATIC_CACHE_NAME)
          .map(name => {
            console.log(`[Service Worker] Suppression de l'ancien cache statique: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => {
        console.log('[Service Worker] Contrôle des clients revendiqué.');
        return self.clients.claim(); // Prend le contrôle immédiat
    })
  );
});

// --- Événement Fetch (Interception des requêtes) ---

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Stratégie API: Network First, then Cache (GET uniquement)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') {
      return; // Ignorer POST, PUT, DELETE pour le cache API
    }
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then(cache => {
        return fetch(request)
          .then(networkResponse => {
            if (networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(async () => {
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
              console.log(`[SW] API servie depuis cache: ${request.url}`);
              return cachedResponse;
            }
            console.error(`[SW] API non dispo (offline/non cachée): ${request.url}`);
            return new Response(JSON.stringify({ error: "Offline et ressource API non mise en cache." }), {
              status: 503, headers: { 'Content-Type': 'application/json' }
            });
          });
      })
    );
    return;
  }

  // Stratégie pour les autres ressources (HTML, CSS, JS, Images...): Cache First, then Network
  // On ne limite plus aux URLS_TO_CACHE explicitement pour plus de flexibilité,
  // mais on priorise le cache s'il existe.
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      // Si trouvé dans le cache statique, on le retourne
      if (cachedResponse) {
        return cachedResponse;
      }
      // Sinon, on va sur le réseau
      return fetch(request).then(networkResponse => {
        // Optionnel : Mettre en cache dynamique les nouvelles ressources statiques accédées ?
        // if (networkResponse.ok && url.origin === self.location.origin) {
        //   caches.open(STATIC_CACHE_NAME).then(cache => cache.put(request, networkResponse.clone()));
        // }
        return networkResponse;
      }).catch(error => {
          console.error(`[SW] Échec fetch réseau pour ${request.url}:`, error);
          // Optionnel : Retourner une page offline générique ici si nécessaire
          // return caches.match('/offline.html');
      });
    })
  );
});

// --- Gestion de la Synchronisation en Arrière-plan (inchangé) ---

self.addEventListener('sync', event => {
  if (event.tag === 'sync-failed-requests') {
    console.log('[Service Worker] Événement Sync reçu pour sync-failed-requests.');
    event.waitUntil(replayAllFailedRequests());
  }
});

async function replayAllFailedRequests() {
  try {
    const db = await idb.openDB(DB_NAME, 1);
    const allRequests = await db.getAll(STORE_NAME);
    console.log(`[Service Worker] Rejeu de ${allRequests.length} requête(s) en attente.`);

    const results = await Promise.allSettled(
        allRequests.map(async (request) => {
            console.log(`[SW] Rejeu ID ${request.id}: ${request.method} ${request.url}`);
            try {
                const response = await fetch(request.url, {
                    method: request.method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${request.token}`
                    },
                    body: JSON.stringify(request.payload)
                });

                if (response.ok) {
                    console.log(`[SW] Rejeu ID ${request.id} réussi. Suppression.`);
                    await db.delete(STORE_NAME, request.id);
                    return { id: request.id, status: 'fulfilled' };
                } else {
                    console.error(`[SW] Échec rejeu ID ${request.id}, statut: ${response.status}`);
                    if (response.status >= 400 && response.status < 500) {
                        console.warn(`[SW] Suppression ID ${request.id} car erreur client (${response.status}).`);
                        await db.delete(STORE_NAME, request.id);
                        return { id: request.id, status: 'rejected', reason: `Client error ${response.status}` };
                    }
                    return { id: request.id, status: 'rejected', reason: `Server error ${response.status}` };
                }
            } catch (error) {
                 console.error(`[SW] Erreur réseau rejeu ID ${request.id}:`, error);
                 return { id: request.id, status: 'rejected', reason: 'Network error' };
            }
        })
    );
    console.log('[Service Worker] Fin traitement synchronisation.');
    results.forEach(result => {
        if(result.status === 'rejected') {
            console.warn(`[SW] Échec final/temporaire ID ${result.value?.id || '?'}: ${result.reason}`);
        }
    });

  } catch (error) {
    console.error('[Service Worker] Erreur majeure rejeu sync:', error);
    throw error; // Relancer pour que le navigateur réessaie
  }
}