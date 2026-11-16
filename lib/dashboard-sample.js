// A made-up customer with four monthly runs, for the sample dashboard at /dashboard/sample.
// Rows are scored by the real summarize(), so the sample has the same shape as a saved run.
const { summarize } = require('./visibility');

const profile = { domain: 'summitridgeit.example', brand: 'Summit Ridge IT', aliases: [], metro: 'Denver', partnerType: 'msp' };
const RIVALS = ['Bluepeak Managed', 'Harbor Tech Group', 'Ironwood IT', 'Clearline Networks', 'Front Range Systems'];
const ENGINES = [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude'], ['grok', 'Grok']];
const QUESTIONS = [
  'Who are the best managed IT providers in Denver for a 50 person company?',
  'Which Denver MSPs handle HIPAA compliance for medical offices?',
  'Who should I hire for Microsoft 365 migration in Denver?',
  'What does managed IT cost per user in Colorado?',
  'Which IT companies in Denver offer 24/7 help desk support?',
  'Who are the top cybersecurity providers for small businesses in Denver?',
  'Which Denver IT firms work with law offices?',
  'Who offers co-managed IT for an internal IT team in Denver?',
];
const BRANDED = ['Is Summit Ridge IT a good managed IT provider?', 'What do customers say about Summit Ridge IT?'];
// First month (0 to 3) each engine named the brand for each question; 9 means not yet.
const FIRST = { chatgpt: [1, 0, 2, 9, 3, 9, 1, 9], gemini: [2, 1, 9, 9, 3, 9, 0, 9], claude: [9, 2, 3, 9, 9, 9, 2, 9], grok: [3, 9, 9, 9, 9, 9, 1, 9] };
const BRANDED_FIRST = { chatgpt: 0, gemini: 0, claude: 1, grok: 2 };

function monthRows(m) {
  const rows = [];
  ENGINES.forEach(([key], ei) => {
    QUESTIONS.forEach((q, qi) => {
      // One decline, so the dashboard has something to show in that column.
      const mentioned = m >= FIRST[key][qi] && !(key === 'gemini' && qi === 6 && m === 3);
      const others = [0, 1, 2].map((k) => RIVALS[(qi + ei + k) % RIVALS.length]);
      rows.push({ engine: key, q, intent: 'comparison', branded: false, score: { mentioned, position: mentioned ? 2 : null,
        cited: mentioned && (qi + m) % 2 === 0, sentiment: mentioned ? (m >= 1 ? 'positive' : 'neutral') : 'absent',
        brands: mentioned ? [others[0], profile.brand, others[1]] : others, domains: mentioned && (qi + m) % 2 === 0 ? [profile.domain, 'clutch.co'] : ['clutch.co', 'reddit.com'] } });
    });
    BRANDED.forEach((q) => {
      const mentioned = m >= BRANDED_FIRST[key];
      rows.push({ engine: key, q, intent: 'research', branded: true, score: { mentioned, position: mentioned ? 1 : null, cited: mentioned,
        sentiment: mentioned ? 'positive' : 'absent', brands: mentioned ? [profile.brand] : [], domains: mentioned ? [profile.domain] : [] } });
    });
  });
  return rows;
}

const fixList = {
  pages: [
    { title: 'Managed IT Pricing in Denver: What It Costs Per User', slug: '/managed-it-pricing-denver',
      questions: ['What does managed IT cost per user in Colorado?', 'Who are the best managed IT providers in Denver for a 50 person company?', 'Who offers co-managed IT for an internal IT team in Denver?'],
      openingAnswer: 'Managed IT in Denver costs [your range] per user per month. Summit Ridge IT includes [what is included] at that price for companies with 20 to 200 staff.',
      headings: ['What is included per user', 'What changes the price', 'Co-managed IT pricing', 'How to compare quotes'] },
    { title: 'Cybersecurity for Small Businesses in Denver', slug: '/cybersecurity-small-business-denver',
      questions: ['Who are the top cybersecurity providers for small businesses in Denver?', 'Which IT companies in Denver offer 24/7 help desk support?'],
      openingAnswer: 'Summit Ridge IT protects Denver small businesses with [your security stack], monitored around the clock by [team size] local engineers.',
      headings: ['What we protect', 'How fast we respond', 'What it costs', 'Who it is for'] },
    { title: 'Co-Managed IT for Internal IT Teams', slug: '/co-managed-it-denver',
      questions: ['Who offers co-managed IT for an internal IT team in Denver?'],
      openingAnswer: 'Summit Ridge IT works beside your internal IT team in Denver, taking [which tasks] so your staff can focus on [which projects].',
      headings: ['What we take off your plate', 'What stays with your team', 'How handoffs work'] },
  ],
  comparisons: [
    { title: 'Summit Ridge IT vs Bluepeak Managed', slug: '/compare/summit-ridge-it-vs-bluepeak-managed', why: 'AI named Bluepeak Managed more than any other company this month' },
    { title: 'Summit Ridge IT vs Harbor Tech Group', slug: '/compare/summit-ridge-it-vs-harbor-tech-group', why: 'AI named Harbor Tech Group in the answers where you were left out' },
  ],
  mentions: [
    { kind: 'list', url: 'https://example.com/top-msps-denver', title: 'Top Managed IT Providers in Denver', host: 'example.com',
      questions: ['Who are the best managed IT providers in Denver for a 50 person company?', 'Which IT companies in Denver offer 24/7 help desk support?', 'Who are the top cybersecurity providers for small businesses in Denver?'] },
    { kind: 'community', url: 'https://example.com/r/denver/it-recommendations', title: 'Looking for an IT company for our office in Denver', host: 'example.com',
      questions: ['Which Denver IT firms work with law offices?'] },
  ],
};

function sampleDashboard() {
  const runs = ['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15'].map((date, m) => {
    const rows = monthRows(m);
    const summary = summarize(rows, profile);
    summary.byEngine = ENGINES.map(([key, label]) => {
      const s = summarize(rows.filter((r) => r.engine === key), profile);
      return { engine: key, label, answers: s.answers, unbrandedVisibility: s.unbrandedVisibility, brandedVisibility: s.brandedVisibility, citationRate: s.citationRate };
    });
    return { created_at: date + 'T15:00:00Z', result: { profile, summary, rows, fixList } };
  });
  const state = {
    '/cybersecurity-small-business-denver': { status: 'review' },
    '/co-managed-it-denver': { status: 'done', note: 'Went live in October. We are watching its questions in the next run.' },
  };
  return { domain: profile.domain, runs, state };
}

module.exports = { sampleDashboard };
