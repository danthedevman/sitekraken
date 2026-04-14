(function (w, d) {

  if (w.__skEmbedLoaderLoaded) return;
  w.__skEmbedLoaderLoaded = true;

  var currentScript =
    d.currentScript ||
    (function () {
      var scripts = d.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var apiKey =
    currentScript &&
    (currentScript.getAttribute("data-api-key") ||
      currentScript.getAttribute("api-key"));

  var loaderBase =
    (currentScript &&
      currentScript.src &&
      (function () {
        try {
          var u = new URL(currentScript.src, w.location.href);
          return u.origin;
        } catch (e) {
          return null;
        }
      })());

  var devBaseUrl =
    currentScript &&
    (currentScript.getAttribute("data-dev-base-url") ||
      currentScript.getAttribute("dev-base-url"));

  var resolvedBaseUrl = loaderBase;

  if (devBaseUrl) {
    try {
      resolvedBaseUrl = new URL(devBaseUrl, w.location.href).origin;
    } catch (e) {
      console.warn("[SiteKraken] Invalid data-dev-base-url, falling back.");
    }
  }

  if (!apiKey) {
    console.error("[SiteKraken] Missing data-api-key on embed script.");
    return;
  }

  function mergeConfig(config) {
    if (!config || typeof config !== "object") return;

    w.EmbeddedChatbotConfig = {
      ...(w.EmbeddedChatbotConfig || {}),
      ...config,
      apiKey: apiKey,
      apiUrl: resolvedBaseUrl,
    };
  }

  function loadStylesheet(href) {
    return new Promise(function (resolve, reject) {
      if (!href) return resolve();

      var existing = d.querySelector('link[data-sk-href="' + href + '"]');
      if (existing) return resolve();

      var link = d.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-sk-href", href);

      link.onload = function () {
        resolve();
      };

      link.onerror = function () {
        reject(new Error("Failed to load stylesheet: " + href));
      };

      (d.head || d.documentElement).appendChild(link);
    });
  }

  function loadScript(src, isModule, moduleConfig) {
    return new Promise(function (resolve, reject) {
      if (!src) {
        reject(new Error("Missing scriptUrl"));
        return;
      }

      var existing = d.querySelector('script[data-sk-src="' + src + '"]');
      if (existing) {
        resolve();
        return;
      }

      var script = d.createElement("script");
      script.src = src;
      script.async = true;
      script.setAttribute("data-sk-src", src);
      script.setAttribute("data-api-key", apiKey);

      if (moduleConfig && typeof moduleConfig === "object") {
        script.setAttribute("data-module-config", JSON.stringify(moduleConfig));
      }

      if (isModule) {
        script.type = "module";
      }

      script.onload = function () {
        resolve();
      };

      script.onerror = function () {
        reject(new Error("Failed to load script: " + src));
      };

      (d.head || d.documentElement).appendChild(script);
    });
  }

  function fetchEmbedConfig() {
    var url = new URL("/embed/config", resolvedBaseUrl);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("host", w.location.hostname);
    url.searchParams.set("pageUrl", w.location.href);
    if (devBaseUrl) {
      url.searchParams.set("devBaseUrl", resolvedBaseUrl);
    }

    return fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
      },
      credentials: "omit",
    }).then(async function (res) {
      var text = await res.text();
 
      if (!res.ok) {
        throw new Error("Failed to fetch embed config (" + res.status + ")");
      }

      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error("Invalid JSON response: " + text.slice(0, 200));
      }
    });
  }

  function init() {
    fetchEmbedConfig()
      .then(function (payload) {
        if (!payload || payload.success === false) {
          throw new Error(
            (payload && payload.error) || "Invalid embed config response"
          );
        }

        var modules = Array.isArray(payload.modules) ? payload.modules : [];

        if (!modules.length) {
          console.warn("[SiteKraken] No modules returned.");
          return;
        }

        var jobs = modules
          .filter(function (mod) {
            return mod && mod.enabled !== false;
          })
          .map(function (mod) {
            var stylesheets = Array.isArray(mod.stylesheets)
              ? mod.stylesheets
              : [];

            if (mod.name === "chat") {
              mergeConfig(mod.config || {});
            }

            return Promise.all(stylesheets.map(loadStylesheet)).then(
              function () {
                return loadScript(
                  mod.scriptUrl,
                  Boolean(mod.module),
                  mod.config || {}
                );
              }
            );
          });

        return Promise.all(jobs);
      })
      .catch(function (err) {
        console.error("[SiteKraken]", err);
      });
  }

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window, document);
