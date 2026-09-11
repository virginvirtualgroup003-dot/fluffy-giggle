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
  if (parenEnd < 0) throw new Error(`Signature end not found: ${name}`);

  const brace = source.indexOf('{', parenEnd);
  if (brace < 0) throw new Error(`Body start not found: ${name}`);
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

const helpers = String.raw`
// Structural payload reference values are rounded planning figures. They are deliberately
// separate from the published maximum-range number because maximum range is not available
// at maximum payload. The taper below approximates the payload-range tradeoff until a full
// type-specific AFM/performance implementation is introduced.
const AIRCRAFT_MAX_PAYLOAD_KG = {
  'ATR72-600': 7500,
  'E190-E2': 13500,
  'A220-300': 18500,
  'A320neo': 19000,
  'A321neo': 25300,
  'A321XLR': 25000,
  '737-8': 20500,
  '787-9': 52600,
  'A330-900': 44500,
  'A350-900': 53000,
  'A350-1000': 64000,
  '777-9': 70000,
};

function standardCheckedBaggageKg(originId, destId) {
  const origin = airport(originId);
  const destination = airport(destId);
  if (!origin || !destination) return 13;
  if (origin.country === destination.country) return 11;
  if (origin.region === 'EU' && destination.region === 'EU') return 13;
  if (origin.region !== destination.region) return 15;
  return 13;
}

function standardTrafficMassPerPassengerKg(originId, destId) {
  // EASA standard all-adult passenger mass includes hand baggage; checked baggage is added separately.
  return 84 + standardCheckedBaggageKg(originId, destId);
}

function missionPayloadLimitKg(type, distanceKm) {
  if (!type || distanceKm < 0) return 0;
  const structuralPayload = AIRCRAFT_MAX_PAYLOAD_KG[type.id] || type.seats * 105;
  if (!type.rangeKm || distanceKm > type.rangeKm) return 0;
  const rangeRatio = distanceKm / type.rangeKm;
  if (rangeRatio <= 0.65) return structuralPayload;
  const progress = clamp((rangeRatio - 0.65) / 0.35, 0, 1);
  const payloadFraction = 1 - 0.45 * progress;
  return structuralPayload * payloadFraction;
}

function payloadLimitedSeats(type, distanceKm, originId, destId) {
  const trafficMass = standardTrafficMassPerPassengerKg(originId, destId);
  if (!trafficMass) return 0;
  return Math.max(0, Math.min(type.seats, Math.floor(missionPayloadLimitKg(type, distanceKm) / trafficMass)));
}

function availableBellyCargoKg(type, distanceKm, passengers, originId, destId) {
  const trafficMass = Math.max(0, passengers) * standardTrafficMassPerPassengerKg(originId, destId);
  return Math.max(0, missionPayloadLimitKg(type, distanceKm) - trafficMass);
}
`;

if (!source.includes('function standardTrafficMassPerPassengerKg(')) {
  const marker = 'function routeHasActiveAircraft(state, route) {';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('payload helper insertion marker missing');
  source = source.slice(0, at) + helpers + '\n' + source.slice(at);
}

replaceFunction('makeProductFromRoute', String.raw`
function makeProductFromRoute(route, owner, company, legs, options = {}) {
  const oType = aircraftType(route.aircraftTypeId);
  const originId = options.originId || route.originId;
  const destId = options.destId || route.destId;
  const direction = options.direction || 'OUTBOUND';
  const dist = distanceBetween(originId, destId);
  const departSlots = options.departSlots || route.schedule.map(s => s.minute);
  const missionSeats = payloadLimitedSeats(oType, dist, originId, destId);
  return {
    key: direction === 'RETURN' ? 'P-' + route.id + '-RETURN' : 'P-' + route.id,
    owner, ownerRef: company, legs: 1, distanceKm: dist,
    freq: route.frequencyPerWeek, fareStrategy: route.fareStrategy,
    departSlots,
    totalTripHours: blockTimeHours(dist, oType.cruiseKmh),
    reputation: company.reputation, otp: company.otp,
    seats: missionSeats, nominalSeats: oType.seats, route, direction, originId, destId,
  };
}
`);

replaceFunction('makeConnectProduct', String.raw`
function makeConnectProduct(legs, owner, company, metrics = null) {
  const [l1, l2] = legs;
  const t1 = aircraftType(l1.aircraftTypeId), t2 = aircraftType(l2.aircraftTypeId);
  const d1 = distanceBetween(l1.originId, l1.destId), d2 = distanceBetween(l2.originId, l2.destId);
  const bt1 = blockTimeHours(d1, t1.cruiseKmh), bt2 = blockTimeHours(d2, t2.cruiseKmh);
  const connection = metrics || connectionScheduleMetrics(l1, l2);
  const waitHours = Number.isFinite(connection.averageWaitHours) ? connection.averageWaitHours : connection.mctHours;
  const seats1 = payloadLimitedSeats(t1, d1, l1.originId, l1.destId);
  const seats2 = payloadLimitedSeats(t2, d2, l2.originId, l2.destId);
  return {
    key: 'P-' + l1.id + '-' + l2.id, owner, ownerRef: company, legs: 2,
    distanceKm: d1 + d2,
    freq: connection.feasibleFrequency || Math.min(l1.frequencyPerWeek, l2.frequencyPerWeek),
    fareStrategy: l1.fareStrategy,
    departSlots: l1.schedule.map(s => s.minute),
    totalTripHours: bt1 + bt2 + waitHours,
    reputation: company.reputation, otp: company.otp - 6,
    seats: Math.min(seats1, seats2), route: l1, secondRoute: l2,
    mctGap: waitHours,
  };
}
`);

replaceFunction('makeProductFromCompetitorRoute', String.raw`
function makeProductFromCompetitorRoute(route, competitor) {
  const type = aircraftType(route.aircraftTypeId);
  const dist = distanceBetween(route.origin, route.dest);
  const spreadSlots = [6 * 60 + 30, 11 * 60, 15 * 60, 19 * 60 + 30, 21 * 60];
  const departSlots = Array.from({ length: Math.min(route.freq, 5) }, (_, i) => spreadSlots[i % spreadSlots.length]);
  return {
    key: 'P-' + route.id, owner: 'AI:' + competitor.id, ownerRef: competitor, legs: 1,
    distanceKm: dist, freq: route.freq, fareStrategy: route.fareStrategy,
    departSlots, totalTripHours: blockTimeHours(dist, type.cruiseKmh),
    reputation: competitor.reputation, otp: 83,
    seats: payloadLimitedSeats(type, dist, route.origin, route.dest), nominalSeats: type.seats, route,
  };
}
`);

fs.writeFileSync(file, source);
console.log('Applied AeroDesk realism phase 7: traffic mass and payload-range capacity.');
