// HTML report page for one AI Visibility run (served at /visibility/:id).
// Small text stays at 13px or larger and at 4.5:1 contrast or better on the dark background.

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function pctColor(p) { return p >= 50 ? '#22c55e' : p >= 20 ? '#f59e0b' : '#f87171'; }
function pctText(p) { return p === null || p === undefined ? 'n/a' : p + '%'; }

function visibilityReportHtml(rec) {
  const r = typeof rec.result === 'string' ? JSON.parse(rec.result) : rec.result;
  const s = r.summary || {}; const p = r.profile || {}; const rows = r.rows || [];
  const when = new Date(rec.created_at).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
  const unb = s.unbrandedVisibility;

  const voice = (s.shareOfVoice || []).map((x) => {
    const mine = x.name === p.brand;
    return `<div class="row"><span class="name"${mine ? ' style="color:#22c55e;font-weight:800"' : ''}>${esc(x.name)}${mine ? ' (you)' : ''}</span><span class="num">named in ${x.count} of ${s.answers} answers</span></div>`;
  }).join('');
  const sources = (s.topSources || []).map((x) =>
    `<div class="row"><span class="name">${esc(x.name)}</span><span class="num">cited in ${x.count} of ${s.answers} answers</span></div>`).join('');
  const questions = rows.map((x) => {
    const hit = x.score && x.score.mentioned;
    const others = ((x.score && x.score.brands) || []).filter((b) => b !== p.brand).slice(0, 5).join(', ');
    return `<div class="q"><div class="qhead"><span class="tag" style="color:${hit ? '#22c55e' : '#f87171'};border-color:${hit ? '#22c55e' : '#f87171'}">${hit ? 'NAMED' : 'NOT NAMED'}</span>` +
      `${x.branded ? '<span class="tag" style="color:#a5b4fc;border-color:#a5b4fc">ASKED BY NAME</span>' : ''}</div>` +
      `<div class="qtext">${esc(x.q)}</div>${others ? `<div class="qsub">AI named: ${esc(others)}</div>` : ''}</div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>AI Visibility Report: ${esc(rec.domain)}</title><meta name="robots" content="noindex, nofollow">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#020617;color:#e2e8f0;font-family:Inter,system-ui,Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.6}
    .hdr{background:linear-gradient(135deg,#0f172a,#1e1b4b,#0f172a);border-bottom:1px solid #1e293b;padding:32px 24px}
    .hdr-in,.wrap{max-width:820px;margin:0 auto}
    .wrap{padding:24px 24px 90px}
    .eyebrow{font-size:13px;font-weight:700;letter-spacing:2px;color:#a5b4fc;text-transform:uppercase}
    h1{font-size:32px;font-weight:900;letter-spacing:-1px;margin:8px 0 4px;color:#e2e8f0}
    .meta{font-size:14px;color:#cbd5e1}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    @media(max-width:680px){.grid{grid-template-columns:1fr}}
    .card{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:20px}
    .lbl{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a5b4fc;margin-bottom:8px}
    .stat{font-size:40px;font-weight:900;line-height:1.1}
    .sub{font-size:14px;color:#cbd5e1;margin-top:6px}
    .sec{font-size:20px;font-weight:800;margin:32px 0 6px}
    .secsub{font-size:14px;color:#cbd5e1;margin-bottom:14px}
    .row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #1e293b;font-size:15px}
    .row:first-child{border-top:none}
    .name{color:#e2e8f0;font-weight:600}
    .num{color:#cbd5e1;font-size:14px;white-space:nowrap}
    .q{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:14px 18px;margin-bottom:10px}
    .qhead{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}
    .tag{font-size:12px;font-weight:700;letter-spacing:1px;padding:2px 8px;border:1px solid;border-radius:6px}
    .qtext{font-size:15px;color:#e2e8f0;font-weight:600}
    .qsub{font-size:14px;color:#cbd5e1;margin-top:4px}
    .dl{position:fixed;bottom:24px;right:24px;padding:14px 24px;font-size:14px;font-weight:700;border-radius:12px;border:none;background:#6366f1;color:#fff;cursor:pointer;font-family:inherit}
    .foot{margin-top:40px;padding-top:20px;border-top:1px solid #1e293b;font-size:13px;color:#cbd5e1}
    @media print{.dl{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <div class="hdr"><div class="hdr-in"><div class="eyebrow">AI Visibility</div><h1>${esc(p.brand || rec.domain)}</h1>
    <div class="meta">Do AI answer engines name you when buyers ask? ${esc(rec.domain)}, ${esc(when)}</div></div></div>
  <div class="wrap">
    <div class="grid">
      <div class="card"><div class="lbl">Buyer questions</div><div class="stat" style="color:${pctColor(unb || 0)}">${pctText(unb)}</div><div class="sub">of answers named you when the buyer did not know your name</div></div>
      <div class="card"><div class="lbl">Asked by name</div><div class="stat" style="color:${pctColor(s.brandedVisibility || 0)}">${pctText(s.brandedVisibility)}</div><div class="sub">of answers knew you when the buyer asked about you directly</div></div>
      <div class="card"><div class="lbl">Your site cited</div><div class="stat" style="color:${pctColor(s.citationRate || 0)}">${pctText(s.citationRate)}</div><div class="sub">of answers used your website as a source</div></div>
    </div>
    <h2 class="sec">Who AI names</h2><div class="secsub">The companies the answers recommended, most often first.</div>
    <div class="card">${voice || '<div class="sub">No companies were named.</div>'}</div>
    <h2 class="sec">Where AI gets its answers</h2><div class="secsub">The websites cited most. These are the places to earn a mention.</div>
    <div class="card">${sources || '<div class="sub">No sources were cited.</div>'}</div>
    <h2 class="sec">The questions we asked</h2><div class="secsub">${rows.length} questions, each asked once with live web search on.</div>
    ${questions}
    <div class="foot">How this works: we asked an AI answer engine (${esc(r.model || '')}) each question the way a buyer would, then checked every answer for your name, the other companies named, and the sources cited. AI answers vary from run to run, so treat one run as a snapshot, not a guarantee. Generated by WinTech Partners, ${esc(when)}.</div>
  </div>
  <button class="dl" onclick="window.print()">Download PDF</button>
  </body></html>`;
}

module.exports = { visibilityReportHtml };
