// ============================================================================
// WACE Student Study Trainer - app.js
// Phase S1: Core Foundation
// ============================================================================
// ENCODING RULE: This file must contain ONLY ASCII characters (0x00-0x7F).
// All non-ASCII UI symbols are defined as Unicode escapes in SYMBOLS below.
// ============================================================================
"use strict";

// ---- NON-ASCII SYMBOLS (defined via \u escapes for encoding safety) ----
var SYMBOLS = {
    CHECK:        "\u2713",     // checkmark
    CROSS:        "\u2717",     // cross / ballot X
    ARROW_RIGHT:  "\u2192",     // right arrow
    ARROW_LEFT:   "\u2190",     // left arrow
    EM_DASH:      "\u2014",     // em-dash
    PLUS_MINUS:   "\u00B1",     // plus-minus
    BULLET:       "\u2022",     // bullet
    STAR:         "\u2605",     // filled star
    STAR_EMPTY:   "\u2606",     // empty star
    LIGHTNING:    "\u26A1",     // lightning bolt
    CIRCLE_GREEN: "\uD83D\uDFE2", // green circle emoji
    CIRCLE_RED:   "\uD83D\uDD34",  // red circle emoji
    CIRCLE_AMBER: "\uD83D\uDFE0",  // orange circle emoji
    GEAR:         "\u2699",     // gear
    TROPHY:       "\uD83C\uDFC6", // trophy
    FIRE:         "\uD83D\uDD25",  // fire (streak)
    GRAPH:        "\uD83D\uDCC8",  // chart increasing
    BOOK:         "\uD83D\uDCDA",  // books
    LOCK:         "\uD83D\uDD12",  // lock
    UNLOCK:       "\uD83D\uDD13",  // unlock
    GRADUATION:   "\uD83C\uDF93",  // graduation cap
    PARTY:        "\uD83C\uDF89",  // party popper
    CLOCK:        "\u23F0",     // alarm clock
    SUN:          "\u2600",     // sun (for dark mode toggle)
    MOON:         "\u263E",     // moon (for light mode toggle)
    ARROW_UP:     "\u2191",     // up arrow (improving)
    REVIEW:       "\u21BB",     // clockwise loop (review due)
    CLIPBOARD:    "\uD83D\uDCCB"  // clipboard (exam review)
};

// ---- APP CONSTANTS ----
var APP_VERSION = "2.0.0";
var DB_NAME = "WACEStudentTrainer";
var DB_VERSION = 1;

// Base path for all data files (relative to the HTML file).
// In the restructured project, all files are flat in system_trainer/.
var DATA_PATH = "";
var DIAGRAM_PATH = "diagrams/";
var PRACTICE_DIAGRAM_PATH = "practice_diagrams/";

// Object store names
var STORE_CONFIG = "config";
var STORE_MASTERY = "problemTypeMastery";
var STORE_HISTORY = "questionHistory";
var STORE_SESSIONS = "sessions";
var STORE_IMPORTED = "importedQuestions";
var STORE_SCHEDULE_UPDATES = "scheduleUpdates";
var STORE_CONFIDENCE = "confidenceWatch";
var STORE_DIAGRAMS = "diagramCache";

// All object store definitions for DB creation
var OBJECT_STORES = [
    { name: STORE_CONFIG,           keyPath: "id" },
    { name: STORE_MASTERY,          keyPath: "problemType" },
    { name: STORE_HISTORY,          keyPath: "filename" },
    { name: STORE_SESSIONS,         keyPath: "sessionId", autoIncrement: true },
    { name: STORE_IMPORTED,         keyPath: "filename" },
    { name: STORE_SCHEDULE_UPDATES, keyPath: "updateId" },
    { name: STORE_CONFIDENCE,       keyPath: "problemType" },
    { name: STORE_DIAGRAMS,         keyPath: "filename" }
];


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


// ============================================================================
// QUESTION ENGINE
// Merges data sources, computes unlocked problem types, provides lookups.
// ============================================================================
var QuestionEngine = {
    allQuestions: {},
    taxonomyData: {},
    questionIndex: {},
    unlockedProblemTypes: [],
    allProblemTypes: [],

    /**
     * Initialise the engine by merging data bundle + imported questions,
     * and computing the set of unlocked problem types from the schedule.
     */
    init: function() {
        // Load base data from script-tag globals
        if (typeof QUESTIONS_DATA !== "undefined") {
            QuestionEngine.allQuestions = Object.assign({}, QUESTIONS_DATA);
            console.log("QuestionEngine: Loaded " +
                Object.keys(QUESTIONS_DATA).length + " questions from data bundle");
        } else {
            console.warn("QuestionEngine: QUESTIONS_DATA not found (data_bundle.js missing?)");
            QuestionEngine.allQuestions = {};
        }

        if (typeof TAXONOMY_DATA !== "undefined") {
            QuestionEngine.taxonomyData = TAXONOMY_DATA;
        }
        if (typeof QUESTION_INDEX !== "undefined") {
            QuestionEngine.questionIndex = QUESTION_INDEX;
        }

        // Extract all known problem types from questions
        QuestionEngine.allProblemTypes = QuestionEngine._extractAllProblemTypes();
        console.log("QuestionEngine: Found " +
            QuestionEngine.allProblemTypes.length + " unique problem types");
    },

    /**
     * Merge imported questions (from IndexedDB) into the allQuestions map.
     * Called after DB is initialised.
     */
    mergeImportedQuestions: function(importedList) {
        var count = 0;
        importedList.forEach(function(item) {
            if (item.filename && item.questionData) {
                QuestionEngine.allQuestions[item.filename] = item.questionData;
                count++;
            }
        });
        if (count > 0) {
            console.log("QuestionEngine: Merged " + count + " imported questions");
            // Recompute problem types after merge
            QuestionEngine.allProblemTypes = QuestionEngine._extractAllProblemTypes();
        }
    },

    /**
     * Compute unlocked problem types based on schedule + schedule updates.
     */
    computeUnlocked: function(scheduleUpdates, aheadOfSchedule) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var unlocked = {};

        // Base schedule from schedule.js
        if (typeof TAUGHT_SCHEDULE !== "undefined" && TAUGHT_SCHEDULE.schedule) {
            TAUGHT_SCHEDULE.schedule.forEach(function(entry) {
                var entryDate = new Date(entry.date + "T00:00:00");
                if (aheadOfSchedule || entryDate <= today) {
                    (entry.problemTypes || []).forEach(function(pt) {
                        unlocked[pt] = true;
                    });
                }
            });
        }

        // Imported schedule updates from IndexedDB
        if (scheduleUpdates && scheduleUpdates.length > 0) {
            scheduleUpdates.forEach(function(entry) {
                var entryDate = new Date(entry.date + "T00:00:00");
                if (aheadOfSchedule || entryDate <= today) {
                    (entry.problemTypes || []).forEach(function(pt) {
                        unlocked[pt] = true;
                    });
                }
            });
        }

        QuestionEngine.unlockedProblemTypes = Object.keys(unlocked);
        console.log("QuestionEngine: " +
            QuestionEngine.unlockedProblemTypes.length + " problem types unlocked" +
            (aheadOfSchedule ? " (ahead-of-schedule mode)" : ""));
        return QuestionEngine.unlockedProblemTypes;
    },

    /**
     * Check if a question is available (all its parts' problem types are unlocked).
     */
    isQuestionAvailable: function(questionData) {
        if (!questionData || !questionData.parts) return false;
        var unlockedSet = {};
        QuestionEngine.unlockedProblemTypes.forEach(function(pt) {
            unlockedSet[pt] = true;
        });
        for (var i = 0; i < questionData.parts.length; i++) {
            var pt = questionData.parts[i].problemType;
            if (pt && !unlockedSet[pt]) {
                return false;
            }
        }
        return true;
    },

    /**
     * Get all available questions (all parts unlocked).
     */
    getAvailableQuestions: function() {
        var available = {};
        var keys = Object.keys(QuestionEngine.allQuestions);
        for (var i = 0; i < keys.length; i++) {
            var q = QuestionEngine.allQuestions[keys[i]];
            if (QuestionEngine.isQuestionAvailable(q)) {
                available[keys[i]] = q;
            }
        }
        return available;
    },

    /**
     * Get questions for a specific problem type.
     */
    getQuestionsForProblemType: function(problemType) {
        var matching = {};
        var keys = Object.keys(QuestionEngine.allQuestions);
        for (var i = 0; i < keys.length; i++) {
            var q = QuestionEngine.allQuestions[keys[i]];
            if (!q.parts) continue;
            for (var p = 0; p < q.parts.length; p++) {
                if (q.parts[p].problemType === problemType) {
                    matching[keys[i]] = q;
                    break;
                }
            }
        }
        return matching;
    },

    /**
     * Count questions per pool type.
     */
    getPoolCounts: function() {
        var original = 0;
        var practice = 0;
        var keys = Object.keys(QuestionEngine.allQuestions);
        keys.forEach(function(k) {
            var pool = QuestionEngine.allQuestions[k]._pool;
            if (pool === "original") original++;
            else if (pool === "practice") practice++;
        });
        return { original: original, practice: practice, total: keys.length };
    },

    /**
     * Extract all unique problem types from all loaded questions.
     * @private
     */
    _extractAllProblemTypes: function() {
        var ptSet = {};
        var keys = Object.keys(QuestionEngine.allQuestions);
        keys.forEach(function(k) {
            var q = QuestionEngine.allQuestions[k];
            if (q.parts) {
                q.parts.forEach(function(part) {
                    if (part.problemType) {
                        ptSet[part.problemType] = true;
                    }
                });
            }
        });
        return Object.keys(ptSet).sort();
    },

    /**
     * Get the schedule info for display purposes.
     */
    getScheduleInfo: function() {
        if (typeof TAUGHT_SCHEDULE === "undefined") {
            return {
                className: "Unknown Class",
                teacherName: "Unknown",
                totalEntries: 0,
                nextUnlock: null
            };
        }
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var nextUnlock = null;

        if (TAUGHT_SCHEDULE.schedule) {
            for (var i = 0; i < TAUGHT_SCHEDULE.schedule.length; i++) {
                var d = new Date(TAUGHT_SCHEDULE.schedule[i].date + "T00:00:00");
                if (d > today) {
                    nextUnlock = TAUGHT_SCHEDULE.schedule[i];
                    break;
                }
            }
        }

        return {
            className: TAUGHT_SCHEDULE.className || "Unknown Class",
            teacherName: TAUGHT_SCHEDULE.teacherName || "Unknown",
            totalEntries: (TAUGHT_SCHEDULE.schedule || []).length,
            allowAheadOfSchedule: !!TAUGHT_SCHEDULE.allowAheadOfSchedule,
            nextUnlock: nextUnlock
        };
    }
};


// ============================================================================
// MASTERY ENGINE
// Tracks problem-type mastery, status transitions, 3-in-3 rule, confidence.
// ============================================================================
var MasteryEngine = {
    /**
     * Get a summary of mastery statuses across all unlocked problem types.
     */
    getSummary: function() {
        return DB.getAll(STORE_MASTERY).then(function(records) {
            var summary = {
                mastered: 0,
                improving: 0,
                struggling: 0,
                newCount: 0,
                review: 0,
                total: QuestionEngine.unlockedProblemTypes.length
            };

            var tracked = {};
            records.forEach(function(r) {
                tracked[r.problemType] = r.status;
                switch (r.status) {
                    case "mastered": summary.mastered++; break;
                    case "improving": summary.improving++; break;
                    case "struggling": summary.struggling++; break;
                    case "review": summary.review++; break;
                }
            });

            // Count unlocked but never attempted as "new"
            QuestionEngine.unlockedProblemTypes.forEach(function(pt) {
                if (!tracked[pt]) {
                    summary.newCount++;
                }
            });

            return summary;
        });
    },

    /**
     * Compute a weighted exam readiness score (0-100).
     * Factors: mastery status, difficulty of mastered content,
     * recency of practice, and topic coverage balance.
     */
    getExamReadiness: function() {
        return DB.getAll(STORE_MASTERY).then(function(records) {
            var unlocked = QuestionEngine.unlockedProblemTypes;
            if (unlocked.length === 0) return { score: 0, topicScores: {} };

            var masteryMap = {};
            records.forEach(function(r) { masteryMap[r.problemType] = r; });

            // Compute difficulty weight per problem type
            // (highest difficulty question containing this problem type)
            var diffMap = { "Easy": 0.7, "Average": 1.0, "Hard": 1.3, "Very Hard": 1.5 };
            var ptDiffWeight = {};
            var ptTopic = {};
            var keys = Object.keys(QuestionEngine.allQuestions);
            keys.forEach(function(filename) {
                var q = QuestionEngine.allQuestions[filename];
                var qDiff = diffMap[q.difficultyRating] || 1.0;
                if (!q.parts) return;
                q.parts.forEach(function(p) {
                    if (!p.problemType) return;
                    // Track highest difficulty
                    if (!ptDiffWeight[p.problemType] || qDiff > ptDiffWeight[p.problemType]) {
                        ptDiffWeight[p.problemType] = qDiff;
                    }
                    // Track topic (first found)
                    if (!ptTopic[p.problemType] && p.topic) {
                        ptTopic[p.problemType] = p.topic;
                    }
                });
            });

            // Group unlocked problem types by topic
            var topicGroups = {};
            unlocked.forEach(function(pt) {
                var topic = ptTopic[pt] || "General";
                if (!topicGroups[topic]) topicGroups[topic] = [];
                topicGroups[topic].push(pt);
            });

            // Compute per-topic score
            var now = new Date();
            var topicScores = {};

            Object.keys(topicGroups).forEach(function(topic) {
                var pts = topicGroups[topic];
                var topicTotal = 0;
                var topicMax = 0;

                pts.forEach(function(pt) {
                    var dw = ptDiffWeight[pt] || 1.0;
                    topicMax += dw;

                    var record = masteryMap[pt];
                    if (!record) return; // new = 0 contribution

                    var sw;
                    switch (record.status) {
                        case "mastered": sw = 1.0; break;
                        case "review":   sw = 0.7; break;
                        case "improving": sw = 0.3; break;
                        case "struggling": sw = 0.1; break;
                        default: sw = 0;
                    }

                    // Recency decay for mastered/review items
                    if ((record.status === "mastered" || record.status === "review") &&
                        record.lastAttemptDate) {
                        var lastD = new Date(record.lastAttemptDate + "T00:00:00");
                        var days = Math.floor((now - lastD) / 86400000);
                        if (days > 14) {
                            // Linear decay: 1.0 at 14d to 0.5 at 60d
                            sw *= Math.max(0.5, 1.0 - (days - 14) * (0.5 / 46));
                        }
                    }

                    topicTotal += sw * dw;
                });

                topicScores[topic] = topicMax > 0 ?
                    Math.round((topicTotal / topicMax) * 100) : 0;
            });

            // Overall: average across topics (coverage penalty built in)
            var topicKeys = Object.keys(topicScores);
            if (topicKeys.length === 0) return { score: 0, topicScores: {} };
            var sum = 0;
            topicKeys.forEach(function(t) { sum += topicScores[t]; });
            var overall = Math.round(sum / topicKeys.length);

            return { score: overall, topicScores: topicScores };
        });
    },

    /**
     * Get the current session streak (consecutive days with sessions).
     */
    getStreak: function() {
        return DB.getAll(STORE_SESSIONS).then(function(sessions) {
            if (sessions.length === 0) return 0;

            var dateSet = {};
            sessions.forEach(function(s) {
                if (s.date) {
                    dateSet[s.date] = true;
                }
            });
            var dates = Object.keys(dateSet).sort().reverse();
            if (dates.length === 0) return 0;

            var today = new Date();
            today.setHours(0, 0, 0, 0);
            var streak = 0;
            var checkDate = new Date(today);

            var todayStr = checkDate.toISOString().split("T")[0];
            var yesterdayDate = new Date(checkDate);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            var yesterdayStr = yesterdayDate.toISOString().split("T")[0];

            if (!dateSet[todayStr] && !dateSet[yesterdayStr]) {
                return 0;
            }

            for (var i = 0; i < 365; i++) {
                var dStr = checkDate.toISOString().split("T")[0];
                if (dateSet[dStr]) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else if (i === 0) {
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }
            return streak;
        });
    },

    /**
     * Get mastery record for a problem type.
     * Returns the record or a default "new" record.
     */
    getStatus: function(problemType) {
        return DB.get(STORE_MASTERY, problemType).then(function(record) {
            if (record) return record;
            return {
                problemType: problemType,
                status: "new",
                totalAttempts: 0,
                correctAttempts: 0,
                firstAttemptDate: null,
                lastAttemptDate: null,
                masteryProgress: [],
                wrongHistory: [],
                guidedSolutionAccessCount: 0,
                averageTimeSeconds: 0
            };
        });
    },

    /**
     * Record an attempt for a problem type and update status.
     *
     * @param {string} problemType
     * @param {boolean} correct
     * @param {Object} details - { questionFilename, partLabel, errorAtLine, markingCriteriaFailed }
     */
    recordAttempt: function(problemType, correct, details) {
        var todayStr = new Date().toISOString().split("T")[0];

        return MasteryEngine.getStatus(problemType).then(function(record) {
            record.totalAttempts++;
            if (correct) record.correctAttempts++;
            if (!record.firstAttemptDate) record.firstAttemptDate = todayStr;
            record.lastAttemptDate = todayStr;

            if (correct) {
                // Add to mastery progress
                record.masteryProgress.push({
                    sessionDate: todayStr,
                    correct: true,
                    questionFilename: details.questionFilename || "",
                    partLabel: details.partLabel || ""
                });

                // Check 3-in-3 rule
                var uniqueDates = {};
                var validAfterLastWrong = [];
                // Find the last wrong entry in masteryProgress
                var lastWrongIdx = -1;
                for (var i = record.masteryProgress.length - 1; i >= 0; i--) {
                    if (!record.masteryProgress[i].correct) {
                        lastWrongIdx = i;
                        break;
                    }
                }
                // Only count correct entries after the last wrong
                for (var j = lastWrongIdx + 1; j < record.masteryProgress.length; j++) {
                    if (record.masteryProgress[j].correct) {
                        uniqueDates[record.masteryProgress[j].sessionDate] = true;
                    }
                }
                var uniqueCount = Object.keys(uniqueDates).length;

                if (uniqueCount >= 3) {
                    record.status = "mastered";
                } else if (record.status === "new" || record.status === "struggling") {
                    record.status = "improving";
                } else if (record.status === "review") {
                    record.status = "mastered";
                }
                // improving stays improving until 3-in-3

            } else {
                // Wrong answer
                record.wrongHistory.push({
                    sessionDate: todayStr,
                    questionFilename: details.questionFilename || "",
                    partLabel: details.partLabel || "",
                    errorAtLine: details.errorAtLine || null,
                    markingCriteriaFailed: details.markingCriteriaFailed || []
                });

                // Add wrong entry to mastery progress too (breaks 3-in-3 chain)
                record.masteryProgress.push({
                    sessionDate: todayStr,
                    correct: false,
                    questionFilename: details.questionFilename || "",
                    partLabel: details.partLabel || ""
                });

                // If was mastered or review, reset to struggling
                if (record.status === "mastered" || record.status === "review") {
                    record.status = "struggling";
                } else if (record.status === "new") {
                    record.status = "struggling";
                } else if (record.status === "improving") {
                    // Check if now more wrong than right overall
                    if (record.correctAttempts <= record.totalAttempts / 2) {
                        record.status = "struggling";
                    }
                }
            }

            return DB.put(STORE_MASTERY, record).then(function() {
                return record;
            });
        });
    },

    /**
     * Record guided solution access for a problem type.
     */
    recordGuidedAccess: function(problemType) {
        return MasteryEngine.getStatus(problemType).then(function(record) {
            record.guidedSolutionAccessCount =
                (record.guidedSolutionAccessCount || 0) + 1;
            return DB.put(STORE_MASTERY, record);
        });
    },

    /**
     * Add a problem type to the confidence watch list.
     */
    addToConfidenceWatch: function(problemType) {
        var todayStr = new Date().toISOString().split("T")[0];
        return DB.get(STORE_CONFIDENCE, problemType).then(function(existing) {
            if (existing) return existing; // already on watch
            var entry = {
                problemType: problemType,
                addedDate: todayStr,
                confidentCorrectCount: 0,
                confidentCorrectSessions: []
            };
            return DB.put(STORE_CONFIDENCE, entry).then(function() {
                return entry;
            });
        });
    },

    /**
     * Record a confident-correct for a confidence watch item.
     * Removes from watch after 2 confident-correct across 2 different sessions.
     */
    recordConfidentCorrect: function(problemType) {
        var todayStr = new Date().toISOString().split("T")[0];
        return DB.get(STORE_CONFIDENCE, problemType).then(function(entry) {
            if (!entry) return null;
            // Only count once per session date
            if (entry.confidentCorrectSessions.indexOf(todayStr) === -1) {
                entry.confidentCorrectSessions.push(todayStr);
                entry.confidentCorrectCount = entry.confidentCorrectSessions.length;
            }
            if (entry.confidentCorrectCount >= 2) {
                // Remove from watch
                return DB.remove(STORE_CONFIDENCE, problemType).then(function() {
                    return null;
                });
            }
            return DB.put(STORE_CONFIDENCE, entry).then(function() {
                return entry;
            });
        });
    },

    /**
     * Load all mastery data categorised for the session engine.
     */
    loadCategorised: function() {
        var result = {
            wrongList: [],
            confidenceList: [],
            freshList: [],
            improvingList: [],
            reviewList: []
        };

        var unlockedSet = {};
        QuestionEngine.unlockedProblemTypes.forEach(function(pt) {
            unlockedSet[pt] = true;
        });

        return Promise.all([
            DB.getAll(STORE_MASTERY),
            DB.getAll(STORE_CONFIDENCE)
        ]).then(function(results) {
            var masteryRecords = results[0];
            var confidenceRecords = results[1];

            var tracked = {};
            var confidenceSet = {};

            confidenceRecords.forEach(function(c) {
                confidenceSet[c.problemType] = true;
            });

            masteryRecords.forEach(function(r) {
                if (!unlockedSet[r.problemType]) return;
                tracked[r.problemType] = true;

                switch (r.status) {
                    case "struggling":
                        result.wrongList.push(r);
                        break;
                    case "improving":
                        result.improvingList.push(r);
                        break;
                    case "mastered":
                        // Check if needs review (>30 days since last attempt)
                        if (r.lastAttemptDate) {
                            var last = new Date(r.lastAttemptDate + "T00:00:00");
                            var now = new Date();
                            var daysDiff = Math.floor((now - last) / 86400000);
                            if (daysDiff > 30) {
                                r.status = "review";
                                DB.put(STORE_MASTERY, r); // async update
                                result.reviewList.push(r);
                            }
                        }
                        break;
                    case "review":
                        result.reviewList.push(r);
                        break;
                }

                // Check confidence watch
                if (confidenceSet[r.problemType] && r.status !== "struggling") {
                    result.confidenceList.push(r);
                }
            });

            // Fresh = unlocked but never attempted
            QuestionEngine.unlockedProblemTypes.forEach(function(pt) {
                if (!tracked[pt]) {
                    result.freshList.push({
                        problemType: pt,
                        status: "new",
                        totalAttempts: 0
                    });
                }
            });

            // Sort wrong list by oldest mistake first
            result.wrongList.sort(function(a, b) {
                var aDate = a.lastAttemptDate || "9999";
                var bDate = b.lastAttemptDate || "9999";
                return aDate.localeCompare(bDate);
            });

            // Shuffle fresh list
            for (var i = result.freshList.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var tmp = result.freshList[i];
                result.freshList[i] = result.freshList[j];
                result.freshList[j] = tmp;
            }

            return result;
        });
    },

    /**
     * Get the retry count for a problem type (how many times served while struggling).
     */
    getRetryCount: function(problemType) {
        return MasteryEngine.getStatus(problemType).then(function(record) {
            return record.wrongHistory ? record.wrongHistory.length : 0;
        });
    }
};


// ============================================================================
// QUESTION SELECTOR
// Scoring algorithm to pick the best question for a target problem type.
// ============================================================================
var QuestionSelector = {

    // Track questions served in the current session to avoid repeats
    sessionServed: {},

    // Section filter: "CA", "CF", or "mix" (no filter)
    sectionFilter: "mix",

    /**
     * Reset session tracking (called at session start).
     */
    resetSession: function() {
        QuestionSelector.sessionServed = {};
    },

    /**
     * Select the best question for a given problem type.
     * Uses scoring algorithm from spec Section 16.
     *
     * @param {string} problemType
     * @param {number} retryCount - how many retries for this problem type
     * @returns {Promise<{filename: string, questionData: Object}|null>}
     */
    selectForProblemType: function(problemType, retryCount) {
        // Find all questions containing this problem type
        var candidates = QuestionSelector._findCandidates(problemType);

        if (candidates.length === 0) return Promise.resolve(null);

        // Load question histories for scoring
        return DB.getAll(STORE_HISTORY).then(function(histories) {
            var histMap = {};
            histories.forEach(function(h) {
                histMap[h.filename] = h;
            });

            var now = new Date();
            var scored = [];

            candidates.forEach(function(c) {
                // Skip if served in current session
                if (QuestionSelector.sessionServed[c.filename]) return;

                var score = 0;
                var hist = histMap[c.filename];

                if (!hist || hist.timesServed === 0) {
                    score += 10; // never served
                } else {
                    var lastDate = new Date(hist.lastServed + "T00:00:00");
                    var daysSince = Math.floor((now - lastDate) / 86400000);

                    if (daysSince > 14) score += 5;
                    else if (daysSince > 7) score += 2;
                    else if (daysSince < 3) score -= 5;
                    if (daysSince < 1) score -= 20;
                }

                // Difficulty match for retries
                var diff = c.questionData.difficultyRating || "Average";
                if (retryCount <= 1) {
                    if (diff === "Easy") score += 3;
                    else if (diff === "Average") score += 2;
                } else if (retryCount === 2) {
                    if (diff === "Average") score += 3;
                } else {
                    if (diff === "Hard" || diff === "Very Hard") score += 3;
                }

                // Prefer practice pool for remediation
                if (retryCount > 0 && c.questionData._pool === "practice") {
                    score += 2;
                }

                scored.push({ filename: c.filename, questionData: c.questionData, score: score });
            });

            if (scored.length === 0) return null;

            // Sort by score descending
            scored.sort(function(a, b) { return b.score - a.score; });

            // Among top-scored, pick randomly
            var topScore = scored[0].score;
            var topCandidates = scored.filter(function(s) { return s.score === topScore; });
            var pick = topCandidates[Math.floor(Math.random() * topCandidates.length)];

            // Mark as served in this session
            QuestionSelector.sessionServed[pick.filename] = true;

            return { filename: pick.filename, questionData: pick.questionData };
        });
    },

    /**
     * Find all available questions containing a given problem type.
     * @private
     */
    _findCandidates: function(problemType) {
        var results = [];
        var keys = Object.keys(QuestionEngine.allQuestions);
        var secFilter = QuestionSelector.sectionFilter;
        for (var i = 0; i < keys.length; i++) {
            var q = QuestionEngine.allQuestions[keys[i]];
            if (!q.parts) continue;

            // Section filter: CA, CF, or mix (no filter)
            if (secFilter && secFilter !== "mix") {
                if (q.sectionName && q.sectionName !== secFilter) continue;
            }

            // Check if this question contains the target problem type
            var hasPT = false;
            for (var p = 0; p < q.parts.length; p++) {
                if (q.parts[p].problemType === problemType) {
                    hasPT = true;
                    break;
                }
            }
            if (!hasPT) continue;

            // Check if question is available (all parts unlocked)
            if (!QuestionEngine.isQuestionAvailable(q)) continue;

            results.push({ filename: keys[i], questionData: q });
        }
        return results;
    }
};


// ============================================================================
// SESSION ENGINE
// Manages the study session: sequencing, state, recording results.
// ============================================================================
var SessionEngine = {
    active: false,
    mode: null,               // "study" or "revision"
    topicFilter: null,
    sectionFilter: "mix",     // "CA", "CF", or "mix"
    wrongListOnly: false,     // true = only serve wrong list questions
    sessionGoal: 10,
    startTime: null,

    // Exam mode state
    examMode: false,          // true = exam mode (no solutions until review)
    examQueue: [],            // pre-selected questions [{filename, questionData, targetProblemType}]
    examQueueIndex: 0,        // current position in exam queue
    examAnswers: [],          // stored question data for review [{filename, questionData, targetProblemType}]

    // Answer method
    answerMethod: "paper",    // "paper" or "stylus"

    // Categorised problem type lists
    wrongList: [],
    confidenceList: [],
    freshList: [],
    improvingList: [],
    reviewList: [],

    // Counters
    freshCount: 0,
    totalCount: 0,
    bonusCount: 0,   // "another like this" questions (don't count against goal)

    // Current question state
    currentQuestion: null,
    currentFilename: null,

    // Session results tracking
    sessionData: null,
    newMasteries: [],

    /**
     * Start a new study session.
     *
     * @param {string} mode - "study" or "revision"
     * @param {string|null} topicFilter - topic/subtopic/concept to filter by
     * @param {Object} options - { goal, sectionFilter, wrongListOnly }
     */
    start: function(mode, topicFilter, options) {
        var opts = options || {};
        SessionEngine.active = true;
        SessionEngine.mode = mode || "study";
        SessionEngine.topicFilter = topicFilter || null;
        SessionEngine.sessionGoal = opts.goal || 10;
        SessionEngine.sectionFilter = opts.sectionFilter || "mix";
        SessionEngine.wrongListOnly = !!opts.wrongListOnly;
        SessionEngine.startTime = new Date();
        SessionEngine.freshCount = 0;
        SessionEngine.totalCount = 0;
        SessionEngine.bonusCount = 0;
        SessionEngine.currentQuestion = null;
        SessionEngine.currentFilename = null;
        SessionEngine.newMasteries = [];

        // Reset exam mode state
        SessionEngine.examMode = !!opts.examMode;
        SessionEngine.examQueue = [];
        SessionEngine.examQueueIndex = 0;
        SessionEngine.examAnswers = [];

        // Answer method
        SessionEngine.answerMethod = opts.answerMethod || "paper";

        // Set section filter on QuestionSelector
        QuestionSelector.sectionFilter = SessionEngine.sectionFilter;
        QuestionSelector.resetSession();

        SessionEngine.sessionData = {
            date: new Date().toISOString().split("T")[0],
            startTime: new Date().toISOString(),
            endTime: null,
            durationMinutes: 0,
            mode: mode || "study",
            topicFilter: topicFilter || null,
            sectionFilter: SessionEngine.sectionFilter,
            wrongListOnly: SessionEngine.wrongListOnly,
            answerMethod: SessionEngine.answerMethod,
            examMode: SessionEngine.examMode,
            questionsAttempted: 0,
            partsAttempted: 0,
            partsCorrect: 0,
            accuracyPercent: 0,
            problemTypesEncountered: [],
            newMasteries: [],
            guidedSolutionAccesses: 0,
            topicBreakdown: {}
        };

        return MasteryEngine.loadCategorised().then(function(categorised) {
            SessionEngine.wrongList = categorised.wrongList;
            SessionEngine.confidenceList = categorised.confidenceList;
            SessionEngine.freshList = categorised.freshList;
            SessionEngine.improvingList = categorised.improvingList;
            SessionEngine.reviewList = categorised.reviewList;

            // If topic filter, filter all lists
            if (topicFilter) {
                SessionEngine._applyTopicFilter(topicFilter);
            }

            console.log("Session started (" + mode + "): " +
                SessionEngine.wrongList.length + " wrong, " +
                SessionEngine.freshList.length + " fresh, " +
                SessionEngine.improvingList.length + " improving, " +
                SessionEngine.reviewList.length + " review" +
                " | section=" + SessionEngine.sectionFilter +
                " | wrongOnly=" + SessionEngine.wrongListOnly);

            return true;
        });
    },

    /**
     * Get the next question in the session.
     *
     * Sequencing rules:
     * - Wrong list only mode: only serve from wrong list.
     * - Normal mode with <5 questions goal: 1st question from wrong list,
     *   rest from fresh/improving/review/confidence.
     * - Normal mode with 5+ questions goal: every 5th question from wrong list,
     *   rest follows fresh > confidence > improving > review fallback.
     *
     * @returns {Promise<{filename, questionData, targetProblemType}|null>}
     */
    getNext: function() {
        if (!SessionEngine.active) return Promise.resolve(null);

        var targetPT = null;

        if (SessionEngine.wrongListOnly) {
            // ----- WRONG LIST ONLY MODE -----
            if (SessionEngine.wrongList.length > 0) {
                targetPT = SessionEngine.wrongList[0].problemType;
            } else {
                return Promise.resolve(null);
            }

        } else if (SessionEngine.sessionGoal < 5) {
            // ----- SHORT SESSION (<5 questions) -----
            // 1st question from wrong list, rest from other lists
            if (SessionEngine.totalCount === 0 && SessionEngine.wrongList.length > 0) {
                targetPT = SessionEngine.wrongList[0].problemType;
            } else {
                targetPT = SessionEngine._pickNonWrong();
            }

        } else {
            // ----- NORMAL SESSION (5+ questions) -----
            // Every 5th question (positions 1, 6, 11, ...) from wrong list
            var pos = SessionEngine.totalCount + 1; // 1-indexed position
            var isWrongSlot = (pos === 1) || (pos > 1 && (pos - 1) % 5 === 0);

            if (isWrongSlot && SessionEngine.wrongList.length > 0) {
                targetPT = SessionEngine.wrongList[0].problemType;
            } else {
                targetPT = SessionEngine._pickNonWrong();
            }
        }

        // If no target found from any list, session is done
        if (!targetPT) {
            return Promise.resolve(null);
        }

        // Get retry count for difficulty progression
        return MasteryEngine.getRetryCount(targetPT).then(function(count) {
            return QuestionSelector.selectForProblemType(targetPT, count);
        }).then(function(selected) {
            if (!selected) {
                // No question found for this problem type, skip it and try next
                SessionEngine._removeProblemType(targetPT);
                return SessionEngine.getNext();
            }

            SessionEngine.currentQuestion = selected.questionData;
            SessionEngine.currentFilename = selected.filename;
            SessionEngine.totalCount++;

            // Check if this was from freshList
            var inFresh = false;
            for (var i = 0; i < SessionEngine.freshList.length; i++) {
                if (SessionEngine.freshList[i].problemType === targetPT) {
                    inFresh = true;
                    break;
                }
            }
            if (inFresh) SessionEngine.freshCount++;

            return {
                filename: selected.filename,
                questionData: selected.questionData,
                targetProblemType: targetPT,
                questionNumber: SessionEngine.totalCount,
                sessionGoal: SessionEngine.sessionGoal
            };
        });
    },

    /**
     * Pick a problem type from the non-wrong lists.
     * Follows priority: fresh > review (every 7th) > confidence (every 9th)
     *                    > improving > review > confidence > wrong (fallback).
     * @private
     * @returns {string|null} problem type or null
     */
    _pickNonWrong: function() {
        // Spaced review interleave: every 7th question, serve a review item
        if (SessionEngine.totalCount > 0 &&
            SessionEngine.totalCount % 7 === 0 &&
            SessionEngine.reviewList.length > 0) {
            return SessionEngine.reviewList[0].problemType;
        }
        if (SessionEngine.freshList.length > 0) {
            return SessionEngine.freshList[0].problemType;
        }
        if (SessionEngine.totalCount > 0 &&
            SessionEngine.totalCount % 9 === 0 &&
            SessionEngine.confidenceList.length > 0) {
            return SessionEngine.confidenceList[0].problemType;
        }
        if (SessionEngine.improvingList.length > 0) {
            return SessionEngine.improvingList[0].problemType;
        }
        if (SessionEngine.reviewList.length > 0) {
            return SessionEngine.reviewList[0].problemType;
        }
        if (SessionEngine.confidenceList.length > 0) {
            return SessionEngine.confidenceList[0].problemType;
        }
        // Fall back to wrong list if everything else is empty
        if (SessionEngine.wrongList.length > 0) {
            return SessionEngine.wrongList[0].problemType;
        }
        return null;
    },

    /**
     * Record results for the current question.
     * Called after the student completes self-assessment for all parts.
     *
     * @param {string} filename
     * @param {Object} partResults - { partLabel: { correct, errorAtLine, markingCriteriaFailed } }
     */
    recordResults: function(filename, partResults) {
        var q = QuestionEngine.allQuestions[filename];
        if (!q || !q.parts) return Promise.resolve();

        var todayStr = new Date().toISOString().split("T")[0];
        var promises = [];
        var ptEncountered = {};

        // Update question history
        var historyPromise = DB.get(STORE_HISTORY, filename).then(function(hist) {
            if (!hist) {
                hist = {
                    filename: filename,
                    timesServed: 0,
                    lastServed: todayStr,
                    partResults: {}
                };
            }
            hist.timesServed++;
            hist.lastServed = todayStr;

            var partLabels = Object.keys(partResults);
            partLabels.forEach(function(label) {
                var pr = partResults[label];
                if (!hist.partResults[label]) {
                    hist.partResults[label] = {
                        lastCorrect: pr.correct,
                        timesCorrect: 0,
                        timesWrong: 0
                    };
                }
                hist.partResults[label].lastCorrect = pr.correct;
                if (pr.correct) {
                    hist.partResults[label].timesCorrect++;
                } else {
                    hist.partResults[label].timesWrong++;
                }
            });

            return DB.put(STORE_HISTORY, hist);
        });
        promises.push(historyPromise);

        // Update mastery for each part
        SessionEngine.sessionData.questionsAttempted++;

        q.parts.forEach(function(part) {
            var label = part.partLabel;
            var pt = part.problemType;
            if (!pt) return;

            ptEncountered[pt] = true;
            SessionEngine.sessionData.partsAttempted++;

            var pr = partResults[label];
            if (!pr) return; // part not assessed (shouldn't happen)

            if (pr.correct) {
                SessionEngine.sessionData.partsCorrect++;
            }

            // Track topic breakdown
            var topic = part.topic || "Unknown";
            if (!SessionEngine.sessionData.topicBreakdown[topic]) {
                SessionEngine.sessionData.topicBreakdown[topic] = { attempted: 0, correct: 0 };
            }
            SessionEngine.sessionData.topicBreakdown[topic].attempted++;
            if (pr.correct) {
                SessionEngine.sessionData.topicBreakdown[topic].correct++;
            }

            var masteryPromise = MasteryEngine.recordAttempt(pt, pr.correct, {
                questionFilename: filename,
                partLabel: label,
                errorAtLine: pr.errorAtLine || null,
                markingCriteriaFailed: pr.markingCriteriaFailed || []
            }).then(function(record) {
                // Check for new mastery
                if (record.status === "mastered") {
                    if (SessionEngine.newMasteries.indexOf(pt) === -1) {
                        SessionEngine.newMasteries.push(pt);
                    }
                }

                // Update the session lists based on new status
                SessionEngine._updateLists(pt, record.status);

                // Handle confidence watch
                if (pr.correctButUnsure) {
                    MasteryEngine.addToConfidenceWatch(pt);
                } else if (pr.correct) {
                    MasteryEngine.recordConfidentCorrect(pt);
                }
            });
            promises.push(masteryPromise);
        });

        // Track encountered problem types
        var ptKeys = Object.keys(ptEncountered);
        ptKeys.forEach(function(pt) {
            if (SessionEngine.sessionData.problemTypesEncountered.indexOf(pt) === -1) {
                SessionEngine.sessionData.problemTypesEncountered.push(pt);
            }
        });

        return Promise.all(promises);
    },

    /**
     * Record that the guided solution was accessed.
     */
    recordGuidedAccess: function(problemTypes) {
        SessionEngine.sessionData.guidedSolutionAccesses++;
        var promises = problemTypes.map(function(pt) {
            return MasteryEngine.recordGuidedAccess(pt);
        });
        return Promise.all(promises);
    },

    /**
     * End the current session and save the session log.
     */
    end: function() {
        if (!SessionEngine.active) return Promise.resolve(null);
        SessionEngine.active = false;

        var endTime = new Date();
        SessionEngine.sessionData.endTime = endTime.toISOString();
        SessionEngine.sessionData.durationMinutes =
            Math.round((endTime - SessionEngine.startTime) / 60000);

        if (SessionEngine.sessionData.partsAttempted > 0) {
            SessionEngine.sessionData.accuracyPercent =
                Math.round((SessionEngine.sessionData.partsCorrect /
                    SessionEngine.sessionData.partsAttempted) * 1000) / 10;
        }

        SessionEngine.sessionData.newMasteries = SessionEngine.newMasteries.slice();

        return DB.put(STORE_SESSIONS, SessionEngine.sessionData).then(function() {
            console.log("Session saved: " +
                SessionEngine.sessionData.questionsAttempted + " questions, " +
                SessionEngine.sessionData.accuracyPercent + "% accuracy");
            return SessionEngine.sessionData;
        });
    },

    /**
     * Remove a problem type from all session lists (when no questions available).
     * @private
     */
    _removeProblemType: function(pt) {
        var lists = ["wrongList", "confidenceList", "freshList", "improvingList", "reviewList"];
        lists.forEach(function(listName) {
            SessionEngine[listName] = SessionEngine[listName].filter(function(item) {
                return item.problemType !== pt;
            });
        });
    },

    /**
     * Update session lists after a mastery status change.
     * @private
     */
    _updateLists: function(pt, newStatus) {
        // Remove from all lists first
        SessionEngine._removeProblemType(pt);

        // Re-add to appropriate list if needed
        var record = { problemType: pt, status: newStatus };
        switch (newStatus) {
            case "struggling":
                SessionEngine.wrongList.push(record);
                break;
            case "improving":
                SessionEngine.improvingList.push(record);
                break;
            case "review":
                SessionEngine.reviewList.push(record);
                break;
            // "mastered" and "new" don't go into session lists for re-serving
        }
    },

    /**
     * Apply topic filter to all session lists.
     * @private
     */
    _applyTopicFilter: function(topicFilter) {
        // Get all problem types that match the topic filter
        // (matches against topic, subtopic, conceptCategory, or problemType name)
        var matchingPTs = {};
        var keys = Object.keys(QuestionEngine.allQuestions);
        keys.forEach(function(k) {
            var q = QuestionEngine.allQuestions[k];
            if (!q.parts) return;
            q.parts.forEach(function(part) {
                if (part.topic === topicFilter ||
                    part.subtopic === topicFilter ||
                    part.conceptCategory === topicFilter ||
                    part.problemType === topicFilter) {
                    if (part.problemType) {
                        matchingPTs[part.problemType] = true;
                    }
                }
            });
        });

        var lists = ["wrongList", "confidenceList", "freshList", "improvingList", "reviewList"];
        lists.forEach(function(listName) {
            SessionEngine[listName] = SessionEngine[listName].filter(function(item) {
                return matchingPTs[item.problemType];
            });
        });
    }
};


// ============================================================================
// ERROR MAPPING UTILITY
// Maps error line to affected marking criteria.
// ============================================================================
function mapErrorToCriteria(errorLine, totalLines, totalCriteria) {
    if (totalLines === 0 || totalCriteria === 0) {
        var all = [];
        for (var i = 0; i < totalCriteria; i++) all.push(i);
        return all;
    }
    var segmentSize = totalLines / totalCriteria;
    var errorSegment = Math.floor((errorLine - 1) / segmentSize);
    var clamped = Math.max(0, Math.min(errorSegment, totalCriteria - 1));
    var failed = [];
    for (var j = clamped; j < totalCriteria; j++) {
        failed.push(j);
    }
    return failed;
}


// ============================================================================
// UI MODULE
// Handles tab switching, welcome screen, settings, and rendering helpers.
// ============================================================================
var UI = {
    currentTab: "study",

    /**
     * Initialise all UI event listeners.
     */
    init: function() {
        // Tab navigation
        var tabBtns = document.querySelectorAll(".tab-btn");
        tabBtns.forEach(function(btn) {
            btn.addEventListener("click", function() {
                UI.showTab(btn.getAttribute("data-tab"));
            });
        });

        // Welcome screen
        var nameInput = document.getElementById("student-name-input");
        var startBtn = document.getElementById("welcome-start-btn");
        if (nameInput) {
            nameInput.addEventListener("input", function() {
                var name = nameInput.value.trim();
                startBtn.disabled = name.length < 1;
            });
            nameInput.addEventListener("keydown", function(e) {
                if (e.key === "Enter" && !startBtn.disabled) {
                    startBtn.click();
                }
            });
        }
        if (startBtn) {
            startBtn.addEventListener("click", function() {
                UI.handleWelcomeSubmit();
            });
        }

        // Dark mode quick toggle
        var themeToggle = document.getElementById("theme-toggle-btn");
        if (themeToggle) {
            themeToggle.addEventListener("click", function() {
                var isDark = document.body.classList.contains("dark-theme");
                var newTheme = isDark ? "light" : "dark";
                UI.applyTheme(newTheme);
                UI.savePreference("theme", newTheme);
                // Keep settings dropdown in sync
                var themeSelect = document.getElementById("pref-theme");
                if (themeSelect) themeSelect.value = newTheme;
            });
        }

        // Settings modal
        var settingsBtn = document.getElementById("settings-btn");
        var settingsClose = document.getElementById("settings-close-btn");
        var settingsModal = document.getElementById("settings-modal");
        if (settingsBtn) {
            settingsBtn.addEventListener("click", function() {
                UI.openSettings();
            });
        }
        if (settingsClose) {
            settingsClose.addEventListener("click", function() {
                settingsModal.style.display = "none";
            });
        }
        if (settingsModal) {
            settingsModal.addEventListener("click", function(e) {
                if (e.target === settingsModal) {
                    settingsModal.style.display = "none";
                }
            });
        }

        // Theme preference
        var themeSelect = document.getElementById("pref-theme");
        if (themeSelect) {
            themeSelect.addEventListener("change", function() {
                UI.applyTheme(themeSelect.value);
                UI.savePreference("theme", themeSelect.value);
            });
        }

        // Preference checkboxes
        ["pref-difficulty", "pref-examiner", "pref-timer"].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener("change", function() {
                    var key = id.replace("pref-", "show") + "Enabled";
                    if (id === "pref-difficulty") key = "showDifficultyBadges";
                    if (id === "pref-examiner") key = "showExaminerComments";
                    if (id === "pref-timer") key = "showTimerSuggestions";
                    UI.savePreference(key, el.checked);
                });
            }
        });

        // Session time slider
        var timeInput = document.getElementById("session-time-input");
        var timeDisplay = document.getElementById("session-time-display");
        if (timeInput && timeDisplay) {
            timeInput.addEventListener("input", function() {
                timeDisplay.textContent = timeInput.value + " min";
                StudyUI.updateQuestionEstimate();
            });
        }

        // Config toggle groups (section filter, focus filter, revise config)
        var toggleGroups = document.querySelectorAll(".config-toggle-group");
        toggleGroups.forEach(function(group) {
            var buttons = group.querySelectorAll(".config-toggle");
            buttons.forEach(function(btn) {
                btn.addEventListener("click", function() {
                    // Deselect siblings, select this one
                    buttons.forEach(function(b) {
                        b.setAttribute("aria-pressed", "false");
                    });
                    btn.setAttribute("aria-pressed", "true");
                    StudyUI.updateQuestionEstimate();
                });
            });
        });

        // Revise mode toggle: show/hide exam count row
        var reviseModeGroup = document.getElementById("revise-mode-group");
        if (reviseModeGroup) {
            reviseModeGroup.querySelectorAll(".config-toggle").forEach(function(btn) {
                btn.addEventListener("click", function() {
                    var countRow = document.getElementById("revise-exam-count-row");
                    if (countRow) {
                        countRow.style.display =
                            (btn.getAttribute("data-value") === "exam") ? "block" : "none";
                    }
                });
            });
        }

        // Revise answer method toggle: show/hide stylus hint
        var reviseAnswerGroup = document.getElementById("revise-answer-group");
        if (reviseAnswerGroup) {
            reviseAnswerGroup.querySelectorAll(".config-toggle").forEach(function(btn) {
                btn.addEventListener("click", function() {
                    var hint = document.getElementById("revise-stylus-hint");
                    if (hint) {
                        if (btn.getAttribute("data-value") === "stylus") {
                            hint.style.display = "block";
                            // Check for API key
                            DB.get(STORE_CONFIG, "apiKey").then(function(rec) {
                                if (!rec || !rec.value) {
                                    hint.textContent = "No API key configured. Add one in Settings to use Stylus mode.";
                                    hint.className = "config-hint config-hint-warn";
                                } else {
                                    hint.textContent = "AI will mark your handwritten answers.";
                                    hint.className = "config-hint";
                                }
                            }).catch(function() {
                                hint.textContent = "Requires an API key in Settings. AI will mark your handwritten answers.";
                                hint.className = "config-hint";
                            });
                        } else {
                            hint.style.display = "none";
                        }
                    }
                });
            });
        }

        // Revise exam count slider
        var reviseCountInput = document.getElementById("revise-exam-count-input");
        var reviseCountDisplay = document.getElementById("revise-exam-count-display");
        if (reviseCountInput && reviseCountDisplay) {
            reviseCountInput.addEventListener("input", function() {
                reviseCountDisplay.textContent = reviseCountInput.value;
            });
        }

        // Import/export buttons (Phase S5)
        document.getElementById("btn-import-update").addEventListener("click", function() {
            document.getElementById("file-input-update").click();
        });
        document.getElementById("file-input-update").addEventListener("change", function(e) {
            if (e.target.files && e.target.files[0]) {
                ExportImport.importUpdate(e.target.files[0]);
                e.target.value = ""; // reset so same file can be re-imported
            }
        });
        document.getElementById("btn-export-progress").addEventListener("click", function() {
            ExportImport.exportProgressReport();
        });
        document.getElementById("btn-export-backup").addEventListener("click", function() {
            ExportImport.exportFullBackup();
        });
        document.getElementById("btn-import-backup").addEventListener("click", function() {
            document.getElementById("file-input-backup").click();
        });
        document.getElementById("file-input-backup").addEventListener("change", function(e) {
            if (e.target.files && e.target.files[0]) {
                ExportImport.importBackup(e.target.files[0]);
                e.target.value = "";
            }
        });
        document.getElementById("btn-clear-diagram-cache").addEventListener("click", function() {
            if (confirm("Clear cached diagram images from imported updates?\n\n" +
                "Diagrams that exist as PNG files in the diagrams folder will still work. " +
                "Only diagrams imported from update files will be removed.")) {
                UI.clearDiagramCache();
            }
        });

        // Emergency reset button
        var resetBtn = document.getElementById("btn-emergency-reset");
        if (resetBtn) {
            resetBtn.addEventListener("click", function() {
                if (confirm("WARNING: This will permanently erase ALL your progress, " +
                    "mastery records, session history, and settings.\n\n" +
                    "This cannot be undone. Are you sure?")) {
                    DB.emergencyReset();
                }
            });
        }
    },

    /**
     * Switch to a named tab.
     */
    showTab: function(tabName) {
        UI.currentTab = tabName;

        // Update tab buttons
        document.querySelectorAll(".tab-btn").forEach(function(btn) {
            btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
        });

        // Update tab panels
        document.querySelectorAll(".tab-panel").forEach(function(panel) {
            panel.classList.toggle("active", panel.id === "tab-" + tabName);
        });

        // Trigger tab-specific refresh
        if (tabName === "study") {
            UI.refreshStudyTab();
        } else if (tabName === "revise") {
            ReviseUI.refresh();
        } else if (tabName === "print") {
            PrintUI.refresh();
        } else if (tabName === "dashboard") {
            DashboardUI.refresh();
        }
    },

    /**
     * Show the welcome screen for first-run setup.
     */
    showWelcomeScreen: function() {
        document.getElementById("welcome-screen").style.display = "flex";
        document.getElementById("app-container").style.display = "none";

        // Populate schedule info
        var info = QuestionEngine.getScheduleInfo();
        var classInfo = document.getElementById("welcome-class-info");
        var schedInfo = document.getElementById("welcome-schedule-info");

        if (classInfo) {
            classInfo.textContent = "Class: " + info.className;
        }
        if (schedInfo) {
            var totalPts = QuestionEngine.allProblemTypes.length;
            var qCount = Object.keys(QuestionEngine.allQuestions).length;
            schedInfo.textContent = qCount + " questions covering " +
                totalPts + " problem types";
        }

        // Set welcome icon
        var iconArea = document.getElementById("welcome-icon-area");
        if (iconArea) {
            iconArea.textContent = SYMBOLS.GRADUATION;
        }

        // Focus name input
        setTimeout(function() {
            var input = document.getElementById("student-name-input");
            if (input) input.focus();
        }, 100);
    },

    /**
     * Handle the welcome form submission (save student name, show main app).
     */
    handleWelcomeSubmit: function() {
        var name = document.getElementById("student-name-input").value.trim();
        if (!name) return;

        var config = {
            id: "main",
            studentName: name,
            startedDate: new Date().toISOString().split("T")[0],
            appVersion: APP_VERSION,
            theme: "light",
            showTimerSuggestions: true,
            showExaminerComments: true,
            showDifficultyBadges: true,
            aheadOfScheduleEnabled: false,
            sessionGoal: 10,
            updatesImported: []
        };

        DB.put(STORE_CONFIG, config).then(function() {
            console.log("Config saved for: " + name);
            UI.showMainApp(config);
        }).catch(function(err) {
            console.error("Failed to save config:", err);
            // Show app anyway
            UI.showMainApp(config);
        });
    },

    /**
     * Show the main application (after welcome or on returning user).
     */
    showMainApp: function(config) {
        document.getElementById("welcome-screen").style.display = "none";
        document.getElementById("app-container").style.display = "block";

        // Set student name in header
        var nameDisplay = document.getElementById("student-name-display");
        if (nameDisplay && config) {
            nameDisplay.textContent = config.studentName;
        }

        // Apply saved theme
        if (config && config.theme) {
            UI.applyTheme(config.theme);
        }

        // Apply saved preferences to settings checkboxes
        if (config) {
            var themeSelect = document.getElementById("pref-theme");
            if (themeSelect) themeSelect.value = config.theme || "light";

            var diffCheck = document.getElementById("pref-difficulty");
            if (diffCheck) diffCheck.checked = config.showDifficultyBadges !== false;

            var examCheck = document.getElementById("pref-examiner");
            if (examCheck) examCheck.checked = config.showExaminerComments !== false;

            var timerCheck = document.getElementById("pref-timer");
            if (timerCheck) timerCheck.checked = config.showTimerSuggestions !== false;
        }

        // Show study tab by default
        UI.showTab("study");
    },

    /**
     * Refresh the study tab with current stats.
     */
    refreshStudyTab: function() {
        // Update unlocked count
        var unlockedEl = document.getElementById("stat-unlocked");
        if (unlockedEl) {
            unlockedEl.textContent = QuestionEngine.unlockedProblemTypes.length;
        }

        // Update mastered count, review count, and streak
        MasteryEngine.getSummary().then(function(summary) {
            var masteredEl = document.getElementById("stat-mastered");
            if (masteredEl) {
                masteredEl.textContent = summary.mastered;
            }
            // Show review-due card if there are items due
            var reviewCard = document.getElementById("stat-review-card");
            var reviewEl = document.getElementById("stat-review");
            if (reviewCard && reviewEl) {
                if (summary.review > 0) {
                    reviewCard.style.display = "";
                    reviewEl.textContent = summary.review;
                } else {
                    reviewCard.style.display = "none";
                }
            }
        });

        MasteryEngine.getStreak().then(function(streak) {
            var streakEl = document.getElementById("stat-streak");
            if (streakEl) {
                streakEl.textContent = streak;
            }
        });

        // Exam readiness ring
        MasteryEngine.getExamReadiness().then(function(result) {
            var valueEl = document.getElementById("readiness-value");
            var arcEl = document.getElementById("readiness-arc");
            var container = document.getElementById("readiness-container");
            if (!valueEl || !arcEl) return;

            var score = result.score;
            valueEl.textContent = score + "%";

            // Animate the ring: circumference = 2 * pi * 52 = 326.73
            var circumference = 326.73;
            var offset = circumference - (score / 100) * circumference;
            arcEl.style.strokeDashoffset = offset;

            // Colour based on score
            var color;
            if (score >= 70) color = "var(--color-success)";
            else if (score >= 40) color = "var(--color-warning)";
            else color = "var(--color-danger)";
            arcEl.style.stroke = color;

            // Show topic breakdown as tooltip-style hint
            if (container && result.topicScores) {
                var topics = Object.keys(result.topicScores);
                if (topics.length > 0) {
                    var hints = topics.map(function(t) {
                        return t + ": " + result.topicScores[t] + "%";
                    });
                    container.title = "Per topic: " + hints.join(", ");
                }
            }
        });

        // Schedule hint
        var hintEl = document.getElementById("study-schedule-hint");
        var info = QuestionEngine.getScheduleInfo();
        if (hintEl) {
            var avail = Object.keys(QuestionEngine.getAvailableQuestions()).length;
            var msg = avail + " questions available";
            if (info.nextUnlock) {
                msg += " " + SYMBOLS.BULLET + " Next unlock: " + info.nextUnlock.label;
            }
            hintEl.textContent = msg;
        }

        // Update question estimate
        StudyUI.updateQuestionEstimate();
    },

    /**
     * Open the settings modal.
     */
    openSettings: function() {
        var modal = document.getElementById("settings-modal");
        if (modal) {
            modal.style.display = "flex";
        }

        // Populate about text
        var aboutEl = document.getElementById("settings-about-text");
        var statsEl = document.getElementById("settings-data-stats");
        var info = QuestionEngine.getScheduleInfo();
        var pools = QuestionEngine.getPoolCounts();

        if (aboutEl) {
            aboutEl.textContent = "Version " + APP_VERSION +
                " " + SYMBOLS.BULLET + " " + info.className;
        }
        if (statsEl) {
            statsEl.textContent = pools.total + " questions (" +
                pools.original + " original, " + pools.practice + " practice) " +
                SYMBOLS.BULLET + " " +
                QuestionEngine.unlockedProblemTypes.length + " problem types unlocked";
        }

        // Check storage usage
        UI.updateStorageDisplay();
    },

    /**
     * Check and display storage usage in settings.
     */
    updateStorageDisplay: function() {
        var textEl = document.getElementById("storage-usage-text");
        var barContainer = document.getElementById("storage-bar-container");
        var barFill = document.getElementById("storage-bar-fill");

        if (!textEl) return;

        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(function(estimate) {
                var usedMB = (estimate.usage / (1024 * 1024)).toFixed(1);
                var quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
                var pct = estimate.quota > 0 ?
                    ((estimate.usage / estimate.quota) * 100).toFixed(1) : 0;

                textEl.textContent = usedMB + " MB used of " + quotaMB + " MB available";

                if (barContainer && barFill) {
                    barContainer.style.display = "block";
                    barFill.style.width = Math.min(pct, 100) + "%";

                    // Colour based on usage
                    if (pct > 80) {
                        barFill.style.background = "var(--color-danger)";
                        textEl.textContent += " " + SYMBOLS.CIRCLE_RED + " Storage is getting full!";
                    } else if (pct > 50) {
                        barFill.style.background = "var(--color-warning)";
                    } else {
                        barFill.style.background = "var(--color-success)";
                    }
                }

                // Warn if usage is high
                if (estimate.usage > 50 * 1024 * 1024) {
                    textEl.textContent += " Consider clearing the diagram cache.";
                }
            }).catch(function() {
                textEl.textContent = "Unable to check storage usage";
            });
        } else {
            textEl.textContent = "Storage estimate not available in this browser";
        }
    },

    /**
     * Clear the diagram cache (imported update diagrams stored in IndexedDB).
     */
    clearDiagramCache: function() {
        DB.clear(STORE_DIAGRAMS).then(function() {
            alert("Diagram cache cleared. Imported diagram images will need " +
                "to be re-imported if their PNG files are not in the diagrams folder.");
            UI.updateStorageDisplay();
        }).catch(function(err) {
            console.error("Failed to clear diagram cache:", err);
            alert("Failed to clear cache: " + err.message);
        });
    },

    /**
     * Apply a theme (light or dark).
     */
    applyTheme: function(theme) {
        document.body.classList.toggle("dark-theme", theme === "dark");
        // Update toggle icon: show sun when dark (click for light), moon when light (click for dark)
        var icon = document.getElementById("theme-icon");
        if (icon) {
            icon.textContent = theme === "dark" ? SYMBOLS.SUN : SYMBOLS.MOON;
        }
    },

    /**
     * Save a single preference key to the config in IndexedDB.
     */
    savePreference: function(key, value) {
        DB.get(STORE_CONFIG, "main").then(function(config) {
            if (config) {
                config[key] = value;
                return DB.put(STORE_CONFIG, config);
            }
        }).then(function() {
            console.log("Preference saved: " + key + " = " + value);
        }).catch(function(err) {
            console.error("Failed to save preference:", err);
        });
    },

    /**
     * Trigger MathJax to re-render any new math content on the page.
     * Waits for MathJax startup if it has not yet completed.
     * Clears previous typesetting on the target element before re-processing.
     */
    renderMath: function(element) {
        if (typeof MathJax === "undefined") {
            return Promise.resolve();
        }
        // MathJax v3 startup is async -- wait for it to be ready
        var ready = (MathJax.startup && MathJax.startup.promise)
            ? MathJax.startup.promise
            : Promise.resolve();

        return ready.then(function() {
            if (!MathJax.typesetPromise) return;
            var target = element ? [element] : undefined;
            // Clear any previous typesetting on this element so MathJax re-processes
            if (target && MathJax.typesetClear) {
                try { MathJax.typesetClear(target); } catch (e) { /* ignore */ }
            }
            return MathJax.typesetPromise(target);
        }).catch(function(err) {
            console.warn("MathJax render error:", err);
        });
    }
};


// ============================================================================
// STUDY UI MODULE
// Handles the study session interface: question display, solution reveal,
// self-assessment, session summary.
// ============================================================================
var StudyUI = {
    currentFilename: null,
    currentQuestion: null,
    partResults: {},
    guidedAccessedThisQuestion: false,
    assessedParts: 0,
    totalParts: 0,
    _nextReminderMinutes: 30,   // first reminder at 30 min, then +20 each time
    _activeAreaId: "question-area",  // overridden to "revise-question-area" for revision mode

    /**
     * Initialise study UI event listeners.
     */
    init: function() {
        // Start session button
        var startBtn = document.getElementById("start-session-btn");
        if (startBtn) {
            startBtn.addEventListener("click", function() {
                StudyUI.startSession();
            });
        }

        // Initial question estimate
        setTimeout(function() {
            StudyUI.updateQuestionEstimate();
        }, 200);
    },

    /**
     * Start a study session using the session config panel values.
     */
    startSession: function() {
        // Ensure we're targeting the study tab's question area
        StudyUI._activeAreaId = "question-area";

        // Read time input and convert to question count
        var timeInput = document.getElementById("session-time-input");
        var minutes = timeInput ? parseInt(timeInput.value, 10) : 15;

        // Read section filter
        var sectionFilter = "mix";
        var secGroup = document.getElementById("section-filter-group");
        if (secGroup) {
            var activeBtn = secGroup.querySelector('[aria-pressed="true"]');
            if (activeBtn) sectionFilter = activeBtn.getAttribute("data-value");
        }

        // Read focus filter (wrong list only)
        var wrongListOnly = false;
        var focusGroup = document.getElementById("focus-filter-group");
        if (focusGroup) {
            var focusBtn = focusGroup.querySelector('[aria-pressed="true"]');
            if (focusBtn) wrongListOnly = focusBtn.getAttribute("data-value") === "wrongonly";
        }

        // Estimate question count from time: ~1 minute per mark
        var goal = StudyUI.estimateQuestions(minutes, sectionFilter);

        // Edge case: check if any questions are available at all
        var availableKeys = Object.keys(QuestionEngine.getAvailableQuestions());
        if (availableKeys.length === 0) {
            var questionArea = document.getElementById(StudyUI._activeAreaId);
            if (questionArea) {
                questionArea.style.display = "block";
                questionArea.innerHTML =
                    '<div class="empty-session-msg">' +
                    '<div class="empty-session-icon">' + SYMBOLS.LOCK + '</div>' +
                    '<h3>No Questions Available Yet</h3>' +
                    '<p>No problem types have been unlocked by the schedule. ' +
                    'Check back later or ask your teacher for an update file.</p>' +
                    '<button class="btn btn-primary" ' +
                    'onclick="StudyUI.returnToHome()">Back</button></div>';
                var startScreen = document.querySelector(".study-start-screen");
                if (startScreen) startScreen.style.display = "none";
            }
            return;
        }

        // Hide start screen, show question area
        var startScreen = document.querySelector(".study-start-screen");
        var questionArea = document.getElementById(StudyUI._activeAreaId);
        if (startScreen) startScreen.style.display = "none";
        if (questionArea) questionArea.style.display = "block";

        SessionEngine.start("study", null, {
            goal: goal,
            sectionFilter: sectionFilter,
            wrongListOnly: wrongListOnly
        }).then(function() {
            StudyUI._nextReminderMinutes = 30; // reset duration reminder
            StudyUI.loadNextQuestion();
        });
    },

    /**
     * Estimate how many questions fit in a given number of minutes.
     * Uses ~1 minute per mark. Considers section filter.
     */
    estimateQuestions: function(minutes, sectionFilter) {
        var available = QuestionEngine.getAvailableQuestions();
        var keys = Object.keys(available);

        // Filter by section if needed
        if (sectionFilter && sectionFilter !== "mix") {
            keys = keys.filter(function(k) {
                var q = available[k];
                return !q.sectionName || q.sectionName === sectionFilter;
            });
        }

        if (keys.length === 0) return Math.max(1, Math.round(minutes / 5));

        // Calculate average marks per question
        var totalMarks = 0;
        keys.forEach(function(k) {
            totalMarks += (available[k].totalMarks || 5);
        });
        var avgMarks = totalMarks / keys.length;

        // ~1 minute per mark
        var estimated = Math.round(minutes / avgMarks);
        // Clamp to at least 1 and at most available questions
        return Math.max(1, Math.min(estimated, keys.length));
    },

    /**
     * Update the question estimate display on the session config panel.
     */
    updateQuestionEstimate: function() {
        var timeInput = document.getElementById("session-time-input");
        var estimateEl = document.getElementById("session-question-estimate");
        if (!timeInput || !estimateEl) return;

        var minutes = parseInt(timeInput.value, 10);

        // Read section filter
        var sectionFilter = "mix";
        var secGroup = document.getElementById("section-filter-group");
        if (secGroup) {
            var activeBtn = secGroup.querySelector('[aria-pressed="true"]');
            if (activeBtn) sectionFilter = activeBtn.getAttribute("data-value");
        }

        var count = StudyUI.estimateQuestions(minutes, sectionFilter);
        estimateEl.textContent = "~" + count + " question" + (count !== 1 ? "s" : "");
    },

    /**
     * Load and display the next question.
     */
    loadNextQuestion: function() {
        // Record results for the current question before moving on
        StudyUI._recordResultsIfNeeded().then(function() {
            // Check if session goal reached (bonus questions don't count)
            var plannedCount = SessionEngine.totalCount - SessionEngine.bonusCount;
            if (plannedCount >= SessionEngine.sessionGoal) {
                StudyUI.showSessionSummary();
                return;
            }

            SessionEngine.getNext().then(function(result) {
                if (!result) {
                    // No more questions available
                    StudyUI.showSessionSummary();
                    return;
                }
                StudyUI.renderQuestion(result);
            });
        });
    },

    /**
     * Load next question in exam mode from the pre-built queue.
     * @private
     */
    _loadExamQuestion: function() {
        var idx = SessionEngine.examQueueIndex;
        var queue = SessionEngine.examQueue;

        if (idx >= queue.length) {
            // All exam questions done -- show review landing
            StudyUI._showExamReviewLanding();
            return;
        }

        var item = queue[idx];
        SessionEngine.examQueueIndex++;
        SessionEngine.totalCount++;
        SessionEngine.currentQuestion = item.questionData;
        SessionEngine.currentFilename = item.filename;

        // Store for review later
        SessionEngine.examAnswers.push({
            filename: item.filename,
            questionData: item.questionData,
            targetProblemType: item.targetProblemType,
            questionNumber: SessionEngine.examQueueIndex
        });

        var result = {
            filename: item.filename,
            questionData: item.questionData,
            targetProblemType: item.targetProblemType,
            questionNumber: SessionEngine.examQueueIndex,
            sessionGoal: queue.length
        };

        StudyUI.renderQuestion(result);
    },

    /**
     * Show the exam review landing page after all questions are answered.
     * @private
     */
    _showExamReviewLanding: function() {
        var area = document.getElementById(StudyUI._activeAreaId);
        if (!area) return;

        var total = SessionEngine.examAnswers.length;
        var html = '<div class="session-summary">';
        html += '<div class="summary-header">';
        html += '<div class="summary-icon">' + SYMBOLS.CLIPBOARD + '</div>';
        html += '<h2>Exam Complete</h2>';
        html += '</div>';
        html += '<p style="text-align:center; color:var(--text-secondary); margin-bottom:var(--space-xl);">' +
            'You answered ' + total + ' question' + (total !== 1 ? 's' : '') +
            '. Now review each solution and mark how you went.</p>';
        html += '<div class="summary-actions">';
        html += '<button class="btn btn-primary btn-large" id="exam-start-review">' +
            'Review Answers</button>';
        html += '</div>';
        html += '</div>';

        area.innerHTML = html;

        document.getElementById("exam-start-review").addEventListener("click", function() {
            StudyUI._examReviewIndex = 0;
            StudyUI._inExamReview = true;
            StudyUI._showExamReviewQuestion(0);
        });
    },

    /** Current exam review index */
    _examReviewIndex: 0,

    /** Whether we're currently in the exam review phase */
    _inExamReview: false,

    /**
     * Show a single question + solution for exam review self-assessment.
     * @private
     */
    _showExamReviewQuestion: function(idx) {
        var answers = SessionEngine.examAnswers;
        if (idx >= answers.length) {
            // All reviewed -- show session summary
            StudyUI._inExamReview = false;
            StudyUI.showSessionSummary();
            return;
        }

        var item = answers[idx];
        var area = document.getElementById(StudyUI._activeAreaId);
        if (!area) return;

        // Set current state so assessment recording works
        StudyUI.currentFilename = item.filename;
        StudyUI.currentQuestion = item.questionData;
        StudyUI.partResults = {};
        StudyUI.guidedAccessedThisQuestion = false;
        StudyUI.assessedParts = 0;
        StudyUI._resultsRecorded = false;
        StudyUI.totalParts = item.questionData.parts ? item.questionData.parts.length : 0;
        StudyUI._examReviewIndex = idx;

        var q = item.questionData;
        var html = '';

        // Review header
        html += '<div class="exam-review-header">';
        html += '<h2>Review: Question ' + (idx + 1) + ' of ' + answers.length + '</h2>';
        html += '<div class="exam-review-progress">';
        var pct = Math.round(((idx) / answers.length) * 100);
        html += '<div class="progress-bar" style="max-width:300px;margin:var(--space-sm) auto;">' +
            '<div class="progress-fill" style="width:' + pct + '%"></div></div>';
        html += '</div></div>';

        // Question card (same as normal render)
        html += '<div class="question-card">';
        html += '<div class="question-header">';
        html += '<h3 class="question-ref">' +
            StudyUI._escapeHtml(q.questionReference || item.filename) + '</h3>';
        html += '<div class="question-badges">';
        html += '<span class="badge badge-section">' +
            StudyUI._escapeHtml(q.sectionName || "") + '</span>';
        html += '<span class="badge badge-marks">' + (q.totalMarks || 0) + ' marks</span>';
        html += '</div></div>';

        if (q.questionStimulus) {
            html += '<div class="question-stimulus">' +
                StudyUI._escapeHtml(q.questionStimulus) + '</div>';
        }

        if (q.images && q.images.length > 0) {
            html += '<div class="question-diagrams">';
            q.images.forEach(function(img) {
                var imgPath = StudyUI._getDiagramPath(img, q._pool);
                html += '<img src="' + StudyUI._escapeHtml(imgPath) +
                    '" class="question-diagram" alt="Diagram">';
            });
            html += '</div>';
        }

        if (q.parts) {
            q.parts.forEach(function(part, pidx) {
                html += '<div class="question-part" data-part-index="' + pidx + '">';
                html += '<div class="part-header">';
                html += '<span class="part-label">(' + StudyUI._escapeHtml(part.partLabel) + ')</span>';
                html += '<span class="part-marks">[' + part.partMarks + ' mark' +
                    (part.partMarks !== 1 ? 's' : '') + ']</span>';
                html += '</div>';
                html += '<div class="part-text">' + StudyUI._escapeHtml(part.questionText) + '</div>';
                if (part.diagramsNeeded && part.diagramsNeeded.length > 0) {
                    html += '<div class="part-diagrams">';
                    part.diagramsNeeded.forEach(function(d) {
                        var dPath = StudyUI._getDiagramPath(d, q._pool);
                        html += '<img src="' + StudyUI._escapeHtml(dPath) +
                            '" class="question-diagram" alt="Diagram">';
                    });
                    html += '</div>';
                }
                html += '</div>';
            });
        }
        html += '</div>'; // .question-card

        // Show solution immediately for review
        html += '<div id="solution-area"></div>';

        area.innerHTML = html;
        UI.renderMath(area);

        // Immediately show the solution (reuse existing method internals)
        StudyUI._renderExamReviewSolution(q, idx);
    },

    /**
     * Render the solution for exam review with self-assessment.
     * After all parts assessed, automatically advance.
     * @private
     */
    _renderExamReviewSolution: function(q, reviewIdx) {
        var solArea = document.getElementById("solution-area");
        if (!solArea || !q.parts) return;

        var html = '<div class="solution-container">';
        html += '<h3 class="solution-title">Worked Solution</h3>';

        // Quick assess
        if (q.parts.length > 0) {
            var totalMarks = 0;
            q.parts.forEach(function(p) { totalMarks += (p.partMarks || 0); });
            html += '<div class="quick-assess" id="quick-assess">';
            html += '<span class="quick-assess-label">Quick mark:</span>';
            html += '<button class="btn btn-correct btn-quick" ' +
                'onclick="StudyUI.assessAllParts(\'correct\')">' +
                SYMBOLS.CHECK + ' All Correct (' + totalMarks + '/' + totalMarks + ')</button>';
            html += '<button class="btn btn-error btn-quick" ' +
                'onclick="StudyUI.assessAllParts(\'wrong\')">' +
                SYMBOLS.CROSS + ' All Wrong (0/' + totalMarks + ')</button>';
            html += '</div>';
        }

        q.parts.forEach(function(part, partIdx) {
            html += '<div class="solution-part" data-part-idx="' + partIdx + '">';
            html += '<h4 class="solution-part-header">Part (' +
                StudyUI._escapeHtml(part.partLabel) + ') ' +
                SYMBOLS.BULLET + ' ' + part.partMarks + ' mark' +
                (part.partMarks !== 1 ? 's' : '') + '</h4>';

            if (part.originalSolution && part.originalSolution.length > 0) {
                html += '<div class="solution-lines" id="sol-lines-' + partIdx + '">';
                part.originalSolution.forEach(function(line, lineIdx) {
                    if (!line.shown) return;
                    html += '<div class="solution-line" data-line="' + (lineIdx + 1) + '">';
                    html += '<span class="line-number">' + (lineIdx + 1) + '</span>';
                    html += '<span class="line-text">' + StudyUI._escapeHtml(line.text) + '</span>';
                    html += '</div>';
                });
                html += '</div>';
            }

            if (part.marking && part.marking.length > 0) {
                html += '<div class="marking-criteria" id="marking-' + partIdx + '">';
                html += '<div class="marking-header">Marking Criteria</div>';
                part.marking.forEach(function(m, mIdx) {
                    html += '<div class="marking-row" data-mark-idx="' + mIdx + '">';
                    html += '<span class="mark-awarded">' + m.awarded + '</span>';
                    html += '<span class="mark-text">' + StudyUI._escapeHtml(m.text) + '</span>';
                    html += '</div>';
                });
                html += '</div>';
            }

            html += '<div class="self-assess" id="assess-' + partIdx + '">';
            html += '<div class="assess-prompt">How did you go on this part?</div>';
            html += '<div class="assess-buttons">';
            html += '<button class="btn btn-correct" ' +
                'onclick="StudyUI.assessPart(' + partIdx + ', \'correct\')">' +
                SYMBOLS.CHECK + ' 100% Correct</button>';
            html += '<button class="btn btn-error" ' +
                'onclick="StudyUI.assessPart(' + partIdx + ', \'error\')">' +
                SYMBOLS.CROSS + ' I made an error</button>';
            html += '</div>';
            html += '<a href="#" class="unsure-link" ' +
                'onclick="StudyUI.assessPart(' + partIdx +
                ', \'unsure\'); return false;">Correct but unsure</a>';
            html += '</div>';

            html += '<div class="error-line-select" id="error-select-' + partIdx +
                '" style="display:none;">';
            html += '<button class="btn btn-all-wrong" ' +
                'onclick="StudyUI.selectErrorLine(' + partIdx +
                ', 1)">Got it completely wrong (0/' + part.partMarks + ')</button>';
            html += '<div class="error-prompt">Or tap the line where you <strong>first</strong>' +
                ' went wrong:</div>';
            if (part.originalSolution) {
                part.originalSolution.forEach(function(line, lineIdx) {
                    if (!line.shown) return;
                    html += '<div class="error-line-option" onclick="StudyUI.selectErrorLine(' +
                        partIdx + ', ' + (lineIdx + 1) + ')">';
                    html += '<span class="line-number">' + (lineIdx + 1) + '</span>';
                    html += '<span class="line-text">' + StudyUI._escapeHtml(line.text) + '</span>';
                    html += '</div>';
                });
            }
            html += '</div>';

            html += '<div class="part-result" id="result-' + partIdx + '"></div>';
            html += '</div>'; // solution-part
        });

        html += '</div>'; // solution-container

        // Navigation for review
        html += '<div class="exam-review-nav" id="exam-review-nav" style="display:none;">';
        if (reviewIdx < SessionEngine.examAnswers.length - 1) {
            html += '<button class="btn btn-primary btn-large" id="exam-review-next">' +
                'Next Question ' + SYMBOLS.ARROW_RIGHT + '</button>';
        } else {
            html += '<button class="btn btn-primary btn-large" id="exam-review-finish">' +
                'Finish Review</button>';
        }
        html += '</div>';

        solArea.innerHTML = html;
        UI.renderMath(solArea);
    },

    /**
     * Record results for the current question if not already recorded.
     * Called when moving to next question, another-like-this, or session end.
     * @private
     */
    _recordResultsIfNeeded: function() {
        if (StudyUI._resultsRecorded || !StudyUI.currentFilename) {
            return Promise.resolve();
        }
        var assessed = Object.keys(StudyUI.partResults).length;
        if (assessed < StudyUI.totalParts) {
            return Promise.resolve(); // not all parts assessed yet
        }
        StudyUI._resultsRecorded = true;
        return SessionEngine.recordResults(
            StudyUI.currentFilename, StudyUI.partResults
        );
    },

    /**
     * Render a question to the question area.
     */
    renderQuestion: function(questionInfo) {
        StudyUI.currentFilename = questionInfo.filename;
        StudyUI.currentQuestion = questionInfo.questionData;
        StudyUI.partResults = {};
        StudyUI.guidedAccessedThisQuestion = false;
        StudyUI.assessedParts = 0;
        StudyUI._resultsRecorded = false;
        StudyUI.totalParts = questionInfo.questionData.parts ?
            questionInfo.questionData.parts.length : 0;

        var area = document.getElementById(StudyUI._activeAreaId);
        if (!area) return;

        var q = questionInfo.questionData;
        var html = "";

        // Progress bar
        html += '<div class="session-progress">';
        if (questionInfo.isBonus) {
            html += '<div class="progress-text">' + SYMBOLS.LIGHTNING +
                ' Bonus: Another like this</div>';
        } else {
            var plannedNum = questionInfo.questionNumber - (SessionEngine.bonusCount || 0);
            html += '<div class="progress-text">Question ' +
                plannedNum + ' of ' +
                questionInfo.sessionGoal + '</div>';
        }
        var plannedDone = (questionInfo.questionNumber - (SessionEngine.bonusCount || 0));
        var pct = Math.round((plannedDone / questionInfo.sessionGoal) * 100);
        pct = Math.min(pct, 100);
        html += '<div class="progress-bar"><div class="progress-fill" style="width:' +
            pct + '%"></div></div>';
        html += '</div>';

        // Question header
        html += '<div class="question-card">';
        html += '<div class="question-header">';
        html += '<h3 class="question-ref">' +
            StudyUI._escapeHtml(q.questionReference || questionInfo.filename) + '</h3>';
        html += '<div class="question-badges">';
        html += '<span class="badge badge-section">' +
            StudyUI._escapeHtml(q.sectionName || "") + '</span>';
        html += '<span class="badge badge-marks">' + (q.totalMarks || 0) + ' marks</span>';
        if (q.difficultyRating) {
            var diffClass = "badge-diff-" + (q.difficultyRating || "average").toLowerCase()
                .replace(/ /g, "").replace("very", "v");
            html += '<span class="badge ' + diffClass + '">' +
                StudyUI._escapeHtml(q.difficultyRating) + '</span>';
        }
        html += '</div></div>';

        // Question stimulus
        if (q.questionStimulus) {
            html += '<div class="question-stimulus">' +
                StudyUI._escapeHtml(q.questionStimulus) + '</div>';
        }

        // Diagrams (question-level images)
        if (q.images && q.images.length > 0) {
            html += '<div class="question-diagrams">';
            q.images.forEach(function(img) {
                var imgPath = StudyUI._getDiagramPath(img, q._pool);
                html += '<img src="' + StudyUI._escapeHtml(imgPath) +
                    '" class="question-diagram" alt="Diagram">';
            });
            html += '</div>';
        }

        // Parts
        if (q.parts) {
            q.parts.forEach(function(part, idx) {
                html += '<div class="question-part" data-part-index="' + idx + '">';
                html += '<div class="part-header">';
                html += '<span class="part-label">(' + StudyUI._escapeHtml(part.partLabel) +
                    ')</span>';
                html += '<span class="part-marks">[' + part.partMarks + ' mark' +
                    (part.partMarks !== 1 ? 's' : '') + ']</span>';
                html += '</div>';
                html += '<div class="part-text">' +
                    StudyUI._escapeHtml(part.questionText) + '</div>';

                // Part-level diagrams
                if (part.diagramsNeeded && part.diagramsNeeded.length > 0) {
                    html += '<div class="part-diagrams">';
                    part.diagramsNeeded.forEach(function(d) {
                        var dPath = StudyUI._getDiagramPath(d, q._pool);
                        html += '<img src="' + StudyUI._escapeHtml(dPath) +
                            '" class="question-diagram" alt="Diagram">';
                    });
                    html += '</div>';
                }
                html += '</div>';
            });
        }

        // Show Solution button OR Exam mode navigation
        if (SessionEngine.examMode) {
            // Exam mode: no solution, just "Next Question"
            html += '<div class="exam-question-nav">';
            html += '<p class="solution-prompt">Work through this question on paper, then move on.</p>';
            var isLast = SessionEngine.examQueueIndex >= SessionEngine.examQueue.length;
            if (isLast) {
                html += '<button class="btn btn-primary btn-large" id="exam-next-btn">' +
                    'Finish Exam ' + SYMBOLS.ARROW_RIGHT + '</button>';
            } else {
                html += '<button class="btn btn-primary btn-large" id="exam-next-btn">' +
                    'Next Question ' + SYMBOLS.ARROW_RIGHT + '</button>';
            }
            html += '</div>';
        } else {
            html += '<div class="show-solution-area">';
            html += '<p class="solution-prompt">Work through this question on paper, ' +
                'then check your answer.</p>';
            html += '<button class="btn btn-primary btn-large" id="show-solution-btn">' +
                'I\'ve finished ' + SYMBOLS.ARROW_RIGHT + ' Show Solution</button>';
            html += '</div>';
        }

        html += '</div>'; // .question-card

        // Solution area (hidden initially) -- only needed in interactive mode
        if (!SessionEngine.examMode) {
            html += '<div id="solution-area" style="display:none;"></div>';
        }

        // Session control
        html += '<div class="session-controls" id="session-controls" style="display:none;">';
        html += '<button class="btn btn-secondary" id="end-session-btn">End Session</button>';
        html += '</div>';

        area.innerHTML = html;

        // Bind exam mode next button
        if (SessionEngine.examMode) {
            var examNextBtn = document.getElementById("exam-next-btn");
            if (examNextBtn) {
                examNextBtn.addEventListener("click", function() {
                    StudyUI._loadExamQuestion();
                });
            }
        } else {
            // Bind show solution button
            var showBtn = document.getElementById("show-solution-btn");
            if (showBtn) {
                showBtn.addEventListener("click", function() {
                    StudyUI.showSolution();
                });
            }
        }

        // End session button
        var endBtn = document.getElementById("end-session-btn");
        if (endBtn) {
            endBtn.addEventListener("click", function() {
                StudyUI.showSessionSummary();
            });
        }

        // Render math
        UI.renderMath(area);

        // Check session duration for break reminder
        StudyUI._checkDurationReminder();
    },

    /**
     * Check if a session duration reminder is due and show it.
     * First reminder at 40 minutes, then every 20 minutes after.
     */
    _checkDurationReminder: function() {
        if (!SessionEngine.startTime) return;
        var elapsed = (new Date() - SessionEngine.startTime) / 60000; // minutes
        if (elapsed >= StudyUI._nextReminderMinutes) {
            StudyUI._nextReminderMinutes = elapsed + 20; // next reminder in 20 more min
            StudyUI._showDurationReminder(Math.round(elapsed));
        }
    },

    /**
     * Show a non-blocking duration reminder banner.
     */
    _showDurationReminder: function(minutes) {
        // Remove any existing reminder
        var existing = document.getElementById("duration-reminder");
        if (existing) existing.remove();

        var reminder = document.createElement("div");
        reminder.id = "duration-reminder";
        reminder.className = "duration-reminder";
        reminder.innerHTML =
            '<div class="reminder-content">' +
            '<div class="reminder-icon">' + SYMBOLS.CLOCK + '</div>' +
            '<div class="reminder-text">' +
            '<strong>You\'ve been studying for ' + minutes + ' minutes</strong>' +
            '<p>A major review of learning strategies published in ' +
            '<em>Psychological Science in the Public Interest</em> ' +
            '(Dunlosky et al., 2013) rated distributed practice ' + SYMBOLS.EM_DASH +
            ' spreading study across multiple shorter sessions ' + SYMBOLS.EM_DASH +
            ' as one of the two most effective learning techniques, with ' +
            'students retaining significantly more than those who study in ' +
            'longer blocks. For cognitively demanding tasks like maths problem-solving, ' +
            'research suggests 20' + SYMBOLS.EM_DASH + '30 minutes of focused practice ' +
            'per session is optimal (Cepeda et al., 2006).</p>' +
            '<p class="reminder-suggestion">' + SYMBOLS.ARROW_RIGHT +
            ' We suggest this is the last question you complete this session. ' +
            'Come back tomorrow ' + SYMBOLS.EM_DASH +
            ' your future self will thank you.</p>' +
            '</div>' +
            '<button class="btn btn-secondary reminder-dismiss" ' +
            'id="reminder-dismiss-btn">Got it</button>' +
            '</div>';

        // Insert at top of question area
        var area = document.getElementById(StudyUI._activeAreaId);
        if (area) {
            area.insertBefore(reminder, area.firstChild);
            var dismissBtn = document.getElementById("reminder-dismiss-btn");
            if (dismissBtn) {
                dismissBtn.addEventListener("click", function() {
                    reminder.style.opacity = "0";
                    setTimeout(function() { reminder.remove(); }, 300);
                });
            }
        }
    },

    /**
     * Show the solution (Layer 1 + Layer 2).
     */
    showSolution: function() {
        var q = StudyUI.currentQuestion;
        if (!q || !q.parts) return;

        // Hide the "show solution" button
        var showArea = document.querySelector(".show-solution-area");
        if (showArea) showArea.style.display = "none";

        var solArea = document.getElementById("solution-area");
        if (!solArea) return;

        var html = '<div class="solution-container">';
        html += '<h3 class="solution-title">Worked Solution</h3>';

        // Question-level quick assessment buttons
        if (q.parts && q.parts.length > 0) {
            var totalMarks = 0;
            q.parts.forEach(function(p) { totalMarks += (p.partMarks || 0); });
            html += '<div class="quick-assess" id="quick-assess">';
            html += '<span class="quick-assess-label">Quick mark:</span>';
            html += '<button class="btn btn-correct btn-quick" ' +
                'onclick="StudyUI.assessAllParts(\'correct\')">' +
                SYMBOLS.CHECK + ' All Correct (' + totalMarks + '/' +
                totalMarks + ')</button>';
            html += '<button class="btn btn-error btn-quick" ' +
                'onclick="StudyUI.assessAllParts(\'wrong\')">' +
                SYMBOLS.CROSS + ' All Wrong (0/' + totalMarks + ')</button>';
            html += '</div>';
        }

        q.parts.forEach(function(part, partIdx) {
            html += '<div class="solution-part" data-part-idx="' + partIdx + '">';
            html += '<h4 class="solution-part-header">Part (' +
                StudyUI._escapeHtml(part.partLabel) + ') ' +
                SYMBOLS.BULLET + ' ' + part.partMarks + ' mark' +
                (part.partMarks !== 1 ? 's' : '') + '</h4>';

            // Numbered solution lines
            if (part.originalSolution && part.originalSolution.length > 0) {
                html += '<div class="solution-lines" id="sol-lines-' + partIdx + '">';
                part.originalSolution.forEach(function(line, lineIdx) {
                    if (!line.shown) return;
                    html += '<div class="solution-line" data-line="' + (lineIdx + 1) + '">';
                    html += '<span class="line-number">' + (lineIdx + 1) + '</span>';
                    html += '<span class="line-text">' +
                        StudyUI._escapeHtml(line.text) + '</span>';
                    html += '</div>';
                });
                html += '</div>';
            }

            // Marking criteria
            if (part.marking && part.marking.length > 0) {
                html += '<div class="marking-criteria" id="marking-' + partIdx + '">';
                html += '<div class="marking-header">Marking Criteria</div>';
                part.marking.forEach(function(m, mIdx) {
                    html += '<div class="marking-row" data-mark-idx="' + mIdx + '">';
                    html += '<span class="mark-awarded">' + m.awarded + '</span>';
                    html += '<span class="mark-text">' +
                        StudyUI._escapeHtml(m.text) + '</span>';
                    html += '</div>';
                });
                html += '</div>';
            }

            // Self-assessment buttons (Layer 2)
            html += '<div class="self-assess" id="assess-' + partIdx + '">';
            html += '<div class="assess-prompt">How did you go on this part?</div>';
            html += '<div class="assess-buttons">';
            html += '<button class="btn btn-correct" ' +
                'onclick="StudyUI.assessPart(' + partIdx + ', \'correct\')">' +
                SYMBOLS.CHECK + ' 100% Correct</button>';
            html += '<button class="btn btn-error" ' +
                'onclick="StudyUI.assessPart(' + partIdx + ', \'error\')">' +
                SYMBOLS.CROSS + ' I made an error</button>';
            html += '</div>';
            html += '<a href="#" class="unsure-link" ' +
                'onclick="StudyUI.assessPart(' + partIdx +
                ', \'unsure\'); return false;">Correct but unsure</a>';
            html += '</div>';

            // Error line selection (hidden initially)
            html += '<div class="error-line-select" id="error-select-' + partIdx +
                '" style="display:none;">';
            html += '<button class="btn btn-all-wrong" ' +
                'onclick="StudyUI.selectErrorLine(' + partIdx +
                ', 1)">Got it completely wrong (0/' + part.partMarks + ')</button>';
            html += '<div class="error-prompt">Or tap the line where you <strong>first</strong>' +
                ' went wrong:</div>';
            if (part.originalSolution) {
                part.originalSolution.forEach(function(line, lineIdx) {
                    if (!line.shown) return;
                    html += '<div class="error-line-option" ' +
                        'onclick="StudyUI.selectErrorLine(' + partIdx + ', ' +
                        (lineIdx + 1) + ')">';
                    html += '<span class="line-number">' + (lineIdx + 1) + '</span>';
                    html += '<span class="line-text">' +
                        StudyUI._escapeHtml(line.text) + '</span>';
                    html += '</div>';
                });
            }
            html += '</div>';

            // Part result display (hidden initially)
            html += '<div class="part-result" id="result-' + partIdx +
                '" style="display:none;"></div>';

            html += '</div>'; // .solution-part
        });

        // Guided solution trigger (Layer 3)
        html += '<div class="guided-trigger" id="guided-trigger">';
        html += '<button class="btn btn-secondary btn-large" id="show-guided-btn">' +
            'I don\'t understand ' + SYMBOLS.ARROW_RIGHT +
            ' Show me the walkthrough</button>';
        html += '</div>';

        // Guided solution area (hidden)
        html += '<div id="guided-area" style="display:none;"></div>';

        // Next question / end session (hidden until all parts assessed)
        html += '<div id="next-question-area" style="display:none;">';
        html += '<div id="question-feedback"></div>';
        html += '<div class="next-actions">';
        html += '<button class="btn btn-primary btn-large" id="next-question-btn">' +
            'Next Question ' + SYMBOLS.ARROW_RIGHT + '</button>';
        html += '<button class="btn btn-retry btn-large" id="another-like-this-btn">' +
            SYMBOLS.LIGHTNING + ' Another like this</button>';
        html += '</div>';
        html += '<button class="btn btn-secondary" id="end-session-btn-2">' +
            'End Session</button>';
        html += '</div>';

        html += '</div>'; // .solution-container

        solArea.innerHTML = html;
        solArea.style.display = "block";

        // Bind guided solution button
        var guidedBtn = document.getElementById("show-guided-btn");
        if (guidedBtn) {
            guidedBtn.addEventListener("click", function() {
                StudyUI.showGuided();
            });
        }

        // Bind next question button
        var nextBtn = document.getElementById("next-question-btn");
        if (nextBtn) {
            nextBtn.addEventListener("click", function() {
                StudyUI.loadNextQuestion();
                window.scrollTo(0, 0);
            });
        }

        // Bind "another like this" button
        var anotherBtn = document.getElementById("another-like-this-btn");
        if (anotherBtn) {
            anotherBtn.addEventListener("click", function() {
                StudyUI.anotherLikeThis();
            });
        }

        var endBtn2 = document.getElementById("end-session-btn-2");
        if (endBtn2) {
            endBtn2.addEventListener("click", function() {
                StudyUI.showSessionSummary();
            });
        }

        // Show session controls
        var controls = document.getElementById("session-controls");
        if (controls) controls.style.display = "flex";

        // Render math in solution
        UI.renderMath(solArea);

        // Scroll to solution
        solArea.scrollIntoView({ behavior: "smooth" });
    },

    /**
     * Quick-assess ALL parts at once (question-level shortcut).
     * @param {string} mode - "correct" (all parts full marks) or "wrong" (all parts error at line 1)
     */
    assessAllParts: function(mode) {
        var q = StudyUI.currentQuestion;
        if (!q || !q.parts) return;

        // Hide the quick-assess buttons
        var quickArea = document.getElementById("quick-assess");
        if (quickArea) quickArea.style.display = "none";

        q.parts.forEach(function(part, partIdx) {
            // Skip already-assessed parts
            if (StudyUI.partResults[part.partLabel]) return;

            if (mode === "correct") {
                StudyUI.assessPart(partIdx, "correct");
            } else {
                // "wrong" -- hide the per-part assess buttons, then mark error at line 1
                var assessArea = document.getElementById("assess-" + partIdx);
                if (assessArea) assessArea.style.display = "none";
                StudyUI.selectErrorLine(partIdx, 1);
            }
        });
    },

    /**
     * Handle part self-assessment.
     */
    assessPart: function(partIdx, result) {
        var part = StudyUI.currentQuestion.parts[partIdx];
        if (!part) return;

        // Hide question-level quick buttons once per-part assessment starts
        var quickArea = document.getElementById("quick-assess");
        if (quickArea) quickArea.style.display = "none";

        var assessArea = document.getElementById("assess-" + partIdx);
        var resultArea = document.getElementById("result-" + partIdx);
        var changeLink = ' <a href="#" class="change-assess-link" ' +
            'onclick="StudyUI.resetPartAssessment(' + partIdx +
            '); return false;">Change</a>';

        if (result === "correct") {
            // Full marks for this part
            StudyUI.partResults[part.partLabel] = {
                correct: true,
                correctButUnsure: false,
                errorAtLine: null,
                markingCriteriaFailed: []
            };
            if (assessArea) assessArea.style.display = "none";
            if (resultArea) {
                resultArea.innerHTML = '<div class="result-correct">' + SYMBOLS.CHECK +
                    ' All correct! Full marks (' + part.partMarks + '/' +
                    part.partMarks + ')' + changeLink + '</div>';
                resultArea.style.display = "block";
            }
            StudyUI._highlightSolutionLines(partIdx, -1); // all green
            StudyUI._makeLinesClickable(partIdx); // allow clicking to switch to error
            StudyUI._checkAllAssessed();

        } else if (result === "unsure") {
            // Correct but unsure - add to confidence watch
            StudyUI.partResults[part.partLabel] = {
                correct: true,
                correctButUnsure: true,
                errorAtLine: null,
                markingCriteriaFailed: []
            };
            if (assessArea) assessArea.style.display = "none";
            if (resultArea) {
                resultArea.innerHTML = '<div class="result-unsure">' + SYMBOLS.CHECK +
                    ' Correct (flagged for review) (' + part.partMarks + '/' +
                    part.partMarks + ')' + changeLink + '</div>';
                resultArea.style.display = "block";
            }
            StudyUI._highlightSolutionLines(partIdx, -1);
            StudyUI._makeLinesClickable(partIdx);
            StudyUI._checkAllAssessed();

        } else if (result === "error") {
            // Show error line selection
            if (assessArea) assessArea.style.display = "none";
            var errorSelect = document.getElementById("error-select-" + partIdx);
            if (errorSelect) errorSelect.style.display = "block";
        }
    },

    /**
     * Make solution lines clickable after a "correct" assessment.
     * Clicking a line switches the assessment to "error at that line".
     * @private
     */
    _makeLinesClickable: function(partIdx) {
        var linesContainer = document.getElementById("sol-lines-" + partIdx);
        if (!linesContainer) return;

        var lines = linesContainer.querySelectorAll(".solution-line");
        lines.forEach(function(el) {
            el.classList.add("line-clickable");
            el.onclick = function() {
                var lineNum = parseInt(el.getAttribute("data-line"), 10);
                StudyUI.correctLineClick(partIdx, lineNum);
            };
        });
    },

    /**
     * Handle error line selection.
     */
    selectErrorLine: function(partIdx, lineNumber) {
        var part = StudyUI.currentQuestion.parts[partIdx];
        if (!part) return;

        var totalLines = 0;
        if (part.originalSolution) {
            part.originalSolution.forEach(function(l) {
                if (l.shown) totalLines++;
            });
        }
        var totalCriteria = part.marking ? part.marking.length : 0;
        var failedCriteria = mapErrorToCriteria(lineNumber, totalLines, totalCriteria);

        // Calculate marks lost
        var marksLost = 0;
        if (part.marking) {
            failedCriteria.forEach(function(idx) {
                if (part.marking[idx]) {
                    marksLost += part.marking[idx].awarded;
                }
            });
        }
        var marksEarned = part.partMarks - marksLost;

        StudyUI.partResults[part.partLabel] = {
            correct: false,
            correctButUnsure: false,
            errorAtLine: lineNumber,
            markingCriteriaFailed: failedCriteria
        };

        // Hide error selection
        var errorSelect = document.getElementById("error-select-" + partIdx);
        if (errorSelect) errorSelect.style.display = "none";

        // Show result with Change link
        var changeLink = ' <a href="#" class="change-assess-link" ' +
            'onclick="StudyUI.resetPartAssessment(' + partIdx +
            '); return false;">Change</a>';
        var resultArea = document.getElementById("result-" + partIdx);
        if (resultArea) {
            resultArea.innerHTML = '<div class="result-error">' + SYMBOLS.CROSS +
                ' Error at line ' + lineNumber + ' (' + marksEarned + '/' +
                part.partMarks + ')' + changeLink + '</div>';
            resultArea.style.display = "block";
        }

        // Highlight solution lines and marking criteria
        StudyUI._highlightSolutionLines(partIdx, lineNumber);
        StudyUI._highlightMarkingCriteria(partIdx, failedCriteria);

        StudyUI._checkAllAssessed();
    },

    /**
     * Highlight solution lines based on error position.
     * @private
     */
    _highlightSolutionLines: function(partIdx, errorLine) {
        var linesContainer = document.getElementById("sol-lines-" + partIdx);
        if (!linesContainer) return;

        var lines = linesContainer.querySelectorAll(".solution-line");
        lines.forEach(function(el) {
            var lineNum = parseInt(el.getAttribute("data-line"), 10);
            if (errorLine === -1) {
                // All correct
                el.classList.add("line-correct");
            } else if (lineNum < errorLine) {
                el.classList.add("line-correct");
            } else {
                el.classList.add("line-error");
            }
        });
    },

    /**
     * Highlight failed marking criteria.
     * @private
     */
    _highlightMarkingCriteria: function(partIdx, failedIndices) {
        var markingContainer = document.getElementById("marking-" + partIdx);
        if (!markingContainer) return;

        var rows = markingContainer.querySelectorAll(".marking-row");
        rows.forEach(function(el) {
            var idx = parseInt(el.getAttribute("data-mark-idx"), 10);
            if (failedIndices.indexOf(idx) !== -1) {
                el.classList.add("mark-failed");
            } else {
                el.classList.add("mark-passed");
            }
        });
    },

    /**
     * Reset a part's assessment so the student can re-assess.
     * Clears highlights, hides results, re-shows assess buttons.
     */
    resetPartAssessment: function(partIdx) {
        var part = StudyUI.currentQuestion.parts[partIdx];
        if (!part) return;

        // Remove from partResults
        delete StudyUI.partResults[part.partLabel];

        // Allow re-recording when all parts are re-assessed
        StudyUI._resultsRecorded = false;

        // Hide result area
        var resultArea = document.getElementById("result-" + partIdx);
        if (resultArea) {
            resultArea.innerHTML = "";
            resultArea.style.display = "none";
        }

        // Re-show self-assess buttons
        var assessArea = document.getElementById("assess-" + partIdx);
        if (assessArea) assessArea.style.display = "block";

        // Hide error line selection if visible
        var errorSelect = document.getElementById("error-select-" + partIdx);
        if (errorSelect) errorSelect.style.display = "none";

        // Clear solution line highlights and click handlers
        var linesContainer = document.getElementById("sol-lines-" + partIdx);
        if (linesContainer) {
            var lines = linesContainer.querySelectorAll(".solution-line");
            lines.forEach(function(el) {
                el.classList.remove("line-correct", "line-error", "line-clickable");
                el.onclick = null;
            });
        }

        // Clear marking criteria highlights
        var markingContainer = document.getElementById("marking-" + partIdx);
        if (markingContainer) {
            var rows = markingContainer.querySelectorAll(".marking-row");
            rows.forEach(function(el) {
                el.classList.remove("mark-passed", "mark-failed");
            });
        }

        // If the next-question area was shown, hide it (user is changing their answer)
        var nextArea = document.getElementById("next-question-area");
        if (nextArea) nextArea.style.display = "none";

        // Re-show guided trigger if it was hidden
        var guidedTrigger = document.getElementById("guided-trigger");
        if (guidedTrigger) guidedTrigger.style.display = "block";

        // Re-show the quick-assess buttons if NO parts are now assessed
        if (Object.keys(StudyUI.partResults).length === 0) {
            var quickArea = document.getElementById("quick-assess");
            if (quickArea) quickArea.style.display = "flex";
        }
    },

    /**
     * Handle a click on a solution line after the part has been assessed as correct.
     * This lets the student change from "correct" to "error at this line".
     */
    correctLineClick: function(partIdx, lineNumber) {
        var part = StudyUI.currentQuestion.parts[partIdx];
        if (!part) return;

        // Only allow if this part was previously assessed as correct/unsure
        var existing = StudyUI.partResults[part.partLabel];
        if (!existing || !existing.correct) return;

        // Remove the old result and treat as error at this line
        delete StudyUI.partResults[part.partLabel];
        StudyUI._resultsRecorded = false;

        // Hide next-question area if shown
        var nextArea = document.getElementById("next-question-area");
        if (nextArea) nextArea.style.display = "none";

        // Clear previous highlights
        var linesContainer = document.getElementById("sol-lines-" + partIdx);
        if (linesContainer) {
            linesContainer.querySelectorAll(".solution-line").forEach(function(el) {
                el.classList.remove("line-correct", "line-error", "line-clickable");
            });
        }
        var markingContainer = document.getElementById("marking-" + partIdx);
        if (markingContainer) {
            markingContainer.querySelectorAll(".marking-row").forEach(function(el) {
                el.classList.remove("mark-passed", "mark-failed");
            });
        }

        // Now apply the error at this line
        StudyUI.selectErrorLine(partIdx, lineNumber);
    },

    /**
     * Check if all parts have been assessed.
     * Does NOT record results yet -- that happens when user clicks Next.
     * @private
     */
    _checkAllAssessed: function() {
        var assessed = Object.keys(StudyUI.partResults).length;
        if (assessed < StudyUI.totalParts) return;

        // If we're in exam review mode, show the review nav instead of normal next area
        if (StudyUI._inExamReview) {
            // Record results for this question
            StudyUI._recordResultsIfNeeded().then(function() {
                var reviewNav = document.getElementById("exam-review-nav");
                if (reviewNav) {
                    reviewNav.style.display = "flex";

                    var nextBtn = document.getElementById("exam-review-next");
                    if (nextBtn) {
                        nextBtn.addEventListener("click", function() {
                            StudyUI._showExamReviewQuestion(StudyUI._examReviewIndex + 1);
                        });
                    }

                    var finishBtn = document.getElementById("exam-review-finish");
                    if (finishBtn) {
                        finishBtn.addEventListener("click", function() {
                            StudyUI._inExamReview = false;
                            StudyUI.showSessionSummary();
                        });
                    }

                    reviewNav.scrollIntoView({ behavior: "smooth" });
                }
            });
            return;
        }

        // All parts assessed -- show the next area (results recorded on Next click)
        StudyUI._showNextArea();
    },

    /**
     * Show the next question area with feedback.
     * @private
     */
    _showNextArea: function() {
        var nextArea = document.getElementById("next-question-area");
        if (!nextArea) return;

        // Generate feedback
        var allCorrect = true;
        var wrongPTs = [];
        var allPTs = [];
        var q = StudyUI.currentQuestion;

        if (q.parts) {
            q.parts.forEach(function(p) {
                if (p.problemType && allPTs.indexOf(p.problemType) === -1) {
                    allPTs.push(p.problemType);
                }
            });
        }

        Object.keys(StudyUI.partResults).forEach(function(label) {
            if (!StudyUI.partResults[label].correct) {
                allCorrect = false;
                // Find the problem type for this part
                if (q.parts) {
                    q.parts.forEach(function(p) {
                        if (p.partLabel === label && p.problemType) {
                            if (wrongPTs.indexOf(p.problemType) === -1) {
                                wrongPTs.push(p.problemType);
                            }
                        }
                    });
                }
            }
        });

        // Store target PTs for "another like this"
        // Prefer wrong PTs; if all correct, use all PTs from the question
        StudyUI._anotherTargetPTs = wrongPTs.length > 0 ? wrongPTs : allPTs;

        var feedbackEl = document.getElementById("question-feedback");
        if (feedbackEl) {
            if (allCorrect) {
                feedbackEl.innerHTML = '<div class="feedback-correct">' +
                    SYMBOLS.CHECK + ' All correct! Great work!</div>';
            } else {
                var ptList = wrongPTs.map(function(pt) {
                    return StudyUI._escapeHtml(pt);
                }).join(", ");
                feedbackEl.innerHTML = '<div class="feedback-review">' +
                    SYMBOLS.CROSS + ' Review needed: ' + ptList + '</div>';
            }
        }

        // Check if this was the last question in the goal (bonuses don't count)
        var nextBtn = document.getElementById("next-question-btn");
        var plannedCount = SessionEngine.totalCount - SessionEngine.bonusCount;
        if (plannedCount >= SessionEngine.sessionGoal) {
            if (nextBtn) nextBtn.textContent = "View Session Summary " + SYMBOLS.ARROW_RIGHT;
            nextBtn.onclick = function() { StudyUI.showSessionSummary(); };
        }

        // Check if "another like this" is possible
        var anotherBtn = document.getElementById("another-like-this-btn");
        if (anotherBtn && StudyUI._anotherTargetPTs.length > 0) {
            // Quick check: is there at least one candidate question available?
            var targetPT = StudyUI._anotherTargetPTs[0];
            var candidates = QuestionSelector._findCandidates(targetPT);
            // Exclude current question
            candidates = candidates.filter(function(c) {
                return c.filename !== StudyUI.currentFilename;
            });
            if (candidates.length === 0) {
                anotherBtn.disabled = true;
                anotherBtn.title = "No other questions available for this problem type";
            }
        }

        nextArea.style.display = "block";
        nextArea.scrollIntoView({ behavior: "smooth" });
    },

    /**
     * Serve another question testing the same problem type(s).
     * This is a bonus question that doesn't count against the session goal.
     */
    anotherLikeThis: function() {
        var targetPTs = StudyUI._anotherTargetPTs || [];
        if (targetPTs.length === 0) return;

        // Record results for current question first
        StudyUI._recordResultsIfNeeded().then(function() {
            // Pick the first target problem type
            var targetPT = targetPTs[0];

            MasteryEngine.getRetryCount(targetPT).then(function(retryCount) {
                return QuestionSelector.selectForProblemType(targetPT, retryCount);
            }).then(function(selected) {
                if (!selected) {
                    // No question available
                    var anotherBtn = document.getElementById("another-like-this-btn");
                    if (anotherBtn) {
                        anotherBtn.disabled = true;
                        anotherBtn.textContent = "No more available";
                    }
                    return;
                }

                // Serve the bonus question -- increment totalCount for stats
                // but also bonusCount so it doesn't count against session goal
                SessionEngine.totalCount++;
                SessionEngine.bonusCount++;
                SessionEngine.currentQuestion = selected.questionData;
                SessionEngine.currentFilename = selected.filename;

                var questionInfo = {
                    filename: selected.filename,
                    questionData: selected.questionData,
                    targetProblemType: targetPT,
                    questionNumber: SessionEngine.totalCount,
                    sessionGoal: SessionEngine.sessionGoal,
                    isBonus: true
                };

                window.scrollTo(0, 0);
                StudyUI.renderQuestion(questionInfo);
            });
        });
    },

    /**
     * Show the guided solution (Layer 3).
     */
    showGuided: function() {
        var q = StudyUI.currentQuestion;
        if (!q || !q.parts) return;

        var guidedArea = document.getElementById("guided-area");
        var trigger = document.getElementById("guided-trigger");
        if (!guidedArea) return;
        if (trigger) trigger.style.display = "none";

        // Record guided access
        if (!StudyUI.guidedAccessedThisQuestion) {
            StudyUI.guidedAccessedThisQuestion = true;
            var pts = [];
            q.parts.forEach(function(p) {
                if (p.problemType && pts.indexOf(p.problemType) === -1) {
                    pts.push(p.problemType);
                }
            });
            SessionEngine.recordGuidedAccess(pts);
        }

        var html = '<div class="guided-container">';
        html += '<h3 class="guided-title">' + SYMBOLS.BOOK + ' Guided Walkthrough</h3>';

        // Examiner comment
        if (q.examinerComment) {
            html += '<div class="examiner-comment">';
            html += '<div class="examiner-label">' + SYMBOLS.GRADUATION +
                ' Examiner Comment</div>';
            html += '<p>' + StudyUI._escapeHtml(q.examinerComment) + '</p>';
            html += '</div>';
        }

        q.parts.forEach(function(part) {
            html += '<div class="guided-part">';
            html += '<h4>Part (' + StudyUI._escapeHtml(part.partLabel) + ')</h4>';
            if (part.guidedSolution) {
                // Split on \\n for line breaks
                var lines = part.guidedSolution.split("\\n");
                lines.forEach(function(line) {
                    line = line.trim();
                    if (line === "") {
                        html += '<br>';
                    } else {
                        html += '<p class="guided-line">' +
                            StudyUI._escapeHtml(line) + '</p>';
                    }
                });
            } else {
                html += '<p class="text-muted">No guided solution available for this part.</p>';
            }
            html += '</div>';
        });

        html += '</div>';
        guidedArea.innerHTML = html;
        guidedArea.style.display = "block";

        UI.renderMath(guidedArea);
        guidedArea.scrollIntoView({ behavior: "smooth" });
    },

    /**
     * Show the session summary screen.
     */
    showSessionSummary: function() {
        // Record results for last question before ending session
        StudyUI._recordResultsIfNeeded().then(function() {
            return SessionEngine.end();
        }).then(function(sessionData) {
            var area = document.getElementById(StudyUI._activeAreaId);
            if (!area) return;

            var sd = sessionData || SessionEngine.sessionData;
            var html = '<div class="session-summary">';

            html += '<div class="summary-header">';
            if (sd.accuracyPercent >= 80) {
                html += '<div class="summary-icon">' + SYMBOLS.TROPHY + '</div>';
                html += '<h2>Excellent Session!</h2>';
            } else if (sd.accuracyPercent >= 60) {
                html += '<div class="summary-icon">' + SYMBOLS.STAR + '</div>';
                html += '<h2>Good Work!</h2>';
            } else {
                html += '<div class="summary-icon">' + SYMBOLS.GRAPH + '</div>';
                html += '<h2>Session Complete</h2>';
            }
            html += '</div>';

            // Stats grid
            html += '<div class="summary-stats">';
            html += StudyUI._summaryCard("Questions", sd.questionsAttempted);
            html += StudyUI._summaryCard("Parts Correct",
                sd.partsCorrect + " / " + sd.partsAttempted);
            html += StudyUI._summaryCard("Accuracy",
                sd.accuracyPercent + "%");
            html += StudyUI._summaryCard("Duration",
                sd.durationMinutes + " min");
            html += '</div>';

            // New masteries
            if (sd.newMasteries && sd.newMasteries.length > 0) {
                html += '<div class="summary-section summary-masteries">';
                html += '<h3>' + SYMBOLS.PARTY + ' New Masteries!</h3>';
                html += '<div class="mastery-list">';
                sd.newMasteries.forEach(function(pt) {
                    html += '<div class="mastery-badge">' + SYMBOLS.CHECK + ' ' +
                        StudyUI._escapeHtml(pt) + '</div>';
                });
                html += '</div></div>';
            }

            // Topic breakdown
            if (sd.topicBreakdown && Object.keys(sd.topicBreakdown).length > 0) {
                html += '<div class="summary-section">';
                html += '<h3>Topic Breakdown</h3>';
                Object.keys(sd.topicBreakdown).forEach(function(topic) {
                    var tb = sd.topicBreakdown[topic];
                    var topicPct = tb.attempted > 0 ?
                        Math.round((tb.correct / tb.attempted) * 100) : 0;
                    var barClass = topicPct >= 80 ? "bar-success" :
                        topicPct >= 50 ? "bar-warning" : "bar-danger";
                    html += '<div class="topic-row">';
                    html += '<span class="topic-name">' +
                        StudyUI._escapeHtml(topic) + '</span>';
                    html += '<span class="topic-score">' + tb.correct + '/' +
                        tb.attempted + '</span>';
                    html += '<div class="topic-bar"><div class="topic-bar-fill ' +
                        barClass + '" style="width:' + topicPct + '%"></div></div>';
                    html += '</div>';
                });
                html += '</div>';
            }

            // Actions
            html += '<div class="summary-actions">';
            html += '<button class="btn btn-primary btn-large" id="summary-new-session">' +
                'Start New Session</button>';
            html += '<button class="btn btn-secondary" id="summary-home">' +
                'Back to Home</button>';
            html += '</div>';

            html += '</div>';
            area.innerHTML = html;

            // Fire celebrations for milestones
            Celebrations.checkMilestones(sd);

            // Bind buttons
            var newSessionBtn = document.getElementById("summary-new-session");
            if (newSessionBtn) {
                newSessionBtn.addEventListener("click", function() {
                    StudyUI.returnToHome();
                });
            }
            var homeBtn = document.getElementById("summary-home");
            if (homeBtn) {
                homeBtn.addEventListener("click", function() {
                    StudyUI.returnToHome();
                });
            }
        });
    },

    /**
     * Return to the study tab home screen.
     */
    returnToHome: function() {
        if (StudyUI._activeAreaId === "revise-question-area") {
            // Returning from a revision session -- go back to topic tree
            var reviseHome = document.getElementById("revise-home");
            var reviseArea = document.getElementById("revise-question-area");
            if (reviseHome) reviseHome.style.display = "block";
            if (reviseArea) {
                reviseArea.style.display = "none";
                reviseArea.innerHTML = "";
            }
            StudyUI._activeAreaId = "question-area"; // reset
            ReviseUI.refresh();
        } else {
            // Normal study session -- go back to study start screen
            var startScreen = document.querySelector(".study-start-screen");
            var questionArea = document.getElementById(StudyUI._activeAreaId);
            if (startScreen) startScreen.style.display = "block";
            if (questionArea) {
                questionArea.style.display = "none";
                questionArea.innerHTML = "";
            }
        }
        UI.refreshStudyTab();
        window.scrollTo(0, 0);
    },

    // ---- UTILITY METHODS ----

    /**
     * Create a summary stat card HTML string.
     * @private
     */
    _summaryCard: function(label, value) {
        return '<div class="summary-card">' +
            '<div class="summary-value">' + value + '</div>' +
            '<div class="summary-label">' + label + '</div>' +
            '</div>';
    },

    /**
     * Get the diagram path for an image reference.
     * @private
     */
    _getDiagramPath: function(imgRef, pool) {
        var filename = "";
        if (typeof imgRef === "string") {
            filename = imgRef;
        } else if (imgRef && imgRef.filename) {
            filename = imgRef.filename;
        } else {
            return "";
        }
        if (pool === "practice") {
            return PRACTICE_DIAGRAM_PATH + filename;
        }
        return DIAGRAM_PATH + filename;
    },

    /**
     * Escape HTML special characters.
     * @private
     */
    _escapeHtml: function(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
};


// ============================================================================
// REVISE UI MODULE (Phase S4)
// Topic tree display, revision session launching, dashboard integration.
// ============================================================================
var ReviseUI = {

    /** Currently selected topic and subtopic names */
    _selectedTopic: null,
    _selectedSubtopic: null,

    /** Cached mastery map for the current refresh */
    _masteryMap: null,
    _unlockedSet: null,

    /**
     * Refresh the cascade selector on the Revise tab.
     * Builds the topic column from TAXONOMY_DATA, filtered to unlocked PTs only.
     */
    refresh: function() {
        var container = document.getElementById("topic-tree-container");
        var emptyHint = document.getElementById("revise-empty-hint");
        if (!container) return;

        var taxonomy = QuestionEngine.taxonomyData;
        if (!taxonomy || Object.keys(taxonomy).length === 0) {
            container.style.display = "none";
            if (emptyHint) emptyHint.style.display = "block";
            return;
        }

        // Build unlocked set
        var unlockedSet = {};
        QuestionEngine.unlockedProblemTypes.forEach(function(pt) {
            unlockedSet[pt] = true;
        });
        ReviseUI._unlockedSet = unlockedSet;

        // Check if any topics have unlocked PTs
        var hasAny = false;
        Object.keys(taxonomy).forEach(function(topic) {
            var pts = ReviseUI._getProblemTypesForNode(taxonomy, topic, null, null);
            if (pts.some(function(pt) { return unlockedSet[pt]; })) hasAny = true;
        });

        if (!hasAny) {
            container.style.display = "none";
            if (emptyHint) emptyHint.style.display = "block";
            return;
        }

        container.style.display = "block";
        if (emptyHint) emptyHint.style.display = "none";

        // Load mastery, then build topic column
        DB.getAll(STORE_MASTERY).then(function(records) {
            var masteryMap = {};
            records.forEach(function(r) { masteryMap[r.problemType] = r; });
            ReviseUI._masteryMap = masteryMap;

            ReviseUI._renderTopics();
            ReviseUI._clearSubtopics();
            ReviseUI._clearProblemTypes();
            ReviseUI._hideActionBar();
            ReviseUI._selectedTopic = null;
            ReviseUI._selectedSubtopic = null;
        });
    },

    /**
     * Render the topics column.
     * @private
     */
    _renderTopics: function() {
        var list = document.getElementById("cascade-topic-list");
        if (!list) return;

        var taxonomy = QuestionEngine.taxonomyData;
        var unlockedSet = ReviseUI._unlockedSet;
        var masteryMap = ReviseUI._masteryMap;
        var html = "";

        Object.keys(taxonomy).forEach(function(topic) {
            var topicPTs = ReviseUI._getProblemTypesForNode(taxonomy, topic, null, null);
            var topicUnlocked = topicPTs.filter(function(pt) { return unlockedSet[pt]; });
            if (topicUnlocked.length === 0) return;

            var stats = ReviseUI._computeNodeStats(topicUnlocked, masteryMap);

            html += '<div class="cascade-item" data-topic="' + ReviseUI._esc(topic) + '">';
            html += '<span class="cascade-indicator ' + stats.cssClass.replace("tt-ind-", "cascade-ind-") + '"></span>';
            html += '<span class="cascade-label">' + ReviseUI._esc(topic) + '</span>';
            html += '<span class="cascade-meta">' + topicUnlocked.length + '</span>';
            html += '</div>';
        });

        list.innerHTML = html;

        // Bind click events
        list.querySelectorAll(".cascade-item").forEach(function(item) {
            item.addEventListener("click", function() {
                var topic = item.getAttribute("data-topic");
                ReviseUI._selectTopic(topic, list);
            });
        });
    },

    /**
     * Handle topic selection — populate subtopics column.
     * @private
     */
    _selectTopic: function(topic, topicList) {
        // Highlight selection
        topicList.querySelectorAll(".cascade-item").forEach(function(el) {
            el.classList.toggle("cascade-selected",
                el.getAttribute("data-topic") === topic);
        });

        ReviseUI._selectedTopic = topic;
        ReviseUI._selectedSubtopic = null;

        var taxonomy = QuestionEngine.taxonomyData;
        var unlockedSet = ReviseUI._unlockedSet;
        var masteryMap = ReviseUI._masteryMap;

        var subList = document.getElementById("cascade-subtopic-list");
        if (!subList) return;

        var subtopics = taxonomy[topic];
        if (!subtopics) {
            subList.innerHTML = '<div class="cascade-empty">No subtopics</div>';
            ReviseUI._clearProblemTypes();
            return;
        }

        var html = "";
        Object.keys(subtopics).forEach(function(subtopic) {
            var subPTs = ReviseUI._getProblemTypesForNode(taxonomy, topic, subtopic, null);
            var subUnlocked = subPTs.filter(function(pt) { return unlockedSet[pt]; });
            if (subUnlocked.length === 0) return;

            var stats = ReviseUI._computeNodeStats(subUnlocked, masteryMap);

            html += '<div class="cascade-item" data-subtopic="' + ReviseUI._esc(subtopic) + '">';
            html += '<span class="cascade-indicator ' + stats.cssClass.replace("tt-ind-", "cascade-ind-") + '"></span>';
            html += '<span class="cascade-label">' + ReviseUI._esc(subtopic) + '</span>';
            html += '<span class="cascade-meta">' + subUnlocked.length + '</span>';
            html += '</div>';
        });

        subList.innerHTML = html || '<div class="cascade-empty">No subtopics available</div>';

        // Bind click events
        subList.querySelectorAll(".cascade-item").forEach(function(item) {
            item.addEventListener("click", function() {
                var subtopic = item.getAttribute("data-subtopic");
                ReviseUI._selectSubtopic(subtopic, subList);
            });
        });

        // Clear PT column and show action bar for topic-level revision
        ReviseUI._clearProblemTypes();
        ReviseUI._showActionBar(topic, "topic");
    },

    /**
     * Handle subtopic selection — populate problem types column.
     * @private
     */
    _selectSubtopic: function(subtopic, subList) {
        // Highlight selection
        subList.querySelectorAll(".cascade-item").forEach(function(el) {
            el.classList.toggle("cascade-selected",
                el.getAttribute("data-subtopic") === subtopic);
        });

        ReviseUI._selectedSubtopic = subtopic;

        var taxonomy = QuestionEngine.taxonomyData;
        var topic = ReviseUI._selectedTopic;
        var unlockedSet = ReviseUI._unlockedSet;
        var masteryMap = ReviseUI._masteryMap;

        var ptList = document.getElementById("cascade-pt-list");
        if (!ptList || !topic) return;

        var concepts = taxonomy[topic] && taxonomy[topic][subtopic];
        if (!concepts) {
            ptList.innerHTML = '<div class="cascade-empty">No problem types</div>';
            return;
        }

        var html = "";
        Object.keys(concepts).forEach(function(concept) {
            var pts = concepts[concept] || [];
            var unlockedPTs = pts.filter(function(pt) { return unlockedSet[pt]; });
            if (unlockedPTs.length === 0) return;

            // Concept header
            html += '<div class="cascade-pt-concept">' + ReviseUI._esc(concept) + '</div>';

            unlockedPTs.forEach(function(pt) {
                var rec = masteryMap[pt];
                var status = rec ? rec.status : "new";
                var statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
                var accuracy = "";
                if (rec && rec.totalAttempts > 0) {
                    accuracy = Math.round((rec.correctAttempts / rec.totalAttempts) * 100) + "%";
                }

                html += '<div class="cascade-pt-item cascade-pt-' + status + '">';
                html += '<span class="cascade-indicator cascade-ind-' +
                    (status === "mastered" ? "mastered" :
                     status === "struggling" ? "struggling" :
                     status === "improving" ? "partial" : "new") + '"></span>';
                html += '<span class="cascade-label">' + ReviseUI._esc(pt) + '</span>';
                html += '<span class="cascade-pt-status">' +
                    (accuracy ? accuracy : statusLabel) + '</span>';
                html += '</div>';
            });
        });

        ptList.innerHTML = html || '<div class="cascade-empty">No problem types available</div>';

        // Update action bar for subtopic-level revision
        ReviseUI._showActionBar(subtopic, "subtopic");
    },

    /**
     * Clear the subtopics column.
     * @private
     */
    _clearSubtopics: function() {
        var list = document.getElementById("cascade-subtopic-list");
        if (list) list.innerHTML = '<div class="cascade-empty">Select a topic</div>';
    },

    /**
     * Clear the problem types column.
     * @private
     */
    _clearProblemTypes: function() {
        var list = document.getElementById("cascade-pt-list");
        if (list) list.innerHTML = '<div class="cascade-empty">Select a subtopic</div>';
    },

    /**
     * Show the revise action bar.
     * @private
     */
    _showActionBar: function(filterName, level) {
        var bar = document.getElementById("revise-action-bar");
        var label = document.getElementById("revise-action-label");
        var btn = document.getElementById("revise-start-btn");
        if (!bar) return;

        if (label) label.textContent = "Revising: " + filterName;
        bar.style.display = "flex";

        // Rebind click (remove old listener by cloning)
        if (btn) {
            var newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener("click", function() {
                ReviseUI.startRevision(filterName, level);
            });
        }
    },

    /**
     * Hide the action bar.
     * @private
     */
    _hideActionBar: function() {
        var bar = document.getElementById("revise-action-bar");
        if (bar) bar.style.display = "none";
    },

    /**
     * Start a revision session for a given filter.
     *
    /**
     * Start a revision session for a given filter.
     * Reads mode/section/answer-method config from the revise config panel.
     *
     * @param {string} filter - topic, subtopic, or concept name
     * @param {string} level - "topic", "subtopic", or "concept"
     */
    startRevision: function(filter, level) {
        // Read config from the revise panel
        var modeGroup = document.getElementById("revise-mode-group");
        var sectionGroup = document.getElementById("revise-section-group");
        var answerGroup = document.getElementById("revise-answer-group");
        var isExamMode = false;
        var sectionFilter = "mix";
        var answerMethod = "paper";

        if (answerGroup) {
            var activeAnswer = answerGroup.querySelector('[aria-pressed="true"]');
            if (activeAnswer) answerMethod = activeAnswer.getAttribute("data-value");
        }
        if (modeGroup) {
            var activeMode = modeGroup.querySelector('[aria-pressed="true"]');
            if (activeMode) isExamMode = (activeMode.getAttribute("data-value") === "exam");
        }
        if (sectionGroup) {
            var activeSec = sectionGroup.querySelector('[aria-pressed="true"]');
            if (activeSec) sectionFilter = activeSec.getAttribute("data-value");
        }

        // For exam mode, read question count
        var examCount = 8;
        if (isExamMode) {
            var countInput = document.getElementById("revise-exam-count-input");
            if (countInput) examCount = parseInt(countInput.value, 10) || 8;
        }

        // Switch the question area to the revise tab
        StudyUI._activeAreaId = "revise-question-area";

        var reviseHome = document.getElementById("revise-home");
        var reviseArea = document.getElementById("revise-question-area");
        if (reviseHome) reviseHome.style.display = "none";
        if (reviseArea) reviseArea.style.display = "block";

        var goal = isExamMode ? examCount : 10;

        SessionEngine.start("revision", filter, {
            goal: goal,
            sectionFilter: sectionFilter,
            wrongListOnly: false,
            examMode: isExamMode,
            answerMethod: answerMethod
        }).then(function() {
            // Check if there are any questions available
            var totalAvailable = SessionEngine.wrongList.length +
                SessionEngine.freshList.length +
                SessionEngine.improvingList.length +
                SessionEngine.reviewList.length +
                SessionEngine.confidenceList.length;

            if (totalAvailable === 0) {
                reviseArea.innerHTML =
                    '<div class="revise-no-questions">' +
                    '<h3>No questions available</h3>' +
                    '<p>There are no questions available for "' +
                    StudyUI._escapeHtml(filter) +
                    '" with the current section filter. You may have mastered everything in this area!</p>' +
                    '<button class="btn btn-primary" id="revise-back-btn">' +
                    'Back to Topics</button>' +
                    '</div>';
                document.getElementById("revise-back-btn").addEventListener("click", function() {
                    StudyUI.returnToHome();
                });
                return;
            }

            if (isExamMode) {
                // Pre-build the exam queue with variety across problem types
                ReviseUI._buildExamQueue(filter, sectionFilter, examCount).then(function(queue) {
                    if (queue.length === 0) {
                        reviseArea.innerHTML =
                            '<div class="revise-no-questions">' +
                            '<h3>No questions available</h3>' +
                            '<p>Could not find enough questions for an exam on "' +
                            StudyUI._escapeHtml(filter) + '".</p>' +
                            '<button class="btn btn-primary" id="revise-back-btn">' +
                            'Back to Topics</button>' +
                            '</div>';
                        document.getElementById("revise-back-btn").addEventListener("click", function() {
                            StudyUI.returnToHome();
                        });
                        return;
                    }
                    SessionEngine.examQueue = queue;
                    SessionEngine.examQueueIndex = 0;
                    SessionEngine.examAnswers = [];
                    SessionEngine.sessionGoal = queue.length;
                    StudyUI._nextReminderMinutes = 30;
                    StudyUI._loadExamQuestion();
                });
            } else {
                StudyUI._nextReminderMinutes = 30;
                StudyUI.loadNextQuestion();
            }
        });
    },

    /**
     * Build an exam queue with maximum variety across problem types.
     * Uses round-robin across available PTs for the given topic.
     *
     * @param {string} topicFilter
     * @param {string} sectionFilter
     * @param {number} count - desired number of questions
     * @returns {Promise<Array>} array of {filename, questionData, targetProblemType}
     * @private
     */
    _buildExamQueue: function(topicFilter, sectionFilter, count) {
        // Collect all problem types matching the topic filter
        var matchingPTs = {};
        var keys = Object.keys(QuestionEngine.allQuestions);
        keys.forEach(function(k) {
            var q = QuestionEngine.allQuestions[k];
            if (!q.parts) return;
            q.parts.forEach(function(part) {
                if (part.topic === topicFilter ||
                    part.subtopic === topicFilter ||
                    part.conceptCategory === topicFilter ||
                    part.problemType === topicFilter) {
                    if (part.problemType) {
                        matchingPTs[part.problemType] = true;
                    }
                }
            });
        });

        // Filter to only unlocked PTs
        var unlockedSet = {};
        QuestionEngine.unlockedProblemTypes.forEach(function(pt) {
            unlockedSet[pt] = true;
        });

        var ptList = Object.keys(matchingPTs).filter(function(pt) {
            return unlockedSet[pt];
        });

        if (ptList.length === 0) return Promise.resolve([]);

        // Shuffle the PT list for variety
        for (var i = ptList.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = ptList[i];
            ptList[i] = ptList[j];
            ptList[j] = temp;
        }

        // Round-robin: distribute count across PTs
        var ptSlots = []; // array of problem types to fill, in order
        var idx = 0;
        for (var s = 0; s < count; s++) {
            ptSlots.push(ptList[idx % ptList.length]);
            idx++;
        }

        // Set section filter for question selection
        QuestionSelector.sectionFilter = sectionFilter;
        var served = {};

        // Select one question per slot sequentially
        var queue = [];
        var selectNext = function(slotIdx) {
            if (slotIdx >= ptSlots.length) return Promise.resolve(queue);

            var pt = ptSlots[slotIdx];

            // Find candidates not yet served
            var candidates = QuestionSelector._findCandidates(pt);
            candidates = candidates.filter(function(c) {
                return !served[c.filename];
            });

            if (candidates.length === 0) {
                // Skip this slot -- no more questions for this PT
                return selectNext(slotIdx + 1);
            }

            return MasteryEngine.getRetryCount(pt).then(function(retryCount) {
                return DB.getAll(STORE_HISTORY).then(function(histories) {
                    var histMap = {};
                    histories.forEach(function(h) { histMap[h.filename] = h; });

                    var now = new Date();
                    var scored = [];
                    candidates.forEach(function(c) {
                        if (served[c.filename]) return;
                        var score = 0;
                        var hist = histMap[c.filename];
                        if (!hist || hist.timesServed === 0) {
                            score += 10;
                        } else {
                            var lastDate = new Date(hist.lastServed + "T00:00:00");
                            var daysSince = Math.floor((now - lastDate) / 86400000);
                            if (daysSince > 14) score += 5;
                            else if (daysSince > 7) score += 2;
                            else if (daysSince < 3) score -= 5;
                            if (daysSince < 1) score -= 20;
                        }
                        scored.push({ filename: c.filename, questionData: c.questionData, score: score });
                    });

                    if (scored.length === 0) return selectNext(slotIdx + 1);

                    scored.sort(function(a, b) { return b.score - a.score; });
                    var topScore = scored[0].score;
                    var topCandidates = scored.filter(function(s) { return s.score === topScore; });
                    var pick = topCandidates[Math.floor(Math.random() * topCandidates.length)];

                    served[pick.filename] = true;
                    queue.push({
                        filename: pick.filename,
                        questionData: pick.questionData,
                        targetProblemType: pt
                    });

                    return selectNext(slotIdx + 1);
                });
            });
        };

        return selectNext(0);
    },

    /**
     * Navigate to the Revise tab and start revision for a specific filter.
     * Called from Dashboard "Revise this" buttons.
     *
     * @param {string} filter - topic, subtopic, concept, or problem type name
     */
    navigateAndRevise: function(filter) {
        // Determine the level by looking up the filter in taxonomy
        var level = ReviseUI._detectLevel(filter);
        UI.showTab("revise");

        // Short delay to let the tab render, then start
        setTimeout(function() {
            ReviseUI.startRevision(filter, level);
        }, 100);
    },

    /**
     * Navigate to the Revise tab and start revision for weak areas only.
     * Called from Dashboard "Revise All Weak Areas" button.
     */
    reviseAllWeak: function() {
        StudyUI._activeAreaId = "revise-question-area";
        UI.showTab("revise");

        var reviseHome = document.getElementById("revise-home");
        var reviseArea = document.getElementById("revise-question-area");
        if (reviseHome) reviseHome.style.display = "none";
        if (reviseArea) reviseArea.style.display = "block";

        SessionEngine.start("revision", null, {
            goal: 10,
            sectionFilter: "mix",
            wrongListOnly: true
        }).then(function() {
            if (SessionEngine.wrongList.length === 0) {
                reviseArea.innerHTML =
                    '<div class="revise-no-questions">' +
                    '<h3>No weak areas</h3>' +
                    '<p>Great news! You don\'t have any problem types marked as struggling.</p>' +
                    '<button class="btn btn-primary" id="revise-back-btn">' +
                    'Back to Topics</button>' +
                    '</div>';
                document.getElementById("revise-back-btn").addEventListener("click", function() {
                    StudyUI.returnToHome();
                });
                return;
            }
            StudyUI._nextReminderMinutes = 30;
            StudyUI.loadNextQuestion();
        });
    },

    // ---- PRIVATE HELPERS ----

    /**
     * Get all problem types under a given taxonomy node.
     * @private
     */
    _getProblemTypesForNode: function(taxonomy, topic, subtopic, concept) {
        var pts = [];
        if (concept && topic && subtopic) {
            return (taxonomy[topic] && taxonomy[topic][subtopic] &&
                taxonomy[topic][subtopic][concept]) || [];
        }
        if (subtopic && topic) {
            var concepts = taxonomy[topic] && taxonomy[topic][subtopic];
            if (concepts) {
                Object.keys(concepts).forEach(function(c) {
                    pts = pts.concat(concepts[c] || []);
                });
            }
            return pts;
        }
        if (topic) {
            var subtopics = taxonomy[topic];
            if (subtopics) {
                Object.keys(subtopics).forEach(function(s) {
                    Object.keys(subtopics[s]).forEach(function(c) {
                        pts = pts.concat(subtopics[s][c] || []);
                    });
                });
            }
            return pts;
        }
        return pts;
    },

    /**
     * Compute stats (mastery counts, accuracy) for a list of problem types.
     * @private
     */
    _computeNodeStats: function(problemTypes, masteryMap) {
        var mastered = 0;
        var struggling = 0;
        var improving = 0;
        var newCount = 0;
        var total = problemTypes.length;
        var correct = 0;
        var attempts = 0;

        problemTypes.forEach(function(pt) {
            var rec = masteryMap[pt];
            if (!rec) {
                newCount++;
            } else {
                switch (rec.status) {
                    case "mastered": mastered++; break;
                    case "struggling": struggling++; break;
                    case "improving": improving++; break;
                    default: newCount++;
                }
                correct += (rec.correctAttempts || 0);
                attempts += (rec.totalAttempts || 0);
            }
        });

        var cssClass;
        if (mastered === total && total > 0) {
            cssClass = "tt-ind-mastered";
        } else if (struggling > 0) {
            cssClass = "tt-ind-struggling";
        } else if (improving > 0 || mastered > 0) {
            cssClass = "tt-ind-partial";
        } else {
            cssClass = "tt-ind-new";
        }

        var parts = [];
        if (mastered > 0) parts.push(mastered + " mastered");
        if (improving > 0) parts.push(improving + " improving");
        if (struggling > 0) parts.push(struggling + " struggling");
        if (newCount > 0) parts.push(newCount + " new");
        var summary = parts.join(", ");
        if (attempts > 0) {
            summary += " " + SYMBOLS.BULLET + " " +
                Math.round((correct / attempts) * 100) + "% accuracy";
        }

        return {
            mastered: mastered,
            struggling: struggling,
            improving: improving,
            newCount: newCount,
            total: total,
            cssClass: cssClass,
            summary: summary
        };
    },

    /**
     * Detect whether a filter string is a topic, subtopic, or concept.
     * @private
     */
    _detectLevel: function(filter) {
        var taxonomy = QuestionEngine.taxonomyData;
        if (!taxonomy) return "concept";
        if (taxonomy[filter]) return "topic";
        var topics = Object.keys(taxonomy);
        for (var i = 0; i < topics.length; i++) {
            if (taxonomy[topics[i]][filter]) return "subtopic";
            var subs = Object.keys(taxonomy[topics[i]]);
            for (var j = 0; j < subs.length; j++) {
                if (taxonomy[topics[i]][subs[j]][filter]) return "concept";
            }
        }
        // Might be a problem type -- treat as concept-level
        return "concept";
    },

    /**
     * Return a status icon character for a mastery status.
     * @private
     */
    _statusIcon: function(status) {
        switch (status) {
            case "mastered": return SYMBOLS.CHECK;
            case "struggling": return SYMBOLS.CROSS;
            case "improving": return SYMBOLS.ARROW_UP;
            case "review": return SYMBOLS.REVIEW;
            default: return SYMBOLS.BULLET;
        }
    },

    /**
     * HTML-escape utility.
     * @private
     */
    _esc: function(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
};


// ============================================================================
// DASHBOARD UI
// All panels from Section 12 of the spec. Computes data from IndexedDB
// stores and renders into #tab-dashboard on tab activation.
// ============================================================================
var DashboardUI = {
    /** Cached data to avoid re-fetching within a single refresh. */
    _cache: null,

    /**
     * Master refresh -- called when the dashboard tab is activated.
     * Gathers all data, then renders each panel.
     */
    refresh: function() {
        var self = this;
        return Promise.all([
            DB.getAll(STORE_MASTERY),
            DB.getAll(STORE_SESSIONS),
            DB.getAll(STORE_HISTORY),
            DB.getAll(STORE_CONFIDENCE),
            MasteryEngine.getExamReadiness(),
            MasteryEngine.getStreak(),
            MasteryEngine.getSummary()
        ]).then(function(results) {
            self._cache = {
                mastery: results[0],
                sessions: results[1],
                history: results[2],
                confidence: results[3],
                readiness: results[4],
                streak: results[5],
                summary: results[6]
            };
            // Build lookup maps
            self._cache.masteryMap = {};
            self._cache.mastery.forEach(function(r) {
                self._cache.masteryMap[r.problemType] = r;
            });
            self._cache.historyMap = {};
            self._cache.history.forEach(function(h) {
                self._cache.historyMap[h.filename] = h;
            });

            self.renderReadiness();
            self.renderStreak();
            self.renderOverviewStats();
            self.renderHeatMap();
            self.renderWeakAreas();
            self.renderErrorPatterns();
            self.renderProblemTypeBreakdown();
            self.renderSessionChart();
            self.renderTimeline();
            self._bindControls();
        }).catch(function(err) {
            console.error("Dashboard refresh failed:", err);
        });
    },

    // ---- 12.1 EXAM READINESS SCORE ----
    renderReadiness: function() {
        var data = this._cache.readiness;
        var score = data.score;
        var valueEl = document.getElementById("dash-readiness-value");
        var arcEl = document.getElementById("dash-readiness-arc");
        if (!valueEl || !arcEl) return;

        valueEl.textContent = score + "%";
        var circumference = 326.73;
        var offset = circumference - (score / 100) * circumference;
        arcEl.style.strokeDashoffset = offset;

        var color;
        if (score >= 70) color = "var(--color-success)";
        else if (score >= 40) color = "var(--color-warning)";
        else color = "var(--color-danger)";
        arcEl.style.stroke = color;

        // Topic breakdown
        var bk = document.getElementById("dash-readiness-breakdown");
        if (bk && data.topicScores) {
            var topics = Object.keys(data.topicScores);
            if (topics.length > 0) {
                var html = "";
                topics.sort(function(a, b) {
                    return data.topicScores[a] - data.topicScores[b];
                });
                topics.forEach(function(t) {
                    var ts = data.topicScores[t];
                    var cls = ts >= 70 ? "dash-topic-good" :
                              ts >= 40 ? "dash-topic-ok" : "dash-topic-weak";
                    html += '<div class="dash-topic-row ' + cls + '">' +
                        '<span class="dash-topic-name">' + t + '</span>' +
                        '<span class="dash-topic-score">' + ts + '%</span>' +
                        '</div>';
                });
                bk.innerHTML = html;
            } else {
                bk.innerHTML = "";
            }
        }
    },

    // ---- 12.8 SESSION STREAK ----
    renderStreak: function() {
        var streak = this._cache.streak;
        var numEl = document.getElementById("dash-streak-number");
        var unitEl = document.getElementById("dash-streak-unit");
        if (numEl) numEl.textContent = streak;
        if (unitEl) unitEl.textContent = streak === 1 ? "day" : "days";

        // Render last 14 days as calendar dots
        var calEl = document.getElementById("dash-streak-calendar");
        if (!calEl) return;

        var sessions = this._cache.sessions;
        var dateSet = {};
        sessions.forEach(function(s) {
            if (s.date) dateSet[s.date] = true;
        });

        var html = "";
        var today = new Date();
        for (var i = 13; i >= 0; i--) {
            var d = new Date(today);
            d.setDate(d.getDate() - i);
            var dStr = d.toISOString().split("T")[0];
            var active = dateSet[dStr] ? " active" : "";
            var isToday = i === 0 ? " today" : "";
            var dayLabel = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()];
            html += '<div class="dash-cal-day' + active + isToday + '" title="' +
                dStr + '">' +
                '<span class="dash-cal-label">' + dayLabel + '</span>' +
                '<span class="dash-cal-dot"></span>' +
                '</div>';
        }
        calEl.innerHTML = html;
    },

    // ---- OVERVIEW STATS + MASTERY BAR ----
    renderOverviewStats: function() {
        var sessions = this._cache.sessions;
        var summary = this._cache.summary;

        // Total sessions
        var totalSessions = sessions.length;
        var el = document.getElementById("dash-total-sessions");
        if (el) el.textContent = totalSessions;

        // Total questions attempted
        var totalQ = 0;
        sessions.forEach(function(s) {
            totalQ += (s.questionsAttempted || s.totalQuestions || 0);
        });
        el = document.getElementById("dash-total-questions");
        if (el) el.textContent = totalQ;

        // Total study time
        var totalSec = 0;
        sessions.forEach(function(s) {
            totalSec += (s.durationSeconds || 0);
        });
        el = document.getElementById("dash-total-time");
        if (el) {
            if (totalSec < 3600) {
                el.textContent = Math.round(totalSec / 60) + "m";
            } else {
                var hrs = Math.floor(totalSec / 3600);
                var mins = Math.round((totalSec % 3600) / 60);
                el.textContent = hrs + "h " + mins + "m";
            }
        }

        // Overall accuracy
        var totalCorrect = 0;
        var totalAttempts = 0;
        this._cache.mastery.forEach(function(r) {
            totalCorrect += (r.correctAttempts || 0);
            totalAttempts += (r.totalAttempts || 0);
        });
        el = document.getElementById("dash-overall-accuracy");
        if (el) {
            el.textContent = totalAttempts > 0 ?
                Math.round((totalCorrect / totalAttempts) * 100) + "%" : "--%";
        }

        // Mastery bar (stacked horizontal bar)
        var barEl = document.getElementById("dash-mastery-bar");
        var legEl = document.getElementById("dash-mastery-legend");
        if (!barEl) return;

        var total = summary.total || 1;
        var segments = [
            { label: "Mastered", count: summary.mastered, cls: "dash-seg-mastered" },
            { label: "Improving", count: summary.improving, cls: "dash-seg-improving" },
            { label: "Struggling", count: summary.struggling, cls: "dash-seg-struggling" },
            { label: "Review", count: summary.review, cls: "dash-seg-review" },
            { label: "New", count: summary.newCount, cls: "dash-seg-new" }
        ];

        var barHtml = "";
        var legHtml = "";
        segments.forEach(function(seg) {
            var pct = Math.round((seg.count / total) * 100);
            if (pct > 0) {
                barHtml += '<div class="dash-seg ' + seg.cls +
                    '" style="width:' + pct + '%" title="' +
                    seg.label + ': ' + seg.count + '"></div>';
            }
            legHtml += '<span class="dash-leg-item">' +
                '<span class="dash-leg-dot ' + seg.cls + '"></span>' +
                seg.label + ' ' + seg.count +
                '</span>';
        });
        barEl.innerHTML = barHtml;
        if (legEl) legEl.innerHTML = legHtml;
    },

    // ---- 12.2 TOPIC HEAT MAP ----
    renderHeatMap: function() {
        var headEl = document.getElementById("dash-heatmap-head");
        var bodyEl = document.getElementById("dash-heatmap-body");
        var emptyEl = document.getElementById("dash-heatmap-empty");
        if (!headEl || !bodyEl) return;

        // Build topic -> conceptCategory -> [problemTypes] map
        var topicMap = {};
        var allConcepts = {};
        var keys = Object.keys(QuestionEngine.allQuestions);
        keys.forEach(function(filename) {
            var q = QuestionEngine.allQuestions[filename];
            if (!q.parts) return;
            q.parts.forEach(function(p) {
                if (!p.topic || !p.conceptCategory || !p.problemType) return;
                if (!topicMap[p.topic]) topicMap[p.topic] = {};
                if (!topicMap[p.topic][p.conceptCategory]) {
                    topicMap[p.topic][p.conceptCategory] = [];
                }
                if (topicMap[p.topic][p.conceptCategory].indexOf(p.problemType) === -1) {
                    topicMap[p.topic][p.conceptCategory].push(p.problemType);
                }
                allConcepts[p.conceptCategory] = true;
            });
        });

        var topics = Object.keys(topicMap).sort();
        if (topics.length === 0) {
            headEl.innerHTML = "";
            bodyEl.innerHTML = "";
            if (emptyEl) emptyEl.style.display = "block";
            return;
        }
        if (emptyEl) emptyEl.style.display = "none";

        // Gather unique concepts per topic (for columns)
        // Use a union of all concept categories as columns
        var conceptList = Object.keys(allConcepts).sort();

        // Header
        var hHtml = '<tr><th class="dash-hm-corner">Topic</th>';
        conceptList.forEach(function(c) {
            hHtml += '<th class="dash-hm-col-head" title="' +
                DashboardUI._esc(c) + '">' +
                DashboardUI._truncate(c, 18) + '</th>';
        });
        hHtml += '</tr>';
        headEl.innerHTML = hHtml;

        // Body rows
        var unlockedSet = {};
        QuestionEngine.unlockedProblemTypes.forEach(function(pt) {
            unlockedSet[pt] = true;
        });

        var bHtml = "";
        var masteryMap = this._cache.masteryMap;

        topics.forEach(function(topic) {
            bHtml += '<tr><td class="dash-hm-row-head" title="' +
                DashboardUI._esc(topic) + '">' +
                DashboardUI._truncate(topic, 30) + '</td>';

            conceptList.forEach(function(concept) {
                var pts = (topicMap[topic] && topicMap[topic][concept]) || [];
                // Filter to unlocked only
                var unlocked = pts.filter(function(pt) { return unlockedSet[pt]; });

                if (unlocked.length === 0) {
                    // Not applicable or not unlocked
                    if (pts.length > 0) {
                        bHtml += '<td class="dash-hm-cell dash-hm-locked" ' +
                            'title="Not yet unlocked"></td>';
                    } else {
                        bHtml += '<td class="dash-hm-cell dash-hm-na"></td>';
                    }
                    return;
                }

                // Compute accuracy for these problem types
                var correct = 0;
                var total = 0;
                var anyMastered = false;
                unlocked.forEach(function(pt) {
                    var rec = masteryMap[pt];
                    if (rec) {
                        correct += (rec.correctAttempts || 0);
                        total += (rec.totalAttempts || 0);
                        if (rec.status === "mastered") anyMastered = true;
                    }
                });

                var cls, label;
                if (total === 0) {
                    cls = "dash-hm-none";
                    label = "Not attempted";
                } else {
                    var acc = Math.round((correct / total) * 100);
                    if (acc > 80 || anyMastered) {
                        cls = "dash-hm-good";
                    } else if (acc >= 40) {
                        cls = "dash-hm-ok";
                    } else {
                        cls = "dash-hm-weak";
                    }
                    label = acc + "% (" + correct + "/" + total + ")";
                }

                bHtml += '<td class="dash-hm-cell ' + cls + '" ' +
                    'title="' + DashboardUI._esc(concept) + ': ' + label + '" ' +
                    'data-topic="' + DashboardUI._esc(topic) + '" ' +
                    'data-concept="' + DashboardUI._esc(concept) + '">' +
                    (total > 0 ? '<span class="dash-hm-val">' +
                    Math.round((correct / total) * 100) + '</span>' : '') +
                    '</td>';
            });
            bHtml += '</tr>';
        });
        bodyEl.innerHTML = bHtml;

        // Attach click handlers for heat map cells
        bodyEl.querySelectorAll(".dash-hm-cell[data-topic]").forEach(function(cell) {
            cell.style.cursor = "pointer";
            cell.addEventListener("click", function() {
                // Navigate to revision for this topic/concept
                var topic = cell.getAttribute("data-topic");
                var concept = cell.getAttribute("data-concept");
                console.log("Dashboard: Revise " + topic + " / " + concept);
                ReviseUI.navigateAndRevise(concept);
            });
        });
    },

    // ---- 12.4 WEAK AREAS ----
    renderWeakAreas: function() {
        var listEl = document.getElementById("dash-weak-list");
        var emptyEl = document.getElementById("dash-weak-empty");
        var btnEl = document.getElementById("dash-revise-all-weak");
        if (!listEl) return;

        // Find problem types with worst accuracy (min 2 attempts)
        var weak = [];
        this._cache.mastery.forEach(function(r) {
            if (r.totalAttempts >= 2 && r.status !== "mastered") {
                var acc = r.totalAttempts > 0 ?
                    Math.round((r.correctAttempts / r.totalAttempts) * 100) : 0;
                weak.push({
                    problemType: r.problemType,
                    accuracy: acc,
                    attempts: r.totalAttempts,
                    status: r.status
                });
            }
        });

        weak.sort(function(a, b) { return a.accuracy - b.accuracy; });
        weak = weak.slice(0, 5);

        if (weak.length === 0) {
            listEl.innerHTML = "";
            if (emptyEl) emptyEl.style.display = "block";
            if (btnEl) btnEl.style.display = "none";
            return;
        }
        if (emptyEl) emptyEl.style.display = "none";
        if (btnEl) btnEl.style.display = "block";

        // Find topic for each problem type
        var ptTopic = DashboardUI._getProblemTypeTopics();

        var html = "";
        weak.forEach(function(w) {
            var topic = ptTopic[w.problemType] || "";
            html += '<div class="dash-weak-item">' +
                '<div class="dash-weak-info">' +
                '<span class="dash-weak-name">' +
                DashboardUI._esc(w.problemType) + '</span>' +
                '<span class="dash-weak-meta">' +
                DashboardUI._esc(topic) + ' ' + SYMBOLS.BULLET +
                ' ' + w.accuracy + '% accuracy' +
                '</span>' +
                '</div>' +
                '<div class="dash-weak-bar-track">' +
                '<div class="dash-weak-bar-fill" style="width:' + w.accuracy + '%"></div>' +
                '</div>' +
                '<button class="btn btn-sm dash-revise-btn" ' +
                'data-pt="' + DashboardUI._esc(w.problemType) + '">' +
                'Revise</button>' +
                '</div>';
        });
        listEl.innerHTML = html;

        // Bind revise buttons
        listEl.querySelectorAll(".dash-revise-btn").forEach(function(btn) {
            btn.addEventListener("click", function() {
                var pt = btn.getAttribute("data-pt");
                console.log("Dashboard: Revise " + pt);
                ReviseUI.navigateAndRevise(pt);
            });
        });

        if (btnEl) {
            btnEl.onclick = function() {
                ReviseUI.reviseAllWeak();
            };
        }
    },

    // ---- 12.7 ERROR PATTERN ANALYSIS ----
    renderErrorPatterns: function() {
        var emptyEl = document.getElementById("dash-error-empty");
        var barsEl = document.getElementById("dash-error-bars");
        var detailEl = document.getElementById("dash-error-detail");

        // Collect all error lines from mastery wrongHistory
        var setup = 0;
        var execution = 0;
        var interpretation = 0;
        var totalErrors = 0;
        var ptErrors = {}; // per problem type error phase counts

        this._cache.mastery.forEach(function(r) {
            if (!r.wrongHistory) return;
            r.wrongHistory.forEach(function(w) {
                if (!w.errorAtLine) return;
                // Need to find the question to get totalLines
                var q = QuestionEngine.allQuestions[w.questionFilename];
                if (!q || !q.parts) return;

                var part = null;
                q.parts.forEach(function(p) {
                    if (p.partLabel === w.partLabel) part = p;
                });
                if (!part || !part.originalSolution) return;

                var totalLines = part.originalSolution.filter(function(l) {
                    return l.shown;
                }).length;
                if (totalLines === 0) return;

                var pct = w.errorAtLine / totalLines;
                totalErrors++;

                if (!ptErrors[r.problemType]) {
                    ptErrors[r.problemType] = { setup: 0, execution: 0, interpretation: 0 };
                }

                if (pct <= 0.25) {
                    setup++;
                    ptErrors[r.problemType].setup++;
                } else if (pct <= 0.75) {
                    execution++;
                    ptErrors[r.problemType].execution++;
                } else {
                    interpretation++;
                    ptErrors[r.problemType].interpretation++;
                }
            });
        });

        if (totalErrors === 0) {
            if (emptyEl) emptyEl.style.display = "block";
            if (barsEl) barsEl.style.display = "none";
            if (detailEl) detailEl.innerHTML = "";
            return;
        }

        if (emptyEl) emptyEl.style.display = "none";
        if (barsEl) barsEl.style.display = "block";

        var sPct = Math.round((setup / totalErrors) * 100);
        var ePct = Math.round((execution / totalErrors) * 100);
        var iPct = Math.round((interpretation / totalErrors) * 100);

        var sBar = document.getElementById("dash-error-setup");
        var eBar = document.getElementById("dash-error-exec");
        var iBar = document.getElementById("dash-error-interp");
        if (sBar) sBar.style.width = sPct + "%";
        if (eBar) eBar.style.width = ePct + "%";
        if (iBar) iBar.style.width = iPct + "%";

        var sTxt = document.getElementById("dash-error-setup-pct");
        var eTxt = document.getElementById("dash-error-exec-pct");
        var iTxt = document.getElementById("dash-error-interp-pct");
        if (sTxt) sTxt.textContent = sPct + "%";
        if (eTxt) eTxt.textContent = ePct + "%";
        if (iTxt) iTxt.textContent = iPct + "%";

        // Per-problem-type error details
        if (detailEl) {
            var pts = Object.keys(ptErrors);
            if (pts.length > 0) {
                var html = '<div class="dash-error-pt-list">';
                pts.sort(function(a, b) {
                    var ta = ptErrors[a].setup + ptErrors[a].execution +
                             ptErrors[a].interpretation;
                    var tb = ptErrors[b].setup + ptErrors[b].execution +
                             ptErrors[b].interpretation;
                    return tb - ta;
                });
                pts.slice(0, 5).forEach(function(pt) {
                    var e = ptErrors[pt];
                    var eTotal = e.setup + e.execution + e.interpretation;
                    var dominant = "execution";
                    if (e.setup >= e.execution && e.setup >= e.interpretation) {
                        dominant = "setup";
                    } else if (e.interpretation >= e.execution) {
                        dominant = "interpretation";
                    }
                    html += '<div class="dash-error-pt-row">' +
                        '<span class="dash-error-pt-name">' +
                        DashboardUI._esc(pt) + '</span>' +
                        '<span class="dash-error-pt-phase">' +
                        'Most errors in <strong>' + dominant + '</strong> (' +
                        eTotal + ' total)</span></div>';
                });
                html += '</div>';
                detailEl.innerHTML = html;
            }
        }
    },

    // ---- 12.3 PROBLEM TYPE BREAKDOWN ----
    /** Current filter and sort state */
    _ptFilter: "all",
    _ptSort: "status",

    renderProblemTypeBreakdown: function() {
        var tbody = document.getElementById("dash-pt-tbody");
        var emptyEl = document.getElementById("dash-pt-empty");
        if (!tbody) return;

        var unlocked = QuestionEngine.unlockedProblemTypes;
        if (unlocked.length === 0) {
            tbody.innerHTML = "";
            if (emptyEl) emptyEl.style.display = "block";
            return;
        }
        if (emptyEl) emptyEl.style.display = "none";

        var masteryMap = this._cache.masteryMap;
        var ptTopics = DashboardUI._getProblemTypeTopics();
        var filter = this._ptFilter;
        var sortBy = this._ptSort;

        // Build rows data
        var rows = [];
        unlocked.forEach(function(pt) {
            var rec = masteryMap[pt];
            var status = rec ? rec.status : "new";
            var totalAtt = rec ? rec.totalAttempts : 0;
            var correctAtt = rec ? rec.correctAttempts : 0;
            var acc = totalAtt > 0 ? Math.round((correctAtt / totalAtt) * 100) : -1;
            var lastDate = rec ? (rec.lastAttemptDate || "") : "";
            var topic = ptTopics[pt] || "";

            // Mastery progress (count unique correct dates since last wrong)
            var masteryCount = 0;
            if (rec && rec.masteryProgress) {
                var lastWrongIdx = -1;
                for (var i = rec.masteryProgress.length - 1; i >= 0; i--) {
                    if (!rec.masteryProgress[i].correct) {
                        lastWrongIdx = i;
                        break;
                    }
                }
                var dates = {};
                for (var j = lastWrongIdx + 1; j < rec.masteryProgress.length; j++) {
                    if (rec.masteryProgress[j].correct) {
                        dates[rec.masteryProgress[j].sessionDate] = true;
                    }
                }
                masteryCount = Math.min(Object.keys(dates).length, 3);
            }

            rows.push({
                pt: pt,
                status: status,
                accuracy: acc,
                total: totalAtt,
                correct: correctAtt,
                lastDate: lastDate,
                topic: topic,
                masteryCount: masteryCount
            });
        });

        // Filter
        if (filter !== "all") {
            rows = rows.filter(function(r) { return r.status === filter; });
        }

        // Sort
        var statusOrder = {
            struggling: 0, review: 1, improving: 2, "new": 3, mastered: 4
        };
        rows.sort(function(a, b) {
            switch (sortBy) {
                case "status":
                    return (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5);
                case "accuracy":
                    return (a.accuracy) - (b.accuracy);
                case "recent":
                    if (!a.lastDate && !b.lastDate) return 0;
                    if (!a.lastDate) return 1;
                    if (!b.lastDate) return -1;
                    return b.lastDate.localeCompare(a.lastDate);
                case "topic":
                    return a.topic.localeCompare(b.topic);
                case "name":
                    return a.pt.localeCompare(b.pt);
                default:
                    return 0;
            }
        });

        var statusIcons = {
            mastered: SYMBOLS.CHECK,
            improving: SYMBOLS.ARROW_UP,
            struggling: SYMBOLS.CROSS,
            review: SYMBOLS.REVIEW,
            "new": SYMBOLS.BULLET
        };
        var statusLabels = {
            mastered: "Mastered",
            improving: "Improving",
            struggling: "Struggling",
            review: "Review",
            "new": "New"
        };

        var html = "";
        rows.forEach(function(r) {
            var icon = statusIcons[r.status] || SYMBOLS.BULLET;
            var accStr = r.accuracy >= 0 ? r.accuracy + "%" : "\u2014";
            var dateStr = r.lastDate || "\u2014";
            var masteryDots = "";
            for (var d = 0; d < 3; d++) {
                masteryDots += '<span class="dash-mastery-dot' +
                    (d < r.masteryCount ? ' filled' : '') + '"></span>';
            }

            html += '<tr class="dash-pt-row dash-pt-' + r.status + '">' +
                '<td class="dash-pt-status" title="' + statusLabels[r.status] + '">' +
                '<span class="dash-status-icon dash-si-' + r.status + '">' +
                icon + '</span></td>' +
                '<td class="dash-pt-name">' + DashboardUI._esc(r.pt) + '</td>' +
                '<td class="dash-pt-topic">' + DashboardUI._esc(r.topic) + '</td>' +
                '<td class="dash-pt-acc">' +
                (r.total > 0 ? accStr +
                    ' <span class="dash-pt-detail">(' + r.correct + '/' +
                    r.total + ')</span>' : '\u2014') +
                '</td>' +
                '<td class="dash-pt-mastery">' + masteryDots +
                ' <span class="dash-pt-detail">' +
                r.masteryCount + '/3</span></td>' +
                '<td class="dash-pt-last">' + dateStr + '</td>' +
                '</tr>';
        });
        tbody.innerHTML = html;
    },

    // ---- 12.5 SESSION HISTORY CHART (HTML Canvas) ----
    renderSessionChart: function() {
        var canvas = document.getElementById("dash-session-chart");
        var emptyEl = document.getElementById("dash-chart-empty");
        if (!canvas) return;

        var sessions = this._cache.sessions.slice();
        if (sessions.length < 2) {
            canvas.style.display = "none";
            if (emptyEl) emptyEl.style.display = "block";
            return;
        }
        canvas.style.display = "block";
        if (emptyEl) emptyEl.style.display = "none";

        // Sort by date
        sessions.sort(function(a, b) {
            return (a.date || "").localeCompare(b.date || "");
        });

        // Accuracy per session
        var points = [];
        sessions.forEach(function(s) {
            var att = s.questionsAttempted || s.totalQuestions || 0;
            var corr = s.correctAnswers || s.totalCorrect || 0;
            if (att > 0) {
                points.push({
                    date: s.date || "",
                    accuracy: Math.round((corr / att) * 100)
                });
            }
        });

        if (points.length < 2) {
            canvas.style.display = "none";
            if (emptyEl) emptyEl.style.display = "block";
            return;
        }

        var ctx = canvas.getContext("2d");
        var W = canvas.width = canvas.parentElement.clientWidth || 400;
        var H = canvas.height = 200;
        var pad = { top: 20, right: 20, bottom: 30, left: 40 };
        var plotW = W - pad.left - pad.right;
        var plotH = H - pad.top - pad.bottom;

        ctx.clearRect(0, 0, W, H);

        // Get computed colours from CSS variables
        var styles = getComputedStyle(document.documentElement);
        var textCol = styles.getPropertyValue("--text-muted").trim() || "#888";
        var lineCol = styles.getPropertyValue("--accent-primary").trim() || "#4a90d9";
        var gridCol = styles.getPropertyValue("--border-color").trim() || "#e0e0e0";

        // Grid lines
        ctx.strokeStyle = gridCol;
        ctx.lineWidth = 0.5;
        for (var g = 0; g <= 4; g++) {
            var gy = pad.top + (plotH * g) / 4;
            ctx.beginPath();
            ctx.moveTo(pad.left, gy);
            ctx.lineTo(pad.left + plotW, gy);
            ctx.stroke();
        }

        // Y-axis labels
        ctx.fillStyle = textCol;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "right";
        for (var y = 0; y <= 4; y++) {
            var val = 100 - y * 25;
            var yy = pad.top + (plotH * y) / 4;
            ctx.fillText(val + "%", pad.left - 6, yy + 4);
        }

        // Plot line
        var n = points.length;
        ctx.strokeStyle = lineCol;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
            var px = pad.left + (i / (n - 1)) * plotW;
            var py = pad.top + plotH - (points[i].accuracy / 100) * plotH;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Dots
        for (var j = 0; j < n; j++) {
            var dx = pad.left + (j / (n - 1)) * plotW;
            var dy = pad.top + plotH - (points[j].accuracy / 100) * plotH;
            ctx.fillStyle = lineCol;
            ctx.beginPath();
            ctx.arc(dx, dy, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // X-axis labels (first, middle, last)
        ctx.fillStyle = textCol;
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        var labelIndices = [0, Math.floor(n / 2), n - 1];
        labelIndices.forEach(function(idx) {
            if (idx >= n) return;
            var lx = pad.left + (idx / (n - 1)) * plotW;
            var label = points[idx].date.slice(5); // MM-DD
            ctx.fillText(label, lx, H - 6);
        });
    },

    // ---- 12.6 SCHEDULE TIMELINE ----
    renderTimeline: function() {
        var el = document.getElementById("dash-timeline");
        var emptyEl = document.getElementById("dash-timeline-empty");
        if (!el) return;

        if (typeof TAUGHT_SCHEDULE === "undefined" || !TAUGHT_SCHEDULE.schedule ||
            TAUGHT_SCHEDULE.schedule.length === 0) {
            el.innerHTML = "";
            if (emptyEl) emptyEl.style.display = "block";
            return;
        }
        if (emptyEl) emptyEl.style.display = "none";

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var masteryMap = this._cache.masteryMap;

        var html = "";
        TAUGHT_SCHEDULE.schedule.forEach(function(entry) {
            var entryDate = new Date(entry.date + "T00:00:00");
            var isPast = entryDate <= today;
            var isCurrent = false;
            // Current = most recent past entry
            var pastCls = isPast ? "dash-tl-past" : "dash-tl-future";

            // Count mastered / total for this entry's problem types
            var mastered = 0;
            var total = (entry.problemTypes || []).length;
            (entry.problemTypes || []).forEach(function(pt) {
                var rec = masteryMap[pt];
                if (rec && rec.status === "mastered") mastered++;
            });

            var progressPct = total > 0 ? Math.round((mastered / total) * 100) : 0;

            html += '<div class="dash-tl-entry ' + pastCls + '">' +
                '<div class="dash-tl-marker"></div>' +
                '<div class="dash-tl-content">' +
                '<div class="dash-tl-date">' + entry.date + '</div>' +
                '<div class="dash-tl-label">' + DashboardUI._esc(entry.label) + '</div>';

            if (isPast && total > 0) {
                html += '<div class="dash-tl-progress">' +
                    '<div class="dash-tl-progress-bar">' +
                    '<div class="dash-tl-progress-fill" style="width:' +
                    progressPct + '%"></div></div>' +
                    '<span class="dash-tl-progress-text">' +
                    mastered + '/' + total + ' mastered</span></div>';
            } else if (!isPast) {
                html += '<div class="dash-tl-locked">' +
                    total + ' problem type' + (total !== 1 ? 's' : '') +
                    '</div>';
            }

            html += '</div></div>';
        });
        el.innerHTML = html;
    },

    // ---- CONTROL BINDINGS ----
    _controlsBound: false,
    _bindControls: function() {
        if (this._controlsBound) return;
        this._controlsBound = true;
        var self = this;

        // Filter buttons
        var filterBtns = document.querySelectorAll("#dash-pt-filters .dash-filter-btn");
        filterBtns.forEach(function(btn) {
            btn.addEventListener("click", function() {
                filterBtns.forEach(function(b) { b.classList.remove("active"); });
                btn.classList.add("active");
                self._ptFilter = btn.getAttribute("data-filter");
                self.renderProblemTypeBreakdown();
            });
        });

        // Sort select
        var sortSel = document.getElementById("dash-pt-sort-select");
        if (sortSel) {
            sortSel.addEventListener("change", function() {
                self._ptSort = sortSel.value;
                self.renderProblemTypeBreakdown();
            });
        }
    },

    // ---- UTILITIES ----
    _esc: function(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    _truncate: function(str, max) {
        if (!str || str.length <= max) return DashboardUI._esc(str);
        return DashboardUI._esc(str.substring(0, max - 1)) + "\u2026";
    },

    /** Build a map of problemType -> topic (first found). */
    _getProblemTypeTopics: function() {
        var ptTopics = {};
        var keys = Object.keys(QuestionEngine.allQuestions);
        keys.forEach(function(filename) {
            var q = QuestionEngine.allQuestions[filename];
            if (!q.parts) return;
            q.parts.forEach(function(p) {
                if (p.problemType && p.topic && !ptTopics[p.problemType]) {
                    ptTopics[p.problemType] = p.topic;
                }
            });
        });
        return ptTopics;
    }
};


// ============================================================================
// EXPORT / IMPORT MODULE (Phase S5)
// Progress reports, full backups, update imports.
// ============================================================================
var ExportImport = {

    /**
     * Export a progress report (subset of data useful for the teacher).
     * Includes: mastery records, session summaries, question history, confidence watch.
     */
    exportProgressReport: function() {
        Promise.all([
            DB.get(STORE_CONFIG, "main"),
            DB.getAll(STORE_MASTERY),
            DB.getAll(STORE_SESSIONS),
            DB.getAll(STORE_HISTORY),
            DB.getAll(STORE_CONFIDENCE)
        ]).then(function(results) {
            var config = results[0] || {};
            var mastery = results[1];
            var sessions = results[2];
            var history = results[3];
            var confidence = results[4];

            // Compute summary statistics
            var totalSessions = sessions.length;
            var totalQuestions = 0;
            var totalCorrect = 0;
            var totalAttempted = 0;
            var totalMinutes = 0;
            var guidedTotal = 0;

            sessions.forEach(function(s) {
                totalQuestions += (s.questionsAttempted || 0);
                totalCorrect += (s.partsCorrect || 0);
                totalAttempted += (s.partsAttempted || 0);
                totalMinutes += (s.durationMinutes || 0);
                guidedTotal += (s.guidedSolutionAccesses || 0);
            });

            var masteredCount = 0;
            var strugglingCount = 0;
            mastery.forEach(function(m) {
                if (m.status === "mastered") masteredCount++;
                if (m.status === "struggling") strugglingCount++;
            });

            var report = {
                reportType: "progressReport",
                generatedBy: "WACE Student Trainer v" + APP_VERSION,
                generatedAt: new Date().toISOString(),
                studentName: config.studentName || "Unknown",
                summary: {
                    totalSessions: totalSessions,
                    totalQuestionsAttempted: totalQuestions,
                    totalPartsAttempted: totalAttempted,
                    totalPartsCorrect: totalCorrect,
                    overallAccuracy: totalAttempted > 0 ?
                        Math.round((totalCorrect / totalAttempted) * 1000) / 10 : 0,
                    totalStudyMinutes: totalMinutes,
                    unlockedProblemTypes: QuestionEngine.unlockedProblemTypes.length,
                    masteredProblemTypes: masteredCount,
                    strugglingProblemTypes: strugglingCount,
                    guidedSolutionAccesses: guidedTotal,
                    confidenceWatchCount: confidence.length
                },
                mastery: mastery,
                sessions: sessions.map(function(s) {
                    // Strip any large data, keep summaries
                    return {
                        date: s.date,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        durationMinutes: s.durationMinutes,
                        mode: s.mode,
                        topicFilter: s.topicFilter,
                        questionsAttempted: s.questionsAttempted,
                        partsAttempted: s.partsAttempted,
                        partsCorrect: s.partsCorrect,
                        accuracyPercent: s.accuracyPercent,
                        newMasteries: s.newMasteries,
                        guidedSolutionAccesses: s.guidedSolutionAccesses,
                        topicBreakdown: s.topicBreakdown
                    };
                }),
                questionHistory: history,
                confidenceWatch: confidence
            };

            var filename = "Progress_" + (config.studentName || "Student").replace(/\s+/g, "_") +
                "_" + new Date().toISOString().split("T")[0] + ".json";
            ExportImport._downloadJSON(report, filename);
            ExportImport._showNotice("Progress report exported as " + filename);
        }).catch(function(err) {
            console.error("Export progress failed:", err);
            alert("Error exporting progress report: " + (err.message || err));
        });
    },

    /**
     * Export a full backup of all IndexedDB stores.
     */
    exportFullBackup: function() {
        var storeNames = OBJECT_STORES.map(function(s) { return s.name; });

        var promises = storeNames.map(function(name) {
            return DB.getAll(name).then(function(data) {
                return { store: name, data: data };
            });
        });

        Promise.all(promises).then(function(results) {
            var backup = {
                backupType: "fullBackup",
                generatedBy: "WACE Student Trainer v" + APP_VERSION,
                generatedAt: new Date().toISOString(),
                stores: {}
            };
            results.forEach(function(r) {
                backup.stores[r.store] = r.data;
            });

            var config = backup.stores[STORE_CONFIG];
            var studentName = "Student";
            if (config) {
                config.forEach(function(c) {
                    if (c.id === "main" && c.studentName) {
                        studentName = c.studentName;
                    }
                });
            }

            var filename = "Backup_" + studentName.replace(/\s+/g, "_") +
                "_" + new Date().toISOString().split("T")[0] + ".json";
            ExportImport._downloadJSON(backup, filename);
            ExportImport._showNotice("Full backup exported as " + filename);
        }).catch(function(err) {
            console.error("Export backup failed:", err);
            alert("Error exporting backup: " + (err.message || err));
        });
    },

    /**
     * Import a full backup from a JSON file.
     *
     * @param {File} file
     */
    importBackup: function(file) {
        if (!confirm("Import a backup? This will REPLACE all your current progress data.\n\n" +
            "Make sure you export a backup of your current data first if you want to keep it.")) {
            return;
        }

        ExportImport._readFile(file).then(function(text) {
            var backup;
            try {
                backup = JSON.parse(text);
            } catch (e) {
                alert("Error: The file is not valid JSON.");
                return;
            }

            if (!backup.stores || backup.backupType !== "fullBackup") {
                alert("Error: This doesn't appear to be a valid backup file.");
                return;
            }

            var storeNames = Object.keys(backup.stores);
            var promises = [];

            storeNames.forEach(function(storeName) {
                var items = backup.stores[storeName];
                if (!Array.isArray(items)) return;

                // Clear the store first, then add all items
                var p = DB.clear(storeName).then(function() {
                    var putPromises = items.map(function(item) {
                        return DB.put(storeName, item);
                    });
                    return Promise.all(putPromises);
                });
                promises.push(p);
            });

            return Promise.all(promises).then(function() {
                ExportImport._showNotice("Backup restored successfully. Refreshing...");
                // Reload the app to pick up the restored data
                setTimeout(function() {
                    window.location.reload();
                }, 1500);
            });
        }).catch(function(err) {
            console.error("Import backup failed:", err);
            alert("Error importing backup: " + (err.message || err));
        });
    },

    /**
     * Import a teacher update file (new questions, schedule updates, diagrams).
     *
     * @param {File} file
     */
    importUpdate: function(file) {
        ExportImport._readFile(file).then(function(text) {
            var update;
            try {
                update = JSON.parse(text);
            } catch (e) {
                alert("Error: The file is not valid JSON.");
                return;
            }

            if (!update.updateId) {
                alert("Error: This doesn't appear to be a valid update file.\n" +
                    "Update files should have an 'updateId' field.");
                return;
            }

            // Check if already imported
            return DB.get(STORE_SCHEDULE_UPDATES, update.updateId).then(function(existing) {
                if (existing) {
                    alert("This update (" + update.updateId + ") has already been imported.");
                    return;
                }

                var importedCount = 0;
                var promises = [];

                // 1. Import new questions
                if (update.questions && typeof update.questions === "object") {
                    var qKeys = Object.keys(update.questions);
                    qKeys.forEach(function(filename) {
                        var qData = update.questions[filename];
                        var record = {
                            filename: filename,
                            questionData: qData,
                            importedFrom: update.updateId,
                            importedAt: new Date().toISOString()
                        };
                        promises.push(DB.put(STORE_IMPORTED, record));
                        // Also merge into the live question engine
                        QuestionEngine.allQuestions[filename] = qData;
                        importedCount++;
                    });
                }

                // 2. Store schedule update
                if (update.scheduleUpdate) {
                    var schedEntry = {
                        updateId: update.updateId,
                        date: update.scheduleUpdate.date || update.updateDate,
                        label: update.scheduleUpdate.label || update.description || "",
                        problemTypes: update.scheduleUpdate.problemTypes || [],
                        importedAt: new Date().toISOString()
                    };
                    promises.push(DB.put(STORE_SCHEDULE_UPDATES, schedEntry));
                }

                // 3. Decode and cache diagrams
                if (update.newDiagrams && typeof update.newDiagrams === "object") {
                    var diagKeys = Object.keys(update.newDiagrams);
                    diagKeys.forEach(function(diagFilename) {
                        var dataUrl = update.newDiagrams[diagFilename];
                        promises.push(
                            DB.put(STORE_DIAGRAMS, {
                                filename: diagFilename,
                                dataUrl: dataUrl,
                                importedFrom: update.updateId
                            })
                        );
                    });
                }

                // 4. Record import in config
                promises.push(
                    DB.get(STORE_CONFIG, "main").then(function(config) {
                        if (!config) return;
                        if (!config.updatesImported) config.updatesImported = [];
                        config.updatesImported.push({
                            updateId: update.updateId,
                            date: update.updateDate || new Date().toISOString().split("T")[0],
                            description: update.description || "",
                            questionsAdded: importedCount,
                            importedAt: new Date().toISOString()
                        });
                        return DB.put(STORE_CONFIG, config);
                    })
                );

                return Promise.all(promises).then(function() {
                    // Recompute unlocked problem types with new schedule
                    return DB.getAll(STORE_SCHEDULE_UPDATES);
                }).then(function(scheduleUpdates) {
                    QuestionEngine.allProblemTypes = QuestionEngine._extractAllProblemTypes();
                    QuestionEngine.computeUnlocked(scheduleUpdates, false);

                    var msg = "Update imported: " + update.updateId;
                    if (importedCount > 0) {
                        msg += "\n" + importedCount + " new question" +
                            (importedCount !== 1 ? "s" : "") + " added.";
                    }
                    if (update.scheduleUpdate && update.scheduleUpdate.problemTypes) {
                        msg += "\n" + update.scheduleUpdate.problemTypes.length +
                            " problem type" +
                            (update.scheduleUpdate.problemTypes.length !== 1 ? "s" : "") +
                            " unlocked.";
                    }
                    ExportImport._showNotice(msg);
                    // Refresh current tab
                    UI.showTab(UI.currentTab);
                });
            });
        }).catch(function(err) {
            console.error("Import update failed:", err);
            alert("Error importing update: " + (err.message || err));
        });
    },

    // ---- PRIVATE HELPERS ----

    /**
     * Read a File object as text.
     * @private
     */
    _readFile: function(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) { resolve(e.target.result); };
            reader.onerror = function() { reject(new Error("Failed to read file")); };
            reader.readAsText(file);
        });
    },

    /**
     * Download a JSON object as a file.
     * @private
     */
    _downloadJSON: function(data, filename) {
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    },

    /**
     * Show a temporary notice banner at the top of the app.
     * @private
     */
    _showNotice: function(message) {
        var existing = document.querySelector(".export-import-notice");
        if (existing) existing.remove();

        var banner = document.createElement("div");
        banner.className = "export-import-notice";
        banner.innerHTML = SYMBOLS.CHECK + " " + message.replace(/\n/g, "<br>") +
            '<button onclick="this.parentNode.remove()" ' +
            'style="margin-left:12px;cursor:pointer;border:none;' +
            'background:none;font-size:1.1em;">&times;</button>';

        var topBar = document.getElementById("top-bar");
        if (topBar && topBar.parentNode) {
            topBar.parentNode.insertBefore(banner, topBar.nextSibling);
        }

        setTimeout(function() {
            if (banner.parentNode) banner.remove();
        }, 8000);
    }
};


// ============================================================================
// CELEBRATIONS MODULE (Phase S7)
// Confetti-like particle animation for milestone achievements.
// ============================================================================
var Celebrations = {

    /**
     * Launch a confetti burst from the center-top of the viewport.
     * @param {Object} [opts] - Optional overrides.
     * @param {number} [opts.count=60] - Number of particles.
     * @param {number} [opts.duration=2500] - Animation duration in ms.
     */
    confetti: function(opts) {
        opts = opts || {};
        var count = opts.count || 60;
        var duration = opts.duration || 2500;
        var colors = ["#16a34a", "#2563eb", "#d97706", "#dc2626",
                      "#7c3aed", "#06b6d4", "#f59e0b", "#ec4899"];

        var container = document.createElement("div");
        container.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;" +
            "pointer-events:none;z-index:9999;overflow:hidden;";
        document.body.appendChild(container);

        for (var i = 0; i < count; i++) {
            var particle = document.createElement("div");
            var color = colors[Math.floor(Math.random() * colors.length)];
            var size = 4 + Math.random() * 6;
            var isCircle = Math.random() > 0.5;

            particle.style.cssText = "position:absolute;top:40%;left:50%;" +
                "width:" + size + "px;height:" + (isCircle ? size : size * 0.4) + "px;" +
                "background:" + color + ";" +
                "border-radius:" + (isCircle ? "50%" : "1px") + ";" +
                "opacity:1;";

            container.appendChild(particle);
            Celebrations._animateParticle(particle, duration);
        }

        setTimeout(function() {
            if (container.parentNode) container.parentNode.removeChild(container);
        }, duration + 200);
    },

    /**
     * Animate a single confetti particle.
     * @private
     */
    _animateParticle: function(el, duration) {
        var angle = (Math.random() * 360) * (Math.PI / 180);
        var velocity = 200 + Math.random() * 400;
        var vx = Math.cos(angle) * velocity;
        var vy = Math.sin(angle) * velocity - 300; // upward bias
        var rotation = Math.random() * 720 - 360;
        var gravity = 600;

        var startTime = null;
        function frame(timestamp) {
            if (!startTime) startTime = timestamp;
            var t = (timestamp - startTime) / 1000; // seconds
            var progress = (timestamp - startTime) / duration;

            if (progress >= 1) {
                el.style.opacity = "0";
                return;
            }

            var x = vx * t;
            var y = vy * t + 0.5 * gravity * t * t;
            var rot = rotation * t;
            var opacity = progress > 0.7 ? 1 - ((progress - 0.7) / 0.3) : 1;

            el.style.transform = "translate(" + x + "px, " + y + "px) rotate(" + rot + "deg)";
            el.style.opacity = String(opacity);

            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    },

    /**
     * Show a milestone banner at the top of the screen.
     * @param {string} icon - Emoji/symbol for the banner.
     * @param {string} title - Main title text.
     * @param {string} subtitle - Description text.
     */
    showMilestoneBanner: function(icon, title, subtitle) {
        var existing = document.querySelector(".milestone-banner");
        if (existing) existing.remove();

        var banner = document.createElement("div");
        banner.className = "milestone-banner";
        banner.innerHTML = '<span class="milestone-icon">' + icon + '</span>' +
            '<div class="milestone-text"><strong>' + title + '</strong>' +
            (subtitle ? '<br><span>' + subtitle + '</span>' : '') +
            '</div>' +
            '<button onclick="this.parentNode.remove()" ' +
            'style="background:none;border:none;color:inherit;font-size:1.2em;' +
            'cursor:pointer;padding:4px;margin-left:auto;">&times;</button>';

        var topBar = document.getElementById("top-bar");
        if (topBar && topBar.parentNode) {
            topBar.parentNode.insertBefore(banner, topBar.nextSibling);
        }
        // Auto-remove after 6 seconds
        setTimeout(function() {
            if (banner.parentNode) {
                banner.style.opacity = "0";
                setTimeout(function() { banner.remove(); }, 400);
            }
        }, 6000);
    },

    /**
     * Check for and fire milestone celebrations after a session ends.
     * @param {Object} sessionData - The session summary data.
     */
    checkMilestones: function(sessionData) {
        if (!sessionData) return;

        // New masteries this session -> confetti
        if (sessionData.newMasteries && sessionData.newMasteries.length > 0) {
            Celebrations.confetti({ count: 40 + sessionData.newMasteries.length * 10 });
        }

        // Check for first-ever mastery
        DB.getAll(STORE_MASTERY).then(function(records) {
            var masteredCount = 0;
            records.forEach(function(r) {
                if (r.status === "mastered") masteredCount++;
            });

            // First mastery ever (exactly the count of new masteries = total mastered)
            if (sessionData.newMasteries && sessionData.newMasteries.length > 0 &&
                masteredCount === sessionData.newMasteries.length) {
                Celebrations.showMilestoneBanner(
                    SYMBOLS.TROPHY,
                    "First Mastery!",
                    "You've mastered your first problem type. Keep going!"
                );
            }

            // 10, 25, 50 milestones
            var milestones = [10, 25, 50, 75, 100];
            for (var i = 0; i < milestones.length; i++) {
                var m = milestones[i];
                if (masteredCount >= m &&
                    masteredCount - (sessionData.newMasteries ? sessionData.newMasteries.length : 0) < m) {
                    Celebrations.confetti({ count: 80 });
                    Celebrations.showMilestoneBanner(
                        SYMBOLS.STAR,
                        m + " Problem Types Mastered!",
                        "Outstanding achievement."
                    );
                    break;
                }
            }
        });

        // Check streak milestones
        DB.getAll(STORE_SESSIONS).then(function(sessions) {
            var streak = Celebrations._computeStreak(sessions);
            var streakMilestones = [3, 7, 14, 30];
            for (var i = 0; i < streakMilestones.length; i++) {
                if (streak === streakMilestones[i]) {
                    Celebrations.showMilestoneBanner(
                        SYMBOLS.FIRE,
                        streak + "-Day Streak!",
                        "Consistency is the key to success."
                    );
                    break;
                }
            }
        });
    },

    /**
     * Compute current study streak (consecutive days).
     * @private
     */
    _computeStreak: function(sessions) {
        if (!sessions || sessions.length === 0) return 0;

        var dates = {};
        sessions.forEach(function(s) {
            var d = (s.startTime || s.date || "").substring(0, 10);
            if (d) dates[d] = true;
        });

        var sortedDates = Object.keys(dates).sort().reverse();
        if (sortedDates.length === 0) return 0;

        var today = new Date();
        var todayStr = today.toISOString().substring(0, 10);
        var yesterdayStr = new Date(today.getTime() - 86400000).toISOString().substring(0, 10);

        // Streak must include today or yesterday
        if (sortedDates[0] !== todayStr && sortedDates[0] !== yesterdayStr) return 0;

        var streak = 1;
        for (var i = 1; i < sortedDates.length; i++) {
            var prev = new Date(sortedDates[i - 1] + "T00:00:00");
            var curr = new Date(sortedDates[i] + "T00:00:00");
            var diff = (prev - curr) / 86400000;
            if (diff === 1) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }
};


// ============================================================================
// KEYBOARD SHORTCUTS (Phase S7)
// Global keyboard handler for power-user navigation.
// ============================================================================
var KeyboardShortcuts = {

    /**
     * Initialise keyboard event listener.
     */
    init: function() {
        document.addEventListener("keydown", function(e) {
            // Ignore if user is typing in an input/textarea
            var tag = (e.target.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select") return;

            // Ignore if a modal is open
            var settingsModal = document.getElementById("settings-modal");
            if (settingsModal && settingsModal.style.display !== "none" &&
                settingsModal.style.display !== "") return;

            KeyboardShortcuts._handleKey(e);
        });
    },

    /**
     * Process a keydown event.
     * @private
     */
    _handleKey: function(e) {
        var key = e.key;

        // ---- TAB NAVIGATION (1-4 when not in a session) ----
        var questionArea = document.getElementById("question-area");
        var inSession = questionArea && questionArea.style.display !== "none" &&
            questionArea.innerHTML !== "";
        var reviseArea = document.getElementById("revise-question-area");
        var inRevision = reviseArea && reviseArea.style.display !== "none" &&
            reviseArea.innerHTML !== "";

        if (!inSession && !inRevision) {
            switch (key) {
                case "1": UI.showTab("study"); e.preventDefault(); return;
                case "2": UI.showTab("revise"); e.preventDefault(); return;
                case "3": UI.showTab("print"); e.preventDefault(); return;
                case "4": UI.showTab("dashboard"); e.preventDefault(); return;
            }
        }

        // ---- IN-SESSION SHORTCUTS ----
        if (inSession || inRevision) {
            // Enter or Space -> click the most prominent available action
            if (key === "Enter" || key === " ") {
                // Priority: Next Question btn > Show Solution btn > Start Session btn
                var nextBtn = document.getElementById("next-question-btn");
                if (nextBtn && nextBtn.offsetParent !== null) {
                    nextBtn.click();
                    e.preventDefault();
                    return;
                }
            }

            // 'S' -> Show solution
            if (key === "s" || key === "S") {
                var showSolBtn = document.getElementById("show-solution-btn");
                if (showSolBtn && showSolBtn.offsetParent !== null) {
                    showSolBtn.click();
                    e.preventDefault();
                    return;
                }
            }

            // 'G' -> Show guided walkthrough
            if (key === "g" || key === "G") {
                var guidedBtn = document.getElementById("show-guided-btn");
                if (guidedBtn && guidedBtn.offsetParent !== null) {
                    guidedBtn.click();
                    e.preventDefault();
                    return;
                }
            }

            // 'N' -> Next question
            if (key === "n" || key === "N") {
                var nBtn = document.getElementById("next-question-btn");
                if (nBtn && nBtn.offsetParent !== null) {
                    nBtn.click();
                    e.preventDefault();
                    return;
                }
            }

            // 'R' -> Another like this (retry)
            if (key === "r" || key === "R") {
                var retryBtn = document.getElementById("another-like-this-btn");
                if (retryBtn && retryBtn.offsetParent !== null) {
                    retryBtn.click();
                    e.preventDefault();
                    return;
                }
            }

            // Escape -> End session (with confirmation)
            if (key === "Escape") {
                var endBtn = document.getElementById("end-session-btn") ||
                    document.getElementById("end-session-btn-2");
                if (endBtn && endBtn.offsetParent !== null) {
                    endBtn.click();
                    e.preventDefault();
                    return;
                }
            }
        }

        // 'D' -> toggle dark mode anywhere
        if ((key === "d" || key === "D") && e.altKey) {
            var isDark = document.body.classList.contains("dark-theme");
            var newTheme = isDark ? "light" : "dark";
            UI.applyTheme(newTheme);
            UI.savePreference("theme", newTheme);
            var themeSelect = document.getElementById("pref-theme");
            if (themeSelect) themeSelect.value = newTheme;
            e.preventDefault();
            return;
        }

        // '?' -> show shortcuts help
        if (key === "?") {
            KeyboardShortcuts.showHelp();
            e.preventDefault();
        }
    },

    /**
     * Show a keyboard shortcuts help overlay.
     */
    showHelp: function() {
        var existing = document.getElementById("shortcuts-overlay");
        if (existing) { existing.remove(); return; }

        var overlay = document.createElement("div");
        overlay.id = "shortcuts-overlay";
        overlay.className = "shortcuts-overlay";
        overlay.innerHTML =
            '<div class="shortcuts-card">' +
            '<div class="shortcuts-header">' +
            '<h3>Keyboard Shortcuts</h3>' +
            '<button onclick="document.getElementById(\'shortcuts-overlay\').remove()" ' +
            'style="background:none;border:none;font-size:1.3em;cursor:pointer;color:var(--text-primary);">&times;</button>' +
            '</div>' +
            '<div class="shortcuts-grid">' +
            '<div class="sc-section"><strong>Navigation</strong>' +
            '<div class="sc-row"><kbd>1</kbd><span>Study tab</span></div>' +
            '<div class="sc-row"><kbd>2</kbd><span>Revise tab</span></div>' +
            '<div class="sc-row"><kbd>3</kbd><span>Print tab</span></div>' +
            '<div class="sc-row"><kbd>4</kbd><span>Dashboard tab</span></div>' +
            '<div class="sc-row"><kbd>Alt+D</kbd><span>Toggle dark mode</span></div>' +
            '</div>' +
            '<div class="sc-section"><strong>During Questions</strong>' +
            '<div class="sc-row"><kbd>S</kbd><span>Show solution</span></div>' +
            '<div class="sc-row"><kbd>G</kbd><span>Show guided walkthrough</span></div>' +
            '<div class="sc-row"><kbd>N</kbd> / <kbd>Enter</kbd><span>Next question</span></div>' +
            '<div class="sc-row"><kbd>R</kbd><span>Another like this</span></div>' +
            '<div class="sc-row"><kbd>Esc</kbd><span>End session</span></div>' +
            '</div>' +
            '</div>' +
            '<p style="text-align:center;color:var(--text-muted);font-size:0.8rem;margin-top:12px;">Press <kbd>?</kbd> to toggle this panel</p>' +
            '</div>';

        overlay.addEventListener("click", function(e) {
            if (e.target === overlay) overlay.remove();
        });

        document.body.appendChild(overlay);
    }
};


// ============================================================================
// PRINT PRACTICE MODULE (Phase S6)
// Generates printable question sets as HTML documents in a new window.
// ============================================================================
var PrintUI = {

    /**
     * Initialise print tab event listeners.
     */
    init: function() {
        // Topic mode toggles
        var topicToggles = document.querySelectorAll(".print-topic-mode");
        topicToggles.forEach(function(btn) {
            btn.addEventListener("click", function() {
                topicToggles.forEach(function(b) { b.setAttribute("aria-pressed", "false"); });
                btn.setAttribute("aria-pressed", "true");
                var topicList = document.getElementById("print-topic-list");
                if (topicList) {
                    topicList.style.display = btn.getAttribute("data-value") === "select" ? "block" : "none";
                }
                PrintUI.updateHint();
            });
        });

        // Difficulty toggles
        PrintUI._initToggleGroup(".print-diff-toggle");
        // Section toggles
        PrintUI._initToggleGroup(".print-sec-toggle");

        // Count slider
        var countInput = document.getElementById("print-count-input");
        var countDisplay = document.getElementById("print-count-display");
        if (countInput && countDisplay) {
            countInput.addEventListener("input", function() {
                countDisplay.textContent = countInput.value;
            });
        }

        // Generate button
        var genBtn = document.getElementById("print-generate-btn");
        if (genBtn) {
            genBtn.addEventListener("click", function() {
                PrintUI.generate();
            });
        }
    },

    /**
     * Refresh the print tab (build topic checklist, update hint).
     */
    refresh: function() {
        PrintUI._buildTopicChecklist();
        PrintUI.updateHint();
    },

    /**
     * Update the "X questions available" hint text.
     */
    updateHint: function() {
        var hint = document.getElementById("print-available-hint");
        if (!hint) return;
        var candidates = PrintUI._getCandidates();
        hint.textContent = candidates.length + " question" +
            (candidates.length !== 1 ? "s" : "") + " available with current filters";
    },

    /**
     * Generate a printable HTML document.
     */
    generate: function() {
        var candidates = PrintUI._getCandidates();
        var count = parseInt(document.getElementById("print-count-input").value, 10) || 5;

        if (candidates.length === 0) {
            alert("No questions match your current filters. Try broadening your selection.");
            return;
        }

        // Select questions (prioritise less recently attempted, then random)
        var selected = PrintUI._selectQuestions(candidates, count);

        // Read options
        var incSolutions = document.getElementById("print-inc-solutions").checked;
        var incGuided = document.getElementById("print-inc-guided").checked;
        var incMarking = document.getElementById("print-inc-marking").checked;

        // Build the HTML document
        var html = PrintUI._buildPrintHTML(selected, {
            solutions: incSolutions,
            guided: incGuided,
            marking: incMarking
        });

        // Open in a new window for printing
        var win = window.open("", "_blank");
        if (!win) {
            alert("Pop-up blocked. Please allow pop-ups for this page and try again.");
            return;
        }
        win.document.write(html);
        win.document.close();
    },

    // ---- PRIVATE HELPERS ----

    /**
     * Build the topic checklist from TAXONOMY_DATA.
     * @private
     */
    _buildTopicChecklist: function() {
        var container = document.getElementById("print-topic-list");
        if (!container) return;

        var taxonomy = QuestionEngine.taxonomyData || {};
        var topics = Object.keys(taxonomy);
        if (topics.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No topic data available.</p>';
            return;
        }

        var html = "";
        topics.forEach(function(topic) {
            html += '<label class="print-check-row">' +
                '<input type="checkbox" class="print-topic-cb" value="' +
                PrintUI._esc(topic) + '" checked>' +
                '<span>' + PrintUI._esc(topic) + '</span></label>';
        });
        container.innerHTML = html;

        // Bind change events
        container.querySelectorAll(".print-topic-cb").forEach(function(cb) {
            cb.addEventListener("change", function() {
                PrintUI.updateHint();
            });
        });
    },

    /**
     * Get the list of candidate questions matching current filters.
     * @private
     * @returns {Array<{filename: string, questionData: Object}>}
     */
    _getCandidates: function() {
        var diffFilter = PrintUI._getToggleValue(".print-diff-toggle");
        var secFilter = PrintUI._getToggleValue(".print-sec-toggle");
        var topicMode = PrintUI._getToggleValue(".print-topic-mode");

        var selectedTopics = null;
        if (topicMode === "select") {
            selectedTopics = {};
            document.querySelectorAll(".print-topic-cb:checked").forEach(function(cb) {
                selectedTopics[cb.value] = true;
            });
        }

        var results = [];
        var keys = Object.keys(QuestionEngine.allQuestions);
        keys.forEach(function(filename) {
            var q = QuestionEngine.allQuestions[filename];
            if (!q.parts || q.parts.length === 0) return;

            // Must be available (all parts unlocked)
            if (!QuestionEngine.isQuestionAvailable(q)) return;

            // Difficulty filter
            if (diffFilter !== "any") {
                if (q.difficultyRating !== diffFilter) return;
            }

            // Section filter
            if (secFilter !== "mix") {
                if (q.sectionName && q.sectionName !== secFilter) return;
            }

            // Topic filter
            if (selectedTopics) {
                var topicMatch = false;
                for (var i = 0; i < q.parts.length; i++) {
                    if (q.parts[i].topic && selectedTopics[q.parts[i].topic]) {
                        topicMatch = true;
                        break;
                    }
                }
                if (!topicMatch) return;
            }

            results.push({ filename: filename, questionData: q });
        });

        return results;
    },

    /**
     * Select questions from candidates, preferring less recently attempted.
     * @private
     */
    _selectQuestions: function(candidates, count) {
        // Shuffle first
        var shuffled = candidates.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = tmp;
        }

        // Take up to count
        return shuffled.slice(0, Math.min(count, shuffled.length));
    },

    /**
     * Strip LaTeX delimiters from text for readable plain-text output.
     * Converts $...$ and $$...$$ to just the content inside.
     * @private
     */
    _stripLatex: function(text) {
        if (!text) return "";
        // Remove display math delimiters
        var s = text.replace(/\$\$(.*?)\$\$/g, "$1");
        // Remove inline math delimiters
        s = s.replace(/\$(.*?)\$/g, "$1");
        // Remove \( \) and \[ \]
        s = s.replace(/\\\((.*?)\\\)/g, "$1");
        s = s.replace(/\\\[(.*?)\\\]/g, "$1");
        // Clean up common LaTeX commands for readability
        s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)");
        s = s.replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)");
        s = s.replace(/\\left\(/g, "(").replace(/\\right\)/g, ")");
        s = s.replace(/\\left\[/g, "[").replace(/\\right\]/g, "]");
        s = s.replace(/\\times/g, "\u00D7");
        s = s.replace(/\\div/g, "\u00F7");
        s = s.replace(/\\pm/g, "\u00B1");
        s = s.replace(/\\leq/g, "\u2264").replace(/\\geq/g, "\u2265");
        s = s.replace(/\\neq/g, "\u2260");
        s = s.replace(/\\infty/g, "\u221E");
        s = s.replace(/\\pi/g, "\u03C0");
        s = s.replace(/\\theta/g, "\u03B8");
        s = s.replace(/\\[a-zA-Z]+/g, ""); // remove remaining commands
        s = s.replace(/[{}]/g, ""); // remove remaining braces
        return s.trim();
    },

    /**
     * Build the printable HTML document.
     * @private
     */
    _buildPrintHTML: function(selected, options) {
        var dateStr = new Date().toLocaleDateString("en-AU", {
            year: "numeric", month: "long", day: "numeric"
        });
        var totalMarks = 0;
        selected.forEach(function(s) { totalMarks += (s.questionData.totalMarks || 0); });

        var h = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
        h += '<title>Practice Questions - ' + dateStr + '</title>';
        h += '<style>';
        h += 'body{font-family:"Segoe UI",Calibri,Arial,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#1a1d23;line-height:1.6;font-size:11pt;}';
        h += 'h1{font-size:16pt;margin-bottom:4px;border-bottom:2px solid #333;padding-bottom:6px;}';
        h += '.meta{color:#555;font-size:9pt;margin-bottom:24px;}';
        h += '.question{margin-bottom:28px;page-break-inside:avoid;}';
        h += '.q-header{font-weight:700;font-size:11.5pt;margin-bottom:6px;display:flex;justify-content:space-between;align-items:baseline;}';
        h += '.q-marks{font-weight:400;color:#666;font-size:9.5pt;}';
        h += '.q-difficulty{font-size:8pt;color:#888;padding:1px 6px;border:1px solid #ccc;border-radius:3px;margin-left:8px;}';
        h += '.q-stimulus{margin-bottom:10px;}';
        h += '.q-part{margin-bottom:8px;margin-left:16px;}';
        h += '.q-part-label{font-weight:600;}';
        h += '.q-part-marks{color:#666;font-style:italic;font-size:9.5pt;}';
        h += '.workspace{border:1px solid #ddd;min-height:100px;margin:8px 0 0 16px;border-radius:4px;}';
        h += '.section-divider{page-break-before:always;border-top:3px solid #333;padding-top:16px;margin-top:32px;}';
        h += '.sol-header{font-size:14pt;font-weight:700;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:20px;page-break-before:always;}';
        h += '.sol-question{margin-bottom:24px;page-break-inside:avoid;}';
        h += '.sol-q-title{font-weight:700;font-size:11pt;margin-bottom:8px;}';
        h += '.sol-part{margin-bottom:12px;margin-left:16px;}';
        h += '.sol-part-label{font-weight:600;margin-bottom:4px;}';
        h += '.sol-line{margin:2px 0;padding:3px 0;border-bottom:1px dotted #e0e0e0;}';
        h += '.sol-guided{background:#f5f5f5;padding:10px;border-radius:4px;margin-top:6px;font-size:10pt;color:#333;}';
        h += '.sol-guided-label{font-weight:600;color:#444;margin-bottom:4px;}';
        h += '.mark-row{font-size:9.5pt;padding:2px 0;}';
        h += '.mark-awarded{color:#16a34a;font-weight:600;}';
        h += '@media print{body{padding:0;}.workspace{min-height:120px;}}';
        h += '@media screen{.no-print-msg{background:#e8f4fd;padding:12px 20px;border-radius:6px;margin-bottom:20px;font-size:10pt;color:#1e40af;}}';
        h += '</style></head><body>';

        // On-screen instruction
        h += '<div class="no-print-msg">Press <strong>Ctrl+P</strong> (or \u2318P) to print or save as PDF. Close this window when done.</div>';

        // Title
        h += '<h1>WACE Methods Practice Questions</h1>';
        h += '<div class="meta">Generated: ' + dateStr + ' &bull; ' +
            selected.length + ' question' + (selected.length !== 1 ? 's' : '') +
            ' &bull; ' + totalMarks + ' marks total &bull; ' +
            'Estimated time: ' + totalMarks + ' minutes</div>';

        // Questions
        selected.forEach(function(item, idx) {
            var q = item.questionData;
            h += '<div class="question">';
            h += '<div class="q-header"><span>Question ' + (idx + 1);
            if (q.questionReference) h += ' \u2014 ' + PrintUI._esc(PrintUI._stripLatex(q.questionReference));
            h += '</span>';
            h += '<span class="q-marks">[' + (q.totalMarks || '?') + ' marks]</span>';
            if (q.difficultyRating) h += '<span class="q-difficulty">' + PrintUI._esc(q.difficultyRating) + '</span>';
            h += '</div>';

            if (q.sectionName) {
                h += '<div style="font-size:8.5pt;color:#888;margin-bottom:6px;">' +
                    (q.sectionName === "CA" ? "Calculator Assumed" : "Calculator Free") + '</div>';
            }

            if (q.questionStimulus) {
                h += '<div class="q-stimulus">' + PrintUI._esc(PrintUI._stripLatex(q.questionStimulus)) + '</div>';
            }

            (q.parts || []).forEach(function(part) {
                h += '<div class="q-part">';
                h += '<span class="q-part-label">(' + PrintUI._esc(part.partLabel) + ')</span> ';
                h += PrintUI._esc(PrintUI._stripLatex(part.questionText));
                h += ' <span class="q-part-marks">[' + (part.partMarks || '?') + ' mark' +
                    (part.partMarks !== 1 ? 's' : '') + ']</span>';
                h += '</div>';
                h += '<div class="workspace"></div>';
            });
            h += '</div>';
        });

        // Solutions section
        if (options.solutions || options.guided || options.marking) {
            h += '<div class="sol-header">Solutions</div>';

            selected.forEach(function(item, idx) {
                var q = item.questionData;
                h += '<div class="sol-question">';
                h += '<div class="sol-q-title">Question ' + (idx + 1);
                if (q.questionReference) h += ' \u2014 ' + PrintUI._esc(PrintUI._stripLatex(q.questionReference));
                h += '</div>';

                (q.parts || []).forEach(function(part) {
                    h += '<div class="sol-part">';
                    h += '<div class="sol-part-label">(' + PrintUI._esc(part.partLabel) + ')</div>';

                    // Worked solution
                    if (options.solutions && part.originalSolution) {
                        part.originalSolution.forEach(function(line) {
                            if (line.shown !== false) {
                                h += '<div class="sol-line">' +
                                    PrintUI._esc(PrintUI._stripLatex(line.text)) + '</div>';
                            }
                        });
                    }

                    // Marking key
                    if (options.marking && part.marking) {
                        h += '<div style="margin-top:6px;">';
                        part.marking.forEach(function(criterion) {
                            h += '<div class="mark-row"><span class="mark-awarded">[' +
                                (criterion.awarded || 1) + ']</span> ' +
                                PrintUI._esc(PrintUI._stripLatex(criterion.text)) + '</div>';
                        });
                        h += '</div>';
                    }

                    // Guided solution
                    if (options.guided && part.guidedSolution) {
                        h += '<div class="sol-guided"><div class="sol-guided-label">Guided walkthrough:</div>' +
                            PrintUI._esc(PrintUI._stripLatex(part.guidedSolution)).replace(/\\n/g, '<br>') +
                            '</div>';
                    }

                    h += '</div>'; // sol-part
                });
                h += '</div>'; // sol-question
            });
        }

        h += '</body></html>';
        return h;
    },

    /**
     * Get the active value from a toggle group.
     * @private
     */
    _getToggleValue: function(selector) {
        var active = document.querySelector(selector + '[aria-pressed="true"]');
        return active ? active.getAttribute("data-value") : "any";
    },

    /**
     * Set up a toggle group (mutual exclusive buttons).
     * @private
     */
    _initToggleGroup: function(selector) {
        var btns = document.querySelectorAll(selector);
        btns.forEach(function(btn) {
            btn.addEventListener("click", function() {
                btns.forEach(function(b) { b.setAttribute("aria-pressed", "false"); });
                btn.setAttribute("aria-pressed", "true");
                PrintUI.updateHint();
            });
        });
    },

    /**
     * HTML-escape.
     * @private
     */
    _esc: function(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
};


// ============================================================================
// APP INITIALISATION
// ============================================================================
function initApp() {
    console.log("=== WACE Student Study Trainer v" + APP_VERSION + " ===");
    console.log("Initialising...");

    // Step 1: Initialise question engine (loads data from script-tag globals)
    QuestionEngine.init();

    // Step 2: Initialise IndexedDB
    DB.init().then(function() {
        // Step 3: Merge any imported questions
        return DB.getAll(STORE_IMPORTED);
    }).then(function(imported) {
        QuestionEngine.mergeImportedQuestions(imported);

        // Step 4: Get schedule updates from IndexedDB
        return DB.getAll(STORE_SCHEDULE_UPDATES);
    }).then(function(scheduleUpdates) {
        // Step 5: Check config for ahead-of-schedule setting
        return DB.get(STORE_CONFIG, "main").then(function(config) {
            var aheadOfSchedule = config ? !!config.aheadOfScheduleEnabled : false;

            // Step 6: Compute unlocked problem types
            QuestionEngine.computeUnlocked(scheduleUpdates, aheadOfSchedule);

            return config;
        });
    }).then(function(config) {
        // Step 7: Initialise UI event listeners
        UI.init();
        StudyUI.init();
        PrintUI.init();
        KeyboardShortcuts.init();

        // Step 8: Show welcome screen or main app
        if (!config) {
            console.log("First run detected - showing welcome screen");
            UI.showWelcomeScreen();
        } else {
            console.log("Returning user: " + config.studentName);
            UI.showMainApp(config);
        }

        console.log("Initialisation complete.");

        // Check MathJax loaded after a delay -- warn user if not
        setTimeout(function() {
            if (typeof MathJax === "undefined" || !MathJax.typesetPromise) {
                console.warn("MathJax not available -- equations will show as raw LaTeX");
                var banner = document.createElement("div");
                banner.className = "mathjax-warning";
                banner.innerHTML = SYMBOLS.CROSS +
                    " <strong>Math rendering not available.</strong> " +
                    "Equations will show as text. " +
                    "To fix: place the MathJax offline bundle in " +
                    "mathjax/ or connect to the internet." +
                    '<button onclick="this.parentNode.remove()" ' +
                    'style="margin-left:12px;cursor:pointer;border:none;' +
                    'background:none;font-size:1.1em;">&times;</button>';
                var topBar = document.getElementById("top-bar");
                if (topBar && topBar.parentNode) {
                    topBar.parentNode.insertBefore(banner, topBar.nextSibling);
                }
            }
        }, 12000);
    }).catch(function(err) {
        console.error("Initialisation failed:", err);
        // Show error with recovery option
        document.body.innerHTML =
            "<div style=\"padding:2em;font-family:sans-serif;max-width:600px;margin:0 auto;\">" +
            "<h1>Error Starting Study Trainer</h1>" +
            "<p>There was a problem initialising the application:</p>" +
            "<pre style=\"background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto;\">" +
            (err.message || err) + "</pre>" +
            "<p>Try refreshing the page. If the problem persists, " +
            "try opening in a different browser (Edge or Chrome recommended).</p>" +
            "<p>If refreshing doesn't help, you can reset the app data:</p>" +
            "<button onclick=\"if(confirm('This will erase all your progress. Continue?')){" +
            "var r=indexedDB.deleteDatabase('" + DB_NAME + "');" +
            "r.onsuccess=function(){window.location.reload();};" +
            "r.onerror=function(){alert('Reset failed. Try clearing browser data.');};" +
            "}\" style=\"padding:10px 20px;background:#dc2626;color:white;border:none;" +
            "border-radius:6px;cursor:pointer;font-size:0.95rem;\">Reset App Data</button>" +
            "<p style=\"color:#888;font-size:0.85rem;margin-top:12px;\">" +
            "Warning: resetting will erase all progress, mastery records, and settings.</p>" +
            "</div>";
    });
}

// Start when DOM is ready
window.addEventListener("DOMContentLoaded", initApp);
