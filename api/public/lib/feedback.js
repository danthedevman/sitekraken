(function (w, d) {
  if (w.__skFeedbackLoaded) return;
  w.__skFeedbackLoaded = true;

  var scriptEl = d.currentScript;
  var apiKey =
    (scriptEl &&
      (scriptEl.getAttribute('data-api-key') || scriptEl.getAttribute('api-key'))) ||
    '';

  var rawModuleConfig = scriptEl && scriptEl.getAttribute('data-module-config');
  var moduleConfig = {};

  if (rawModuleConfig) {
    try {
      moduleConfig = JSON.parse(rawModuleConfig);
    } catch (error) {
      console.warn('[SiteKraken feedback] Invalid module config', error);
    }
  }

  var apiUrl = String(moduleConfig.apiUrl || w.location.origin).replace(/\/+$/, '');
  var endpoint = apiUrl + '/api/feedback/submissions';

  var fields = Array.isArray(moduleConfig.fields) ? moduleConfig.fields : [];
  var tabLabel = String(moduleConfig.tabLabel || 'Feedback');
  var formTitle = String(moduleConfig.formTitle || 'Send feedback');
  var submitLabel = String(moduleConfig.submitLabel || 'Submit');
  var successTitle = String(moduleConfig.successTitle || 'Thanks for your feedback!');
  var successMessage = String(moduleConfig.successMessage || 'Your submission has been received.');
  var accent = String(moduleConfig.accent || '#111827');
  var textColor = String(moduleConfig.textColor || '#ffffff');
  var panelBg = String(moduleConfig.panelBg || '#ffffff');

  var host = d.createElement('div');
  host.style.position = 'fixed';
  host.style.right = '20px';
  host.style.bottom = '20px';
  host.style.zIndex = '2147483000';
  d.body.appendChild(host);

  var open = false;

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function renderField(field) {
    var key = escapeHtml(field.key || '');
    var label = escapeHtml(field.label || field.key || 'Field');
    var placeholder = escapeHtml(field.placeholder || '');
    var required = field.required ? 'required' : '';

    if (field.type === 'multiline') {
      return '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">' + label + '</label><textarea name="' + key + '" placeholder="' + placeholder + '" ' + required + ' rows="4" style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px"></textarea>';
    }

    if (field.type === 'select') {
      var options = Array.isArray(field.options) ? field.options : [];
      var optionHtml = ['<option value="">Select...</option>']
        .concat(options.map(function (opt) {
          var safe = escapeHtml(opt);
          return '<option value="' + safe + '">' + safe + '</option>';
        }))
        .join('');
      return '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">' + label + '</label><select name="' + key + '" ' + required + ' style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px">' + optionHtml + '</select>';
    }

    var inputType = field.type === 'email' ? 'email' : 'text';
    return '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">' + label + '</label><input type="' + inputType + '" name="' + key + '" placeholder="' + placeholder + '" ' + required + ' style="width:100%;padding:8px;border:1px solid #e5e7eb;border-radius:8px" />';
  }

  function render() {
    var formFields = fields.map(function (field) {
      return '<div style="margin-bottom:10px">' + renderField(field) + '</div>';
    }).join('');

    host.innerHTML =
      '<button id="sk-feedback-tab" type="button" style="border:0;background:' + accent + ';color:' + textColor + ';padding:10px 14px;border-radius:999px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.16)">' + escapeHtml(tabLabel) + '</button>' +
      '<div id="sk-feedback-panel" style="display:' + (open ? 'block' : 'none') + ';width:320px;max-width:calc(100vw - 24px);max-height:70vh;overflow:auto;margin-top:10px;background:' + panelBg + ';border:1px solid #e5e7eb;border-radius:12px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.18)">' +
        '<h3 style="font-size:16px;margin:0 0 10px">' + escapeHtml(formTitle) + '</h3>' +
        '<form id="sk-feedback-form">' +
          formFields +
          '<div id="sk-feedback-error" style="display:none;color:#b91c1c;font-size:12px;margin-bottom:8px"></div>' +
          '<button style="width:100%;border:0;background:' + accent + ';color:' + textColor + ';padding:9px;border-radius:8px;cursor:pointer">' + escapeHtml(submitLabel) + '</button>' +
        '</form>' +
        '<div id="sk-feedback-confirm" style="display:none">' +
          '<h4 id="sk-feedback-confirm-title" style="font-size:15px;margin:0 0 8px"></h4>' +
          '<p id="sk-feedback-confirm-message" style="margin:0;font-size:13px"></p>' +
        '</div>' +
      '</div>';

    var tab = d.getElementById('sk-feedback-tab');
    var panel = d.getElementById('sk-feedback-panel');
    var form = d.getElementById('sk-feedback-form');

    tab.addEventListener('click', function () {
      open = !open;
      panel.style.display = open ? 'block' : 'none';
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var formData = new FormData(form);
      var data = {};
      formData.forEach(function (value, key) {
        data[key] = String(value || '').trim();
      });

      var errorEl = d.getElementById('sk-feedback-error');
      errorEl.style.display = 'none';
      errorEl.textContent = '';

      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          data: data,
          pageUrl: w.location.href,
          pathname: w.location.pathname,
          title: d.title,
          host: w.location.hostname
        }),
        credentials: 'omit'
      })
        .then(function (res) {
          return res.json().then(function (body) { return { ok: res.ok, body: body }; });
        })
        .then(function (result) {
          if (!result.ok || !result.body || result.body.success === false) {
            throw new Error((result.body && result.body.error) || 'Unable to submit feedback.');
          }

          var confirmation = result.body.confirmation || {};
          d.getElementById('sk-feedback-confirm-title').textContent = confirmation.title || successTitle;
          d.getElementById('sk-feedback-confirm-message').textContent = confirmation.message || successMessage;
          form.style.display = 'none';
          d.getElementById('sk-feedback-confirm').style.display = 'block';
        })
        .catch(function (error) {
          errorEl.textContent = error && error.message ? error.message : 'Unable to submit feedback.';
          errorEl.style.display = 'block';
        });
    });
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
})(window, document);
