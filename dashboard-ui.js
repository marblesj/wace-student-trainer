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


