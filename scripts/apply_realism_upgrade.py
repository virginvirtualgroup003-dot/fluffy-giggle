from pathlib import Path
import re

path = Path('aerodesk.jsx')
source = path.read_text()


def replace_once(label, old, new):
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one occurrence, found {count}')
    source = source.replace(old, new, 1)


def regex_once(label, pattern, replacement):
    global source
    updated, count = re.subn(pattern, lambda m: replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected one regex match, found {count}')
    source = updated


airport_ops = r'''
const AIRPORT_OPERATIONAL_DATA = {
  LHR: { timeZone: 'Europe/London', runwayM: 3902 },
  CDG: { timeZone: 'Europe/Paris', runwayM: 4215 },
  FRA: { timeZone: 'Europe/Berlin', runwayM: 4000, curfewWindow: { startMinute: 23 * 60, endMinute: 5 * 60 } },
  AMS: { timeZone: 'Europe/Amsterdam', runwayM: 3800 },
  MAD: { timeZone: 'Europe/Madrid', runwayM: 4348 },
  FCO: { timeZone: 'Europe/Rome', runwayM: 3902 },
  JFK: { timeZone: 'America/New_York', runwayM: 4423 },
  LAX: { timeZone: 'America/Los_Angeles', runwayM: 3685 },
  ORD: { timeZone: 'America/Chicago', runwayM: 3962 },
  MIA: { timeZone: 'America/New_York', runwayM: 3962 },
  YYZ: { timeZone: 'America/Toronto', runwayM: 3389 },
  GRU: { timeZone: 'America/Sao_Paulo', runwayM: 3700 },
  EZE: { timeZone: 'America/Argentina/Buenos_Aires', runwayM: 3300 },
  DXB: { timeZone: 'Asia/Dubai', runwayM: 4447 },
  DEL: { timeZone: 'Asia/Kolkata', runwayM: 4430 },
  SIN: { timeZone: 'Asia/Singapore', runwayM: 4000 },
  HKG: { timeZone: 'Asia/Hong_Kong', runwayM: 3800 },
  NRT: { timeZone: 'Asia/Tokyo', runwayM: 4000, curfewWindow: { startMinute: 0, endMinute: 6 * 60 } },
  ICN: { timeZone: 'Asia/Seoul', runwayM: 3750 },
  SYD: { timeZone: 'Australia/Sydney', runwayM: 3962, curfewWindow: { startMinute: 23 * 60, endMinute: 6 * 60 } },
  JNB: { timeZone: 'Africa/Johannesburg', runwayM: 4421 },
  CAI: { timeZone: 'Africa/Cairo', runwayM: 4000 },
  LOS: { timeZone: 'Africa/Lagos', runwayM: 3900 },
  AKL: { timeZone: 'Pacific/Auckland', runwayM: 3635 },
};

AIRPORTS.forEach(a => {
  const ops = AIRPORT_OPERATIONAL_DATA[a.id] || { timeZone: 'UTC', runwayM: 3000 };
  Object.assign(a, ops);
  a.curfew = Boolean(ops.curfewWindow);
});
'''
replace_once(
    'airport operational reference data',
    "];\n\nconst AIRCRAFT_TYPES = [",
    "];\n" + airport_ops + "\nconst AIRCRAFT_TYPES = [",
)

regex_once(
    'hemisphere-aware seasonality',
    r"function seasonalFactor\(seg, weekOfYear\) \{.*?\n\}",
    r'''function seasonalFactor(seg, weekOfYear, latitude = 45) {
  const shiftedWeek = latitude < 0 ? ((weekOfYear + 25) % 52) + 1 : weekOfYear;
  const phase = (shiftedWeek / 52) * 2 * Math.PI;
  if (seg === 'LEISURE') return 1 + 0.28 * Math.sin(phase - Math.PI / 2.3);
  if (seg === 'VFR') return 1 + 0.22 * Math.sin(phase - Math.PI / 1.6);
  return 1 + 0.08 * Math.sin(phase);
}''',
)
replace_once(
    'seasonality latitude use',
    "  const seasonal = seasonalFactor(seg, weekOfYear);",
    "  const seasonal = seasonalFactor(seg, weekOfYear, (o.lat + d.lat) / 2);",
)

regex_once(
    'local time and operational planning layer',
    r"function scheduledDeparturesBetween\(route, fromMs, toMs\) \{.*?\n\}\n\nfunction prorateWeekly",
    r'''function zonedParts(timestampMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestampMs));
  const values = {};
  parts.forEach(part => { if (part.type !== 'literal') values[part.type] = Number(part.value); });
  return values;
}

function zonedLocalToUtcMs(year, month, day, hour, minute, timeZone) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = desired;
  for (let i = 0; i < 4; i += 1) {
    const actualParts = zonedParts(guess, timeZone);
    const actual = Date.UTC(actualParts.year, actualParts.month - 1, actualParts.day, actualParts.hour, actualParts.minute, 0, 0);
    const delta = desired - actual;
    guess += delta;
    if (Math.abs(delta) < 60_000) break;
  }
  return guess;
}

function minuteFallsInWindow(minute, window) {
  if (!window) return false;
  if (window.startMinute < window.endMinute) return minute >= window.startMinute && minute < window.endMinute;
  return minute >= window.startMinute || minute < window.endMinute;
}

function movementBlockedByCurfew(airportId, timestampMs) {
  const ap = airport(airportId);
  if (!ap?.curfewWindow) return false;
  const local = zonedParts(timestampMs, ap.timeZone);
  return minuteFallsInWindow(local.hour * 60 + local.minute, ap.curfewWindow);
}

function scheduledDepartureTimesBetween(route, fromMs, toMs) {
  const origin = airport(route.originId);
  const timeZone = origin?.timeZone || 'UTC';
  const fromLocal = zonedParts(fromMs, timeZone);
  const toLocal = zonedParts(toMs, timeZone);
  const startDay = Date.UTC(fromLocal.year, fromLocal.month - 1, fromLocal.day) - DAY_MS;
  const endDay = Date.UTC(toLocal.year, toLocal.month - 1, toLocal.day) + DAY_MS;
  const departures = [];

  for (let daySerial = startDay; daySerial <= endDay; daySerial += DAY_MS) {
    const localDate = new Date(daySerial);
    const dow = localDate.getUTCDay();
    (route.schedule || []).forEach(slot => {
      if (slot.dayOfWeek !== dow) return;
      const departure = zonedLocalToUtcMs(
        localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, localDate.getUTCDate(),
        Math.floor(slot.minute / 60), slot.minute % 60, timeZone,
      );
      if (departure > fromMs && departure <= toMs) departures.push(departure);
    });
  }
  return departures.sort((a, b) => a - b);
}

function scheduledDeparturesBetween(route, fromMs, toMs) {
  return scheduledDepartureTimesBetween(route, fromMs, toMs).length;
}

function validateRoutePlan({ originId, destId, aircraftTypeId, departMinute }) {
  const issues = [];
  const origin = airport(originId);
  const destination = airport(destId);
  const type = aircraftType(aircraftTypeId);
  if (!origin || !destination || !type) return [{ code: 'REFERENCE', message: 'Référence aéroport ou appareil inconnue.' }];
  if (originId === destId) issues.push({ code: 'SAME_AIRPORT', message: 'Origine et destination doivent être différentes.' });

  const distanceKm = distanceBetween(originId, destId);
  if (distanceKm > type.rangeKm) {
    issues.push({ code: 'RANGE', message: `${type.name} ne dispose pas de l’autonomie publiée nécessaire pour ${Math.round(distanceKm)} km.` });
  }
  const limitingRunway = Math.min(origin.runwayM || Infinity, destination.runwayM || Infinity);
  if (type.runway && limitingRunway < type.runway) {
    issues.push({ code: 'RUNWAY', message: `La piste disponible est inférieure au besoin de référence de ${type.runway} m pour ${type.name}.` });
  }
  if (minuteFallsInWindow(departMinute, origin.curfewWindow)) {
    issues.push({ code: 'CURFEW_ORIGIN', message: `${originId} interdit les mouvements planifiés sur ce créneau local.` });
  }

  if (!issues.some(issue => issue.code === 'RANGE')) {
    const nowLocal = zonedParts(Date.now(), origin.timeZone);
    const departureUtc = zonedLocalToUtcMs(
      nowLocal.year, nowLocal.month, nowLocal.day,
      Math.floor(departMinute / 60), departMinute % 60, origin.timeZone,
    );
    const arrivalUtc = departureUtc + blockTimeHours(distanceKm, type.cruiseKmh) * 3600000;
    if (movementBlockedByCurfew(destId, arrivalUtc)) {
      issues.push({ code: 'CURFEW_DEST', message: `L’arrivée estimée tombe dans la période de couvre-feu de ${destId}.` });
    }
  }
  return issues;
}

const MAX_AIRCRAFT_SERVICE_HOURS_PER_DAY = 18;

function buildOperationalPlan(state, route, fromMs, toMs, rng = Math.random) {
  const type = aircraftType(route.aircraftTypeId);
  const distanceKm = distanceBetween(route.originId, route.destId);
  const blockH = blockTimeHours(distanceKm, type.cruiseKmh);
  const scheduledTimes = scheduledDepartureTimesBetween(route, fromMs, toMs);
  const legalTimes = scheduledTimes.filter(departureAt => {
    const arrivalAt = departureAt + blockH * 3600000;
    return !movementBlockedByCurfew(route.originId, departureAt) && !movementBlockedByCurfew(route.destId, arrivalAt);
  });
  const curfewCancellations = scheduledTimes.length - legalTimes.length;
  const assigned = state.fleet.filter(f =>
    f.assignedRouteId === route.id && f.status === 'ACTIVE' && f.typeId === route.aircraftTypeId
  );
  const elapsedDays = Math.max(0, (toMs - fromMs) / DAY_MS);
  const serviceHoursPerFlight = blockH + (type.turnaround || 30) / 60;
  const capacityHours = assigned.length * MAX_AIRCRAFT_SERVICE_HOURS_PER_DAY * elapsedDays;
  const utilizationCapacity = serviceHoursPerFlight > 0 ? Math.floor(capacityHours / serviceHoursPerFlight + 1e-9) : 0;
  const candidateTimes = legalTimes.slice(0, utilizationCapacity);
  const utilizationCancellations = Math.max(0, legalTimes.length - candidateTimes.length);
  const avgCondition = assigned.length ? assigned.reduce((sum, f) => sum + f.condition, 0) / assigned.length : 0;
  const congestion = ((airport(route.originId).size || 50) + (airport(route.destId).size || 50)) / 200;
  const cancellationRisk = clamp(0.002 + Math.max(0, 75 - avgCondition) * 0.0008 + congestion * 0.004, 0.002, 0.08);
  const delayRisk = clamp(0.04 + congestion * 0.10 + Math.max(0, 85 - avgCondition) * 0.002, 0.05, 0.35);

  const operatedDepartureTimes = [];
  let technicalCancellations = 0;
  let delayedFlights = 0;
  candidateTimes.forEach(departureAt => {
    if (rng() < cancellationRisk) {
      technicalCancellations += 1;
      return;
    }
    operatedDepartureTimes.push(departureAt);
    if (rng() < delayRisk) delayedFlights += 1;
  });

  const cancelledFlights = curfewCancellations + utilizationCancellations + technicalCancellations;
  return {
    scheduledFlights: scheduledTimes.length,
    operatedFlights: operatedDepartureTimes.length,
    cancelledFlights,
    delayedFlights,
    curfewCancellations,
    utilizationCancellations,
    technicalCancellations,
    operatedDepartureTimes,
    blockHoursPerFlight: blockH,
    serviceHoursPerFlight,
    utilizationCapacity,
  };
}

function prorateWeekly''',
)

replace_once(
    'correct Jet A volume emission factor',
    '  co2KgPerLiterJetA: 3.16,',
    '  co2KgPerLiterJetA: 2.52,',
)

replace_once(
    'operations flight window state',
    "  state.operations.totalPassengers = state.operations.totalPassengers || 0;\n  return state;",
    "  state.operations.totalPassengers = state.operations.totalPassengers || 0;\n  state.operations.activeFlightWindows = state.operations.activeFlightWindows || [];\n  return state;",
)

replace_once(
    'create route plans once per realtime slice',
    "  restoreMaintenanceRealTime(state, toMs);\n  const marketKeys = new Set();",
    "  restoreMaintenanceRealTime(state, toMs);\n  const routeOperationalPlans = {};\n  state.routes.filter(r => r.status === 'ACTIVE').forEach(r => {\n    routeOperationalPlans[r.id] = buildOperationalPlan(state, r, fromMs, toMs, rng);\n  });\n  const periodOps = { scheduledFlights: 0, operatedFlights: 0, cancelledFlights: 0, delayedFlights: 0 };\n  const marketKeys = new Set();",
)

replace_once(
    'market allocation uses operated flights',
    "        const departures = product.legs === 1\n          ? scheduledDeparturesBetween(product.route, fromMs, toMs)\n          : Math.min(scheduledDeparturesBetween(product.route, fromMs, toMs), scheduledDeparturesBetween(product.secondRoute, fromMs, toMs));",
    "        const departures = product.legs === 1\n          ? (routeOperationalPlans[product.route.id]?.operatedFlights || 0)\n          : Math.min(routeOperationalPlans[product.route.id]?.operatedFlights || 0, routeOperationalPlans[product.secondRoute.id]?.operatedFlights || 0);",
)

replace_once(
    'route loop uses operational plan',
    "    const flights = scheduledDeparturesBetween(route, fromMs, toMs);\n    if (!flights) return;\n    const pax = routePax[route.id] || 0;",
    "    const plan = routeOperationalPlans[route.id] || buildOperationalPlan(state, route, fromMs, toMs, rng);\n    periodOps.scheduledFlights += plan.scheduledFlights;\n    periodOps.operatedFlights += plan.operatedFlights;\n    periodOps.cancelledFlights += plan.cancelledFlights;\n    periodOps.delayedFlights += plan.delayedFlights;\n    state.operations.cancelledFlights += plan.cancelledFlights;\n    state.operations.delayedFlights += plan.delayedFlights;\n    const flights = plan.operatedFlights;\n    const pax = routePax[route.id] || 0;",
)

replace_once(
    'record cancelled-only operational periods',
    "    const routeRev = routeRevenueValue(routeRevenue, route.id);\n    const fuelCost = fuelBurnLiters(dist, type) * flights * state.market.fuelPrice;",
    "    const routeRev = routeRevenueValue(routeRevenue, route.id);\n    if (!flights) {\n      if (plan.scheduledFlights) {\n        route.history = route.history || [];\n        route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: 0, revenue: 0, cost: 0, loadFactor: 0, scheduledFlights: plan.scheduledFlights, operatedFlights: 0, cancelledFlights: plan.cancelledFlights, delayedFlights: 0 });\n        if (route.history.length > 365) route.history.splice(0, route.history.length - 365);\n      }\n      return;\n    }\n    const fuelCost = fuelBurnLiters(dist, type) * flights * state.market.fuelPrice;",
)

replace_once(
    'route history operational metrics',
    "    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), revenue: routeRev + ancillary, cost: routeCost + carbonCost, loadFactor });",
    "    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), revenue: routeRev + ancillary, cost: routeCost + carbonCost, loadFactor, scheduledFlights: plan.scheduledFlights, operatedFlights: flights, cancelledFlights: plan.cancelledFlights, delayedFlights: plan.delayedFlights });",
)

replace_once(
    'track active flight windows',
    "    state.operations.completedFlights += flights;\n\n    const loadFactor",
    "    state.operations.completedFlights += flights;\n    plan.operatedDepartureTimes.forEach(departureAt => {\n      state.operations.activeFlightWindows.push({ routeId: route.id, departureAt, arrivalAt: departureAt + plan.blockHoursPerFlight * 3600000 });\n    });\n\n    const loadFactor",
)

replace_once(
    'active flight and otp update',
    "  state.operations.activeFlights = 0;\n  runCompetitorAI(state, rng, compRouteRevenue, elapsed);\n  updateReputationAndOtp(state, rng, elapsed);",
    "  state.operations.activeFlightWindows = (state.operations.activeFlightWindows || []).filter(f => f.arrivalAt > toMs);\n  state.operations.activeFlights = state.operations.activeFlightWindows.filter(f => f.departureAt <= toMs && f.arrivalAt > toMs).length;\n  runCompetitorAI(state, rng, compRouteRevenue, elapsed);\n  updateReputationAndOtp(state, rng, elapsed, periodOps);",
)

regex_once(
    'otp uses observed operations',
    r"function updateReputationAndOtp\(state, rng, elapsedMs = WEEK_MS\) \{.*?\n\}",
    r'''function updateReputationAndOtp(state, rng, elapsedMs = WEEK_MS, operationalPeriod = null) {
  const periods = Math.max(0, elapsedMs / WEEK_MS);
  const fleetCondition = state.fleet.length ? state.fleet.reduce((s, f) => s + f.condition, 0) / state.fleet.length : 85;
  let targetOtp;
  let cancellationRate = 0;

  if (operationalPeriod?.scheduledFlights > 0) {
    const completed = operationalPeriod.operatedFlights;
    const onTime = Math.max(0, completed - operationalPeriod.delayedFlights);
    const punctuality = completed > 0 ? (onTime / completed) * 100 : 0;
    const completion = (completed / operationalPeriod.scheduledFlights) * 100;
    cancellationRate = operationalPeriod.cancelledFlights / operationalPeriod.scheduledFlights;
    targetOtp = clamp(punctuality * 0.85 + completion * 0.15, 30, 99.5);
  } else {
    targetOtp = clamp(80 + fleetCondition / 7 - state.routes.filter(r => r.status === 'ACTIVE').length * 0.15 + (rng() - 0.5) * 2, 55, 98);
  }

  const otpAlpha = 1 - Math.pow(1 - 0.3, periods);
  state.company.otp = state.company.otp + (targetOtp - state.company.otp) * otpAlpha;
  const targetRep = clamp(42 + state.company.otp * 0.48 - cancellationRate * 35, 0, 100);
  const repAlpha = 1 - Math.pow(1 - 0.06, periods);
  state.company.reputation = clamp(state.company.reputation + (targetRep - state.company.reputation) * repAlpha, 0, 100);
}''',
)

regex_once(
    'route creation validation',
    r"function actionOpenRoute\(state, \{ originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy, departMinute \}\) \{.*?\n\}",
    r'''function actionOpenRoute(state, { originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy, departMinute }) {
  const s = structuredCloneLite(state);
  const issues = validateRoutePlan({ originId, destId, aircraftTypeId, departMinute });
  if (issues.length) {
    s.lastActionError = issues.map(issue => issue.message).join(' ');
    return s;
  }
  delete s.lastActionError;
  const id = 'R' + (s.company.nextRouteSerial++);
  const schedule = Array.from({ length: frequencyPerWeek }, (_, i) => ({ dayOfWeek: i % 7, minute: departMinute }));
  s.routes.push({ id, originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy: fareStrategy || 'COMPETITIVE', schedule, status: 'ACTIVE', history: [] });
  return s;
}''',
)

replace_once(
    'route planner feasibility model',
    "  const reachable = type ? AIRPORTS.filter(a => a.id !== originId && distanceBetween(originId, a.id) <= type.rangeKm) : [];",
    "  const reachable = type ? AIRPORTS.filter(a => a.id !== originId && distanceBetween(originId, a.id) <= type.rangeKm && type.runway <= Math.min(airport(originId).runwayM || Infinity, a.runwayM || Infinity)) : [];\n  const planningIssues = destId && type ? validateRoutePlan({ originId, destId, aircraftTypeId: type.id, departMinute: slot }) : [];",
)

replace_once(
    'route planner warning',
    "      {type && !reachable.length && <div className=\"empty-hint\">Aucune destination à portée de cet appareil depuis cette origine.</div>}\n      <button className=\"btn btn-primary\" disabled={!destId} onClick={() => {",
    "      {type && !reachable.length && <div className=\"empty-hint\">Aucune destination techniquement exploitable avec cet appareil depuis cette origine.</div>}\n      {planningIssues.length > 0 && <div className=\"empty-hint\">{planningIssues.map(issue => issue.message).join(' ')}</div>}\n      <button className=\"btn btn-primary\" disabled={!destId || planningIssues.length > 0} onClick={() => {",
)

replace_once(
    'safe route assignment after validation',
    "          let s2 = actionOpenRoute(s, { originId, destId, aircraftTypeId: type.id, frequencyPerWeek: freq, fareStrategy, departMinute: slot });\n          const newRoute = s2.routes[s2.routes.length - 1];\n          s2 = actionAssignAircraft(s2, aircraftId, newRoute.id);\n          return s2;",
    "          const previousRouteCount = s.routes.length;\n          let s2 = actionOpenRoute(s, { originId, destId, aircraftTypeId: type.id, frequencyPerWeek: freq, fareStrategy, departMinute: slot });\n          if (s2.routes.length === previousRouteCount) return s2;\n          const newRoute = s2.routes[s2.routes.length - 1];\n          s2 = actionAssignAircraft(s2, aircraftId, newRoute.id);\n          return s2;",
)

replace_once(
    'fleet operational columns header',
    "<thead><tr><th>ID</th><th>Type</th><th>Propriété</th><th>Âge</th><th>État</th><th>Statut</th><th>Ligne affectée</th></tr></thead>",
    "<thead><tr><th>ID</th><th>Type</th><th>Propriété</th><th>Âge</th><th>Heures</th><th>Cycles</th><th>État</th><th>Statut</th><th>Ligne affectée</th></tr></thead>",
)
replace_once(
    'fleet operational columns values',
    "                  <td className=\"mono\">{(f.ageWeeks / 52).toFixed(1)} ans</td>\n                  <td style={{ minWidth: 110 }}><ConditionBar value={f.condition} /></td>",
    "                  <td className=\"mono\">{(f.ageWeeks / 52).toFixed(1)} ans</td>\n                  <td className=\"mono\">{fmtNum(f.flightHours || 0)} h</td>\n                  <td className=\"mono\">{fmtNum(f.cycles || 0)}</td>\n                  <td style={{ minWidth: 110 }}><ConditionBar value={f.condition} /></td>",
)

# Sanity checks for the intended end state.
for required in [
    "timeZone: 'Europe/Paris'",
    'scheduledDepartureTimesBetween',
    'validateRoutePlan',
    'buildOperationalPlan',
    'co2KgPerLiterJetA: 2.52',
    'periodOps.cancelledFlights',
]:
    if required not in source:
        raise RuntimeError(f'missing expected upgraded behavior: {required}')

path.write_text(source)
print('AeroDesk real-world operations upgrade applied.')
