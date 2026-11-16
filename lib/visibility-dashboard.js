// Monthly AI Visibility dashboard for a paying customer: one page built from every saved run
// for a domain, oldest first. Shows this month against last month, the trend, an answer map
// (one square per AI answer), who AI names instead, and a short stack of fix cards.
// Styled to match wintechpartners.com. Small text stays at 13px or larger and at 4.5:1 or better.

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function whole(n) { return n === null || n === undefined ? null : Math.round(n); }
function pctText(n) { return n === null || n === undefined ? 'n/a' : Math.round(n) + '%'; }

// Runs saved before questions carried a topic are grouped by buyer stage instead.
const STAGE = { problem: 'Has a problem', research: 'Researching options', comparison: 'Comparing providers', purchase: 'Ready to buy' };

function parse(rec) { return typeof rec.result === 'string' ? JSON.parse(rec.result) : rec.result; }
function monthName(d, long) { return new Date(d).toLocaleString('en-US', { month: long ? 'long' : 'short', timeZone: 'America/Chicago' }); }
function engineLabel(e) { return String(e.label || e.engine).replace(/\s*\(.*\)$/, ''); }

// "▲ 10 points vs October". The arrow and the word carry direction, so it never rests on colour alone.
function delta(now, prev, since) {
  if (now === null || now === undefined || prev === null || prev === undefined) return '<span class="pill flat">First month measured</span>';
  const d = Math.round(now) - Math.round(prev);
  if (d === 0) return `<span class="pill flat">Same as ${esc(since)}</span>`;
  return `<span class="pill ${d > 0 ? 'up' : 'down'}">${d > 0 ? '&#9650; Up' : '&#9660; Down'} ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'} vs ${esc(since)}</span>`;
}

// Turns one run's fix list into cards. state: { [id]: { status: 'review'|'approved'|'done', note } }.
function buildFixes(result, state) {
  const fl = result.fixList || {}; const st = state || {}; const cards = [];
  for (const pg of fl.pages || []) {
    const n = (pg.questions || []).length;
    cards.push({ id: pg.slug, kind: 'New page', title: pg.title, weight: n * 3, qs: pg.questions, gain: `Covers ${n} question${n === 1 ? '' : 's'}`,
      impact: `AI answered ${n === 1 ? 'this buyer question' : 'these ' + n + ' buyer questions'} without you. This page gives it your answer to quote.`,
      steps: [`Create a page at ${pg.slug}`, `Put this answer in the first 40 words: "${pg.openingAnswer}"`,
        `Use these headings: ${(pg.headings || []).join(' / ')}`, 'Replace every [bracket] with a fact only you know',
        'Link to the page from your services menu'],
      draft: `${pg.title}\n\n${pg.openingAnswer}\n\n${(pg.headings || []).map((h) => '## ' + h).join('\n')}` });
  }
  for (const c of fl.comparisons || []) {
    cards.push({ id: c.slug, kind: 'Comparison page', title: c.title, weight: 4, gain: 'Head to head', impact: c.why + '. Buyers ask AI to compare you, so give it a fair comparison to quote.',
      steps: [`Create a page at ${c.slug}`, 'Start with a two-sentence verdict: who should pick you and who should pick them',
        'Add a short table: services, pricing model, response time, industries served',
        'Include an honest section on where the other company is the better choice', 'Link to the page from your services pages'],
      draft: `${c.title}\n\nShort verdict: [who should choose you] and [who should choose them].\n\n## Side by side\n## Where we are the better fit\n## Where they are the better fit\n## How to decide` });
  }
  const kind = { community: 'Community thread', directory: 'Directory listing', list: 'List article' };
  for (const m of fl.mentions || []) {
    const n = (m.questions || []).length;
    cards.push({ id: m.url, kind: kind[m.kind] || 'Outside page', title: m.title, weight: n * 2, link: m.url, qs: m.questions, gain: `Source for ${n} answer${n === 1 ? '' : 's'}`,
      impact: 'AI pulls from this page when it answers, and you are not on it yet.',
      steps: m.kind === 'community'
        ? ['Open the thread', 'Answer the question in your first sentence', 'Say you work at the company', 'Add no links', 'Check back in a week and reply to follow-ups']
        : ['Open the page', 'Find the editor or the "submit a listing" link', 'Send the short note we drafted', 'Give them your one-line description and your service area', 'Follow up once after 7 days'],
      draft: m.kind === 'community'
        ? 'Short answer: [direct answer to the question]. I work at [company], so weigh that, but here is what we see with clients in [area]: [one specific fact].'
        : `Hi, I read "${m.title}". We are [company], a [what you do] serving [area]. Would you consider adding us? One line you can use: [one-line description]. Happy to send anything else you need.` });
  }
  for (const c of cards) { const s = st[c.id] || {}; c.status = s.status || 'todo'; c.note = s.note || ''; }
  return cards.sort((a, b) => (b.status === 'review') - (a.status === 'review') || b.weight - a.weight);
}

// A line drawn in a stretchable SVG, with dots and labels as HTML so text never shrinks on a phone.
function lineChart(values, labels, max, big) {
  const n = values.length;
  const pts = values.map((v, i) => (v === null || v === undefined ? null : { x: n === 1 ? 50 : (i / (n - 1)) * 100, y: (1 - v / max) * 100, v, m: labels[i] })).filter(Boolean);
  if (!pts.length) return '';
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join(' ');
  const area = big && pts.length > 1 ? `<path d="${d} L${pts[pts.length - 1].x} 100 L${pts[0].x} 100 Z" fill="url(#fade)"/>` : '';
  const dots = pts.map((p, i) => `<span class="dot${i === pts.length - 1 ? ' last' : ''}" style="left:${p.x}%;top:${p.y}%" tabindex="0" data-v="${esc(p.m)}: ${p.v}%"></span>`).join('');
  return `<div class="plot${big ? ' big' : ''}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    ${big ? '<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2EE6F6" stop-opacity=".28"/><stop offset="1" stop-color="#2EE6F6" stop-opacity="0"/></linearGradient></defs>' : ''}
    ${area}<path d="${d}" fill="none" stroke="#2EE6F6" stroke-width="${big ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>${dots}</div>`;
}

// runs: [{ created_at, result }] oldest first. opts: { state, sample }.
function dashboardHtml(domain, runs, opts) {
  const o = opts || {};
  const all = runs.map((r) => ({ at: r.created_at, r: parse(r) }));
  const cur = all[all.length - 1]; const prev = all.length > 1 ? all[all.length - 2] : null;
  const s = cur.r.summary || {}; const ps = prev ? prev.r.summary || {} : {}; const p = cur.r.profile || {};
  const since = prev ? monthName(prev.at, true) : '';
  const months = all.map((a) => monthName(a.at));
  const score = whole(s.unbrandedVisibility) || 0;
  const next = new Date(cur.at); next.setMonth(next.getMonth() + 1);
  const nextRun = next.toLocaleString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

  // Answer map: one row per buyer question, one square per engine.
  const engines = (s.byEngine || []).map((e) => ({ key: e.engine, label: engineLabel(e), now: e.unbrandedVisibility,
    was: prev ? ((ps.byEngine || []).find((z) => z.engine === e.engine) || {}).unbrandedVisibility : null }));
  const cell = (rows, q, k) => { const r = (rows || []).find((x) => x.q === q && x.engine === k); return r ? !!(r.score && r.score.mentioned) : null; };
  const qs = [...new Set((cur.r.rows || []).filter((r) => !r.branded).map((r) => r.q))];
  let named = 0, total = 0, gained = 0, lost = 0;
  const mapRows = qs.map((q) => {
    const cells = engines.map((e) => {
      const now = cell(cur.r.rows, q, e.key); const was = prev ? cell(prev.r.rows, q, e.key) : null;
      if (now === null) return { cls: 'na', text: 'not asked', e };
      total++; if (now) named++;
      if (now && was === false) { gained++; return { cls: 'on new', text: 'named you, new this month', e }; }
      if (!now && was === true) { lost++; return { cls: 'off lost', text: 'stopped naming you this month', e }; }
      return { cls: now ? 'on' : 'off', text: now ? 'named you' : 'did not name you', e };
    });
    const row = (cur.r.rows || []).find((x) => x.q === q) || {};
    return { q, cells, topic: row.topic || STAGE[row.intent] || 'Buyer questions', n: cells.filter((c) => c.cls.startsWith('on')).length };
  }).sort((a, b) => b.n - a.n);
  // Group the questions by topic, strongest topic first. Eight topics show; the rest sit behind one button.
  const topics = [];
  for (const r of mapRows) {
    let t = topics.find((x) => x.name === r.topic);
    if (!t) topics.push(t = { name: r.topic, rows: [], on: 0, all: 0 });
    t.rows.push(r); t.on += r.n; t.all += r.cells.filter((c) => c.cls !== 'na').length;
  }
  topics.forEach((t) => { t.share = t.all ? t.on / t.all : 0; });
  topics.sort((a, b) => b.share - a.share);
  const sq = (c, small) => `<span class="sq${small ? ' sm' : ''} ${c.cls}" title="${esc(c.e.label)} ${c.text}" role="img" aria-label="${esc(c.e.label)} ${c.text}"></span>`;
  const title = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const mapHtml = `<div class="map" style="--n:${engines.length}">
      <div class="mrow mtop"><div></div>${engines.map((e) => `<div class="mhead">${esc(e.label)}</div>`).join('')}</div>
      ${topics.map((t, i) => `<details class="trow${i >= 8 ? ' more' : ''}"${i >= 8 ? ' hidden' : ''}><summary class="mrow"><div><div class="tname">${esc(title(t.name))}</div><div class="sub">Named in ${t.on} of ${t.all} answers. ${t.rows.length} question${t.rows.length === 1 ? '' : 's'}.</div></div>` +
        engines.map((e, ei) => `<div class="cl">${t.rows.map((r) => sq(r.cells[ei], true)).join('')}</div>`).join('') + '</summary>' +
        t.rows.map((r) => `<div class="mrow qrow"><div class="mq">${esc(r.q)}</div>${r.cells.map((c) => `<div class="cl">${sq(c, true)}</div>`).join('')}</div>`).join('') + '</details>').join('')}
      <div class="mrow"><div class="mfoot">Named you in</div>${engines.map((e) => `<div class="mfoot num">${pctText(e.now)}</div>`).join('')}</div>
    </div>${topics.length > 8 ? `<div class="fbtns"><button class="btn ghost" id="moretopics">Show ${topics.length - 8} more topics</button></div>` : ''}`;
  const topicOfQ = {}; const shareOf = {};
  mapRows.forEach((r) => { topicOfQ[r.q] = r.topic; }); topics.forEach((t) => { shareOf[t.name] = t.share; });

  let headline = `AI named you in <b>${named} of ${total}</b> answers to buyer questions.`;
  if (prev) headline += ` ${gained ? `<span class="up">${gained} new this month</span>` : 'No new answers this month'}${lost ? `, <span class="down">${lost} lost</span>` : ''}.`;

  // Trend: the combined line in the hero, one small chart per engine below.
  const allVals = all.map((a) => whole((a.r.summary || {}).unbrandedVisibility));
  const engVals = (k) => all.map((a) => { const e = ((a.r.summary || {}).byEngine || []).find((z) => z.engine === k); return e ? whole(e.unbrandedVisibility) : null; });
  // The hero scales to the combined line (50% or 100%); the engine charts share one scale so they compare.
  const top = Math.max(...allVals.filter((v) => v !== null), 0) > 50 ? 100 : 50;
  const engTop = Math.max(25, Math.ceil(Math.max(...engines.map((e) => Math.max(...engVals(e.key).filter((v) => v !== null), 0)), 0) / 25) * 25);
  const xl = months.map((m, i) => `<span style="left:${months.length === 1 ? 50 : (i / (months.length - 1)) * 100}%">${esc(m)}</span>`).join('');
  const heroChart = all.length > 1
    ? `<div class="chart"><div class="ylab"><span>${top}%</span><span>${top / 2}%</span><span>0%</span></div><div class="pwrap">${lineChart(allVals, months, top, true)}<div class="xlab">${xl}</div></div></div>`
    : '<div class="sub">Your trend line starts after the second monthly run.</div>';
  const engCards = engines.map((e) => `<div class="card eng"><div class="lbl">${esc(e.label)}</div><div class="erow"><div class="num">${pctText(e.now)}</div>${delta(e.now, e.was, since)}</div>${all.length > 1 ? lineChart(engVals(e.key), months, engTop, false) : ''}</div>`).join('');
  const table = `<table><tr><th>Month</th><th>All engines</th>${engines.map((e) => `<th>${esc(e.label)}</th>`).join('')}</tr>` +
    months.map((m, i) => `<tr><td>${esc(m)}</td><td>${pctText(allVals[i])}</td>${engines.map((e) => `<td>${pctText(engVals(e.key)[i])}</td>`).join('')}</tr>`).join('') + '</table>';

  const stat = (label, now, was, sub) => `<div class="stat"><div class="lbl">${label}</div><div class="num">${pctText(now)}</div>${delta(now, prev ? was : null, since)}<div class="sub">${sub}</div></div>`;
  const stats = stat('Asked by name', s.brandedVisibility, ps.brandedVisibility, 'AI knows you when a buyer asks about you directly') +
    stat('Your site cited', s.citationRate, ps.citationRate, 'Answers that used your website as a source') +
    stat('Positive tone', s.positiveSentiment, ps.positiveSentiment, 'Of the answers that named you, how many spoke well of you');

  // Leaderboard
  const voice = (s.shareOfVoice || []).slice();
  const board = voice.slice(0, 5); const me = voice.find((x) => x.name === p.brand);
  if (me && !board.includes(me)) board[4] = me;
  const max = Math.max(1, ...board.map((x) => x.count));
  const myRank = me ? voice.indexOf(me) + 1 : 0;
  const rivals = board.map((x) => {
    const mine = x.name === p.brand; const rank = voice.indexOf(x) + 1;
    const was = prev ? ((ps.shareOfVoice || []).find((z) => z.name === x.name) || { count: 0 }).count : null;
    const ch = was === null || was === x.count ? '' : `<span class="chg">${x.count > was ? '&#9650;' : '&#9660;'} ${Math.abs(x.count - was)}</span>`;
    return `<div class="rk${mine ? ' mine' : ''}"><div class="rnum">${rank}</div><div class="rname">${esc(x.name)}${mine ? ' <span class="you">You</span>' : ''}</div><div class="rtrack"><div class="rfill" style="width:${(x.count / max) * 100}%"></div></div><div class="rval">${x.count} answers ${ch}</div></div>`;
  }).join('');
  const rankLine = me ? `You rank <b>number ${myRank}</b> of the ${voice.length} companies AI named this month.` : 'AI did not name you this month. These are the companies it named instead.';

  // Fix cards: the top one large, four more beside it, the rest behind one button.
  // Each fix is tagged with the weakest topic it covers; fixes for weaker topics come first.
  const fixes = buildFixes(cur.r, o.state);
  for (const f of fixes) {
    const ts = [...new Set((f.qs || []).map((q) => topicOfQ[q]).filter(Boolean))].sort((a, b) => shareOf[a] - shareOf[b]);
    f.topic = ts[0] || ''; f.share = ts.length ? shareOf[ts[0]] : 1;
  }
  const open = fixes.filter((f) => f.status !== 'done').sort((a, b) => (b.status === 'review') - (a.status === 'review') || a.share - b.share || b.weight - a.weight);
  const done = fixes.filter((f) => f.status === 'done');
  const stages = ['To do', 'Draft ready', 'Approved', 'Live'];
  const stageOf = { todo: 0, review: 1, approved: 2, done: 3 };
  const steps = (f) => `<div class="stages">${stages.map((t, i) => `<span class="${i < stageOf[f.status] ? 'past' : i === stageOf[f.status] ? 'here' : ''}">${t}</span>`).join('')}</div>`;
  const card = (f, i) => `<div class="card fix${i === 0 ? ' lead' : ''}${i >= 5 ? ' more' : ''}"${i >= 5 ? ' hidden' : ''}>
      <div class="fnum">${String(i + 1).padStart(2, '0')}</div>
      <div class="fbody"><div class="fhead"><span class="lbl">${esc(f.kind)}</span><span class="gain">${esc(f.gain)}</span>${f.topic ? `<span class="topic">Topic: ${esc(title(f.topic))}</span>` : ''}</div>
      <h3>${esc(f.title)}</h3><div class="sub">${esc(f.impact)}</div>${steps(f)}
      <div class="fbtns"><button class="btn" data-open="build">${f.status === 'review' ? 'Review the draft' : 'Build it for me'}</button><button class="btn ghost" data-open="how">Show me how</button></div>
      <div class="panel" data-panel="how" hidden><ol>${f.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${f.link ? `<a href="${esc(f.link)}" target="_blank" rel="noopener nofollow">Open the page</a>` : ''}</div>
      <div class="panel" data-panel="build" hidden><div class="sub">${f.status === 'review' ? 'Here is the draft. Approve it and we send the finished version with paste-in steps.' : 'We write it. You approve it. Then you get the finished version with paste-in steps. If we host your site, we publish it for you.'}</div>
        <pre>${esc(f.draft)}</pre><div class="fbtns"><button class="btn" data-act="approve">${f.status === 'review' ? 'Approve' : 'Yes, build this'}</button>${f.status === 'review' ? '<button class="btn ghost" data-act="change">Ask for changes</button>' : ''}</div><div class="said" hidden></div></div></div></div>`;
  const doneList = done.slice(0, 3).map((f) => `<div class="dn"><span class="tick">&#10003;</span><div><div class="dtitle">${esc(f.title)}</div>${f.note ? `<div class="sub">${esc(f.note)}</div>` : ''}</div></div>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>AI Visibility Dashboard: ${esc(domain)}</title><meta name="robots" content="noindex, nofollow">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root{--ink:#0A0D11;--surf:#12191F;--surf2:#161F27;--line:#243240;--text:#E9EFF3;--soft:#B4C0C9;--cyan:#2EE6F6;--green:#8FE3A8;--red:#F0857E;--amber:#F2B05E}
    *{margin:0;padding:0;box-sizing:border-box}[hidden]{display:none!important}
    body{background:var(--ink);color:var(--text);font-family:'DM Sans',Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;font-size:16px;line-height:1.55}
    .in{max-width:1120px;margin:0 auto;padding:0 24px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:22px 0;border-bottom:1px solid var(--line)}
    .brand{display:flex;align-items:center;gap:12px;font-family:'Space Mono',monospace;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--text)}
    .mark{display:grid;grid-template-columns:repeat(3,7px);gap:3px}.mark i{width:7px;height:7px;border-radius:2px;background:#33434F}.mark i.lit{background:var(--cyan);box-shadow:0 0 10px var(--cyan)}
    .when{font-size:14px;color:var(--soft)}.when b{color:var(--text);font-weight:600}
    .sample{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:#1A1204;background:var(--amber);border-radius:6px;padding:3px 10px}
    .lbl{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--cyan)}
    .sub{font-size:15px;color:var(--soft)}
    .num{font-family:'Instrument Serif',Georgia,serif;font-weight:400;line-height:1;color:var(--text)}
    .card{background:var(--surf);border:1px solid var(--line);border-radius:18px;padding:24px}
    .hero{position:relative;overflow:hidden;margin-top:28px;border-radius:24px;border:1px solid var(--line);padding:36px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:40px;align-items:center;
      background:radial-gradient(700px 360px at 12% 0%,rgba(46,230,246,.16),transparent 70%),linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/100% 36px,linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/36px 100%,var(--surf)}
    .hero h1{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:30px;line-height:1.15;margin:10px 0 2px}
    .hero .num{font-size:clamp(96px,13vw,150px);letter-spacing:-.02em;margin:6px 0 10px}
    .hero .num small{font-size:.45em;color:var(--cyan)}
    .headline{font-size:17px;color:var(--text);margin-top:14px}.headline b{font-weight:700}
    .pill{display:inline-block;font-size:14px;font-weight:700;border-radius:999px;padding:4px 12px;border:1px solid var(--line);background:var(--ink);white-space:nowrap}
    .up{color:var(--green)}.down{color:var(--red)}.flat{color:var(--soft)}
    .chart{display:flex;gap:10px}.ylab{display:flex;flex-direction:column;justify-content:space-between;height:220px;font-size:13px;color:var(--soft);text-align:right}
    .pwrap{flex:1;min-width:0;padding:0 22px}
    .plot{position:relative;height:56px;margin-top:14px}.plot.big{height:220px;margin:0;background:linear-gradient(var(--line),var(--line)) 0 0/100% 1px no-repeat,linear-gradient(var(--line),var(--line)) 0 50%/100% 1px no-repeat,linear-gradient(var(--line),var(--line)) 0 100%/100% 1px no-repeat}
    .plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;animation:wipe 1.1s ease-out both}
    @keyframes wipe{from{clip-path:inset(-10% 100% -10% 0)}to{clip-path:inset(-10% -5% -10% 0)}}
    .dot{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--cyan);border:2px solid var(--surf);outline:none}
    .plot.big .dot{width:14px;height:14px;margin:-7px 0 0 -7px}
    .dot.last{box-shadow:0 0 0 5px rgba(46,230,246,.22),0 0 18px var(--cyan)}
    .dot::before{content:'';position:absolute;inset:-12px}
    .dot:hover::after,.dot:focus::after{content:attr(data-v);position:absolute;bottom:20px;left:50%;transform:translateX(-50%);white-space:nowrap;background:var(--ink);border:1px solid var(--cyan);border-radius:8px;padding:4px 10px;font-size:13px;font-weight:700;color:var(--text);z-index:2}
    .xlab{position:relative;height:26px;margin-top:8px}.xlab span{position:absolute;transform:translateX(-50%);font-size:13px;color:var(--soft)}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);margin-top:16px;padding:0}
    .stat{padding:24px;border-left:1px solid var(--line)}.stat:first-child{border-left:none}
    .stat .num{font-size:52px;margin:8px 0}.stat .sub{margin-top:10px}
    h2{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:34px;line-height:1.15;margin:56px 0 4px}
    .secsub{font-size:16px;color:var(--soft);margin-bottom:18px;max-width:640px}
    .engs{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
    .eng .num{font-size:44px}.erow{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:8px}
    details{margin-top:14px;font-size:14px;color:var(--soft)}summary{cursor:pointer;color:var(--cyan);font-weight:600}
    table{border-collapse:collapse;margin-top:10px;width:100%}th,td{text-align:left;padding:7px 10px;border-top:1px solid var(--line);font-size:14px;color:var(--text)}
    .key{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:18px;font-size:14px;color:var(--text)}.key span{display:inline-flex;align-items:center;gap:8px}
    .sq{display:inline-block;width:30px;height:30px;border-radius:7px;background:#1B2630;border:1px solid #33434F;position:relative}
    .key .sq{width:18px;height:18px;border-radius:5px}
    .sq.on{background:var(--cyan);border-color:var(--cyan)}
    .sq.new{box-shadow:0 0 0 3px var(--surf),0 0 0 5px var(--green),0 0 16px rgba(46,230,246,.6)}
    .sq.new::after{content:'';position:absolute;inset:0;margin:auto;width:8px;height:8px;border-radius:50%;background:#04181B}
    .sq.lost{border:2px solid var(--red)}.sq.lost::after{content:'\\00d7';position:absolute;inset:0;display:grid;place-items:center;color:var(--red);font-weight:700;font-size:18px;line-height:1}
    .key .sq.new::after{width:5px;height:5px}.key .sq.lost::after{font-size:13px}.key .sq.new{box-shadow:0 0 0 2px var(--surf),0 0 0 4px var(--green)}
    .sq.na{background:transparent;border-style:dashed}
    .sq.sm{width:15px;height:15px;border-radius:4px}.sq.sm.new{box-shadow:0 0 0 2px var(--surf),0 0 0 4px var(--green)}.sq.sm.new::after{width:5px;height:5px}.sq.sm.lost::after{font-size:12px}
    .mrow{display:grid;grid-template-columns:minmax(0,1fr) repeat(var(--n),128px);gap:0 10px;align-items:center;padding:14px 0;border-top:1px solid var(--line)}
    .mrow.mtop{border-top:none;padding-top:0}
    .trow{margin:0;font-size:16px;color:var(--text)}.trow summary{list-style:none;cursor:pointer;color:var(--text);font-weight:400}.trow summary::-webkit-details-marker{display:none}
    .trow summary:hover .tname{color:var(--cyan)}
    .tname{font-size:18px;font-weight:600}.tname::before{content:'+';display:inline-block;width:20px;color:var(--cyan);font-family:'Space Mono',monospace}.trow[open] .tname::before{content:'\\2212'}
    .trow summary .sub{padding-left:20px;font-size:14px}
    .cl{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;line-height:0}
    .qrow{padding:10px 0;border-top:1px dashed var(--line)}.mq{font-size:15px;color:var(--soft);padding-left:20px}
    .mhead,.mfoot{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--soft);text-align:center}
    .mfoot:not(.num){text-align:left;letter-spacing:.1em;text-transform:uppercase}.mfoot.num{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:26px;color:var(--text)}
    .topic{font-size:13px;font-weight:600;color:var(--soft)}
    .rk{display:grid;grid-template-columns:34px 220px minmax(0,1fr) 150px;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}.rk:first-of-type{border-top:none}
    .rnum{font-family:'Instrument Serif',Georgia,serif;font-size:28px;line-height:1;color:var(--soft)}
    .rname{font-size:16px;font-weight:600}.you{font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:#04181B;background:var(--cyan);border-radius:5px;padding:1px 7px;margin-left:6px}
    .rtrack{height:12px}.rfill{height:12px;border-radius:0 6px 6px 0;background:#5B6E7C;min-width:4px}
    .rk.mine .rfill{background:var(--cyan);box-shadow:0 0 14px rgba(46,230,246,.45)}.rk.mine .rnum{color:var(--cyan)}
    .rval{font-size:14px;color:var(--soft);text-align:right;white-space:nowrap}.chg{color:var(--text);font-weight:700;margin-left:6px}
    .fixes{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .fix{display:flex;gap:18px}.fix.lead{grid-column:1/-1;border-color:#1B8C97;background:linear-gradient(120deg,rgba(46,230,246,.09),transparent 55%),var(--surf)}
    .fnum{font-family:'Instrument Serif',Georgia,serif;font-size:44px;line-height:.9;color:var(--cyan);flex:none}.fix.lead .fnum{font-size:72px}
    .fbody{flex:1;min-width:0}
    .fhead{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
    .gain{font-size:13px;font-weight:700;color:var(--green);border:1px solid #2F6B45;border-radius:999px;padding:2px 10px}
    h3{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:24px;line-height:1.2;margin-bottom:6px}.fix.lead h3{font-size:32px}
    .stages{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:14px;font-size:13px;font-weight:600;color:var(--soft)}
    .stages span{display:inline-flex;align-items:center;gap:7px}.stages span::before{content:'';width:10px;height:10px;border-radius:50%;border:2px solid #5B6E7C}
    .stages .past{color:var(--text)}.stages .past::before{background:var(--green);border-color:var(--green)}
    .stages .here{color:var(--cyan)}.stages .here::before{background:var(--cyan);border-color:var(--cyan);box-shadow:0 0 10px var(--cyan)}
    .fbtns{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
    .btn{font:inherit;font-size:15px;font-weight:700;padding:11px 18px;border-radius:12px;border:1px solid var(--cyan);background:var(--cyan);color:#04181B;cursor:pointer;transition:transform .15s,box-shadow .15s}
    .btn:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(46,230,246,.25)}
    .btn.ghost{background:transparent;color:var(--text);border-color:#4A5C69}.btn.ghost:hover{border-color:var(--cyan);box-shadow:none}
    .btn:focus-visible,summary:focus-visible,.dot:focus-visible{outline:2px solid #fff;outline-offset:3px}
    .panel{margin-top:16px;padding-top:16px;border-top:1px solid var(--line)}
    .panel ol{padding-left:22px}.panel li{margin-bottom:7px}
    pre{white-space:pre-wrap;font-family:'Space Mono',ui-monospace,monospace;font-size:13px;color:var(--text);background:var(--ink);border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:12px}
    .said{margin-top:12px;font-size:15px;font-weight:600;color:var(--green)}
    .dn{display:flex;gap:12px;padding:10px 0}.tick{color:var(--green);font-weight:700}.dtitle{font-weight:600}
    a{color:var(--cyan)}
    .foot{margin:56px 0 70px;padding-top:20px;border-top:1px solid var(--line);font-size:14px;color:var(--soft)}
    @media(max-width:900px){.hero{grid-template-columns:1fr;padding:24px;gap:24px}.engs{grid-template-columns:1fr 1fr}.fixes{grid-template-columns:1fr}.stats{grid-template-columns:1fr}.stat{border-left:none;border-top:1px solid var(--line)}.stat:first-child{border-top:none}
      .rk{grid-template-columns:28px minmax(0,1fr) auto}.rtrack{grid-column:2/-1;order:4}}
    @media(max-width:720px){.mrow{grid-template-columns:repeat(var(--n),1fr);gap:8px 6px}.mrow>div:first-child{grid-column:1/-1}.mrow.mtop>div:first-child,.mfoot:not(.num){display:none}.mfoot.num{font-size:22px}}
    @media(max-width:620px){.engs{grid-template-columns:1fr}.fix{flex-direction:column;gap:8px}h2{font-size:28px}}
    @media(prefers-reduced-motion:reduce){.plot svg{animation:none}.btn{transition:none}}
  </style></head><body>
  <div class="in">
    <div class="top"><div class="brand"><span class="mark"><i></i><i></i><i></i><i></i><i class="lit"></i><i></i><i></i><i></i><i></i></span>WinTech AI Visibility</div>
      <div class="when"><b>${esc(monthName(cur.at, true))} results.</b> Next automatic run: ${esc(nextRun)}. ${o.sample ? '<span class="sample">Sample numbers</span>' : ''}</div></div>

    <div class="hero">
      <div><div class="lbl">${esc(domain)}</div><h1>${esc(p.brand || domain)}</h1>
        <div class="num" data-count="${score}">${score}<small>%</small></div>
        ${delta(s.unbrandedVisibility, prev ? ps.unbrandedVisibility : null, since)}
        <div class="headline">${headline}</div></div>
      <div><div class="lbl" style="margin-bottom:14px">Named in buyer questions, by month</div>${heroChart}</div>
    </div>
    <div class="card stats">${stats}</div>

    <h2>Your answer map</h2><div class="secsub">Every square is one AI answer to a question your buyers ask. Lit means it named you. Click a topic to see its questions.</div>
    <div class="card"><div class="key"><span><i class="sq on"></i>Named you</span><span><i class="sq new on"></i>New this month</span><span><i class="sq"></i>Did not name you</span><span><i class="sq lost"></i>Lost this month</span></div>${mapHtml}</div>

    <h2>Engine by engine</h2><div class="secsub">The same buyer questions, asked to each AI engine every month.</div>
    <div class="engs">${engCards}</div>
    ${all.length > 1 ? `<details><summary>Show the numbers</summary>${table}</details>` : ''}

    <h2>Who AI names</h2><div class="secsub">${rankLine}</div>
    <div class="card">${rivals || '<div class="sub">No companies were named.</div>'}</div>

    <h2>Your next moves</h2><div class="secsub">Biggest impact first. Do each one yourself, or have us build it.</div>
    <div class="fixes">${open.map(card).join('') || '<div class="card sub">Nothing open. New moves arrive after the next run.</div>'}</div>
    ${open.length > 5 ? `<div class="fbtns"><button class="btn ghost" id="more">Show ${open.length - 5} more</button></div>` : ''}
    ${doneList ? `<h2>Done so far</h2><div class="card">${doneList}</div>` : ''}

    <div class="foot">How this works: each month we ask ${engines.length > 1 ? 'these AI answer engines' : 'an AI answer engine'} the questions your buyers ask, then check every answer for your name, the other companies named and the sources cited. AI answers vary from run to run, so watch the trend more than any single month. WinTech Partners.</div>
  </div>
  <script>
  (function(){
    var sample=${o.sample ? 'true' : 'false'};
    document.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;
      var card=b.closest('.fix');
      if(b.id==='moretopics'){document.querySelectorAll('.trow.more').forEach(function(x){x.hidden=false});b.parentNode.remove();return}
      if(b.id==='more'){document.querySelectorAll('.fix.more').forEach(function(x){x.hidden=false});b.parentNode.remove();return}
      if(b.dataset.open&&card){card.querySelectorAll('.panel').forEach(function(p){p.hidden=p.dataset.panel!==b.dataset.open||!p.hidden});return}
      if(b.dataset.act&&card){var s=card.querySelector('.said');s.hidden=false;
        s.textContent=(b.dataset.act==='approve'?'Got it. We will email you when it is ready.':'Got it. Reply to our email with what to change.')+(sample?' (Sample dashboard: nothing was sent.)':'');}
    });
    var n=document.querySelector('[data-count]');
    if(n&&!matchMedia('(prefers-reduced-motion: reduce)').matches){var to=+n.dataset.count,t0=null,node=n.firstChild;
      requestAnimationFrame(function step(t){t0=t0||t;var k=Math.min(1,(t-t0)/900);node.nodeValue=Math.round(to*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(step)});
      setTimeout(function(){node.nodeValue=to},1500);}
  })();
  </script></body></html>`;
}

module.exports = { dashboardHtml, buildFixes };
