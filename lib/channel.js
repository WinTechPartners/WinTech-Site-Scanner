// Tech channel question pack. Fixed templates per partner type so every client of the same
// type is asked the same questions, month after month (comparable trends and benchmarks).
// Placeholders: {metro} {region} {service} {vendor} {industry}. A template is skipped when the
// profile has no value for one of its placeholders.

const TYPES = {
  msp: { label: 'managed IT service provider', unbranded: [
    ['comparison', 'Who are the best managed IT service providers in {metro}?'],
    ['purchase', 'I need to outsource IT support for my {industry} business in {metro}. Who should I call?'],
    ['research', 'Which IT companies in {metro} offer {service}?'],
    ['comparison', 'Top-rated IT support companies for small businesses in {metro}'],
    ['research', 'Which {metro} IT providers specialize in {industry}?'],
    ['purchase', 'Recommend a managed service provider in {metro} with strong cybersecurity.'],
    ['comparison', 'What are the best alternatives to hiring in-house IT for a {industry} company in {metro}?'],
    ['purchase', 'Which company should I hire for {service} in {metro}?'],
    ['research', 'Which managed IT providers serve {industry} companies in {region}?'],
    ['comparison', 'Who are the leading managed service providers for {service}?'],
  ] },
  mssp: { label: 'managed security service provider', unbranded: [
    ['comparison', 'Who are the best managed security service providers in {metro}?'],
    ['purchase', 'Which company should I hire for {service} for my {industry} business?'],
    ['research', 'Which security providers offer {service} for mid-sized companies in {region}?'],
    ['comparison', 'Top managed detection and response providers for {industry} companies'],
    ['purchase', 'I need a 24/7 outsourced security operations center. Who should I consider in {region}?'],
    ['research', 'Which cybersecurity firms in {metro} help {industry} companies meet compliance requirements?'],
    ['comparison', 'What are the best alternatives to building an in-house security team for a {industry} company?'],
    ['purchase', 'Recommend a managed security provider in {metro} for a small business.'],
    ['research', 'Which MSSPs specialize in {industry}?'],
    ['comparison', 'Who are the leading providers of {service}?'],
  ] },
  si: { label: 'systems integrator', unbranded: [
    ['comparison', 'Who are the top systems integrators for {service}?'],
    ['purchase', 'Who should I hire to lead a {service} project for a {industry} company?'],
    ['research', 'Which consulting firms implement {vendor} in {region}?'],
    ['comparison', 'Best {service} implementation partners in {region}'],
    ['research', 'Which technology integrators specialize in {industry}?'],
    ['purchase', 'I need an implementation partner for {vendor}. Who are the best options?'],
    ['comparison', 'What are the best mid-sized alternatives to the big consulting firms for {service}?'],
    ['purchase', 'Recommend an IT integration firm in {metro} for {service}.'],
    ['research', 'Which firms in {metro} handle {service} for {industry} organizations?'],
    ['comparison', 'Who are the leading {vendor} partners for {industry}?'],
  ] },
  var: { label: 'IT solutions provider', unbranded: [
    ['comparison', 'Who are the best IT solutions providers and resellers in {metro}?'],
    ['purchase', 'Where can I buy {vendor} with design and implementation support in {metro}?'],
    ['research', 'Which resellers are authorized {vendor} partners in {region}?'],
    ['purchase', 'Who sells and installs {service} solutions for {industry} businesses in {metro}?'],
    ['comparison', 'Top value-added resellers for {service} in {region}'],
    ['research', 'Which IT resellers in {metro} are vendor-neutral?'],
    ['comparison', 'What are the best alternatives to buying IT hardware and software from a large national reseller in {region}?'],
    ['purchase', 'I need help choosing and procuring {service} technology for my company in {metro}. Who should I talk to?'],
    ['research', 'Which technology solution providers work with {industry} companies in {region}?'],
    ['comparison', 'Who are the leading {service} solution providers?'],
  ] },
  distributor: { label: 'technology distributor', unbranded: [
    ['purchase', 'Who distributes {vendor} in {region}?'],
    ['comparison', 'Who are the top {service} distributors for MSPs and resellers in {region}?'],
    ['research', 'Which distributors offer {service} products to resellers?'],
    ['purchase', 'Which distributor should an MSP partner with for {service} in {region}?'],
    ['comparison', 'What are the best alternatives to the large broadline distributors for {service} in {region}?'],
    ['research', 'Which distributors give MSPs the best technical support and training?'],
    ['comparison', 'Best value-added distributors for resellers in {region}'],
    ['purchase', 'Where can a reseller buy {vendor} licenses with monthly billing?'],
    ['research', 'Which distributors specialize in {service} for the channel?'],
    ['comparison', 'Who are the leading distributors of {vendor}?'],
  ] },
  vendor: { label: 'technology vendor', unbranded: [
    ['comparison', 'What are the best {service} products for {industry} companies?'],
    ['purchase', 'Which {service} solution should a small business buy?'],
    ['research', 'Who are the top {service} vendors?'],
    ['comparison', 'What are the best {service} products for MSPs to resell?'],
    ['comparison', 'What are the best alternatives to the leading {service} products?'],
    ['purchase', 'I need {service} for a mid-sized company. Which vendors should I shortlist?'],
    ['research', 'Which {service} vendors have the best partner programs?'],
    ['research', 'Which {service} tools do IT providers recommend most?'],
    ['comparison', 'Top-rated {service} software this year'],
    ['purchase', 'Which {service} vendor is best for {industry}?'],
  ] },
};

const BRANDED = [
  ['comparison', 'Is {brand} a good {label}?'],
  ['research', 'What do customers say about {brand}?'],
  ['comparison', 'How does {brand} compare to other {label}s?'],
];

// Fills one template; returns null when a needed value is missing. `turn` rotates through lists.
function fill(template, profile, label, turn) {
  const pick = (list) => (list && list.length ? list[turn % list.length] : '');
  const values = {
    brand: profile.brand, label,
    metro: profile.metro || '', region: profile.region || profile.metro || '',
    service: pick(profile.services), vendor: pick(profile.vendors), industry: pick(profile.industries),
  };
  // No known location: drop the "in {metro}" phrase and keep the question.
  if (!values.metro) template = template.replace(/ (in|near) \{metro\}/g, '');
  if (!values.region) template = template.replace(/ in \{region\}/g, '');
  let ok = true;
  const q = template.replace(/\{(\w+)\}/g, (_, k) => { if (!values[k]) ok = false; return values[k]; });
  return ok ? q : null;
}

// Returns up to n questions (about 13% branded), or [] when the type has no pack.
function channelQuestions(profile, n) {
  const type = TYPES[profile.partnerType];
  if (!type) return [];
  const brandedN = Math.max(1, Math.round(n * 0.13));
  const out = []; const seen = new Set();
  // Several passes over the templates; each pass rotates to the next service, vendor and industry.
  for (let pass = 0; pass < 6 && out.length < n - brandedN; pass++) {
    type.unbranded.forEach(([intent, t], i) => {
      if (out.length >= n - brandedN) return;
      const q = fill(t, profile, type.label, pass + i);
      if (q && !seen.has(q)) { seen.add(q); out.push({ q, intent, branded: false }); }
    });
  }
  BRANDED.slice(0, brandedN).forEach(([intent, t]) => out.push({ q: fill(t, profile, type.label, 0), intent, branded: true }));
  return out;
}

module.exports = { TYPES, channelQuestions };
