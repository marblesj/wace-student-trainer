// firebase-sync.js -- Firebase Firestore sync layer
// ENCODING: This file MUST be pure ASCII.
//
// This module provides a transparent sync layer between the local IndexedDB
// (fast, offline-capable) and Firebase Firestore (cloud, shared with teacher).
//
// Architecture:
//   - All reads come from local IndexedDB (fast)
//   - All writes go to BOTH IndexedDB AND Firestore
//   - On app load, Firestore data is pulled and merged into IndexedDB
//   - If Firestore is unavailable, the app works fine from IndexedDB alone
//
// This means the app works offline and syncs when connectivity is available.

"use strict";

var FirebaseSync = {
    db: null,           // Firestore database reference
    auth: null,         // Firebase auth reference
    studentId: null,    // Unique student identifier
    classCode: null,    // Class code for grouping
    enabled: false,     // Whether Firebase is configured and working
    _syncQueue: [],     // Queue of writes to retry if offline

    /**
     * Initialise Firebase connection.
     * Called during app startup (non-blocking -- app works without it).
     */
    init: function(config) {
        return new Promise(function(resolve, reject) {
            // Check if Firebase is configured
            if (typeof FIREBASE_ENABLED === "undefined" || !FIREBASE_ENABLED) {
                console.log("FirebaseSync: Not enabled (configure firebase-config.js)");
                reject(new Error("Firebase not configured"));
                return;
            }

            if (typeof firebase === "undefined") {
                console.warn("FirebaseSync: Firebase SDK not loaded");
                reject(new Error("Firebase SDK not loaded"));
                return;
            }

            try {
                // Initialise Firebase app (if not already done)
                if (!firebase.apps.length) {
                    firebase.initializeApp(FIREBASE_CONFIG);
                }

                FirebaseSync.db = firebase.firestore();
                FirebaseSync.auth = firebase.auth();
                FirebaseSync.classCode = CLASS_CODE || "default";

                // Sign in anonymously (creates a unique device ID)
                FirebaseSync.auth.signInAnonymously().then(function(credential) {
                    console.log("FirebaseSync: Authenticated (anonymous)");

                    // Build student ID from config
                    if (config && config.studentName) {
                        var safeName = config.studentName
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, "_")
                            .replace(/_+/g, "_")
                            .replace(/^_|_$/g, "");
                        FirebaseSync.studentId = FirebaseSync.classCode + "_" + safeName;
                    } else {
                        // No name yet (first run) -- will be set after welcome screen
                        FirebaseSync.studentId = null;
                    }

                    FirebaseSync.enabled = true;
                    console.log("FirebaseSync: Ready (student: " +
                        (FirebaseSync.studentId || "pending") + ")");

                    // For returning users, pull their cloud data into IndexedDB
                    if (FirebaseSync.studentId) {
                        FirebaseSync.pullAll().then(function() {
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                }).catch(function(err) {
                    console.warn("FirebaseSync: Auth failed:", err.message);
                    reject(err);
                });

            } catch (err) {
                console.warn("FirebaseSync: Init failed:", err.message);
                reject(err);
            }
        });
    },

    /**
     * Set the student identity (called after welcome screen).
     */
    setStudent: function(studentName, classCode) {
        if (classCode) FirebaseSync.classCode = classCode;
        var safeName = studentName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
        FirebaseSync.studentId = FirebaseSync.classCode + "_" + safeName;
        console.log("FirebaseSync: Student set to " + FirebaseSync.studentId);

        // Write profile
        FirebaseSync._writeDoc("students", FirebaseSync.studentId, {
            name: studentName,
            classCode: FirebaseSync.classCode,
            lastActive: new Date().toISOString(),
            firstSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, true);

        // Pull any existing cloud data (restores progress after device wipe)
        return FirebaseSync.pullAll();
    },

    // ========================================================================
    // SYNC OPERATIONS
    // These are called by the app alongside IndexedDB writes.
    // ========================================================================

    /**
     * Sync a mastery record to Firestore.
     * Called whenever MasteryEngine updates a problem type's status.
     */
    syncMastery: function(problemType, masteryRecord) {
        if (!FirebaseSync.enabled || !FirebaseSync.studentId) return;
        var docPath = "students/" + FirebaseSync.studentId + "/mastery";
        // Use problem type as doc ID (sanitised)
        var docId = problemType.replace(/[\/\\.#$\[\]]/g, "_");
        FirebaseSync._writeDoc(docPath, docId, masteryRecord);
    },

    /**
     * Sync a question history record to Firestore.
     */
    syncQuestionHistory: function(filename, historyRecord) {
        if (!FirebaseSync.enabled || !FirebaseSync.studentId) return;
        var docPath = "students/" + FirebaseSync.studentId + "/questionHistory";
        var docId = filename.replace(/[\/\\.#$\[\]]/g, "_");
        FirebaseSync._writeDoc(docPath, docId, historyRecord);
    },

    /**
     * Sync a session record to Firestore.
     */
    syncSession: function(sessionRecord) {
        if (!FirebaseSync.enabled || !FirebaseSync.studentId) return;
        var docPath = "students/" + FirebaseSync.studentId + "/sessions";
        var docId = "session_" + Date.now();
        FirebaseSync._writeDoc(docPath, docId, sessionRecord);
    },

    /**
     * Update the student's last-active timestamp.
     * Called periodically and on session end.
     */
    heartbeat: function() {
        if (!FirebaseSync.enabled || !FirebaseSync.studentId) return;
        FirebaseSync._writeDoc("students", FirebaseSync.studentId, {
            lastActive: new Date().toISOString()
        }, true);
    },

    // ========================================================================
    // PULL (load from Firestore into IndexedDB on startup)
    // ========================================================================

    /**
     * Pull all student data from Firestore and merge into IndexedDB.
     * Firestore wins on conflicts (it's the authoritative cloud copy).
     * Returns a Promise.
     */
    pullAll: function() {
        if (!FirebaseSync.enabled || !FirebaseSync.studentId) {
            return Promise.resolve();
        }

        console.log("FirebaseSync: Pulling data from cloud...");
        var studentRef = FirebaseSync.db.collection("students")
            .doc(FirebaseSync.studentId);

        return Promise.all([
            FirebaseSync._pullCollection(studentRef.collection("mastery"), STORE_MASTERY, "problemType"),
            FirebaseSync._pullCollection(studentRef.collection("questionHistory"), STORE_HISTORY, "filename"),
            FirebaseSync._pullCollection(studentRef.collection("sessions"), STORE_SESSIONS, null)
        ]).then(function(results) {
            var total = results.reduce(function(sum, n) { return sum + n; }, 0);
            console.log("FirebaseSync: Pulled " + total + " records from cloud");
        }).catch(function(err) {
            console.warn("FirebaseSync: Pull failed (working offline):", err.message);
        });
    },

    /**
     * Pull a Firestore collection and merge into an IndexedDB store.
     */
    _pullCollection: function(collRef, storeName, keyField) {
        return collRef.get().then(function(snapshot) {
            var promises = [];
            snapshot.forEach(function(doc) {
                var data = doc.data();
                if (keyField && !data[keyField]) {
                    data[keyField] = doc.id;
                }
                promises.push(DB.put(storeName, data));
            });
            return Promise.all(promises).then(function() {
                return snapshot.size;
            });
        });
    },

    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================

    /**
     * Write a document to Firestore (with retry queue for offline).
     */
    _writeDoc: function(collectionPath, docId, data, merge) {
        if (!FirebaseSync.db) return;

        // Add timestamp
        var writeData = Object.assign({}, data, {
            _lastSync: new Date().toISOString()
        });

        var ref = FirebaseSync.db.collection(collectionPath).doc(docId);
        var options = merge ? { merge: true } : {};

        ref.set(writeData, options).catch(function(err) {
            console.warn("FirebaseSync: Write failed for " +
                collectionPath + "/" + docId + ":", err.message);
            // Queue for retry (will be retried next heartbeat)
            FirebaseSync._syncQueue.push({
                path: collectionPath,
                docId: docId,
                data: writeData,
                merge: !!merge
            });
        });
    },

    /**
     * Retry any queued writes (called periodically).
     */
    retryQueue: function() {
        if (!FirebaseSync.enabled || FirebaseSync._syncQueue.length === 0) return;

        var queue = FirebaseSync._syncQueue.slice();
        FirebaseSync._syncQueue = [];

        queue.forEach(function(item) {
            var ref = FirebaseSync.db.collection(item.path).doc(item.docId);
            var options = item.merge ? { merge: true } : {};
            ref.set(item.data, options).catch(function() {
                // Re-queue if still failing
                FirebaseSync._syncQueue.push(item);
            });
        });
    }
};

// Retry queued writes every 30 seconds
setInterval(function() {
    FirebaseSync.retryQueue();
    FirebaseSync.heartbeat();
}, 30000);
