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


