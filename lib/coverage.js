// Fix list: turns one AI Visibility run into three kinds of next steps.
//   pages       - pages to write for the buyer questions where the brand was not named
//   comparisons - "vs" and "alternatives" pages against the companies AI named instead
//   mentions    - third-party pages AI cited (communities, directories, list articles) worth getting onto
// Nothing here invents facts about the client: page plans carry [bracketed] gaps for the client to fill.

const COMMUNITY = ['reddit.com', 'linkedin.com', 'quora.com', 'spiceworks.com', 'facebook.com', 'youtube.com', 'x.com', 'twitter.com', 'medium.com'];
const DIRECTORY = ['clutch.co', 'g2.com', 'capterra.com', 'upcity.com', 'yelp.com', 'trustpilot.com', 'bbb.org', 'expertise.com',
  'goodfirms.co', 'cloudtango.net', 'gartner.com', 'trustradius.com', 'sourceforge.net', 'crn.com', 'channelfutures.com', 'channele2e.com'];
const LIST_RX = /\b(best|top|leading|alternatives?|vs|compared|comparison|reviews?)\b/i;

function hostOf(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
function onHost(host, list) { return list.some((d) => host === d || host.endsWith('.' + d)); }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
// House rule: no em or en dashes in any generated copy.
function noDashes(s) { return String(s == null ? '' : s).replace(/\s*[—–]\s*/g, ', '); }

function kindOf(host, title, url) {
  if (onHost(host, COMMUNITY)) return 'community';
  if (onHost(host, DIRECTORY)) return 'directory';
  let path = ''; try { path = new URL(url).pathname.replace(/[-_/]/g, ' '); } catch { /* not a URL */ }
  return LIST_RX.test(title || '') || LIST_RX.test(path) ? 'list' : null;
}

// Third-party pages cited for unbranded buyer questions, most-cited first.
function placesToEarnMentions(rows, profile) {
  const found = {};
  for (const r of rows) {
    if (r.branded) continue;
    for (const c of r.citations || []) {
      if (!/^https?:\/\//i.test(c.url)) continue;
      const host = hostOf(c.url);
      if (!host || host === profile.domain || host.endsWith('.' + profile.domain)) continue;
      const kind = kindOf(host, c.title, c.url);
      if (!kind) continue;
      // A company's LinkedIn profile is not a place to join a conversation; keep posts and articles only.
      if (onHost(host, ['linkedin.com']) && !/\/(posts|pulse)\//.test(c.url)) continue;
      const e = found[c.url] || (found[c.url] = { url: c.url, title: noDashes(c.title) || host, host, kind, questions: [] });
      if (!e.questions.includes(r.q)) e.questions.push(r.q);
    }
  }
  return Object.values(found).sort((a, b) => b.questions.length - a.questions.length).slice(0, 10)
    .map((e) => ({ ...e, questions: e.questions.slice(0, 3) }));
}

// Comparison pages against the companies AI named most. Vendors the client resells are not competitors.
function comparisonPages(summary, profile) {
  const skip = new Set([profile.brand, ...(profile.vendors || [])].map((s) => String(s).toLowerCase()));
  const rivals = (summary.shareOfVoice || []).map((x) => x.name).filter((n) => n && !skip.has(n.toLowerCase())).slice(0, 3);
  const pages = rivals.map((r) => ({ type: 'vs', title: `${profile.brand} vs ${r}`, slug: `/vs/${slugify(r)}`,
    why: `AI named ${r} in answers where it did not name you.` }));
  if (rivals[0]) pages.push({ type: 'alternative', title: `${rivals[0]} alternatives`, slug: `/${slugify(rivals[0])}-alternative`,
    why: `Buyers leaving ${rivals[0]} ask for alternatives. List 4 to 7 options and place yourself where you honestly rank.` });
  const persona = (profile.industries || [])[0];
  if (persona || profile.metro) {
    const title = `Best ${profile.category || 'provider'}${persona ? ' for ' + persona : ''}${profile.metro ? ' in ' + profile.metro : ''}`;
    pages.push({ type: 'best', title, slug: `/best/${slugify((persona || '') + ' ' + (profile.metro || ''))}`,
      why: 'A list page for one narrow buyer. Say how you picked, and name the top pick in the first sentence.' });
  }
  return pages;
}

// One model call groups the missed questions into at most 5 pages. `chatJson` is passed in by the caller.
async function planPages(rows, profile, chatJson) {
  // With several engines a question appears once per engine; it counts as missed if any engine missed it.
  const missed = rows.filter((r) => !r.branded && !(r.score && r.score.mentioned)).filter((r, i, a) => a.findIndex((x) => x.q === r.q) === i);
  if (!missed.length) return { pages: [], cost: 0 };
  const { data, cost } = await chatJson(
    'You plan website pages for a company. An AI answer engine currently answers the listed buyer questions without naming this company. ' +
    'Group the questions into at most 5 pages, one page per shared search intent. Reply with ONLY a JSON object: {"pages": [{' +
    '"title": string (under 60 characters, main phrase first, sentence case), "slug": string (lowercase, hyphenated, 2 to 5 words), ' +
    '"questions": string[] (the listed questions this page answers, copied exactly), ' +
    '"headings": string[] (3 to 5 H2 headings phrased as questions a buyer would type, sentence case)}]}. Never use em dashes or en dashes.',
    `Company: ${profile.brand} (${profile.category})\nServes: ${profile.audience}\nLocation: ${profile.metro || profile.region || 'not stated'}\n\n` +
    'Questions where the company was not named:\n' + missed.map((r) => '- ' + r.q).join('\n'));
  const pages = (data.pages || []).slice(0, 5).map((p) => ({
    title: noDashes(p.title), slug: '/' + slugify(p.slug || p.title),
    questions: (p.questions || []).map(noDashes),
    // Written here, not by the model, so the plan never states a claim about the client as fact.
    openingAnswer: `In the first 40 words, answer "${noDashes((p.questions || [])[0] || p.title)}" directly: name ${profile.brand}, ` +
      'say where you work and who you serve, and give [one proof point only you know, such as years in business or certifications].',
    headings: (p.headings || []).slice(0, 5).map(noDashes),
  }));
  return { pages, cost };
}

module.exports = { placesToEarnMentions, comparisonPages, planPages, noDashes };
