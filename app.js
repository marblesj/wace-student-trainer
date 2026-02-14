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
    REVIEW:       "\u21BB"      // clockwise loop (review due)
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
        if (typeof TAUGHT_SCHEDULE !== "undefined") {
            // New format: flat enabledProblemTypes array (teacher ticks what they've taught)
            if (TAUGHT_SCHEDULE.enabledProblemTypes) {
                TAUGHT_SCHEDULE.enabledProblemTypes.forEach(function(pt) {
                    unlocked[pt] = true;
                });
            }
            // Legacy format: dated weeks (kept for backward compatibility)
            if (TAUGHT_SCHEDULE.schedule) {
                TAUGHT_SCHEDULE.schedule.forEach(function(entry) {
                    var entryDate = new Date(entry.date + "T00:00:00");
                    if (aheadOfSchedule || entryDate <= today) {
                        (entry.problemTypes || []).forEach(function(pt) {
                            unlocked[pt] = true;
                        });
                    }
                });
            }
        }

        // Imported schedule updates from IndexedDB
        if (scheduleUpdates && scheduleUpdates.length > 0) {
            scheduleUpdates.forEach(function(entry) {
                if (entry.enabledProblemTypes) {
                    // New format update
                    entry.enabledProblemTypes.forEach(function(pt) {
                        unlocked[pt] = true;
                    });
                } else {
                    // Legacy format update
                    var entryDate = new Date(entry.date + "T00:00:00");
                    if (aheadOfSchedule || entryDate <= today) {
                        (entry.problemTypes || []).forEach(function(pt) {
                            unlocked[pt] = true;
                        });
                    }
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

        // Legacy dated-weeks format
        if (TAUGHT_SCHEDULE.schedule) {
            for (var i = 0; i < TAUGHT_SCHEDULE.schedule.length; i++) {
                var d = new Date(TAUGHT_SCHEDULE.schedule[i].date + "T00:00:00");
                if (d > today) {
                    nextUnlock = TAUGHT_SCHEDULE.schedule[i];
                    break;
                }
            }
        }

        // Count total enabled types (new format) or schedule entries (legacy)
        var totalEntries = TAUGHT_SCHEDULE.enabledProblemTypes
            ? TAUGHT_SCHEDULE.enabledProblemTypes.length
            : (TAUGHT_SCHEDULE.schedule || []).length;

        return {
            className: TAUGHT_SCHEDULE.className || "Unknown Class",
            teacherName: TAUGHT_SCHEDULE.teacherName || "Unknown",
            totalEntries: totalEntries,
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
    answerMethod: "paper",    // "paper" or "stylus"
    markingMode: "instant",   // "instant" or "exam"
    sessionGoal: 10,
    startTime: null,

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
        SessionEngine.answerMethod = opts.answerMethod || "paper";
        SessionEngine.markingMode = opts.markingMode || "instant";
        SessionEngine.startTime = new Date();
        SessionEngine.freshCount = 0;
        SessionEngine.totalCount = 0;
        SessionEngine.bonusCount = 0;
        SessionEngine.currentQuestion = null;
        SessionEngine.currentFilename = null;
        SessionEngine.newMasteries = [];

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
            markingMode: SessionEngine.markingMode,
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
// WRITTEN MODE MODULE
// Canvas engine, AI marking via Claude API, results display, notation popup.
// Only active when SessionEngine.answerMethod === "stylus".
// ============================================================================
var WrittenMode = {

    // ---- API KEY MANAGEMENT ----
    // The API key is set by the teacher in schedule.js (TAUGHT_SCHEDULE.apiKey).
    // Students never need to enter or see it.

    getApiKey: function() {
        if (typeof TAUGHT_SCHEDULE !== "undefined" && TAUGHT_SCHEDULE.apiKey) {
            return TAUGHT_SCHEDULE.apiKey;
        }
        return "";
    },

    getMarkEndpoint: function() {
        if (typeof TAUGHT_SCHEDULE !== "undefined" && TAUGHT_SCHEDULE.markEndpoint) {
            return TAUGHT_SCHEDULE.markEndpoint;
        }
        return "";
    },

    /**
     * Check if Written Mode marking is available (either proxy or direct API).
     */
    hasMarkingAPI: function() {
        return !!(WrittenMode.getMarkEndpoint() || WrittenMode.getApiKey());
    },

    /**
     * Call Claude API for marking. Routes through proxy if markEndpoint is configured,
     * falls back to direct API call if apiKey is set instead.
     */
    _callClaudeAPI: function(systemPrompt, contentBlocks) {
        var markEndpoint = WrittenMode.getMarkEndpoint();

        var body = {
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{ role: "user", content: contentBlocks }]
        };

        if (markEndpoint) {
            // Route through proxy (API key stored server-side)
            return fetch(markEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        }

        // Fallback: direct API call (API key in schedule.js)
        var apiKey = WrittenMode.getApiKey();
        if (!apiKey) return Promise.reject(new Error("No marking API configured"));

        return fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify(body)
        });
    },

    getSympyEndpoint: function() {
        if (typeof TAUGHT_SCHEDULE !== "undefined" && TAUGHT_SCHEDULE.sympyEndpoint) {
            return TAUGHT_SCHEDULE.sympyEndpoint;
        }
        return "";
    },

    // ---- CANVAS ENGINE ----

    CanvasEngine: {
        canvases: {},

        init: function(partLabel, canvasEl) {
            var dpr = window.devicePixelRatio || 1;
            var rect = canvasEl.getBoundingClientRect();
            canvasEl.width = rect.width * dpr;
            canvasEl.height = rect.height * dpr;

            var ctx = canvasEl.getContext("2d");
            ctx.scale(dpr, dpr);

            var state = {
                canvas: canvasEl,
                ctx: ctx,
                dpr: dpr,
                drawing: false,
                tool: "pen",
                color: "#000000",
                lineWidth: 3,
                points: [],
                undoStack: [],
                hasContent: false
            };

            this.canvases[partLabel] = state;

            var self = this;
            canvasEl.addEventListener("pointerdown", function(e) {
                self.onPointerDown(partLabel, e);
            });
            canvasEl.addEventListener("pointermove", function(e) {
                self.onPointerMove(partLabel, e);
            });
            canvasEl.addEventListener("pointerup", function(e) {
                self.onPointerUp(partLabel, e);
            });
            canvasEl.addEventListener("pointerleave", function(e) {
                self.onPointerUp(partLabel, e);
            });

            canvasEl.style.touchAction = "none";
            return state;
        },

        getPos: function(canvas, e) {
            var rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
        },

        saveState: function(partLabel) {
            var s = this.canvases[partLabel];
            if (!s) return;
            if (s.undoStack.length > 30) s.undoStack.shift();
            s.undoStack.push(s.canvas.toDataURL());
        },

        onPointerDown: function(partLabel, e) {
            var s = this.canvases[partLabel];
            if (!s) return;
            e.preventDefault();
            this.saveState(partLabel);
            s.drawing = true;
            s.points = [];
            var pos = this.getPos(s.canvas, e);
            s.points.push(pos);
            s.ctx.beginPath();
            s.ctx.moveTo(pos.x, pos.y);

            var ph = s.canvas.parentElement.querySelector(".wm-canvas-placeholder");
            if (ph) ph.style.display = "none";
        },

        onPointerMove: function(partLabel, e) {
            var s = this.canvases[partLabel];
            if (!s || !s.drawing) return;
            e.preventDefault();

            var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
            for (var i = 0; i < events.length; i++) {
                var pos = this.getPos(s.canvas, events[i]);
                s.points.push(pos);
                this.drawStroke(s, pos);
            }
        },

        onPointerUp: function(partLabel, e) {
            var s = this.canvases[partLabel];
            if (!s || !s.drawing) return;
            s.drawing = false;
            s.ctx.closePath();
            s.hasContent = true;
            WrittenMode.checkMarkButton();
        },

        drawStroke: function(s, pos) {
            var pressure = pos.pressure || 0.5;
            var width = s.lineWidth * (0.5 + pressure);

            if (s.tool === "eraser") {
                s.ctx.globalCompositeOperation = "destination-out";
                width = s.lineWidth * 3;
            } else {
                s.ctx.globalCompositeOperation = "source-over";
            }

            s.ctx.lineWidth = width;
            s.ctx.lineCap = "round";
            s.ctx.lineJoin = "round";
            s.ctx.strokeStyle = s.color;
            s.ctx.lineTo(pos.x, pos.y);
            s.ctx.stroke();
            s.ctx.beginPath();
            s.ctx.moveTo(pos.x, pos.y);
        },

        setTool: function(partLabel, tool) {
            var s = this.canvases[partLabel];
            if (s) s.tool = tool;
        },

        setColor: function(partLabel, color) {
            var s = this.canvases[partLabel];
            if (s) {
                s.color = color;
                s.tool = "pen";
            }
        },

        setWidth: function(partLabel, width) {
            var s = this.canvases[partLabel];
            if (s) s.lineWidth = width;
        },

        undo: function(partLabel) {
            var s = this.canvases[partLabel];
            if (!s || s.undoStack.length === 0) return;
            var prev = s.undoStack.pop();
            var img = new Image();
            img.onload = function() {
                s.ctx.globalCompositeOperation = "source-over";
                s.ctx.clearRect(0, 0, s.canvas.width / s.dpr, s.canvas.height / s.dpr);
                s.ctx.drawImage(img, 0, 0, s.canvas.width / s.dpr, s.canvas.height / s.dpr);
            };
            img.src = prev;
        },

        clear: function(partLabel) {
            var s = this.canvases[partLabel];
            if (!s) return;
            this.saveState(partLabel);
            s.ctx.globalCompositeOperation = "source-over";
            s.ctx.clearRect(0, 0, s.canvas.width / s.dpr, s.canvas.height / s.dpr);
            s.hasContent = false;
            var ph = s.canvas.parentElement.querySelector(".wm-canvas-placeholder");
            if (ph) ph.style.display = "block";
            WrittenMode.checkMarkButton();
        },

        exportPNG: function(partLabel) {
            var s = this.canvases[partLabel];
            if (!s) return null;
            var maxWidth = 1568;
            if (s.canvas.width <= maxWidth) {
                return s.canvas.toDataURL("image/png");
            }
            var scale = maxWidth / s.canvas.width;
            var temp = document.createElement("canvas");
            temp.width = maxWidth;
            temp.height = s.canvas.height * scale;
            var tCtx = temp.getContext("2d");
            tCtx.drawImage(s.canvas, 0, 0, temp.width, temp.height);
            return temp.toDataURL("image/png");
        }
    },

    // ---- QUESTION TIMER ----

    QuestionTimer: {
        interval: null,
        startTime: null,
        allowedSeconds: 0,
        elapsed: 0,

        start: function(question) {
            this.stop();
            var hasContext = question.questionStimulus && question.questionStimulus.length > 0;
            this.allowedSeconds = hasContext
                ? (25 + (question.totalMarks || 5) * 50)
                : (20 + (question.totalMarks || 5) * 35);
            this.startTime = Date.now();
            this.elapsed = 0;

            var timerEl = document.getElementById("wm-timer");
            var displayEl = document.getElementById("wm-timer-display");
            if (timerEl) {
                timerEl.classList.remove("wm-hidden", "wm-timer-warning", "wm-timer-overtime");
            }
            if (displayEl) {
                displayEl.textContent = this.formatTime(this.allowedSeconds);
            }

            var self = this;
            this.interval = setInterval(function() {
                self.elapsed = Math.floor((Date.now() - self.startTime) / 1000);
                var remaining = self.allowedSeconds - self.elapsed;

                var timerEl = document.getElementById("wm-timer");
                var displayEl = document.getElementById("wm-timer-display");
                if (!displayEl || !timerEl) {
                    self.stop(); // auto-cleanup if DOM elements removed
                    return;
                }

                if (remaining > 0) {
                    displayEl.textContent = self.formatTime(remaining);
                    timerEl.classList.remove("wm-timer-overtime", "wm-timer-warning");
                    if (remaining <= 60) timerEl.classList.add("wm-timer-warning");
                } else {
                    displayEl.textContent = "+" + self.formatTime(-remaining);
                    timerEl.classList.remove("wm-timer-warning");
                    timerEl.classList.add("wm-timer-overtime");
                }
            }, 1000);
        },

        stop: function() {
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
        },

        formatTime: function(seconds) {
            var abs = Math.abs(Math.floor(seconds));
            var m = Math.floor(abs / 60);
            var s = abs % 60;
            return m + ":" + (s < 10 ? "0" : "") + s;
        }
    },

    // ---- CANVAS UI HELPERS ----

    selectTool: function(partLabel, tool, btn) {
        WrittenMode.CanvasEngine.setTool(partLabel, tool);
        var toolbar = btn.closest(".wm-canvas-toolbar");
        toolbar.querySelectorAll("[data-tool]").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
    },

    selectColor: function(partLabel, color, dot) {
        WrittenMode.CanvasEngine.setColor(partLabel, color);
        var toolbar = dot.closest(".wm-canvas-toolbar");
        toolbar.querySelectorAll(".wm-color-dot").forEach(function(d) { d.classList.remove("active"); });
        dot.classList.add("active");
        toolbar.querySelectorAll("[data-tool]").forEach(function(b) { b.classList.remove("active"); });
        toolbar.querySelector('[data-tool="pen"]').classList.add("active");
    },

    selectWidth: function(partLabel, width, btn) {
        WrittenMode.CanvasEngine.setWidth(partLabel, width);
        var toolbar = btn.closest(".wm-canvas-toolbar");
        toolbar.querySelectorAll(".wm-width-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
    },

    confirmClear: function(partLabel) {
        if (confirm("Clear your working for this part?")) {
            WrittenMode.CanvasEngine.clear(partLabel);
        }
    },

    checkMarkButton: function() {
        var q = StudyUI.currentQuestion;
        if (!q || !q.parts) return;
        var partsWithContent = 0;
        var totalParts = q.parts.length;
        q.parts.forEach(function(p) {
            var s = WrittenMode.CanvasEngine.canvases[p.partLabel];
            if (s && s.hasContent) partsWithContent++;
        });
        var allHaveContent = partsWithContent === totalParts;
        var markBtn = document.getElementById("wm-mark-btn");
        var markHint = document.getElementById("wm-mark-hint");
        if (markBtn) markBtn.disabled = !allHaveContent;
        if (markHint) {
            if (allHaveContent) {
                markHint.textContent = "Ready to mark!";
            } else if (partsWithContent > 0) {
                markHint.textContent = partsWithContent + " of " + totalParts + " parts answered";
            }
        }
    },

    // ---- RENDER CANVAS ROW HTML ----

    renderCanvasRow: function(partLabel) {
        var html = '<div class="wm-canvas-row">';

        // Main answer canvas
        html += '<div class="wm-canvas-main">';
        html += '<div class="wm-canvas-area" data-part="' + partLabel + '">';

        // Toolbar
        html += '<div class="wm-canvas-toolbar">';
        html += '<div class="wm-toolbar-group">';
        html += '<button class="wm-tool-btn active" data-tool="pen" ' +
            'onclick="WrittenMode.selectTool(\'' + partLabel + '\', \'pen\', this)">\u270F\uFE0F Pen</button>';
        html += '<button class="wm-tool-btn" data-tool="eraser" ' +
            'onclick="WrittenMode.selectTool(\'' + partLabel + '\', \'eraser\', this)">\u25FB Eraser</button>';
        html += '</div>';
        html += '<div class="wm-toolbar-sep"></div>';

        // Colors
        html += '<div class="wm-toolbar-group">';
        html += '<div class="wm-color-dot active" style="background:#000" ' +
            'onclick="WrittenMode.selectColor(\'' + partLabel + '\', \'#000000\', this)"></div>';
        html += '<div class="wm-color-dot" style="background:#1565C0" ' +
            'onclick="WrittenMode.selectColor(\'' + partLabel + '\', \'#1565C0\', this)"></div>';
        html += '<div class="wm-color-dot" style="background:#C62828" ' +
            'onclick="WrittenMode.selectColor(\'' + partLabel + '\', \'#C62828\', this)"></div>';
        html += '</div>';
        html += '<div class="wm-toolbar-sep"></div>';

        // Widths
        html += '<div class="wm-toolbar-group">';
        html += '<button class="wm-width-btn" onclick="WrittenMode.selectWidth(\'' + partLabel + '\', 1.5, this)">' +
            '<div class="wm-width-indicator" style="width:4px;height:4px;"></div></button>';
        html += '<button class="wm-width-btn active" onclick="WrittenMode.selectWidth(\'' + partLabel + '\', 3, this)">' +
            '<div class="wm-width-indicator" style="width:6px;height:6px;"></div></button>';
        html += '<button class="wm-width-btn" onclick="WrittenMode.selectWidth(\'' + partLabel + '\', 5, this)">' +
            '<div class="wm-width-indicator" style="width:9px;height:9px;"></div></button>';
        html += '</div>';
        html += '<div class="wm-toolbar-sep"></div>';

        // Undo / Clear
        html += '<div class="wm-toolbar-group">';
        html += '<button class="wm-tool-btn" onclick="WrittenMode.CanvasEngine.undo(\'' + partLabel + '\')">\u21A9 Undo</button>';
        html += '<button class="wm-tool-btn" onclick="WrittenMode.confirmClear(\'' + partLabel + '\')">' +
            '\uD83D\uDDD1 Clear</button>';
        html += '</div>';

        html += '</div>'; // toolbar

        // Canvas
        html += '<div class="wm-canvas-wrapper">';
        html += '<canvas class="wm-drawing-canvas" id="wm-canvas-' + partLabel +
            '" height="300" style="height:300px;"></canvas>';
        html += '<div class="wm-canvas-placeholder">Write your answer here</div>';
        html += '</div>';

        html += '</div>'; // canvas-area
        html += '</div>'; // canvas-main

        // Scribble pad
        var scribbleId = "scribble-" + partLabel;
        html += '<div class="wm-canvas-scribble">';
        html += '<div class="wm-canvas-area">';
        html += '<div class="wm-scribble-label">Rough Working</div>';
        html += '<div class="wm-canvas-toolbar">';
        html += '<div class="wm-toolbar-group">';
        html += '<button class="wm-tool-btn active" data-tool="pen" ' +
            'onclick="WrittenMode.selectTool(\'' + scribbleId + '\', \'pen\', this)">\u270F\uFE0F</button>';
        html += '<button class="wm-tool-btn" data-tool="eraser" ' +
            'onclick="WrittenMode.selectTool(\'' + scribbleId + '\', \'eraser\', this)">\u25FB</button>';
        html += '</div>';
        html += '<div class="wm-toolbar-group" style="margin-left:auto;">';
        html += '<button class="wm-tool-btn" onclick="WrittenMode.CanvasEngine.undo(\'' + scribbleId + '\')">\u21A9</button>';
        html += '<button class="wm-tool-btn" onclick="WrittenMode.confirmClear(\'' + scribbleId + '\')">' +
            '\uD83D\uDDD1</button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="wm-canvas-wrapper">';
        html += '<canvas class="wm-drawing-canvas" id="wm-canvas-' + scribbleId +
            '" height="300" style="height:300px;"></canvas>';
        html += '<div class="wm-canvas-placeholder">Scratch pad</div>';
        html += '</div>';
        html += '</div>'; // canvas-area
        html += '</div>'; // canvas-scribble

        html += '</div>'; // canvas-row
        return html;
    },

    // ---- INIT CANVASES FOR QUESTION ----

    initCanvasesForQuestion: function(q) {
        WrittenMode.CanvasEngine.canvases = {};
        if (!q.parts) return;
        q.parts.forEach(function(part) {
            var c = document.getElementById("wm-canvas-" + part.partLabel);
            if (c) WrittenMode.CanvasEngine.init(part.partLabel, c);
            var sc = document.getElementById("wm-canvas-scribble-" + part.partLabel);
            if (sc) WrittenMode.CanvasEngine.init("scribble-" + part.partLabel, sc);
        });
    },

    // ---- AI MARKING ----

    markAnswer: function() {
        var q = StudyUI.currentQuestion;
        if (!WrittenMode.hasMarkingAPI() || !q) return;

        WrittenMode.QuestionTimer.stop();

        var overlay = document.getElementById("wm-marking-overlay");
        if (overlay) overlay.classList.remove("wm-hidden");

        var contentBlocks = [];
        var systemPrompt = WrittenMode.buildSystemPrompt();

        q.parts.forEach(function(part, idx) {
            var partInfo = "Part (" + part.partLabel + ") \u2014 " + part.partMarks + " marks\n" +
                "Question: " + part.questionText + "\n\n" +
                "Marking criteria:\n";

            if (part.marking) {
                part.marking.forEach(function(m, mi) {
                    var line = (mi + 1) + ". " + m.text + " [" + m.awarded + " mark(s)]";
                    if (m.type) line += " {type:" + m.type + "}";
                    if (m.deps && m.deps.length) line += " {deps:" + m.deps.join(",") + "}";
                    if (m.cao) line += " {CAO}";
                    if (m.isw) line += " {ISW}";
                    if (m.ft === false) line += " {no-FT}";
                    if (m.accuracy) line += " {accuracy:" + JSON.stringify(m.accuracy) + "}";
                    partInfo += line + "\n";
                });
            }

            if (part.originalSolution) {
                partInfo += "\nWorked solution for reference:\n";
                part.originalSolution.forEach(function(sol, si) {
                    partInfo += (si + 1) + ". " + sol.text + "\n";
                });
            }

            partInfo += "\nBelow is the student's handwritten answer for this part:";
            contentBlocks.push({ type: "text", text: partInfo });

            var dataUrl = WrittenMode.CanvasEngine.exportPNG(part.partLabel);
            if (dataUrl) {
                var base64 = dataUrl.split(",")[1];
                contentBlocks.push({
                    type: "image",
                    source: { type: "base64", media_type: "image/png", data: base64 }
                });
            }
        });

        contentBlocks.push({
            type: "text",
            text: "Mark all parts. IMPORTANT: First read ALL parts' handwriting to understand what the student wrote. " +
                  "Then mark each part. For multi-part questions, apply FOLLOW-THROUGH MARKING: if the student got an earlier part wrong " +
                  "but correctly used their wrong answer in later parts, award ALL marks in those later parts. " +
                  "The error is penalised ONLY in the part where it occurred \u2014 do not penalise it again in later parts. " +
                  "Respond with JSON only."
        });

        WrittenMode._callClaudeAPI(systemPrompt, contentBlocks)
        .then(function(resp) {
            if (!resp.ok) {
                return resp.json().then(function(data) {
                    throw new Error(data.error ? data.error.message : "API error " + resp.status);
                });
            }
            return resp.json();
        })
        .then(function(data) {
            if (overlay) overlay.classList.add("wm-hidden");

            var text = "";
            if (data.content) {
                data.content.forEach(function(block) {
                    if (block.type === "text") text += block.text;
                });
            }

            var cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
            var result = JSON.parse(cleaned);

            // Run SymPy verification (graceful Ã¢â‚¬â€ returns null if unavailable)
            WrittenMode._runSympyVerification(result).then(function(sympyData) {
                WrittenMode.displayResults(result, sympyData);
            });
        })
        .catch(function(err) {
            if (overlay) overlay.classList.add("wm-hidden");

            // Offer fallback to paper self-assessment
            var msg = "Marking failed: " + err.message +
                "\n\nWould you like to self-assess this question instead?";
            if (confirm(msg)) {
                // Hide the mark bar before switching to paper mode
                var markArea = document.getElementById("wm-mark-area");
                if (markArea) markArea.classList.add("wm-hidden");
                // Switch to paper mode for this question only
                StudyUI.showSolution();
            }
            console.error("WrittenMode marking error:", err);
        });
    },

    // ---- DISPLAY RESULTS ----

    displayResults: function(result, sympyData) {
        var q = StudyUI.currentQuestion;
        if (!q) return;

        // Hide mark bar
        var markArea = document.getElementById("wm-mark-area");
        if (markArea) markArea.classList.add("wm-hidden");

        // Store result for overrides
        window._wmMarkingResult = result;
        window._wmSympyData = sympyData || null;

        var container = document.getElementById("wm-results-container");
        if (!container) return;
        container.classList.remove("wm-hidden");

        // Calculate total score
        var totalEarned = 0;
        var totalAvailable = 0;
        result.parts.forEach(function(p) {
            totalEarned += p.totalAwarded;
            totalAvailable += p.totalAvailable;
        });

        var allCorrect = totalEarned === totalAvailable;
        var html = "";

        // Header
        html += '<div class="wm-results-header">';
        html += '<div class="wm-results-title">Marking Results</div>';
        html += '<div class="wm-results-score"><span class="wm-earned">' + totalEarned +
            '</span><span class="wm-total"> / ' + totalAvailable + ' marks</span></div>';
        html += '</div>';

        if (allCorrect) {
            html += '<div class="wm-all-correct">';
            html += '<div class="wm-all-correct-icon">\uD83C\uDF89</div>';
            html += '<div class="wm-all-correct-text">All correct! Perfect score.</div>';
            html += '</div>';
        }

        // SymPy verification summary
        if (sympyData && sympyData.totalChecks > 0) {
            var vClass = sympyData.disagreements > 0 ? "wm-sympy-summary warn" : "wm-sympy-summary ok";
            html += '<div class="' + vClass + '">';
            if (sympyData.disagreements > 0) {
                html += '<span class="wm-sympy-summary-icon">\u26A0\uFE0F</span>';
                html += '<span>SymPy verified ' + sympyData.agreements + '/' + sympyData.totalChecks +
                    ' checks \u2014 ' + sympyData.disagreements + ' flagged for review</span>';
            } else {
                html += '<span class="wm-sympy-summary-icon">\u2705</span>';
                html += '<span>SymPy verified all ' + sympyData.agreements + ' mathematical checks</span>';
            }
            html += '</div>';
        }

        // Per-part results
        result.parts.forEach(function(partResult, idx) {
            var questionPart = q.parts[idx];
            if (!questionPart) return;

            html += '<div class="wm-part-result">';

            var scoreClass = "zero";
            if (partResult.totalAwarded === partResult.totalAvailable) scoreClass = "full";
            else if (partResult.totalAwarded > 0) scoreClass = "partial";

            html += '<div class="wm-part-result-header">';
            html += '<span class="wm-part-result-label">Part (' +
                StudyUI._escapeHtml(questionPart.partLabel) + ')</span>';
            html += '<span class="wm-part-result-score ' + scoreClass + '">' +
                partResult.totalAwarded + ' / ' + partResult.totalAvailable + '</span>';
            html += '</div>';

            // AI Reading
            if (partResult.reading) {
                html += '<div class="wm-ai-reading">';
                html += '<div class="wm-ai-reading-label">AI Reading of Your Work</div>';
                html += '<div class="wm-ai-reading-text">' + partResult.reading + '</div>';
                html += '</div>';
            }

            // Marking criteria
            html += '<div class="wm-marking-criteria">';
            html += '<div class="wm-marking-criteria-header">Marking Criteria</div>';

            if (partResult.marks) {
                partResult.marks.forEach(function(mark, markIdx) {
                    var criterion = questionPart.marking[mark.criterionIndex];
                    if (!criterion) return;
                    var passClass = mark.awarded ? "passed" : "failed";
                    var icon = mark.awarded ? "\u2713" : "\u2717";
                    var clickAttr = "";
                    var hintHtml = "";

                    if (!mark.awarded) {
                        clickAttr = ' onclick="WrittenMode.overrideMark(' + idx + ', ' + markIdx + ', this)"';
                        hintHtml = '<span class="wm-override-hint">\u2190 tap if AI misread</span>';
                    }

                    // SymPy verification badge
                    var verifyBadge = "";
                    if (sympyData && sympyData.perCriterion) {
                        var vKey = questionPart.partLabel + "-" + mark.criterionIndex;
                        var vResult = sympyData.perCriterion[vKey];
                        if (vResult) {
                            if (vResult.status === "verified") {
                                verifyBadge = '<span class="wm-sympy-badge verified" title="' +
                                    StudyUI._escapeHtml(vResult.details) + '">\u2713 verified</span>';
                            } else if (vResult.status === "disagree") {
                                verifyBadge = '<span class="wm-sympy-badge disagree" title="' +
                                    StudyUI._escapeHtml(vResult.details) + '">\u26A0\uFE0F check</span>';
                            }
                        }
                    }

                    html += '<div class="wm-marking-row ' + passClass + '" id="wm-mark-' + idx + '-' + markIdx + '"' + clickAttr + '>';
                    html += '<div class="wm-mark-icon">' + icon + '</div>';
                    html += '<div class="wm-mark-detail">';
                    html += '<div class="wm-mark-text">' + StudyUI._escapeHtml(criterion.text) +
                        ' [' + criterion.awarded + ']' + hintHtml +
                        '<span class="wm-override-label">overridden</span>' + verifyBadge + '</div>';
                    if (mark.reason) {
                        html += '<div class="wm-mark-reason">' + mark.reason + '</div>';
                    }
                    html += '</div>';
                    html += '</div>';
                });
            }
            html += '</div>';

            // Error diagnosis
            if (partResult.errorType && partResult.skillDiagnosis) {
                html += '<div class="wm-error-diagnosis">';
                html += '<div class="wm-error-diagnosis-label">';
                html += '\u26A0\uFE0F Skill/Process Error ';
                html += '<span class="wm-error-type-badge ' + partResult.errorType + '">' +
                    partResult.errorType + '</span>';
                html += '</div>';
                html += '<div class="wm-error-diagnosis-text">' +
                    partResult.skillDiagnosis + '</div>';
                html += '</div>';
            }

            // Solution lines with error marking
            if (questionPart.originalSolution) {
                html += '<div class="wm-solution-lines-result" id="wm-sol-lines-' + idx + '">';
                html += '<div style="font-size:0.8rem;font-weight:600;color:var(--text-muted);' +
                    'text-transform:uppercase;letter-spacing:0.03em;margin-bottom:8px;">Worked Solution</div>';

                questionPart.originalSolution.forEach(function(line, lineIdx) {
                    var lineNum = lineIdx + 1;
                    var lineClass = "";
                    var arrowHtml = "";

                    if (partResult.errorLine) {
                        if (lineNum < partResult.errorLine) {
                            lineClass = "correct-line";
                        } else if (lineNum === partResult.errorLine) {
                            lineClass = "error-line";
                            arrowHtml = '<span class="wm-error-arrow">\u2190 error here</span>';
                        } else {
                            lineClass = "error-line";
                        }
                    } else if (partResult.totalAwarded === partResult.totalAvailable) {
                        lineClass = "correct-line";
                    } else {
                        lineClass = "error-line";
                    }

                    html += '<div class="wm-sol-line ' + lineClass +
                        '" id="wm-sol-line-' + idx + '-' + lineNum + '">';
                    html += '<span class="wm-line-num">' + lineNum + '</span>';
                    html += '<span>' + StudyUI._renderSolutionText(line.text, q._pool) + '</span>';
                    html += arrowHtml;
                    html += '</div>';
                });

                html += '</div>';
            }

            html += '</div>'; // .wm-part-result
        });

        container.innerHTML = html;

        // Show next actions
        var nextActions = document.getElementById("wm-next-actions");
        if (nextActions) nextActions.classList.remove("wm-hidden");

        // Render MathJax
        UI.renderMath(container);

        // Scroll to results
        container.scrollIntoView({ behavior: "smooth" });

        // Show notation popup
        WrittenMode.showNotationPopup(result);

        // Record results into the StudyUI pipeline
        WrittenMode._recordAIResults(result);
    },

    // ---- RECORD AI RESULTS INTO EXISTING PIPELINE ----

    _recordAIResults: function(result) {
        var q = StudyUI.currentQuestion;
        if (!q || !q.parts) return;

        q.parts.forEach(function(part, idx) {
            var partResult = result.parts[idx];
            if (!partResult) return;

            var totalMarks = part.partMarks || 0;
            var earned = partResult.totalAwarded || 0;
            var isCorrect = (earned === totalMarks);

            // Build markingCriteriaFailed list from AI result
            var failedCriteria = [];
            if (partResult.marks) {
                partResult.marks.forEach(function(mark) {
                    if (!mark.awarded && mark.criterionIndex !== undefined) {
                        failedCriteria.push(mark.criterionIndex);
                    }
                });
            }

            // Map AI result to the same format as paper self-assessment
            // Keys must be partLabel (e.g. "a", "b") to match SessionEngine.recordResults
            StudyUI.partResults[part.partLabel] = {
                correct: isCorrect,
                correctButUnsure: false,
                errorAtLine: isCorrect ? null : (partResult.errorLine || 1),
                markingCriteriaFailed: failedCriteria,
                marksEarned: earned,
                marksAvailable: totalMarks,
                answerMethod: "stylus",
                errorType: isCorrect ? null : (partResult.errorType || "execution")
            };
        });

        StudyUI.assessedParts = q.parts.length;

        // Populate _anotherTargetPTs for the "Another like this" button
        var wrongPTs = [];
        var allPTs = [];
        q.parts.forEach(function(part) {
            if (part.problemType && allPTs.indexOf(part.problemType) === -1) {
                allPTs.push(part.problemType);
            }
            var pr = StudyUI.partResults[part.partLabel];
            if (pr && !pr.correct && part.problemType) {
                if (wrongPTs.indexOf(part.problemType) === -1) {
                    wrongPTs.push(part.problemType);
                }
            }
        });
        StudyUI._anotherTargetPTs = wrongPTs.length > 0 ? wrongPTs : allPTs;
    },

    // ---- NOTATION POPUP ----

    showNotationPopup: function(result) {
        if (!result || !result.parts) return;

        var messages = [];
        var hasWarning = false;
        result.parts.forEach(function(p) {
            if (p.notationFeedback && p.notationFeedback.message) {
                messages.push({
                    part: p.partLabel,
                    correct: p.notationFeedback.correct,
                    message: p.notationFeedback.message
                });
                if (!p.notationFeedback.correct) hasWarning = true;
            }
        });

        if (messages.length === 0) return;

        var popup = document.getElementById("wm-notation-popup");
        var overlay = document.getElementById("wm-notation-overlay");

        var combinedMsg = "";
        messages.forEach(function(m) {
            if (messages.length > 1) {
                combinedMsg += "<strong>Part (" + m.part + "):</strong> ";
            }
            combinedMsg += m.message;
            if (messages.length > 1) combinedMsg += "<br><br>";
        });

        var isGood = !hasWarning;
        popup.className = "wm-notation-popup " + (isGood ? "notation-good" : "notation-warn");
        document.getElementById("wm-notation-icon").textContent = isGood ? "\u2705" : "\u26A0\uFE0F";
        document.getElementById("wm-notation-label").textContent = isGood ? "Good Notation!" : "Fix Your Notation";
        document.getElementById("wm-notation-msg").innerHTML = combinedMsg;

        overlay.classList.add("visible");

        UI.renderMath(popup);

        if (isGood) {
            setTimeout(function() {
                WrittenMode.dismissNotation();
            }, 4000);
        }
    },

    dismissNotation: function() {
        var overlay = document.getElementById("wm-notation-overlay");
        if (overlay) overlay.classList.remove("visible");
    },

    // ---- OVERRIDE MARK ----

    overrideMark: function(partIdx, markIdx, rowEl) {
        var result = window._wmMarkingResult;
        if (!result || !result.parts[partIdx]) return;

        var partResult = result.parts[partIdx];
        var mark = partResult.marks[markIdx];
        if (!mark) return;

        if (mark._originalAwarded === undefined) {
            mark._originalAwarded = mark.awarded;
        }

        if (!mark.awarded) {
            mark.awarded = true;
            partResult.totalAwarded++;
            rowEl.classList.remove("failed");
            rowEl.classList.add("overridden");
            rowEl.querySelector(".wm-mark-icon").textContent = "\u2713";
        } else if (mark._originalAwarded === false) {
            mark.awarded = false;
            partResult.totalAwarded--;
            rowEl.classList.remove("overridden");
            rowEl.classList.add("failed");
            rowEl.querySelector(".wm-mark-icon").textContent = "\u2717";
        }

        // Update part score display
        var partScoreEl = document.querySelector(
            "#wm-results-container .wm-part-result:nth-child(" + (partIdx + 2) + ") .wm-part-result-score");
        if (partScoreEl) {
            partScoreEl.textContent = partResult.totalAwarded + " / " + partResult.totalAvailable;
            if (partResult.totalAwarded === partResult.totalAvailable) {
                partScoreEl.className = "wm-part-result-score full";
            } else if (partResult.totalAwarded > 0) {
                partScoreEl.className = "wm-part-result-score partial";
            } else {
                partScoreEl.className = "wm-part-result-score zero";
            }
        }

        // Recalculate total
        var totalEarned = 0;
        var totalAvailable = 0;
        result.parts.forEach(function(p) {
            totalEarned += p.totalAwarded;
            totalAvailable += p.totalAvailable;
        });

        var scoreEl = document.querySelector(".wm-results-score");
        if (scoreEl) {
            scoreEl.innerHTML = '<span class="wm-earned">' + totalEarned +
                '</span><span class="wm-total"> / ' + totalAvailable + ' marks</span>';
        }

        // Update solution lines
        WrittenMode.updateSolutionLines(partIdx);

        // Re-record results with updated marks
        WrittenMode._recordAIResults(result);
    },

    updateSolutionLines: function(partIdx) {
        var result = window._wmMarkingResult;
        if (!result || !result.parts[partIdx]) return;
        var partResult = result.parts[partIdx];
        var questionPart = StudyUI.currentQuestion.parts[partIdx];
        if (!questionPart || !questionPart.originalSolution) return;

        var allAwarded = partResult.marks.every(function(m) { return m.awarded; });
        var effectiveErrorLine = allAwarded ? null : partResult.errorLine;

        questionPart.originalSolution.forEach(function(line, lineIdx) {
            var lineNum = lineIdx + 1;
            var lineEl = document.getElementById("wm-sol-line-" + partIdx + "-" + lineNum);
            if (!lineEl) return;

            lineEl.classList.remove("correct-line", "error-line");
            var arrow = lineEl.querySelector(".wm-error-arrow");
            if (arrow) arrow.remove();

            if (effectiveErrorLine) {
                if (lineNum < effectiveErrorLine) {
                    lineEl.classList.add("correct-line");
                } else {
                    lineEl.classList.add("error-line");
                    if (lineNum === effectiveErrorLine) {
                        var arrowSpan = document.createElement("span");
                        arrowSpan.className = "wm-error-arrow";
                        arrowSpan.textContent = "\u2190 error here";
                        lineEl.appendChild(arrowSpan);
                    }
                }
            } else if (allAwarded) {
                lineEl.classList.add("correct-line");
            } else {
                lineEl.classList.add("error-line");
            }
        });
    },

    // ---- SYSTEM PROMPT ----

    buildSystemPrompt: function() {
        return "You are marking a student's handwritten maths answer for a WACE Methods exam question. " +
            "Analyse the handwritten working in the image and mark it against the provided marking criteria.\n\n" +

            "For each part, return JSON with this exact structure:\n" +
            '{\n  "parts": [\n    {\n' +
            '      "partLabel": "a",\n' +
            '      "reading": "LaTeX-formatted transcription of what the student wrote",\n' +
            '      "marks": [\n' +
            '        {"criterionIndex": 0, "awarded": true, "reason": "brief explanation with \\\\(LaTeX\\\\)"},\n' +
            '        {"criterionIndex": 1, "awarded": false, "reason": "brief explanation with \\\\(LaTeX\\\\)"}\n' +
            '      ],\n' +
            '      "totalAwarded": 3,\n' +
            '      "totalAvailable": 4,\n' +
            '      "errorLine": 2,\n' +
            '      "errorType": "execution",\n' +
            '      "skillDiagnosis": "1-2 sentence diagnosis with \\\\(LaTeX\\\\) for any math",\n' +
            '      "notationFeedback": {"correct": false, "message": "explanation with \\\\(LaTeX\\\\) for math parts"}\n' +
            '    }\n  ],\n' +
            '  "sympyChecks": [\n' +
            '    {\n' +
            '      "type": "derivative|indefinite_integral|definite_integral|follow_through|simplification|substitution",\n' +
            '      "partLabel": "a",\n' +
            '      "criterionIndex": 0,\n' +
            '      "original": "x**5 - 3*x**2",\n' +
            '      "student_answer": "5*x**4 - 6*x",\n' +
            '      "variable": "x",\n' +
            '      "lower": 0,\n' +
            '      "upper": 2\n' +
            '    }\n  ]\n}\n\n' +

            "CRITICAL RULES:\n\n" +

            "SYMPY VERIFICATION CHECKS:\n" +
            "Generate a 'sympyChecks' array with entries for each mathematically verifiable step. " +
            "Use Python/SymPy notation (** for power, * for multiply). Include partLabel and criterionIndex " +
            "so results can be matched to specific marking criteria. Types:\n" +
            "- 'derivative': {original, student_answer, variable} \u2014 checks d/dx(original) == student_answer\n" +
            "- 'indefinite_integral': {original, student_answer, variable} \u2014 checks antiderivative\n" +
            "- 'definite_integral': {original, student_answer, variable, lower, upper} \u2014 checks definite integral value\n" +
            "- 'follow_through': {student_expr, variable, lower, upper, student_result} \u2014 checks student's arithmetic is internally consistent\n" +
            "- 'simplification': {original, simplified} \u2014 checks algebraic equivalence\n" +
            "- 'substitution': {expression, variable, value, expected_result} \u2014 checks substitution result\n" +
            "Only include checks for steps where the student actually wrote mathematical expressions. " +
            "If the student wrote nothing or only text, omit sympyChecks or leave it empty.\n\n" +

            "ANTI-HALLUCINATION \u2014 DO NOT INVENT STUDENT WORK:\n" +
            "- You MUST mark ONLY what is visibly written on the canvas. " +
            "Do NOT assume, infer, or extrapolate mathematical knowledge beyond what is explicitly shown.\n" +
            "- If the student writes a single number, letter, or short expression that does not constitute " +
            "a valid mathematical attempt at the question, award 0 marks for ALL criteria.\n" +
            "- NEVER connect a coincidental number to a step in the solution.\n" +
            "- A correct final answer written alone with NO working earns ONLY the 'correct answer' criterion " +
            "(if one exists), NOT any method/process marks.\n" +
            "- If the student's answer is completely wrong, unrelated, or nonsense, award 0 marks for ALL criteria.\n" +
            "- When in doubt, err on the side of NOT awarding marks.\n\n" +

            "HANDWRITING READING \u2014 READ WHAT IS ACTUALLY WRITTEN:\n" +
            "- Your 'reading' field MUST accurately transcribe what the student wrote, NOT the correct answer.\n" +
            "- Pay close attention to exponents and superscripts.\n" +
            "- Read each symbol as written. Only interpret genuinely ambiguous symbols generously.\n" +
            "- FORMATTING: Wrap all math in LaTeX delimiters \\\\( and \\\\). " +
            "Applies to reading, reason, skillDiagnosis, and notationFeedback.message.\n\n" +

            "MARK TYPES AND DEPENDENCIES:\n" +
            "Each criterion may have a type: M (Method), A (Accuracy), or B (Independent). Default is M.\n" +
            "- M (Method): Awarded for correct method/process, even if arithmetic result is wrong.\n" +
            "- A (Accuracy): Awarded for correct results. NEVER award A if prerequisite M was not awarded (no M0 A1). " +
            "Check deps list \u2014 ALL dependencies must be awarded first.\n" +
            "- B (Independent): Standalone, no dependencies.\n\n" +

            "FOLLOW-THROUGH MARKING:\n" +
            "ONE ERROR = ONE PENALTY. A student should only lose marks where they actually made a mistake.\n\n" +

            "WITHIN A PART: If a student makes an error at one step and consistently carries their wrong value " +
            "through subsequent steps using correct method, penalise ONLY at the error step. " +
            "Award subsequent M marks if the process is correct. " +
            "Award subsequent A marks if correct relative to their wrong value \u2014 UNLESS flagged CAO.\n\n" +

            "ACROSS PARTS: If a student gets an earlier part wrong but correctly uses their wrong answer " +
            "in a later part, the wrong answer BECOMES 'correct' for subsequent parts. " +
            "Award all M and A marks \u2014 UNLESS flagged CAO.\n\n" +

            "UNREALISTIC FT RESULTS: If follow-through produces physically impossible or " +
            "mathematically invalid results, withhold the FINAL accuracy mark. Still award method marks.\n\n" +

            "CAO \u2014 CORRECT ANSWER ONLY: If flagged CAO, ONLY award if answer exactly matches. No FT.\n\n" +

            "ISW \u2014 IGNORE SUBSEQUENT WORKING: Once correct answer shown, ignore further incorrect working. " +
            "Does NOT apply if subsequent working changes the final answer to something wrong.\n\n" +

            "MR \u2014 MISREAD RULE: If student misread a value but applied correct method throughout: " +
            "award ALL M and A marks, then deduct 1 mark. Set errorType to 'misread'.\n\n" +

            "MULTIPLE ATTEMPTS: Mark the method leading to the final stated answer. " +
            "If no final answer indicated, mark the last complete attempt. " +
            "Crossed-out but legible work: mark if no replacement exists.\n\n" +

            "TRANSCRIPTION ERRORS: If working shows correct value but copied incorrectly to final answer, " +
            "award marks based on the WORKING.\n\n" +

            "ACCURACY CONVENTIONS: Accept equivalent forms unless criterion specifies a form. " +
            "Enforce sig figs/dp ONLY when explicitly required. " +
            "Probability: accept fraction, decimal, or percentage. Units: enforce only if required.\n\n" +

            "NOTATION CHECK (does NOT affect marks): " +
            "notationFeedback is REQUIRED for every part. " +
            "Check variable names match the question, proper LHS, +C on indefinite integrals. Advisory only.\n\n" +

            "COMBINED STEPS: If a criterion is clearly demonstrated within another step, AWARD it. " +
            "But if marking key awards SEPARATE marks for method steps, student MUST show both explicitly. " +
            "PRINCIPLE: process criteria need visible demonstration; knowledge criteria can be implicit.\n\n" +

            "AWARD POSITIVELY: Credit valid work wherever it appears. Accept any valid method unless specified. " +
            "Do not penalise the same error twice. Whole marks only.\n\n" +

            "OTHER: errorLine is 1-indexed. errorType is setup/execution/interpretation/misread/null. JSON only, no markdown.";
    },

    // ---- SYMPY VERIFICATION ----

    /**
     * Call the SymPy cloud function to verify AI marking.
     * Returns a promise that resolves with verification data, or null on failure.
     * Graceful fallback: if endpoint is not configured or fails, returns null silently.
     */
    _runSympyVerification: function(aiResult) {
        var endpoint = WrittenMode.getSympyEndpoint();
        if (!endpoint) return Promise.resolve(null);

        var checks = aiResult.sympyChecks;
        if (!checks || !Array.isArray(checks) || checks.length === 0) {
            return Promise.resolve(null);
        }

        return fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ checks: checks })
        })
        .then(function(resp) {
            if (!resp.ok) return null;
            return resp.json();
        })
        .then(function(data) {
            if (!data || !data.verification_results) return null;
            return WrittenMode._mergeSympyResults(aiResult, data.verification_results);
        })
        .catch(function(err) {
            console.warn("SymPy verification unavailable:", err.message);
            return null;
        });
    },

    /**
     * Merge SymPy verification results into the AI marking result.
     * Adds a `sympyVerified` field to each marking criterion.
     * Returns a verification summary object.
     */
    _mergeSympyResults: function(aiResult, verificationResults) {
        var summary = {
            totalChecks: verificationResults.length,
            agreements: 0,
            disagreements: 0,
            inconclusive: 0,
            perCriterion: {} // keyed by "partLabel-criterionIndex"
        };

        verificationResults.forEach(function(v) {
            var key = (v.partLabel || "?") + "-" + (v.criterionIndex !== undefined ? v.criterionIndex : "?");

            if (v.correct === null || v.correct === undefined) {
                summary.inconclusive++;
                summary.perCriterion[key] = { status: "inconclusive", details: v.details || "" };
            } else if (v.correct === true || v.match === true) {
                summary.agreements++;
                summary.perCriterion[key] = { status: "verified", details: v.details || "" };
            } else {
                summary.disagreements++;
                summary.perCriterion[key] = { status: "disagree", details: v.details || "" };
            }
        });

        return summary;
    },

    // ---- INIT ----

    init: function() {
        // Notation dismiss button
        var dismissBtn = document.getElementById("wm-notation-dismiss");
        if (dismissBtn) {
            dismissBtn.addEventListener("click", function() {
                WrittenMode.dismissNotation();
            });
        }

        // If teacher hasn't provided an API key, disable Stylus toggles
        if (!WrittenMode.hasMarkingAPI()) {
            var stylusButtons = document.querySelectorAll('.config-toggle[data-value="stylus"]');
            stylusButtons.forEach(function(btn) {
                btn.disabled = true;
                btn.title = "Your teacher has not enabled Written Mode for this class";
            });
        }
    },
};


// ============================================================================
// EXAM MODE MODULE
// Handles timed exam simulation: global timer, question navigation without
// feedback, canvas snapshot storage, batch marking, and results display.
// Works with both Stylus and Paper answer methods.
// ============================================================================
var ExamMode = {
    // State
    active: false,
    state: "inactive",  // "inactive" | "running" | "marking" | "results"

    // Exam config
    targetMarks: 50,
    totalSeconds: 0,
    remainingSeconds: 0,
    timerInterval: null,

    // Question tracking
    testAnswers: [],       // Array of { questionIndex, questionData, filename, partImages, timeSpent }
    questionStartTime: null,
    currentExamIndex: 0,   // 0-based index of current question in this exam
    totalExamQuestions: 0,  // filled as we go (we don't know total upfront)
    accumulatedMarks: 0,   // running total of marks queued

    // ---- TIME CALCULATION ----

    /**
     * Calculate exam time in seconds from total marks.
     * Formula: 20s base + 35s per mark (calculation), 25s base + 50s per mark (context).
     * Uses a blended average: 22s base + 40s per mark.
     */
    calcTime: function(totalMarks) {
        return Math.round(22 + 40 * totalMarks);
    },

    /**
     * Format seconds as mm:ss.
     */
    formatTime: function(secs) {
        var m = Math.floor(Math.abs(secs) / 60);
        var s = Math.abs(secs) % 60;
        var prefix = secs < 0 ? "+" : "";
        return prefix + m + ":" + (s < 10 ? "0" : "") + s;
    },

    // ---- EXAM LIFECYCLE ----

    /**
     * Start an exam. Called after SessionEngine.start() completes.
     * @param {number} targetMarks - total mark target for this exam
     */
    start: function(targetMarks) {
        ExamMode.active = true;
        ExamMode.state = "running";
        ExamMode.targetMarks = targetMarks;
        ExamMode.totalSeconds = ExamMode.calcTime(targetMarks);
        ExamMode.remainingSeconds = ExamMode.totalSeconds;
        ExamMode.testAnswers = [];
        ExamMode.currentExamIndex = 0;
        ExamMode.totalExamQuestions = 0;
        ExamMode.accumulatedMarks = 0;
        ExamMode.questionStartTime = Date.now();

        // Start the global countdown timer
        ExamMode.startTimer();
    },

    /**
     * Start (or restart) the global exam countdown timer.
     */
    startTimer: function() {
        if (ExamMode.timerInterval) clearInterval(ExamMode.timerInterval);

        ExamMode.timerInterval = setInterval(function() {
            ExamMode.remainingSeconds--;
            ExamMode.updateTimerDisplay();

            if (ExamMode.remainingSeconds <= 0) {
                ExamMode.timeUp();
            }
        }, 1000);
    },

    /**
     * Update the exam timer display in the bottom bar.
     */
    updateTimerDisplay: function() {
        var display = document.getElementById("exam-timer-display");
        if (!display) return;

        display.textContent = ExamMode.formatTime(ExamMode.remainingSeconds);

        var bar = document.getElementById("exam-bottom-bar");
        if (!bar) return;

        // Warning colours
        if (ExamMode.remainingSeconds <= 60) {
            bar.className = "exam-bottom-bar exam-timer-critical";
        } else if (ExamMode.remainingSeconds <= 300) {
            bar.className = "exam-bottom-bar exam-timer-warning";
        } else {
            bar.className = "exam-bottom-bar";
        }
    },

    /**
     * Handle timer reaching zero.
     */
    timeUp: function() {
        clearInterval(ExamMode.timerInterval);
        ExamMode.timerInterval = null;

        // Show Time's Up overlay briefly
        var overlay = document.getElementById("exam-times-up-overlay");
        if (overlay) overlay.style.display = "flex";

        // Snapshot current question if stylus
        ExamMode.snapshotCurrentQuestion();

        // After a brief delay, begin marking
        setTimeout(function() {
            if (overlay) overlay.style.display = "none";
            ExamMode.endTest();
        }, 2000);
    },

    /**
     * Snapshot the current question's canvas images (stylus mode) and store.
     */
    snapshotCurrentQuestion: function() {
        var q = StudyUI.currentQuestion;
        var fn = StudyUI.currentFilename;
        if (!q) return;

        var partImages = {};
        var timeSpent = (Date.now() - ExamMode.questionStartTime) / 1000;

        if (SessionEngine.answerMethod === "stylus" && q.parts) {
            q.parts.forEach(function(part) {
                var dataUrl = WrittenMode.CanvasEngine.exportPNG(part.partLabel);
                if (dataUrl) {
                    partImages[part.partLabel] = dataUrl;
                }
            });
        }

        ExamMode.testAnswers.push({
            questionIndex: ExamMode.currentExamIndex,
            questionData: q,
            filename: fn,
            partImages: partImages,
            timeSpent: Math.round(timeSpent),
            totalMarks: q.totalMarks || 0
        });
    },

    /**
     * Move to the next question in exam mode.
     * Snapshots current canvas, clears, loads next question.
     */
    nextQuestion: function() {
        // Snapshot current question
        ExamMode.snapshotCurrentQuestion();
        ExamMode.currentExamIndex++;
        ExamMode.questionStartTime = Date.now();

        // Check if we've accumulated enough marks
        var totalMarksSoFar = 0;
        ExamMode.testAnswers.forEach(function(ta) {
            totalMarksSoFar += ta.totalMarks;
        });
        ExamMode.accumulatedMarks = totalMarksSoFar;

        if (totalMarksSoFar >= ExamMode.targetMarks) {
            // We have enough marks, show "exam complete" option
            ExamMode._loadNextOrFinish();
            return;
        }

        // Load next question through normal SessionEngine
        SessionEngine.getNext().then(function(result) {
            if (!result) {
                // No more questions available
                ExamMode.endTest();
                return;
            }
            ExamMode.totalExamQuestions = ExamMode.currentExamIndex + 1;
            StudyUI.renderQuestion(result);
            window.scrollTo(0, 0);
        });
    },

    /**
     * When enough marks are accumulated, offer to end or continue.
     */
    _loadNextOrFinish: function() {
        // Load one more question but make it clear the target is reached
        SessionEngine.getNext().then(function(result) {
            if (!result) {
                ExamMode.endTest();
                return;
            }
            ExamMode.totalExamQuestions = ExamMode.currentExamIndex + 1;
            StudyUI.renderQuestion(result);
            window.scrollTo(0, 0);
        });
    },

    /**
     * End the exam test. Triggered by "End Test" button or timer expiry.
     */
    endTest: function() {
        if (ExamMode.state !== "running") return;

        clearInterval(ExamMode.timerInterval);
        ExamMode.timerInterval = null;
        ExamMode.state = "marking";

        // Hide question area
        var questionArea = document.getElementById("question-area");
        if (questionArea) questionArea.style.display = "none";

        // Begin marking
        if (SessionEngine.answerMethod === "stylus") {
            ExamMode.batchMarkStylus();
        } else {
            ExamMode.batchSelfAssessPaper();
        }
    },

    // ---- BATCH MARKING (STYLUS) ----

    /**
     * Mark all exam questions sequentially via the AI API.
     * Shows progress as each question is marked.
     */
    batchMarkStylus: function() {
        var markingScreen = document.getElementById("exam-marking-screen");
        if (!markingScreen) return;
        markingScreen.style.display = "block";

        var total = ExamMode.testAnswers.length;
        var html = '<div class="exam-marking-progress">';
        html += '<h2>\u2699\uFE0F Marking Your Test</h2>';
        html += '<div class="exam-marking-status" id="exam-marking-status">';
        html += 'Marking question 1 of ' + total + '...</div>';
        html += '<div class="exam-marking-bar-container">';
        html += '<div class="exam-marking-bar" id="exam-marking-bar" style="width:0%"></div>';
        html += '</div>';
        html += '<div class="exam-marking-log" id="exam-marking-log"></div>';
        html += '</div>';
        markingScreen.innerHTML = html;

        // Process questions sequentially with delay
        var results = [];
        var current = 0;

        function markNext() {
            if (current >= total) {
                ExamMode.showExamResults(results);
                return;
            }

            var answer = ExamMode.testAnswers[current];
            var statusEl = document.getElementById("exam-marking-status");
            var barEl = document.getElementById("exam-marking-bar");
            var logEl = document.getElementById("exam-marking-log");

            if (statusEl) statusEl.textContent = "Marking question " + (current + 1) + " of " + total + "...";
            if (barEl) barEl.style.width = Math.round(((current) / total) * 100) + "%";

            // Check if any parts actually have canvas content
            var hasContent = Object.keys(answer.partImages).length > 0;
            if (!hasContent) {
                // No canvas content - treat as unanswered
                results.push({
                    answer: answer,
                    aiResult: null,
                    skipped: true
                });
                if (logEl) {
                    logEl.innerHTML += '<div class="exam-mark-log-item skipped">\u23ED Q' +
                        (current + 1) + ': Skipped (no answer written)</div>';
                }
                current++;
                setTimeout(markNext, 200);
                return;
            }

            ExamMode._markSingleQuestion(answer).then(function(aiResult) {
                // Run SymPy verification (non-blocking, graceful)
                WrittenMode._runSympyVerification(aiResult).then(function(sympyData) {
                    results.push({
                        answer: answer,
                        aiResult: aiResult,
                        sympyData: sympyData,
                        skipped: false
                    });

                    // Log success
                    var earned = 0;
                    var avail = 0;
                    if (aiResult && aiResult.parts) {
                        aiResult.parts.forEach(function(p) {
                            earned += p.totalAwarded;
                            avail += p.totalAvailable;
                        });
                    }
                    var verifyNote = sympyData ? " \u2713" : "";
                    if (logEl) {
                        logEl.innerHTML += '<div class="exam-mark-log-item done">\u2705 Q' +
                            (current + 1) + ': ' + earned + '/' + avail + ' marks' + verifyNote + '</div>';
                    }

                    if (barEl) barEl.style.width = Math.round(((current + 1) / total) * 100) + "%";
                    current++;
                    setTimeout(markNext, 1500); // Rate limit: 1.5s between calls
                });
            }).catch(function(err) {
                results.push({
                    answer: answer,
                    aiResult: null,
                    error: err.message,
                    skipped: false
                });
                if (logEl) {
                    logEl.innerHTML += '<div class="exam-mark-log-item error">\u274C Q' +
                        (current + 1) + ': Marking failed \u2014 ' +
                        err.message.substring(0, 60) + '</div>';
                }
                current++;
                setTimeout(markNext, 1000);
            });
        }

        markNext();
    },

    /**
     * Call the AI to mark a single question's canvas images.
     * @param {Object} answer - from testAnswers array
     * @returns {Promise<Object>} - AI marking result
     */
    _markSingleQuestion: function(answer) {
        if (!WrittenMode.hasMarkingAPI()) return Promise.reject(new Error("No marking API configured"));

        var q = answer.questionData;
        var contentBlocks = [];
        var systemPrompt = WrittenMode.buildSystemPrompt();

        q.parts.forEach(function(part) {
            var partInfo = "Part (" + part.partLabel + ") \u2014 " + part.partMarks + " marks\n" +
                "Question: " + part.questionText + "\n\n" +
                "Marking criteria:\n";

            if (part.marking) {
                part.marking.forEach(function(m, mi) {
                    var line = (mi + 1) + ". " + m.text + " [" + m.awarded + " mark(s)]";
                    if (m.type) line += " {type:" + m.type + "}";
                    if (m.deps && m.deps.length) line += " {deps:" + m.deps.join(",") + "}";
                    if (m.cao) line += " {CAO}";
                    if (m.isw) line += " {ISW}";
                    if (m.ft === false) line += " {no-FT}";
                    if (m.accuracy) line += " {accuracy:" + JSON.stringify(m.accuracy) + "}";
                    partInfo += line + "\n";
                });
            }

            if (part.originalSolution) {
                partInfo += "\nWorked solution for reference:\n";
                part.originalSolution.forEach(function(sol, si) {
                    partInfo += (si + 1) + ". " + sol.text + "\n";
                });
            }

            partInfo += "\nBelow is the student's handwritten answer for this part:";
            contentBlocks.push({ type: "text", text: partInfo });

            var dataUrl = answer.partImages[part.partLabel];
            if (dataUrl) {
                var base64 = dataUrl.split(",")[1];
                contentBlocks.push({
                    type: "image",
                    source: { type: "base64", media_type: "image/png", data: base64 }
                });
            } else {
                contentBlocks.push({ type: "text", text: "[No handwritten answer provided for this part]" });
            }
        });

        contentBlocks.push({
            type: "text",
            text: "Mark all parts. IMPORTANT: First read ALL parts' handwriting. " +
                  "Then mark each part. For multi-part questions, apply FOLLOW-THROUGH MARKING: " +
                  "if the student got an earlier part wrong but correctly used their wrong answer " +
                  "in later parts, award ALL marks in those later parts. The error is penalised " +
                  "ONLY in the part where it occurred. Respond with JSON only."
        });

        return WrittenMode._callClaudeAPI(systemPrompt, contentBlocks)
        .then(function(resp) {
            if (!resp.ok) {
                return resp.json().then(function(data) {
                    throw new Error(data.error ? data.error.message : "API error " + resp.status);
                });
            }
            return resp.json();
        })
        .then(function(data) {
            var text = "";
            if (data.content) {
                data.content.forEach(function(block) {
                    if (block.type === "text") text += block.text;
                });
            }
            var cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
            return JSON.parse(cleaned);
        });
    },

    // ---- BATCH SELF-ASSESS (PAPER) ----

    /**
     * For Paper + Exam Mode: show all questions with solutions for batch self-assessment.
     * Student marks each question after the test ends.
     */
    batchSelfAssessPaper: function() {
        var resultsScreen = document.getElementById("exam-results-screen");
        if (!resultsScreen) return;
        resultsScreen.style.display = "block";

        var total = ExamMode.testAnswers.length;
        var timeUsed = ExamMode.totalSeconds - ExamMode.remainingSeconds;

        var html = '<div class="exam-results">';
        html += '<div class="exam-results-header">';
        html += '<h2>\uD83D\uDCCB Exam Review</h2>';
        html += '<div class="exam-results-summary">';
        html += '<span>' + total + ' questions</span>';
        html += '<span>\u23F1 ' + ExamMode.formatTime(timeUsed) + ' used</span>';
        html += '</div></div>';
        html += '<p class="exam-paper-instructions">Review each question below. ' +
            'Check the solution and mark each criterion honestly.</p>';

        // For each question, show the question + solution with self-assessment
        ExamMode.testAnswers.forEach(function(answer, qIdx) {
            var q = answer.questionData;
            html += '<div class="exam-result-question" data-exam-q="' + qIdx + '">';
            html += '<div class="exam-result-q-header">';
            html += '<h3>Question ' + (qIdx + 1) + ' \u2014 ' +
                (q.questionReference || answer.filename) + '</h3>';
            html += '<span class="badge badge-marks">' + (q.totalMarks || 0) + ' marks</span>';
            html += '</div>';

            // Show question text briefly
            if (q.questionStimulus) {
                html += '<div class="question-stimulus">' +
                    StudyUI._escapeHtml(q.questionStimulus) + '</div>';
            }

            // For each part: show solution + self-assessment checkboxes
            if (q.parts) {
                q.parts.forEach(function(part, pIdx) {
                    html += '<div class="exam-paper-part" data-exam-q="' + qIdx +
                        '" data-exam-p="' + pIdx + '">';
                    html += '<div class="part-header"><span class="part-label">(' +
                        StudyUI._escapeHtml(part.partLabel) + ')</span>';
                    html += '<span class="part-marks">[' + part.partMarks + ' mark' +
                        (part.partMarks !== 1 ? "s" : "") + ']</span></div>';
                    html += '<div class="part-text">' +
                        StudyUI._escapeHtml(part.questionText) + '</div>';

                    // Solution
                    if (part.originalSolution && part.originalSolution.length > 0) {
                        html += '<div class="solution-steps">';
                        part.originalSolution.forEach(function(sol) {
                            html += '<div class="solution-line">' +
                                StudyUI._renderSolutionText(sol.text) + '</div>';
                        });
                        html += '</div>';
                    }

                    // Self-assessment checkboxes for each marking criterion
                    if (part.marking && part.marking.length > 0) {
                        html += '<div class="exam-paper-criteria">';
                        part.marking.forEach(function(m, mIdx) {
                            var cbId = "exam-cb-" + qIdx + "-" + pIdx + "-" + mIdx;
                            html += '<label class="exam-criterion-label">';
                            html += '<input type="checkbox" id="' + cbId +
                                '" class="exam-criterion-cb" data-q="' + qIdx +
                                '" data-p="' + pIdx + '" data-m="' + mIdx + '"> ';
                            html += StudyUI._escapeHtml(m.text);
                            html += '</label>';
                        });
                        html += '</div>';
                    }

                    html += '</div>'; // .exam-paper-part
                });
            }

            html += '</div>'; // .exam-result-question
        });

        html += '<div class="exam-paper-submit">';
        html += '<button class="btn btn-primary btn-large" id="exam-paper-submit-btn">' +
            '\u2713 Submit Self-Assessment</button>';
        html += '</div>';
        html += '</div>'; // .exam-results

        resultsScreen.innerHTML = html;

        // Bind submit button
        var submitBtn = document.getElementById("exam-paper-submit-btn");
        if (submitBtn) {
            submitBtn.addEventListener("click", function() {
                ExamMode.submitPaperAssessment();
            });
        }

        UI.renderMath(resultsScreen);
    },

    /**
     * Collect paper self-assessment results and record them.
     */
    submitPaperAssessment: function() {
        var allResults = [];

        ExamMode.testAnswers.forEach(function(answer, qIdx) {
            var q = answer.questionData;
            var partResults = {};

            if (q.parts) {
                q.parts.forEach(function(part, pIdx) {
                    var totalCriteria = (part.marking || []).length;
                    var metCount = 0;
                    var failedCriteria = [];

                    (part.marking || []).forEach(function(m, mIdx) {
                        var cb = document.getElementById("exam-cb-" + qIdx + "-" + pIdx + "-" + mIdx);
                        if (cb && cb.checked) {
                            metCount++;
                        } else {
                            failedCriteria.push(mIdx);
                        }
                    });

                    var earned = 0;
                    (part.marking || []).forEach(function(m, mIdx) {
                        var cb = document.getElementById("exam-cb-" + qIdx + "-" + pIdx + "-" + mIdx);
                        if (cb && cb.checked) earned += (m.awarded || 1);
                    });

                    var isCorrect = (failedCriteria.length === 0);

                    partResults[part.partLabel] = {
                        correct: isCorrect,
                        correctButUnsure: false,
                        errorAtLine: isCorrect ? null : 1,
                        markingCriteriaFailed: failedCriteria,
                        marksEarned: earned,
                        marksAvailable: part.partMarks || 0,
                        answerMethod: "paper",
                        errorType: isCorrect ? null : "execution"
                    };
                });
            }

            allResults.push({
                answer: answer,
                partResults: partResults
            });
        });

        // Record all results to mastery system
        ExamMode._recordAllResults(allResults);
    },

    // ---- EXAM RESULTS SCREEN (STYLUS) ----

    /**
     * Show the full exam results screen after batch marking.
     * @param {Array} results - array of { answer, aiResult, skipped, error }
     */
    showExamResults: function(results) {
        var markingScreen = document.getElementById("exam-marking-screen");
        if (markingScreen) markingScreen.style.display = "none";

        var resultsScreen = document.getElementById("exam-results-screen");
        if (!resultsScreen) return;
        resultsScreen.style.display = "block";
        ExamMode.state = "results";

        // Calculate totals
        var totalEarned = 0;
        var totalAvailable = 0;
        var questionsMarked = 0;
        var questionsFailed = 0;
        var questionsSkipped = 0;

        results.forEach(function(r) {
            if (r.skipped) {
                questionsSkipped++;
                totalAvailable += r.answer.totalMarks || 0;
            } else if (r.aiResult && r.aiResult.parts) {
                questionsMarked++;
                r.aiResult.parts.forEach(function(p) {
                    totalEarned += p.totalAwarded;
                    totalAvailable += p.totalAvailable;
                });
            } else {
                questionsFailed++;
                totalAvailable += r.answer.totalMarks || 0;
            }
        });

        var timeUsed = ExamMode.totalSeconds - Math.max(0, ExamMode.remainingSeconds);
        var pct = totalAvailable > 0 ? Math.round((totalEarned / totalAvailable) * 100) : 0;

        var html = '<div class="exam-results">';

        // Summary header
        html += '<div class="exam-results-header">';
        html += '<h2>\uD83D\uDCCA Exam Results</h2>';
        html += '<div class="exam-score-big">';
        html += '<span class="exam-score-earned">' + totalEarned + '</span>';
        html += '<span class="exam-score-slash"> / </span>';
        html += '<span class="exam-score-total">' + totalAvailable + '</span>';
        html += '<span class="exam-score-pct"> (' + pct + '%)</span>';
        html += '</div>';
        html += '<div class="exam-results-summary">';
        html += '<span>\u23F1 Time used: ' + ExamMode.formatTime(timeUsed) + ' of ' +
            ExamMode.formatTime(ExamMode.totalSeconds) + '</span>';
        html += '<span>' + questionsMarked + ' marked';
        if (questionsSkipped > 0) html += ', ' + questionsSkipped + ' skipped';
        if (questionsFailed > 0) html += ', ' + questionsFailed + ' failed';
        html += '</span></div>';
        html += '</div>';

        // Per-question results
        results.forEach(function(r, qIdx) {
            var q = r.answer.questionData;
            html += '<div class="exam-result-question">';
            html += '<div class="exam-result-q-header">';
            html += '<h3>Question ' + (qIdx + 1) + ' \u2014 ' +
                (q.questionReference || r.answer.filename) + '</h3>';

            if (r.skipped) {
                html += '<span class="exam-q-score skipped">\u23ED Skipped</span>';
            } else if (r.aiResult) {
                var qEarned = 0;
                var qAvail = 0;
                r.aiResult.parts.forEach(function(p) {
                    qEarned += p.totalAwarded;
                    qAvail += p.totalAvailable;
                });
                var scoreClass = qEarned === qAvail ? "full" : qEarned > 0 ? "partial" : "zero";
                html += '<span class="exam-q-score ' + scoreClass + '">' +
                    qEarned + '/' + qAvail + '</span>';
            } else {
                html += '<span class="exam-q-score error">\u274C Failed</span>';
            }

            html += '</div>';

            // If AI result available, show per-part details
            if (r.aiResult && r.aiResult.parts) {
                r.aiResult.parts.forEach(function(partResult, pIdx) {
                    var questionPart = q.parts[pIdx];
                    if (!questionPart) return;

                    html += '<div class="exam-result-part">';
                    html += '<div class="exam-result-part-header">';
                    html += '<span>(' + StudyUI._escapeHtml(questionPart.partLabel) + ')</span>';
                    var prScoreClass = partResult.totalAwarded === partResult.totalAvailable ?
                        "full" : partResult.totalAwarded > 0 ? "partial" : "zero";
                    html += '<span class="exam-part-score ' + prScoreClass + '">' +
                        partResult.totalAwarded + '/' + partResult.totalAvailable + '</span>';
                    html += '</div>';

                    // Side-by-side: canvas snapshot + worked solution
                    html += '<div class="exam-result-compare">';

                    // Student's answer (canvas snapshot)
                    var imgUrl = r.answer.partImages[questionPart.partLabel];
                    if (imgUrl) {
                        html += '<div class="exam-student-answer">';
                        html += '<div class="exam-compare-label">Your Answer</div>';
                        html += '<img src="' + imgUrl + '" class="exam-canvas-snapshot" ' +
                            'alt="Your handwritten answer">';
                        html += '</div>';
                    }

                    // Worked solution
                    if (questionPart.originalSolution && questionPart.originalSolution.length > 0) {
                        html += '<div class="exam-worked-solution">';
                        html += '<div class="exam-compare-label">Worked Solution</div>';
                        questionPart.originalSolution.forEach(function(sol, si) {
                            var lineClass = "exam-sol-line";
                            // Colour-code based on error location
                            if (partResult.errorLine !== null && partResult.errorLine !== undefined) {
                                if (si + 1 < partResult.errorLine) lineClass += " correct";
                                else if (si + 1 === partResult.errorLine) lineClass += " error-here";
                            } else {
                                lineClass += " correct";
                            }
                            html += '<div class="' + lineClass + '">' +
                                (si + 1) + '. ' + StudyUI._renderSolutionText(sol.text) + '</div>';
                        });
                        html += '</div>';
                    }

                    html += '</div>'; // .exam-result-compare

                    // Marking criteria
                    if (partResult.marks && partResult.marks.length > 0) {
                        html += '<div class="exam-criteria-list">';
                        partResult.marks.forEach(function(mark) {
                            var cls = mark.awarded ? "met" : "not-met";
                            // SymPy verification badge for exam mode
                            var examVerifyBadge = "";
                            if (r.sympyData && r.sympyData.perCriterion) {
                                var evKey = questionPart.partLabel + "-" + mark.criterionIndex;
                                var evResult = r.sympyData.perCriterion[evKey];
                                if (evResult) {
                                    if (evResult.status === "verified") {
                                        examVerifyBadge = ' <span class="wm-sympy-badge verified" title="' +
                                            StudyUI._escapeHtml(evResult.details) + '">\u2713 verified</span>';
                                    } else if (evResult.status === "disagree") {
                                        examVerifyBadge = ' <span class="wm-sympy-badge disagree" title="' +
                                            StudyUI._escapeHtml(evResult.details) + '">\u26A0\uFE0F check</span>';
                                    }
                                }
                            }
                            html += '<div class="exam-criterion ' + cls + '">';
                            html += '<span class="exam-criterion-icon">' +
                                (mark.awarded ? "\u2713" : "\u2717") + '</span> ';
                            html += StudyUI._escapeHtml(mark.text) + examVerifyBadge;
                            html += '</div>';
                        });
                        html += '</div>';
                    }

                    // Error diagnosis
                    if (partResult.errorDiagnosis) {
                        html += '<div class="exam-error-diagnosis">';
                        html += '<strong>\u26A0\uFE0F Error:</strong> ' +
                            StudyUI._escapeHtml(partResult.errorDiagnosis);
                        html += '</div>';
                    }

                    html += '</div>'; // .exam-result-part
                });
            }

            html += '</div>'; // .exam-result-question
        });

        // Finish button
        html += '<div class="exam-results-footer">';
        html += '<button class="btn btn-primary btn-large" id="exam-finish-btn">' +
            'Done \u2014 Return to Study</button>';
        html += '</div>';
        html += '</div>'; // .exam-results

        resultsScreen.innerHTML = html;
        UI.renderMath(resultsScreen);

        // Bind finish button
        var finishBtn = document.getElementById("exam-finish-btn");
        if (finishBtn) {
            finishBtn.addEventListener("click", function() {
                ExamMode.finish();
            });
        }

        // Record all results to mastery system
        ExamMode._recordStylusResults(results);
    },

    // ---- RECORDING RESULTS ----

    /**
     * Record stylus exam results into the mastery system.
     */
    _recordStylusResults: function(results) {
        var chain = Promise.resolve();

        results.forEach(function(r) {
            if (r.skipped || !r.aiResult || !r.aiResult.parts) return;

            var q = r.answer.questionData;
            var fn = r.answer.filename;
            var partResults = {};

            q.parts.forEach(function(part, idx) {
                var partResult = r.aiResult.parts[idx];
                if (!partResult) return;

                var totalMarks = part.partMarks || 0;
                var earned = partResult.totalAwarded || 0;
                var isCorrect = (earned === totalMarks);

                var failedCriteria = [];
                if (partResult.marks) {
                    partResult.marks.forEach(function(mark) {
                        if (!mark.awarded && mark.criterionIndex !== undefined) {
                            failedCriteria.push(mark.criterionIndex);
                        }
                    });
                }

                partResults[part.partLabel] = {
                    correct: isCorrect,
                    correctButUnsure: false,
                    errorAtLine: isCorrect ? null : (partResult.errorLine || 1),
                    markingCriteriaFailed: failedCriteria,
                    marksEarned: earned,
                    marksAvailable: totalMarks,
                    answerMethod: "stylus",
                    errorType: isCorrect ? null : (partResult.errorType || "execution")
                };
            });

            chain = chain.then(function() {
                return SessionEngine.recordResults(fn, partResults);
            });
        });

        return chain;
    },

    /**
     * Record paper exam results (from batch self-assessment).
     */
    _recordAllResults: function(allResults) {
        var chain = Promise.resolve();

        allResults.forEach(function(r) {
            chain = chain.then(function() {
                return SessionEngine.recordResults(r.answer.filename, r.partResults);
            });
        });

        chain.then(function() {
            // Show summary after recording
            ExamMode._showPaperSummary(allResults);
        });
    },

    /**
     * Show a summary screen after paper self-assessment submission.
     */
    _showPaperSummary: function(allResults) {
        var resultsScreen = document.getElementById("exam-results-screen");
        if (!resultsScreen) return;

        var totalEarned = 0;
        var totalAvail = 0;
        allResults.forEach(function(r) {
            Object.keys(r.partResults).forEach(function(key) {
                totalEarned += r.partResults[key].marksEarned || 0;
                totalAvail += r.partResults[key].marksAvailable || 0;
            });
        });

        var pct = totalAvail > 0 ? Math.round((totalEarned / totalAvail) * 100) : 0;
        var timeUsed = ExamMode.totalSeconds - Math.max(0, ExamMode.remainingSeconds);

        var html = '<div class="exam-results">';
        html += '<div class="exam-results-header">';
        html += '<h2>\u2705 Self-Assessment Complete</h2>';
        html += '<div class="exam-score-big">';
        html += '<span class="exam-score-earned">' + totalEarned + '</span>';
        html += '<span class="exam-score-slash"> / </span>';
        html += '<span class="exam-score-total">' + totalAvail + '</span>';
        html += '<span class="exam-score-pct"> (' + pct + '%)</span>';
        html += '</div>';
        html += '<div class="exam-results-summary">';
        html += '<span>\u23F1 Time used: ' + ExamMode.formatTime(timeUsed) + '</span>';
        html += '<span>' + allResults.length + ' questions assessed</span>';
        html += '</div></div>';
        html += '<div class="exam-results-footer">';
        html += '<button class="btn btn-primary btn-large" id="exam-finish-btn">' +
            'Done \u2014 Return to Study</button>';
        html += '</div></div>';

        resultsScreen.innerHTML = html;

        var finishBtn = document.getElementById("exam-finish-btn");
        if (finishBtn) {
            finishBtn.addEventListener("click", function() {
                ExamMode.finish();
            });
        }
    },

    /**
     * Finish the exam and return to the study start screen.
     */
    finish: function() {
        ExamMode.active = false;
        ExamMode.state = "inactive";
        ExamMode.testAnswers = [];

        if (ExamMode.timerInterval) {
            clearInterval(ExamMode.timerInterval);
            ExamMode.timerInterval = null;
        }

        // Hide results/marking screens
        var markingScreen = document.getElementById("exam-marking-screen");
        if (markingScreen) markingScreen.style.display = "none";
        var resultsScreen = document.getElementById("exam-results-screen");
        if (resultsScreen) resultsScreen.style.display = "none";

        // End the session and show summary
        SessionEngine.active = false;
        StudyUI.showSessionSummary();
    },

    // ---- RENDER HELPERS ----

    /**
     * Render the exam-mode bottom bar (replaces the normal mark bar / solution prompt).
     * @returns {string} HTML string
     */
    renderBottomBar: function() {
        var total = ExamMode.testAnswers.length + 1; // +1 for current question
        var html = '<div class="exam-bottom-bar" id="exam-bottom-bar">';
        html += '<div class="exam-bar-inner">';
        html += '<div class="exam-timer">';
        html += '<span class="exam-timer-icon">\u23F0</span>';
        html += '<span class="exam-timer-display" id="exam-timer-display">' +
            ExamMode.formatTime(ExamMode.remainingSeconds) + '</span>';
        html += '</div>';
        html += '<div class="exam-q-counter" id="exam-q-counter">Q ' + total + '</div>';
        html += '<div class="exam-bar-buttons">';
        html += '<button class="btn btn-primary exam-next-btn" id="exam-next-btn">' +
            'Next Question \u2192</button>';
        html += '<button class="btn btn-danger exam-end-btn" id="exam-end-btn">' +
            'End Test</button>';
        html += '</div>';
        html += '</div></div>';
        return html;
    }
};
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

        // Config toggle groups (section filter, focus filter, marking mode, etc.)
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

                    // If this is the marking mode toggle, show/hide exam config
                    if (group.id === "study-marking-mode-group") {
                        var isExam = btn.getAttribute("data-value") === "exam";
                        var examRow = document.getElementById("exam-config-row");
                        var timeRow = document.getElementById("study-time-row");
                        if (examRow) examRow.style.display = isExam ? "" : "none";
                        if (timeRow) timeRow.style.display = isExam ? "none" : "";
                        if (isExam) StudyUI.updateExamTimeCalc();
                    }
                });
            });
        });

        // Exam marks select: update time calculation
        var examSelect = document.getElementById("exam-marks-select");
        if (examSelect) {
            examSelect.addEventListener("change", function() {
                StudyUI.updateExamTimeCalc();
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
        var codeScreen = document.getElementById("access-code-screen");
        if (codeScreen) codeScreen.style.display = "none";
        document.getElementById("welcome-screen").style.display = "flex";
        document.getElementById("app-container").style.display = "none";

        // Populate schedule info
        var info = QuestionEngine.getScheduleInfo();
        var classInfo = document.getElementById("welcome-class-info");
        var schedInfo = document.getElementById("welcome-schedule-info");

        // Update subtitle from schedule className
        var subtitle = document.getElementById("welcome-subtitle");
        if (subtitle && info.className && info.className !== "Unknown Class") {
            subtitle.textContent = info.className;
        }

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

            // Complete access code claim if applicable
            if (typeof AccessControl !== "undefined" &&
                typeof AccessControl.completeClaim === "function") {
                AccessControl.completeClaim(name);
            }

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
        var codeScreen = document.getElementById("access-code-screen");
        if (codeScreen) codeScreen.style.display = "none";
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

        // SymPy verification status
        var sympyEl = document.getElementById("settings-sympy-status");
        if (sympyEl) {
            var markEndpoint = WrittenMode.getMarkEndpoint();
            var sympyEndpoint = WrittenMode.getSympyEndpoint();
            var lines = [];
            if (markEndpoint) {
                lines.push('\u2705 AI Marking: <span style="color:var(--correct-green)">proxy enabled</span>');
            } else if (WrittenMode.getApiKey()) {
                lines.push('\u2705 AI Marking: <span style="color:var(--correct-green)">direct API</span>');
            } else {
                lines.push('\u2014 AI Marking: <span style="color:var(--text-muted)">not configured</span>');
            }
            if (sympyEndpoint) {
                lines.push('\u2705 SymPy verification: <span style="color:var(--correct-green)">enabled</span>');
            } else {
                lines.push('\u2014 SymPy verification: <span style="color:var(--text-muted)">not configured</span>');
            }
            sympyEl.innerHTML = lines.join('<br>');
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

        // Read answer method
        var answerMethod = "paper";
        var answerGroup = document.getElementById("study-answer-group");
        if (answerGroup) {
            var ansBtn = answerGroup.querySelector('[aria-pressed="true"]');
            if (ansBtn) answerMethod = ansBtn.getAttribute("data-value");
        }

        // Read marking mode
        var markingMode = "instant";
        var markingGroup = document.getElementById("study-marking-mode-group");
        if (markingGroup) {
            var markBtn = markingGroup.querySelector('[aria-pressed="true"]');
            if (markBtn) markingMode = markBtn.getAttribute("data-value");
        }

        // Check marking API if stylus mode
        if (answerMethod === "stylus" && !WrittenMode.hasMarkingAPI()) {
            alert("Written Mode is not enabled for this class. Your teacher needs to add an API key to the schedule configuration.");
            return;
        }

        // Calculate goal based on mode
        var goal;
        var examMarks = 0;
        if (markingMode === "exam") {
            var examSelect = document.getElementById("exam-marks-select");
            examMarks = examSelect ? parseInt(examSelect.value, 10) : 50;
            // Set a high goal so SessionEngine doesn't stop early
            // We manage question count via mark accumulation in ExamMode
            goal = 50;
        } else {
            var timeInput = document.getElementById("session-time-input");
            var minutes = timeInput ? parseInt(timeInput.value, 10) : 15;
            goal = StudyUI.estimateQuestions(minutes, sectionFilter);
        }

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
            wrongListOnly: wrongListOnly,
            answerMethod: answerMethod,
            markingMode: markingMode
        }).then(function() {
            StudyUI._nextReminderMinutes = 30; // reset duration reminder

            // If exam mode, start the exam timer
            if (markingMode === "exam") {
                ExamMode.start(examMarks);
            }

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
     * Update the exam time calculation display based on selected marks.
     */
    updateExamTimeCalc: function() {
        var select = document.getElementById("exam-marks-select");
        var calcEl = document.getElementById("exam-time-calc");
        if (!select || !calcEl) return;

        var marks = parseInt(select.value, 10);
        var secs = ExamMode.calcTime(marks);
        var mins = Math.round(secs / 60);
        calcEl.textContent = "Time allowed: ~" + mins + " min";
    },

    /**
     * Load and display the next question.
     */
    loadNextQuestion: function() {
        // In exam mode, skip result recording (ExamMode handles it)
        var recordPromise = ExamMode.active ?
            Promise.resolve() : StudyUI._recordResultsIfNeeded();

        recordPromise.then(function() {
            // Check if session goal reached (not applicable in exam mode)
            if (!ExamMode.active) {
                var plannedCount = SessionEngine.totalCount - SessionEngine.bonusCount;
                if (plannedCount >= SessionEngine.sessionGoal) {
                    StudyUI.showSessionSummary();
                    return;
                }
            }

            SessionEngine.getNext().then(function(result) {
                if (!result) {
                    if (ExamMode.active) {
                        ExamMode.endTest();
                    } else {
                        StudyUI.showSessionSummary();
                    }
                    return;
                }
                StudyUI.renderQuestion(result);
            });
        });
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
        if (ExamMode.active) {
            // Exam mode: show marks accumulated and question number
            var qNum = ExamMode.testAnswers.length + 1;
            html += '<div class="progress-text">Question ' + qNum +
                ' \u2014 ' + ExamMode.accumulatedMarks + ' / ' +
                ExamMode.targetMarks + ' marks queued</div>';
            var markPct = Math.round((ExamMode.accumulatedMarks / ExamMode.targetMarks) * 100);
            markPct = Math.min(markPct, 100);
            html += '<div class="progress-bar"><div class="progress-fill" style="width:' +
                markPct + '%"></div></div>';
        } else if (questionInfo.isBonus) {
            html += '<div class="progress-text">' + SYMBOLS.LIGHTNING +
                ' Bonus: Another like this</div>';
        } else {
            var plannedNum = questionInfo.questionNumber - (SessionEngine.bonusCount || 0);
            html += '<div class="progress-text">Question ' +
                plannedNum + ' of ' +
                questionInfo.sessionGoal + '</div>';
        }
        if (!ExamMode.active) {
            var plannedDone = (questionInfo.questionNumber - (SessionEngine.bonusCount || 0));
            var pct = Math.round((plannedDone / questionInfo.sessionGoal) * 100);
            pct = Math.min(pct, 100);
            html += '<div class="progress-bar"><div class="progress-fill" style="width:' +
                pct + '%"></div></div>';
        }
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

        // Diagrams (question-level: stem diagrams only from diagramPlaceholders)
        var qDiagrams = (q.diagramPlaceholders && q.diagramPlaceholders.question) || [];
        var stemDiagrams = qDiagrams.filter(function(d) {
            // Stem diagrams contain "PartStem" or "_Stem", or have no "Part" reference at all
            return d.indexOf("PartStem") !== -1 || d.indexOf("_Stem") !== -1 ||
                   d.indexOf("Part") === -1;
        });
        if (stemDiagrams.length > 0) {
            html += '<div class="question-diagrams">';
            stemDiagrams.forEach(function(diagFile) {
                var imgPath = StudyUI._getDiagramPath(diagFile, q._pool);
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

                // Part-level diagrams (from diagramPlaceholders + diagramsNeeded)
                var partLabel = part.partLabel;
                var partDiags = qDiagrams.filter(function(d) {
                    // Match diagrams referencing this part, e.g. "Parta)_IMG" or "Parta)Stem"
                    // but exclude stem-only diagrams already shown above
                    if (d.indexOf("PartStem") !== -1) return false;
                    if (d.indexOf("_Stem") !== -1 && d.indexOf("Part" + partLabel) === -1) return false;
                    return d.indexOf("Part" + partLabel + ")") !== -1 ||
                           d.indexOf("Part" + partLabel + "_") !== -1;
                });
                // Also include part.diagramsNeeded.placeholders (rare but exists)
                var partPlaceholders = (part.diagramsNeeded && part.diagramsNeeded.placeholders) || [];
                partPlaceholders.forEach(function(p) {
                    if (partDiags.indexOf(p) === -1) partDiags.push(p);
                });
                if (partDiags.length > 0) {
                    html += '<div class="part-diagrams">';
                    partDiags.forEach(function(diagFile) {
                        var dPath = StudyUI._getDiagramPath(diagFile, q._pool);
                        html += '<img src="' + StudyUI._escapeHtml(dPath) +
                            '" class="question-diagram" alt="Diagram">';
                    });
                    html += '</div>';
                }

                // STYLUS MODE: add canvas row inside each part (for both instant and exam)
                if (SessionEngine.answerMethod === "stylus") {
                    html += WrittenMode.renderCanvasRow(part.partLabel);
                }

                html += '</div>';
            });
        }

        if (ExamMode.active) {
            // EXAM MODE: show exam bottom bar (both stylus and paper)
            html += ExamMode.renderBottomBar();

        } else if (SessionEngine.answerMethod === "stylus") {
            // INSTANT STYLUS MODE: sticky mark bar
            html += '<div class="wm-mark-area" id="wm-mark-area">';
            html += '<div class="wm-mark-bar-inner">';
            html += '<div class="wm-timer wm-hidden" id="wm-timer">';
            html += '<span class="wm-timer-icon">\u23F0</span>';
            html += '<span class="wm-timer-display" id="wm-timer-display">0:00</span>';
            html += '</div>';
            html += '<button class="wm-btn-mark" id="wm-mark-btn" disabled>';
            html += '\u2713 Mark My Answer</button>';
            html += '<span class="wm-mark-hint" id="wm-mark-hint">';
            html += 'Write your answer above</span>';
            html += '</div></div>';

            // Results container (hidden until marking complete)
            html += '<div class="wm-results-container wm-hidden" id="wm-results-container"></div>';

            // Next actions (hidden until marking complete)
            html += '<div class="wm-next-actions wm-hidden" id="wm-next-actions">';
            html += '<button class="btn btn-primary btn-large" id="wm-next-question-btn">' +
                'Next Question ' + SYMBOLS.ARROW_RIGHT + '</button>';
            html += '<button class="btn btn-retry btn-large" id="wm-another-btn">' +
                SYMBOLS.LIGHTNING + ' Another like this</button>';
            html += '<button class="btn btn-secondary" id="wm-end-session-btn">' +
                'End Session</button>';
            html += '</div>';

        } else {
            // INSTANT PAPER MODE: original flow
            html += '<div class="show-solution-area">';
            html += '<p class="solution-prompt">Work through this question on paper, ' +
                'then check your answer.</p>';
            html += '<button class="btn btn-primary btn-large" id="show-solution-btn">' +
                'I\'ve finished ' + SYMBOLS.ARROW_RIGHT + ' Show Solution</button>';
            html += '</div>';
        }

        html += '</div>'; // .question-card

        // Solution area (hidden initially)
        html += '<div id="solution-area" style="display:none;"></div>';

        // Session control
        html += '<div class="session-controls" id="session-controls" style="display:none;">';
        html += '<button class="btn btn-secondary" id="end-session-btn">End Session</button>';
        html += '</div>';

        area.innerHTML = html;

        // EXAM MODE: bind exam buttons + init canvases if stylus
        if (ExamMode.active) {
            // Init canvases for stylus mode (no per-question timer in exam mode)
            if (SessionEngine.answerMethod === "stylus") {
                setTimeout(function() {
                    WrittenMode.initCanvasesForQuestion(q);
                }, 50);
            }

            // Bind exam Next Question button
            var examNextBtn = document.getElementById("exam-next-btn");
            if (examNextBtn) {
                examNextBtn.addEventListener("click", function() {
                    ExamMode.nextQuestion();
                });
            }

            // Bind exam End Test button
            var examEndBtn = document.getElementById("exam-end-btn");
            if (examEndBtn) {
                examEndBtn.addEventListener("click", function() {
                    if (confirm("End the test now? Your answers will be marked.")) {
                        ExamMode.snapshotCurrentQuestion();
                        ExamMode.endTest();
                    }
                });
            }

            // Update the question counter display
            var counterEl = document.getElementById("exam-q-counter");
            if (counterEl) {
                counterEl.textContent = "Q " + (ExamMode.testAnswers.length + 1);
            }

        } else if (SessionEngine.answerMethod === "stylus") {
            // INSTANT STYLUS MODE: init canvases and bind mark button
            setTimeout(function() {
                WrittenMode.initCanvasesForQuestion(q);
                WrittenMode.QuestionTimer.start(q);
            }, 50);

            var markBtn = document.getElementById("wm-mark-btn");
            if (markBtn) {
                markBtn.addEventListener("click", function() {
                    WrittenMode.markAnswer();
                });
            }

            var wmNextBtn = document.getElementById("wm-next-question-btn");
            if (wmNextBtn) {
                wmNextBtn.addEventListener("click", function() {
                    StudyUI.loadNextQuestion();
                    window.scrollTo(0, 0);
                });
            }

            var wmAnotherBtn = document.getElementById("wm-another-btn");
            if (wmAnotherBtn) {
                wmAnotherBtn.addEventListener("click", function() {
                    StudyUI.anotherLikeThis();
                });
            }

            var wmEndBtn = document.getElementById("wm-end-session-btn");
            if (wmEndBtn) {
                wmEndBtn.addEventListener("click", function() {
                    StudyUI.showSessionSummary();
                });
            }

        } else {
            // INSTANT PAPER MODE: bind show solution button
            var showBtn = document.getElementById("show-solution-btn");
            if (showBtn) {
                showBtn.addEventListener("click", function() {
                    StudyUI.showSolution();
                });
            }
        }

        // End session button (non-exam)
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
                        StudyUI._renderSolutionText(line.text, q._pool) + '</span>';
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
                        StudyUI._renderSolutionText(line.text) + '</span>';
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
        // If exam mode is still running, route through exam end flow instead
        if (ExamMode.active && ExamMode.state === "running") {
            ExamMode.snapshotCurrentQuestion();
            ExamMode.endTest();
            return;
        }

        // Stop any running Written Mode timer
        WrittenMode.QuestionTimer.stop();

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
        // Clean up exam mode if active
        if (ExamMode.active) {
            ExamMode.active = false;
            ExamMode.state = "inactive";
            ExamMode.testAnswers = [];
            if (ExamMode.timerInterval) {
                clearInterval(ExamMode.timerInterval);
                ExamMode.timerInterval = null;
            }
            var markingScreen = document.getElementById("exam-marking-screen");
            if (markingScreen) markingScreen.style.display = "none";
            var resultsScreen = document.getElementById("exam-results-screen");
            if (resultsScreen) resultsScreen.style.display = "none";
        }

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
    },

    /**
     * Render solution text, converting [IMAGE: filename.png] to actual img tags.
     * @private
     */
    _renderSolutionText: function(text, pool) {
        if (!text) return "";
        var imgPattern = /\[IMAGE:\s*([^\]]+)\]/g;
        if (!imgPattern.test(text)) {
            return StudyUI._escapeHtml(text);
        }
        // Reset regex after test
        imgPattern.lastIndex = 0;
        var result = "";
        var lastIndex = 0;
        var match;
        while ((match = imgPattern.exec(text)) !== null) {
            // Escape text before the match
            result += StudyUI._escapeHtml(text.substring(lastIndex, match.index));
            // Render the image
            var filename = match[1].trim();
            var imgPath = StudyUI._getDiagramPath(filename, pool);
            result += '<img src="' + StudyUI._escapeHtml(imgPath) +
                '" class="question-diagram solution-diagram" alt="Solution diagram">';
            lastIndex = match.index + match[0].length;
        }
        result += StudyUI._escapeHtml(text.substring(lastIndex));
        return result;
    }
};


// ============================================================================
// REVISE UI MODULE (Phase S4)
// Topic tree display, revision session launching, dashboard integration.
// ============================================================================
var ReviseUI = {

    /**
     * Refresh the topic tree on the Revise tab.
     * Builds a collapsible tree from TAXONOMY_DATA with mastery indicators.
     */
    refresh: function() {
        var container = document.getElementById("topic-tree-container");
        var emptyHint = document.getElementById("revise-empty-hint");
        if (!container) return;

        var taxonomy = QuestionEngine.taxonomyData;
        if (!taxonomy || Object.keys(taxonomy).length === 0) {
            container.innerHTML = "";
            if (emptyHint) emptyHint.style.display = "block";
            return;
        }
        if (emptyHint) emptyHint.style.display = "none";

        // Load mastery data to show indicators
        DB.getAll(STORE_MASTERY).then(function(records) {
            var masteryMap = {};
            records.forEach(function(r) { masteryMap[r.problemType] = r; });

            var unlockedSet = {};
            QuestionEngine.unlockedProblemTypes.forEach(function(pt) {
                unlockedSet[pt] = true;
            });

            var html = '<div class="topic-tree">';

            var topics = Object.keys(taxonomy);
            topics.forEach(function(topic) {
                // Check if any problem types in this topic are unlocked
                var topicPTs = ReviseUI._getProblemTypesForNode(taxonomy, topic, null, null);
                var topicUnlocked = topicPTs.filter(function(pt) { return unlockedSet[pt]; });
                if (topicUnlocked.length === 0) return;

                var topicStats = ReviseUI._computeNodeStats(topicUnlocked, masteryMap);

                html += '<div class="tt-topic">';
                html += '<div class="tt-node tt-node-topic" data-filter="' +
                    ReviseUI._esc(topic) + '" data-level="topic">';
                html += '<span class="tt-expand-icon">' + SYMBOLS.ARROW_RIGHT + '</span>';
                html += '<span class="tt-indicator ' + topicStats.cssClass + '"></span>';
                html += '<span class="tt-label">' + ReviseUI._esc(topic) + '</span>';
                html += '<span class="tt-meta">' + topicStats.summary + '</span>';
                html += '<button class="btn btn-sm tt-revise-btn" data-filter="' +
                    ReviseUI._esc(topic) + '" data-level="topic">Revise</button>';
                html += '</div>';

                // Subtopics (collapsed by default)
                html += '<div class="tt-children" style="display:none;">';
                var subtopics = Object.keys(taxonomy[topic]);
                subtopics.forEach(function(subtopic) {
                    var subPTs = ReviseUI._getProblemTypesForNode(taxonomy, topic, subtopic, null);
                    var subUnlocked = subPTs.filter(function(pt) { return unlockedSet[pt]; });
                    if (subUnlocked.length === 0) return;

                    var subStats = ReviseUI._computeNodeStats(subUnlocked, masteryMap);

                    html += '<div class="tt-subtopic">';
                    html += '<div class="tt-node tt-node-subtopic" data-filter="' +
                        ReviseUI._esc(subtopic) + '" data-level="subtopic">';
                    html += '<span class="tt-expand-icon">' + SYMBOLS.ARROW_RIGHT + '</span>';
                    html += '<span class="tt-indicator ' + subStats.cssClass + '"></span>';
                    html += '<span class="tt-label">' + ReviseUI._esc(subtopic) + '</span>';
                    html += '<span class="tt-meta">' + subStats.summary + '</span>';
                    html += '<button class="btn btn-sm tt-revise-btn" data-filter="' +
                        ReviseUI._esc(subtopic) + '" data-level="subtopic">Revise</button>';
                    html += '</div>';

                    // Concept categories
                    html += '<div class="tt-children" style="display:none;">';
                    var concepts = Object.keys(taxonomy[topic][subtopic]);
                    concepts.forEach(function(concept) {
                        var cPTs = taxonomy[topic][subtopic][concept] || [];
                        var cUnlocked = cPTs.filter(function(pt) { return unlockedSet[pt]; });
                        if (cUnlocked.length === 0) return;

                        var cStats = ReviseUI._computeNodeStats(cUnlocked, masteryMap);

                        html += '<div class="tt-concept">';
                        html += '<div class="tt-node tt-node-concept" data-filter="' +
                            ReviseUI._esc(concept) + '" data-level="concept">';
                        html += '<span class="tt-expand-icon tt-leaf"></span>';
                        html += '<span class="tt-indicator ' + cStats.cssClass + '"></span>';
                        html += '<span class="tt-label">' + ReviseUI._esc(concept) + '</span>';
                        html += '<span class="tt-meta">' + cStats.summary + '</span>';
                        html += '<button class="btn btn-sm tt-revise-btn" data-filter="' +
                            ReviseUI._esc(concept) + '" data-level="concept">Revise</button>';
                        html += '</div>';

                        // Problem types listed inline
                        if (cUnlocked.length > 0) {
                            html += '<div class="tt-pt-list">';
                            cUnlocked.forEach(function(pt) {
                                var rec = masteryMap[pt];
                                var status = rec ? rec.status : "new";
                                var icon = ReviseUI._statusIcon(status);
                                html += '<span class="tt-pt-item tt-pt-' + status + '" title="' +
                                    ReviseUI._esc(pt) + ' (' + status + ')">' +
                                    icon + ' ' + ReviseUI._esc(pt) + '</span>';
                            });
                            html += '</div>';
                        }

                        html += '</div>'; // tt-concept
                    });
                    html += '</div>'; // tt-children (concepts)
                    html += '</div>'; // tt-subtopic
                });
                html += '</div>'; // tt-children (subtopics)
                html += '</div>'; // tt-topic
            });

            html += '</div>'; // topic-tree

            container.innerHTML = html;
            ReviseUI._bindTreeEvents(container);
        });
    },

    /**
     * Start a revision session for a given filter.
     *
     * @param {string} filter - topic, subtopic, or concept name
     * @param {string} level - "topic", "subtopic", or "concept"
     */
    startRevision: function(filter, level) {
        // Switch the question area to the revise tab
        StudyUI._activeAreaId = "revise-question-area";

        var reviseHome = document.getElementById("revise-home");
        var reviseArea = document.getElementById("revise-question-area");
        if (reviseHome) reviseHome.style.display = "none";
        if (reviseArea) reviseArea.style.display = "block";

        // Read config toggles
        var answerMethod = "paper";
        var ansGroup = document.getElementById("revise-answer-group");
        if (ansGroup) {
            var ansBtn = ansGroup.querySelector('[aria-pressed="true"]');
            if (ansBtn) answerMethod = ansBtn.getAttribute("data-value");
        }

        var sectionFilter = "mix";
        var secGroup = document.getElementById("revise-section-group");
        if (secGroup) {
            var secBtn = secGroup.querySelector('[aria-pressed="true"]');
            if (secBtn) sectionFilter = secBtn.getAttribute("data-value");
        }

        // Read marking mode (interactive = instant, exam = exam)
        var markingMode = "instant";
        var modeGroup = document.getElementById("revise-mode-group");
        if (modeGroup) {
            var modeBtn = modeGroup.querySelector('[aria-pressed="true"]');
            if (modeBtn) {
                var val = modeBtn.getAttribute("data-value");
                markingMode = (val === "exam") ? "exam" : "instant";
            }
        }

        // Check marking API if stylus mode
        if (answerMethod === "stylus" && !WrittenMode.hasMarkingAPI()) {
            alert("Written Mode is not enabled for this class. Your teacher needs to add an API key to the schedule configuration.");
            if (reviseHome) reviseHome.style.display = "block";
            if (reviseArea) reviseArea.style.display = "none";
            return;
        }

        // Use a reasonable default goal (higher for exam mode)
        var goal = markingMode === "exam" ? 50 : 10;

        SessionEngine.start("revision", filter, {
            goal: goal,
            sectionFilter: sectionFilter,
            wrongListOnly: false,
            answerMethod: answerMethod,
            markingMode: markingMode
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
                    '" right now. You may have mastered everything in this area!</p>' +
                    '<button class="btn btn-primary" id="revise-back-btn">' +
                    'Back to Topics</button>' +
                    '</div>';
                document.getElementById("revise-back-btn").addEventListener("click", function() {
                    StudyUI.returnToHome();
                });
                return;
            }

            StudyUI._nextReminderMinutes = 30;

            // If exam mode, start exam timer (use default 30 marks for revision)
            if (markingMode === "exam") {
                ExamMode.start(30);
            }

            StudyUI.loadNextQuestion();
        });
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
     * Bind expand/collapse and revise button events on the tree.
     * @private
     */
    _bindTreeEvents: function(container) {
        // Expand/collapse on node click
        container.querySelectorAll(".tt-node").forEach(function(node) {
            var expandIcon = node.querySelector(".tt-expand-icon");
            if (!expandIcon || expandIcon.classList.contains("tt-leaf")) return;

            var clickTarget = node;
            clickTarget.style.cursor = "pointer";
            clickTarget.addEventListener("click", function(e) {
                // Don't toggle if clicking the revise button
                if (e.target.classList.contains("tt-revise-btn")) return;

                var parent = node.parentElement;
                var children = parent.querySelector(".tt-children");
                if (!children) return;

                var isOpen = children.style.display !== "none";
                children.style.display = isOpen ? "none" : "block";
                expandIcon.textContent = isOpen ? SYMBOLS.ARROW_RIGHT : "\u25BC";
                expandIcon.classList.toggle("tt-expanded", !isOpen);
            });
        });

        // Revise buttons
        container.querySelectorAll(".tt-revise-btn").forEach(function(btn) {
            btn.addEventListener("click", function(e) {
                e.stopPropagation();
                var filter = btn.getAttribute("data-filter");
                var level = btn.getAttribute("data-level");
                ReviseUI.startRevision(filter, level);
            });
        });
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
        WrittenMode.init();
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
window.addEventListener("DOMContentLoaded", function() {
    // Set up skip link handler (allows students to use app without access code)
    var skipLink = document.getElementById("access-skip-link");
    if (skipLink) {
        skipLink.addEventListener("click", function(e) {
            e.preventDefault();
            var codeScreen = document.getElementById("access-code-screen");
            if (codeScreen) codeScreen.style.display = "none";
            initApp();
        });
    }

    // Check access control first (shows code screen if needed)
    if (typeof AccessControl !== "undefined") {
        AccessControl.init().then(function(result) {
            if (result.granted) {
                initApp();
            } else {
                // Show skip option after a delay (for students without codes)
                var skipHint = document.getElementById("access-skip-hint");
                if (skipHint) {
                    setTimeout(function() {
                        skipHint.style.display = "block";
                    }, 3000);
                }
            }
        });
    } else {
        // AccessControl not loaded (scripts missing), proceed directly
        initApp();
    }
});
