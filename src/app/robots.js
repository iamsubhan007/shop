import { siteUrl } from '@/lib/seo';

// Public pages are open to every crawler, including the AI search and answer bots, so people who ask an assistant for
// "the best qeema naan in Lahore" can be pointed here. Private areas (admin, checkout, orders, sign-in, chat, the API) stay
// closed. Product pictures under /api/files/product/ are allowed so search engines can show them. To keep a particular AI
// company away, add its name to BLOCKED below.
const PRIVATE = ['/admin', '/api/', '/checkout', '/orders', '/auth', '/Chat', '/Chatbot-UI'];
const OPEN = ['/', '/api/files/product/'];
const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', // OpenAI
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai', // Anthropic
  'PerplexityBot', 'Perplexity-User', // Perplexity
  'Google-Extended', 'Applebot-Extended', 'Amazonbot', 'CCBot', 'Bingbot', 'DuckAssistBot', 'MistralAI-User',
];
const BLOCKED = [];

export default function robots() {
  const url = siteUrl();
  const rule = (userAgent) => ({ userAgent, allow: OPEN, disallow: PRIVATE });
  return {
    rules: [rule('*'), ...AI_BOTS.filter((b) => !BLOCKED.includes(b)).map(rule), ...BLOCKED.map((userAgent) => ({ userAgent, disallow: '/' }))],
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
