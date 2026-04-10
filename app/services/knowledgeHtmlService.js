function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote',
  'strong', 'em', 'u', 's', 'code', 'pre',
  'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div'
]);

function sanitizeAttributes(tag, rawAttrs) {
  const attrs = [];
  const attrMatches = String(rawAttrs || '').match(/([a-zA-Z0-9:-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g) || [];

  for (const match of attrMatches) {
    const split = match.split('=');
    const key = String(split[0] || '').trim().toLowerCase();
    const rawValue = match.slice(match.indexOf('=') + 1).trim();
    const unquotedValue = rawValue.replace(/^['"]|['"]$/g, '');
    const value = unquotedValue.trim();

    if (!key || key.startsWith('on')) continue;

    if (key === 'style') continue;

    if (tag === 'a' && key === 'href') {
      if (!/^https?:\/\//i.test(value)) continue;
      attrs.push(`href="${escapeHtml(value)}"`);
      continue;
    }

    if (tag === 'a' && (key === 'target' || key === 'rel')) {
      attrs.push(`${key}="${escapeHtml(value)}"`);
      continue;
    }

    if (tag === 'img' && key === 'src') {
      if (!/^(https?:\/\/|data:image\/).+/i.test(value) || /^javascript:/i.test(value)) continue;
      attrs.push(`src="${escapeHtml(value)}"`);
      continue;
    }

    if (tag === 'img' && ['alt', 'title', 'width', 'height'].includes(key)) {
      attrs.push(`${key}="${escapeHtml(value)}"`);
      continue;
    }
  }

  if (tag === 'a') {
    if (!attrs.some((a) => a.startsWith('rel='))) {
      attrs.push('rel="noopener noreferrer"');
    }
  }

  return attrs.length ? ` ${attrs.join(' ')}` : '';
}

export function sanitizeKnowledgeHtml(html) {
  const source = String(html || '')
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
    .replace(/<\s*object[^>]*>[\s\S]*?<\s*\/\s*object\s*>/gi, '');

  return source.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (full, tagName, attrs) => {
    const tag = String(tagName || '').toLowerCase();
    const isClosing = full.startsWith('</');

    if (!ALLOWED_TAGS.has(tag)) {
      return '';
    }

    if (isClosing) {
      return `</${tag}>`;
    }

    return `<${tag}${sanitizeAttributes(tag, attrs)}>`;
  });
}

export function extractImageUrlsFromHtml(html) {
  const content = String(html || '');
  const matches = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
  return matches
    .map((tag) => tag.match(/src=["']([^"']+)["']/i)?.[1])
    .filter(Boolean);
}

export function buildKnowledgeHtmlDocument({ title, bodyHtml }) {
  const cleanTitle = escapeHtml(String(title || '').trim());
  const cleanBodyHtml = String(bodyHtml || '').trim();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${cleanTitle}</title>
  </head>
  <body>
    <h1>${cleanTitle}</h1>
    ${cleanBodyHtml}
  </body>
</html>
`;
}

export function buildKnowledgeHtmlFilename({ title, workspaceId, knowledgeId }) {
  const safeTitle = String(title || 'knowledge-entry')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${workspaceId}-${knowledgeId}-${safeTitle || 'knowledge-entry'}.html`;
}
