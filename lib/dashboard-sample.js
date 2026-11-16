// A made-up customer with four monthly runs, for the sample dashboard at /dashboard/sample.
// 40 questions (35 buyer questions in 7 topics, 5 asked by name) across 4 engines, the size of a
// paid run. Rows are scored by the real summarize(), so the sample has the shape of a saved run.
const { summarize } = require('./visibility');

const profile = { domain: 'summitridgeit.example', brand: 'Summit Ridge IT', aliases: [], metro: 'Denver', partnerType: 'msp' };
const RIVALS = ['Bluepeak Managed', 'Harbor Tech Group', 'Ironwood IT', 'Clearline Networks', 'Front Range Systems'];
const ENGINES = [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['claude', 'Claude'], ['grok', 'Grok']];
// [topic, first month the strongest engine names the brand, questions]
const TOPICS = [
  ['Finding a provider', -1, [
    'Who are the best managed IT service providers in Denver?',
    'Our office keeps having IT problems and we have no IT staff. Who can help in Denver?',
    'Top-rated IT support companies for small businesses in Denver',
    'We are outgrowing our one-person IT department. Who do companies in Denver bring in?',
    'Who are the best managed IT providers in Denver for a 50 person company?']],
  ['Healthcare', 0, [
    'Which Denver MSPs handle HIPAA compliance for medical offices?',
    'I need to outsource IT support for my healthcare business in Denver. Who should I call?',
    'Which Denver IT providers specialize in healthcare?',
    'What are the best alternatives to hiring in-house IT for a healthcare company in Denver?',
    'Which managed IT providers serve healthcare companies in Colorado?']],
  ['Microsoft 365', 1, [
    'Who should I hire for Microsoft 365 migration in Denver?',
    'Which IT companies in Denver offer Microsoft 365 support?',
    'Who are the leading managed service providers for Microsoft 365?',
    'Which company should I hire for Microsoft 365 security in Denver?',
    'Who can move our email to Microsoft 365 in Denver?']],
  ['Help desk', 2, [
    'Which IT companies in Denver offer 24/7 help desk support?',
    'Which company should I hire for help desk outsourcing in Denver?',
    'Who are the leading managed service providers for help desk support?',
    'Which Denver IT firms answer support calls after hours?',
    'Who offers remote help desk for a small office in Denver?']],
  ['Legal', 2, [
    'Which Denver IT firms work with law offices?',
    'I need to outsource IT support for my legal business in Denver. Who should I call?',
    'Which Denver IT providers specialize in legal?',
    'What are the best alternatives to hiring in-house IT for a legal company in Denver?',
    'Which managed IT providers serve legal companies in Colorado?']],
  ['Cybersecurity', 4, [
    'Who are the top cybersecurity providers for small businesses in Denver?',
    'Recommend a managed service provider in Denver with strong cybersecurity.',
    'My business was hit by a cyberattack. Which IT companies in Denver can help us recover?',
    'Which IT companies in Denver offer cybersecurity?',
    'Which company should I hire for cybersecurity in Denver?']],
  ['Pricing and co-managed IT', 9, [
    'What does managed IT cost per user in Colorado?',
    'Who offers co-managed IT for an internal IT team in Denver?',
    'Which Denver MSPs offer flat monthly pricing?',
    'Which company should I hire for co-managed IT in Denver?',
    'Who are the leading managed service providers for co-managed IT?']],
];
const BRANDED = ['Is Summit Ridge IT a good managed IT service provider?', 'What do customers say about Summit Ridge IT?',
  'How much does Summit Ridge IT cost and how do I get started?', 'Summit Ridge IT vs Bluepeak Managed: which is better?', 'Is Summit Ridge IT good for healthcare offices?'];
const BRANDED_FIRST = { chatgpt: 0, gemini: 0, claude: 1, grok: 2 };

function monthRows(m) {
  const rows = [];
  ENGINES.forEach(([key], ei) => {
    TOPICS.forEach(([topic, start, questions], ti) => {
      questions.forEach((q, qi) => {
        // Each engine catches on a month later than the one before it. One loss, so the dashboard shows one.
        const mentioned = m >= start + ei + (qi % 3) && !(key === 'gemini' && ti === 1 && qi === 0 && m === 3);
        const cited = mentioned && (qi + m) % 2 === 0;
        const others = [0, 1, 2].map((k) => RIVALS[(qi + ti + ei + k) % RIVALS.length]);
        rows.push({ engine: key, q, intent: 'comparison', topic, branded: false, score: { mentioned, position: mentioned ? 2 : null, cited,
          sentiment: mentioned ? (m >= 1 ? 'positive' : 'neutral') : 'absent',
          brands: mentioned ? [others[0], profile.brand, others[1]] : others, domains: cited ? [profile.domain, 'clutch.co'] : ['clutch.co', 'reddit.com'] } });
      });
    });
    BRANDED.forEach((q) => {
      const mentioned = m >= BRANDED_FIRST[key];
      rows.push({ engine: key, q, intent: 'research', branded: true, score: { mentioned, position: mentioned ? 1 : null, cited: mentioned,
        sentiment: mentioned ? 'positive' : 'absent', brands: mentioned ? [profile.brand] : [], domains: mentioned ? [profile.domain] : [] } });
    });
  });
  return rows;
}

const Q = (ti, ...idx) => idx.map((i) => TOPICS[ti][2][i]);
const fixList = {
  pages: [
    { title: 'Managed IT Pricing in Denver: What It Costs Per User', slug: '/managed-it-pricing-denver', questions: Q(6, 0, 2),
      openingAnswer: 'Managed IT in Denver costs [your range] per user per month. Summit Ridge IT includes [what is included] at that price for companies with 20 to 200 staff.',
      headings: ['What is included per user', 'What changes the price', 'Flat monthly pricing', 'How to compare quotes'] },
    { title: 'Cybersecurity for Small Businesses in Denver', slug: '/cybersecurity-small-business-denver', questions: Q(5, 0, 1, 3, 4),
      openingAnswer: 'Summit Ridge IT protects Denver small businesses with [your security stack], monitored around the clock by [team size] local engineers.',
      headings: ['What we protect', 'How fast we respond', 'What it costs', 'Who it is for'] },
    { title: 'Co-Managed IT for Internal IT Teams', slug: '/co-managed-it-denver', questions: Q(6, 1, 3, 4),
      openingAnswer: 'Summit Ridge IT works beside your internal IT team in Denver, taking [which tasks] so your staff can focus on [which projects].',
      headings: ['What we take off your plate', 'What stays with your team', 'How handoffs work'] },
    { title: 'IT Support for Denver Law Firms', slug: '/it-support-law-firms-denver', questions: Q(4, 1, 2, 3),
      openingAnswer: 'Summit Ridge IT supports [number] Denver law firms with [what you do for them], including [legal software you support].',
      headings: ['Software we support', 'Keeping client files confidential', 'Response times', 'What it costs'] },
  ],
  comparisons: [
    { title: 'Summit Ridge IT vs Bluepeak Managed', slug: '/compare/summit-ridge-it-vs-bluepeak-managed', why: 'AI named Bluepeak Managed more than any other company this month' },
    { title: 'Summit Ridge IT vs Harbor Tech Group', slug: '/compare/summit-ridge-it-vs-harbor-tech-group', why: 'AI named Harbor Tech Group in the answers where you were left out' },
  ],
  mentions: [
    { kind: 'list', url: 'https://example.com/top-msps-denver', title: 'Top Managed IT Providers in Denver', host: 'example.com', questions: Q(3, 0, 2, 3) },
    { kind: 'community', url: 'https://example.com/r/denver/it-recommendations', title: 'Looking for an IT company for our office in Denver', host: 'example.com', questions: Q(3, 4) },
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
