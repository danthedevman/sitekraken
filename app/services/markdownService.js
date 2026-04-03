import fs from 'fs';
import path from 'path';

export function saveKnowledgeAsMarkdown({ title, body, workspaceId, knowledgeId }) {
  const safeTitle = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const dir = path.join(process.cwd(), 'uploads', 'knowledge');

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filepath = path.join(dir, `${workspaceId}-${knowledgeId}-${safeTitle}.md`);
  const content = `# ${title}

${body}
`;

  fs.writeFileSync(filepath, content, 'utf8');
  return filepath;
}
