// ============================================================================
// EXPORT / IMPORT MODULE (Phase S5)
// Progress reports, full backups, update imports.
// ============================================================================
var ExportImport = {

    /**
     * Export a progress report (subset of data useful for the teacher).
     * Includes: mastery records, session summaries, question history, confidence watch.
     */
    exportProgressReport: function() {
        Promise.all([
            DB.get(STORE_CONFIG, "main"),
            DB.getAll(STORE_MASTERY),
            DB.getAll(STORE_SESSIONS),
            DB.getAll(STORE_HISTORY),
            DB.getAll(STORE_CONFIDENCE)
        ]).then(function(results) {
            var config = results[0] || {};
            var mastery = results[1];
            var sessions = results[2];
            var history = results[3];
            var confidence = results[4];

            // Compute summary statistics
            var totalSessions = sessions.length;
            var totalQuestions = 0;
            var totalCorrect = 0;
            var totalAttempted = 0;
            var totalMinutes = 0;
            var guidedTotal = 0;

            sessions.forEach(function(s) {
                totalQuestions += (s.questionsAttempted || 0);
                totalCorrect += (s.partsCorrect || 0);
                totalAttempted += (s.partsAttempted || 0);
                totalMinutes += (s.durationMinutes || 0);
                guidedTotal += (s.guidedSolutionAccesses || 0);
            });

            var masteredCount = 0;
            var strugglingCount = 0;
            mastery.forEach(function(m) {
                if (m.status === "mastered") masteredCount++;
                if (m.status === "struggling") strugglingCount++;
            });

            var report = {
                reportType: "progressReport",
                generatedBy: "WACE Student Trainer v" + APP_VERSION,
                generatedAt: new Date().toISOString(),
                studentName: config.studentName || "Unknown",
                summary: {
                    totalSessions: totalSessions,
                    totalQuestionsAttempted: totalQuestions,
                    totalPartsAttempted: totalAttempted,
                    totalPartsCorrect: totalCorrect,
                    overallAccuracy: totalAttempted > 0 ?
                        Math.round((totalCorrect / totalAttempted) * 1000) / 10 : 0,
                    totalStudyMinutes: totalMinutes,
                    unlockedProblemTypes: QuestionEngine.unlockedProblemTypes.length,
                    masteredProblemTypes: masteredCount,
                    strugglingProblemTypes: strugglingCount,
                    guidedSolutionAccesses: guidedTotal,
                    confidenceWatchCount: confidence.length
                },
                mastery: mastery,
                sessions: sessions.map(function(s) {
                    // Strip any large data, keep summaries
                    return {
                        date: s.date,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        durationMinutes: s.durationMinutes,
                        mode: s.mode,
                        topicFilter: s.topicFilter,
                        questionsAttempted: s.questionsAttempted,
                        partsAttempted: s.partsAttempted,
                        partsCorrect: s.partsCorrect,
                        accuracyPercent: s.accuracyPercent,
                        newMasteries: s.newMasteries,
                        guidedSolutionAccesses: s.guidedSolutionAccesses,
                        topicBreakdown: s.topicBreakdown
                    };
                }),
                questionHistory: history,
                confidenceWatch: confidence
            };

            var filename = "Progress_" + (config.studentName || "Student").replace(/\s+/g, "_") +
                "_" + new Date().toISOString().split("T")[0] + ".json";
            ExportImport._downloadJSON(report, filename);
            ExportImport._showNotice("Progress report exported as " + filename);
        }).catch(function(err) {
            console.error("Export progress failed:", err);
            alert("Error exporting progress report: " + (err.message || err));
        });
    },

    /**
     * Export a full backup of all IndexedDB stores.
     */
    exportFullBackup: function() {
        var storeNames = OBJECT_STORES.map(function(s) { return s.name; });

        var promises = storeNames.map(function(name) {
            return DB.getAll(name).then(function(data) {
                return { store: name, data: data };
            });
        });

        Promise.all(promises).then(function(results) {
            var backup = {
                backupType: "fullBackup",
                generatedBy: "WACE Student Trainer v" + APP_VERSION,
                generatedAt: new Date().toISOString(),
                stores: {}
            };
            results.forEach(function(r) {
                backup.stores[r.store] = r.data;
            });

            var config = backup.stores[STORE_CONFIG];
            var studentName = "Student";
            if (config) {
                config.forEach(function(c) {
                    if (c.id === "main" && c.studentName) {
                        studentName = c.studentName;
                    }
                });
            }

            var filename = "Backup_" + studentName.replace(/\s+/g, "_") +
                "_" + new Date().toISOString().split("T")[0] + ".json";
            ExportImport._downloadJSON(backup, filename);
            ExportImport._showNotice("Full backup exported as " + filename);
        }).catch(function(err) {
            console.error("Export backup failed:", err);
            alert("Error exporting backup: " + (err.message || err));
        });
    },

    /**
     * Import a full backup from a JSON file.
     *
     * @param {File} file
     */
    importBackup: function(file) {
        if (!confirm("Import a backup? This will REPLACE all your current progress data.\n\n" +
            "Make sure you export a backup of your current data first if you want to keep it.")) {
            return;
        }

        ExportImport._readFile(file).then(function(text) {
            var backup;
            try {
                backup = JSON.parse(text);
            } catch (e) {
                alert("Error: The file is not valid JSON.");
                return;
            }

            if (!backup.stores || backup.backupType !== "fullBackup") {
                alert("Error: This doesn't appear to be a valid backup file.");
                return;
            }

            var storeNames = Object.keys(backup.stores);
            var promises = [];

            storeNames.forEach(function(storeName) {
                var items = backup.stores[storeName];
                if (!Array.isArray(items)) return;

                // Clear the store first, then add all items
                var p = DB.clear(storeName).then(function() {
                    var putPromises = items.map(function(item) {
                        return DB.put(storeName, item);
                    });
                    return Promise.all(putPromises);
                });
                promises.push(p);
            });

            return Promise.all(promises).then(function() {
                ExportImport._showNotice("Backup restored successfully. Refreshing...");
                // Reload the app to pick up the restored data
                setTimeout(function() {
                    window.location.reload();
                }, 1500);
            });
        }).catch(function(err) {
            console.error("Import backup failed:", err);
            alert("Error importing backup: " + (err.message || err));
        });
    },

    /**
     * Import a teacher update file (new questions, schedule updates, diagrams).
     *
     * @param {File} file
     */
    importUpdate: function(file) {
        ExportImport._readFile(file).then(function(text) {
            var update;
            try {
                update = JSON.parse(text);
            } catch (e) {
                alert("Error: The file is not valid JSON.");
                return;
            }

            if (!update.updateId) {
                alert("Error: This doesn't appear to be a valid update file.\n" +
                    "Update files should have an 'updateId' field.");
                return;
            }

            // Check if already imported
            return DB.get(STORE_SCHEDULE_UPDATES, update.updateId).then(function(existing) {
                if (existing) {
                    alert("This update (" + update.updateId + ") has already been imported.");
                    return;
                }

                var importedCount = 0;
                var promises = [];

                // 1. Import new questions
                if (update.questions && typeof update.questions === "object") {
                    var qKeys = Object.keys(update.questions);
                    qKeys.forEach(function(filename) {
                        var qData = update.questions[filename];
                        var record = {
                            filename: filename,
                            questionData: qData,
                            importedFrom: update.updateId,
                            importedAt: new Date().toISOString()
                        };
                        promises.push(DB.put(STORE_IMPORTED, record));
                        // Also merge into the live question engine
                        QuestionEngine.allQuestions[filename] = qData;
                        importedCount++;
                    });
                }

                // 2. Store schedule update
                if (update.scheduleUpdate) {
                    var schedEntry = {
                        updateId: update.updateId,
                        date: update.scheduleUpdate.date || update.updateDate,
                        label: update.scheduleUpdate.label || update.description || "",
                        problemTypes: update.scheduleUpdate.problemTypes || [],
                        importedAt: new Date().toISOString()
                    };
                    promises.push(DB.put(STORE_SCHEDULE_UPDATES, schedEntry));
                }

                // 3. Decode and cache diagrams
                if (update.newDiagrams && typeof update.newDiagrams === "object") {
                    var diagKeys = Object.keys(update.newDiagrams);
                    diagKeys.forEach(function(diagFilename) {
                        var dataUrl = update.newDiagrams[diagFilename];
                        promises.push(
                            DB.put(STORE_DIAGRAMS, {
                                filename: diagFilename,
                                dataUrl: dataUrl,
                                importedFrom: update.updateId
                            })
                        );
                    });
                }

                // 4. Record import in config
                promises.push(
                    DB.get(STORE_CONFIG, "main").then(function(config) {
                        if (!config) return;
                        if (!config.updatesImported) config.updatesImported = [];
                        config.updatesImported.push({
                            updateId: update.updateId,
                            date: update.updateDate || new Date().toISOString().split("T")[0],
                            description: update.description || "",
                            questionsAdded: importedCount,
                            importedAt: new Date().toISOString()
                        });
                        return DB.put(STORE_CONFIG, config);
                    })
                );

                return Promise.all(promises).then(function() {
                    // Recompute unlocked problem types with new schedule
                    return DB.getAll(STORE_SCHEDULE_UPDATES);
                }).then(function(scheduleUpdates) {
                    QuestionEngine.allProblemTypes = QuestionEngine._extractAllProblemTypes();
                    QuestionEngine.computeUnlocked(scheduleUpdates, false);

                    var msg = "Update imported: " + update.updateId;
                    if (importedCount > 0) {
                        msg += "\n" + importedCount + " new question" +
                            (importedCount !== 1 ? "s" : "") + " added.";
                    }
                    if (update.scheduleUpdate && update.scheduleUpdate.problemTypes) {
                        msg += "\n" + update.scheduleUpdate.problemTypes.length +
                            " problem type" +
                            (update.scheduleUpdate.problemTypes.length !== 1 ? "s" : "") +
                            " unlocked.";
                    }
                    ExportImport._showNotice(msg);
                    // Refresh current tab
                    UI.showTab(UI.currentTab);
                });
            });
        }).catch(function(err) {
            console.error("Import update failed:", err);
            alert("Error importing update: " + (err.message || err));
        });
    },

    // ---- PRIVATE HELPERS ----

    /**
     * Read a File object as text.
     * @private
     */
    _readFile: function(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) { resolve(e.target.result); };
            reader.onerror = function() { reject(new Error("Failed to read file")); };
            reader.readAsText(file);
        });
    },

    /**
     * Download a JSON object as a file.
     * @private
     */
    _downloadJSON: function(data, filename) {
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    },

    /**
     * Show a temporary notice banner at the top of the app.
     * @private
     */
    _showNotice: function(message) {
        var existing = document.querySelector(".export-import-notice");
        if (existing) existing.remove();

        var banner = document.createElement("div");
        banner.className = "export-import-notice";
        banner.innerHTML = SYMBOLS.CHECK + " " + message.replace(/\n/g, "<br>") +
            '<button onclick="this.parentNode.remove()" ' +
            'style="margin-left:12px;cursor:pointer;border:none;' +
            'background:none;font-size:1.1em;">&times;</button>';

        var topBar = document.getElementById("top-bar");
        if (topBar && topBar.parentNode) {
            topBar.parentNode.insertBefore(banner, topBar.nextSibling);
        }

        setTimeout(function() {
            if (banner.parentNode) banner.remove();
        }, 8000);
    }
};


