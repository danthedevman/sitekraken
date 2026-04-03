export default async function embedRoutes(fastify) {
  fastify.get("/config", async function handler(request, reply) {
    return reply.code(200).send({
      success: true,
      modules: [
        {
          name: "chat",
          enabled: true,
          scriptUrl: "http://localhost:4001/public/lib/chat.js",
          module: false,
          config: {
            title: "Dan Bot",
            subtitle: "How can I help?",
            initialMessage:
              "Hi, I'm Dan Bot, a custom chatbot built by Daniel Palmer to assist recruiters and potential employers. Ask me anything related to my professional experience, skills, and projects.",
            quickMessages: [
              "How can I contact you?",
              "Tell me about your recent projects",
              "What technologies do you specialize in?",
              "Can I see your resume?",
              "What is Dan Bot?"
            ],
            footerLinks: [
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Disclaimer", href: "/disclaimer" }
            ],
          },
        },
        {
          name: "analytics",
          enabled: false,
          scriptUrl: "http://localhost:4001/analytics.js",
          module: true,
          config: {},
        },
      ],
    });
  });
}
