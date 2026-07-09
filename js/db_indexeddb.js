/**
 * db_indexeddb.js - Zero-Dependency IndexedDB Persistence Driver for OctaneFlow
 * Safely migrates from 5MB localStorage to unlimited structured browser storage.
 */
(function() {
  const DB_NAME = "OctaneFlowDB";
  const DB_VERSION = 1;
  const STORE_NAME = "key_value_store";
  const DB_KEY = "primary_db";

  let dbInstance = null;

  // Initialize and open IndexedDB
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = function(e) {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };

      request.onerror = function(e) {
        console.error("[IndexedDB] Failed to open database:", e.target.error);
        reject(e.target.error);
      };
    });
  }

  // Asynchronously save the database object
  window.saveAppDatabase = function(data) {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await openDatabase();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        
        // Strip temporary _idx index fields before serializing
        const cleanData = { ...data };
        delete cleanData._idx;

        const request = store.put(cleanData, DB_KEY);

        request.onsuccess = function() {
          resolve(true);
        };

        request.onerror = function(e) {
          console.error("[IndexedDB] Save transaction error:", e.target.error);
          reject(e.target.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  };

  // Asynchronously load the database object with auto-migration helper
  window.loadAppDatabase = function() {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await openDatabase();
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(DB_KEY);

        request.onsuccess = async function(e) {
          let record = e.target.result;

          // Check if we need to migrate from legacy localStorage
          if (!record) {
            const legacyStr = localStorage.getItem("octaneflow_db");
            if (legacyStr) {
              try {
                record = JSON.parse(legacyStr);
                console.log("[IndexedDB] Legacy database found in localStorage. Migrating to IndexedDB...");
                await window.saveAppDatabase(record);
                localStorage.removeItem("octaneflow_db");
                console.log("[IndexedDB] Migration complete. Legacy localStorage database entry deleted.");
              } catch (err) {
                console.error("[IndexedDB] Failed to parse legacy database:", err);
              }
            }
          }

          resolve(record || null);
        };

        request.onerror = function(e) {
          console.error("[IndexedDB] Load transaction error:", e.target.error);
          reject(e.target.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  };

  console.log("[IndexedDB] Persistence driver initialized successfully.");
})();
