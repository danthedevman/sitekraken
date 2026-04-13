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

  function parseIsoDate(value) {
    if (!value) return null;
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var type = String(raw.type || 'top');
    var position = String(raw.position || 'top');
    var status = String(raw.status || 'draft');

    return {
      id: String(raw.id || Math.random().toString(36).slice(2)),
      type: ['top', 'bottom', 'modal'].indexOf(type) > -1 ? type : 'top',
      position: ['top', 'bottom'].indexOf(position) > -1 ? position : 'top',
      status: ['draft', 'scheduled', 'published'].indexOf(status) > -1 ? status : 'draft',
      title: String(raw.title || ''),
      message: String(raw.message || ''),
      confirmLabel: String(raw.confirmLabel || 'Okay'),
      dismissible: raw.dismissible !== false,
      showOncePerSession: raw.showOncePerSession === true,
      fullWidth: raw.fullWidth !== false,
      shadow: raw.shadow !== false,
      autoHideMs: Number(raw.autoHideMs) > 0 ? Number(raw.autoHideMs) : 0,
      borderRadius: Number(raw.borderRadius) >= 0 ? Number(raw.borderRadius) : 8,
      zIndex: Number(raw.zIndex) >= 10 ? Number(raw.zIndex) : 2147483000,
      backgroundColor: raw.backgroundColor || '#1f2937',
      textColor: raw.textColor || '#ffffff',
      buttonColor: raw.buttonColor || '#ffffff',
      buttonTextColor: raw.buttonTextColor || '#111827',
      scheduleStartAt: raw.scheduleStartAt || '',
      scheduleEndAt: raw.scheduleEndAt || ''
    };
  }

  function getItems() {
    if (Array.isArray(cfg.items) && cfg.items.length) {
      return cfg.items.map(normalizeItem).filter(Boolean);
    }

    var legacy = normalizeItem(cfg);
    return legacy && legacy.message ? [legacy] : [];
  }

  function shouldRenderItem(item) {
    var allowedDomains = Array.isArray(cfg.allowedDomains) ? cfg.allowedDomains : [];
    if (allowedDomains.length && allowedDomains.indexOf(w.location.origin) === -1) return false;

    if (item.status === 'draft') return false;

    var now = new Date();
    var startAt = parseIsoDate(item.scheduleStartAt);
    var endAt = parseIsoDate(item.scheduleEndAt);

    if (item.status === 'scheduled') {
      if (startAt && now < startAt) return false;
      if (endAt && now > endAt) return false;
    }

    var storageKey = 'sk_banner_dismissed_' + item.id;
    if (item.showOncePerSession && w.sessionStorage.getItem(storageKey) === '1') {
      return false;
    }

    return Boolean(item.message);
  }

  function sharedStyles(el, item) {
    el.style.zIndex = String(item.zIndex || 2147483000);
    el.style.background = item.backgroundColor || '#1f2937';
    el.style.color = item.textColor || '#ffffff';
    el.style.borderRadius = (item.borderRadius || 8) + 'px';
    el.style.boxShadow = item.shadow === false ? 'none' : '0 8px 30px rgba(0,0,0,0.2)';
    el.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  }

  function buildButton(item, onClick) {
    var btn = d.createElement('button');
    btn.type = 'button';
    btn.textContent = item.confirmLabel || 'Okay';
    btn.style.border = '0';
    btn.style.borderRadius = '6px';
    btn.style.padding = '8px 12px';
    btn.style.cursor = 'pointer';
    btn.style.background = item.buttonColor || '#ffffff';
    btn.style.color = item.buttonTextColor || '#111827';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function buildPager(items, onSelect) {
    var pager = d.createElement('div');
    pager.style.display = 'flex';
    pager.style.alignItems = 'center';
    pager.style.gap = '8px';

    if (items.length <= 1) return pager;

    var prev = d.createElement('button');
    prev.type = 'button';
    prev.textContent = '‹';
    prev.style.border = '0';
    prev.style.background = 'transparent';
    prev.style.color = 'inherit';
    prev.style.cursor = 'pointer';
    prev.style.fontSize = '20px';

    var next = d.createElement('button');
    next.type = 'button';
    next.textContent = '›';
    next.style.border = '0';
    next.style.background = 'transparent';
    next.style.color = 'inherit';
    next.style.cursor = 'pointer';
    next.style.fontSize = '20px';

    var dots = d.createElement('div');
    dots.style.display = 'flex';
    dots.style.gap = '6px';

    var dotButtons = [];

    for (var i = 0; i < items.length; i += 1) {
      (function (idx) {
        var dot = d.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', 'Show banner ' + (idx + 1));
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '99px';
        dot.style.border = '0';
        dot.style.padding = '0';
        dot.style.cursor = 'pointer';
        dot.style.opacity = '0.4';
        dot.addEventListener('click', function () {
          onSelect(idx);
        });
        dotButtons.push(dot);
        dots.appendChild(dot);
      })(i);
    }

    pager.update = function (currentIndex) {
      for (var j = 0; j < dotButtons.length; j += 1) {
        dotButtons[j].style.opacity = j === currentIndex ? '1' : '0.4';
      }
    };

    prev.addEventListener('click', function () {
      onSelect(-1);
    });
    next.addEventListener('click', function () {
      onSelect(1);
    });

    pager.appendChild(prev);
    pager.appendChild(dots);
    pager.appendChild(next);

    return pager;
  }

  function createDismiss(item, activeItems, root, indexRef, onChange) {
    return function () {
      if (item.showOncePerSession) {
        w.sessionStorage.setItem('sk_banner_dismissed_' + item.id, '1');
      }

      var nextItems = [];
      for (var i = 0; i < activeItems.length; i += 1) {
        if (activeItems[i].id !== item.id) nextItems.push(activeItems[i]);
      }

      activeItems.length = 0;
      Array.prototype.push.apply(activeItems, nextItems);

      if (!activeItems.length) {
        if (root && root.parentNode) root.parentNode.removeChild(root);
        return;
      }

      if (indexRef.current >= activeItems.length) indexRef.current = 0;
      onChange();
    };
  }

  function renderBarCarousel(items, position) {
    if (!items.length) return;

    var activeItems = items.slice();
    var state = { current: 0, timer: null };

    var root = d.createElement('div');
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.right = '0';
    root.style[position] = '0';

    var bar = d.createElement('div');
    bar.style.padding = '10px 16px';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.justifyContent = 'space-between';
    bar.style.gap = '10px';

    var message = d.createElement('div');
    message.style.flex = '1';

    var actions = d.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';

    bar.appendChild(message);
    bar.appendChild(actions);
    root.appendChild(bar);
    d.body.appendChild(root);

    var pager = buildPager(activeItems, function (action) {
      if (action === -1) {
        state.current = (state.current - 1 + activeItems.length) % activeItems.length;
      } else if (action === 1) {
        state.current = (state.current + 1) % activeItems.length;
      } else {
        state.current = action;
      }
      draw();
    });

    function draw() {
      if (!activeItems.length) return;

      if (state.timer) {
        w.clearTimeout(state.timer);
        state.timer = null;
      }

      var item = activeItems[state.current];
      sharedStyles(bar, item);
      root.style.zIndex = String(item.zIndex || 2147483000);
      bar.style.left = item.fullWidth === false ? '16px' : '0';
      bar.style.right = item.fullWidth === false ? '16px' : '0';

      message.textContent = item.message;
      actions.innerHTML = '';

      actions.appendChild(
        buildButton(item, createDismiss(item, activeItems, root, state, draw))
      );

      if (item.dismissible !== false) {
        var close = d.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Close banner');
        close.style.background = 'transparent';
        close.style.border = '0';
        close.style.color = item.textColor || '#ffffff';
        close.style.fontSize = '20px';
        close.style.cursor = 'pointer';
        close.addEventListener('click', createDismiss(item, activeItems, root, state, draw));
        actions.appendChild(close);
      }

      if (activeItems.length > 1) {
        actions.appendChild(pager);
        if (typeof pager.update === 'function') pager.update(state.current);
      }

      if (item.autoHideMs > 0) {
        state.timer = w.setTimeout(createDismiss(item, activeItems, root, state, draw), item.autoHideMs);
      }
    }

    draw();
  }

  function renderModalCarousel(items) {
    if (!items.length) return;

    var activeItems = items.slice();
    var state = { current: 0, timer: null };

    var overlay = d.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.35)';
    overlay.style.display = 'grid';
    overlay.style.placeItems = 'center';
    overlay.style.padding = '16px';

    var modal = d.createElement('div');
    modal.style.maxWidth = '540px';
    modal.style.width = '100%';
    modal.style.padding = '20px';

    var title = d.createElement('h3');
    title.style.margin = '0 0 8px';

    var body = d.createElement('div');
    body.style.marginBottom = '12px';

    var row = d.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'flex-end';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    modal.appendChild(title);
    modal.appendChild(body);
    modal.appendChild(row);
    overlay.appendChild(modal);
    d.body.appendChild(overlay);

    var pager = buildPager(activeItems, function (action) {
      if (action === -1) {
        state.current = (state.current - 1 + activeItems.length) % activeItems.length;
      } else if (action === 1) {
        state.current = (state.current + 1) % activeItems.length;
      } else {
        state.current = action;
      }
      draw();
    });

    function draw() {
      if (!activeItems.length) return;

      if (state.timer) {
        w.clearTimeout(state.timer);
        state.timer = null;
      }

      var item = activeItems[state.current];
      overlay.style.zIndex = String(item.zIndex || 2147483000);
      sharedStyles(modal, item);

      if (item.title) {
        title.style.display = '';
        title.textContent = item.title;
      } else {
        title.style.display = 'none';
      }

      body.textContent = item.message;
      row.innerHTML = '';

      row.appendChild(buildButton(item, createDismiss(item, activeItems, overlay, state, draw)));

      if (item.dismissible !== false) {
        var close = d.createElement('button');
        close.type = 'button';
        close.textContent = 'Close';
        close.style.background = 'transparent';
        close.style.color = item.textColor || '#ffffff';
        close.style.border = '1px solid rgba(255,255,255,.3)';
        close.style.borderRadius = '6px';
        close.style.padding = '8px 12px';
        close.style.cursor = 'pointer';
        close.addEventListener('click', createDismiss(item, activeItems, overlay, state, draw));
        row.appendChild(close);
      }

      if (activeItems.length > 1) {
        row.appendChild(pager);
        if (typeof pager.update === 'function') pager.update(state.current);
      }

      if (item.autoHideMs > 0) {
        state.timer = w.setTimeout(createDismiss(item, activeItems, overlay, state, draw), item.autoHideMs);
      }
    }

    draw();
  }

  function init() {
    var allItems = getItems();
    var activeItems = allItems.filter(shouldRenderItem);

    if (!activeItems.length) return;

    var modalItems = [];
    var topItems = [];
    var bottomItems = [];

    for (var i = 0; i < activeItems.length; i += 1) {
      var item = activeItems[i];
      if (item.type === 'modal') {
        modalItems.push(item);
      } else if (item.type === 'bottom' || item.position === 'bottom') {
        bottomItems.push(item);
      } else {
        topItems.push(item);
      }
    }

    renderBarCarousel(topItems, 'top');
    renderBarCarousel(bottomItems, 'bottom');
    renderModalCarousel(modalItems);
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window, document);
