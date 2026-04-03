export function defaultChatbotConfig(workspaceId) {
  const apiKey = crypto.randomUUID().replace(/-/g, '');

  return {
    workspaceId,
    apiKey,
    name: 'chat',
    enabled: true,
    scriptUrl: process.env.DEFAULT_CHAT_SCRIPT_URL || 'http://localhost:4001/public/lib/chat.js',
    module: false,
    allowedDomains: ['localhost', '127.0.0.1'],
    config: {
      title: 'Dan Bot',
      subtitle: 'How can I help?',
      initialMessage:
        "Hi, I'm Dan Bot, a custom chatbot built by Daniel Palmer to assist recruiters and potential employers. Ask me anything related to my professional experience, skills, and projects.",
      quickMessages: [
        'How can I contact you?',
        'Tell me about your recent projects',
        'What technologies do you specialize in?',
        'Can I see your resume?',
        'What is Dan Bot?'
      ],
      footerLinks: [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Disclaimer', href: '/disclaimer' }
      ]
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };
}
