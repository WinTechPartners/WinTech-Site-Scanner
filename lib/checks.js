const fetch = require('node-fetch');
const { URL } = require('url');

// ============================================================
// SHARED CHECKS
// Used by the free scan (scanner.js) and the monthly tracker. Findings created here also
// carry a `benefit`: what the site owner gains once the problem is fixed, in plain English.
// ============================================================

const UA = 'WinTech-Site-Scanner/1.0';

// Bots that collect pages to TRAIN future AI models, versus bots that fetch a page to ANSWER
// a question live (ChatGPT search, Perplexity, Claude search). Blocking the first is a policy
// choice; blocking the second removes the site from AI answers today.
const AI_TRAINING_BOTS = [
  'GPTBot', 'ClaudeBot', 'anthropic-ai', 'Claude-Web', 'Google-Extended', 'CCBot', 'Bytespider',
  'Amazonbot', 'Applebot-Extended', 'meta-externalagent', 'cohere-ai', 'Diffbot',
];
const AI_SEARCH_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'YouBot'];

// Status codes that mean "the server refused a robot", not "the page is gone". Never broken.
const UNKNOWN_STATUSES = [401, 403, 429, 999];

function bareHost(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function sameSite(a, b) {
  const ha = bareHost(a);
  return !!ha && ha === bareHost(b);
}

// HEAD first, then GET when HEAD fails (many servers reject HEAD but serve GET fine).
// status 0 = network error or timeout, which is reported as unknown, never as broken.
async function fetchStatus(u, timeout = 8000) {
  const opt = (method) => ({ method, timeout, redirect: 'follow', headers: { 'User-Agent': UA } });
  try {
    let resp = await fetch(u, opt('HEAD'));
    if (resp.status >= 400) resp = await fetch(u, opt('GET'));
    return { status: resp.status, finalUrl: resp.url || u };
  } catch {
    return { status: 0, finalUrl: u };
  }
}

function isBroken(status) {
  return status >= 400 && !UNKNOWN_STATUSES.includes(status);
}

// Every URL the page or site DECLARES about itself: canonical, hreflang alternates, social-share
// tags, the sitemap(s) named in robots.txt, and a sample of the sitemap's own <loc> entries.
// A tag that exists but points at a dead or foreign address is worse than no tag, so each one is
// loaded rather than just detected.
function collectDeclaredUrls({ html, robots, sitemap, pageUrl }) {
  const seo = (html && html.seo) || {};
  const i18n = (html && html.i18n) || {};
  const og = seo.openGraph || {};
  const raw = [];
  const push = (kind, href) => { if (href) raw.push({ kind, href }); };
  push('canonical', seo.canonical && seo.canonical.value);
  push('og:url', og.url);
  push('og:image', og.image);
  ((robots && robots.sitemaps) || []).slice(0, 3).forEach((h) => push('robots-sitemap', h));
  (i18n.hreflangUrls || []).slice(0, 5).forEach((h) => push('hreflang', h));
  ((sitemap && sitemap.sampleUrls) || []).slice(0, 5).forEach((h) => push('sitemap-url', h));

  const byUrl = new Map();
  for (const { kind, href } of raw) {
    let abs;
    try { abs = new URL(href, pageUrl).href; } catch { continue; }
    if (!/^https?:/i.test(abs)) continue;
    if (!byUrl.has(abs)) byUrl.set(abs, { url: abs, kinds: [] });
    const entry = byUrl.get(abs);
    if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
  }
  return [...byUrl.values()];
}

async function checkDeclaredUrls(list, pageUrl) {
  if (!list || !list.length) return { checked: false, items: [] };
  const items = await Promise.all(list.map(async (d) => {
    const r = await fetchStatus(d.url);
    return { ...d, status: r.status, finalUrl: r.finalUrl, offSite: !sameSite(d.url, pageUrl), broken: isBroken(r.status) };
  }));
  return { checked: true, items };
}

// Outbound links: only 404/410 count, because other sites block scanners and have bad minutes.
async function checkExternalLinks(urls) {
  const list = (urls || []).slice(0, 5);
  if (!list.length) return { checked: false, total: 0, broken: [] };
  const items = await Promise.all(list.map(async (u) => ({ url: u, ...(await fetchStatus(u, 6000)) })));
  return { checked: true, total: list.length, broken: items.filter((x) => x.status === 404 || x.status === 410).map((x) => ({ url: x.url, status: x.status })) };
}

function declaredProblems(declaredCheck, kind) {
  return ((declaredCheck && declaredCheck.items) || []).filter((i) => i.kinds.includes(kind) && (i.broken || i.offSite));
}

const short = (i) => `${i.url}${i.broken ? ` (returns ${i.status})` : ''}`;

function declaredUrlFindings(declaredCheck) {
  const findings = [];
  if (!declaredCheck || !declaredCheck.checked) return findings;

  const canon = declaredProblems(declaredCheck, 'canonical')[0];
  if (canon && canon.broken) {
    findings.push({ cat: 'SEO', issue: 'Canonical tag points to a broken page', impact: 'Critical', desc: `The canonical tag tells Google the official address of this page is ${short(canon)}. That address does not load, so Google may drop the page or index the wrong one.`, benefit: 'Google indexes your real address, so the page can rank and keep the links pointing at it.' });
  } else if (canon && canon.offSite) {
    findings.push({ cat: 'SEO', issue: 'Canonical tag points to a different website', impact: 'High', desc: `The canonical tag names ${canon.url} as the official address, which is a different website. Google is being told to credit that site instead of this one.`, benefit: 'Search ranking credit stays with your own domain.' });
  }

  const sm = declaredProblems(declaredCheck, 'robots-sitemap');
  if (sm.length) findings.push({ cat: 'SEO', issue: 'robots.txt points to a sitemap that is broken or on another website', impact: 'High', desc: `robots.txt tells search engines to read ${sm.map(short).join(', ')}. ${sm.some((i) => i.broken) ? 'It does not load.' : 'It is on a different website.'}`, benefit: 'Search engines find every page you publish, faster.' });

  const locs = declaredProblems(declaredCheck, 'sitemap-url');
  const sampled = declaredCheck.items.filter((i) => i.kinds.includes('sitemap-url')).length;
  if (locs.length) findings.push({ cat: 'SEO', issue: `Sitemap lists pages that are broken or on another website (${locs.length} of ${sampled} sampled)`, impact: 'High', desc: `Examples: ${locs.slice(0, 2).map(short).join(', ')}. Search engines that follow the sitemap reach dead or foreign pages instead of yours.`, benefit: 'Every page in your sitemap can be crawled and ranked.' });

  const hl = declaredProblems(declaredCheck, 'hreflang').filter((i) => i.broken);
  if (hl.length) findings.push({ cat: 'Localization', issue: `${hl.length} hreflang link${hl.length === 1 ? ' points' : 's point'} to broken pages`, impact: 'High', desc: `Language alternates such as ${short(hl[0])} do not load, so search engines cannot route visitors to the right version.`, benefit: 'Visitors in each language or region land on the right page.' });

  const social = [...declaredProblems(declaredCheck, 'og:url'), ...declaredProblems(declaredCheck, 'og:image')].filter((i) => i.broken);
  if (social.length) findings.push({ cat: 'SEO', issue: 'Social share tags point to a broken address', impact: 'Medium', desc: `Open Graph tags reference ${short(social[0])}. Shares on LinkedIn and other platforms show a broken preview.`, benefit: 'Links shared on LinkedIn and social media show a proper preview.' });

  return findings;
}

function externalLinkFindings(externalCheck) {
  const ec = externalCheck || {};
  if (!ec.checked || !ec.broken || !ec.broken.length) return [];
  return [{ cat: 'Best Practices', issue: `${ec.broken.length} broken outbound link${ec.broken.length === 1 ? '' : 's'} found in a ${ec.total}-link sample`, impact: 'Medium', desc: `Links to other websites return "page not found" (e.g. ${ec.broken[0].url}). Visitors hit dead ends and search engines read it as neglect.`, benefit: 'Visitors and search engines see a maintained, trustworthy site.' }];
}

function aiCrawlerFindings(ai) {
  const findings = [];
  if (!ai || !ai.checked) return findings;
  if (ai.blocksAllCrawlers) {
    findings.push({ cat: 'AEO', issue: 'robots.txt blocks all crawlers (Disallow: /)', impact: 'Critical', desc: 'robots.txt sets "User-agent: * / Disallow: /", asking every search and AI crawler to ignore the whole site. Unless this is a staging site, it is suppressing all organic and AI discoverability.', benefit: 'Search engines and AI assistants can find the site at all.' });
    return findings;
  }
  const cf = ai.cloudflareManaged ? ' These rules come from the Cloudflare managed robots.txt setting, so they are changed in the Cloudflare dashboard, not in the website files.' : '';
  if (ai.blockedSearch && ai.blockedSearch.length) {
    findings.push({ cat: 'AEO', issue: `AI search bots are blocked: ${ai.blockedSearch.join(', ')}`, impact: 'High', desc: `robots.txt stops the bots that ChatGPT search, Perplexity and Claude use to read a page while answering a question, so the site cannot be cited in those answers.${cf}`, benefit: 'ChatGPT, Perplexity and Claude can read and cite your pages when buyers ask them questions.' });
  }
  if (ai.blockedTraining && ai.blockedTraining.length) {
    findings.push({ cat: 'AEO', issue: `AI training bots are blocked: ${ai.blockedTraining.join(', ')}`, impact: 'Low', desc: `robots.txt stops these bots from collecting pages to train future AI models. Live AI answers are not affected, but new models will learn less about the business. Many publishers block training on purpose; for a site that wants to be recommended, allowing it is usually better.${cf}`, benefit: 'Future AI models learn who you are and what you sell.' });
  }
  if (ai.conflicting && ai.conflicting.length) {
    findings.push({ cat: 'AEO', issue: `robots.txt gives contradictory rules to: ${ai.conflicting.join(', ')}`, impact: 'Medium', desc: `The file both allows and blocks the same AI bots in different sections, so each bot decides for itself which rule wins.${cf}`, benefit: 'Every AI bot gets one clear answer about what it may read.' });
  }
  return findings;
}

module.exports = {
  AI_TRAINING_BOTS, AI_SEARCH_BOTS,
  sameSite, fetchStatus, isBroken,
  collectDeclaredUrls, checkDeclaredUrls, checkExternalLinks, declaredProblems,
  declaredUrlFindings, externalLinkFindings, aiCrawlerFindings,
};
