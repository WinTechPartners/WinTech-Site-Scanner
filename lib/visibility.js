// AI Visibility: when buyers ask an AI answer engine category questions, does it mention
// and cite this brand? Flow: profile the brand from its homepage, generate unbranded buyer
// questions, ask an engine with live web search, then score mentions, competitors and sources.
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { channelQuestions } = require('./channel');
const { placesToEarnMentions, comparisonPages, planPages } = require('./coverage');

const API = 'https://openrouter.ai/api/v1/chat/completions';
const ENGINE_MODEL = process.env.VISIBILITY_MODEL || 'openai/gpt-4o-mini';
const HELPER_MODEL = process.env.VISIBILITY_HELPER_MODEL || 'openai/gpt-4o-mini';

async function chat(body, timeout) {
  const resp = await fetch(API, {
    method: 'POST', timeout: timeout || 60000,
    headers: { 'Authorization': 'Bearer ' + (process.env.OPENROUTER_API_KEY || ''), 'Content-Type': 'application/json',
               'HTTP-Referer': 'https://wintechpartners.com', 'X-Title': 'WinTech AI Visibility' },
    body: JSON.stringify(body),
  });
  const j = await resp.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  const msg = j.choices[0].message;
  // With a provider key attached at OpenRouter, `cost` is 0 and the real charge is the upstream cost.
  const u = j.usage || {};
  return { text: msg.content || '', annotations: msg.annotations || [], cost: u.cost || (u.cost_details || {}).upstream_inference_cost || 0 };
}

async function chatJson(system, user) {
  const r = await chat({ model: HELPER_MODEL, temperature: 0.2, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
  let data; try { data = JSON.parse(r.text); } catch { const m = r.text.match(/\{[\s\S]*\}/); data = m ? JSON.parse(m[0]) : {}; }
  return { data, cost: r.cost };
}

async function fetchHomepage(url) {
  const u = url.startsWith('http') ? url : 'https://' + url;
  const resp = await fetch(u, { timeout: 15000, redirect: 'follow', headers: { 'User-Agent': 'WinTech-AI-Visibility/1.0' } });
  const $ = cheerio.load(await resp.text());
  $('script,style,noscript,svg').remove();
  return {
    domain: new URL(u).hostname.toLowerCase().replace(/^www\./, ''),
    title: $('title').first().text().trim(),
    desc: $('meta[name="description"]').attr('content') || '',
    text: $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000),
  };
}

async function profileBrand(page) {
  const { data, cost } = await chatJson(
    'You read a company homepage and describe the business. Reply with ONLY a JSON object: ' +
    '{"brand": string (the company name as buyers say it), "aliases": string[] (other spellings or short names, may be empty), ' +
    '"category": string (what they sell, in 3-8 words), "audience": string (who buys from them, 1 sentence), ' +
    '"region": string (the country or region they serve, or "" if the page does not say), ' +
    '"offerings": string[] (up to 8 specific product lines or vendor brands they sell, as named on the page), ' +
    '"partnerType": "msp"|"mssp"|"si"|"var"|"distributor"|"vendor"|"other" (tech channel role: msp = managed IT services, ' +
    'mssp = managed security services, si = systems integrator or IT consultancy, var = reseller or solutions provider that ' +
    'sources products, distributor = sells to resellers and MSPs, vendor = makes its own product; "other" if not a tech company), ' +
    '"metro": string (the city, metro or area they are based in or serve; use an office or staff location if that is all ' +
    'the page gives, or "" if the page names no place), ' +
    '"solutionAreas": string[] (up to 6 categories of technology a customer gets from them, lowercase, in plain buyer words, ' +
    'e.g. "network security", "cloud migration", "endpoint security"; never support perks such as training, deal registration or marketing help), ' +
    '"vendors": string[] (up to 6 vendor brands they carry or partner with, only if named on the page), ' +
    '"industries": string[] (up to 4 customer industries they name, e.g. "healthcare"; empty if none named), ' +
    '"competitors": string[] (up to 8 real direct competitors)}.',
    `Domain: ${page.domain}\nTitle: ${page.title}\nMeta description: ${page.desc}\n\nPage text:\n${page.text}`);
  return { profile: { domain: page.domain, brand: data.brand || page.domain, aliases: data.aliases || [],
    category: data.category || '', audience: data.audience || '', region: data.region || '',
    offerings: data.offerings || [], partnerType: data.partnerType || 'other', metro: data.metro || '',
    services: data.solutionAreas || [], vendors: data.vendors || [], industries: data.industries || [],
    competitors: data.competitors || [] }, cost };
}

async function generateQuestions(profile, n) {
  // Tech channel companies get the fixed question pack; anything else falls back to model-written questions.
  const fixed = channelQuestions(profile, n);
  if (fixed.length) return { questions: fixed, cost: 0 };
  // About 13% branded, the rest unbranded; the two are reported separately.
  const brandedN = Math.max(1, Math.round(n * 0.13));
  const { data, cost } = await chatJson(
    'You write the questions a real buyer would type into ChatGPT when looking for a provider. ' +
    'Every question must be one whose natural answer names companies in the provider\'s own category (the same kind of business ' +
    'as the provider), so the provider itself could appear in the answer. Examples: for a software product, ask which tools ' +
    'to use; for a local service, ask who to hire in the area; for a reseller or distributor, ask who to buy through, ' +
    'not which product is best. Never ask how something works in general. ' +
    'Vary wording and length the way real people do; no two questions may start with the same three words. ' +
    'Spread the questions across the listed offerings (naming the product or vendor the buyer wants to buy is fine), ' +
    'and state the region in about half of them. Mix three intents evenly: "research" (learning the category), ' +
    '"comparison" (who is best, top providers, alternatives), "purchase" (ready to choose a provider). ' +
    'Unbranded questions must never name the provider or any competing provider. Branded questions must name the provider exactly as given. ' +
    'Reply with ONLY a JSON object: {"questions": [{"q": string, "intent": "research"|"comparison"|"purchase"}]}.',
    `Provider: ${profile.brand}\nCategory: ${profile.category}\nBuyer: ${profile.audience}\nRegion: ${profile.region || 'not stated'}\n` +
    `Offerings: ${(profile.offerings || []).join(', ') || 'not stated'}\n` +
    `Write exactly ${n - brandedN} unbranded questions and ${brandedN} branded questions.`);
  const rx = brandRegex(profile);
  const questions = (data.questions || []).filter((x) => x && x.q).slice(0, n)
    .map((x) => ({ q: x.q, intent: x.intent, branded: rx.test(x.q) }));
  return { questions, cost };
}

// The engine gets the bare question with web search on, the way a buyer would ask it.
async function askEngine(question, model) {
  const r = await chat({ model: model || ENGINE_MODEL, messages: [{ role: 'user', content: question }],
    plugins: [{ id: 'web', max_results: 5 }] }, 90000);
  const citations = r.annotations.filter((a) => a.type === 'url_citation' && a.url_citation && a.url_citation.url)
    .map((a) => ({ url: a.url_citation.url, title: a.url_citation.title || '' }));
  return { text: r.text, citations, cost: r.cost };
}

// The real consumer product through DataForSEO's scraper: what a buyer sees in ChatGPT or Gemini.
// ChatGPT returns the brands it tagged itself, so those answers need no separate extraction call.
function hasScraper() { return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD); }

async function askScraper(platform, question) {
  const auth = Buffer.from(process.env.DATAFORSEO_LOGIN + ':' + process.env.DATAFORSEO_PASSWORD).toString('base64');
  const task0 = { keyword: question, location_code: 2840, language_code: 'en' };
  if (platform === 'chat_gpt') task0.force_web_search = true;
  const resp = await fetch('https://api.dataforseo.com/v3/ai_optimization/' + platform + '/llm_scraper/live/advanced', {
    method: 'POST', timeout: 150000,
    headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json' },
    body: JSON.stringify([task0]),
  });
  const j = await resp.json();
  const task = (j.tasks || [])[0] || {};
  const res = (task.result || [])[0];
  if (!res) throw new Error(platform + ' scraper: ' + (task.status_message || j.status_message || 'no result'));
  const seen = new Set();
  const citations = (res.sources || []).filter((s) => s.url && !seen.has(s.url) && seen.add(s.url))
    .map((s) => ({ url: s.url, title: s.title || '' }));
  // `markdown` is the name as written in the answer; `title` is sometimes a description of the company instead.
  const brands = [...new Set((res.brand_entities || []).map((b) => String(b.markdown || b.title || '').replace(/[*_`]/g, '').trim()).filter(Boolean))];
  return { text: res.markdown || '', citations, brands, model: res.model || '', cost: j.cost || 0 };
}

// Claude and Grok have no scraper, so they are asked through their API with their own web search on.
async function askNative(model, question) {
  const r = await chat({ model, messages: [{ role: 'user', content: question }], plugins: [{ id: 'web', engine: 'native' }] }, 150000);
  const seen = new Set();
  const citations = r.annotations.filter((a) => a.type === 'url_citation' && a.url_citation && a.url_citation.url && !seen.has(a.url_citation.url) && seen.add(a.url_citation.url))
    .map((a) => ({ url: a.url_citation.url, title: a.url_citation.title || '' }));
  return { text: r.text, citations, cost: r.cost };
}

// Engines a scan can ask, picked with VISIBILITY_ENGINES (comma list). Microsoft Copilot has no
// scraper and no API, so it cannot be measured.
const ENGINES = {
  chatgpt: { label: 'ChatGPT', ready: hasScraper, ask: (q) => askScraper('chat_gpt', q) },
  gemini: { label: 'Gemini', ready: hasScraper, ask: (q) => askScraper('gemini', q) },
  claude: { label: 'Claude', ready: () => true, ask: (q) => askNative('anthropic/claude-haiku-5.5', q) },
  grok: { label: 'Grok', ready: () => true, ask: (q) => askNative('x-ai/grok-4.3', q) },
};

async function extractBrands(text, profile) {
  const { data, cost } = await chatJson(
    'You read an AI assistant\'s answer. Reply with ONLY a JSON object: {"brands": string[] (every company or product brand ' +
    'the answer names as an option or recommendation, in order of first appearance, no duplicates; use the company name, ' +
    'never a domain or URL, and leave out publications and websites that are only cited as sources), ' +
    `"sentiment": "positive"|"neutral"|"negative"|"absent" (how the answer speaks about "${profile.brand}"; "absent" if not named)}.`,
    text.slice(0, 12000));
  return { brands: data.brands || [], sentiment: data.sentiment || 'absent', cost };
}

// ---- Pure scoring (no network) ----

function escapeRx(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Matches the brand, any alias, or the domain as whole words, ignoring case and spacing.
function brandRegex(profile) {
  const names = [profile.brand, ...(profile.aliases || []), profile.domain].filter(Boolean)
    .map((n) => escapeRx(n.trim()).replace(/\s+/g, '\\s*'));
  return new RegExp('(^|[^a-z0-9])(' + names.join('|') + ')($|[^a-z0-9])', 'i');
}

function hostOf(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }

function scoreAnswer(answer, profile, extracted) {
  const rx = brandRegex(profile);
  const brands = (extracted && extracted.brands) || [];
  const idx = brands.findIndex((b) => rx.test(b));
  const mentioned = rx.test(answer.text) || idx >= 0;
  const domains = answer.citations.map((c) => hostOf(c.url)).filter(Boolean);
  return {
    mentioned,
    position: idx >= 0 ? idx + 1 : null,
    cited: domains.some((d) => d === profile.domain || d.endsWith('.' + profile.domain)),
    sentiment: mentioned ? ((extracted && extracted.sentiment) || 'neutral') : 'absent',
    brands, domains,
  };
}

function topCounts(counts, limit) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([name, count]) => ({ name, count, share: total ? Math.round((count / total) * 1000) / 10 : 0 }));
}

// rows: [{ q, intent, score }] for answered questions only.
function summarize(rows, profile) {
  const rx = brandRegex(profile);
  const n = rows.length;
  const pct = (k) => (n ? Math.round((k / n) * 1000) / 10 : 0);
  const mentioned = rows.filter((r) => r.score.mentioned);
  const voice = {}; const display = {}; const sources = {};
  for (const r of rows) {
    const seen = new Set();
    for (const b of r.score.brands) {
      const key = rx.test(b) ? profile.brand.toLowerCase() : b.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      voice[key] = (voice[key] || 0) + 1;
      display[key] = display[key] || (rx.test(b) ? profile.brand : b.trim());
    }
    for (const d of new Set(r.score.domains)) sources[d] = (sources[d] || 0) + 1;
  }
  const byIntent = {};
  for (const r of rows) {
    const k = r.intent || 'other';
    byIntent[k] = byIntent[k] || { asked: 0, mentioned: 0 };
    byIntent[k].asked++; if (r.score.mentioned) byIntent[k].mentioned++;
  }
  const rate = (set) => (set.length ? Math.round((set.filter((r) => r.score.mentioned).length / set.length) * 1000) / 10 : null);
  return {
    answers: n,
    visibility: pct(mentioned.length),
    unbrandedVisibility: rate(rows.filter((r) => !r.branded)),
    brandedVisibility: rate(rows.filter((r) => r.branded)),
    citationRate: pct(rows.filter((r) => r.score.cited).length),
    positiveSentiment: mentioned.length ? Math.round((mentioned.filter((r) => r.score.sentiment === 'positive').length / mentioned.length) * 1000) / 10 : null,
    shareOfVoice: topCounts(voice, 10).map((x) => ({ ...x, name: display[x.name] })),
    topSources: topCounts(sources, 10),
    byIntent,
    missed: [...new Set(rows.filter((r) => !r.score.mentioned).map((r) => r.q))],
  };
}

// ---- Orchestration ----

async function runVisibility(url, opts) {
  const o = Object.assign({ questions: 10, runs: 1, concurrency: 4, model: ENGINE_MODEL }, opts);
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set');
  let cost = 0;
  const page = await fetchHomepage(url);
  const p = await profileBrand(page); cost += p.cost;
  if (o.metro) p.profile.metro = o.metro; // the scan form can supply what the homepage does not say
  const g = await generateQuestions(p.profile, o.questions); cost += g.cost;

  const jobs = [];
  for (const item of g.questions) for (let i = 0; i < o.runs; i++) jobs.push(item);
  const rx = brandRegex(p.profile);
  const labels = {};
  const standIn = { label: o.model, ask: (q) => askEngine(q, o.model) };
  const runEngine = async (key, eng) => {
    const rows = []; const errors = [];
    // Each real answer takes 20 to 60 seconds, so those run 10 at a time to keep a scan near one minute.
    const batch = eng === standIn ? o.concurrency : Math.max(o.concurrency, 10);
    for (let i = 0; i < jobs.length; i += batch) {
      await Promise.all(jobs.slice(i, i + batch).map(async (item) => {
        try {
          // One retry: with 10 calls open at once, a connection occasionally drops.
          const answer = eng === standIn ? await eng.ask(item.q) : await eng.ask(item.q).catch(() => eng.ask(item.q));
          labels[key] = eng.label + (answer.model ? ' (' + answer.model + ')' : '');
          const tagged = answer.brands && answer.brands.length;
          // ChatGPT tags brands itself; the helper model is only needed for sentiment when the brand is named.
          const ex = tagged && !rx.test(answer.text) ? { brands: answer.brands, sentiment: 'absent', cost: 0 } : await extractBrands(answer.text, p.profile);
          if (tagged) ex.brands = answer.brands;
          cost += answer.cost + ex.cost;
          rows.push({ engine: key, q: item.q, intent: item.intent, branded: item.branded, answer: answer.text, citations: answer.citations, score: scoreAnswer(answer, p.profile, ex) });
        } catch (e) { errors.push({ engine: key, q: item.q, error: e.message }); }
      }));
    }
    return { rows, errors };
  };
  // Every picked engine runs at the same time. A model asked for by name skips them and runs alone
  // through OpenRouter with web search; that same stand-in is the fallback if every engine fails.
  const picked = (opts && opts.model) ? [] : String(o.engines || process.env.VISIBILITY_ENGINES || 'chatgpt,gemini').split(',')
    .map((k) => k.trim().toLowerCase()).filter((k, i, a) => ENGINES[k] && ENGINES[k].ready() && a.indexOf(k) === i);
  const results = await Promise.all(picked.map((k) => runEngine(k, ENGINES[k])));
  let rows = results.flatMap((r) => r.rows);
  const errors = results.flatMap((r) => r.errors);
  let used = picked.filter((k, i) => results[i].rows.length);
  if (!rows.length) {
    const r = await runEngine('openrouter', standIn);
    rows = r.rows; errors.push(...r.errors); used = ['openrouter'];
  }
  const summary = summarize(rows, p.profile);
  summary.byEngine = used.map((k) => {
    const s = summarize(rows.filter((r) => r.engine === k), p.profile);
    return { engine: k, label: labels[k], answers: s.answers, unbrandedVisibility: s.unbrandedVisibility, brandedVisibility: s.brandedVisibility,
      citationRate: s.citationRate, topNamed: s.shareOfVoice.filter((x) => x.name !== p.profile.brand).slice(0, 3).map((x) => x.name) };
  });
  // The fix list is a bonus on top of the measurement; if it fails the run still returns.
  let fixList = null;
  try {
    const plan = await planPages(rows, p.profile, chatJson); cost += plan.cost;
    fixList = { pages: plan.pages, comparisons: comparisonPages(summary, p.profile), mentions: placesToEarnMentions(rows, p.profile) };
  } catch (e) { errors.push({ q: 'fix list', error: e.message }); }
  return { url, engine: used.join(','), model: used.map((k) => labels[k]).join(', '), profile: p.profile, summary, fixList, rows, errors, cost: Math.round(cost * 10000) / 10000 };
}

module.exports = { runVisibility, fetchHomepage, profileBrand, generateQuestions, askEngine, extractBrands, brandRegex, scoreAnswer, summarize };
