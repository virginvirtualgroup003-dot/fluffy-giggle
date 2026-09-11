import fs from 'node:fs';

const file = 'aerodesk.jsx';
let source = fs.readFileSync(file, 'utf8');

function replaceFunction(name, replacement) {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const brace = source.indexOf('{', start);
  if (brace < 0) throw new Error(`Opening brace not found: ${name}`);
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
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`Pattern not found: ${label}`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`Pattern not unique: ${label}`);
  source = source.slice(0, first) + newText + source.slice(first + oldText.length);
}

// A realistic scheduled service is a rotation: outbound sector, turnaround, return sector,
// then enough ground time to release the tail for its next rotation.
replaceOnce(
  'const MAX_AIRCRAFT_SERVICE_HOURS_PER_DAY = 18;',
  'const MAX_AIRCRAFT_SERVICE_HOURS_PER_DAY = 16;',
  'aircraft service-day envelope',
);

const returnHelpers = String.raw`
function returnDepartureSlots(route, referenceMs = Date.now()) {
  const type = aircraftType(route.aircraftTypeId);
  if (!type) return [];
  const destination = airport(route.destId);
  const blockH = blockTimeHours(distanceBetween(route.originId, route.destId), type.cruiseKmh);
  const turnaroundMs = (type.turnaround || 30) * 60000;
  const weekStart = startOfIsoWeekUtc(referenceMs);
  const departures = scheduledDepartureTimesBetween(route, weekStart - DAY_MS, weekStart + 7 * DAY_MS);
  return departures.map(outboundDeparture => {
    const returnDeparture = outboundDeparture + blockH * 3600000 + turnaroundMs;
    const local = zonedParts(returnDeparture, destination?.timeZone || 'UTC');
    return local.hour * 60 + local.minute;
  });
}
`;

if (!source.includes('function returnDepartureSlots(')) {
  const marker = 'function buildPlayerProducts(state, originId, destId) {';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('buildPlayerProducts insertion marker missing');
  source = source.slice(0, at) + returnHelpers + '\n' + source.slice(at);
}

replaceFunction('buildPlayerProducts', String.raw`
function buildPlayerProducts(state, originId, destId) {
  const products = [];

  // Published routes are physical round trips. The stored route describes the outbound
  // commercial service; its return sector is derived from block time + turnaround.
  const outboundRoutes = state.routes.filter(r =>
    r.status === 'ACTIVE' && r.originId === originId && r.destId === destId && routeHasActiveAircraft(state, r)
  );
  outboundRoutes.forEach(route => products.push(
    makeProductFromRoute(route, 'PLAYER', state.company, [route], {
      direction: 'OUTBOUND', originId, destId,
      departSlots: route.schedule.map(s => s.minute),
    })
  ));

  const returnRoutes = state.routes.filter(r =>
    r.status === 'ACTIVE' && r.originId === destId && r.destId === originId && routeHasActiveAircraft(state, r)
  );
  returnRoutes.forEach(route => products.push(
    makeProductFromRoute(route, 'PLAYER', state.company, [route], {
      direction: 'RETURN', originId, destId,
      departSlots: returnDepartureSlots(route, state.meta?.lastProcessedAt || Date.now()),
    })
  ));

  // Keep connection construction schedule-aware. Connections are built from published
  // outbound legs here; reverse-direction direct service is still fully sellable above.
  const legsOut = state.routes.filter(r =>
    r.status === 'ACTIVE' && r.originId === originId && r.destId !== destId && routeHasActiveAircraft(state, r)
  );
  legsOut.forEach(leg1 => {
    state.routes
      .filter(r => r.status === 'ACTIVE' && r.originId === leg1.destId && r.destId === destId && routeHasActiveAircraft(state, r))
      .forEach(leg2 => {
        if (leg1.destId !== originId) {
          const metrics = connectionScheduleMetrics(leg1, leg2, state.meta?.lastProcessedAt || Date.now());
          if (metrics.feasibleFrequency > 0) products.push(makeConnectProduct([leg1, leg2], 'PLAYER', state.company, metrics));
        }
      });
  });
  return products;
}
`);

replaceFunction('makeProductFromRoute', String.raw`
function makeProductFromRoute(route, owner, company, legs, options = {}) {
  const oType = aircraftType(route.aircraftTypeId);
  const originId = options.originId || route.originId;
  const destId = options.destId || route.destId;
  const direction = options.direction || 'OUTBOUND';
  const dist = distanceBetween(originId, destId);
  const departSlots = options.departSlots || route.schedule.map(s => s.minute);
  return {
    key: direction === 'RETURN' ? 'P-' + route.id + '-RETURN' : 'P-' + route.id,
    owner, ownerRef: company, legs: 1, distanceKm: dist,
    freq: route.frequencyPerWeek, fareStrategy: route.fareStrategy,
    departSlots,
    totalTripHours: blockTimeHours(dist, oType.cruiseKmh),
    reputation: company.reputation, otp: company.otp,
    seats: oType.seats, route, direction, originId, destId,
  };
}
`);

replaceFunction('buildOperationalPlan', String.raw`
function buildOperationalPlan(state, route, fromMs, toMs, rng = Math.random) {
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
  // The second turnaround reserves the tail at origin before its next planned rotation.
  const serviceHoursPerRotation = blockH * 2 + turnaroundH * 2;
  const capacityHours = assigned.length * MAX_AIRCRAFT_SERVICE_HOURS_PER_DAY * elapsedDays;
  const utilizationCapacityRotations = serviceHoursPerRotation > 0
    ? Math.floor(capacityHours / serviceHoursPerRotation + 1e-9)
    : 0;
  const candidateRotations = legalRotations.slice(0, utilizationCapacityRotations);
  const utilizationCancelledRotations = Math.max(0, legalRotations.length - candidateRotations.length);
  const avgCondition = assigned.length ? assigned.reduce((sum, f) => sum + f.condition, 0) / assigned.length : 0;

  const outboundDepartureTimes = [];
  const returnDepartureTimes = [];
  const operatedDepartureTimes = [];
  let technicalCancelledRotations = 0;
  let delayedFlights = 0;

  candidateRotations.forEach(rotation => {
    const congestion = (
      airportCongestionFactor(route.originId, rotation.outboundDeparture) +
      airportCongestionFactor(route.destId, rotation.outboundArrival) +
      airportCongestionFactor(route.destId, rotation.returnDeparture) +
      airportCongestionFactor(route.originId, rotation.returnArrival)
    ) / 4;
    const cancellationRisk = clamp(0.0015 + Math.max(0, 75 - avgCondition) * 0.0008 + congestion * 0.0045, 0.0015, 0.08);
    const delayRisk = clamp(0.025 + congestion * 0.13 + Math.max(0, 85 - avgCondition) * 0.002, 0.03, 0.40);

    // If the outbound rotation is cancelled, the paired return sector cannot exist either.
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
  const cancelledRotations = curfewRotations + utilizationCancelledRotations + technicalCancelledRotations;

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
`  state.routes.filter(r => r.status === 'ACTIVE').forEach(r => {
    marketKeys.add(r.originId + '|' + r.destId);
    state.routes.filter(r2 => r2.status === 'ACTIVE' && r2.originId === r.destId)
      .forEach(r2 => marketKeys.add(r.originId + '|' + r2.destId));
  });`,
`  state.routes.filter(r => r.status === 'ACTIVE').forEach(r => {
    marketKeys.add(r.originId + '|' + r.destId);
    marketKeys.add(r.destId + '|' + r.originId);
    state.routes.filter(r2 => r2.status === 'ACTIVE' && r2.originId === r.destId)
      .forEach(r2 => marketKeys.add(r.originId + '|' + r2.destId));
  });`,
  'bidirectional market keys',
);

replaceOnce(
`        const departures = product.legs === 1
          ? (routeOperationalPlans[product.route.id]?.operatedFlights || 0)
          : Math.min(routeOperationalPlans[product.route.id]?.operatedFlights || 0, routeOperationalPlans[product.secondRoute.id]?.operatedFlights || 0);`,
`        const departures = product.legs === 1
          ? (routeOperationalPlans[product.route.id]?.operatedRotations ?? Math.floor((routeOperationalPlans[product.route.id]?.operatedFlights || 0) / 2))
          : Math.min(
              routeOperationalPlans[product.route.id]?.operatedRotations ?? Math.floor((routeOperationalPlans[product.route.id]?.operatedFlights || 0) / 2),
              routeOperationalPlans[product.secondRoute.id]?.operatedRotations ?? Math.floor((routeOperationalPlans[product.secondRoute.id]?.operatedFlights || 0) / 2)
            );`,
  'market capacity uses rotations per direction',
);

fs.writeFileSync(file, source);
console.log('Applied AeroDesk realism phase 6: physical round-trip rotations.');
