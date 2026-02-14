// ============================================================================
// CELEBRATIONS MODULE (Phase S7)
// Confetti-like particle animation for milestone achievements.
// ============================================================================
var Celebrations = {

    /**
     * Launch a confetti burst from the center-top of the viewport.
     * @param {Object} [opts] - Optional overrides.
     * @param {number} [opts.count=60] - Number of particles.
     * @param {number} [opts.duration=2500] - Animation duration in ms.
     */
    confetti: function(opts) {
        opts = opts || {};
        var count = opts.count || 60;
        var duration = opts.duration || 2500;
        var colors = ["#16a34a", "#2563eb", "#d97706", "#dc2626",
                      "#7c3aed", "#06b6d4", "#f59e0b", "#ec4899"];

        var container = document.createElement("div");
        container.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;" +
            "pointer-events:none;z-index:9999;overflow:hidden;";
        document.body.appendChild(container);

        for (var i = 0; i < count; i++) {
            var particle = document.createElement("div");
            var color = colors[Math.floor(Math.random() * colors.length)];
            var size = 4 + Math.random() * 6;
            var isCircle = Math.random() > 0.5;

            particle.style.cssText = "position:absolute;top:40%;left:50%;" +
                "width:" + size + "px;height:" + (isCircle ? size : size * 0.4) + "px;" +
                "background:" + color + ";" +
                "border-radius:" + (isCircle ? "50%" : "1px") + ";" +
                "opacity:1;";

            container.appendChild(particle);
            Celebrations._animateParticle(particle, duration);
        }

        setTimeout(function() {
            if (container.parentNode) container.parentNode.removeChild(container);
        }, duration + 200);
    },

    /**
     * Animate a single confetti particle.
     * @private
     */
    _animateParticle: function(el, duration) {
        var angle = (Math.random() * 360) * (Math.PI / 180);
        var velocity = 200 + Math.random() * 400;
        var vx = Math.cos(angle) * velocity;
        var vy = Math.sin(angle) * velocity - 300; // upward bias
        var rotation = Math.random() * 720 - 360;
        var gravity = 600;

        var startTime = null;
        function frame(timestamp) {
            if (!startTime) startTime = timestamp;
            var t = (timestamp - startTime) / 1000; // seconds
            var progress = (timestamp - startTime) / duration;

            if (progress >= 1) {
                el.style.opacity = "0";
                return;
            }

            var x = vx * t;
            var y = vy * t + 0.5 * gravity * t * t;
            var rot = rotation * t;
            var opacity = progress > 0.7 ? 1 - ((progress - 0.7) / 0.3) : 1;

            el.style.transform = "translate(" + x + "px, " + y + "px) rotate(" + rot + "deg)";
            el.style.opacity = String(opacity);

            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    },

    /**
     * Show a milestone banner at the top of the screen.
     * @param {string} icon - Emoji/symbol for the banner.
     * @param {string} title - Main title text.
     * @param {string} subtitle - Description text.
     */
    showMilestoneBanner: function(icon, title, subtitle) {
        var existing = document.querySelector(".milestone-banner");
        if (existing) existing.remove();

        var banner = document.createElement("div");
        banner.className = "milestone-banner";
        banner.innerHTML = '<span class="milestone-icon">' + icon + '</span>' +
            '<div class="milestone-text"><strong>' + title + '</strong>' +
            (subtitle ? '<br><span>' + subtitle + '</span>' : '') +
            '</div>' +
            '<button onclick="this.parentNode.remove()" ' +
            'style="background:none;border:none;color:inherit;font-size:1.2em;' +
            'cursor:pointer;padding:4px;margin-left:auto;">&times;</button>';

        var topBar = document.getElementById("top-bar");
        if (topBar && topBar.parentNode) {
            topBar.parentNode.insertBefore(banner, topBar.nextSibling);
        }
        // Auto-remove after 6 seconds
        setTimeout(function() {
            if (banner.parentNode) {
                banner.style.opacity = "0";
                setTimeout(function() { banner.remove(); }, 400);
            }
        }, 6000);
    },

    /**
     * Check for and fire milestone celebrations after a session ends.
     * @param {Object} sessionData - The session summary data.
     */
    checkMilestones: function(sessionData) {
        if (!sessionData) return;

        // New masteries this session -> confetti
        if (sessionData.newMasteries && sessionData.newMasteries.length > 0) {
            Celebrations.confetti({ count: 40 + sessionData.newMasteries.length * 10 });
        }

        // Check for first-ever mastery
        DB.getAll(STORE_MASTERY).then(function(records) {
            var masteredCount = 0;
            records.forEach(function(r) {
                if (r.status === "mastered") masteredCount++;
            });

            // First mastery ever (exactly the count of new masteries = total mastered)
            if (sessionData.newMasteries && sessionData.newMasteries.length > 0 &&
                masteredCount === sessionData.newMasteries.length) {
                Celebrations.showMilestoneBanner(
                    SYMBOLS.TROPHY,
                    "First Mastery!",
                    "You've mastered your first problem type. Keep going!"
                );
            }

            // 10, 25, 50 milestones
            var milestones = [10, 25, 50, 75, 100];
            for (var i = 0; i < milestones.length; i++) {
                var m = milestones[i];
                if (masteredCount >= m &&
                    masteredCount - (sessionData.newMasteries ? sessionData.newMasteries.length : 0) < m) {
                    Celebrations.confetti({ count: 80 });
                    Celebrations.showMilestoneBanner(
                        SYMBOLS.STAR,
                        m + " Problem Types Mastered!",
                        "Outstanding achievement."
                    );
                    break;
                }
            }
        });

        // Check streak milestones
        DB.getAll(STORE_SESSIONS).then(function(sessions) {
            var streak = Celebrations._computeStreak(sessions);
            var streakMilestones = [3, 7, 14, 30];
            for (var i = 0; i < streakMilestones.length; i++) {
                if (streak === streakMilestones[i]) {
                    Celebrations.showMilestoneBanner(
                        SYMBOLS.FIRE,
                        streak + "-Day Streak!",
                        "Consistency is the key to success."
                    );
                    break;
                }
            }
        });
    },

    /**
     * Compute current study streak (consecutive days).
     * @private
     */
    _computeStreak: function(sessions) {
        if (!sessions || sessions.length === 0) return 0;

        var dates = {};
        sessions.forEach(function(s) {
            var d = (s.startTime || s.date || "").substring(0, 10);
            if (d) dates[d] = true;
        });

        var sortedDates = Object.keys(dates).sort().reverse();
        if (sortedDates.length === 0) return 0;

        var today = new Date();
        var todayStr = today.toISOString().substring(0, 10);
        var yesterdayStr = new Date(today.getTime() - 86400000).toISOString().substring(0, 10);

        // Streak must include today or yesterday
        if (sortedDates[0] !== todayStr && sortedDates[0] !== yesterdayStr) return 0;

        var streak = 1;
        for (var i = 1; i < sortedDates.length; i++) {
            var prev = new Date(sortedDates[i - 1] + "T00:00:00");
            var curr = new Date(sortedDates[i] + "T00:00:00");
            var diff = (prev - curr) / 86400000;
            if (diff === 1) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }
};


