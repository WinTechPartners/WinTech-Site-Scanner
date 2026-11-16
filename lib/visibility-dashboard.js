// Monthly AI Visibility dashboard for a paying customer: one page built from every saved run
// for a domain, oldest first. Shows this month against last month, the trend per AI engine,
// who AI names instead, and a short stack of fix cards.
// Small text stays at 13px or larger and at 4.5:1 contrast or better on the dark background.

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function statusColor(p) { return p >= 50 ? '#22c55e' : p >= 20 ? '#f59e0b' : '#f87171'; }
function whole(n) { return n === null || n === undefined ? null : Math.round(n); }
function pctText(n) { return n === null || n === undefined ? 'n/a' : Math.round(n) + '%'; }

// Colour follows the engine, never its rank. Checked for colour-blind separation on #0f172a.
const ENGINE_COLORS = { chatgpt: '#3987e5', gemini: '#d95926', claude: '#199e70', grok: '#c98500' };
const ALL_COLOR = '#e2e8f0';

function parse(rec) { return typeof rec.result === 'string' ? JSON.parse(rec.result) : rec.result; }
function monthName(d, long) { return new Date(d).toLocaleString('en-US', { month: long ? 'long' : 'short', timeZone: 'America/Chicago' }); }
function engineLabel(e) { return String(e.label || e.engine).replace(/\s*\(.*\)$/, ''); }

// "up 9 points since October", with an arrow so direction never depends on colour alone.
function delta(now, prev, since) {
  if (now === null || now === undefined || prev === null || prev === undefined) return '<span class="dl flat">First month measured</span>';
  const d = Math.round(now) - Math.round(prev);
  if (d === 0) return `<span class="dl flat">No change since ${esc(since)}</span>`;
  return `<span class="dl ${d > 0 ? 'up' : 'down'}">${d > 0 ? '&#9650;' : '&#9660;'} ${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'} since ${esc(since)}</span>`;
}

// Per question: how many engines named the brand in one run.
function namedByQuestion(result) {
  const out = {};
  for (const r of result.rows || []) {
    if (r.branded) continue;
    out[r.q] = out[r.q] || { named: 0, asked: 0 };
    out[r.q].asked++; if (r.score && r.score.mentioned) out[r.q].named++;
  }
  return out;
}

// Turns one run's fix list into cards. state: { [id]: { status: 'review'|'done', note } }.
function buildFixes(result, state) {
  const fl = result.fixList || {}; const st = state || {}; const cards = [];
  for (const pg of fl.pages || []) {
    const n = (pg.questions || []).length;
    cards.push({ id: pg.slug, kind: 'New page', title: pg.title, weight: n * 3,
      impact: `Answers ${n} buyer question${n === 1 ? '' : 's'} that AI answered without you`,
      steps: [`Create a page at ${pg.slug}`, `Put this answer in the first 40 words: "${pg.openingAnswer}"`,
        `Use these headings: ${(pg.headings || []).join(' / ')}`, 'Replace every [bracket] with a fact only you know',
        'Link to the page from your services menu'],
      draft: `${pg.title}\n\n${pg.openingAnswer}\n\n${(pg.headings || []).map((h) => '## ' + h).join('\n')}` });
  }
  for (const c of fl.comparisons || []) {
    cards.push({ id: c.slug, kind: 'Comparison page', title: c.title, weight: 4, impact: c.why,
      steps: [`Create a page at ${c.slug}`, 'Start with a two-sentence verdict: who should pick you and who should pick them',
        'Add a short table: services, pricing model, response time, industries served',
        'Include an honest section on where the other company is the better choice', 'Link to the page from your services pages'],
      draft: `${c.title}\n\nShort verdict: [who should choose you] and [who should choose them].\n\n## Side by side\n## Where we are the better fit\n## Where they are the better fit\n## How to decide` });
  }
  const kind = { community: 'Community thread', directory: 'Directory listing', list: 'List article' };
  for (const m of fl.mentions || []) {
    const n = (m.questions || []).length;
    cards.push({ id: m.url, kind: kind[m.kind] || 'Outside page', title: m.title, weight: n * 2, link: m.url,
      impact: `AI used this page as a source for ${n} answer${n === 1 ? '' : 's'}, and you are not on it`,
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

function gauge(value) {
  const v = Math.max(0, Math.min(100, value || 0));
  return `<svg viewBox="0 0 220 128" class="gauge" role="img" aria-label="${v} percent">
    <path d="M20 112 A90 90 0 0 1 200 112" fill="none" stroke="#1e293b" stroke-width="16" stroke-linecap="round"/>
    <path d="M20 112 A90 90 0 0 1 200 112" fill="none" stroke="${statusColor(v)}" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="${v} 100"/>
    <text x="110" y="104" text-anchor="middle" class="gnum">${v}%</text></svg>`;
}

function ring(value, color) {
  const v = Math.max(0, Math.min(100, value || 0));
  return `<svg viewBox="0 0 44 44" class="ring" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="#1e293b" stroke-width="5"/>
    <circle cx="22" cy="22" r="18" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" pathLength="100" stroke-dasharray="${v} 100" transform="rotate(-90 22 22)"/></svg>`;
}

// One line per engine plus the combined line, 0 to 100 on a single axis.
function trendChart(series, labels) {
  const W = 720, H = 250, L = 44, R = 20, T = 14, B = 30;
  const x = (i) => L + (labels.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  const grid = [0, 25, 50, 75, 100].map((g) =>
    `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="#1e293b"/><text x="${L - 8}" y="${y(g) + 4}" text-anchor="end" class="ax">${g}%</text>`).join('');
  const xl = labels.map((m, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="ax">${esc(m)}</text>`).join('');
  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => (v === null || v === undefined ? null : [x(i), y(v)])).filter(Boolean);
    if (!pts.length) return '';
    const wide = s.key === 'all';
    return `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${wide ? 3 : 2}" stroke-linejoin="round" stroke-linecap="round"/>` +
      pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${wide ? 5 : 4}" fill="${s.color}" stroke="#0f172a" stroke-width="2"/>`).join('');
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="trend" id="trend" role="img" aria-label="Share of buyer questions where AI named you, by month and engine">${grid}${xl}
    <line id="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#94a3b8" stroke-dasharray="3 3" visibility="hidden"/>${lines}</svg>`;
}

// runs: [{ created_at, result }] oldest first. opts: { state, sample }.
function dashboardHtml(domain, runs, opts) {
  const o = opts || {};
  const all = runs.map((r) => ({ at: r.created_at, r: parse(r) }));
  const cur = all[all.length - 1]; const prev = all.length > 1 ? all[all.length - 2] : null;
  const s = cur.r.summary || {}; const ps = prev ? prev.r.summary || {} : {}; const p = cur.r.profile || {};
  const since = prev ? monthName(prev.at, true) : '';
  const score = whole(s.unbrandedVisibility) || 0;
  const next = new Date(cur.at); next.setMonth(next.getMonth() + 1);
  const nextRun = next.toLocaleString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

  let headline = `AI named you in <b>${score}%</b> of buyer questions this month.`;
  if (prev) {
    const d = score - (whole(ps.unbrandedVisibility) || 0);
    headline = `AI named you in <b>${score}%</b> of buyer questions this month, ${d === 0 ? 'the same as' : (d > 0 ? 'up ' : 'down ') + Math.abs(d) + ' points from'} ${esc(since)}.`;
  }

  const tile = (label, now, was, sub) => `<div class="card tile"><div class="lbl">${label}</div><div class="tnum">${pctText(now)}</div>${delta(now, prev ? was : null, since)}<div class="sub">${sub}</div></div>`;
  const tiles = tile('Asked by name', s.brandedVisibility, ps.brandedVisibility, 'AI knows you when a buyer asks about you directly') +
    tile('Your site cited', s.citationRate, ps.citationRate, 'Answers that used your website as a source') +
    tile('Positive tone', s.positiveSentiment, ps.positiveSentiment, 'Of the answers that named you, how many spoke well of you');

  // Trend
  const keys = []; const labelOf = {};
  for (const a of all) for (const e of (a.r.summary || {}).byEngine || []) { if (!keys.includes(e.engine)) keys.push(e.engine); labelOf[e.engine] = engineLabel(e); }
  const series = [{ key: 'all', label: 'All engines', color: ALL_COLOR, values: all.map((a) => whole((a.r.summary || {}).unbrandedVisibility)) }]
    .concat(keys.map((k) => ({ key: k, label: labelOf[k], color: ENGINE_COLORS[k] || '#9085e9',
      values: all.map((a) => { const e = ((a.r.summary || {}).byEngine || []).find((z) => z.engine === k); return e ? whole(e.unbrandedVisibility) : null; }) })));
  const months = all.map((a) => monthName(a.at));
  const legend = series.map((x) => `<span class="lg"><i style="background:${x.color}"></i>${esc(x.label)}</span>`).join('');
  const table = `<table><tr><th>Month</th>${series.map((x) => `<th>${esc(x.label)}</th>`).join('')}</tr>` +
    months.map((m, i) => `<tr><td>${esc(m)}</td>${series.map((x) => `<td>${pctText(x.values[i])}</td>`).join('')}</tr>`).join('') + '</table>';
  const trend = all.length > 1
    ? `<div class="legend">${legend}</div><div class="chartwrap">${trendChart(series, months)}<div id="tip" class="tip" hidden></div></div><details><summary>Show the numbers</summary>${table}</details>`
    : '<div class="sub">The trend line starts after your second monthly run.</div>';

  // Engines
  const engines = (s.byEngine || []).map((e) => {
    const was = prev ? ((ps.byEngine || []).find((z) => z.engine === e.engine) || {}).unbrandedVisibility : null;
    return `<div class="card eng">${ring(e.unbrandedVisibility, ENGINE_COLORS[e.engine] || '#9085e9')}<div><div class="ename">${esc(engineLabel(e))}</div><div class="enum">${pctText(e.unbrandedVisibility)}</div>${delta(e.unbrandedVisibility, was, since)}</div></div>`;
  }).join('');

  // What moved, by question
  const nowQ = namedByQuestion(cur.r); const prevQ = prev ? namedByQuestion(prev.r) : {};
  const moves = Object.keys(nowQ).filter((q) => prevQ[q]).map((q) => ({ q, now: nowQ[q], was: prevQ[q], d: nowQ[q].named - prevQ[q].named }));
  const moveRow = (m) => `<div class="mv"><div class="mq">${esc(m.q)}</div><div class="sub">Named by ${m.now.named} of ${m.now.asked} engines, was ${m.was.named}</div></div>`;
  const gains = moves.filter((m) => m.d > 0).sort((a, b) => b.d - a.d).slice(0, 3);
  const losses = moves.filter((m) => m.d < 0).sort((a, b) => a.d - b.d).slice(0, 3);
  const moved = prev ? `<div class="two">
      <div class="card"><div class="lbl up">&#9650; Improved</div>${gains.map(moveRow).join('') || '<div class="sub">No question improved this month.</div>'}</div>
      <div class="card"><div class="lbl down">&#9660; Declined</div>${losses.map(moveRow).join('') || '<div class="sub">Nothing declined this month.</div>'}</div></div>` : '';

  // Who AI names
  const voice = (s.shareOfVoice || []).slice();
  const top = voice.slice(0, 5); const me = voice.find((x) => x.name === p.brand);
  if (me && !top.includes(me)) top[4] = me;
  const max = Math.max(1, ...top.map((x) => x.count));
  const rivals = top.map((x) => {
    const mine = x.name === p.brand;
    const was = prev ? ((ps.shareOfVoice || []).find((z) => z.name === x.name) || { count: 0 }).count : null;
    const ch = was === null || was === x.count ? '' : ` <span class="${x.count > was ? (mine ? 'up' : 'down') : (mine ? 'down' : 'up')}">${x.count > was ? '&#9650;' : '&#9660;'} ${Math.abs(x.count - was)}</span>`;
    return `<div class="bar"><div class="bname">${esc(x.name)}${mine ? ' (you)' : ''}</div><div class="btrack"><div class="bfill${mine ? ' mine' : ''}" style="width:${(x.count / max) * 100}%"></div></div><div class="bval">${x.count} of ${s.answers}${ch}</div></div>`;
  }).join('');

  // Fix cards: five showing, the rest behind one button.
  const fixes = buildFixes(cur.r, o.state);
  const open = fixes.filter((f) => f.status !== 'done'); const done = fixes.filter((f) => f.status === 'done');
  const card = (f, i) => `<div class="card fix${i >= 5 ? ' more' : ''}"${i >= 5 ? ' hidden' : ''}>
      <div class="fhead"><span class="chip">${esc(f.kind)}</span>${f.status === 'review' ? '<span class="chip wait">Draft ready for your OK</span>' : ''}</div>
      <div class="ftitle">${esc(f.title)}</div><div class="sub">${esc(f.impact)}</div>
      <div class="fbtns"><button class="btn ghost" data-open="how">Show me how</button><button class="btn" data-open="build">${f.status === 'review' ? 'Review the draft' : 'Build it for me'}</button></div>
      <div class="panel" data-panel="how" hidden><ol>${f.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${f.link ? `<a href="${esc(f.link)}" target="_blank" rel="noopener nofollow">Open the page</a>` : ''}</div>
      <div class="panel" data-panel="build" hidden><div class="sub">${f.status === 'review' ? 'Here is the draft. Approve it and we send the finished version with paste-in steps.' : 'We write it. You approve it. Then you get the finished version with paste-in steps. If we host your site, we publish it for you.'}</div>
        <pre>${esc(f.draft)}</pre><div class="fbtns"><button class="btn ok" data-act="approve">${f.status === 'review' ? 'Approve' : 'Yes, build this'}</button>${f.status === 'review' ? '<button class="btn ghost" data-act="change">Ask for changes</button>' : ''}</div><div class="said" hidden></div></div></div>`;
  const fixCards = open.map(card).join('');
  const doneList = done.slice(0, 3).map((f) => `<div class="mv"><div class="mq">&#10003; ${esc(f.title)}</div>${f.note ? `<div class="sub">${esc(f.note)}</div>` : ''}</div>`).join('');

  const data = JSON.stringify({ months, series: series.map((x) => ({ label: x.label, color: x.color, values: x.values })), sample: !!o.sample }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>AI Visibility Dashboard: ${esc(domain)}</title><meta name="robots" content="noindex, nofollow">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#020617;color:#e2e8f0;font-family:Inter,system-ui,Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.55}
    .hdr{background:linear-gradient(135deg,#0f172a,#1e1b4b,#0f172a);border-bottom:1px solid #1e293b;padding:28px 24px}
    .in{max-width:1040px;margin:0 auto}
    .wrap{padding:24px 24px 80px}
    .eyebrow,.lbl{font-size:13px;font-weight:700;letter-spacing:1.5px;color:#a5b4fc;text-transform:uppercase}
    .lbl{margin-bottom:10px}.lbl.up{color:#4ade80}.lbl.down{color:#f87171}
    h1{font-size:30px;font-weight:900;letter-spacing:-.5px;margin:6px 0 2px}
    .meta,.sub{font-size:14px;color:#cbd5e1}
    .sample{display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:#0f172a;background:#fbbf24;border-radius:6px;padding:3px 10px}
    .card{background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:20px}
    .hero{display:grid;grid-template-columns:1.15fr 2fr;gap:16px}
    .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .engs{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
    .fixes{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    @media(max-width:860px){.hero,.two,.fixes{grid-template-columns:1fr}.engs{grid-template-columns:1fr 1fr}.tiles{grid-template-columns:1fr}}
    .big{text-align:center}.gauge{width:100%;max-width:280px}
    .gnum{font-size:44px;font-weight:900;fill:#f1f5f9}
    .headline{font-size:17px;color:#e2e8f0;margin:6px 0 10px}.headline b{color:#fff}
    .tnum{font-size:34px;font-weight:900;line-height:1.1;color:#f1f5f9}
    .tile .sub{margin-top:8px}
    .dl{display:inline-block;font-size:13px;font-weight:700;margin-top:6px}
    .up{color:#4ade80}.down{color:#f87171}.flat{color:#cbd5e1}
    .sec{font-size:20px;font-weight:800;margin:34px 0 4px}
    .secsub{font-size:14px;color:#cbd5e1;margin-bottom:14px}
    .legend{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:8px}
    .lg{font-size:13px;font-weight:600;color:#e2e8f0;display:inline-flex;align-items:center;gap:6px}
    .lg i{width:14px;height:4px;border-radius:2px;display:inline-block}
    .chartwrap{position:relative;overflow-x:auto}.trend{width:100%;min-width:720px;display:block}
    .ax{font-size:13px;fill:#cbd5e1}
    .tip{position:absolute;top:8px;background:#020617;border:1px solid #334155;border-radius:10px;padding:10px 12px;font-size:13px;pointer-events:none;min-width:150px}
    .tip b{display:block;margin-bottom:4px}.tip div{display:flex;justify-content:space-between;gap:14px;color:#e2e8f0}
    .tip i{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px}
    details{margin-top:10px;font-size:14px;color:#cbd5e1}summary{cursor:pointer;color:#a5b4fc;font-weight:600}
    table{border-collapse:collapse;margin-top:10px;width:100%}th,td{text-align:left;padding:6px 10px;border-top:1px solid #1e293b;font-size:14px;color:#e2e8f0}
    .eng{display:flex;gap:14px;align-items:center}.ring{width:56px;height:56px;flex:none}
    .ename{font-size:14px;font-weight:700;color:#e2e8f0}.enum{font-size:24px;font-weight:900;line-height:1.1}
    .mv{padding:10px 0;border-top:1px solid #1e293b}.mv:first-of-type{border-top:none}
    .mq{font-size:15px;font-weight:600;color:#e2e8f0}
    .bar{display:grid;grid-template-columns:190px 1fr 120px;gap:12px;align-items:center;padding:8px 0}
    @media(max-width:620px){.bar{grid-template-columns:1fr 90px}.btrack{grid-column:1/-1;order:3}}
    .bname{font-size:15px;font-weight:600}.btrack{height:14px}
    .bfill{height:14px;border-radius:0 4px 4px 0;background:#64748b;min-width:4px}.bfill.mine{background:#818cf8}
    .bval{font-size:14px;color:#cbd5e1;text-align:right;white-space:nowrap}
    .chip{font-size:13px;font-weight:700;color:#a5b4fc;border:1px solid #4f46e5;border-radius:999px;padding:2px 10px}
    .chip.wait{color:#fbbf24;border-color:#b45309}
    .fhead{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
    .ftitle{font-size:17px;font-weight:800;margin-bottom:4px}
    .fbtns{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
    .btn{font:inherit;font-size:14px;font-weight:700;padding:10px 16px;border-radius:10px;border:1px solid #4f46e5;background:#4f46e5;color:#fff;cursor:pointer}
    .btn.ghost{background:transparent;color:#c7d2fe;border-color:#4f46e5}.btn.ok{background:#15803d;border-color:#15803d}
    .btn:focus-visible,summary:focus-visible{outline:2px solid #fff;outline-offset:2px}
    .panel{margin-top:14px;padding-top:14px;border-top:1px solid #1e293b}
    .panel ol{padding-left:20px}.panel li{margin-bottom:6px;font-size:15px}
    pre{white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:13px;color:#e2e8f0;background:#020617;border:1px solid #1e293b;border-radius:10px;padding:12px;margin-top:10px}
    .said{margin-top:10px;font-size:14px;font-weight:600;color:#4ade80}
    a{color:#a5b4fc}
    .foot{margin-top:40px;padding-top:18px;border-top:1px solid #1e293b;font-size:13px;color:#cbd5e1}
  </style></head><body>
  <div class="hdr"><div class="in"><div class="eyebrow">AI Visibility Dashboard</div><h1>${esc(p.brand || domain)}</h1>
    <div class="meta">${esc(domain)}. ${esc(monthName(cur.at, true))} results. Next automatic run: ${esc(nextRun)}.</div>
    ${o.sample ? '<div class="sample">Sample customer, sample numbers</div>' : ''}</div></div>
  <div class="wrap in">
    <div class="hero">
      <div class="card big"><div class="lbl">Named in buyer questions</div>${gauge(score)}${delta(s.unbrandedVisibility, prev ? ps.unbrandedVisibility : null, since)}</div>
      <div><div class="headline">${headline}</div><div class="tiles">${tiles}</div></div>
    </div>

    <h2 class="sec">Your trend</h2><div class="secsub">Share of buyer questions where each AI engine named you, month by month.</div>
    <div class="card">${trend}</div>

    <h2 class="sec">By AI engine</h2><div class="secsub">The same questions, asked to each engine this month.</div>
    <div class="engs">${engines}</div>

    ${moved ? `<h2 class="sec">What moved since ${esc(since)}</h2><div class="secsub">The buyer questions that changed the most.</div>${moved}` : ''}

    <h2 class="sec">Who AI names instead</h2><div class="secsub">How many of this month's ${s.answers} answers named each company.</div>
    <div class="card">${rivals || '<div class="sub">No companies were named.</div>'}</div>

    <h2 class="sec">Your next fixes</h2><div class="secsub">Biggest impact first. For each one, do it yourself or have us build it.</div>
    <div class="fixes">${fixCards || '<div class="card sub">Nothing open. We will add new fixes after the next run.</div>'}</div>
    ${open.length > 5 ? `<div class="fbtns"><button class="btn ghost" id="more">Show ${open.length - 5} more</button></div>` : ''}
    ${doneList ? `<h2 class="sec">Done so far</h2><div class="card">${doneList}</div>` : ''}

    <div class="foot">How this works: each month we ask ${keys.length > 1 ? 'these AI answer engines' : 'an AI answer engine'} the questions your buyers ask, then check every answer for your name, the other companies named and the sources cited. AI answers vary from run to run, so watch the trend more than any single month. WinTech Partners.</div>
  </div>
  <script>
  (function(){
    var D=${data};
    document.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;
      var card=b.closest('.fix');
      if(b.id==='more'){document.querySelectorAll('.fix.more').forEach(function(x){x.hidden=false});b.parentNode.remove();return}
      if(b.dataset.open&&card){card.querySelectorAll('.panel').forEach(function(p){p.hidden=p.dataset.panel!==b.dataset.open||!p.hidden});return}
      if(b.dataset.act&&card){var s=card.querySelector('.said');s.hidden=false;
        s.textContent=(b.dataset.act==='approve'?'Got it. We will email you when it is ready.':'Got it. Reply to our email with what to change.')+(D.sample?' (Sample dashboard: nothing was sent.)':'');}
    });
    var svg=document.getElementById('trend'),tip=document.getElementById('tip'),cross=document.getElementById('cross');
    if(!svg)return;
    var W=720,L=44,R=20,n=D.months.length;
    function at(e){var r=svg.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,i=Math.round((x-L)/((W-L-R)/(n-1)));return Math.max(0,Math.min(n-1,i))}
    svg.addEventListener('mousemove',function(e){var i=at(e),x=L+i*(W-L-R)/(n-1);
      cross.setAttribute('x1',x);cross.setAttribute('x2',x);cross.setAttribute('visibility','visible');
      tip.innerHTML='<b>'+D.months[i]+'</b>'+D.series.map(function(s){return '<div><span><i style="background:'+s.color+'"></i>'+s.label+'</span><span>'+(s.values[i]==null?'n/a':s.values[i]+'%')+'</span></div>'}).join('');
      tip.hidden=false;var r=svg.getBoundingClientRect(),px=x/W*r.width;tip.style.left=(px>r.width/2?px-tip.offsetWidth-12:px+12)+'px';});
    svg.addEventListener('mouseleave',function(){tip.hidden=true;cross.setAttribute('visibility','hidden')});
  })();
  </script></body></html>`;
}

module.exports = { dashboardHtml, buildFixes };
