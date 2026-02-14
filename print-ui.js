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


