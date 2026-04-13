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

    var side = getSide(cfg.displaySide);
    var verticalPosition = getVerticalPosition(cfg.verticalPosition);
    var offsetPx = getOffsetPx(cfg.offsetPx, 12);

    root.style[side] = offsetPx + 'px';
    if (verticalPosition === 'top') {
      root.style.top = offsetPx + 'px';
    } else if (verticalPosition === 'middle') {
      root.style.top = '50%';
      root.style.transform = 'translateY(-50%)';
    } else {
      root.style.bottom = offsetPx + 'px';
    }

    var tab = d.createElement('button');
    tab.type = 'button';
    tab.textContent = cfg.tabLabel || 'Feedback';
    tab.style.border = '0';
    tab.style.padding = '10px 14px';
    tab.style.borderRadius = '10px';
    tab.style.cursor = 'pointer';
    tab.style.background = cfg.tabBackgroundColor || '#111827';
    tab.style.color = cfg.tabTextColor || '#ffffff';

    var panel = d.createElement('div');
    panel.style.display = 'none';
    panel.style.width = 'min(360px, calc(100vw - 24px))';
    panel.style.maxHeight = '70vh';
    panel.style.overflowY = 'auto';
    panel.style.background = cfg.panelBackgroundColor || '#ffffff';
    panel.style.color = cfg.panelTextColor || '#111827';
    panel.style.padding = '12px';
    panel.style.borderRadius = '10px';
    panel.style.boxShadow = '0 8px 30px rgba(0,0,0,0.2)';
    panel.style.marginTop = '8px';
    panel.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    var title = d.createElement('h3');
    title.textContent = cfg.formTitle || 'Share your feedback';
    title.style.margin = '0 0 10px';
    title.style.fontSize = '16px';

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

    panel.appendChild(title);
    panel.appendChild(message);
    panel.appendChild(form);

    tab.addEventListener('click', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    root.appendChild(tab);
    root.appendChild(panel);
    d.body.appendChild(root);
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', mountWidget, { once: true });
  } else {
    mountWidget();
  }
})(window, document);
