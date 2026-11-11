// Local test run for the AI Visibility module.
// Usage: node scripts/run-visibility.js rainnetworks.com [questions] [runs] [model]
// Needs OPENROUTER_API_KEY in .env. Add "--json" to print the full result.
require('dotenv').config();
const { runVisibility } = require('../lib/visibility');

const args = process.argv.slice(2).filter((a) => a !== '--json');
const [url, questions, runs, model] = args;
if (!url) { console.error('Usage: node scripts/run-visibility.js <url> [questions] [runs] [model]'); process.exit(1); }

const opts = { questions: Number(questions) || 10, runs: Number(runs) || 1 };
if (model) opts.model = model;

runVisibility(url, opts).then((r) => {
  if (process.argv.includes('--json')) return console.log(JSON.stringify(r, null, 2));
  const s = r.summary;
  console.log(`\n${r.profile.brand} (${r.profile.domain})  engine: ${r.model}`);
  console.log(`Category: ${r.profile.category}`);
  console.log(`\nVisibility:      ${s.visibility}% of ${s.answers} answers mention the brand`);
  console.log(`  unbranded:     ${s.unbrandedVisibility}%   branded: ${s.brandedVisibility}%`);
  console.log(`Own site cited:  ${s.citationRate}% of answers`);
  console.log(`Sentiment:       ${s.positiveSentiment === null ? 'n/a (never mentioned)' : s.positiveSentiment + '% positive when mentioned'}`);
  console.log('\nShare of voice:'); s.shareOfVoice.forEach((x) => console.log(`  ${String(x.share).padStart(5)}%  ${x.name}`));
  console.log('\nTop cited sources:'); s.topSources.forEach((x) => console.log(`  ${String(x.share).padStart(5)}%  ${x.name}`));
  console.log('\nBy intent:'); Object.entries(s.byIntent).forEach(([k, v]) => console.log(`  ${k}: ${v.mentioned}/${v.asked}`));
  console.log('\nMissed questions:'); s.missed.forEach((q) => console.log('  - ' + q));
  if (r.errors.length) { console.log('\nErrors:'); r.errors.forEach((e) => console.log(`  - ${e.q}: ${e.error}`)); }
  console.log(`\nCost: $${r.cost}`);
}).catch((e) => { console.error('Failed: ' + e.message); process.exit(1); });
