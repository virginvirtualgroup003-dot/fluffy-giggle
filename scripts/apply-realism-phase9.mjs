import fs from 'node:fs';

const file = 'aerodesk.jsx';
let source = fs.readFileSync(file, 'utf8');

function replaceFunction(name, replacement) {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const parenStart = source.indexOf('(', start);
  let parenDepth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < source.length; i += 1) {
    if (source[i] === '(') parenDepth += 1;
    else if (source[i] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { parenEnd = i; break; }
    }
  }
  const brace = source.indexOf('{', parenEnd);
  let depth = 0;
  let end = -1;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) throw new Error(`Closing brace not found: ${name}`);
  source = source.slice(0, start) + replacement.trim() + source.slice(end);
}

function replaceOnce(oldText, newText, label) {
  const at = source.indexOf(oldText);
  if (at < 0) throw new Error(`Pattern not found: ${label}`);
  if (source.indexOf(oldText, at + oldText.length) >= 0) throw new Error(`Pattern not unique: ${label}`);
  source = source.slice(0, at) + newText + source.slice(at + oldText.length);
}

const availabilityHelpers = String.raw`
// Commercial availability is deliberately separate from the technical catalogue. A type may
// exist for planning/reference purposes without being certificated or delivered to airlines yet.
const AIRCRAFT_COMMERCIAL_OVERRIDES = {
  '777-9': {
    available: false,
    status: 'CERTIFICATION_PENDING',
    reason: 'Certification en cours ; première livraison commerciale annoncée pour 2027.',
  },
};

function aircraftCommercialStatus(typeId, timestampMs = Date.now()) {
  const type = aircraftType(typeId);
  if (!type) return { available: false, status: 'UNKNOWN', reason: 'Type avion inconnu.' };
  const override = AIRCRAFT_COMMERCIAL_OVERRIDES[typeId];
  if (override) return { ...override };
  return { available: true, status: 'IN_SERVICE', reason: null };
}

function commerciallyAvailableAircraftTypes(timestampMs = Date.now()) {
  return AIRCRAFT_TYPES.filter(type => aircraftCommercialStatus(type.id, timestampMs).available);
}
`;

if (!source.includes('function aircraftCommercialStatus(')) {
  const marker = 'function haversineKm(a, b) {';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('commercial availability insertion marker missing');
  source = source.slice(0, at) + availabilityHelpers + '\n' + source.slice(at);
}

replaceFunction('pickAircraftForDistance', String.raw`
function pickAircraftForDistance(d, strategy) {
  const availableTypes = commerciallyAvailableAircraftTypes();
  const candidates = availableTypes.filter(t => t.rangeKm >= d * 1.15);
  const pool = candidates.length ? candidates : availableTypes.filter(t => t.category?.startsWith('WIDEBODY')).slice(-2);
  if (!pool.length) return availableTypes[availableTypes.length - 1];
  if (strategy === 'REGIONAL') return pool[0];
  if (d < 2000) return pool.find(t => t.category === 'NARROWBODY' || t.category === 'REGIONAL') || pool[0];
  return pool[Math.floor(pool.length / 2)];
}
`);

replaceFunction('actionBuyAircraft', String.raw`
function actionBuyAircraft(state, typeId, ownership) {
  const s = structuredCloneLite(state);
  const type = aircraftType(typeId);
  if (!type) return { state: s, error: 'Type avion inconnu.' };
  const referenceMs = s.meta?.lastProcessedAt || (s.meta?.currentTime ? Date.parse(s.meta.currentTime) : Date.now());
  const commercialStatus = aircraftCommercialStatus(typeId, referenceMs);
  if (!commercialStatus.available) {
    return { state: s, error: type.name + ' indisponible : ' + commercialStatus.reason };
  }
  const leadDays = deliveryLeadDays(type, ownership);

  if (ownership === 'OWNED') {
    const equityShare = 0.15;
    const downPayment = type.price * equityShare;
    if (s.company.cash < downPayment) return { state: s, error: 'Trésorerie insuffisante pour l’apport de financement.' };
    s.company.cash -= downPayment;
    const principal = type.price - downPayment;
    const annualRate = clamp(0.057 + Math.max(0, 60 - s.company.reputation) * 0.0008 + (s.company.cash < 10e6 ? 0.012 : 0), 0.05, 0.105);
    const weeklyRate = Math.pow(1 + annualRate, 1 / 52) - 1;
    const termWeeks = 624;
    const annuityFactor = weeklyRate / (1 - Math.pow(1 + weeklyRate, -termWeeks));
    s.finance.loans.push({
      id: 'L' + Date.now() % 100000, principal, weeklyRate, annualRate,
      remainingWeeks: termWeeks, weeklyPayment: principal * annuityFactor,
      assetTypeId: typeId,
    });
  } else if (ownership === 'LEASED') {
    const deposit = type.leaseWeekly * 8;
    if (s.company.cash < deposit) return { state: s, error: 'Trésorerie insuffisante pour le dépôt de garantie du leasing.' };
    s.company.cash -= deposit;
    s.finance.leaseDeposits = (s.finance.leaseDeposits || 0) + deposit;
    addLedger(s, s.meta.week, 'LEASE_DEPOSIT', -deposit, 'Dépôt de garantie leasing ' + type.name);
  }

  s.orders.push({
    typeId, ownership, weeksLeft: leadDays / 7,
    orderedAt: referenceMs,
    deliveryAt: referenceMs + leadDays * DAY_MS,
  });
  return { state: s, error: null };
}
`);

replaceOnce(
  `{AIRCRAFT_TYPES.map(t => (`,
  `{commerciallyAvailableAircraftTypes(state.meta?.lastProcessedAt || Date.now()).map(t => (`,
  'fleet procurement UI catalogue',
);

fs.writeFileSync(file, source);
console.log('Applied AeroDesk realism phase 9: commercial fleet availability.');
