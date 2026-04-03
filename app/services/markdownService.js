export function buildKnowledgeMarkdown({ title, body }) {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();

  return `# ${cleanTitle}

${cleanBody}
`;
}

export function buildKnowledgeFilename({ title, workspaceId, knowledgeId }) {
  const safeTitle = String(title || 'knowledge-entry')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${workspaceId}-${knowledgeId}-${safeTitle || 'knowledge-entry'}.md`;
}