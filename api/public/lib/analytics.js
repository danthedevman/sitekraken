(function (w, d) {
  if (w.__skAnalyticsLoaded) return;
  w.__skAnalyticsLoaded = true;

  var scriptEl = d.currentScript;
  var apiKey =
    (scriptEl &&
      (scriptEl.getAttribute("data-api-key") || scriptEl.getAttribute("api-key"))) ||
    "";

  var rawModuleConfig = scriptEl && scriptEl.getAttribute("data-module-config");
  var moduleConfig = {};

  if (rawModuleConfig) {
    try {
      moduleConfig = JSON.parse(rawModuleConfig);
    } catch (error) {
      console.warn("[SiteKraken analytics] Invalid module config", error);
    }
  }

  var apiUrl = String(moduleConfig.apiUrl || w.location.origin).replace(/\/+$/, "");
  var endpoint = apiUrl + "/api/analytics/events";
  var flushEveryMs = Number(moduleConfig.flushEveryMs || 7000);
  var heartbeatEveryMs = Number(moduleConfig.heartbeatEveryMs || 30000);
  var clickTrackingEnabled = moduleConfig.trackClicks !== false;
  var linkTrackingEnabled = moduleConfig.trackLinks !== false;
  var buttonTrackingEnabled = moduleConfig.trackButtons !== false;
  var scrollTrackingEnabled = moduleConfig.trackScrollDepth !== false;

  var scrollMilestones = new Set();
  var queue = [];
  var flushTimer = null;

  function getContext() {
    return {
      viewportW: w.innerWidth || 0,
      viewportH: w.innerHeight || 0,
      tzOffsetMinutes: new Date().getTimezoneOffset()
    };
  }

  function pushEvent(type, payload) {
    queue.push({
      type: type,
      ts: new Date().toISOString(),
      source: "embed",
      userAgent: navigator.userAgent || "",
      ...getContext(),
      ...(payload || {})
    });

    if (queue.length >= 12) {
      flush();
    }
  }

  function flush() {
    if (!queue.length) return;

    var events = queue.splice(0, queue.length);

    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        events: events
      }),
      keepalive: true,
      credentials: "omit"
    }).catch(function () {
      // silently drop network errors to avoid impacting host pages
    });
  }

  function setupClickTracking() {
    if (!clickTrackingEnabled) return;

    d.addEventListener(
      "click",
      function (event) {
        var target = event.target && event.target.closest ? event.target.closest("a,button,[role='button']") : null;
        if (!target) return;

        var tagName = String(target.tagName || "").toLowerCase();

        if (tagName === "a" && !linkTrackingEnabled) return;
        if (tagName === "button" && !buttonTrackingEnabled) return;

        var href = target.getAttribute("href") || "";
        var role = target.getAttribute("role") || "";
        var text = (target.innerText || target.textContent || "").trim().slice(0, 140);
        var targetId = target.id || "";

        pushEvent(tagName === "a" ? "link_click" : tagName === "button" ? "button_click" : "click", {
          targetTag: tagName,
          targetHref: href,
          targetRole: role,
          targetText: text,
          targetId: targetId
        });
      },
      true
    );
  }

  function setupScrollDepthTracking() {
    if (!scrollTrackingEnabled) return;

    var milestones = [25, 50, 75, 90, 100];

    w.addEventListener(
      "scroll",
      function () {
        var doc = d.documentElement;
        var body = d.body;
        var top = w.scrollY || doc.scrollTop || body.scrollTop || 0;
        var maxScrollable = (doc.scrollHeight || body.scrollHeight || 0) - (w.innerHeight || 0);

        if (maxScrollable <= 0) return;

        var pct = Math.max(0, Math.min(100, Math.round((top / maxScrollable) * 100)));

        milestones.forEach(function (milestone) {
          if (pct >= milestone && !scrollMilestones.has(milestone)) {
            scrollMilestones.add(milestone);
            pushEvent("scroll_depth", { scrollPercent: milestone });
          }
        });
      },
      { passive: true }
    );
  }

  function startFlushLoop() {
    flushTimer = w.setInterval(flush, flushEveryMs);
  }

  function setupLifecycle() {
    w.addEventListener("beforeunload", flush);
    d.addEventListener("visibilitychange", function () {
      if (d.visibilityState === "hidden") flush();
    });
  }

  pushEvent("session_start");
  pushEvent("page_view");
  setupClickTracking();
  setupScrollDepthTracking();
  setupLifecycle();
  startFlushLoop();

  if (heartbeatEveryMs > 0) {
    w.setInterval(function () {
      pushEvent("heartbeat");
    }, heartbeatEveryMs);
  }
})(window, document);
