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


