(function (w, d) {
  if (w.__skLogsLoaded) return;
  w.__skLogsLoaded = true;

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
      console.warn("[SiteKraken logs] Invalid module config", error);
    }
  }

  var apiUrl = String(moduleConfig.apiUrl || w.location.origin).replace(/\/+$/, "");
  var endpoint = apiUrl + "/api/logs/events";
  var flushEveryMs = Number(moduleConfig.flushEveryMs || 4000);
  var captureConsoleErrors = moduleConfig.captureConsoleErrors !== false;

  var queue = [];

  function getContext() {
    return {
      source: "embed",
    };
  }

  function pushLog(level, type, message, extra) {
    queue.push({
      level: level,
      type: type,
      message: String(message || "").slice(0, 2000),
      ts: new Date().toISOString(),
      ...getContext(),
      ...(extra || {})
    });

    if (queue.length >= 10) {
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
      // silent drop
    });
  }

  pushLog("info", "library_loaded", "Logs library initialized.");
  pushLog("info", "page_view", "Page loaded.");

  w.addEventListener("error", function (event) {
    var error = event.error || {};
    pushLog("error", "error", event.message || "Unhandled error", {
      stack: error && error.stack ? String(error.stack).slice(0, 6000) : "",
      metadata: {
        filename: event.filename || "",
        lineno: event.lineno || null,
        colno: event.colno || null
      }
    });
    flush();
  });

  w.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    var message = reason && reason.message ? reason.message : String(reason || "Unhandled promise rejection");
    var stack = reason && reason.stack ? String(reason.stack) : "";

    pushLog("error", "unhandled_rejection", message, {
      stack: stack.slice(0, 6000)
    });
    flush();
  });

  if (captureConsoleErrors && w.console && typeof w.console.error === "function") {
    var originalConsoleError = w.console.error;

    w.console.error = function () {
      try {
        var args = Array.prototype.slice.call(arguments || []);
        var message = args
          .map(function (arg) {
            if (typeof arg === "string") return arg;
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          })
          .join(" ")
          .slice(0, 2000);

        pushLog("error", "console_error", message || "console.error called", {
          metadata: {
            argCount: args.length
          }
        });
      } catch {
        // ignore
      }

      return originalConsoleError.apply(this, arguments);
    };
  }

  w.addEventListener("beforeunload", flush);
  d.addEventListener("visibilitychange", function () {
    if (d.visibilityState === "hidden") flush();
  });

  w.setInterval(flush, flushEveryMs);
})(window, document);
