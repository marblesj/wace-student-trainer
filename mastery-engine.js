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


