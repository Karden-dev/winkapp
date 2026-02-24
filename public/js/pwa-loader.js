// public/js/pwa-loader.js

// Ce script vérifie si le navigateur supporte les Service Workers
// et enregistre le nôtre si c'est le cas.
if ('serviceWorker' in navigator) {
  // On attend que la page soit complètement chargée pour ne pas ralentir le rendu initial.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        // Le service worker est bien enregistré.
        console.log('WinkDev PWA: ServiceWorker enregistré avec succès. Scope:', registration.scope);
      })
      .catch(error => {
        // Une erreur est survenue pendant l'enregistrement.
        console.error('WinkDev PWA: Échec de l\'enregistrement du ServiceWorker:', error);
      });
  });
}