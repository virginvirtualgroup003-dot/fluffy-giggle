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


network_helpers = r'''
const AIRPORT_MCT_MINUTES = {
  LHR: 75, CDG: 60, FRA: 60, AMS: 50, MAD: 60, FCO: 60,
  JFK: 75, LAX: 60, ORD: 55, MIA: 60, YYZ: 60,
  GRU: 60, EZE: 60, DXB: 75, DEL: 60, SIN: 60, HKG: 60,
  NRT: 60, ICN: 60, SYD: 60, JNB: 60, CAI: 60, LOS: 60, AKL: 45,
};

function minimumConnectionTimeHours(airportId) {
  return (AIRPORT_MCT_MINUTES[airportId] || 60) / 60;
}

function startOfIsoWeekUtc(referenceMs) {
  const date = new Date(referenceMs);
  const day = date.getUTCDay() || 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 1, 0, 0, 0, 0);
}

function connectionScheduleMetrics(firstRoute, secondRoute, referenceMs = Date.now()) {
  if (!firstRoute || !secondRoute || firstRoute.destId !== secondRoute.originId) {
    return { feasibleFrequency: 0, averageWaitHours: Infinity, mctHours: 1 };
  }
  const hubId = firstRoute.destId;
  const mctHours = minimumConnectionTimeHours(hubId);
  const firstType = aircraftType(firstRoute.aircraftTypeId);
  const firstBlockH = blockTimeHours(distanceBetween(firstRoute.originId, firstRoute.destId), firstType.cruiseKmh);
  const weekStart = startOfIsoWeekUtc(referenceMs);
  const horizonEnd = weekStart + 8 * DAY_MS;
  const firstDepartures = scheduledDepartureTimesBetween(firstRoute, weekStart - DAY_MS, weekStart + 7 * DAY_MS);
  const secondDepartures = scheduledDepartureTimesBetween(secondRoute, weekStart - DAY_MS, horizonEnd);
  const waits = [];

  firstDepartures.forEach(firstDeparture => {
    const arrival = firstDeparture + firstBlockH * 3600000;
    const earliestConnection = arrival + mctHours * 3600000;
    const latestUsefulConnection = arrival + 8 * 3600000;
    const secondDeparture = secondDepartures.find(dep => dep >= earliestConnection && dep <= latestUsefulConnection);
    if (secondDeparture) waits.push((secondDeparture - arrival) / 3600000);
  });

  const feasibleFrequency = Math.min(waits.length, firstRoute.frequencyPerWeek || waits.length, secondRoute.frequencyPerWeek || waits.length);
  const selectedWaits = waits.slice(0, feasibleFrequency);
  return {
    feasibleFrequency,
    averageWaitHours: selectedWaits.length ? selectedWaits.reduce((sum, wait) => sum + wait, 0) / selectedWaits.length : Infinity,
    mctHours,
  };
}

function airportCongestionFactor(airportId, timestampMs) {
  const ap = airport(airportId);
  if (!ap) return 0.5;
  const local = zonedParts(timestampMs, ap.timeZone || 'UTC');
  const minute = local.hour * 60 + local.minute;
  const sizeBase = clamp((ap.size || 50) / 100, 0.25, 1.0);
  let wave = 0.65;
  if ((minute >= 6 * 60 && minute < 10 * 60) || (minute >= 16 * 60 && minute < 20 * 60 + 30)) wave = 1.25;
  else if (minute >= 10 * 60 && minute < 16 * 60) wave = 0.82;
  else if (minute >= 20 * 60 + 30 && minute < 23 * 60) wave = 0.92;
  else wave = 0.45;
  return clamp(sizeBase * wave, 0.12, 1.35);
}
'''
replace_once(
    'insert connection and congestion helpers',
    "function validateRoutePlan({ originId, destId, aircraftTypeId, departMinute }) {",
    network_helpers + "\nfunction validateRoutePlan({ originId, destId, aircraftTypeId, departMinute }) {",
)

replace_once(
    'per-departure congestion risks',
'''  const avgCondition = assigned.length ? assigned.reduce((sum, f) => sum + f.condition, 0) / assigned.length : 0;
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
  });''',
'''  const avgCondition = assigned.length ? assigned.reduce((sum, f) => sum + f.condition, 0) / assigned.length : 0;

  const operatedDepartureTimes = [];
  let technicalCancellations = 0;
  let delayedFlights = 0;
  candidateTimes.forEach(departureAt => {
    const arrivalAt = departureAt + blockH * 3600000;
    const congestion = (
      airportCongestionFactor(route.originId, departureAt) +
      airportCongestionFactor(route.destId, arrivalAt)
    ) / 2;
    const cancellationRisk = clamp(0.0015 + Math.max(0, 75 - avgCondition) * 0.0008 + congestion * 0.0045, 0.0015, 0.08);
    const delayRisk = clamp(0.025 + congestion * 0.13 + Math.max(0, 85 - avgCondition) * 0.002, 0.03, 0.40);
    if (rng() < cancellationRisk) {
      technicalCancellations += 1;
      return;
    }
    operatedDepartureTimes.push(departureAt);
    if (rng() < delayRisk) delayedFlights += 1;
  });''')

replace_once(
    'connection products use actual banks',
'''      .filter(r => r.status === 'ACTIVE' && r.originId === leg1.destId && r.destId === destId && routeHasActiveAircraft(state, r))
      .forEach(leg2 => {
        if (leg1.destId !== originId) products.push(makeConnectProduct([leg1, leg2], 'PLAYER', state.company));
      });''',
'''      .filter(r => r.status === 'ACTIVE' && r.originId === leg1.destId && r.destId === destId && routeHasActiveAircraft(state, r))
      .forEach(leg2 => {
        if (leg1.destId === originId) return;
        const metrics = connectionScheduleMetrics(leg1, leg2, state.meta?.lastProcessedAt || Date.now());
        if (metrics.feasibleFrequency > 0) products.push(makeConnectProduct([leg1, leg2], 'PLAYER', state.company, metrics));
      });''')

regex_once(
    'connection product uses schedule-derived metrics',
    r"function makeConnectProduct\(legs, owner, company\) \{.*?\n\}",
    r'''function makeConnectProduct(legs, owner, company, metrics = null) {
  const [l1, l2] = legs;
  const t1 = aircraftType(l1.aircraftTypeId), t2 = aircraftType(l2.aircraftTypeId);
  const d1 = distanceBetween(l1.originId, l1.destId), d2 = distanceBetween(l2.originId, l2.destId);
  const bt1 = blockTimeHours(d1, t1.cruiseKmh), bt2 = blockTimeHours(d2, t2.cruiseKmh);
  const connection = metrics || connectionScheduleMetrics(l1, l2);
  if (!connection.feasibleFrequency) return null;
  return {
    key: 'P-' + l1.id + '-' + l2.id, owner, ownerRef: company, legs: 2,
    distanceKm: d1 + d2,
    freq: connection.feasibleFrequency,
    fareStrategy: l1.fareStrategy,
    departSlots: l1.schedule.map(s => s.minute),
    totalTripHours: bt1 + bt2 + connection.averageWaitHours,
    reputation: company.reputation, otp: company.otp - 6,
    seats: Math.min(t1.seats, t2.seats), route: l1, secondRoute: l2,
    mctGap: connection.averageWaitHours,
    mctHours: connection.mctHours,
    connectionWaitHours: connection.averageWaitHours,
  };
}''')

for required in [
    'minimumConnectionTimeHours',
    'connectionScheduleMetrics',
    'airportCongestionFactor',
    'metrics.feasibleFrequency > 0',
    'connectionWaitHours',
]:
    if required not in source:
        raise RuntimeError(f'missing expected phase-5 behavior: {required}')

path.write_text(source)
print('AeroDesk phase-5 network realism upgrade applied.')
