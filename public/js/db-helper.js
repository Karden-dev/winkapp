// public/js/db-helper.js

(function() {
  'use strict';

  /**
   * Ouvre ou crée la base de données IndexedDB.
   * C'est ici que nous définissons la structure de notre base de données locale.
   */
  function openDatabase() {
    // Si le navigateur ne supporte pas les PWA, on ne fait rien.
    if (!navigator.serviceWorker) {
      return Promise.resolve();
    }

    // On ouvre une base de données nommée 'wink-sync-db'.
    // Le '1' est le numéro de version. Si on doit changer la structure, on l'incrémentera.
    return idb.openDB('wink-sync-db', 1, {
      upgrade(db) {
        // Cette fonction s'exécute uniquement à la création ou à la mise à jour de la version.
        // On crée un "magasin d'objets" (similaire à une table SQL) pour stocker nos requêtes en attente.
        db.createObjectStore('sync-requests', { keyPath: 'id', autoIncrement: true });
      }
    });
  }

  // On lance l'ouverture de la base de données et on garde la promesse.
  const dbPromise = openDatabase();

  /**
   * L'objet `syncManager` est notre interface simplifiée pour interagir avec IndexedDB.
   * On l'attache à l'objet `window` pour le rendre accessible depuis nos autres scripts (orders.js, etc.).
   */
  const syncManager = {
    /**
     * Récupère toutes les requêtes en attente de synchronisation.
     * @returns {Promise<Array>}
     */
    getAll: async function() {
      const db = await dbPromise;
      if (!db) return [];
      return db.getAll('sync-requests');
    },

    /**
     * Ajoute une nouvelle requête à la file d'attente de synchronisation.
     * @param {object} request - L'objet contenant { url, method, payload }.
     */
    put: async function(request) {
      const db = await dbPromise;
      if (!db) return;
      return db.put('sync-requests', request);
    },

    /**
     * Supprime une requête de la file d'attente (après une synchronisation réussie).
     * @param {number} id - L'ID de la requête à supprimer.
     */
    delete: async function(id) {
      const db = await dbPromise;
      if (!db) return;
      return db.delete('sync-requests', id);
    }
  };

  // On expose notre manager pour qu'il soit globalement accessible.
  window.syncManager = syncManager;

})();