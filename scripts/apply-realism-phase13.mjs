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

const crewHelpers = String.raw`
const CREW_DEFAULTS = {
  pilots: 12,
  cabinCrew: 24,
  reserveFraction: 0.15,
  pilotRecruitmentDays: 56,
  cabinRecruitmentDays: 28,
  pilotRecruitmentCostUSD: 15000,
  cabinRecruitmentCostUSD: 4000,
};

function ensureStaffing(state) {
  if (!state.staffing) {
    state.staffing = {
      pilots: CREW_DEFAULTS.pilots,
      cabinCrew: CREW_DEFAULTS.cabinCrew,
      reserveFraction: CREW_DEFAULTS.reserveFraction,
      pipeline: [],
    };
  }
  if (!Array.isArray(state.staffing.pipeline)) state.staffing.pipeline = [];
  if (!Number.isFinite(state.staffing.reserveFraction)) state.staffing.reserveFraction = CREW_DEFAULTS.reserveFraction;
  return state.staffing;
}

function crewLegalLimits(elapsedMs) {
  const days = Math.max(0, elapsedMs / DAY_MS);
  if (!days) return { dutyHoursPerPerson: 0, flightHoursPerPerson: 0 };
  // ORO.FTL.210 ceilings: 60 duty h/7d, 110/14d, 190/28d, and 100 flight h/28d.
  // The 28-day limits are prorated as a planning envelope to avoid scheduling the whole
  // rolling allowance into a single short period; daily FDP limits remain modeled separately.
  const dutyHoursPerPerson = Math.min(
    60 * Math.max(1, days / 7),
    110 * Math.max(1, days / 14),
    190 * Math.max(1, days / 28),
    (190 / 28) * days,
  );
  const flightHoursPerPerson = Math.min(100, (100 / 28) * days);
  return { dutyHoursPerPerson, flightHoursPerPerson };
}

function crewCapacityForPeriod(state, fromMs, toMs) {
  const staffing = ensureStaffing(state);
  const elapsed = Math.max(0, toMs - fromMs);
  const legal = crewLegalLimits(elapsed);
  const schedulableShare = clamp(1 - staffing.reserveFraction, 0.5, 1);
  return {
    pilotDutyHours: staffing.pilots * schedulableShare * legal.dutyHoursPerPerson,
    pilotFlightHours: staffing.pilots * schedulableShare * legal.flightHoursPerPerson,
    cabinDutyHours: staffing.cabinCrew * schedulableShare * legal.dutyHoursPerPerson,
    cabinFlightHours: staffing.cabinCrew * schedulableShare * legal.flightHoursPerPerson,
  };
}

function crewRequirementForRotation(type, blockHoursPerSector) {
  const base = minimumOperatingCrew(type);
  const flightHours = blockHoursPerSector * 2;
  const dutyHours = flightHours + ((type.turnaround || 30) / 60) * 2 + 1.25;
  let pilots = base.flightDeck;
  if (dutyHours > 15) pilots = Math.max(pilots, 4);
  else if (dutyHours > 12.5) pilots = Math.max(pilots, 3);
  let cabin = base.cabin;
  if (dutyHours > 14) cabin = Math.ceil(cabin * 1.25);
  return {
    pilots,
    cabin,
    dutyHours,
    flightHours,
    pilotDutyHours: pilots * dutyHours,
    pilotFlightHours: pilots * flightHours,
    cabinDutyHours: cabin * dutyHours,
    cabinFlightHours: cabin * flightHours,
  };
}

function createCrewPeriodLedger(state, fromMs, toMs) {
  const capacity = crewCapacityForPeriod(state, fromMs, toMs);
  return {
    ...capacity,
    usedPilotDutyHours: 0,
    usedPilotFlightHours: 0,
    usedCabinDutyHours: 0,
    usedCabinFlightHours: 0,
  };
}

function reserveCrewForRotation(ledger, type, blockHoursPerSector) {
  if (!ledger || !type) return false;
  const req = crewRequirementForRotation(type, blockHoursPerSector);
  const fits =
    ledger.usedPilotDutyHours + req.pilotDutyHours <= ledger.pilotDutyHours + 1e-9 &&
    ledger.usedPilotFlightHours + req.pilotFlightHours <= ledger.pilotFlightHours + 1e-9 &&
    ledger.usedCabinDutyHours + req.cabinDutyHours <= ledger.cabinDutyHours + 1e-9 &&
    ledger.usedCabinFlightHours + req.cabinFlightHours <= ledger.cabinFlightHours + 1e-9;
  if (!fits) return false;
  ledger.usedPilotDutyHours += req.pilotDutyHours;
  ledger.usedPilotFlightHours += req.pilotFlightHours;
  ledger.usedCabinDutyHours += req.cabinDutyHours;
  ledger.usedCabinFlightHours += req.cabinFlightHours;
  return true;
}

function actionHireCrew(state, { pilots = 0, cabinCrew = 0 } = {}) {
  const s = structuredCloneLite(state);
  const staffing = ensureStaffing(s);
  const pilotCount = Math.max(0, Math.floor(pilots || 0));
  const cabinCount = Math.max(0, Math.floor(cabinCrew || 0));
  if (!pilotCount && !cabinCount) return { state: s, error: 'Aucun recrutement demandé.' };
  const cost = pilotCount * CREW_DEFAULTS.pilotRecruitmentCostUSD + cabinCount * CREW_DEFAULTS.cabinRecruitmentCostUSD;
  if (s.company.cash < cost) return { state: s, error: 'Trésorerie insuffisante pour le recrutement et la qualification.' };
  const nowMs = s.meta?.lastProcessedAt || Date.now();
  const leadDays = Math.max(
    pilotCount ? CREW_DEFAULTS.pilotRecruitmentDays : 0,
    cabinCount ? CREW_DEFAULTS.cabinRecruitmentDays : 0,
  );
  s.company.cash -= cost;
  staffing.pipeline.push({ pilots: pilotCount, cabinCrew: cabinCount, cost, orderedAt: nowMs, availableAt: nowMs + leadDays * DAY_MS });
  addLedger(s, s.meta.week, 'CREW_RECRUITMENT', -cost, 'Recrutement, contrôles et qualification équipage');
  return { state: s, error: null };
}

function processCrewPipeline(state, nowMs) {
  const staffing = ensureStaffing(state);
  staffing.pipeline = staffing.pipeline.filter(batch => {
    if (batch.availableAt > nowMs) return true;
    staffing.pilots += batch.pilots || 0;
    staffing.cabinCrew += batch.cabinCrew || 0;
    state.log.push({ week: state.meta.week, type: 'CREW', text: 'Nouveaux équipages qualifiés et disponibles pour le planning.' });
    return false;
  });
  return staffing;
}
`;

if (!source.includes('function crewCapacityForPeriod(')) {
  const marker = 'function minimumOperatingCrew(type) {';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('crew helper insertion marker missing');
  source = source.slice(0, at) + crewHelpers + '\n' + source.slice(at);
}

replaceOnce(
`    operations: { activeFlights: 0, completedFlights: 0, cancelledFlights: 0, delayedFlights: 0, totalPassengers: 0, activeFlightWindows: [], slotAllocations: [] },
    finance: {`,
`    operations: { activeFlights: 0, completedFlights: 0, cancelledFlights: 0, delayedFlights: 0, totalPassengers: 0, activeFlightWindows: [], slotAllocations: [] },
    staffing: { pilots: CREW_DEFAULTS.pilots, cabinCrew: CREW_DEFAULTS.cabinCrew, reserveFraction: CREW_DEFAULTS.reserveFraction, pipeline: [] },
    finance: {`,
  'staffing initialization',
);

replaceFunction('buildOperationalPlan', String.raw`
function buildOperationalPlan(state, route, fromMs, toMs, rng = Math.random, sharedCrewLedger = null) {
  const type = aircraftType(route.aircraftTypeId);
  const distanceKm = distanceBetween(route.originId, route.destId);
  const blockH = blockTimeHours(distanceKm, type.cruiseKmh);
  const turnaroundH = (type.turnaround || 30) / 60;
  const scheduledRotationStarts = scheduledDepartureTimesBetween(route, fromMs, toMs);

  const legalRotations = [];
  let curfewRotations = 0;
  scheduledRotationStarts.forEach(outboundDeparture => {
    const outboundArrival = outboundDeparture + blockH * 3600000;
    const returnDeparture = outboundArrival + turnaroundH * 3600000;
    const returnArrival = returnDeparture + blockH * 3600000;
    const blocked =
      movementBlockedByCurfew(route.originId, outboundDeparture) ||
      movementBlockedByCurfew(route.destId, outboundArrival) ||
      movementBlockedByCurfew(route.destId, returnDeparture) ||
      movementBlockedByCurfew(route.originId, returnArrival);
    if (blocked) curfewRotations += 1;
    else legalRotations.push({ outboundDeparture, outboundArrival, returnDeparture, returnArrival });
  });

  const assigned = state.fleet.filter(f =>
    f.assignedRouteId === route.id && f.status === 'ACTIVE' && f.typeId === route.aircraftTypeId
  );
  const elapsedDays = Math.max(0, (toMs - fromMs) / DAY_MS);
  const serviceHoursPerRotation = blockH * 2 + turnaroundH * 2;
  const capacityHours = assigned.length * MAX_AIRCRAFT_SERVICE_HOURS_PER_DAY * elapsedDays;
  const utilizationCapacityRotations = serviceHoursPerRotation > 0
    ? Math.floor(capacityHours / serviceHoursPerRotation + 1e-9)
    : 0;
  const candidateRotations = legalRotations.slice(0, utilizationCapacityRotations);
  const utilizationCancelledRotations = Math.max(0, legalRotations.length - candidateRotations.length);
  const avgCondition = assigned.length ? assigned.reduce((sum, f) => sum + f.condition, 0) / assigned.length : 0;
  const crewLedger = sharedCrewLedger || createCrewPeriodLedger(state, fromMs, toMs);

  const outboundDepartureTimes = [];
  const returnDepartureTimes = [];
  const operatedDepartureTimes = [];
  let technicalCancelledRotations = 0;
  let crewCancelledRotations = 0;
  let delayedFlights = 0;

  candidateRotations.forEach(rotation => {
    if (!reserveCrewForRotation(crewLedger, type, blockH)) {
      crewCancelledRotations += 1;
      return;
    }
    const congestion = (
      airportCongestionFactor(route.originId, rotation.outboundDeparture) +
      airportCongestionFactor(route.destId, rotation.outboundArrival) +
      airportCongestionFactor(route.destId, rotation.returnDeparture) +
      airportCongestionFactor(route.originId, rotation.returnArrival)
    ) / 4;
    const cancellationRisk = clamp(0.0015 + Math.max(0, 75 - avgCondition) * 0.0008 + congestion * 0.0045, 0.0015, 0.08);
    const delayRisk = clamp(0.025 + congestion * 0.13 + Math.max(0, 85 - avgCondition) * 0.002, 0.03, 0.40);

    if (rng() < cancellationRisk) {
      technicalCancelledRotations += 1;
      return;
    }

    outboundDepartureTimes.push(rotation.outboundDeparture);
    returnDepartureTimes.push(rotation.returnDeparture);
    operatedDepartureTimes.push(rotation.outboundDeparture, rotation.returnDeparture);
    if (rng() < delayRisk) delayedFlights += 1;
    if (rng() < delayRisk) delayedFlights += 1;
  });

  const scheduledRotations = scheduledRotationStarts.length;
  const operatedRotations = outboundDepartureTimes.length;
  const cancelledRotations = curfewRotations + utilizationCancelledRotations + technicalCancelledRotations + crewCancelledRotations;

  return {
    scheduledRotations,
    operatedRotations,
    cancelledRotations,
    scheduledFlights: scheduledRotations * 2,
    operatedFlights: operatedRotations * 2,
    cancelledFlights: cancelledRotations * 2,
    delayedFlights,
    curfewCancellations: curfewRotations * 2,
    utilizationCancellations: utilizationCancelledRotations * 2,
    technicalCancellations: technicalCancelledRotations * 2,
    crewCancellations: crewCancelledRotations * 2,
    outboundDepartureTimes,
    returnDepartureTimes,
    operatedDepartureTimes: operatedDepartureTimes.sort((a, b) => a - b),
    blockHoursPerFlight: blockH,
    serviceHoursPerFlight: blockH + turnaroundH,
    serviceHoursPerRotation,
    utilizationCapacity: utilizationCapacityRotations * 2,
    utilizationCapacityRotations,
  };
}
`);

replaceOnce(
`    updateMacroRealTime(state, rng, elapsed);
    processDeliveriesRealTime(state, next);
    processRealTimeDay(state, cursor, next, rng);`,
`    updateMacroRealTime(state, rng, elapsed);
    processDeliveriesRealTime(state, next);
    processCrewPipeline(state, next);
    processRealTimeDay(state, cursor, next, rng);`,
  'crew pipeline processing',
);

replaceOnce(
`  const routeOperationalPlans = {};
  state.routes.filter(r => r.status === 'ACTIVE').forEach(r => {
    routeOperationalPlans[r.id] = buildOperationalPlan(state, r, fromMs, toMs, rng);
  });`,
`  ensureStaffing(state);
  const crewLedger = createCrewPeriodLedger(state, fromMs, toMs);
  const routeOperationalPlans = {};
  state.routes.filter(r => r.status === 'ACTIVE').forEach(r => {
    routeOperationalPlans[r.id] = buildOperationalPlan(state, r, fromMs, toMs, rng, crewLedger);
  });`,
  'shared crew ledger across routes',
);

replaceOnce(
`    (plan.technicalCancellations || 0) + (plan.utilizationCancellations || 0) + (plan.curfewCancellations || 0),`,
`    (plan.technicalCancellations || 0) + (plan.utilizationCancellations || 0) + (plan.crewCancellations || 0) + (plan.curfewCancellations || 0),`,
  'crew cancellations passenger rights',
);

replaceFunction('v3ProcessRecurringCosts', String.raw`
function v3ProcessRecurringCosts(state, elapsedMs) {
  const days = elapsedMs / DAY_MS;
  const activeRoutes = state.routes.filter(r => r.status === 'ACTIVE').length;
  const aircraftCount = state.fleet.length;
  const staffing = ensureStaffing(state);

  // Loaded payroll: flight/cabin crew now scale with actual establishment rather than being
  // conjured per flight. Ground/administrative labor remains a compact fleet/network proxy.
  const flightCrewPayroll = staffing.pilots * 420 * days;
  const cabinCrewPayroll = staffing.cabinCrew * 190 * days;
  const groundAndAdmin = (
    AERODESK_V3.laborDailyBaseUSD +
    aircraftCount * AERODESK_V3.laborPerAircraftDailyUSD +
    activeRoutes * AERODESK_V3.laborPerRouteDailyUSD
  ) * days;
  const labor = flightCrewPayroll + cabinCrewPayroll + groundAndAdmin;

  const insuredValue = fleetValue(state);
  const insurance = insuredValue * AERODESK_V3.insuranceAnnualRate * days / 365;

  v3BookAccounting(state, 'laborExpense', labor);
  v3BookAccounting(state, 'insuranceExpense', insurance);

  return { labor, insurance };
}
`);

fs.writeFileSync(file, source);
console.log('Applied AeroDesk realism phase 13: finite crew establishment, FTL capacity and recruitment pipeline.');
