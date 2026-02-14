// ============================================================================
// EXAM MODE MODULE
// Handles timed exam simulation: global timer, question navigation without
// feedback, canvas snapshot storage, batch marking, and results display.
// Works with both Stylus and Paper answer methods.
// ============================================================================
var ExamMode = {
    // State
    active: false,
    state: "inactive",  // "inactive" | "running" | "marking" | "results"

    // Exam config
    targetMarks: 50,
    totalSeconds: 0,
    remainingSeconds: 0,
    timerInterval: null,

    // Question tracking
    testAnswers: [],       // Array of { questionIndex, questionData, filename, partImages, timeSpent }
    examQuestions: [],     // Array of { questionData, filename } for all visited questions (supports prev/next)
    questionStartTime: null,
    currentExamIndex: 0,   // 0-based index of current question in this exam
    totalExamQuestions: 0,  // filled as we go (we don't know total upfront)
    accumulatedMarks: 0,   // running total of marks queued

    // ---- TIME CALCULATION ----

    /**
     * Calculate exam time in seconds from total marks.
     * Formula: 20s base + 35s per mark (calculation), 25s base + 50s per mark (context).
     * Uses a blended average: 22s base + 40s per mark.
     */
    calcTime: function(totalMarks) {
        return Math.round(22 + 40 * totalMarks);
    },

    /**
     * Format seconds as mm:ss.
     */
    formatTime: function(secs) {
        var m = Math.floor(Math.abs(secs) / 60);
        var s = Math.abs(secs) % 60;
        var prefix = secs < 0 ? "+" : "";
        return prefix + m + ":" + (s < 10 ? "0" : "") + s;
    },

    // ---- EXAM LIFECYCLE ----

    /**
     * Start an exam. Called after SessionEngine.start() completes.
     * @param {number} targetMarks - total mark target for this exam
     */
    start: function(targetMarks) {
        ExamMode.active = true;
        ExamMode.state = "running";
        ExamMode.targetMarks = targetMarks;
        ExamMode.totalSeconds = ExamMode.calcTime(targetMarks);
        ExamMode.remainingSeconds = ExamMode.totalSeconds;
        ExamMode.testAnswers = [];
        ExamMode.examQuestions = [];
        ExamMode.currentExamIndex = 0;
        ExamMode.totalExamQuestions = 0;
        ExamMode.accumulatedMarks = 0;
        ExamMode.questionStartTime = Date.now();

        // Start the global countdown timer
        ExamMode.startTimer();
    },

    /**
     * Start (or restart) the global exam countdown timer.
     */
    startTimer: function() {
        if (ExamMode.timerInterval) clearInterval(ExamMode.timerInterval);

        ExamMode.timerInterval = setInterval(function() {
            ExamMode.remainingSeconds--;
            ExamMode.updateTimerDisplay();

            if (ExamMode.remainingSeconds <= 0) {
                ExamMode.timeUp();
            }
        }, 1000);
    },

    /**
     * Update the exam timer display in the bottom bar.
     */
    updateTimerDisplay: function() {
        var display = document.getElementById("exam-timer-display");
        if (!display) return;

        display.textContent = ExamMode.formatTime(ExamMode.remainingSeconds);

        var bar = document.getElementById("exam-bottom-bar");
        if (!bar) return;

        // Warning colours
        if (ExamMode.remainingSeconds <= 60) {
            bar.className = "exam-bottom-bar exam-timer-critical";
        } else if (ExamMode.remainingSeconds <= 300) {
            bar.className = "exam-bottom-bar exam-timer-warning";
        } else {
            bar.className = "exam-bottom-bar";
        }
    },

    /**
     * Handle timer reaching zero.
     */
    timeUp: function() {
        clearInterval(ExamMode.timerInterval);
        ExamMode.timerInterval = null;

        // Show Time's Up overlay briefly
        var overlay = document.getElementById("exam-times-up-overlay");
        if (overlay) overlay.style.display = "flex";

        // Snapshot current question if stylus
        ExamMode.snapshotCurrentQuestion();

        // After a brief delay, begin marking
        setTimeout(function() {
            if (overlay) overlay.style.display = "none";
            ExamMode.endTest();
        }, 2000);
    },

    /**
     * Snapshot the current question's canvas images (stylus mode) and store.
     */
    snapshotCurrentQuestion: function() {
        var q = StudyUI.currentQuestion;
        var fn = StudyUI.currentFilename;
        if (!q) return;

        var partImages = {};
        var timeSpent = (Date.now() - ExamMode.questionStartTime) / 1000;

        if (SessionEngine.answerMethod === "stylus" && q.parts) {
            q.parts.forEach(function(part) {
                var dataUrl = WrittenMode.CanvasEngine.exportPNG(part.partLabel);
                if (dataUrl) {
                    partImages[part.partLabel] = dataUrl;
                }
            });
        }

        var entry = {
            questionIndex: ExamMode.currentExamIndex,
            questionData: q,
            filename: fn,
            partImages: partImages,
            timeSpent: Math.round(timeSpent),
            totalMarks: q.totalMarks || 0
        };

        // Update in-place if revisiting, otherwise push new entry
        if (ExamMode.testAnswers[ExamMode.currentExamIndex]) {
            // Accumulate time spent across visits
            entry.timeSpent += ExamMode.testAnswers[ExamMode.currentExamIndex].timeSpent;
            ExamMode.testAnswers[ExamMode.currentExamIndex] = entry;
        } else {
            ExamMode.testAnswers[ExamMode.currentExamIndex] = entry;
        }
    },

    /**
     * Move to the next question in exam mode.
     * Snapshots current canvas, clears, loads next question.
     */
    nextQuestion: function() {
        // Snapshot current question
        ExamMode.snapshotCurrentQuestion();
        ExamMode.currentExamIndex++;
        ExamMode.questionStartTime = Date.now();

        // Update accumulated marks from all answers so far
        var totalMarksSoFar = 0;
        ExamMode.testAnswers.forEach(function(ta) {
            if (ta) totalMarksSoFar += ta.totalMarks;
        });
        ExamMode.accumulatedMarks = totalMarksSoFar;

        // If we've already visited this question, restore it
        if (ExamMode.examQuestions[ExamMode.currentExamIndex]) {
            ExamMode._restoreExamQuestion(ExamMode.currentExamIndex);
            return;
        }

        // Check if we've accumulated enough marks before fetching more
        if (totalMarksSoFar >= ExamMode.targetMarks) {
            ExamMode._loadNextOrFinish();
            return;
        }

        // Load a brand new question through SessionEngine
        SessionEngine.getNext().then(function(result) {
            if (!result) {
                // No more questions available
                ExamMode.endTest();
                return;
            }
            ExamMode.totalExamQuestions = ExamMode.currentExamIndex + 1;
            StudyUI.renderQuestion(result);
            window.scrollTo(0, 0);
        });
    },

    /**
     * Navigate to the previous question in exam mode.
     * Snapshots current canvas, decrements index, restores previous question.
     */
    previousQuestion: function() {
        if (ExamMode.currentExamIndex <= 0) return;

        // Snapshot current question before leaving
        ExamMode.snapshotCurrentQuestion();
        ExamMode.currentExamIndex--;
        ExamMode.questionStartTime = Date.now();

        // Restore the previous question
        ExamMode._restoreExamQuestion(ExamMode.currentExamIndex);
    },

    /**
     * Restore a previously visited exam question (re-render + restore canvas from PNG).
     * @param {number} idx - index in examQuestions array
     */
    _restoreExamQuestion: function(idx) {
        var eq = ExamMode.examQuestions[idx];
        if (!eq) return;

        // Re-render the question
        StudyUI.renderQuestion({
            questionData: eq.questionData,
            filename: eq.filename,
            questionNumber: idx + 1
        });
        window.scrollTo(0, 0);

        // Restore canvas images from saved snapshots (stylus mode)
        var saved = ExamMode.testAnswers[idx];
        if (saved && saved.partImages && SessionEngine.answerMethod === "stylus") {
            // Wait for canvases to be initialized by renderQuestion
            setTimeout(function() {
                WrittenMode.initCanvasesForQuestion(eq.questionData);
                Object.keys(saved.partImages).forEach(function(partLabel) {
                    var dataUrl = saved.partImages[partLabel];
                    var state = WrittenMode.CanvasEngine.canvases[partLabel];
                    if (state && dataUrl) {
                        var img = new Image();
                        img.onload = function() {
                            state.ctx.globalCompositeOperation = "source-over";
                            state.ctx.clearRect(0, 0,
                                state.canvas.width / state.dpr,
                                state.canvas.height / state.dpr);
                            state.ctx.drawImage(img, 0, 0,
                                state.canvas.width / state.dpr,
                                state.canvas.height / state.dpr);
                            state.hasContent = true;
                            // Hide placeholder
                            var ph = state.canvas.parentElement
                                .querySelector(".wm-canvas-placeholder");
                            if (ph) ph.style.display = "none";
                        };
                        img.src = dataUrl;
                    }
                });
                WrittenMode.checkMarkButton();
            }, 100);
        }
    },

    /**
     * When enough marks are accumulated, offer to end or continue.
     */
    _loadNextOrFinish: function() {
        // Load one more question but make it clear the target is reached
        SessionEngine.getNext().then(function(result) {
            if (!result) {
                ExamMode.endTest();
                return;
            }
            ExamMode.totalExamQuestions = ExamMode.currentExamIndex + 1;
            StudyUI.renderQuestion(result);
            window.scrollTo(0, 0);
        });
    },

    /**
     * End the exam test. Triggered by "End Test" button or timer expiry.
     */
    endTest: function() {
        if (ExamMode.state !== "running") return;

        clearInterval(ExamMode.timerInterval);
        ExamMode.timerInterval = null;
        ExamMode.state = "marking";

        // Hide question area
        var questionArea = document.getElementById("question-area");
        if (questionArea) questionArea.style.display = "none";

        // Begin marking
        if (SessionEngine.answerMethod === "stylus") {
            ExamMode.batchMarkStylus();
        } else {
            ExamMode.batchSelfAssessPaper();
        }
    },

    // ---- BATCH MARKING (STYLUS) ----

    /**
     * Mark all exam questions sequentially via the AI API.
     * Shows progress as each question is marked.
     */
    batchMarkStylus: function() {
        var markingScreen = document.getElementById("exam-marking-screen");
        if (!markingScreen) return;
        markingScreen.style.display = "block";

        // Filter out any undefined entries (safety for sparse array)
        var answers = ExamMode.testAnswers.filter(function(a) { return !!a; });
        var total = answers.length;
        var html = '<div class="exam-marking-progress">';
        html += '<h2>\u2699\uFE0F Marking Your Test</h2>';
        html += '<div class="exam-marking-status" id="exam-marking-status">';
        html += 'Marking question 1 of ' + total + '...</div>';
        html += '<div class="exam-marking-bar-container">';
        html += '<div class="exam-marking-bar" id="exam-marking-bar" style="width:0%"></div>';
        html += '</div>';
        html += '<div class="exam-marking-log" id="exam-marking-log"></div>';
        html += '</div>';
        markingScreen.innerHTML = html;

        // Process questions sequentially with delay
        var results = [];
        var current = 0;

        function markNext() {
            if (current >= total) {
                ExamMode.showExamResults(results);
                return;
            }

            var answer = answers[current];
            var statusEl = document.getElementById("exam-marking-status");
            var barEl = document.getElementById("exam-marking-bar");
            var logEl = document.getElementById("exam-marking-log");

            if (statusEl) statusEl.textContent = "Marking question " + (current + 1) + " of " + total + "...";
            if (barEl) barEl.style.width = Math.round(((current) / total) * 100) + "%";

            // Check if any parts actually have canvas content
            var hasContent = Object.keys(answer.partImages).length > 0;
            if (!hasContent) {
                // No canvas content - treat as unanswered
                results.push({
                    answer: answer,
                    aiResult: null,
                    skipped: true
                });
                if (logEl) {
                    logEl.innerHTML += '<div class="exam-mark-log-item skipped">\u23ED Q' +
                        (current + 1) + ': Skipped (no answer written)</div>';
                }
                current++;
                setTimeout(markNext, 200);
                return;
            }

            ExamMode._markSingleQuestion(answer).then(function(aiResult) {
                // Run SymPy verification (non-blocking, graceful)
                WrittenMode._runSympyVerification(aiResult).then(function(sympyData) {
                    results.push({
                        answer: answer,
                        aiResult: aiResult,
                        sympyData: sympyData,
                        skipped: false
                    });

                    // Log success
                    var earned = 0;
                    var avail = 0;
                    if (aiResult && aiResult.parts) {
                        aiResult.parts.forEach(function(p) {
                            earned += p.totalAwarded;
                            avail += p.totalAvailable;
                        });
                    }
                    var verifyNote = sympyData ? " \u2713" : "";
                    if (logEl) {
                        logEl.innerHTML += '<div class="exam-mark-log-item done">\u2705 Q' +
                            (current + 1) + ': ' + earned + '/' + avail + ' marks' + verifyNote + '</div>';
                    }

                    if (barEl) barEl.style.width = Math.round(((current + 1) / total) * 100) + "%";
                    current++;
                    setTimeout(markNext, 1500); // Rate limit: 1.5s between calls
                });
            }).catch(function(err) {
                results.push({
                    answer: answer,
                    aiResult: null,
                    error: err.message,
                    skipped: false
                });
                if (logEl) {
                    logEl.innerHTML += '<div class="exam-mark-log-item error">\u274C Q' +
                        (current + 1) + ': Marking failed \u2014 ' +
                        err.message.substring(0, 60) + '</div>';
                }
                current++;
                setTimeout(markNext, 1000);
            });
        }

        markNext();
    },

    /**
     * Call the AI to mark a single question's canvas images.
     * @param {Object} answer - from testAnswers array
     * @returns {Promise<Object>} - AI marking result
     */
    _markSingleQuestion: function(answer) {
        if (!WrittenMode.hasMarkingAPI()) return Promise.reject(new Error("No marking API configured"));

        var q = answer.questionData;
        var systemPrompt = WrittenMode.buildSystemPrompt();

        // Collect reference solution images for draw-on parts (async)
        var refImagePromises = [];
        q.parts.forEach(function(part) {
            if (StudyUI._isDrawOnPart(part)) {
                var answerDiags = StudyUI._getAnswerDiagrams(q, part.partLabel);
                if (answerDiags.length > 0) {
                    var imgPath = StudyUI._getDiagramPath(answerDiags[0], q._pool);
                    refImagePromises.push(
                        WrittenMode._imageUrlToBase64(imgPath).then(function(b64) {
                            return { partLabel: part.partLabel, base64: b64 };
                        })
                    );
                }
            }
        });

        return Promise.all(refImagePromises).then(function(refImages) {
            var refMap = {};
            refImages.forEach(function(ri) {
                if (ri.base64) refMap[ri.partLabel] = ri.base64;
            });

            var contentBlocks = [];

            q.parts.forEach(function(part) {
                var isDrawOn = StudyUI._isDrawOnPart(part);
                var partInfo = "Part (" + part.partLabel + ") \u2014 " + part.partMarks + " marks\n" +
                    "Question: " + part.questionText + "\n\n";

                if (isDrawOn) {
                    partInfo += "NOTE: This is a VISUAL/GRAPHICAL question. The student drew their answer " +
                        "on the provided axes/table/graph. Compare their drawing against the reference " +
                        "solution image provided below.\n\n";
                }

                partInfo += "Marking criteria:\n";

                if (part.marking) {
                    part.marking.forEach(function(m, mi) {
                        var line = (mi + 1) + ". " + m.text + " [" + m.awarded + " mark(s)]";
                        if (m.type) line += " {type:" + m.type + "}";
                        if (m.deps && m.deps.length) line += " {deps:" + m.deps.join(",") + "}";
                        if (m.cao) line += " {CAO}";
                        if (m.isw) line += " {ISW}";
                        if (m.ft === false) line += " {no-FT}";
                        if (m.accuracy) line += " {accuracy:" + JSON.stringify(m.accuracy) + "}";
                        partInfo += line + "\n";
                    });
                }

                if (part.originalSolution) {
                    partInfo += "\nWorked solution for reference:\n";
                    part.originalSolution.forEach(function(sol, si) {
                        partInfo += (si + 1) + ". " + sol.text + "\n";
                    });
                }

                // Include reference solution image for draw-on parts
                if (isDrawOn && refMap[part.partLabel]) {
                    partInfo += "\nBelow is the REFERENCE SOLUTION (correct answer) for this visual question:";
                    contentBlocks.push({ type: "text", text: partInfo });
                    contentBlocks.push({
                        type: "image",
                        source: { type: "base64", media_type: "image/png", data: refMap[part.partLabel] }
                    });
                    contentBlocks.push({
                        type: "text",
                        text: "Below is the STUDENT'S DRAWING for Part (" + part.partLabel + "):"
                    });
                } else {
                    partInfo += "\nBelow is the student's handwritten answer for this part:";
                    contentBlocks.push({ type: "text", text: partInfo });
                }

                var dataUrl = answer.partImages[part.partLabel];
                if (dataUrl) {
                    var base64 = dataUrl.split(",")[1];
                    contentBlocks.push({
                        type: "image",
                        source: { type: "base64", media_type: "image/png", data: base64 }
                    });
                } else {
                    contentBlocks.push({ type: "text", text: "[No handwritten answer provided for this part]" });
                }
            });

            contentBlocks.push({
                type: "text",
                text: "Mark all parts. IMPORTANT: First read ALL parts' handwriting. " +
                      "Then mark each part. For multi-part questions, apply FOLLOW-THROUGH MARKING: " +
                      "if the student got an earlier part wrong but correctly used their wrong answer " +
                      "in later parts, award ALL marks in those later parts. The error is penalised " +
                      "ONLY in the part where it occurred. Respond with JSON only."
            });

            return WrittenMode._callClaudeAPI(systemPrompt, contentBlocks);
        })
        .then(function(resp) {
            if (!resp.ok) {
                return resp.json().then(function(data) {
                    throw new Error(data.error ? data.error.message : "API error " + resp.status);
                });
            }
            return resp.json();
        })
        .then(function(data) {
            var text = "";
            if (data.content) {
                data.content.forEach(function(block) {
                    if (block.type === "text") text += block.text;
                });
            }
            var cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
            return JSON.parse(cleaned);
        });
    },

    // ---- BATCH SELF-ASSESS (PAPER) ----

    /**
     * For Paper + Exam Mode: show all questions with solutions for batch self-assessment.
     * Student marks each question after the test ends.
     */
    batchSelfAssessPaper: function() {
        var resultsScreen = document.getElementById("exam-results-screen");
        if (!resultsScreen) return;
        resultsScreen.style.display = "block";

        // Filter out any undefined entries (safety for sparse array)
        var answers = ExamMode.testAnswers.filter(function(a) { return !!a; });
        var total = answers.length;
        var timeUsed = ExamMode.totalSeconds - ExamMode.remainingSeconds;

        var html = '<div class="exam-results">';
        html += '<div class="exam-results-header">';
        html += '<h2>\uD83D\uDCCB Exam Review</h2>';
        html += '<div class="exam-results-summary">';
        html += '<span>' + total + ' questions</span>';
        html += '<span>\u23F1 ' + ExamMode.formatTime(timeUsed) + ' used</span>';
        html += '</div></div>';
        html += '<p class="exam-paper-instructions">Review each question below. ' +
            'Check the solution and mark each criterion honestly.</p>';

        // For each question, show the question + solution with self-assessment
        answers.forEach(function(answer, qIdx) {
            var q = answer.questionData;
            html += '<div class="exam-result-question" data-exam-q="' + qIdx + '">';
            html += '<div class="exam-result-q-header">';
            html += '<h3>Question ' + (qIdx + 1) + ' \u2014 ' +
                (q.questionReference || answer.filename) + '</h3>';
            html += '<span class="badge badge-marks">' + (q.totalMarks || 0) + ' marks</span>';
            html += '</div>';

            // Show question text briefly
            if (q.questionStimulus) {
                html += '<div class="question-stimulus">' +
                    StudyUI._escapeHtml(q.questionStimulus) + '</div>';
            }

            // For each part: show solution + self-assessment checkboxes
            if (q.parts) {
                q.parts.forEach(function(part, pIdx) {
                    html += '<div class="exam-paper-part" data-exam-q="' + qIdx +
                        '" data-exam-p="' + pIdx + '">';
                    html += '<div class="part-header"><span class="part-label">(' +
                        StudyUI._escapeHtml(part.partLabel) + ')</span>';
                    html += '<span class="part-marks">[' + part.partMarks + ' mark' +
                        (part.partMarks !== 1 ? "s" : "") + ']</span></div>';
                    html += '<div class="part-text">' +
                        StudyUI._escapeHtml(part.questionText) + '</div>';

                    // Solution
                    if (part.originalSolution && part.originalSolution.length > 0) {
                        html += '<div class="solution-steps">';
                        part.originalSolution.forEach(function(sol) {
                            html += '<div class="solution-line">' +
                                StudyUI._renderSolutionText(sol.text) + '</div>';
                        });
                        html += '</div>';
                    }

                    // Self-assessment checkboxes for each marking criterion
                    if (part.marking && part.marking.length > 0) {
                        html += '<div class="exam-paper-criteria">';
                        part.marking.forEach(function(m, mIdx) {
                            var cbId = "exam-cb-" + qIdx + "-" + pIdx + "-" + mIdx;
                            html += '<label class="exam-criterion-label">';
                            html += '<input type="checkbox" id="' + cbId +
                                '" class="exam-criterion-cb" data-q="' + qIdx +
                                '" data-p="' + pIdx + '" data-m="' + mIdx + '"> ';
                            html += StudyUI._escapeHtml(m.text);
                            html += '</label>';
                        });
                        html += '</div>';
                    }

                    html += '</div>'; // .exam-paper-part
                });
            }

            html += '</div>'; // .exam-result-question
        });

        html += '<div class="exam-paper-submit">';
        html += '<button class="btn btn-primary btn-large" id="exam-paper-submit-btn">' +
            '\u2713 Submit Self-Assessment</button>';
        html += '</div>';
        html += '</div>'; // .exam-results

        resultsScreen.innerHTML = html;

        // Bind submit button
        var submitBtn = document.getElementById("exam-paper-submit-btn");
        if (submitBtn) {
            submitBtn.addEventListener("click", function() {
                ExamMode.submitPaperAssessment();
            });
        }

        UI.renderMath(resultsScreen);
    },

    /**
     * Collect paper self-assessment results and record them.
     */
    submitPaperAssessment: function() {
        var allResults = [];

        ExamMode.testAnswers.forEach(function(answer, qIdx) {
            var q = answer.questionData;
            var partResults = {};

            if (q.parts) {
                q.parts.forEach(function(part, pIdx) {
                    var totalCriteria = (part.marking || []).length;
                    var metCount = 0;
                    var failedCriteria = [];

                    (part.marking || []).forEach(function(m, mIdx) {
                        var cb = document.getElementById("exam-cb-" + qIdx + "-" + pIdx + "-" + mIdx);
                        if (cb && cb.checked) {
                            metCount++;
                        } else {
                            failedCriteria.push(mIdx);
                        }
                    });

                    var earned = 0;
                    (part.marking || []).forEach(function(m, mIdx) {
                        var cb = document.getElementById("exam-cb-" + qIdx + "-" + pIdx + "-" + mIdx);
                        if (cb && cb.checked) earned += (m.awarded || 1);
                    });

                    var isCorrect = (failedCriteria.length === 0);

                    partResults[part.partLabel] = {
                        correct: isCorrect,
                        correctButUnsure: false,
                        errorAtLine: isCorrect ? null : 1,
                        markingCriteriaFailed: failedCriteria,
                        marksEarned: earned,
                        marksAvailable: part.partMarks || 0,
                        answerMethod: "paper",
                        errorType: isCorrect ? null : "execution"
                    };
                });
            }

            allResults.push({
                answer: answer,
                partResults: partResults
            });
        });

        // Record all results to mastery system
        ExamMode._recordAllResults(allResults);
    },

    // ---- EXAM RESULTS SCREEN (STYLUS) ----

    /**
     * Show the full exam results screen after batch marking.
     * @param {Array} results - array of { answer, aiResult, skipped, error }
     */
    showExamResults: function(results) {
        var markingScreen = document.getElementById("exam-marking-screen");
        if (markingScreen) markingScreen.style.display = "none";

        var resultsScreen = document.getElementById("exam-results-screen");
        if (!resultsScreen) return;
        resultsScreen.style.display = "block";
        ExamMode.state = "results";

        // Calculate totals
        var totalEarned = 0;
        var totalAvailable = 0;
        var questionsMarked = 0;
        var questionsFailed = 0;
        var questionsSkipped = 0;

        results.forEach(function(r) {
            if (r.skipped) {
                questionsSkipped++;
                totalAvailable += r.answer.totalMarks || 0;
            } else if (r.aiResult && r.aiResult.parts) {
                questionsMarked++;
                r.aiResult.parts.forEach(function(p) {
                    totalEarned += p.totalAwarded;
                    totalAvailable += p.totalAvailable;
                });
            } else {
                questionsFailed++;
                totalAvailable += r.answer.totalMarks || 0;
            }
        });

        var timeUsed = ExamMode.totalSeconds - Math.max(0, ExamMode.remainingSeconds);
        var pct = totalAvailable > 0 ? Math.round((totalEarned / totalAvailable) * 100) : 0;

        var html = '<div class="exam-results">';

        // Summary header
        html += '<div class="exam-results-header">';
        html += '<h2>\uD83D\uDCCA Exam Results</h2>';
        html += '<div class="exam-score-big">';
        html += '<span class="exam-score-earned">' + totalEarned + '</span>';
        html += '<span class="exam-score-slash"> / </span>';
        html += '<span class="exam-score-total">' + totalAvailable + '</span>';
        html += '<span class="exam-score-pct"> (' + pct + '%)</span>';
        html += '</div>';
        html += '<div class="exam-results-summary">';
        html += '<span>\u23F1 Time used: ' + ExamMode.formatTime(timeUsed) + ' of ' +
            ExamMode.formatTime(ExamMode.totalSeconds) + '</span>';
        html += '<span>' + questionsMarked + ' marked';
        if (questionsSkipped > 0) html += ', ' + questionsSkipped + ' skipped';
        if (questionsFailed > 0) html += ', ' + questionsFailed + ' failed';
        html += '</span></div>';
        html += '</div>';

        // Per-question results
        results.forEach(function(r, qIdx) {
            var q = r.answer.questionData;
            html += '<div class="exam-result-question">';
            html += '<div class="exam-result-q-header">';
            html += '<h3>Question ' + (qIdx + 1) + ' \u2014 ' +
                (q.questionReference || r.answer.filename) + '</h3>';

            if (r.skipped) {
                html += '<span class="exam-q-score skipped">\u23ED Skipped</span>';
            } else if (r.aiResult) {
                var qEarned = 0;
                var qAvail = 0;
                r.aiResult.parts.forEach(function(p) {
                    qEarned += p.totalAwarded;
                    qAvail += p.totalAvailable;
                });
                var scoreClass = qEarned === qAvail ? "full" : qEarned > 0 ? "partial" : "zero";
                html += '<span class="exam-q-score ' + scoreClass + '">' +
                    qEarned + '/' + qAvail + '</span>';
            } else {
                html += '<span class="exam-q-score error">\u274C Failed</span>';
            }

            html += '</div>';

            // If AI result available, show per-part details
            if (r.aiResult && r.aiResult.parts) {
                r.aiResult.parts.forEach(function(partResult, pIdx) {
                    var questionPart = q.parts[pIdx];
                    if (!questionPart) return;

                    html += '<div class="exam-result-part">';
                    html += '<div class="exam-result-part-header">';
                    html += '<span>(' + StudyUI._escapeHtml(questionPart.partLabel) + ')</span>';
                    var prScoreClass = partResult.totalAwarded === partResult.totalAvailable ?
                        "full" : partResult.totalAwarded > 0 ? "partial" : "zero";
                    html += '<span class="exam-part-score ' + prScoreClass + '">' +
                        partResult.totalAwarded + '/' + partResult.totalAvailable + '</span>';
                    html += '</div>';

                    // Side-by-side: canvas snapshot + worked solution
                    html += '<div class="exam-result-compare">';

                    // Student's answer (canvas snapshot)
                    var imgUrl = r.answer.partImages[questionPart.partLabel];
                    if (imgUrl) {
                        html += '<div class="exam-student-answer">';
                        html += '<div class="exam-compare-label">Your Answer</div>';
                        html += '<img src="' + imgUrl + '" class="exam-canvas-snapshot" ' +
                            'alt="Your handwritten answer">';
                        html += '</div>';
                    }

                    // Worked solution
                    if (questionPart.originalSolution && questionPart.originalSolution.length > 0) {
                        html += '<div class="exam-worked-solution">';
                        html += '<div class="exam-compare-label">Worked Solution</div>';
                        questionPart.originalSolution.forEach(function(sol, si) {
                            var lineClass = "exam-sol-line";
                            // Colour-code based on error location
                            if (partResult.errorLine !== null && partResult.errorLine !== undefined) {
                                if (si + 1 < partResult.errorLine) lineClass += " correct";
                                else if (si + 1 === partResult.errorLine) lineClass += " error-here";
                            } else {
                                lineClass += " correct";
                            }
                            html += '<div class="' + lineClass + '">' +
                                (si + 1) + '. ' + StudyUI._renderSolutionText(sol.text) + '</div>';
                        });
                        html += '</div>';
                    }

                    html += '</div>'; // .exam-result-compare

                    // Marking criteria
                    if (partResult.marks && partResult.marks.length > 0) {
                        html += '<div class="exam-criteria-list">';
                        partResult.marks.forEach(function(mark) {
                            var cls = mark.awarded ? "met" : "not-met";
                            // SymPy verification badge for exam mode
                            var examVerifyBadge = "";
                            if (r.sympyData && r.sympyData.perCriterion) {
                                var evKey = questionPart.partLabel + "-" + mark.criterionIndex;
                                var evResult = r.sympyData.perCriterion[evKey];
                                if (evResult) {
                                    if (evResult.status === "verified") {
                                        examVerifyBadge = ' <span class="wm-sympy-badge verified" title="' +
                                            StudyUI._escapeHtml(evResult.details) + '">\u2713 verified</span>';
                                    } else if (evResult.status === "disagree") {
                                        examVerifyBadge = ' <span class="wm-sympy-badge disagree" title="' +
                                            StudyUI._escapeHtml(evResult.details) + '">\u26A0\uFE0F check</span>';
                                    }
                                }
                            }
                            html += '<div class="exam-criterion ' + cls + '">';
                            html += '<span class="exam-criterion-icon">' +
                                (mark.awarded ? "\u2713" : "\u2717") + '</span> ';
                            html += StudyUI._escapeHtml(mark.text) + examVerifyBadge;
                            html += '</div>';
                        });
                        html += '</div>';
                    }

                    // Error diagnosis
                    if (partResult.errorDiagnosis) {
                        html += '<div class="exam-error-diagnosis">';
                        html += '<strong>\u26A0\uFE0F Error:</strong> ' +
                            StudyUI._escapeHtml(partResult.errorDiagnosis);
                        html += '</div>';
                    }

                    html += '</div>'; // .exam-result-part
                });
            }

            html += '</div>'; // .exam-result-question
        });

        // Finish button
        html += '<div class="exam-results-footer">';
        html += '<button class="btn btn-primary btn-large" id="exam-finish-btn">' +
            'Done \u2014 Return to Study</button>';
        html += '</div>';
        html += '</div>'; // .exam-results

        resultsScreen.innerHTML = html;
        UI.renderMath(resultsScreen);

        // Bind finish button
        var finishBtn = document.getElementById("exam-finish-btn");
        if (finishBtn) {
            finishBtn.addEventListener("click", function() {
                ExamMode.finish();
            });
        }

        // Record all results to mastery system
        ExamMode._recordStylusResults(results);
    },

    // ---- RECORDING RESULTS ----

    /**
     * Record stylus exam results into the mastery system.
     */
    _recordStylusResults: function(results) {
        var chain = Promise.resolve();

        results.forEach(function(r) {
            if (r.skipped || !r.aiResult || !r.aiResult.parts) return;

            var q = r.answer.questionData;
            var fn = r.answer.filename;
            var partResults = {};

            q.parts.forEach(function(part, idx) {
                var partResult = r.aiResult.parts[idx];
                if (!partResult) return;

                var totalMarks = part.partMarks || 0;
                var earned = partResult.totalAwarded || 0;
                var isCorrect = (earned === totalMarks);

                var failedCriteria = [];
                if (partResult.marks) {
                    partResult.marks.forEach(function(mark) {
                        if (!mark.awarded && mark.criterionIndex !== undefined) {
                            failedCriteria.push(mark.criterionIndex);
                        }
                    });
                }

                partResults[part.partLabel] = {
                    correct: isCorrect,
                    correctButUnsure: false,
                    errorAtLine: isCorrect ? null : (partResult.errorLine || 1),
                    markingCriteriaFailed: failedCriteria,
                    marksEarned: earned,
                    marksAvailable: totalMarks,
                    answerMethod: "stylus",
                    errorType: isCorrect ? null : (partResult.errorType || "execution")
                };
            });

            chain = chain.then(function() {
                return SessionEngine.recordResults(fn, partResults);
            });
        });

        return chain;
    },

    /**
     * Record paper exam results (from batch self-assessment).
     */
    _recordAllResults: function(allResults) {
        var chain = Promise.resolve();

        allResults.forEach(function(r) {
            chain = chain.then(function() {
                return SessionEngine.recordResults(r.answer.filename, r.partResults);
            });
        });

        chain.then(function() {
            // Show summary after recording
            ExamMode._showPaperSummary(allResults);
        });
    },

    /**
     * Show a summary screen after paper self-assessment submission.
     */
    _showPaperSummary: function(allResults) {
        var resultsScreen = document.getElementById("exam-results-screen");
        if (!resultsScreen) return;

        var totalEarned = 0;
        var totalAvail = 0;
        allResults.forEach(function(r) {
            Object.keys(r.partResults).forEach(function(key) {
                totalEarned += r.partResults[key].marksEarned || 0;
                totalAvail += r.partResults[key].marksAvailable || 0;
            });
        });

        var pct = totalAvail > 0 ? Math.round((totalEarned / totalAvail) * 100) : 0;
        var timeUsed = ExamMode.totalSeconds - Math.max(0, ExamMode.remainingSeconds);

        var html = '<div class="exam-results">';
        html += '<div class="exam-results-header">';
        html += '<h2>\u2705 Self-Assessment Complete</h2>';
        html += '<div class="exam-score-big">';
        html += '<span class="exam-score-earned">' + totalEarned + '</span>';
        html += '<span class="exam-score-slash"> / </span>';
        html += '<span class="exam-score-total">' + totalAvail + '</span>';
        html += '<span class="exam-score-pct"> (' + pct + '%)</span>';
        html += '</div>';
        html += '<div class="exam-results-summary">';
        html += '<span>\u23F1 Time used: ' + ExamMode.formatTime(timeUsed) + '</span>';
        html += '<span>' + allResults.length + ' questions assessed</span>';
        html += '</div></div>';
        html += '<div class="exam-results-footer">';
        html += '<button class="btn btn-primary btn-large" id="exam-finish-btn">' +
            'Done \u2014 Return to Study</button>';
        html += '</div></div>';

        resultsScreen.innerHTML = html;

        var finishBtn = document.getElementById("exam-finish-btn");
        if (finishBtn) {
            finishBtn.addEventListener("click", function() {
                ExamMode.finish();
            });
        }
    },

    /**
     * Finish the exam and return to the study start screen.
     */
    finish: function() {
        ExamMode.active = false;
        ExamMode.state = "inactive";
        ExamMode.testAnswers = [];
        ExamMode.examQuestions = [];

        if (ExamMode.timerInterval) {
            clearInterval(ExamMode.timerInterval);
            ExamMode.timerInterval = null;
        }

        // Hide results/marking screens
        var markingScreen = document.getElementById("exam-marking-screen");
        if (markingScreen) markingScreen.style.display = "none";
        var resultsScreen = document.getElementById("exam-results-screen");
        if (resultsScreen) resultsScreen.style.display = "none";

        // End the session and show summary
        SessionEngine.active = false;
        StudyUI.showSessionSummary();
    },

    // ---- RENDER HELPERS ----

    /**
     * Render the exam-mode bottom bar (replaces the normal mark bar / solution prompt).
     * @returns {string} HTML string
     */
    renderBottomBar: function() {
        var qNum = ExamMode.currentExamIndex + 1;
        var totalVisited = ExamMode.examQuestions.length || qNum;
        var html = '<div class="exam-bottom-bar" id="exam-bottom-bar">';
        html += '<div class="exam-bar-inner">';
        html += '<div class="exam-timer">';
        html += '<span class="exam-timer-icon">\u23F0</span>';
        html += '<span class="exam-timer-display" id="exam-timer-display">' +
            ExamMode.formatTime(ExamMode.remainingSeconds) + '</span>';
        html += '</div>';
        html += '<div class="exam-q-counter" id="exam-q-counter">Q ' + qNum +
            ' of ' + totalVisited + '</div>';
        html += '<div class="exam-bar-buttons">';
        html += '<button class="btn exam-prev-btn" id="exam-prev-btn"' +
            (ExamMode.currentExamIndex <= 0 ? ' disabled' : '') +
            '>\u2190 Previous</button>';
        html += '<button class="btn btn-primary exam-next-btn" id="exam-next-btn">' +
            'Next Question \u2192</button>';
        html += '<button class="btn btn-danger exam-end-btn" id="exam-end-btn">' +
            'End Test</button>';
        html += '</div>';
        html += '</div></div>';
        return html;
    }
};
var UI = {
    currentTab: "study",

    /**
     * Initialise all UI event listeners.
     */
    init: function() {
        // Tab navigation
        var tabBtns = document.querySelectorAll(".tab-btn");
        tabBtns.forEach(function(btn) {
            btn.addEventListener("click", function() {
                UI.showTab(btn.getAttribute("data-tab"));
            });
        });

        // Welcome screen
        var nameInput = document.getElementById("student-name-input");
        var startBtn = document.getElementById("welcome-start-btn");
        if (nameInput) {
            nameInput.addEventListener("input", function() {
                var name = nameInput.value.trim();
                startBtn.disabled = name.length < 1;
            });
            nameInput.addEventListener("keydown", function(e) {
                if (e.key === "Enter" && !startBtn.disabled) {
                    startBtn.click();
                }
            });
        }
        if (startBtn) {
            startBtn.addEventListener("click", function() {
                UI.handleWelcomeSubmit();
            });
        }

        // Dark mode quick toggle
        var themeToggle = document.getElementById("theme-toggle-btn");
        if (themeToggle) {
            themeToggle.addEventListener("click", function() {
                var isDark = document.body.classList.contains("dark-theme");
                var newTheme = isDark ? "light" : "dark";
                UI.applyTheme(newTheme);
                UI.savePreference("theme", newTheme);
                // Keep settings dropdown in sync
                var themeSelect = document.getElementById("pref-theme");
                if (themeSelect) themeSelect.value = newTheme;
            });
        }

        // Settings modal
        var settingsBtn = document.getElementById("settings-btn");
        var settingsClose = document.getElementById("settings-close-btn");
        var settingsModal = document.getElementById("settings-modal");
        if (settingsBtn) {
            settingsBtn.addEventListener("click", function() {
                UI.openSettings();
            });
        }
        if (settingsClose) {
            settingsClose.addEventListener("click", function() {
                settingsModal.style.display = "none";
            });
        }
        if (settingsModal) {
            settingsModal.addEventListener("click", function(e) {
                if (e.target === settingsModal) {
                    settingsModal.style.display = "none";
                }
            });
        }

        // Theme preference
        var themeSelect = document.getElementById("pref-theme");
        if (themeSelect) {
            themeSelect.addEventListener("change", function() {
                UI.applyTheme(themeSelect.value);
                UI.savePreference("theme", themeSelect.value);
            });
        }

        // Preference checkboxes
        ["pref-difficulty", "pref-examiner", "pref-timer"].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener("change", function() {
                    var key = id.replace("pref-", "show") + "Enabled";
                    if (id === "pref-difficulty") key = "showDifficultyBadges";
                    if (id === "pref-examiner") key = "showExaminerComments";
                    if (id === "pref-timer") key = "showTimerSuggestions";
                    UI.savePreference(key, el.checked);
                });
            }
        });

        // Session time slider
        var timeInput = document.getElementById("session-time-input");
        var timeDisplay = document.getElementById("session-time-display");
        if (timeInput && timeDisplay) {
            timeInput.addEventListener("input", function() {
                timeDisplay.textContent = timeInput.value + " min";
                StudyUI.updateQuestionEstimate();
            });
        }

        // Config toggle groups (section filter, focus filter, marking mode, etc.)
        var toggleGroups = document.querySelectorAll(".config-toggle-group");
        toggleGroups.forEach(function(group) {
            var buttons = group.querySelectorAll(".config-toggle");
            buttons.forEach(function(btn) {
                btn.addEventListener("click", function() {
                    // Deselect siblings, select this one
                    buttons.forEach(function(b) {
                        b.setAttribute("aria-pressed", "false");
                    });
                    btn.setAttribute("aria-pressed", "true");
                    StudyUI.updateQuestionEstimate();

                    // If this is the marking mode toggle, show/hide exam config
                    if (group.id === "study-marking-mode-group") {
                        var isExam = btn.getAttribute("data-value") === "exam";
                        var examRow = document.getElementById("exam-config-row");
                        var timeRow = document.getElementById("study-time-row");
                        if (examRow) examRow.style.display = isExam ? "" : "none";
                        if (timeRow) timeRow.style.display = isExam ? "none" : "";
                        if (isExam) StudyUI.updateExamTimeCalc();
                    }
                });
            });
        });

        // Exam marks select: update time calculation
        var examSelect = document.getElementById("exam-marks-select");
        if (examSelect) {
            examSelect.addEventListener("change", function() {
                StudyUI.updateExamTimeCalc();
            });
        }

        // Import/export buttons (Phase S5)
        document.getElementById("btn-import-update").addEventListener("click", function() {
            document.getElementById("file-input-update").click();
        });
        document.getElementById("file-input-update").addEventListener("change", function(e) {
            if (e.target.files && e.target.files[0]) {
                ExportImport.importUpdate(e.target.files[0]);
                e.target.value = ""; // reset so same file can be re-imported
            }
        });
        document.getElementById("btn-export-progress").addEventListener("click", function() {
            ExportImport.exportProgressReport();
        });
        document.getElementById("btn-export-backup").addEventListener("click", function() {
            ExportImport.exportFullBackup();
        });
        document.getElementById("btn-import-backup").addEventListener("click", function() {
            document.getElementById("file-input-backup").click();
        });
        document.getElementById("file-input-backup").addEventListener("change", function(e) {
            if (e.target.files && e.target.files[0]) {
                ExportImport.importBackup(e.target.files[0]);
                e.target.value = "";
            }
        });
        document.getElementById("btn-clear-diagram-cache").addEventListener("click", function() {
            if (confirm("Clear cached diagram images from imported updates?\n\n" +
                "Diagrams that exist as PNG files in the diagrams folder will still work. " +
                "Only diagrams imported from update files will be removed.")) {
                UI.clearDiagramCache();
            }
        });

        // Emergency reset button
        var resetBtn = document.getElementById("btn-emergency-reset");
        if (resetBtn) {
            resetBtn.addEventListener("click", function() {
                if (confirm("WARNING: This will permanently erase ALL your progress, " +
                    "mastery records, session history, and settings.\n\n" +
                    "This cannot be undone. Are you sure?")) {
                    DB.emergencyReset();
                }
            });
        }
    },

    /**
     * Switch to a named tab.
     */
    showTab: function(tabName) {
        UI.currentTab = tabName;

        // Update tab buttons
        document.querySelectorAll(".tab-btn").forEach(function(btn) {
            btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
        });

        // Update tab panels
        document.querySelectorAll(".tab-panel").forEach(function(panel) {
            panel.classList.toggle("active", panel.id === "tab-" + tabName);
        });

        // Trigger tab-specific refresh
        if (tabName === "study") {
            UI.refreshStudyTab();
        } else if (tabName === "revise") {
            ReviseUI.refresh();
        } else if (tabName === "print") {
            PrintUI.refresh();
        } else if (tabName === "dashboard") {
            DashboardUI.refresh();
        }
    },

    /**
     * Show the welcome screen for first-run setup.
     */
    showWelcomeScreen: function() {
        var codeScreen = document.getElementById("access-code-screen");
        if (codeScreen) codeScreen.style.display = "none";
        document.getElementById("welcome-screen").style.display = "flex";
        document.getElementById("app-container").style.display = "none";

        // Populate schedule info
        var info = QuestionEngine.getScheduleInfo();
        var classInfo = document.getElementById("welcome-class-info");
        var schedInfo = document.getElementById("welcome-schedule-info");

        // Update subtitle from schedule className
        var subtitle = document.getElementById("welcome-subtitle");
        if (subtitle && info.className && info.className !== "Unknown Class") {
            subtitle.textContent = info.className;
        }

        if (classInfo) {
            classInfo.textContent = "Class: " + info.className;
        }
        if (schedInfo) {
            var totalPts = QuestionEngine.allProblemTypes.length;
            var qCount = Object.keys(QuestionEngine.allQuestions).length;
            schedInfo.textContent = qCount + " questions covering " +
                totalPts + " problem types";
        }

        // Set welcome icon
        var iconArea = document.getElementById("welcome-icon-area");
        if (iconArea) {
            iconArea.textContent = SYMBOLS.GRADUATION;
        }

        // Focus name input
        setTimeout(function() {
            var input = document.getElementById("student-name-input");
            if (input) input.focus();
        }, 100);
    },

    /**
     * Handle the welcome form submission (save student name, show main app).
     */
    handleWelcomeSubmit: function() {
        var name = document.getElementById("student-name-input").value.trim();
        if (!name) return;

        var config = {
            id: "main",
            studentName: name,
            startedDate: new Date().toISOString().split("T")[0],
            appVersion: APP_VERSION,
            theme: "light",
            showTimerSuggestions: true,
            showExaminerComments: true,
            showDifficultyBadges: true,
            aheadOfScheduleEnabled: false,
            sessionGoal: 10,
            updatesImported: []
        };

        DB.put(STORE_CONFIG, config).then(function() {
            console.log("Config saved for: " + name);

            // Complete access code claim if applicable
            if (typeof AccessControl !== "undefined" &&
                typeof AccessControl.completeClaim === "function") {
                AccessControl.completeClaim(name);
            }

            UI.showMainApp(config);
        }).catch(function(err) {
            console.error("Failed to save config:", err);
            // Show app anyway
            UI.showMainApp(config);
        });
    },

    /**
     * Show the main application (after welcome or on returning user).
     */
    showMainApp: function(config) {
        document.getElementById("welcome-screen").style.display = "none";
        var codeScreen = document.getElementById("access-code-screen");
        if (codeScreen) codeScreen.style.display = "none";
        document.getElementById("app-container").style.display = "block";

        // Set student name in header
        var nameDisplay = document.getElementById("student-name-display");
        if (nameDisplay && config) {
            nameDisplay.textContent = config.studentName;
        }

        // Apply saved theme
        if (config && config.theme) {
            UI.applyTheme(config.theme);
        }

        // Apply saved preferences to settings checkboxes
        if (config) {
            var themeSelect = document.getElementById("pref-theme");
            if (themeSelect) themeSelect.value = config.theme || "light";

            var diffCheck = document.getElementById("pref-difficulty");
            if (diffCheck) diffCheck.checked = config.showDifficultyBadges !== false;

            var examCheck = document.getElementById("pref-examiner");
            if (examCheck) examCheck.checked = config.showExaminerComments !== false;

            var timerCheck = document.getElementById("pref-timer");
            if (timerCheck) timerCheck.checked = config.showTimerSuggestions !== false;
        }

        // Show study tab by default
        UI.showTab("study");
    },

    /**
     * Refresh the study tab with current stats.
     */
    refreshStudyTab: function() {
        // Update unlocked count
        var unlockedEl = document.getElementById("stat-unlocked");
        if (unlockedEl) {
            unlockedEl.textContent = QuestionEngine.unlockedProblemTypes.length;
        }

        // Update mastered count, review count, and streak
        MasteryEngine.getSummary().then(function(summary) {
            var masteredEl = document.getElementById("stat-mastered");
            if (masteredEl) {
                masteredEl.textContent = summary.mastered;
            }
            // Show review-due card if there are items due
            var reviewCard = document.getElementById("stat-review-card");
            var reviewEl = document.getElementById("stat-review");
            if (reviewCard && reviewEl) {
                if (summary.review > 0) {
                    reviewCard.style.display = "";
                    reviewEl.textContent = summary.review;
                } else {
                    reviewCard.style.display = "none";
                }
            }
        });

        MasteryEngine.getStreak().then(function(streak) {
            var streakEl = document.getElementById("stat-streak");
            if (streakEl) {
                streakEl.textContent = streak;
            }
        });

        // Exam readiness ring
        MasteryEngine.getExamReadiness().then(function(result) {
            var valueEl = document.getElementById("readiness-value");
            var arcEl = document.getElementById("readiness-arc");
            var container = document.getElementById("readiness-container");
            if (!valueEl || !arcEl) return;

            var score = result.score;
            valueEl.textContent = score + "%";

            // Animate the ring: circumference = 2 * pi * 52 = 326.73
            var circumference = 326.73;
            var offset = circumference - (score / 100) * circumference;
            arcEl.style.strokeDashoffset = offset;

            // Colour based on score
            var color;
            if (score >= 70) color = "var(--color-success)";
            else if (score >= 40) color = "var(--color-warning)";
            else color = "var(--color-danger)";
            arcEl.style.stroke = color;

            // Show topic breakdown as tooltip-style hint
            if (container && result.topicScores) {
                var topics = Object.keys(result.topicScores);
                if (topics.length > 0) {
                    var hints = topics.map(function(t) {
                        return t + ": " + result.topicScores[t] + "%";
                    });
                    container.title = "Per topic: " + hints.join(", ");
                }
            }
        });

        // Schedule hint
        var hintEl = document.getElementById("study-schedule-hint");
        var info = QuestionEngine.getScheduleInfo();
        if (hintEl) {
            var avail = Object.keys(QuestionEngine.getAvailableQuestions()).length;
            var msg = avail + " questions available";
            if (info.nextUnlock) {
                msg += " " + SYMBOLS.BULLET + " Next unlock: " + info.nextUnlock.label;
            }
            hintEl.textContent = msg;
        }

        // Update question estimate
        StudyUI.updateQuestionEstimate();
    },

    /**
     * Open the settings modal.
     */
    openSettings: function() {
        var modal = document.getElementById("settings-modal");
        if (modal) {
            modal.style.display = "flex";
        }

        // Populate about text
        var aboutEl = document.getElementById("settings-about-text");
        var statsEl = document.getElementById("settings-data-stats");
        var info = QuestionEngine.getScheduleInfo();
        var pools = QuestionEngine.getPoolCounts();

        if (aboutEl) {
            aboutEl.textContent = "Version " + APP_VERSION +
                " " + SYMBOLS.BULLET + " " + info.className;
        }
        if (statsEl) {
            statsEl.textContent = pools.total + " questions (" +
                pools.original + " original, " + pools.practice + " practice) " +
                SYMBOLS.BULLET + " " +
                QuestionEngine.unlockedProblemTypes.length + " problem types unlocked";
        }

        // SymPy verification status
        var sympyEl = document.getElementById("settings-sympy-status");
        if (sympyEl) {
            var markEndpoint = WrittenMode.getMarkEndpoint();
            var sympyEndpoint = WrittenMode.getSympyEndpoint();
            var lines = [];
            if (markEndpoint) {
                lines.push('\u2705 AI Marking: <span style="color:var(--correct-green)">proxy enabled</span>');
            } else if (WrittenMode.getApiKey()) {
                lines.push('\u2705 AI Marking: <span style="color:var(--correct-green)">direct API</span>');
            } else {
                lines.push('\u2014 AI Marking: <span style="color:var(--text-muted)">not configured</span>');
            }
            if (sympyEndpoint) {
                lines.push('\u2705 SymPy verification: <span style="color:var(--correct-green)">enabled</span>');
            } else {
                lines.push('\u2014 SymPy verification: <span style="color:var(--text-muted)">not configured</span>');
            }
            sympyEl.innerHTML = lines.join('<br>');
        }

        // Check storage usage
        UI.updateStorageDisplay();
    },

    /**
     * Check and display storage usage in settings.
     */
    updateStorageDisplay: function() {
        var textEl = document.getElementById("storage-usage-text");
        var barContainer = document.getElementById("storage-bar-container");
        var barFill = document.getElementById("storage-bar-fill");

        if (!textEl) return;

        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(function(estimate) {
                var usedMB = (estimate.usage / (1024 * 1024)).toFixed(1);
                var quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
                var pct = estimate.quota > 0 ?
                    ((estimate.usage / estimate.quota) * 100).toFixed(1) : 0;

                textEl.textContent = usedMB + " MB used of " + quotaMB + " MB available";

                if (barContainer && barFill) {
                    barContainer.style.display = "block";
                    barFill.style.width = Math.min(pct, 100) + "%";

                    // Colour based on usage
                    if (pct > 80) {
                        barFill.style.background = "var(--color-danger)";
                        textEl.textContent += " " + SYMBOLS.CIRCLE_RED + " Storage is getting full!";
                    } else if (pct > 50) {
                        barFill.style.background = "var(--color-warning)";
                    } else {
                        barFill.style.background = "var(--color-success)";
                    }
                }

                // Warn if usage is high
                if (estimate.usage > 50 * 1024 * 1024) {
                    textEl.textContent += " Consider clearing the diagram cache.";
                }
            }).catch(function() {
                textEl.textContent = "Unable to check storage usage";
            });
        } else {
            textEl.textContent = "Storage estimate not available in this browser";
        }
    },

    /**
     * Clear the diagram cache (imported update diagrams stored in IndexedDB).
     */
    clearDiagramCache: function() {
        DB.clear(STORE_DIAGRAMS).then(function() {
            alert("Diagram cache cleared. Imported diagram images will need " +
                "to be re-imported if their PNG files are not in the diagrams folder.");
            UI.updateStorageDisplay();
        }).catch(function(err) {
            console.error("Failed to clear diagram cache:", err);
            alert("Failed to clear cache: " + err.message);
        });
    },

    /**
     * Apply a theme (light or dark).
     */
    applyTheme: function(theme) {
        document.body.classList.toggle("dark-theme", theme === "dark");
        // Update toggle icon: show sun when dark (click for light), moon when light (click for dark)
        var icon = document.getElementById("theme-icon");
        if (icon) {
            icon.textContent = theme === "dark" ? SYMBOLS.SUN : SYMBOLS.MOON;
        }
    },

    /**
     * Save a single preference key to the config in IndexedDB.
     */
    savePreference: function(key, value) {
        DB.get(STORE_CONFIG, "main").then(function(config) {
            if (config) {
                config[key] = value;
                return DB.put(STORE_CONFIG, config);
            }
        }).then(function() {
            console.log("Preference saved: " + key + " = " + value);
        }).catch(function(err) {
            console.error("Failed to save preference:", err);
        });
    },

    /**
     * Trigger MathJax to re-render any new math content on the page.
     * Waits for MathJax startup if it has not yet completed.
     * Clears previous typesetting on the target element before re-processing.
     */
    renderMath: function(element) {
        if (typeof MathJax === "undefined") {
            return Promise.resolve();
        }
        // MathJax v3 startup is async -- wait for it to be ready
        var ready = (MathJax.startup && MathJax.startup.promise)
            ? MathJax.startup.promise
            : Promise.resolve();

        return ready.then(function() {
            if (!MathJax.typesetPromise) return;
            var target = element ? [element] : undefined;
            // Clear any previous typesetting on this element so MathJax re-processes
            if (target && MathJax.typesetClear) {
                try { MathJax.typesetClear(target); } catch (e) { /* ignore */ }
            }
            return MathJax.typesetPromise(target);
        }).catch(function(err) {
            console.warn("MathJax render error:", err);
        });
    }
};


