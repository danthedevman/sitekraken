(function (w, d) {
  var script =
    d.currentScript ||
    (function () {
      var scripts = d.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  var rawModuleConfig = script && script.getAttribute('data-module-config');
  var cfg = {};

  try {
    cfg = rawModuleConfig ? JSON.parse(rawModuleConfig) : {};
  } catch (error) {
    console.warn('[SiteKraken feedback] Invalid module config', error);
    cfg = {};
  }

  if (cfg.enabled === false) return;

  var fields = Array.isArray(cfg.fields) ? cfg.fields : [];
  if (!fields.length) return;

  var apiBase = cfg.apiUrl || (script && script.src ? new URL(script.src, w.location.href).origin : w.location.origin);
  var apiKey = (script && script.getAttribute('data-api-key')) || '';

  function getSide(value) {
    var side = String(value || '').toLowerCase();
    return side === 'left' ? 'left' : 'right';
  }

  function getVerticalPosition(value) {
    var pos = String(value || '').toLowerCase();
    return pos === 'top' || pos === 'middle' ? pos : 'bottom';
  }

  function getOffsetPx(value, fallback) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(200, Math.round(parsed)));
  }

  function mountWidget() {
    if (!d.body) return;

    var root = d.createElement('div');
    root.style.position = 'fixed';
    root.style.zIndex = '2147482999';
    root.style.width = '0';
    root.style.height = '0';

    var side = getSide(cfg.displaySide);
    var verticalPosition = getVerticalPosition(cfg.verticalPosition);
    var offsetPx = getOffsetPx(cfg.offsetPx, 0);

    root.style[side] = '0px';
    if (verticalPosition === 'top') {
      root.style.top = offsetPx + 'px';
    } else if (verticalPosition === 'middle') {
      root.style.top = '50%';
      root.style.transform = 'translateY(-50%)';
    } else {
      root.style.bottom = offsetPx + 'px';
    }

    var isRightSide = side === 'right';

    var tab = d.createElement('button');
    tab.type = 'button';
    tab.textContent = cfg.tabLabel || 'Feedback';
    tab.setAttribute('aria-expanded', 'false');
    tab.style.border = '0';
    tab.style.padding = '10px 16px';
    tab.style.borderRadius = '10px 10px 0 0';
    tab.style.cursor = 'pointer';
    tab.style.background = cfg.tabBackgroundColor || '#111827';
    tab.style.color = cfg.tabTextColor || '#ffffff';
    tab.style.position = 'absolute';
    tab.style.top = '0';
    tab.style.whiteSpace = 'nowrap';
    tab.style.transformOrigin = isRightSide ? 'top right' : 'top left';
    tab.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
    tab.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    if (isRightSide) {
      tab.style.right = '0';
      tab.style.transform = 'rotate(90deg) translateY(-100%)';
    } else {
      tab.style.left = '0';
      tab.style.transform = 'rotate(-90deg) translateX(-100%)';
    }

    var overlay = d.createElement('button');
    overlay.type = 'button';
    overlay.setAttribute('aria-label', 'Close feedback form');
    overlay.style.display = 'none';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.border = '0';
    overlay.style.padding = '0';
    overlay.style.margin = '0';
    overlay.style.background = 'rgba(17, 24, 39, 0.45)';
    overlay.style.cursor = 'pointer';

    var panel = d.createElement('div');
    panel.style.display = 'none';
    panel.style.width = 'min(360px, calc(100vw - 24px))';
    panel.style.maxHeight = 'min(70vh, 620px)';
    panel.style.overflowY = 'auto';
    panel.style.background = cfg.panelBackgroundColor || '#ffffff';
    panel.style.color = cfg.panelTextColor || '#111827';
    panel.style.padding = '12px';
    panel.style.borderRadius = '10px';
    panel.style.boxShadow = '0 8px 30px rgba(0,0,0,0.2)';
    panel.style.position = 'fixed';
    panel.style.top = '50%';
    panel.style.left = '50%';
    panel.style.transform = 'translate(-50%, -50%)';
    panel.style.zIndex = '2147483001';
    panel.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    var header = d.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '8px';
    header.style.marginBottom = '10px';

    var title = d.createElement('h3');
    title.textContent = cfg.formTitle || 'Share your feedback';
    title.style.margin = '0';
    title.style.fontSize = '16px';

    var closeBtn = d.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close feedback form');
    closeBtn.style.border = '0';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = panel.style.color;
    closeBtn.style.fontSize = '18px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '2px 4px';

    var message = d.createElement('div');
    message.style.display = 'none';
    message.style.marginBottom = '10px';

    var form = d.createElement('form');
    form.style.display = 'grid';
    form.style.gap = '10px';

  function createField(field) {
    var wrap = d.createElement('label');
    wrap.style.display = 'grid';
    wrap.style.gap = '4px';

    var label = d.createElement('span');
    label.textContent = field.label + (field.required ? ' *' : '');
    label.style.fontSize = '13px';

    var input;
    if (field.type === 'multiline') {
      input = d.createElement('textarea');
      input.rows = 3;
    } else if (field.type === 'select') {
      input = d.createElement('select');
      var empty = d.createElement('option');
      empty.value = '';
      empty.textContent = 'Select';
      input.appendChild(empty);
      (Array.isArray(field.options) ? field.options : []).forEach(function (optionValue) {
        var option = d.createElement('option');
        option.value = String(optionValue);
        option.textContent = String(optionValue);
        input.appendChild(option);
      });
    } else {
      input = d.createElement('input');
      input.type = field.type === 'email' ? 'email' : 'text';
    }

    input.name = field.id;
    input.required = field.required === true;
    if (field.placeholder) input.placeholder = field.placeholder;
    input.style.width = '100%';
    input.style.padding = '8px';
    input.style.border = '1px solid #d1d5db';
    input.style.borderRadius = '8px';

    wrap.appendChild(label);
    wrap.appendChild(input);

    if (field.helpText) {
      var help = d.createElement('small');
      help.textContent = field.helpText;
      help.style.opacity = '0.7';
      wrap.appendChild(help);
    }

    return wrap;
  }

    fields.forEach(function (field) {
      form.appendChild(createField(field));
    });

    var submit = d.createElement('button');
    submit.type = 'submit';
    submit.textContent = cfg.submitLabel || 'Send feedback';
    submit.style.border = '0';
    submit.style.padding = '10px 12px';
    submit.style.borderRadius = '8px';
    submit.style.cursor = 'pointer';
    submit.style.background = cfg.buttonBackgroundColor || '#111827';
    submit.style.color = cfg.buttonTextColor || '#ffffff';

    form.appendChild(submit);

    function setMessage(text, success) {
      message.style.display = 'block';
      message.textContent = text;
      message.style.color = success ? '#065f46' : '#b91c1c';
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      message.style.display = 'none';

      var answers = {};
      var invalid = false;

      fields.forEach(function (field) {
        var el = form.elements[field.id];
        var value = el && typeof el.value === 'string' ? el.value.trim() : '';
        if (field.required && !value) invalid = true;
        answers[field.id] = value;
      });

      if (invalid) {
        setMessage('Please fill in required fields.', false);
        return;
      }

      fetch(new URL('/api/feedback/submissions', apiBase).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          apiKey: apiKey,
          pageUrl: w.location.href,
          answers: answers,
        }),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) {
              throw new Error(body && body.error ? body.error : 'Unable to submit feedback.');
            }
            return body;
          });
        })
        .then(function (body) {
          form.reset();
          var titleText = body.confirmationTitle || cfg.confirmationTitle || 'Thanks for your feedback';
          var messageText = body.confirmationMessage || cfg.confirmationMessage || 'Your response has been submitted.';
          setMessage(titleText + ': ' + messageText, true);
        })
        .catch(function (error) {
          setMessage(error.message || 'Unable to submit feedback.', false);
        });
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(message);
    panel.appendChild(form);

    function setOpen(nextOpen) {
      panel.style.display = nextOpen ? 'block' : 'none';
      overlay.style.display = nextOpen ? 'block' : 'none';
      tab.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    }

    tab.addEventListener('click', function () {
      setOpen(panel.style.display === 'none');
    });

    overlay.addEventListener('click', function () {
      setOpen(false);
    });

    closeBtn.addEventListener('click', function () {
      setOpen(false);
    });

    d.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });

    root.appendChild(tab);
    root.appendChild(overlay);
    root.appendChild(panel);
    d.body.appendChild(root);
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', mountWidget, { once: true });
  } else {
    mountWidget();
  }
})(window, document);
