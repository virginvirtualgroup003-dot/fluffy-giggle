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

const slotHelpers = String.raw`
// Airport coordination status is reference data; residual player-access capacity below is a
// modeled game constraint, not a claim about live coordinator inventory. Level 3 means a slot
// must be allocated before a planned arrival or departure can be operated.
const AIRPORT_SLOT_COORDINATION = {
  LHR: { level: 3, modeledPeakSeriesPerHalfHour: 1, modeledOffPeakSeriesPerHalfHour: 2 },
  CDG: { level: 3, modeledPeakSeriesPerHalfHour: 1, modeledOffPeakSeriesPerHalfHour: 3 },
};

function airportCoordinationLevel(airportId) {
  return AIRPORT_SLOT_COORDINATION[airportId]?.level || 1;
}

function slotScarcityFactor(airportId, localMinute) {
  if (airportCoordinationLevel(airportId) !== 3) return 0;
  const morningPeak = localMinute >= 6 * 60 && localMinute < 10 * 60;
  const eveningPeak = localMinute >= 16 * 60 && localMinute < 20 * 60 + 30;
  if (morningPeak || eveningPeak) return airportId === 'LHR' ? 1.0 : 0.9;
  if (localMinute >= 10 * 60 && localMinute < 16 * 60) return airportId === 'LHR' ? 0.55 : 0.45;
  return airportId === 'LHR' ? 0.35 : 0.28;
}

function localSlotDescriptor(airportId, timestampMs, movement) {
  const ap = airport(airportId);
  const local = zonedParts(timestampMs, ap?.timeZone || 'UTC');
  const dayOfWeek = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  const minute = local.hour * 60 + local.minute;
  return {
    airportId,
    dayOfWeek,
    minute,
    bucketMinute: Math.floor(minute / 30) * 30,
    movement,
  };
}

function slotSeriesRequirements(route, referenceMs = Date.UTC(2026, 5, 7, 12, 0, 0)) {
  const type = aircraftType(route.aircraftTypeId);
  if (!type) return [];
  const origin = airport(route.originId);
  const distanceKm = distanceBetween(route.originId, route.destId);
  const blockMs = blockTimeHours(distanceKm, type.cruiseKmh) * 3600000;
  const turnaroundMs = (type.turnaround || 30) * 60000;
  const reference = new Date(referenceMs);
  const sunday = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() - reference.getUTCDay());
  const requirements = [];

  (route.schedule || []).forEach(slot => {
    const date = new Date(sunday + slot.dayOfWeek * DAY_MS);
    const outboundDeparture = zonedLocalToUtcMs(
      date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
      Math.floor(slot.minute / 60), slot.minute % 60, origin?.timeZone || 'UTC',
    );
    const outboundArrival = outboundDeparture + blockMs;
    const returnDeparture = outboundArrival + turnaroundMs;
    const returnArrival = returnDeparture + blockMs;
    [
      localSlotDescriptor(route.originId, outboundDeparture, 'DEPARTURE'),
      localSlotDescriptor(route.destId, outboundArrival, 'ARRIVAL'),
      localSlotDescriptor(route.destId, returnDeparture, 'DEPARTURE'),
      localSlotDescriptor(route.originId, returnArrival, 'ARRIVAL'),
    ].forEach(requirement => {
      if (airportCoordinationLevel(requirement.airportId) === 3) requirements.push(requirement);
    });
  });
  return requirements;
}

function modeledSlotBucketCapacity(requirement) {
  const config = AIRPORT_SLOT_COORDINATION[requirement.airportId];
  if (!config || config.level !== 3) return Infinity;
  const scarcity = slotScarcityFactor(requirement.airportId, requirement.minute);
  return scarcity >= 0.8 ? config.modeledPeakSeriesPerHalfHour : config.modeledOffPeakSeriesPerHalfHour;
}

function slotRequirementKey(requirement) {
  return [requirement.airportId, requirement.dayOfWeek, requirement.bucketMinute, requirement.movement].join('|');
}

function ensureSlotPortfolio(state) {
  state.operations = state.operations || {};
  state.operations.slotAllocations = state.operations.slotAllocations || [];
  return state.operations.slotAllocations;
}

function canReserveRouteSlots(state, route, excludingRouteId = null) {
  const portfolio = ensureSlotPortfolio(state);
  const existing = excludingRouteId ? portfolio.filter(a => a.routeId !== excludingRouteId) : portfolio;
  const requirements = slotSeriesRequirements(route, state.meta?.lastProcessedAt || Date.now());
  const proposedCounts = {};
  for (const requirement of requirements) {
    const key = slotRequirementKey(requirement);
    proposedCounts[key] = (proposedCounts[key] || 0) + 1;
    const occupied = existing.filter(a => slotRequirementKey(a) === key).length;
    if (occupied + proposedCounts[key] > modeledSlotBucketCapacity(requirement)) {
      return { ok: false, requirement, requirements };
    }
  }
  return { ok: true, requirements };
}

function reserveRouteSlots(state, route, requirements = null) {
  const portfolio = ensureSlotPortfolio(state);
  const needed = requirements || slotSeriesRequirements(route, state.meta?.lastProcessedAt || Date.now());
  needed.forEach(requirement => portfolio.push({ ...requirement, routeId: route.id, seasonallyAllocated: true }));
  return needed.length;
}
`;

if (!source.includes('function airportCoordinationLevel(')) {
  const marker = 'function validateRoutePlan({ originId, destId, aircraftTypeId, departMinute }) {';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('slot helper insertion marker missing');
  source = source.slice(0, at) + slotHelpers + '\n' + source.slice(at);
}

replaceOnce(
  `    orders: [], // pending aircraft deliveries\n    finance: {`,
  `    orders: [], // pending aircraft deliveries\n    operations: { activeFlights: 0, completedFlights: 0, cancelledFlights: 0, delayedFlights: 0, totalPassengers: 0, activeFlightWindows: [], slotAllocations: [] },\n    finance: {`,
  'operations initialization',
);

replaceFunction('actionOpenRoute', String.raw`
function actionOpenRoute(state, { originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy, departMinute }) {
  const s = structuredCloneLite(state);
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
    s.lastActionError = `Capacité de créneau indisponible à ${slotCheck.requirement.airportId} sur ce bucket coordonné.`;
    return s;
  }

  delete s.lastActionError;
  s.company.nextRouteSerial += 1;
  s.routes.push(candidate);
  reserveRouteSlots(s, candidate, slotCheck.requirements);
  return s;
}
`);

replaceFunction('actionSetFrequency', String.raw`
function actionSetFrequency(state, routeId, frequencyPerWeek) {
  const s = structuredCloneLite(state);
  const r = s.routes.find(x => x.id === routeId);
  if (!r) return s;
  const candidate = { ...r, frequencyPerWeek, schedule: buildWeeklySchedule(frequencyPerWeek, r.schedule[0]?.minute ?? 480) };
  const slotCheck = canReserveRouteSlots(s, candidate, routeId);
  if (!slotCheck.ok) {
    s.lastActionError = `Capacité de créneau indisponible à ${slotCheck.requirement.airportId} pour cette hausse de fréquence.`;
    return s;
  }
  delete s.lastActionError;
  r.frequencyPerWeek = candidate.frequencyPerWeek;
  r.schedule = candidate.schedule;
  const portfolio = ensureSlotPortfolio(s);
  s.operations.slotAllocations = portfolio.filter(a => a.routeId !== routeId);
  reserveRouteSlots(s, r, slotCheck.requirements);
  return s;
}
`);

fs.writeFileSync(file, source);
console.log('Applied AeroDesk realism phase 8: coordinated airport slot series.');
