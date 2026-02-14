// access-codes.js -- One-time access code system
// ENCODING: This file MUST be pure ASCII.
//
// Flow:
//   1. Teacher generates unique codes via generate_codes.html (private tool)
//   2. Student visits URL -> sees access code entry screen
//   3. Student enters code + name -> app checks Firebase -> locks code to browser
//   4. Next visit -> auto-recognised, no code needed
//   5. Anyone else trying that code gets rejected
//
// FALLBACK: If Firebase is unreachable (school network blocks it), the app
// still works in local-only mode after a short timeout. The student enters
// their name, gets full personalised experience via IndexedDB, but progress
// won't sync to the teacher dashboard until Firebase becomes available.

"use strict";

var AccessControl = {
    TOKEN_KEY: "wace_device_token",
    CODE_KEY: "wace_access_code",
    NAME_KEY: "wace_student_name",
    TIMEOUT_MS: 4000,         // How long to wait for Firebase before falling back
    firebaseAvailable: false, // Set to true once Firebase responds successfully
    IDB_NAME: "wace_credentials",
    IDB_VERSION: 1,
    IDB_STORE: "creds",

    // ---- IndexedDB credential persistence ----

    /**
     * Open the small dedicated credentials IndexedDB.
     * @private
     */
    _openCredDB: function() {
        return new Promise(function(resolve, reject) {
            var request = indexedDB.open(AccessControl.IDB_NAME, AccessControl.IDB_VERSION);
            request.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(AccessControl.IDB_STORE)) {
                    db.createObjectStore(AccessControl.IDB_STORE, { keyPath: "key" });
                }
            };
            request.onsuccess = function(e) { resolve(e.target.result); };
            request.onerror = function(e) {
                console.warn("AccessControl: Credential IDB open failed", e.target.error);
                resolve(null);
            };
        });
    },

    /**
     * Save a credential to IndexedDB.
     * @private
     */
    _idbSet: function(key, value) {
        return AccessControl._openCredDB().then(function(db) {
            if (!db) return;
            return new Promise(function(resolve) {
                var tx = db.transaction(AccessControl.IDB_STORE, "readwrite");
                tx.objectStore(AccessControl.IDB_STORE).put({ key: key, value: value });
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { resolve(); };
            });
        }).catch(function() { /* silent */ });
    },

    /**
     * Get a credential from IndexedDB.
     * @private
     */
    _idbGet: function(key) {
        return AccessControl._openCredDB().then(function(db) {
            if (!db) return null;
            return new Promise(function(resolve) {
                var tx = db.transaction(AccessControl.IDB_STORE, "readonly");
                var req = tx.objectStore(AccessControl.IDB_STORE).get(key);
                req.onsuccess = function() {
                    resolve(req.result ? req.result.value : null);
                };
                req.onerror = function() { resolve(null); };
            });
        }).catch(function() { return null; });
    },

    /**
     * Save credentials to BOTH localStorage and IndexedDB.
     */
    _saveCredential: function(key, value) {
        localStorage.setItem(key, value);
        return AccessControl._idbSet(key, value);
    },

    /**
     * Remove a credential from BOTH stores.
     */
    _removeCredential: function(key) {
        localStorage.removeItem(key);
        return AccessControl._openCredDB().then(function(db) {
            if (!db) return;
            return new Promise(function(resolve) {
                var tx = db.transaction(AccessControl.IDB_STORE, "readwrite");
                tx.objectStore(AccessControl.IDB_STORE).delete(key);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { resolve(); };
            });
        }).catch(function() { /* silent */ });
    },

    /**
     * Restore localStorage from IndexedDB if localStorage was cleared.
     * Returns a promise that resolves when sync is done.
     * @private
     */
    _restoreFromIDB: function() {
        var keys = [AccessControl.TOKEN_KEY, AccessControl.CODE_KEY, AccessControl.NAME_KEY];
        var anyRestored = false;

        return keys.reduce(function(chain, key) {
            return chain.then(function() {
                var lsVal = localStorage.getItem(key);
                if (lsVal) return; // already have it
                return AccessControl._idbGet(key).then(function(idbVal) {
                    if (idbVal) {
                        localStorage.setItem(key, idbVal);
                        anyRestored = true;
                        console.log("AccessControl: Restored " + key + " from IndexedDB");
                    }
                });
            });
        }, Promise.resolve()).then(function() {
            if (anyRestored) {
                console.log("AccessControl: Credentials restored from IndexedDB backup");
            }
        });
    },

    /**
     * Race a promise against a timeout. Returns whichever resolves first.
     * @private
     */
    _withTimeout: function(promise, ms, fallbackValue) {
        return new Promise(function(resolve) {
            var done = false;
            var timer = setTimeout(function() {
                if (!done) {
                    done = true;
                    console.warn("AccessControl: Firebase timeout after " + ms + "ms, falling back");
                    resolve(fallbackValue);
                }
            }, ms);

            promise.then(function(result) {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    AccessControl.firebaseAvailable = true;
                    resolve(result);
                }
            }).catch(function(err) {
                if (!done) {
                    done = true;
                    clearTimeout(timer);
                    console.warn("AccessControl: Firebase error, falling back:", err.message);
                    resolve(fallbackValue);
                }
            });
        });
    },

    /**
     * Initialise access control. Returns a Promise that resolves with
     * { granted: true } if the student already has a valid claimed code,
     * or shows the access code screen and resolves { granted: false }
     * (initApp will be re-called after successful code entry).
     */
    init: function() {
        // If Firebase is not enabled, skip access control entirely
        if (!FIREBASE_ENABLED || !FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) {
            return Promise.resolve({ granted: true });
        }

        // Initialise Firebase if not already done
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }

        // First, restore any credentials from IndexedDB if localStorage was cleared
        return AccessControl._restoreFromIDB().then(function() {
            // Check if this browser already has a claimed code
            var existingCode = localStorage.getItem(AccessControl.CODE_KEY);
            var existingToken = localStorage.getItem(AccessControl.TOKEN_KEY);
            var existingName = localStorage.getItem(AccessControl.NAME_KEY);

            if (existingCode && existingToken) {
                // Try to verify with Firebase, but fall back after timeout
                var verifyPromise = AccessControl._verifyCodeExists(existingCode);
                return AccessControl._withTimeout(
                    verifyPromise,
                    AccessControl.TIMEOUT_MS,
                    { valid: true, alreadyMine: true, offline: true }
                ).then(function(result) {
                    if (result.valid && result.alreadyMine) {
                        if (result.offline) {
                            console.log("AccessControl: Firebase unreachable, granting access from local storage");
                        } else {
                            console.log("AccessControl: Code verified online, access granted");
                        }
                        return { granted: true };
                    }
                    // Code was revoked or reassigned -- show code screen
                    return AccessControl._removeCredential(AccessControl.CODE_KEY).then(function() {
                        return AccessControl._removeCredential(AccessControl.TOKEN_KEY);
                    }).then(function() {
                        AccessControl._showCodeScreen();
                        return { granted: false };
                    });
                });
            }

            // If we have a stored name but no code (local-only session), let them in
            if (existingName) {
                console.log("AccessControl: Returning local-only user: " + existingName);
                return { granted: true };
            }

            // No code stored -- show the access code entry screen
            AccessControl._showCodeScreen();
            return { granted: false };
        });
    },

    /**
     * Show the access code entry screen and set up event listeners.
     * @private
     */
    _showCodeScreen: function() {
        var screen = document.getElementById("access-code-screen");
        var input = document.getElementById("access-code-input");
        var btn = document.getElementById("access-code-btn");
        var errorEl = document.getElementById("access-code-error");
        var iconArea = document.getElementById("access-icon-area");

        if (!screen || !input || !btn) {
            console.warn("AccessControl: Code screen elements not found, skipping");
            initApp(); // Fallback -- proceed without access control
            return;
        }

        // Set graduation cap icon
        if (iconArea) iconArea.textContent = "\uD83C\uDF93";

        screen.style.display = "flex";

        // Enable button when input has content
        input.addEventListener("input", function() {
            btn.disabled = input.value.trim().length < 4;
            if (errorEl) errorEl.textContent = "";
        });

        // Handle Enter key
        input.addEventListener("keydown", function(e) {
            if (e.key === "Enter" && !btn.disabled) {
                btn.click();
            }
        });

        // Handle submit
        btn.addEventListener("click", function() {
            var code = input.value.trim().toUpperCase();
            btn.disabled = true;
            btn.textContent = "Checking...";

            // Try Firebase with timeout fallback
            var verifyPromise = AccessControl._verifyCodeExists(code);
            AccessControl._withTimeout(
                verifyPromise,
                AccessControl.TIMEOUT_MS,
                { valid: true, alreadyMine: false, offline: true }
            ).then(function(result) {
                // Firebase responded and code is invalid
                if (!result.valid) {
                    if (errorEl) errorEl.textContent = result.reason;
                    btn.disabled = false;
                    btn.textContent = "Continue";
                    return;
                }

                if (result.alreadyMine) {
                    // Re-use existing claim
                    AccessControl._saveCredential(AccessControl.CODE_KEY, code).then(function() {
                        screen.style.display = "none";
                        initApp();
                    });
                    return;
                }

                // New code entry (online or offline fallback)
                var token = AccessControl._generateToken();
                Promise.all([
                    AccessControl._saveCredential(AccessControl.TOKEN_KEY, token),
                    AccessControl._saveCredential(AccessControl.CODE_KEY, code)
                ]).then(function() {
                    if (result.offline) {
                        // Firebase unreachable -- store code locally, will claim later
                        console.log("AccessControl: Stored code locally (will claim when Firebase available)");
                        localStorage.setItem("wace_pending_claim", "true");
                    }

                    screen.style.display = "none";
                    initApp();
                });
            });
        });

        // Focus the input
        setTimeout(function() { input.focus(); }, 100);
    },

    /**
     * Verify a code exists in Firestore and check if it is claimed.
     * @private
     */
    _verifyCodeExists: function(code) {
        var db = firebase.firestore();
        return db.collection("accessCodes").doc(code.toUpperCase()).get()
            .then(function(doc) {
                if (!doc.exists) {
                    return { valid: false, reason: "That code is not valid. Check with your teacher." };
                }
                var data = doc.data();
                if (data.claimed) {
                    // Check if it is ours
                    var existingToken = localStorage.getItem(AccessControl.TOKEN_KEY);
                    if (data.deviceToken && data.deviceToken === existingToken) {
                        return { valid: true, alreadyMine: true };
                    }
                    return { valid: false, reason: "That code has already been used by another student." };
                }
                return { valid: true, alreadyMine: false };
            })
            .catch(function(err) {
                console.error("AccessControl: Verify failed:", err);
                return { valid: false, reason: "Could not verify the code. Check your internet connection." };
            });
    },

    /**
     * Complete the claim after the student enters their name on the welcome screen.
     * This is called from the welcome screen submit handler.
     * Also handles pending claims from offline sessions.
     */
    completeClaim: function(studentName) {
        AccessControl._saveCredential(AccessControl.NAME_KEY, studentName);

        var code = localStorage.getItem(AccessControl.CODE_KEY);
        if (!code) {
            return Promise.resolve({ success: true }); // No code system in use
        }

        // Try to claim (will silently fail if Firebase is unreachable)
        return AccessControl.claimCode(code, studentName).catch(function() {
            // Mark as pending -- will retry next time Firebase is available
            localStorage.setItem("wace_pending_claim", "true");
            return { success: true }; // Don't block the student
        });
    },

    /**
     * Claim a code -- mark it as used in Firestore with this device's token.
     */
    claimCode: function(code, studentName) {
        var db = firebase.firestore();
        var token = localStorage.getItem(AccessControl.TOKEN_KEY);

        return db.collection("accessCodes").doc(code.toUpperCase()).update({
            claimed: true,
            deviceToken: token,
            studentName: studentName,
            claimedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function() {
            localStorage.removeItem("wace_pending_claim");
            console.log("AccessControl: Code " + code + " claimed by " + studentName);
            return { success: true };
        }).catch(function(err) {
            console.error("AccessControl: Claim failed:", err);
            return { success: false, reason: "Could not register your code. Try again." };
        });
    },

    /**
     * Retry any pending claims (called during app init when Firebase connects).
     */
    retryPendingClaim: function() {
        var pending = localStorage.getItem("wace_pending_claim");
        var code = localStorage.getItem(AccessControl.CODE_KEY);
        var name = localStorage.getItem(AccessControl.NAME_KEY);

        if (pending && code && name) {
            console.log("AccessControl: Retrying pending claim for " + code);
            AccessControl.claimCode(code, name);
        }
    },

    /**
     * Generate a random device token.
     * @private
     */
    _generateToken: function() {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var token = "";
        for (var i = 0; i < 32; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    }
};
