// ============================================================================
// WRITTEN MODE MODULE
// Canvas engine, AI marking via Claude API, results display, notation popup.
// Only active when SessionEngine.answerMethod === "stylus".
// ============================================================================
var WrittenMode = {

    // ---- API KEY MANAGEMENT ----
    // The API key is set by the teacher in schedule.js (TAUGHT_SCHEDULE.apiKey).
    // Students never need to enter or see it.

    getApiKey: function() {
        if (typeof TAUGHT_SCHEDULE !== "undefined" && TAUGHT_SCHEDULE.apiKey) {
            return TAUGHT_SCHEDULE.apiKey;
        }
        return "";
    },

    getMarkEndpoint: function() {
        if (typeof TAUGHT_SCHEDULE !== "undefined" && TAUGHT_SCHEDULE.markEndpoint) {
            return TAUGHT_SCHEDULE.markEndpoint;
        }
        return "";
    },

    /**
     * Check if Written Mode marking is available (either proxy or direct API).
     */
    hasMarkingAPI: function() {
        return !!(WrittenMode.getMarkEndpoint() || WrittenMode.getApiKey());
    },

    /**
     * Convert a local image URL to base64 data URL using a hidden canvas.
     * Returns a promise that resolves to the base64 string (without prefix).
     * @private
     */
    _imageUrlToBase64: function(url) {
        return new Promise(function(resolve, reject) {
            var img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = function() {
                var canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                var ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                var dataUrl = canvas.toDataURL("image/png");
                resolve(dataUrl.split(",")[1]);
            };
            img.onerror = function() {
                console.warn("Failed to load reference image: " + url);
                resolve(null);
            };
            img.src = url;
        });
    },

    /**
     * Call Claude API for marking. Routes through proxy if markEndpoint is configured,
     * falls back to direct API call if apiKey is set instead.
     */
    _callClaudeAPI: function(systemPrompt, contentBlocks) {
        var markEndpoint = WrittenMode.getMarkEndpoint();

        var body = {
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            system: systemPrompt,
            messages: [{ role: "user", content: contentBlocks }]
        };

        if (markEndpoint) {
            // Route through proxy (API key stored server-side)
            return fetch(markEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
        }

        // Fallback: direct API call (API key in schedule.js)
        var apiKey = WrittenMode.getApiKey();
        if (!apiKey) return Promise.reject(new Error("No marking API configured"));

        return fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify(body)
        });
    },

    getSympyEndpoint: function() {
        if (typeof TAUGHT_SCHEDULE !== "undefined" && TAUGHT_SCHEDULE.sympyEndpoint) {
            return TAUGHT_SCHEDULE.sympyEndpoint;
        }
        return "";
    },

    // ---- CANVAS ENGINE ----

    CanvasEngine: {
        canvases: {},

        init: function(partLabel, canvasEl) {
            var dpr = window.devicePixelRatio || 1;
            var rect = canvasEl.getBoundingClientRect();
            canvasEl.width = rect.width * dpr;
            canvasEl.height = rect.height * dpr;

            var ctx = canvasEl.getContext("2d");
            ctx.scale(dpr, dpr);

            var state = {
                canvas: canvasEl,
                ctx: ctx,
                dpr: dpr,
                drawing: false,
                tool: "pen",
                color: "#000000",
                lineWidth: 3,
                points: [],
                undoStack: [],
                hasContent: false,
                bgCanvas: null,   // background canvas element (for draw-on questions)
                bgLoaded: false   // whether background image is ready
            };

            this.canvases[partLabel] = state;

            var self = this;
            canvasEl.addEventListener("pointerdown", function(e) {
                self.onPointerDown(partLabel, e);
            });
            canvasEl.addEventListener("pointermove", function(e) {
                self.onPointerMove(partLabel, e);
            });
            canvasEl.addEventListener("pointerup", function(e) {
                self.onPointerUp(partLabel, e);
            });
            canvasEl.addEventListener("pointerleave", function(e) {
                self.onPointerUp(partLabel, e);
            });

            canvasEl.style.touchAction = "none";
            return state;
        },

        /**
         * Load a background image (axes, table, grid) into the bg canvas layer.
         * Resizes both canvases to match the image aspect ratio.
         */
        loadBackground: function(partLabel, bgCanvasEl, imgUrl) {
            var s = this.canvases[partLabel];
            if (!s) return;

            s.bgCanvas = bgCanvasEl;
            var dpr = s.dpr;
            var img = new Image();
            img.crossOrigin = "anonymous";

            img.onload = function() {
                // Calculate canvas height to match image aspect ratio
                var wrapperWidth = bgCanvasEl.parentElement.offsetWidth;
                var aspect = img.naturalHeight / img.naturalWidth;
                var targetHeight = Math.round(wrapperWidth * aspect);
                // Add extra space below for annotations (30% more, min 80px)
                var extraSpace = Math.max(80, Math.round(targetHeight * 0.3));
                var totalHeight = targetHeight + extraSpace;

                // Resize both canvases
                bgCanvasEl.style.height = totalHeight + "px";
                bgCanvasEl.height = totalHeight * dpr;
                bgCanvasEl.width = wrapperWidth * dpr;
                s.canvas.style.height = totalHeight + "px";
                s.canvas.height = totalHeight * dpr;
                s.canvas.width = wrapperWidth * dpr;

                // Re-apply scale on both contexts after resize
                var bgCtx = bgCanvasEl.getContext("2d");
                bgCtx.scale(dpr, dpr);
                s.ctx = s.canvas.getContext("2d");
                s.ctx.scale(dpr, dpr);

                // Draw the background image (fill width, maintain aspect ratio)
                bgCtx.fillStyle = "#ffffff";
                bgCtx.fillRect(0, 0, wrapperWidth, totalHeight);
                bgCtx.drawImage(img, 0, 0, wrapperWidth, targetHeight);

                // Draw a subtle line to show where the image ends
                bgCtx.strokeStyle = "#e0e0e0";
                bgCtx.lineWidth = 1;
                bgCtx.setLineDash([4, 4]);
                bgCtx.beginPath();
                bgCtx.moveTo(0, targetHeight + 4);
                bgCtx.lineTo(wrapperWidth, targetHeight + 4);
                bgCtx.stroke();
                bgCtx.setLineDash([]);

                s.bgLoaded = true;

                // Hide the placeholder since the image is the visual cue
                var ph = s.canvas.parentElement.querySelector(".wm-canvas-placeholder");
                if (ph) ph.style.display = "none";
            };

            img.onerror = function() {
                console.warn("Failed to load background image: " + imgUrl);
                // Fall back to normal canvas behaviour
                s.bgLoaded = false;
            };

            img.src = imgUrl;
        },

        getPos: function(canvas, e) {
            var rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
        },

        saveState: function(partLabel) {
            var s = this.canvases[partLabel];
            if (!s) return;
            if (s.undoStack.length > 30) s.undoStack.shift();
            s.undoStack.push(s.canvas.toDataURL());
        },

        onPointerDown: function(partLabel, e) {
            var s = this.canvases[partLabel];
            if (!s) return;
            e.preventDefault();
            this.saveState(partLabel);
            s.drawing = true;
            s.points = [];
            var pos = this.getPos(s.canvas, e);
            s.points.push(pos);
            s.ctx.beginPath();
            s.ctx.moveTo(pos.x, pos.y);

            var ph = s.canvas.parentElement.querySelector(".wm-canvas-placeholder");
            if (ph) ph.style.display = "none";
        },

        onPointerMove: function(partLabel, e) {
            var s = this.canvases[partLabel];
            if (!s || !s.drawing) return;
            e.preventDefault();

            var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
            for (var i = 0; i < events.length; i++) {
                var pos = this.getPos(s.canvas, events[i]);
                s.points.push(pos);
                this.drawStroke(s, pos);
            }
        },

        onPointerUp: function(partLabel, e) {
            var s = this.canvases[partLabel];
            if (!s || !s.drawing) return;
            s.drawing = false;
            s.ctx.closePath();
            s.hasContent = true;
            WrittenMode.checkMarkButton();
        },

        drawStroke: function(s, pos) {
            var pressure = pos.pressure || 0.5;
            var width = s.lineWidth * (0.5 + pressure);

            if (s.tool === "eraser") {
                s.ctx.globalCompositeOperation = "destination-out";
                width = s.lineWidth * 3;
            } else {
                s.ctx.globalCompositeOperation = "source-over";
            }

            s.ctx.lineWidth = width;
            s.ctx.lineCap = "round";
            s.ctx.lineJoin = "round";
            s.ctx.strokeStyle = s.color;
            s.ctx.lineTo(pos.x, pos.y);
            s.ctx.stroke();
            s.ctx.beginPath();
            s.ctx.moveTo(pos.x, pos.y);
        },

        setTool: function(partLabel, tool) {
            var s = this.canvases[partLabel];
            if (s) s.tool = tool;
        },

        setColor: function(partLabel, color) {
            var s = this.canvases[partLabel];
            if (s) {
                s.color = color;
                s.tool = "pen";
            }
        },

        setWidth: function(partLabel, width) {
            var s = this.canvases[partLabel];
            if (s) s.lineWidth = width;
        },

        undo: function(partLabel) {
            var s = this.canvases[partLabel];
            if (!s || s.undoStack.length === 0) return;
            var prev = s.undoStack.pop();
            var img = new Image();
            img.onload = function() {
                s.ctx.globalCompositeOperation = "source-over";
                s.ctx.clearRect(0, 0, s.canvas.width / s.dpr, s.canvas.height / s.dpr);
                s.ctx.drawImage(img, 0, 0, s.canvas.width / s.dpr, s.canvas.height / s.dpr);
            };
            img.src = prev;
        },

        clear: function(partLabel) {
            var s = this.canvases[partLabel];
            if (!s) return;
            this.saveState(partLabel);
            s.ctx.globalCompositeOperation = "source-over";
            s.ctx.clearRect(0, 0, s.canvas.width / s.dpr, s.canvas.height / s.dpr);
            s.hasContent = false;
            // Only show placeholder if there's no background image
            if (!s.bgCanvas || !s.bgLoaded) {
                var ph = s.canvas.parentElement.querySelector(".wm-canvas-placeholder");
                if (ph) ph.style.display = "block";
            }
            WrittenMode.checkMarkButton();
        },

        exportPNG: function(partLabel) {
            var s = this.canvases[partLabel];
            if (!s) return null;
            var maxWidth = 1568;

            // If there's a background canvas, composite both layers
            if (s.bgCanvas && s.bgLoaded) {
                var temp = document.createElement("canvas");
                var w = Math.min(s.canvas.width, maxWidth);
                var scale = w / s.canvas.width;
                temp.width = w;
                temp.height = s.canvas.height * scale;
                var tCtx = temp.getContext("2d");
                // Draw background layer first
                tCtx.drawImage(s.bgCanvas, 0, 0, temp.width, temp.height);
                // Draw student's work on top
                tCtx.drawImage(s.canvas, 0, 0, temp.width, temp.height);
                return temp.toDataURL("image/png");
            }

            // Normal export (no background)
            if (s.canvas.width <= maxWidth) {
                return s.canvas.toDataURL("image/png");
            }
            var scale = maxWidth / s.canvas.width;
            var temp = document.createElement("canvas");
            temp.width = maxWidth;
            temp.height = s.canvas.height * scale;
            var tCtx = temp.getContext("2d");
            tCtx.drawImage(s.canvas, 0, 0, temp.width, temp.height);
            return temp.toDataURL("image/png");
        }
    },

    // ---- QUESTION TIMER ----

    QuestionTimer: {
        interval: null,
        startTime: null,
        allowedSeconds: 0,
        elapsed: 0,

        start: function(question) {
            this.stop();
            var hasContext = question.questionStimulus && question.questionStimulus.length > 0;
            this.allowedSeconds = hasContext
                ? (25 + (question.totalMarks || 5) * 50)
                : (20 + (question.totalMarks || 5) * 35);
            this.startTime = Date.now();
            this.elapsed = 0;

            var timerEl = document.getElementById("wm-timer");
            var displayEl = document.getElementById("wm-timer-display");
            if (timerEl) {
                timerEl.classList.remove("wm-hidden", "wm-timer-warning", "wm-timer-overtime");
            }
            if (displayEl) {
                displayEl.textContent = this.formatTime(this.allowedSeconds);
            }

            var self = this;
            this.interval = setInterval(function() {
                self.elapsed = Math.floor((Date.now() - self.startTime) / 1000);
                var remaining = self.allowedSeconds - self.elapsed;

                var timerEl = document.getElementById("wm-timer");
                var displayEl = document.getElementById("wm-timer-display");
                if (!displayEl || !timerEl) {
                    self.stop(); // auto-cleanup if DOM elements removed
                    return;
                }

                if (remaining > 0) {
                    displayEl.textContent = self.formatTime(remaining);
                    timerEl.classList.remove("wm-timer-overtime", "wm-timer-warning");
                    if (remaining <= 60) timerEl.classList.add("wm-timer-warning");
                } else {
                    displayEl.textContent = "+" + self.formatTime(-remaining);
                    timerEl.classList.remove("wm-timer-warning");
                    timerEl.classList.add("wm-timer-overtime");
                }
            }, 1000);
        },

        stop: function() {
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
        },

        formatTime: function(seconds) {
            var abs = Math.abs(Math.floor(seconds));
            var m = Math.floor(abs / 60);
            var s = abs % 60;
            return m + ":" + (s < 10 ? "0" : "") + s;
        }
    },

    // ---- CANVAS UI HELPERS ----

    selectTool: function(partLabel, tool, btn) {
        WrittenMode.CanvasEngine.setTool(partLabel, tool);
        var toolbar = btn.closest(".wm-canvas-toolbar");
        toolbar.querySelectorAll("[data-tool]").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
    },

    selectColor: function(partLabel, color, dot) {
        WrittenMode.CanvasEngine.setColor(partLabel, color);
        var toolbar = dot.closest(".wm-canvas-toolbar");
        toolbar.querySelectorAll(".wm-color-dot").forEach(function(d) { d.classList.remove("active"); });
        dot.classList.add("active");
        toolbar.querySelectorAll("[data-tool]").forEach(function(b) { b.classList.remove("active"); });
        toolbar.querySelector('[data-tool="pen"]').classList.add("active");
    },

    selectWidth: function(partLabel, width, btn) {
        WrittenMode.CanvasEngine.setWidth(partLabel, width);
        var toolbar = btn.closest(".wm-canvas-toolbar");
        toolbar.querySelectorAll(".wm-width-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
    },

    confirmClear: function(partLabel) {
        if (confirm("Clear your working for this part?")) {
            WrittenMode.CanvasEngine.clear(partLabel);
        }
    },

    toggleScribble: function(partLabel, btn) {
        var row = btn.closest(".wm-canvas-row");
        if (!row) return;
        var scribble = row.querySelector(".wm-canvas-scribble");
        if (!scribble) return;
        scribble.classList.toggle("wm-scribble-hidden");
        btn.classList.toggle("active");
    },

    checkMarkButton: function() {
        var q = StudyUI.currentQuestion;
        if (!q || !q.parts) return;
        var partsWithContent = 0;
        var totalParts = q.parts.length;
        q.parts.forEach(function(p) {
            var s = WrittenMode.CanvasEngine.canvases[p.partLabel];
            if (s && s.hasContent) partsWithContent++;
        });
        var allHaveContent = partsWithContent === totalParts;
        var markBtn = document.getElementById("wm-mark-btn");
        var markHint = document.getElementById("wm-mark-hint");
        if (markBtn) markBtn.disabled = !allHaveContent;
        if (markHint) {
            if (allHaveContent) {
                markHint.textContent = "Ready to mark!";
            } else if (partsWithContent > 0) {
                markHint.textContent = partsWithContent + " of " + totalParts + " parts answered";
            }
        }
    },

    // ---- RENDER CANVAS ROW HTML ----

    renderCanvasRow: function(partLabel, partMarks, bgImageUrl) {
        // Scale canvas height based on marks: min 300px, +100px per mark above 2
        // For draw-on questions, we use a taller default and resize once the image loads
        var canvasHeight = bgImageUrl
            ? Math.max(450, 200 + (partMarks || 2) * 100)
            : Math.max(300, 200 + (partMarks || 2) * 100);
        var html = '<div class="wm-canvas-row">';

        // Main answer canvas
        html += '<div class="wm-canvas-main">';
        html += '<div class="wm-canvas-area" data-part="' + partLabel + '">';

        // Toolbar
        html += '<div class="wm-canvas-toolbar">';
        html += '<div class="wm-toolbar-group">';
        html += '<button class="wm-tool-btn active" data-tool="pen" ' +
            'onclick="WrittenMode.selectTool(\'' + partLabel + '\', \'pen\', this)">\u270F\uFE0F Pen</button>';
        html += '<button class="wm-tool-btn" data-tool="eraser" ' +
            'onclick="WrittenMode.selectTool(\'' + partLabel + '\', \'eraser\', this)">\u25FB Eraser</button>';
        html += '</div>';
        html += '<div class="wm-toolbar-sep"></div>';

        // Colors
        html += '<div class="wm-toolbar-group">';
        html += '<div class="wm-color-dot active" style="background:#000" ' +
            'onclick="WrittenMode.selectColor(\'' + partLabel + '\', \'#000000\', this)"></div>';
        html += '<div class="wm-color-dot" style="background:#1565C0" ' +
            'onclick="WrittenMode.selectColor(\'' + partLabel + '\', \'#1565C0\', this)"></div>';
        html += '<div class="wm-color-dot" style="background:#C62828" ' +
            'onclick="WrittenMode.selectColor(\'' + partLabel + '\', \'#C62828\', this)"></div>';
        html += '</div>';
        html += '<div class="wm-toolbar-sep"></div>';

        // Widths
        html += '<div class="wm-toolbar-group">';
        html += '<button class="wm-width-btn" onclick="WrittenMode.selectWidth(\'' + partLabel + '\', 1.5, this)">' +
            '<div class="wm-width-indicator" style="width:4px;height:4px;"></div></button>';
        html += '<button class="wm-width-btn active" onclick="WrittenMode.selectWidth(\'' + partLabel + '\', 3, this)">' +
            '<div class="wm-width-indicator" style="width:6px;height:6px;"></div></button>';
        html += '<button class="wm-width-btn" onclick="WrittenMode.selectWidth(\'' + partLabel + '\', 5, this)">' +
            '<div class="wm-width-indicator" style="width:9px;height:9px;"></div></button>';
        html += '</div>';
        html += '<div class="wm-toolbar-sep"></div>';

        // Undo / Clear
        html += '<div class="wm-toolbar-group">';
        html += '<button class="wm-tool-btn" onclick="WrittenMode.CanvasEngine.undo(\'' + partLabel + '\')">\u21A9 Undo</button>';
        html += '<button class="wm-tool-btn" onclick="WrittenMode.confirmClear(\'' + partLabel + '\')">' +
            '\uD83D\uDDD1 Clear</button>';
        html += '</div>';

        // Rough Working toggle (right-aligned)
        if (!bgImageUrl) {
            html += '<div class="wm-toolbar-group" style="margin-left:auto;">';
            html += '<button class="wm-tool-btn wm-rough-toggle" onclick="WrittenMode.toggleScribble(\'' + partLabel + '\', this)">Rough</button>';
            html += '</div>';
        }

        html += '</div>'; // toolbar

        // Canvas -- stacked pair if bgImageUrl is provided
        html += '<div class="wm-canvas-wrapper' + (bgImageUrl ? ' wm-canvas-stacked' : '') + '">';
        if (bgImageUrl) {
            // Background canvas (axes/table image) -- sits behind, pointer-events: none
            html += '<canvas class="wm-bg-canvas" id="wm-bg-canvas-' + partLabel +
                '" data-bg-url="' + StudyUI._escapeHtml(bgImageUrl) + '"' +
                ' height="' + canvasHeight + '" style="height:' + canvasHeight + 'px;"></canvas>';
        }
        html += '<canvas class="wm-drawing-canvas" id="wm-canvas-' + partLabel +
            '" height="' + canvasHeight + '" style="height:' + canvasHeight + 'px;"></canvas>';
        if (bgImageUrl) {
            html += '<div class="wm-canvas-placeholder wm-canvas-placeholder-overlay">' +
                'Draw your answer on the image</div>';
        } else {
            html += '<div class="wm-canvas-placeholder">Write your answer here</div>';
        }
        html += '</div>';

        html += '</div>'; // canvas-area
        html += '</div>'; // canvas-main

        // Scribble pad -- hidden for draw-on questions (student draws on the image instead)
        if (!bgImageUrl) {
            var scribbleId = "scribble-" + partLabel;
            html += '<div class="wm-canvas-scribble wm-scribble-hidden">';
            html += '<div class="wm-canvas-area">';
            html += '<div class="wm-scribble-label">Rough Working</div>';
            html += '<div class="wm-canvas-toolbar">';
            html += '<div class="wm-toolbar-group">';
            html += '<button class="wm-tool-btn active" data-tool="pen" ' +
                'onclick="WrittenMode.selectTool(\'' + scribbleId + '\', \'pen\', this)">\u270F\uFE0F</button>';
            html += '<button class="wm-tool-btn" data-tool="eraser" ' +
                'onclick="WrittenMode.selectTool(\'' + scribbleId + '\', \'eraser\', this)">\u25FB</button>';
            html += '</div>';
            html += '<div class="wm-toolbar-group" style="margin-left:auto;">';
            html += '<button class="wm-tool-btn" onclick="WrittenMode.CanvasEngine.undo(\'' + scribbleId + '\')">\u21A9</button>';
            html += '<button class="wm-tool-btn" onclick="WrittenMode.confirmClear(\'' + scribbleId + '\')">' +
                '\uD83D\uDDD1</button>';
            html += '</div>';
            html += '</div>';
            html += '<div class="wm-canvas-wrapper">';
            html += '<canvas class="wm-drawing-canvas" id="wm-canvas-' + scribbleId +
                '" height="' + canvasHeight + '" style="height:' + canvasHeight + 'px;"></canvas>';
            html += '<div class="wm-canvas-placeholder">Scratch pad</div>';
            html += '</div>';
            html += '</div>'; // canvas-area
            html += '</div>'; // canvas-scribble
        }

        html += '</div>'; // canvas-row
        return html;
    },

    // ---- INIT CANVASES FOR QUESTION ----

    initCanvasesForQuestion: function(q) {
        WrittenMode.CanvasEngine.canvases = {};
        if (!q.parts) return;
        q.parts.forEach(function(part) {
            var c = document.getElementById("wm-canvas-" + part.partLabel);
            if (c) {
                WrittenMode.CanvasEngine.init(part.partLabel, c);

                // Check for background canvas (draw-on questions: axes, tables, grids)
                var bgCanvas = document.getElementById("wm-bg-canvas-" + part.partLabel);
                if (bgCanvas) {
                    var bgUrl = bgCanvas.getAttribute("data-bg-url");
                    if (bgUrl) {
                        WrittenMode.CanvasEngine.loadBackground(part.partLabel, bgCanvas, bgUrl);
                    }
                }
            }
            var sc = document.getElementById("wm-canvas-scribble-" + part.partLabel);
            if (sc) WrittenMode.CanvasEngine.init("scribble-" + part.partLabel, sc);
        });
    },

    // ---- AI MARKING ----

    markAnswer: function() {
        var q = StudyUI.currentQuestion;
        if (!WrittenMode.hasMarkingAPI() || !q) return;

        WrittenMode.QuestionTimer.stop();

        var overlay = document.getElementById("wm-marking-overlay");
        if (overlay) overlay.classList.remove("wm-hidden");

        var systemPrompt = WrittenMode.buildSystemPrompt();

        // Collect reference solution images for draw-on parts (async)
        var refImagePromises = [];
        q.parts.forEach(function(part, idx) {
            if (StudyUI._isDrawOnPart(part, q)) {
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

        // Wait for all reference images to load, then build content blocks
        Promise.all(refImagePromises).then(function(refImages) {
            // Index reference images by partLabel for quick lookup
            var refMap = {};
            refImages.forEach(function(ri) {
                if (ri.base64) refMap[ri.partLabel] = ri.base64;
            });

            var contentBlocks = [];

            q.parts.forEach(function(part, idx) {
                var isDrawOn = StudyUI._isDrawOnPart(part, q);
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

                var dataUrl = WrittenMode.CanvasEngine.exportPNG(part.partLabel);
                if (dataUrl) {
                    var base64 = dataUrl.split(",")[1];
                    contentBlocks.push({
                        type: "image",
                        source: { type: "base64", media_type: "image/png", data: base64 }
                    });
                }
            });

            contentBlocks.push({
                type: "text",
                text: "Mark all parts. IMPORTANT: First read ALL parts' handwriting to understand what the student wrote. " +
                      "Then mark each part. For multi-part questions, apply FOLLOW-THROUGH MARKING: if the student got an earlier part wrong " +
                      "but correctly used their wrong answer in later parts, award ALL marks in those later parts. " +
                      "The error is penalised ONLY in the part where it occurred \u2014 do not penalise it again in later parts. " +
                      "Respond with JSON only."
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
            if (overlay) overlay.classList.add("wm-hidden");

            var text = "";
            if (data.content) {
                data.content.forEach(function(block) {
                    if (block.type === "text") text += block.text;
                });
            }

            var cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

            // Robust JSON extraction: if the response contains prose around the JSON,
            // find the outermost { ... } object
            var result;
            try {
                result = JSON.parse(cleaned);
            } catch (e1) {
                var firstBrace = cleaned.indexOf("{");
                var lastBrace = cleaned.lastIndexOf("}");
                if (firstBrace !== -1 && lastBrace > firstBrace) {
                    try {
                        result = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
                    } catch (e2) {
                        throw new Error("Could not parse marking response as JSON");
                    }
                } else {
                    throw new Error("No JSON object found in marking response");
                }
            }

            // Run SymPy verification (graceful -- returns null if unavailable)
            WrittenMode._runSympyVerification(result).then(function(sympyData) {
                WrittenMode.displayResults(result, sympyData);
            });
        })
        .catch(function(err) {
            if (overlay) overlay.classList.add("wm-hidden");

            console.error("WrittenMode marking error:", err);

            // Show error UI in the results container instead of a raw confirm dialog
            var container = document.getElementById("wm-results-container");
            if (container) {
                container.classList.remove("wm-hidden");
                var errorHtml = '<div class="wm-error-fallback">';
                errorHtml += '<div class="wm-error-fallback-icon">\u26A0\uFE0F</div>';
                errorHtml += '<div class="wm-error-fallback-title">Marking failed</div>';
                errorHtml += '<div class="wm-error-fallback-msg">' +
                    StudyUI._escapeHtml(err.message) + '</div>';
                errorHtml += '<div class="wm-error-fallback-actions">';
                errorHtml += '<button class="btn btn-primary" id="wm-retry-mark-btn">' +
                    '\u21BB Try Again</button>';
                errorHtml += '<button class="btn btn-secondary" id="wm-self-assess-btn">' +
                    'Self-Assess Instead</button>';
                errorHtml += '</div></div>';
                container.innerHTML = errorHtml;
                container.scrollIntoView({ behavior: "smooth" });

                document.getElementById("wm-retry-mark-btn").addEventListener("click", function() {
                    container.classList.add("wm-hidden");
                    container.innerHTML = "";
                    WrittenMode.submitForMarking();
                });
                document.getElementById("wm-self-assess-btn").addEventListener("click", function() {
                    container.classList.add("wm-hidden");
                    container.innerHTML = "";
                    var markArea = document.getElementById("wm-mark-area");
                    if (markArea) markArea.classList.add("wm-hidden");
                    StudyUI.showSolution();
                });
            } else {
                // Fallback to confirm if container not found
                if (confirm("Marking failed. Self-assess instead?")) {
                    var markArea = document.getElementById("wm-mark-area");
                    if (markArea) markArea.classList.add("wm-hidden");
                    StudyUI.showSolution();
                }
            }
        });
    },

    // ---- DISPLAY RESULTS ----

    displayResults: function(result, sympyData) {
        var q = StudyUI.currentQuestion;
        if (!q) return;

        // Hide mark bar
        var markArea = document.getElementById("wm-mark-area");
        if (markArea) markArea.classList.add("wm-hidden");

        // Store result for overrides
        window._wmMarkingResult = result;
        window._wmSympyData = sympyData || null;

        var container = document.getElementById("wm-results-container");
        if (!container) return;
        container.classList.remove("wm-hidden");

        // Calculate total score
        var totalEarned = 0;
        var totalAvailable = 0;
        result.parts.forEach(function(p) {
            totalEarned += p.totalAwarded;
            totalAvailable += p.totalAvailable;
        });

        var allCorrect = totalEarned === totalAvailable;
        var html = "";

        // Header
        html += '<div class="wm-results-header">';
        html += '<div class="wm-results-title">Marking Results</div>';
        html += '<div class="wm-results-score"><span class="wm-earned">' + totalEarned +
            '</span><span class="wm-total"> / ' + totalAvailable + ' marks</span></div>';
        html += '</div>';

        if (allCorrect) {
            html += '<div class="wm-all-correct">';
            html += '<div class="wm-all-correct-icon">\uD83C\uDF89</div>';
            html += '<div class="wm-all-correct-text">All correct! Perfect score.</div>';
            html += '</div>';
        }

        // SymPy verification summary
        if (sympyData && sympyData.totalChecks > 0) {
            var vClass = sympyData.disagreements > 0 ? "wm-sympy-summary warn" : "wm-sympy-summary ok";
            html += '<div class="' + vClass + '">';
            if (sympyData.disagreements > 0) {
                html += '<span class="wm-sympy-summary-icon">\u26A0\uFE0F</span>';
                html += '<span>SymPy verified ' + sympyData.agreements + '/' + sympyData.totalChecks +
                    ' checks \u2014 ' + sympyData.disagreements + ' flagged for review</span>';
            } else {
                html += '<span class="wm-sympy-summary-icon">\u2705</span>';
                html += '<span>SymPy verified all ' + sympyData.agreements + ' mathematical checks</span>';
            }
            html += '</div>';
        }

        // Examiner comment and clarification
        if (q.examinerComment) {
            html += '<div class="examiner-comment">';
            html += '<div class="examiner-label">' + '\uD83C\uDF93 Examiner Comment</div>';
            html += '<p>' + StudyUI._escapeHtml(q.examinerComment) + '</p>';
            html += '</div>';

            var clarification = "";
            for (var ci = q.parts.length - 1; ci >= 0; ci--) {
                if (q.parts[ci].guidedSolution) {
                    var extracted = StudyUI._extractExaminerContent(q.parts[ci].guidedSolution);
                    if (extracted.clarification) {
                        clarification = extracted.clarification;
                        break;
                    }
                }
            }
            if (clarification) {
                html += '<div class="examiner-clarification">';
                html += '<div class="examiner-clarification-label">' +
                    '\uD83D\uDCD6 This comment clarified</div>';
                html += '<p>' + StudyUI._escapeHtml(clarification) + '</p>';
                html += '</div>';
            }
        }

        // Per-part results
        result.parts.forEach(function(partResult, idx) {
            var questionPart = q.parts[idx];
            if (!questionPart) return;

            html += '<div class="wm-part-result">';

            var scoreClass = "zero";
            if (partResult.totalAwarded === partResult.totalAvailable) scoreClass = "full";
            else if (partResult.totalAwarded > 0) scoreClass = "partial";

            html += '<div class="wm-part-result-header">';
            html += '<span class="wm-part-result-label">Part (' +
                StudyUI._escapeHtml(questionPart.partLabel) + ')</span>';
            html += '<span class="wm-part-result-score ' + scoreClass + '">' +
                partResult.totalAwarded + ' / ' + partResult.totalAvailable + '</span>';
            html += '</div>';

            // AI Reading
            if (partResult.reading) {
                html += '<div class="wm-ai-reading">';
                html += '<div class="wm-ai-reading-label">AI Reading of Your Work</div>';
                html += '<div class="wm-ai-reading-text">' + partResult.reading + '</div>';
                html += '</div>';
            }

            // Marking criteria
            html += '<div class="wm-marking-criteria">';
            html += '<div class="wm-marking-criteria-header">Marking Criteria</div>';

            if (partResult.marks && partResult.marks.length > 0) {
                partResult.marks.forEach(function(mark, markIdx) {
                    var criterion = questionPart.marking ? questionPart.marking[mark.criterionIndex] : null;
                    // Fallback: use AI-provided text or generic label if criterion not found
                    var criterionText = criterion ? criterion.text : (mark.criterionText || 'Criterion ' + (markIdx + 1));
                    var criterionAwarded = criterion ? criterion.awarded : (mark.awarded ? '1' : '0');
                    var passClass = mark.awarded ? "passed" : "failed";
                    var icon = mark.awarded ? "\u2713" : "\u2717";
                    var clickAttr = "";
                    var hintHtml = "";

                    if (!mark.awarded) {
                        clickAttr = ' onclick="WrittenMode.overrideMark(' + idx + ', ' + markIdx + ', this)"';
                        hintHtml = '<span class="wm-override-hint">\u2190 tap if AI misread</span>';
                    }

                    // SymPy verification badge
                    var verifyBadge = "";
                    if (sympyData && sympyData.perCriterion) {
                        var vKey = questionPart.partLabel + "-" + mark.criterionIndex;
                        var vResult = sympyData.perCriterion[vKey];
                        if (vResult) {
                            if (vResult.status === "verified") {
                                verifyBadge = '<span class="wm-sympy-badge verified" title="' +
                                    StudyUI._escapeHtml(vResult.details) + '">\u2713 verified</span>';
                            } else if (vResult.status === "disagree") {
                                verifyBadge = '<span class="wm-sympy-badge disagree" title="' +
                                    StudyUI._escapeHtml(vResult.details) + '">\u26A0\uFE0F check</span>';
                            }
                        }
                    }

                    html += '<div class="wm-marking-row ' + passClass + '" id="wm-mark-' + idx + '-' + markIdx + '"' + clickAttr + '>';
                    html += '<div class="wm-mark-icon">' + icon + '</div>';
                    html += '<div class="wm-mark-detail">';
                    html += '<div class="wm-mark-text">' + StudyUI._escapeHtml(criterionText) +
                        ' [' + criterionAwarded + ']' + hintHtml +
                        '<span class="wm-override-label">overridden</span>' + verifyBadge + '</div>';
                    if (mark.reason) {
                        html += '<div class="wm-mark-reason">' + mark.reason + '</div>';
                    }
                    html += '</div>';
                    html += '</div>';
                });
            } else if (questionPart.marking && questionPart.marking.length > 0) {
                // AI didn't return marks but question has marking criteria - show them unscored
                questionPart.marking.forEach(function(criterion) {
                    html += '<div class="wm-marking-row">';
                    html += '<div class="wm-mark-icon">\u2014</div>';
                    html += '<div class="wm-mark-detail">';
                    html += '<div class="wm-mark-text">' + StudyUI._escapeHtml(criterion.text) +
                        ' [' + criterion.awarded + ']</div>';
                    html += '</div>';
                    html += '</div>';
                });
            }
            html += '</div>';

            // Error diagnosis
            if (partResult.errorType && partResult.skillDiagnosis) {
                html += '<div class="wm-error-diagnosis">';
                html += '<div class="wm-error-diagnosis-label">';
                html += '\u26A0\uFE0F Skill/Process Error ';
                html += '<span class="wm-error-type-badge ' + partResult.errorType + '">' +
                    partResult.errorType + '</span>';
                html += '</div>';
                html += '<div class="wm-error-diagnosis-text">' +
                    partResult.skillDiagnosis + '</div>';
                html += '</div>';
            }

            // Solution lines with error marking
            if (questionPart.originalSolution) {
                html += '<div class="wm-solution-lines-result" id="wm-sol-lines-' + idx + '">';
                html += '<div style="font-size:0.8rem;font-weight:600;color:var(--text-muted);' +
                    'text-transform:uppercase;letter-spacing:0.03em;margin-bottom:8px;">Worked Solution</div>';

                questionPart.originalSolution.forEach(function(line, lineIdx) {
                    var lineNum = lineIdx + 1;
                    var lineClass = "";
                    var arrowHtml = "";

                    if (partResult.errorLine) {
                        if (lineNum < partResult.errorLine) {
                            lineClass = "correct-line";
                        } else if (lineNum === partResult.errorLine) {
                            lineClass = "error-line";
                            arrowHtml = '<span class="wm-error-arrow">\u2190 error here</span>';
                        } else {
                            lineClass = "error-line";
                        }
                    } else if (partResult.totalAwarded === partResult.totalAvailable) {
                        lineClass = "correct-line";
                    } else {
                        lineClass = "error-line";
                    }

                    html += '<div class="wm-sol-line ' + lineClass +
                        '" id="wm-sol-line-' + idx + '-' + lineNum + '">';
                    html += '<span class="wm-line-num">' + lineNum + '</span>';
                    html += '<span>' + StudyUI._renderSolutionText(line.text, q._pool) + '</span>';
                    html += arrowHtml;
                    html += '</div>';
                });

                html += '</div>';
            }

            // Guided walkthrough button + panel
            if (questionPart.guidedSolution) {
                html += '<div class="wm-guided-btn-wrap" id="guided-trigger-' + idx + '">';
                html += '<button class="btn btn-outline wm-guided-btn" ' +
                    'onclick="StudyUI.showPartGuided(' + idx + ')">' +
                    '\uD83D\uDCD6 Show walkthrough</button>';
                html += '</div>';
                html += '<div class="guided-panel" id="sol-guided-' + idx + '" style="display:none;"></div>';
            }

            html += '</div>'; // .wm-part-result
        });

        container.innerHTML = html;

        // Show next actions
        var nextActions = document.getElementById("wm-next-actions");
        if (nextActions) nextActions.classList.remove("wm-hidden");

        // Render MathJax
        UI.renderMath(container);

        // Scroll to results
        container.scrollIntoView({ behavior: "smooth" });

        // Show notation popup
        WrittenMode.showNotationPopup(result);

        // Record results into the StudyUI pipeline
        WrittenMode._recordAIResults(result);
    },

    // ---- RECORD AI RESULTS INTO EXISTING PIPELINE ----

    _recordAIResults: function(result) {
        var q = StudyUI.currentQuestion;
        if (!q || !q.parts) return;

        q.parts.forEach(function(part, idx) {
            var partResult = result.parts[idx];
            if (!partResult) return;

            var totalMarks = part.partMarks || 0;
            var earned = partResult.totalAwarded || 0;
            var isCorrect = (earned === totalMarks);

            // Build markingCriteriaFailed list from AI result
            var failedCriteria = [];
            if (partResult.marks) {
                partResult.marks.forEach(function(mark) {
                    if (!mark.awarded && mark.criterionIndex !== undefined) {
                        failedCriteria.push(mark.criterionIndex);
                    }
                });
            }

            // Map AI result to the same format as paper self-assessment
            // Keys must be partLabel (e.g. "a", "b") to match SessionEngine.recordResults
            StudyUI.partResults[part.partLabel] = {
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

        StudyUI.assessedParts = q.parts.length;

        // Populate _anotherTargetPTs for the "Another like this" button
        var wrongPTs = [];
        var allPTs = [];
        q.parts.forEach(function(part) {
            if (part.problemType && allPTs.indexOf(part.problemType) === -1) {
                allPTs.push(part.problemType);
            }
            var pr = StudyUI.partResults[part.partLabel];
            if (pr && !pr.correct && part.problemType) {
                if (wrongPTs.indexOf(part.problemType) === -1) {
                    wrongPTs.push(part.problemType);
                }
            }
        });
        StudyUI._anotherTargetPTs = wrongPTs.length > 0 ? wrongPTs : allPTs;
    },

    // ---- NOTATION POPUP ----

    showNotationPopup: function(result) {
        if (!result || !result.parts) return;

        var messages = [];
        var hasWarning = false;
        result.parts.forEach(function(p) {
            if (p.notationFeedback && p.notationFeedback.message) {
                messages.push({
                    part: p.partLabel,
                    correct: p.notationFeedback.correct,
                    message: p.notationFeedback.message
                });
                if (!p.notationFeedback.correct) hasWarning = true;
            }
        });

        if (messages.length === 0) return;

        var popup = document.getElementById("wm-notation-popup");
        var overlay = document.getElementById("wm-notation-overlay");

        var combinedMsg = "";
        messages.forEach(function(m) {
            if (messages.length > 1) {
                combinedMsg += "<strong>Part (" + m.part + "):</strong> ";
            }
            combinedMsg += m.message;
            if (messages.length > 1) combinedMsg += "<br><br>";
        });

        var isGood = !hasWarning;
        popup.className = "wm-notation-popup " + (isGood ? "notation-good" : "notation-warn");
        document.getElementById("wm-notation-icon").textContent = isGood ? "\u2705" : "\u26A0\uFE0F";
        document.getElementById("wm-notation-label").textContent = isGood ? "Good Notation!" : "Fix Your Notation";
        document.getElementById("wm-notation-msg").innerHTML = combinedMsg;

        overlay.classList.add("visible");

        UI.renderMath(popup);

        if (isGood) {
            setTimeout(function() {
                WrittenMode.dismissNotation();
            }, 4000);
        }
    },

    dismissNotation: function() {
        var overlay = document.getElementById("wm-notation-overlay");
        if (overlay) overlay.classList.remove("visible");
    },

    // ---- OVERRIDE MARK ----

    overrideMark: function(partIdx, markIdx, rowEl) {
        var result = window._wmMarkingResult;
        if (!result || !result.parts[partIdx]) return;

        var partResult = result.parts[partIdx];
        var mark = partResult.marks[markIdx];
        if (!mark) return;

        if (mark._originalAwarded === undefined) {
            mark._originalAwarded = mark.awarded;
        }

        if (!mark.awarded) {
            mark.awarded = true;
            partResult.totalAwarded++;
            rowEl.classList.remove("failed");
            rowEl.classList.add("overridden");
            rowEl.querySelector(".wm-mark-icon").textContent = "\u2713";
        } else if (mark._originalAwarded === false) {
            mark.awarded = false;
            partResult.totalAwarded--;
            rowEl.classList.remove("overridden");
            rowEl.classList.add("failed");
            rowEl.querySelector(".wm-mark-icon").textContent = "\u2717";
        }

        // Update part score display
        var partScoreEl = document.querySelector(
            "#wm-results-container .wm-part-result:nth-child(" + (partIdx + 2) + ") .wm-part-result-score");
        if (partScoreEl) {
            partScoreEl.textContent = partResult.totalAwarded + " / " + partResult.totalAvailable;
            if (partResult.totalAwarded === partResult.totalAvailable) {
                partScoreEl.className = "wm-part-result-score full";
            } else if (partResult.totalAwarded > 0) {
                partScoreEl.className = "wm-part-result-score partial";
            } else {
                partScoreEl.className = "wm-part-result-score zero";
            }
        }

        // Recalculate total
        var totalEarned = 0;
        var totalAvailable = 0;
        result.parts.forEach(function(p) {
            totalEarned += p.totalAwarded;
            totalAvailable += p.totalAvailable;
        });

        var scoreEl = document.querySelector(".wm-results-score");
        if (scoreEl) {
            scoreEl.innerHTML = '<span class="wm-earned">' + totalEarned +
                '</span><span class="wm-total"> / ' + totalAvailable + ' marks</span>';
        }

        // Update solution lines
        WrittenMode.updateSolutionLines(partIdx);

        // Re-record results with updated marks
        WrittenMode._recordAIResults(result);
    },

    updateSolutionLines: function(partIdx) {
        var result = window._wmMarkingResult;
        if (!result || !result.parts[partIdx]) return;
        var partResult = result.parts[partIdx];
        var questionPart = StudyUI.currentQuestion.parts[partIdx];
        if (!questionPart || !questionPart.originalSolution) return;

        var allAwarded = partResult.marks.every(function(m) { return m.awarded; });
        var effectiveErrorLine = allAwarded ? null : partResult.errorLine;

        questionPart.originalSolution.forEach(function(line, lineIdx) {
            var lineNum = lineIdx + 1;
            var lineEl = document.getElementById("wm-sol-line-" + partIdx + "-" + lineNum);
            if (!lineEl) return;

            lineEl.classList.remove("correct-line", "error-line");
            var arrow = lineEl.querySelector(".wm-error-arrow");
            if (arrow) arrow.remove();

            if (effectiveErrorLine) {
                if (lineNum < effectiveErrorLine) {
                    lineEl.classList.add("correct-line");
                } else {
                    lineEl.classList.add("error-line");
                    if (lineNum === effectiveErrorLine) {
                        var arrowSpan = document.createElement("span");
                        arrowSpan.className = "wm-error-arrow";
                        arrowSpan.textContent = "\u2190 error here";
                        lineEl.appendChild(arrowSpan);
                    }
                }
            } else if (allAwarded) {
                lineEl.classList.add("correct-line");
            } else {
                lineEl.classList.add("error-line");
            }
        });
    },

    // ---- SYSTEM PROMPT ----

    buildSystemPrompt: function() {
        return "You are marking a student's handwritten maths answer for a WACE Methods exam question. " +
            "Analyse the handwritten working in the image and mark it against the provided marking criteria.\n\n" +

            "For each part, return JSON with this exact structure:\n" +
            '{\n  "parts": [\n    {\n' +
            '      "partLabel": "a",\n' +
            '      "reading": "LaTeX-formatted transcription of what the student wrote",\n' +
            '      "marks": [\n' +
            '        {"criterionIndex": 0, "awarded": true, "reason": "brief explanation with \\\\(LaTeX\\\\)"},\n' +
            '        {"criterionIndex": 1, "awarded": false, "reason": "brief explanation with \\\\(LaTeX\\\\)"}\n' +
            '      ],\n' +
            '      "totalAwarded": 3,\n' +
            '      "totalAvailable": 4,\n' +
            '      "errorLine": 2,\n' +
            '      "errorType": "execution",\n' +
            '      "skillDiagnosis": "1-2 sentence diagnosis with \\\\(LaTeX\\\\) for any math",\n' +
            '      "notationFeedback": {"correct": false, "message": "explanation with \\\\(LaTeX\\\\) for math parts"}\n' +
            '    }\n  ],\n' +
            '  "sympyChecks": [\n' +
            '    {\n' +
            '      "type": "derivative|indefinite_integral|definite_integral|follow_through|simplification|substitution",\n' +
            '      "partLabel": "a",\n' +
            '      "criterionIndex": 0,\n' +
            '      "original": "x**5 - 3*x**2",\n' +
            '      "student_answer": "5*x**4 - 6*x",\n' +
            '      "variable": "x",\n' +
            '      "lower": 0,\n' +
            '      "upper": 2\n' +
            '    }\n  ]\n}\n\n' +

            "CRITICAL RULES:\n\n" +

            "SYMPY VERIFICATION CHECKS:\n" +
            "Generate a 'sympyChecks' array with entries for each mathematically verifiable step. " +
            "Use Python/SymPy notation (** for power, * for multiply). Include partLabel and criterionIndex " +
            "so results can be matched to specific marking criteria. Types:\n" +
            "- 'derivative': {original, student_answer, variable} \u2014 checks d/dx(original) == student_answer\n" +
            "- 'indefinite_integral': {original, student_answer, variable} \u2014 checks antiderivative\n" +
            "- 'definite_integral': {original, student_answer, variable, lower, upper} \u2014 checks definite integral value\n" +
            "- 'follow_through': {student_expr, variable, lower, upper, student_result} \u2014 checks student's arithmetic is internally consistent\n" +
            "- 'simplification': {original, simplified} \u2014 checks algebraic equivalence\n" +
            "- 'substitution': {expression, variable, value, expected_result} \u2014 checks substitution result\n" +
            "Only include checks for steps where the student actually wrote mathematical expressions. " +
            "If the student wrote nothing or only text, omit sympyChecks or leave it empty.\n\n" +

            "ANTI-HALLUCINATION \u2014 DO NOT INVENT STUDENT WORK:\n" +
            "- You MUST mark ONLY what is visibly written on the canvas. " +
            "Do NOT assume, infer, or extrapolate mathematical knowledge beyond what is explicitly shown.\n" +
            "- If the student writes a single number, letter, or short expression that does not constitute " +
            "a valid mathematical attempt at the question, award 0 marks for ALL criteria.\n" +
            "- NEVER connect a coincidental number to a step in the solution.\n" +
            "- A correct final answer written alone with NO working earns ONLY the 'correct answer' criterion " +
            "(if one exists), NOT any method/process marks.\n" +
            "- If the student's answer is completely wrong, unrelated, or nonsense, award 0 marks for ALL criteria.\n" +
            "- When in doubt, err on the side of NOT awarding marks.\n\n" +

            "HANDWRITING READING \u2014 READ WHAT IS ACTUALLY WRITTEN:\n" +
            "- Your 'reading' field MUST accurately transcribe what the student wrote, NOT the correct answer.\n" +
            "- Pay close attention to exponents and superscripts.\n" +
            "- Read each symbol as written. Only interpret genuinely ambiguous symbols generously.\n" +
            "- FORMATTING: Wrap all math in LaTeX delimiters \\\\( and \\\\). " +
            "Applies to reading, reason, skillDiagnosis, and notationFeedback.message.\n\n" +

            "MARK TYPES AND DEPENDENCIES:\n" +
            "Each criterion may have a type: M (Method), A (Accuracy), or B (Independent). Default is M.\n" +
            "- M (Method): Awarded for correct method/process, even if arithmetic result is wrong.\n" +
            "- A (Accuracy): Awarded for correct results. NEVER award A if prerequisite M was not awarded (no M0 A1). " +
            "Check deps list \u2014 ALL dependencies must be awarded first.\n" +
            "- B (Independent): Standalone, no dependencies.\n\n" +

            "FOLLOW-THROUGH MARKING:\n" +
            "ONE ERROR = ONE PENALTY. A student should only lose marks where they actually made a mistake.\n\n" +

            "WITHIN A PART: If a student makes an error at one step and consistently carries their wrong value " +
            "through subsequent steps using correct method, penalise ONLY at the error step. " +
            "Award subsequent M marks if the process is correct. " +
            "Award subsequent A marks if correct relative to their wrong value \u2014 UNLESS flagged CAO.\n\n" +

            "ACROSS PARTS: If a student gets an earlier part wrong but correctly uses their wrong answer " +
            "in a later part, the wrong answer BECOMES 'correct' for subsequent parts. " +
            "Award all M and A marks \u2014 UNLESS flagged CAO.\n\n" +

            "UNREALISTIC FT RESULTS: If follow-through produces physically impossible or " +
            "mathematically invalid results, withhold the FINAL accuracy mark. Still award method marks.\n\n" +

            "CAO \u2014 CORRECT ANSWER ONLY: If flagged CAO, ONLY award if answer exactly matches. No FT.\n\n" +

            "ISW \u2014 IGNORE SUBSEQUENT WORKING: Once correct answer shown, ignore further incorrect working. " +
            "Does NOT apply if subsequent working changes the final answer to something wrong.\n\n" +

            "MR \u2014 MISREAD RULE: If student misread a value but applied correct method throughout: " +
            "award ALL M and A marks, then deduct 1 mark. Set errorType to 'misread'.\n\n" +

            "MULTIPLE ATTEMPTS: Mark the method leading to the final stated answer. " +
            "If no final answer indicated, mark the last complete attempt. " +
            "Crossed-out but legible work: mark if no replacement exists.\n\n" +

            "TRANSCRIPTION ERRORS: If working shows correct value but copied incorrectly to final answer, " +
            "award marks based on the WORKING.\n\n" +

            "ACCURACY CONVENTIONS: Accept equivalent forms unless criterion specifies a form. " +
            "Enforce sig figs/dp ONLY when explicitly required. " +
            "Probability: accept fraction, decimal, or percentage. Units: enforce only if required.\n\n" +

            "NOTATION CHECK (does NOT affect marks): " +
            "notationFeedback is REQUIRED for every part. " +
            "Check variable names match the question, proper LHS, +C on indefinite integrals. Advisory only.\n\n" +

            "COMBINED STEPS: If a criterion is clearly demonstrated within another step, AWARD it. " +
            "But if marking key awards SEPARATE marks for method steps, student MUST show both explicitly. " +
            "PRINCIPLE: process criteria need visible demonstration; knowledge criteria can be implicit.\n\n" +

            "AWARD POSITIVELY: Credit valid work wherever it appears. Accept any valid method unless specified. " +
            "Do not penalise the same error twice. Whole marks only.\n\n" +

            "VISUAL/GRAPHICAL QUESTIONS (sketches, graphs, tables):\n" +
            "Some parts require the student to DRAW on axes, sketch a graph, shade a region, or fill in a table. " +
            "For these parts you will receive TWO images: the REFERENCE SOLUTION (correct answer) and the " +
            "STUDENT'S DRAWING (their attempt drawn over the blank axes/table).\n" +
            "When marking visual answers:\n" +
            "- GRAPHS: Check the overall shape matches, key features are in approximately correct positions " +
            "(intercepts, turning points, asymptotes), and labels are present where required. " +
            "Allow reasonable hand-drawn imprecision \u2014 focus on mathematical correctness not artistic quality.\n" +
            "- TABLES: Check each cell value matches the expected answer (apply accuracy tolerances from criteria).\n" +
            "- SHADING: Check the correct region is shaded and boundaries are correct.\n" +
            "- Use the 'reading' field to DESCRIBE what the student drew (e.g. 'Student sketched a curve with " +
            "x-intercept at approximately (2,0), y-intercept at (0,-4), and a minimum turning point near (1,-5)').\n" +
            "- For notation feedback on visual questions, check axis labels and feature labels instead of equation notation.\n\n" +

            "OTHER: errorLine is 1-indexed. errorType is setup/execution/interpretation/misread/null.\n\n" +
            "RESPONSE FORMAT: Respond with ONLY the JSON object. Do NOT include any preamble, commentary, " +
            "explanation, or markdown formatting. Your entire response must be parseable by JSON.parse(). " +
            "Start your response with { and end with }.";
    },

    // ---- SYMPY VERIFICATION ----

    /**
     * Call the SymPy cloud function to verify AI marking.
     * Returns a promise that resolves with verification data, or null on failure.
     * Graceful fallback: if endpoint is not configured or fails, returns null silently.
     */
    _runSympyVerification: function(aiResult) {
        var endpoint = WrittenMode.getSympyEndpoint();
        if (!endpoint) return Promise.resolve(null);

        var checks = aiResult.sympyChecks;
        if (!checks || !Array.isArray(checks) || checks.length === 0) {
            return Promise.resolve(null);
        }

        return fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ checks: checks })
        })
        .then(function(resp) {
            if (!resp.ok) return null;
            return resp.json();
        })
        .then(function(data) {
            if (!data || !data.verification_results) return null;
            return WrittenMode._mergeSympyResults(aiResult, data.verification_results);
        })
        .catch(function(err) {
            console.warn("SymPy verification unavailable:", err.message);
            return null;
        });
    },

    /**
     * Merge SymPy verification results into the AI marking result.
     * Adds a `sympyVerified` field to each marking criterion.
     * Returns a verification summary object.
     */
    _mergeSympyResults: function(aiResult, verificationResults) {
        var summary = {
            totalChecks: verificationResults.length,
            agreements: 0,
            disagreements: 0,
            inconclusive: 0,
            perCriterion: {} // keyed by "partLabel-criterionIndex"
        };

        verificationResults.forEach(function(v) {
            var key = (v.partLabel || "?") + "-" + (v.criterionIndex !== undefined ? v.criterionIndex : "?");

            if (v.correct === null || v.correct === undefined) {
                summary.inconclusive++;
                summary.perCriterion[key] = { status: "inconclusive", details: v.details || "" };
            } else if (v.correct === true || v.match === true) {
                summary.agreements++;
                summary.perCriterion[key] = { status: "verified", details: v.details || "" };
            } else {
                summary.disagreements++;
                summary.perCriterion[key] = { status: "disagree", details: v.details || "" };
            }
        });

        return summary;
    },

    // ---- INIT ----

    init: function() {
        // Notation dismiss button
        var dismissBtn = document.getElementById("wm-notation-dismiss");
        if (dismissBtn) {
            dismissBtn.addEventListener("click", function() {
                WrittenMode.dismissNotation();
            });
        }

        // If teacher hasn't provided an API key, disable Stylus toggles
        if (!WrittenMode.hasMarkingAPI()) {
            var stylusButtons = document.querySelectorAll('.config-toggle[data-value="stylus"]');
            stylusButtons.forEach(function(btn) {
                btn.disabled = true;
                btn.title = "Your teacher has not enabled Written Mode for this class";
            });
        }
    },
};


