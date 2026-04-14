(() => {
  if (window.__embeddedFeedbackLoaded) return;
  window.__embeddedFeedbackLoaded = true;

  function getCurrentScript() {
    if (document.currentScript) return document.currentScript;

    const scripts = Array.from(document.getElementsByTagName('script'));
    return (
      scripts.find((s) => s.src && s.src.includes('/public/lib/feedback.js')) ||
      scripts[scripts.length - 1]
    );
  }

  const currentScript = getCurrentScript();

  let moduleConfig = {};
  try {
    moduleConfig = currentScript?.getAttribute('data-module-config')
      ? JSON.parse(currentScript.getAttribute('data-module-config'))
      : {};
  } catch {
    moduleConfig = {};
  }

  if (moduleConfig.enabled === false) return;

  const inferredScriptOrigin = currentScript?.src
    ? (() => {
        try {
          return new URL(currentScript.src, window.location.href).origin;
        } catch {
          return '';
        }
      })()
    : '';

  const DEFAULTS = {
    enabled: true,
    apiUrl: '',
    apiKey: currentScript?.getAttribute('data-api-key') || '',
    fields: [],
    tabLabel: 'Feedback',
    formTitle: 'Share your feedback',
    submitLabel: 'Send feedback',
    confirmationTitle: 'Thanks for your feedback',
    confirmationMessage: 'Your response has been submitted.',
    tabBackgroundColor: '#111827',
    tabTextColor: '#ffffff',
    panelBackgroundColor: '#ffffff',
    panelTextColor: '#111827',
    buttonBackgroundColor: '#111827',
    buttonTextColor: '#ffffff',
    displaySide: 'right',
    verticalPosition: 'bottom',
    offsetPx: 0,
  };

  const config = {
    ...DEFAULTS,
    ...(moduleConfig || {}),
    apiUrl:
      moduleConfig.apiUrl || inferredScriptOrigin || window.location.origin,
    apiKey:
      currentScript?.getAttribute('data-api-key') ||
      moduleConfig.apiKey ||
      DEFAULTS.apiKey,
  };

  function sanitizeColor(value, fallback) {
    const str = String(value || '').trim();
    if (!str) return fallback;

    if (
      /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(str) ||
      /^rgba?\([\d\s.,%]+\)$/i.test(str) ||
      /^hsla?\([\d\s.,%]+\)$/i.test(str) ||
      /^[a-z]+$/i.test(str)
    ) {
      return str;
    }

    return fallback;
  }

  function normalizeSide(value) {
    const side = String(value || '').toLowerCase();
    return side === 'left' ? 'left' : 'right';
  }

  function normalizeVerticalPosition(value) {
    const pos = String(value || '').toLowerCase();
    return pos === 'top' || pos === 'middle' ? pos : 'bottom';
  }

  function normalizeOffsetPx(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(200, Math.round(parsed)));
  }

  function normalizeFields(value) {
    if (!Array.isArray(value)) return [];

    return value
      .map((field) => {
        if (!field || typeof field !== 'object' || !field.id || !field.label) {
          return null;
        }

        const type = String(field.type || 'text').toLowerCase();
        return {
          id: String(field.id),
          label: String(field.label),
          required: field.required === true,
          helpText: field.helpText ? String(field.helpText) : '',
          placeholder: field.placeholder ? String(field.placeholder) : '',
          type:
            type === 'multiline' || type === 'select' || type === 'email'
              ? type
              : 'text',
          options: Array.isArray(field.options)
            ? field.options.map((opt) => String(opt))
            : [],
        };
      })
      .filter(Boolean);
  }

  config.fields = normalizeFields(config.fields);
  if (!config.fields.length) return;

  config.tabBackgroundColor = sanitizeColor(
    config.tabBackgroundColor,
    DEFAULTS.tabBackgroundColor,
  );
  config.tabTextColor = sanitizeColor(config.tabTextColor, DEFAULTS.tabTextColor);
  config.panelBackgroundColor = sanitizeColor(
    config.panelBackgroundColor,
    DEFAULTS.panelBackgroundColor,
  );
  config.panelTextColor = sanitizeColor(
    config.panelTextColor,
    DEFAULTS.panelTextColor,
  );
  config.buttonBackgroundColor = sanitizeColor(
    config.buttonBackgroundColor,
    DEFAULTS.buttonBackgroundColor,
  );
  config.buttonTextColor = sanitizeColor(
    config.buttonTextColor,
    DEFAULTS.buttonTextColor,
  );

  config.displaySide = normalizeSide(config.displaySide);
  config.verticalPosition = normalizeVerticalPosition(config.verticalPosition);
  config.offsetPx = normalizeOffsetPx(config.offsetPx, DEFAULTS.offsetPx);

  function mount() {
    if (!document.body || document.getElementById('embedded-feedback-host')) return;

    const host = document.createElement('div');
    host.id = 'embedded-feedback-host';
    host.style.position = 'fixed';
    host.style.zIndex = '2147482999';
    host.style.pointerEvents = 'none';
    host.style.background = 'transparent';

    host.style[config.displaySide] = '0px';
    host.style.height = '100vh';
    if (config.verticalPosition === 'top') {
      host.style.top = config.offsetPx + 'px';
    } else if (config.verticalPosition === 'middle') {
      host.style.top = '50%';
      //host.style.transform = 'translateY(-50%)';
    } else {
      host.style.bottom = config.offsetPx + 'px';
    }

    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host, * { box-sizing: border-box; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      .wrap { position: relative; pointer-events: auto; }
      .tab {
        position: fixed;
        top: 50%;
        border: 0;
        padding: 10px 16px;
        border-radius: 10px 10px 0 0;
        cursor: pointer;
        white-space: nowrap;
        transform-origin: ${config.displaySide === 'right' ? 'top right' : 'top left'};
        box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        background: ${config.tabBackgroundColor};
        color: ${config.tabTextColor};
        height:40px;
      }
      .tab.right { right: 40px; transform: rotate(-90deg) translateY(0); }
      .tab.left { left: 40px; transform: rotate(90deg) translateX(0); }

      .overlayWrap {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        display: none;
      }
      .overlayWrap.open { display: block; }

      .overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        margin: 0;
        padding: 0;
        cursor: pointer;
        background: rgba(17, 24, 39, 0.45);
      }

      .panel {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(360px, calc(100vw - 24px));
        max-height: min(70vh, 620px);
        overflow-y: auto;
        background: ${config.panelBackgroundColor};
        color: ${config.panelTextColor};
        padding: 12px;
        border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.2);
      }

      .header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
      .title { margin: 0; font-size: 16px; }
      .closeBtn {
        border: 0;
        background: transparent;
        color: ${config.panelTextColor};
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        padding: 2px 4px;
      }

      .message { display: none; margin-bottom: 10px; }
      .message.visible { display: block; }
      .message.success { color: #065f46; }
      .message.error { color: #b91c1c; }

      .form { display: grid; gap: 10px; }
      .field { display: grid; gap: 4px; }
      .label { font-size: 13px; }
      .input {
        width: 100%;
        padding: 8px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
      }
      .help { opacity: .7; }

      .submit {
        border: 0;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        background: ${config.buttonBackgroundColor};
        color: ${config.buttonTextColor};
      }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = `
      <button class="tab ${config.displaySide}" type="button" aria-expanded="false">${config.tabLabel}</button>
      <div class="overlayWrap" aria-hidden="true">
        <button class="overlay" type="button" aria-label="Close feedback form"></button>
        <div class="panel" role="dialog" aria-modal="true" aria-label="Feedback form">
          <div class="header">
            <h3 class="title">${config.formTitle}</h3>
            <button class="closeBtn" type="button" aria-label="Close feedback form">✕</button>
          </div>
          <div class="message"></div>
          <form class="form"></form>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrap);

    const tab = shadow.querySelector('.tab');
    const overlayWrap = shadow.querySelector('.overlayWrap');
    const overlay = shadow.querySelector('.overlay');
    const closeBtn = shadow.querySelector('.closeBtn');
    const form = shadow.querySelector('.form');
    const message = shadow.querySelector('.message');

    function setMessage(text, success) {
      message.classList.add('visible');
      message.classList.toggle('success', Boolean(success));
      message.classList.toggle('error', !success);
      message.textContent = text;
    }

    function createField(field) {
      const wrapEl = document.createElement('label');
      wrapEl.className = 'field';

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = field.label + (field.required ? ' *' : '');

      let input;
      if (field.type === 'multiline') {
        input = document.createElement('textarea');
        input.rows = 3;
      } else if (field.type === 'select') {
        input = document.createElement('select');
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'Select';
        input.appendChild(empty);

        field.options.forEach((opt) => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          input.appendChild(option);
        });
      } else {
        input = document.createElement('input');
        input.type = field.type === 'email' ? 'email' : 'text';
      }

      input.className = 'input';
      input.name = field.id;
      input.required = field.required;
      if (field.placeholder) input.placeholder = field.placeholder;

      wrapEl.appendChild(label);
      wrapEl.appendChild(input);

      if (field.helpText) {
        const help = document.createElement('small');
        help.className = 'help';
        help.textContent = field.helpText;
        wrapEl.appendChild(help);
      }

      return wrapEl;
    }

    config.fields.forEach((field) => {
      form.appendChild(createField(field));
    });

    const submit = document.createElement('button');
    submit.className = 'submit';
    submit.type = 'submit';
    submit.textContent = config.submitLabel;
    form.appendChild(submit);

    function setOpen(isOpen) {
      overlayWrap.classList.toggle('open', isOpen);
      overlayWrap.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    tab.addEventListener('click', () => {
      setOpen(!overlayWrap.classList.contains('open'));
    });

    overlay.addEventListener('click', () => setOpen(false));
    closeBtn.addEventListener('click', () => setOpen(false));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      message.className = 'message';

      const answers = {};
      let invalid = false;

      config.fields.forEach((field) => {
        const el = form.elements[field.id];
        const value = el && typeof el.value === 'string' ? el.value.trim() : '';
        if (field.required && !value) invalid = true;
        answers[field.id] = value;
      });

      if (invalid) {
        setMessage('Please fill in required fields.', false);
        return;
      }

      fetch(new URL('/api/feedback/submissions', config.apiUrl).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
        },
        body: JSON.stringify({
          apiKey: config.apiKey,
          pageUrl: window.location.href,
          answers,
        }),
      })
        .then((res) =>
          res.json().then((body) => {
            if (!res.ok) {
              throw new Error(
                body && body.error ? body.error : 'Unable to submit feedback.',
              );
            }
            return body;
          }),
        )
        .then((body) => {
          form.reset();
          const titleText = body.confirmationTitle || config.confirmationTitle;
          const messageText =
            body.confirmationMessage || config.confirmationMessage;
          setMessage(titleText + ': ' + messageText, true);
        })
        .catch((error) => {
          setMessage(error.message || 'Unable to submit feedback.', false);
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
