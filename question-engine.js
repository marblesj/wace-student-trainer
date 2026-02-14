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
        // Filter out questions with empty parts array (e.g. WACE_2017_CF_Q04)
        if (questionData.parts.length === 0) return false;
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


