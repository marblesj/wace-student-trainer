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


