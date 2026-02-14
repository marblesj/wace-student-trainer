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
