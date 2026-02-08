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

// Base path for data files (relative to the HTML file).
// Cloud version: files are in the same directory or subdirectories.
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
    }
};


// ============================================================================
// DATA LOADER (fetch-based JSON loading for cloud hosting)
// Replaces the old script-tag global approach (data_bundle.js / schedule.js).
// On https://, fetch() works perfectly -- no more file:// workarounds needed.
// ============================================================================
var DataLoader = {
    questionsData: null,
    taxonomyData: null,
    questionIndex: null,
    scheduleData: null,

    /**
     * Fetch all data files in parallel. Returns a Promise that resolves
     * when all data is loaded (or rejects if any critical file fails).
     */
    loadAll: function() {
        return Promise.all([
            DataLoader._fetchJSON("data/questions.json"),
            DataLoader._fetchJSON("data/taxonomy.json"),
            DataLoader._fetchJSON("data/question_index.json"),
            DataLoader._fetchJSON("data/schedule.json")
        ]).then(function(results) {
            DataLoader.questionsData = results[0] || {};
            DataLoader.taxonomyData = results[1] || {};
            DataLoader.questionIndex = results[2] || {};
            DataLoader.scheduleData = results[3] || {};
            console.log("DataLoader: All data loaded (" +
                Object.keys(DataLoader.questionsData).length + " questions, " +
                Object.keys(DataLoader.taxonomyData).length + " topics)");
            return DataLoader;
        });
    },

    /**
     * Fetch a single JSON file with error handling.
     */
    _fetchJSON: function(url) {
        return fetch(url).then(function(response) {
            if (!response.ok) {
                throw new Error("HTTP " + response.status + " loading " + url);
            }
            return response.json();
        }).catch(function(err) {
            console.warn("DataLoader: Failed to load " + url + " -- " + err.message);
            return null;
        });
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
     * Initialise the engine with data loaded by DataLoader.
     * Accepts optional data parameter (from DataLoader); falls back to
     * script-tag globals for backward compatibility with offline version.
     */
    init: function(loadedData) {
        // Load from DataLoader if provided, otherwise fall back to globals
        if (loadedData && loadedData.questionsData) {
            QuestionEngine.allQuestions = Object.assign({}, loadedData.questionsData);
            console.log("QuestionEngine: Loaded " +
                Object.keys(loadedData.questionsData).length + " questions from DataLoader");
        } else if (typeof QUESTIONS_DATA !== "undefined") {
            QuestionEngine.allQuestions = Object.assign({}, QUESTIONS_DATA);
            console.log("QuestionEngine: Loaded " +
                Object.keys(QUESTIONS_DATA).length + " questions from data bundle (fallback)");
        } else {
            console.warn("QuestionEngine: No question data found");
            QuestionEngine.allQuestions = {};
        }

        if (loadedData && loadedData.taxonomyData) {
            QuestionEngine.taxonomyData = loadedData.taxonomyData;
        } else if (typeof TAXONOMY_DATA !== "undefined") {
            QuestionEngine.taxonomyData = TAXONOMY_DATA;
        }
        if (loadedData && loadedData.questionIndex) {
            QuestionEngine.questionIndex = loadedData.questionIndex;
        } else if (typeof QUESTION_INDEX !== "undefined") {
            QuestionEngine.questionIndex = QUESTION_INDEX;
        }

        // Store schedule data for later use by computeUnlocked
        if (loadedData && loadedData.scheduleData) {
            QuestionEngine._scheduleData = loadedData.scheduleData;
        } else if (typeof TAUGHT_SCHEDULE !== "undefined") {
            QuestionEngine._scheduleData = TAUGHT_SCHEDULE;
        } else {
            QuestionEngine._scheduleData = {};
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

        // Base schedule from loaded data (was TAUGHT_SCHEDULE global)
        var baseSchedule = QuestionEngine._scheduleData;
        if (baseSchedule && baseSchedule.schedule) {
            baseSchedule.schedule.forEach(function(entry) {
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
        var sched = QuestionEngine._scheduleData;
        if (!sched) {
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

        if (sched.schedule) {
            for (var i = 0; i < sched.schedule.length; i++) {
                var d = new Date(sched.schedule[i].date + "T00:00:00");
                if (d > today) {
                    nextUnlock = sched.schedule[i];
                    break;
                }
            }
        }

        return {
            className: sched.className || "Unknown Class",
            teacherName: sched.teacherName || "Unknown",
            totalEntries: (sched.schedule || []).length,
            allowAheadOfSchedule: !!sched.allowAheadOfSchedule,
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
                // Sync to Firebase
                if (typeof FirebaseSync !== "undefined" && FirebaseSync.syncMastery) {
                    FirebaseSync.syncMastery(problemType, record);
                }
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
            return DB.put(STORE_MASTERY, record).then(function() {
                if (typeof FirebaseSync !== "undefined" && FirebaseSync.syncMastery) {
                    FirebaseSync.syncMastery(problemType, record);
                }
                return record;
            });
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
                                if (typeof FirebaseSync !== "undefined" && FirebaseSync.syncMastery) {
                                    FirebaseSync.syncMastery(r.problemType, r);
                                }
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

            return DB.put(STORE_HISTORY, hist).then(function() {
                if (typeof FirebaseSync !== "undefined" && FirebaseSync.syncQuestionHistory) {
                    FirebaseSync.syncQuestionHistory(filename, hist);
                }
                return hist;
            });
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
            // Sync session to Firebase
            if (typeof FirebaseSync !== "undefined" && FirebaseSync.syncSession) {
                FirebaseSync.syncSession(SessionEngine.sessionData);
            }
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
        var matchingPTs = {};
        var keys = Object.keys(QuestionEngine.allQuestions);
        keys.forEach(function(k) {
            var q = QuestionEngine.allQuestions[k];
            if (!q.parts) return;
            q.parts.forEach(function(part) {
                if (part.topic === topicFilter ||
                    part.subtopic === topicFilter ||
                    part.conceptCategory === topicFilter) {
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
    // Error at line N means lines 1..(N-1) were correct.
    // Proportion correct = (errorLine - 1) / totalLines
    // Map that proportion onto the criteria to find the first failed criterion.
    var correctProportion = (errorLine - 1) / totalLines;
    var firstFailed = Math.round(correctProportion * totalCriteria);
    firstFailed = Math.max(0, Math.min(firstFailed, totalCriteria - 1));
    var failed = [];
    for (var j = firstFailed; j < totalCriteria; j++) {
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

        // Config toggle groups (section filter, focus filter)
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

        // Import/export buttons (stubs - full implementation in Phase S5)
        document.getElementById("btn-import-update").addEventListener("click", function() {
            document.getElementById("file-input-update").click();
        });
        document.getElementById("btn-export-progress").addEventListener("click", function() {
            alert("Progress export coming in Phase S5.");
        });
        document.getElementById("btn-export-backup").addEventListener("click", function() {
            alert("Full backup export coming in Phase S5.");
        });
        document.getElementById("btn-import-backup").addEventListener("click", function() {
            document.getElementById("file-input-backup").click();
        });
        document.getElementById("btn-clear-diagram-cache").addEventListener("click", function() {
            if (confirm("Clear cached diagram images from imported updates?\n\n" +
                "Diagrams that exist as PNG files in the diagrams folder will still work. " +
                "Only diagrams imported from update files will be removed.")) {
                UI.clearDiagramCache();
            }
        });
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
        } else if (tabName === "dashboard") {
            DashboardUI.refresh();
        }
    },

    /**
     * Show the welcome screen for first-run setup.
     */
    showWelcomeScreen: function() {
        document.getElementById("access-code-screen").style.display = "none";
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

        // Complete the access code claim with the student's name
        var claimPromise;
        if (window._needsAccessClaim && typeof AccessControl !== "undefined") {
            claimPromise = AccessControl.completeClaim(name).then(function(result) {
                if (!result.success) {
                    alert("Could not activate your code: " + result.reason +
                        "\n\nPlease try again or contact your teacher.");
                    return false;
                }
                return true;
            });
        } else {
            claimPromise = Promise.resolve(true);
        }

        claimPromise.then(function(ok) {
            if (!ok) return; // Claim failed -- stay on welcome screen

            // Set up Firebase sync with student identity and pull any existing data
            var syncPromise = Promise.resolve();
            if (typeof FirebaseSync !== "undefined" && FirebaseSync.setStudent) {
                syncPromise = FirebaseSync.setStudent(name, CLASS_CODE)
                    .catch(function(err) {
                        console.warn("Firebase sync setup:", err.message);
                    });
            }

            return syncPromise.then(function() {
                return DB.put(STORE_CONFIG, config);
            }).then(function() {
                console.log("Config saved for: " + name);
                UI.showMainApp(config);
            }).catch(function(err) {
                console.error("Failed to save config:", err);
                UI.showMainApp(config);
            });
        });
    },

    /**
     * Show the main application (after welcome or on returning user).
     */
    showMainApp: function(config) {
        document.getElementById("access-code-screen").style.display = "none";
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
    _markStates: {},            // inline mark states: { partIdx: [bool, ...] }
    _questionTimer: null,       // { interval, startTime, allowedSeconds, elapsed, overtime }
    _questionTimings: [],       // [{ filename, totalMarks, allowedSec, actualSec, overtime, partsCorrect, partsTotal, problemTypes }]

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

        // Hide start screen, show question area
        var startScreen = document.querySelector(".study-start-screen");
        var questionArea = document.getElementById("question-area");
        if (startScreen) startScreen.style.display = "none";
        if (questionArea) questionArea.style.display = "block";

        SessionEngine.start("study", null, {
            goal: goal,
            sectionFilter: sectionFilter,
            wrongListOnly: wrongListOnly
        }).then(function() {
            StudyUI._nextReminderMinutes = 30; // reset duration reminder
            StudyUI._questionTimings = [];     // reset per-question timings
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
        StudyUI._updateLastTiming();
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
        StudyUI._markStates = {};
        StudyUI.guidedAccessedThisQuestion = false;
        StudyUI.assessedParts = 0;
        StudyUI._resultsRecorded = false;
        StudyUI.totalParts = questionInfo.questionData.parts ?
            questionInfo.questionData.parts.length : 0;

        var area = document.getElementById("question-area");
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

        // Question timer
        var allowedSec = (q.totalMarks || 5) * 60;
        html += '<div class="question-timer" id="question-timer">';
        html += '<span class="timer-icon">' + SYMBOLS.CLOCK + '</span>';
        html += '<span class="timer-display" id="timer-display">' +
            StudyUI._formatTime(allowedSec) + '</span>';
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
                    '" class="question-diagram" alt="Diagram"' +
                    ' onerror="this.style.display=\'none\'">';
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
                            '" class="question-diagram" alt="Diagram"' +
                            ' onerror="this.style.display=\'none\'">';
                    });
                    html += '</div>';
                }
                html += '</div>';
            });
        }

        // Show Solution button
        html += '<div class="show-solution-area">';
        html += '<p class="solution-prompt">Work through this question on paper, ' +
            'then check your answer.</p>';
        html += '<button class="btn btn-primary btn-large" id="show-solution-btn">' +
            'I\'ve finished ' + SYMBOLS.ARROW_RIGHT + ' Show Solution</button>';
        html += '</div>';

        html += '</div>'; // .question-card

        // Solution area (hidden initially)
        html += '<div id="solution-area" style="display:none;"></div>';

        // Session control
        html += '<div class="session-controls" id="session-controls" style="display:none;">';
        html += '<button class="btn btn-secondary" id="end-session-btn">End Session</button>';
        html += '</div>';

        area.innerHTML = html;

        // Bind show solution button
        var showBtn = document.getElementById("show-solution-btn");
        if (showBtn) {
            showBtn.addEventListener("click", function() {
                StudyUI.showSolution();
            });
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

        // Start question timer
        StudyUI._startQuestionTimer(q.totalMarks || 5);

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
        var area = document.getElementById("question-area");
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
     * Check if a part has lineRef on all its marking criteria.
     * @private
     */
    _hasLineRefs: function(part) {
        if (!part.marking || part.marking.length === 0) return false;
        return part.marking.every(function(m) {
            return typeof m.lineRef === "number" && m.lineRef > 0;
        });
    },

    /**
     * Show the solution (Layer 1 + Layer 2).
     * Uses inline mark indicators when lineRef is available, falls back to old UI otherwise.
     */
    showSolution: function() {
        var q = StudyUI.currentQuestion;
        if (!q || !q.parts) return;

        // Stop question timer
        StudyUI._stopQuestionTimer();

        // Hide the "show solution" button
        var showArea = document.querySelector(".show-solution-area");
        if (showArea) showArea.style.display = "none";

        var solArea = document.getElementById("solution-area");
        if (!solArea) return;

        // Initialize mark states for inline UI
        StudyUI._markStates = {};

        // Check if ALL parts support inline marks
        var useInline = q.parts.every(function(part) {
            return StudyUI._hasLineRefs(part);
        });

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

        if (useInline) {
            // ---- NEW INLINE MARK UI ----
            q.parts.forEach(function(part, partIdx) {
                // Initialize mark states (all passed)
                StudyUI._markStates[partIdx] = [];

                html += '<div class="solution-part" data-part-idx="' + partIdx + '">';
                html += '<h4 class="solution-part-header">Part (' +
                    StudyUI._escapeHtml(part.partLabel) + ') ' +
                    SYMBOLS.BULLET + ' ' + part.partMarks + ' mark' +
                    (part.partMarks !== 1 ? 's' : '') + '</h4>';

                // Build lineRef map: lineNumber -> [{ mark, markIdx }]
                var lineMarks = {};
                if (part.marking) {
                    part.marking.forEach(function(m, mIdx) {
                        var lr = m.lineRef;
                        if (!lineMarks[lr]) lineMarks[lr] = [];
                        lineMarks[lr].push({ mark: m, markIdx: mIdx });
                        StudyUI._markStates[partIdx].push(true);
                    });
                }

                // Render solution lines with inline mark indicators
                html += '<div class="solution-lines" id="sol-lines-' + partIdx + '">';
                if (part.originalSolution) {
                    part.originalSolution.forEach(function(line, lineIdx) {
                        if (line.shown === false) return;
                        var lineNum = lineIdx + 1;

                        html += '<div class="solution-line" data-line="' + lineNum + '">';
                        html += '<span class="line-number">' + lineNum + '</span>';
                        html += '<span class="line-text">' +
                            StudyUI._escapeHtml(line.text) + '</span>';
                        html += '</div>';

                        // Insert mark indicators that reference this line
                        if (lineMarks[lineNum]) {
                            lineMarks[lineNum].forEach(function(entry) {
                                html += '<div class="mark-indicator mark-passed" ' +
                                    'id="mark-' + partIdx + '-' + entry.markIdx + '" ' +
                                    'onclick="StudyUI.toggleMark(' + partIdx + ',' +
                                    entry.markIdx + ')">';
                                html += '<span class="mark-toggle">' +
                                    SYMBOLS.CHECK + '</span>';
                                html += '<span class="mark-value">' +
                                    entry.mark.awarded + '</span>';
                                html += '<span class="mark-desc">' +
                                    StudyUI._escapeHtml(entry.mark.text) + '</span>';
                                html += '</div>';
                            });
                        }
                    });
                }
                html += '</div>';

                // Part score bar
                var partTotal = part.partMarks || 0;
                html += '<div class="part-score-bar" id="part-score-' + partIdx + '">';
                html += '<span class="score-text all-correct" id="score-text-' +
                    partIdx + '">' + partTotal + '/' + partTotal + '</span>';
                html += '<span class="score-hint">tap marks to change</span>';
                html += '</div>';

                html += '</div>'; // .solution-part
            });

            // Submit assessment button
            html += '<div class="submit-assess-area" id="submit-assess">';
            html += '<button class="btn btn-primary btn-large" ' +
                'onclick="StudyUI.submitAssessment()">' +
                'Confirm ' + SYMBOLS.ARROW_RIGHT + '</button>';
            html += '</div>';

        } else {
            // ---- OLD UI (fallback for questions without lineRef) ----
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
                        if (line.shown === false) return;
                        html += '<div class="solution-line" data-line="' +
                            (lineIdx + 1) + '">';
                        html += '<span class="line-number">' + (lineIdx + 1) + '</span>';
                        html += '<span class="line-text">' +
                            StudyUI._escapeHtml(line.text) + '</span>';
                        html += '</div>';
                    });
                    html += '</div>';
                }

                // Marking criteria (separate block)
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
                html += '<div class="error-prompt">Or tap the line where you ' +
                    '<strong>first</strong> went wrong:</div>';
                if (part.originalSolution) {
                    part.originalSolution.forEach(function(line, lineIdx) {
                        if (line.shown === false) return;
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
        }

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
     * Toggle a mark indicator between passed/failed with cascading.
     * Clicking a passed mark fails it and all subsequent marks.
     * Clicking a failed mark passes it and all prior marks.
     */
    toggleMark: function(partIdx, markIdx) {
        var states = StudyUI._markStates[partIdx];
        if (!states) return;

        var currentState = states[markIdx];

        if (currentState) {
            // Turning FAILED: this and all subsequent marks fail
            for (var i = markIdx; i < states.length; i++) {
                states[i] = false;
            }
        } else {
            // Turning PASSED: this and all prior marks pass
            for (var i = 0; i <= markIdx; i++) {
                states[i] = true;
            }
        }

        StudyUI._updateMarkIndicators(partIdx);
        StudyUI._updatePartScore(partIdx);
    },

    /**
     * Update mark indicator DOM elements to reflect current states.
     * @private
     */
    _updateMarkIndicators: function(partIdx) {
        var states = StudyUI._markStates[partIdx];
        if (!states) return;

        states.forEach(function(passed, mIdx) {
            var el = document.getElementById("mark-" + partIdx + "-" + mIdx);
            if (!el) return;

            var toggleEl = el.querySelector(".mark-toggle");
            if (passed) {
                el.className = "mark-indicator mark-passed";
                if (toggleEl) toggleEl.textContent = SYMBOLS.CHECK;
            } else {
                el.className = "mark-indicator mark-failed";
                if (toggleEl) toggleEl.textContent = SYMBOLS.CROSS;
            }
        });

        // Update solution line colouring
        StudyUI._updateLineHighlights(partIdx);
    },

    /**
     * Colour solution lines green/red based on first failed mark's lineRef.
     * @private
     */
    _updateLineHighlights: function(partIdx) {
        var part = StudyUI.currentQuestion.parts[partIdx];
        if (!part || !part.marking) return;

        var linesContainer = document.getElementById("sol-lines-" + partIdx);
        if (!linesContainer) return;

        var states = StudyUI._markStates[partIdx];
        var firstFailedLine = -1;
        for (var i = 0; i < states.length; i++) {
            if (!states[i] && part.marking[i] && part.marking[i].lineRef) {
                firstFailedLine = part.marking[i].lineRef;
                break;
            }
        }

        var lines = linesContainer.querySelectorAll(".solution-line");
        lines.forEach(function(el) {
            var lineNum = parseInt(el.getAttribute("data-line"), 10);
            el.classList.remove("line-correct", "line-error");
            if (firstFailedLine === -1) {
                // All passed
                el.classList.add("line-correct");
            } else if (lineNum < firstFailedLine) {
                el.classList.add("line-correct");
            } else {
                el.classList.add("line-error");
            }
        });
    },

    /**
     * Update the part score display based on current mark states.
     * @private
     */
    _updatePartScore: function(partIdx) {
        var part = StudyUI.currentQuestion.parts[partIdx];
        if (!part) return;

        var states = StudyUI._markStates[partIdx];
        var earned = 0;
        var total = part.partMarks || 0;

        if (part.marking && states) {
            part.marking.forEach(function(m, mIdx) {
                if (states[mIdx]) earned += (m.awarded || 0);
            });
        }

        var scoreEl = document.getElementById("score-text-" + partIdx);
        if (scoreEl) {
            scoreEl.textContent = earned + "/" + total;
            scoreEl.className = "score-text " +
                (earned === total ? "all-correct" : "has-errors");
        }
    },

    /**
     * Submit the inline assessment. Derives partResults from mark states,
     * disables toggles, and shows next question area.
     */
    submitAssessment: function() {
        var q = StudyUI.currentQuestion;
        if (!q || !q.parts) return;

        // Hide quick-assess and submit button
        var quickArea = document.getElementById("quick-assess");
        if (quickArea) quickArea.style.display = "none";
        var submitArea = document.getElementById("submit-assess");
        if (submitArea) submitArea.style.display = "none";

        // Derive partResults from mark states
        q.parts.forEach(function(part, partIdx) {
            var states = StudyUI._markStates[partIdx];
            if (!states) return;

            var allPassed = states.every(function(s) { return s; });
            var failedIndices = [];
            var firstFailedLine = null;

            states.forEach(function(s, mIdx) {
                if (!s) {
                    failedIndices.push(mIdx);
                    if (firstFailedLine === null && part.marking[mIdx] &&
                        part.marking[mIdx].lineRef) {
                        firstFailedLine = part.marking[mIdx].lineRef;
                    }
                }
            });

            StudyUI.partResults[part.partLabel] = {
                correct: allPassed,
                correctButUnsure: false,
                errorAtLine: firstFailedLine,
                markingCriteriaFailed: failedIndices
            };
        });

        // Disable mark toggles (lock in assessment)
        var indicators = document.querySelectorAll(".mark-indicator");
        indicators.forEach(function(el) {
            el.onclick = null;
            el.style.cursor = "default";
            el.style.opacity = "0.85";
        });

        // Hide score hints
        var hints = document.querySelectorAll(".score-hint");
        hints.forEach(function(el) { el.style.display = "none"; });

        // Show next area
        StudyUI._showNextArea();
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

        // Check if using inline UI
        var useInline = q.parts.every(function(part) {
            return StudyUI._hasLineRefs(part);
        });

        if (useInline) {
            // Set all marks based on mode
            q.parts.forEach(function(part, partIdx) {
                var states = StudyUI._markStates[partIdx];
                if (!states) return;
                for (var i = 0; i < states.length; i++) {
                    states[i] = (mode === "correct");
                }
                StudyUI._updateMarkIndicators(partIdx);
                StudyUI._updatePartScore(partIdx);
            });
            // Auto-submit
            StudyUI.submitAssessment();
        } else {
            // Old UI behavior
            q.parts.forEach(function(part, partIdx) {
                // Skip already-assessed parts
                if (StudyUI.partResults[part.partLabel]) return;

                if (mode === "correct") {
                    StudyUI.assessPart(partIdx, "correct");
                } else {
                    var assessArea = document.getElementById("assess-" + partIdx);
                    if (assessArea) assessArea.style.display = "none";
                    StudyUI.selectErrorLine(partIdx, 1);
                }
            });
        }
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
                if (l.shown !== false) totalLines++;
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
        // Stop timer if still running
        StudyUI._stopQuestionTimer();

        // Record results for last question before ending session
        StudyUI._recordResultsIfNeeded().then(function() {
            return SessionEngine.end();
        }).then(function(sessionData) {
            var area = document.getElementById("question-area");
            if (!area) return;

            var sd = sessionData || SessionEngine.sessionData;
            var timings = StudyUI._questionTimings;
            var html = '<div class="session-summary">';

            // ---- HEADER ----
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

            // ---- OVERVIEW STATS ----
            var totalTimeSec = 0;
            var totalAllowedSec = 0;
            var overtimeCount = 0;
            timings.forEach(function(t) {
                totalTimeSec += t.actualSec;
                totalAllowedSec += t.allowedSec;
                if (t.overtime) overtimeCount++;
            });
            var totalTimeMin = Math.round(totalTimeSec / 60);
            var avgSecPerMark = 0;
            var totalMarksAttempted = 0;
            timings.forEach(function(t) { totalMarksAttempted += t.totalMarks; });
            if (totalMarksAttempted > 0) {
                avgSecPerMark = Math.round(totalTimeSec / totalMarksAttempted);
            }

            html += '<div class="summary-stats">';
            html += StudyUI._summaryCard("Questions", sd.questionsAttempted);
            html += StudyUI._summaryCard("Accuracy", sd.accuracyPercent + "%");
            html += StudyUI._summaryCard("Total Time", totalTimeMin + " min");
            html += StudyUI._summaryCard("Avg Pace",
                avgSecPerMark + "s/mark" +
                (avgSecPerMark > 60 ? " " + SYMBOLS.CROSS : " " + SYMBOLS.CHECK));
            html += '</div>';

            // ---- NEW MASTERIES ----
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

            // ---- PER-QUESTION BREAKDOWN ----
            if (timings.length > 0) {
                html += '<div class="summary-section">';
                html += '<h3>' + SYMBOLS.CLOCK + ' Question Breakdown</h3>';
                timings.forEach(function(t, idx) {
                    var pct = t.allowedSec > 0 ?
                        Math.round((t.actualSec / t.allowedSec) * 100) : 0;
                    var timeClass = t.overtime ? "q-overtime" : "q-undertime";
                    var correctAll = t.partsCorrect === t.partsTotal;
                    var resultIcon = correctAll ? SYMBOLS.CHECK : SYMBOLS.CROSS;
                    var resultClass = correctAll ? "q-correct" : "q-error";

                    html += '<div class="q-timing-row">';
                    html += '<span class="q-timing-num">' + (idx + 1) + '</span>';
                    html += '<span class="q-timing-name">' +
                        StudyUI._escapeHtml(t.reference) + '</span>';
                    html += '<span class="q-timing-result ' + resultClass + '">' +
                        resultIcon + ' ' + t.partsCorrect + '/' + t.partsTotal + '</span>';
                    html += '<span class="q-timing-marks">' + t.totalMarks + ' mk</span>';
                    html += '<span class="q-timing-time ' + timeClass + '">' +
                        StudyUI._formatTime(t.actualSec) +
                        ' / ' + StudyUI._formatTime(t.allowedSec) + '</span>';

                    // Time bar
                    var barPct = Math.min(pct, 200);
                    var barClass = t.overtime ? "bar-danger" :
                        pct > 80 ? "bar-warning" : "bar-success";
                    html += '<div class="q-timing-bar">';
                    html += '<div class="q-timing-bar-fill ' + barClass +
                        '" style="width:' + Math.min(barPct, 100) + '%"></div>';
                    if (barPct > 100) {
                        html += '<div class="q-timing-bar-over" style="width:' +
                            Math.min(barPct - 100, 100) + '%"></div>';
                    }
                    html += '</div>';

                    html += '</div>';
                });
                html += '</div>';
            }

            // ---- RECOMMENDATIONS ----
            var recommendations = StudyUI._generateRecommendations(sd, timings);
            if (recommendations.length > 0) {
                html += '<div class="summary-section summary-recommendations">';
                html += '<h3>' + SYMBOLS.BOOK + ' Recommendations</h3>';
                recommendations.forEach(function(rec) {
                    html += '<div class="recommendation-item">';
                    html += '<span class="rec-icon">' + rec.icon + '</span>';
                    html += '<div class="rec-content">';
                    html += '<div class="rec-title">' + rec.title + '</div>';
                    html += '<div class="rec-detail">' + rec.detail + '</div>';
                    html += '</div></div>';
                });
                html += '</div>';
            }

            // ---- TOPIC BREAKDOWN ----
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
     * Generate study recommendations based on session data.
     * @private
     */
    _generateRecommendations: function(sd, timings) {
        var recs = [];

        // 1. Identify problem types with errors
        var failedPTs = {};
        var q = StudyUI.currentQuestion; // might be null at end
        timings.forEach(function(t) {
            if (t.partsCorrect < t.partsTotal) {
                t.problemTypes.forEach(function(pt) {
                    if (!failedPTs[pt]) failedPTs[pt] = 0;
                    failedPTs[pt]++;
                });
            }
        });
        var failedPTList = Object.keys(failedPTs);
        if (failedPTList.length > 0) {
            // Sort by frequency of failure
            failedPTList.sort(function(a, b) { return failedPTs[b] - failedPTs[a]; });
            var topFailed = failedPTList.slice(0, 3);
            recs.push({
                icon: SYMBOLS.CROSS,
                title: "Revise these problem types",
                detail: topFailed.map(function(pt) {
                    return StudyUI._escapeHtml(pt);
                }).join(", ") + ". Consider using \"Another like this\" to get extra practice."
            });
        }

        // 2. Timing - went overtime on questions
        var overtimeQs = timings.filter(function(t) { return t.overtime; });
        if (overtimeQs.length > 0) {
            var slowPTs = {};
            overtimeQs.forEach(function(t) {
                t.problemTypes.forEach(function(pt) {
                    if (!slowPTs[pt]) slowPTs[pt] = 0;
                    slowPTs[pt]++;
                });
            });
            var slowPTList = Object.keys(slowPTs).slice(0, 3);
            recs.push({
                icon: SYMBOLS.CLOCK,
                title: "Work on speed for " + overtimeQs.length +
                    " question" + (overtimeQs.length > 1 ? "s" : ""),
                detail: "You went over time on: " +
                    slowPTList.map(function(pt) {
                        return StudyUI._escapeHtml(pt);
                    }).join(", ") +
                    ". In the exam you have about 1 minute per mark."
            });
        }

        // 3. Overall accuracy
        if (sd.accuracyPercent < 50) {
            recs.push({
                icon: SYMBOLS.BOOK,
                title: "Review fundamentals",
                detail: "Your accuracy was below 50%. Consider reviewing the theory and worked examples before attempting more practice."
            });
        } else if (sd.accuracyPercent >= 80 && overtimeQs.length === 0) {
            recs.push({
                icon: SYMBOLS.STAR,
                title: "Great accuracy and timing!",
                detail: "You scored well and stayed within the time limit. Try tackling harder questions or new problem types to keep improving."
            });
        } else if (sd.accuracyPercent >= 80) {
            recs.push({
                icon: SYMBOLS.STAR,
                title: "Accuracy is strong, focus on speed",
                detail: "Your understanding is solid but some questions took too long. Practice under timed conditions."
            });
        }

        // 4. Topics with low accuracy
        if (sd.topicBreakdown) {
            var weakTopics = [];
            Object.keys(sd.topicBreakdown).forEach(function(topic) {
                var tb = sd.topicBreakdown[topic];
                if (tb.attempted >= 2) {
                    var pct = Math.round((tb.correct / tb.attempted) * 100);
                    if (pct < 50) {
                        weakTopics.push(topic);
                    }
                }
            });
            if (weakTopics.length > 0) {
                recs.push({
                    icon: SYMBOLS.GRAPH,
                    title: "Weak topic" + (weakTopics.length > 1 ? "s" : "") +
                        " identified",
                    detail: "You scored below 50% on: " +
                        weakTopics.map(function(t) {
                            return StudyUI._escapeHtml(t);
                        }).join(", ") + ". Focus your next session on these areas."
                });
            }
        }

        // 5. Guided solution usage
        if (sd.guidedSolutionAccesses > 0) {
            recs.push({
                icon: SYMBOLS.LIGHTNING,
                title: "Walkthrough used " + sd.guidedSolutionAccesses + " time" +
                    (sd.guidedSolutionAccesses > 1 ? "s" : ""),
                detail: "That's fine for learning! Try the same problem types again next session without the walkthrough."
            });
        }

        return recs;
    },

    /**
     * Return to the study tab home screen.
     */
    returnToHome: function() {
        var startScreen = document.querySelector(".study-start-screen");
        var questionArea = document.getElementById("question-area");
        if (startScreen) startScreen.style.display = "block";
        if (questionArea) {
            questionArea.style.display = "none";
            questionArea.innerHTML = "";
        }
        UI.refreshStudyTab();
        window.scrollTo(0, 0);
    },

    // ---- TIMER METHODS ----

    /**
     * Format seconds as MM:SS.
     * @private
     */
    _formatTime: function(seconds) {
        var absSeconds = Math.abs(Math.floor(seconds));
        var m = Math.floor(absSeconds / 60);
        var s = absSeconds % 60;
        var prefix = seconds < 0 ? "+" : "";
        return prefix + m + ":" + (s < 10 ? "0" : "") + s;
    },

    /**
     * Start the question countdown timer.
     * @private
     */
    _startQuestionTimer: function(totalMarks) {
        // Clear any existing timer
        if (StudyUI._questionTimer && StudyUI._questionTimer.interval) {
            clearInterval(StudyUI._questionTimer.interval);
        }

        var allowedSec = totalMarks * 60;
        StudyUI._questionTimer = {
            interval: null,
            startTime: Date.now(),
            allowedSeconds: allowedSec,
            elapsed: 0,
            overtime: false
        };

        StudyUI._questionTimer.interval = setInterval(function() {
            var elapsed = Math.floor((Date.now() - StudyUI._questionTimer.startTime) / 1000);
            StudyUI._questionTimer.elapsed = elapsed;
            var remaining = StudyUI._questionTimer.allowedSeconds - elapsed;

            var displayEl = document.getElementById("timer-display");
            var timerEl = document.getElementById("question-timer");
            if (!displayEl || !timerEl) return;

            if (remaining > 0) {
                // Counting down
                displayEl.textContent = StudyUI._formatTime(remaining);
                StudyUI._questionTimer.overtime = false;
                timerEl.classList.remove("timer-overtime", "timer-warning");
                if (remaining <= 60) {
                    timerEl.classList.add("timer-warning");
                }
            } else {
                // Overtime - count up
                displayEl.textContent = "+" + StudyUI._formatTime(-remaining);
                StudyUI._questionTimer.overtime = true;
                timerEl.classList.remove("timer-warning");
                timerEl.classList.add("timer-overtime");
            }
        }, 1000);
    },

    /**
     * Stop the question timer and record timing data.
     * @private
     */
    _stopQuestionTimer: function() {
        if (!StudyUI._questionTimer) return;
        if (StudyUI._questionTimer.interval) {
            clearInterval(StudyUI._questionTimer.interval);
            StudyUI._questionTimer.interval = null;
        }

        var elapsed = Math.floor((Date.now() - StudyUI._questionTimer.startTime) / 1000);
        StudyUI._questionTimer.elapsed = elapsed;

        // Record timing for session summary
        var q = StudyUI.currentQuestion;
        if (q) {
            var pts = [];
            if (q.parts) {
                q.parts.forEach(function(p) {
                    if (p.problemType && pts.indexOf(p.problemType) === -1) {
                        pts.push(p.problemType);
                    }
                });
            }
            StudyUI._questionTimings.push({
                filename: StudyUI.currentFilename,
                reference: q.questionReference || StudyUI.currentFilename,
                totalMarks: q.totalMarks || 0,
                allowedSec: StudyUI._questionTimer.allowedSeconds,
                actualSec: elapsed,
                overtime: elapsed > StudyUI._questionTimer.allowedSeconds,
                partsCorrect: 0,  // updated later when results recorded
                partsTotal: q.parts ? q.parts.length : 0,
                problemTypes: pts
            });
        }

        // Freeze the timer display
        var timerEl = document.getElementById("question-timer");
        if (timerEl) timerEl.classList.add("timer-stopped");
    },

    /**
     * Update the last timing entry with correctness data after assessment.
     * Called from _recordResultsIfNeeded.
     * @private
     */
    _updateLastTiming: function() {
        if (StudyUI._questionTimings.length === 0) return;
        var last = StudyUI._questionTimings[StudyUI._questionTimings.length - 1];
        if (last.filename !== StudyUI.currentFilename) return;

        var correct = 0;
        Object.keys(StudyUI.partResults).forEach(function(label) {
            if (StudyUI.partResults[label].correct) correct++;
        });
        last.partsCorrect = correct;
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
                // Navigate to revision for this topic/concept (Phase S4 stub)
                var topic = cell.getAttribute("data-topic");
                var concept = cell.getAttribute("data-concept");
                console.log("Dashboard: Revise " + topic + " / " + concept);
                alert("Topic Revision for \"" + concept + "\" coming in Phase S4.");
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
                alert("Topic Revision for \"" + pt + "\" coming in Phase S4.");
            });
        });

        if (btnEl) {
            btnEl.onclick = function() {
                alert("Revise All Weak Areas coming in Phase S4.");
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
                    return l.shown !== false;
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

        var sched = QuestionEngine._scheduleData;
        if (!sched || !sched.schedule ||
            sched.schedule.length === 0) {
            el.innerHTML = "";
            if (emptyEl) emptyEl.style.display = "block";
            return;
        }
        if (emptyEl) emptyEl.style.display = "none";

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var masteryMap = this._cache.masteryMap;

        var html = "";
        sched.schedule.forEach(function(entry) {
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
// APP INITIALISATION
// ============================================================================
function initApp() {
    console.log("=== WACE Student Study Trainer v" + APP_VERSION + " (Cloud) ===");
    console.log("Initialising...");

    // Step 1: Fetch all data files from the server
    DataLoader.loadAll().then(function(loadedData) {

        // Step 2: Initialise Firebase (needed for access code check)
        if (typeof firebase !== "undefined" && FIREBASE_ENABLED) {
            if (!firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }
            // Get Firestore reference early and enable persistence before any reads
            var earlyDb = firebase.firestore();
            earlyDb.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
                console.warn("Firestore persistence:", err.code);
            });
        }

        // Step 3: Check access code
        return AccessControl.checkExistingAccess().then(function(access) {
            if (access.valid) {
                console.log("Access verified for: " + access.name);
                return { loadedData: loadedData, accessCode: access.code };
            } else if (access.disabled) {
                // Access has been revoked by teacher
                document.body.innerHTML =
                    "<div style=\"display:flex;justify-content:center;align-items:center;" +
                    "min-height:100vh;background:linear-gradient(135deg,#4a6cf7 0%,#2948ff 100%);\">" +
                    "<div style=\"background:white;border-radius:16px;padding:3em;max-width:500px;" +
                    "text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.15);\">" +
                    "<div style=\"font-size:3em;margin-bottom:0.3em;\">\uD83D\uDEAB</div>" +
                    "<h1 style=\"margin-bottom:0.5em;\">Access Disabled</h1>" +
                    "<p style=\"color:#666;line-height:1.6;\">Your access to the Study Trainer has been " +
                    "disabled by your teacher. If you think this is a mistake, please contact them.</p>" +
                    "</div></div>";
                return Promise.reject(new Error("ACCESS_DISABLED"));
            } else {
                // Show access code screen and wait
                return AccessControl.showCodeScreen().then(function(codeResult) {
                    return { loadedData: loadedData, accessCode: codeResult.code, needsClaim: codeResult.needsClaim };
                });
            }
        });

    }).then(function(context) {
        var loadedData = context.loadedData;

        // Step 4: Initialise question engine with fetched data
        QuestionEngine.init(loadedData);

        // Step 5: Initialise IndexedDB
        return DB.init().then(function() {
            // Step 6: Merge any imported questions (legacy support)
            return DB.getAll(STORE_IMPORTED);
        }).then(function(imported) {
            QuestionEngine.mergeImportedQuestions(imported);

            // Step 7: Get schedule updates from IndexedDB
            return DB.getAll(STORE_SCHEDULE_UPDATES);
        }).then(function(scheduleUpdates) {
            // Step 8: Check config for ahead-of-schedule setting
            return DB.get(STORE_CONFIG, "main").then(function(config) {
                var aheadOfSchedule = config ? !!config.aheadOfScheduleEnabled : false;

                // Step 9: Compute unlocked problem types
                QuestionEngine.computeUnlocked(scheduleUpdates, aheadOfSchedule);

                return { config: config, needsClaim: context.needsClaim };
            });
        }).then(function(result) {
            var config = result.config;

            // Step 10: Initialise UI event listeners
            UI.init();
            StudyUI.init();

            // Step 11: Initialise Firebase sync (if available)
            if (typeof FirebaseSync !== "undefined" && FirebaseSync.init) {
                FirebaseSync.init(config).catch(function(err) {
                    console.warn("Firebase sync not available:", err.message);
                });
            }

            // Step 12: Show welcome screen or main app
            if (!config) {
                console.log("First run detected - showing welcome screen");
                // Store needsClaim flag for the welcome screen handler
                window._needsAccessClaim = result.needsClaim;
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
                        "Equations will show as text. Check your internet connection."+
                        '<button onclick="this.parentNode.remove()" ' +
                        'style="margin-left:12px;cursor:pointer;border:none;' +
                        'background:none;font-size:1.1em;">&times;</button>';
                    var topBar = document.getElementById("top-bar");
                    if (topBar && topBar.parentNode) {
                        topBar.parentNode.insertBefore(banner, topBar.nextSibling);
                    }
                }
            }, 12000);
        });
    }).catch(function(err) {
        if (err.message === "ACCESS_DISABLED") return; // Already showing disabled message
        console.error("Initialisation failed:", err);
        // Show a basic error message
        document.body.innerHTML =
            "<div style=\"padding:2em;font-family:sans-serif;\">" +
            "<h1>Error Starting Study Trainer</h1>" +
            "<p>There was a problem initialising the application:</p>" +
            "<pre>" + (err.message || err) + "</pre>" +
            "<p>Check your internet connection and try refreshing the page.</p>" +
            "</div>";
    });
}

// Start when DOM is ready
window.addEventListener("DOMContentLoaded", initApp);
