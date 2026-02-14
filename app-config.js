// ============================================================================
// WACE Student Study Trainer - app.js
// Phase S1: Core Foundation
// ============================================================================
// ENCODING RULE: This file must contain ONLY ASCII characters (0x00-0x7F).
// All non-ASCII UI symbols are defined as Unicode escapes in SYMBOLS below.
// ============================================================================
"use strict";

// ---- NON-ASCII SYMBOLS (defined via \u escapes for encoding safety) ----
var SYMBOLS = {
    CHECK:        "\u2713",     // checkmark
    CROSS:        "\u2717",     // cross / ballot X
    ARROW_RIGHT:  "\u2192",     // right arrow
    ARROW_LEFT:   "\u2190",     // left arrow
    EM_DASH:      "\u2014",     // em-dash
    PLUS_MINUS:   "\u00B1",     // plus-minus
    BULLET:       "\u2022",     // bullet
    STAR:         "\u2605",     // filled star
    STAR_EMPTY:   "\u2606",     // empty star
    LIGHTNING:    "\u26A1",     // lightning bolt
    CIRCLE_GREEN: "\uD83D\uDFE2", // green circle emoji
    CIRCLE_RED:   "\uD83D\uDD34",  // red circle emoji
    CIRCLE_AMBER: "\uD83D\uDFE0",  // orange circle emoji
    GEAR:         "\u2699",     // gear
    TROPHY:       "\uD83C\uDFC6", // trophy
    FIRE:         "\uD83D\uDD25",  // fire (streak)
    GRAPH:        "\uD83D\uDCC8",  // chart increasing
    BOOK:         "\uD83D\uDCDA",  // books
    LOCK:         "\uD83D\uDD12",  // lock
    UNLOCK:       "\uD83D\uDD13",  // unlock
    GRADUATION:   "\uD83C\uDF93",  // graduation cap
    PARTY:        "\uD83C\uDF89",  // party popper
    CLOCK:        "\u23F0",     // alarm clock
    SUN:          "\u2600",     // sun (for dark mode toggle)
    MOON:         "\u263E",     // moon (for light mode toggle)
    ARROW_UP:     "\u2191",     // up arrow (improving)
    REVIEW:       "\u21BB"      // clockwise loop (review due)
};

// ---- APP CONSTANTS ----
var APP_VERSION = "2.0.0";
var DB_NAME = "WACEStudentTrainer";
var DB_VERSION = 1;

// Base path for all data files (relative to the HTML file).
// In the restructured project, all files are flat in system_trainer/.
var DATA_PATH = "";
var DIAGRAM_PATH = "diagrams/";
var PRACTICE_DIAGRAM_PATH = "practice_diagrams/";

// Object store names
var STORE_CONFIG = "config";
var STORE_MASTERY = "problemTypeMastery";
var STORE_HISTORY = "questionHistory";
var STORE_SESSIONS = "sessions";
var STORE_IMPORTED = "importedQuestions";
var STORE_SCHEDULE_UPDATES = "scheduleUpdates";
var STORE_CONFIDENCE = "confidenceWatch";
var STORE_DIAGRAMS = "diagramCache";

// All object store definitions for DB creation
var OBJECT_STORES = [
    { name: STORE_CONFIG,           keyPath: "id" },
    { name: STORE_MASTERY,          keyPath: "problemType" },
    { name: STORE_HISTORY,          keyPath: "filename" },
    { name: STORE_SESSIONS,         keyPath: "sessionId", autoIncrement: true },
    { name: STORE_IMPORTED,         keyPath: "filename" },
    { name: STORE_SCHEDULE_UPDATES, keyPath: "updateId" },
    { name: STORE_CONFIDENCE,       keyPath: "problemType" },
    { name: STORE_DIAGRAMS,         keyPath: "filename" }
];


