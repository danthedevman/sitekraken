export function buildWorkspaceTabs(workspaceId) {
  return [
    {
      key: 'chatbot',
      label: 'Chatbot',
      href: `/workspaces/${workspaceId}/chatbot`
    },
    {
      key: 'files',
      label: 'Files',
      href: `/workspaces/${workspaceId}/chatbot/files`
    },
    {
      key: 'knowledge',
      label: 'Knowledge',
      href: `/workspaces/${workspaceId}/chatbot/knowledge`
    },
    {
      key: 'analytics',
      label: 'Interactions',
      href: `/workspaces/${workspaceId}/analytics/dashboard`
    }
  ];
}
