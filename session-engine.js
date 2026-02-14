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


