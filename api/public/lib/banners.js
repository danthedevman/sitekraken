(function (w, d) {
  var script =
    d.currentScript ||
    (function () {
      var scripts = d.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  var rawModuleConfig = script && script.getAttribute('data-module-config');
  var moduleConfig = {};

  try {
    moduleConfig = rawModuleConfig ? JSON.parse(rawModuleConfig) : {};
  } catch (error) {
    console.warn('[SiteKraken banners] Invalid module config', error);
  }

  var cfg = moduleConfig || {};
  var storageKey = 'sk_banner_dismissed_' + (cfg.title || cfg.message || 'default');

  function parseIsoDate(value) {
    if (!value) return null;
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function shouldRender() {
    var allowedDomains = Array.isArray(cfg.allowedDomains) ? cfg.allowedDomains : [];

    if (allowedDomains.length && allowedDomains.indexOf(w.location.origin) === -1) return false;

    if (cfg.status === 'draft') return false;

    var now = new Date();
    var startAt = parseIsoDate(cfg.scheduleStartAt);
    var endAt = parseIsoDate(cfg.scheduleEndAt);

    if (cfg.status === 'scheduled') {
      if (startAt && now < startAt) return false;
      if (endAt && now > endAt) return false;
    }

    if (cfg.showOncePerSession && w.sessionStorage.getItem(storageKey) === '1') {
      return false;
    }

    return Boolean(cfg.message);
  }

  function dismiss(rootEl) {
    if (cfg.showOncePerSession) w.sessionStorage.setItem(storageKey, '1');
    if (rootEl && rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
  }

  function sharedStyles(el) {
    el.style.zIndex = String(cfg.zIndex || 2147483000);
    el.style.background = cfg.backgroundColor || '#1f2937';
    el.style.color = cfg.textColor || '#ffffff';
    el.style.borderRadius = (cfg.borderRadius || 8) + 'px';
    el.style.boxShadow = cfg.shadow === false ? 'none' : '0 8px 30px rgba(0,0,0,0.2)';
    el.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  }

  function buildButton(onClick) {
    var btn = d.createElement('button');
    btn.type = 'button';
    btn.textContent = cfg.confirmLabel || 'Okay';
    btn.style.border = '0';
    btn.style.borderRadius = '6px';
    btn.style.padding = '8px 12px';
    btn.style.cursor = 'pointer';
    btn.style.background = cfg.buttonColor || '#ffffff';
    btn.style.color = cfg.buttonTextColor || '#111827';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderModal() {
    var overlay = d.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.display = 'grid';
    overlay.style.placeItems = 'center';
    overlay.style.padding = '16px';
    overlay.style.zIndex = String(cfg.zIndex || 2147483000);

    var modal = d.createElement('div');
    sharedStyles(modal);
    modal.style.maxWidth = '540px';
    modal.style.width = '100%';
    modal.style.padding = '20px';

    if (cfg.title) {
      var title = d.createElement('h3');
      title.textContent = cfg.title;
      title.style.margin = '0 0 8px';
      modal.appendChild(title);
    }

    var body = d.createElement('div');
    body.textContent = cfg.message;
    body.style.marginBottom = '12px';
    modal.appendChild(body);

    var row = d.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.gap = '8px';
    row.appendChild(buildButton(function () { dismiss(overlay); }));

    if (cfg.dismissible !== false) {
      var close = d.createElement('button');
      close.type = 'button';
      close.textContent = 'Close';
      close.style.background = 'transparent';
      close.style.color = cfg.textColor || '#ffffff';
      close.style.border = '1px solid rgba(255,255,255,.3)';
      close.style.borderRadius = '6px';
      close.style.padding = '8px 12px';
      close.style.cursor = 'pointer';
      close.addEventListener('click', function () { dismiss(overlay); });
      row.appendChild(close);
    }

    modal.appendChild(row);
    overlay.appendChild(modal);
    d.body.appendChild(overlay);

    if ((cfg.autoHideMs || 0) > 0) {
      w.setTimeout(function () { dismiss(overlay); }, Number(cfg.autoHideMs));
    }
  }

  function renderBar(position) {
    var bar = d.createElement('div');
    sharedStyles(bar);
    bar.style.position = 'fixed';
    bar.style.left = cfg.fullWidth === false ? '16px' : '0';
    bar.style.right = cfg.fullWidth === false ? '16px' : '0';
    bar.style[position] = '0';
    bar.style.padding = '10px 16px';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.justifyContent = 'space-between';
    bar.style.gap = '10px';

    var message = d.createElement('div');
    message.textContent = cfg.message;
    message.style.flex = '1';
    bar.appendChild(message);

    var actions = d.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.appendChild(buildButton(function () { dismiss(bar); }));

    if (cfg.dismissible !== false) {
      var close = d.createElement('button');
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Close banner');
      close.style.background = 'transparent';
      close.style.border = '0';
      close.style.color = cfg.textColor || '#ffffff';
      close.style.fontSize = '20px';
      close.style.cursor = 'pointer';
      close.addEventListener('click', function () { dismiss(bar); });
      actions.appendChild(close);
    }

    bar.appendChild(actions);
    d.body.appendChild(bar);

    if ((cfg.autoHideMs || 0) > 0) {
      w.setTimeout(function () { dismiss(bar); }, Number(cfg.autoHideMs));
    }
  }

  function init() {
    if (!shouldRender()) return;

    var type = cfg.type || 'top';
    if (type === 'modal') {
      renderModal();
    } else if (type === 'bottom') {
      renderBar('bottom');
    } else {
      renderBar(cfg.position === 'bottom' ? 'bottom' : 'top');
    }
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window, document);
