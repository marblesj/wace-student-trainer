// ============================================================================
// DATABASE LAYER (IndexedDB)
// ============================================================================
var DB = {
    db: null,

    /**
     * Open (or create) the IndexedDB database.
     * Creates all object stores on first run or version upgrade.
     */
    init: function() {
        return new Promise(function(resolve, reject) {
            if (DB.db) {
                resolve(DB.db);
                return;
            }
            var request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = function(event) {
                var db = event.target.result;
                console.log("IndexedDB: Creating/upgrading stores...");
                OBJECT_STORES.forEach(function(storeDef) {
                    if (!db.objectStoreNames.contains(storeDef.name)) {
                        var opts = { keyPath: storeDef.keyPath };
                        if (storeDef.autoIncrement) {
                            opts.autoIncrement = true;
                        }
                        db.createObjectStore(storeDef.name, opts);
                        console.log("  Created store: " + storeDef.name);
                    }
                });
            };

            request.onsuccess = function(event) {
                DB.db = event.target.result;
                console.log("IndexedDB: Opened successfully (" +
                    DB.db.objectStoreNames.length + " stores)");
                resolve(DB.db);
            };

            request.onerror = function(event) {
                console.error("IndexedDB: Failed to open", event.target.error);
                reject(event.target.error);
            };
        });
    },

    /**
     * Get a single record by key from an object store.
     */
    get: function(storeName, key) {
        return new Promise(function(resolve, reject) {
            var tx = DB.db.transaction(storeName, "readonly");
            var store = tx.objectStore(storeName);
            var request = store.get(key);
            request.onsuccess = function() { resolve(request.result || null); };
            request.onerror = function() { reject(request.error); };
        });
    },

    /**
     * Write (put) a record into an object store.
     */
    put: function(storeName, data) {
        return new Promise(function(resolve, reject) {
            var tx = DB.db.transaction(storeName, "readwrite");
            var store = tx.objectStore(storeName);
            var request = store.put(data);
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { reject(request.error); };
        });
    },

    /**
     * Get all records from an object store.
     */
    getAll: function(storeName) {
        return new Promise(function(resolve, reject) {
            var tx = DB.db.transaction(storeName, "readonly");
            var store = tx.objectStore(storeName);
            var request = store.getAll();
            request.onsuccess = function() { resolve(request.result || []); };
            request.onerror = function() { reject(request.error); };
        });
    },

    /**
     * Delete a record by key from an object store.
     */
    remove: function(storeName, key) {
        return new Promise(function(resolve, reject) {
            var tx = DB.db.transaction(storeName, "readwrite");
            var store = tx.objectStore(storeName);
            var request = store.delete(key);
            request.onsuccess = function() { resolve(); };
            request.onerror = function() { reject(request.error); };
        });
    },

    /**
     * Count records in an object store.
     */
    count: function(storeName) {
        return new Promise(function(resolve, reject) {
            var tx = DB.db.transaction(storeName, "readonly");
            var store = tx.objectStore(storeName);
            var request = store.count();
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { reject(request.error); };
        });
    },

    /**
     * Clear all records from an object store.
     */
    clear: function(storeName) {
        return new Promise(function(resolve, reject) {
            var tx = DB.db.transaction(storeName, "readwrite");
            var store = tx.objectStore(storeName);
            var request = store.clear();
            request.onsuccess = function() { resolve(); };
            request.onerror = function() { reject(request.error); };
        });
    },

    /**
     * Emergency reset: delete the entire database and reload.
     * Used when IndexedDB is corrupted beyond repair.
     */
    emergencyReset: function() {
        if (DB.db) DB.db.close();
        var request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = function() {
            console.log("Database deleted successfully. Reloading...");
            window.location.reload();
        };
        request.onerror = function() {
            console.error("Failed to delete database.");
            alert("Could not reset the database. Try clearing your browser data manually.");
        };
    }
};


