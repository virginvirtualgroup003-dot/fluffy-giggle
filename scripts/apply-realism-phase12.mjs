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

const rightsHelpers = String.raw`
// Regulatory market access is simplified to the freedoms-of-the-air concepts represented by
// the game's geography. Specific bilateral/fifth/seventh/ninth-freedom rights can be granted
// explicitly in company.trafficRights instead of assuming universal market access.
const EU_COMMUNITY_AOC_COUNTRIES = new Set([
  'France', 'Allemagne', 'Pays-Bas', 'Espagne', 'Italie', 'Belgique', 'Irlande',
  'Portugal', 'Autriche', 'Danemark', 'Suède', 'Finlande', 'Grèce', 'Pologne',
]);

function hasSpecificTrafficRight(state, originId, destId) {
  return (state?.company?.trafficRights || []).some(right =>
    (right.originId === originId && right.destId === destId) ||
    (right.originId === destId && right.destId === originId)
  );
}

function trafficRightStatus(state, originId, destId) {
  const origin = airport(originId);
  const destination = airport(destId);
  if (!origin || !destination) return { allowed: false, basis: 'REFERENCE', reason: 'Aéroport inconnu.' };
  const aocCountry = state?.company?.aocCountry || airport(state?.company?.homeBase)?.country;
  if (!aocCountry) return { allowed: false, basis: 'AOC', reason: 'Pays de l’AOC non défini.' };

  if (hasSpecificTrafficRight(state, originId, destId)) {
    return { allowed: true, basis: 'SPECIFIC_TRAFFIC_RIGHT', reason: null };
  }

  const originCountry = origin.country;
  const destinationCountry = destination.country;
  const communityCarrier = EU_COMMUNITY_AOC_COUNTRIES.has(aocCountry);
  const bothCommunity = EU_COMMUNITY_AOC_COUNTRIES.has(originCountry) && EU_COMMUNITY_AOC_COUNTRIES.has(destinationCountry);

  if (originCountry === destinationCountry) {
    if (originCountry === aocCountry) return { allowed: true, basis: 'HOME_DOMESTIC', reason: null };
    if (communityCarrier && bothCommunity) return { allowed: true, basis: 'EU_COMMUNITY_MARKET', reason: null };
    return {
      allowed: false,
      basis: 'CABOTAGE',
      reason: 'Cabotage étranger interdit sans droit ou autorisation spécifique.',
    };
  }

  if (originCountry === aocCountry || destinationCountry === aocCountry) {
    return { allowed: true, basis: '3RD_4TH_FREEDOM_HOME_STATE', reason: null };
  }

  if (communityCarrier && bothCommunity) {
    return { allowed: true, basis: 'EU_COMMUNITY_MARKET', reason: null };
  }

  return {
    allowed: false,
    basis: 'EXTRA_BILATERAL_RIGHT_REQUIRED',
    reason: 'Droit de trafic ou autorisation de 5e/7e liberté requis pour cette liaison hors pays de l’AOC.',
  };
}
`;

if (!source.includes('function trafficRightStatus(')) {
  const marker = 'function haversineKm(a, b) {';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('traffic rights insertion marker missing');
  source = source.slice(0, at) + rightsHelpers + '\n' + source.slice(at);
}

replaceOnce(
`      name: companyName, homeBase: homeBaseId, cash: 45e6, currency: 'USD', reputation: 50, otp: 88,
      founded: true, bankrupt: false, nextAircraftSerial: 1, nextRouteSerial: 1,`,
`      name: companyName, homeBase: homeBaseId, aocCountry: airport(homeBaseId).country, trafficRights: [],
      cash: 45e6, currency: 'USD', reputation: 50, otp: 88,
      founded: true, bankrupt: false, nextAircraftSerial: 1, nextRouteSerial: 1,`,
  'AOC state initialization',
);

replaceFunction('actionOpenRoute', String.raw`
function actionOpenRoute(state, { originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy, departMinute }) {
  const s = structuredCloneLite(state);
  if (!s.company.aocCountry) s.company.aocCountry = airport(s.company.homeBase)?.country;
  if (!Array.isArray(s.company.trafficRights)) s.company.trafficRights = [];

  const trafficRight = trafficRightStatus(s, originId, destId);
  if (!trafficRight.allowed) {
    s.lastActionError = trafficRight.reason;
    return s;
  }

  const issues = validateRoutePlan({ originId, destId, aircraftTypeId, departMinute });
  if (issues.length) {
    s.lastActionError = issues.map(issue => issue.message).join(' ');
    return s;
  }

  const id = 'R' + s.company.nextRouteSerial;
  const schedule = buildWeeklySchedule(frequencyPerWeek, departMinute);
  const candidate = { id, originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy: fareStrategy || 'COMPETITIVE', schedule, status: 'ACTIVE', history: [] };
  const slotCheck = canReserveRouteSlots(s, candidate);
  if (!slotCheck.ok) {
    s.lastActionError = 'Capacité de créneau indisponible à ' + slotCheck.requirement.airportId + ' sur ce bucket coordonné.';
    return s;
  }

  delete s.lastActionError;
  s.company.nextRouteSerial += 1;
  s.routes.push(candidate);
  reserveRouteSlots(s, candidate, slotCheck.requirements);
  return s;
}
`);

fs.writeFileSync(file, source);
console.log('Applied AeroDesk realism phase 12: AOC country and traffic rights.');
