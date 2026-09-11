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


replace_once('USD recurring labor names', '''  laborDailyBaseEUR: 1800,
  laborPerAircraftDailyEUR: 520,
  laborPerRouteDailyEUR: 180,''', '''  laborDailyBaseUSD: 1800,
  laborPerAircraftDailyUSD: 520,
  laborPerRouteDailyUSD: 180,''')
replace_once('USD recurring labor use', '''    (AERODESK_V3.laborDailyBaseEUR +
      aircraftCount * AERODESK_V3.laborPerAircraftDailyEUR +
      activeRoutes * AERODESK_V3.laborPerRouteDailyEUR) * days;''', '''    (AERODESK_V3.laborDailyBaseUSD +
      aircraftCount * AERODESK_V3.laborPerAircraftDailyUSD +
      activeRoutes * AERODESK_V3.laborPerRouteDailyUSD) * days;''')

replace_once(
    'company accounting currency',
    "      name: companyName, homeBase: homeBaseId, cash: 45e6, reputation: 50, otp: 88,",
    "      name: companyName, homeBase: homeBaseId, cash: 45e6, currency: 'USD', reputation: 50, otp: 88,",
)
replace_once(
    'modeled FX reference',
    "      fuelPrice: 0.82,\n      macro: { demandIndex: 1.0, fuelTrend: 0, cycle: 'NORMAL' },",
    "      fuelPrice: 0.82,\n      fx: { EURUSD: 1.08 },\n      macro: { demandIndex: 1.0, fuelTrend: 0, cycle: 'NORMAL' },",
)

insert = r'''
const EUROPEAN_CARBON_MARKET_AIRPORTS = new Set(['LHR', 'CDG', 'FRA', 'AMS', 'MAD', 'FCO']);
const SCHEDULED_CHECK_INTERVAL_HOURS = 650;
const SCHEDULED_CHECK_INTERVAL_CYCLES = 400;
const SCHEDULED_CHECK_DURATION_HOURS = 18;

function crewCostForOperations(type, totalBlockHours, flights) {
  if (!flights || totalBlockHours <= 0) return 0;
  const blockPerFlight = totalBlockHours / flights;
  const dutyHours = blockPerFlight + 1.5; // report, taxi/turn and post-flight duty proxy
  let augmentation = 1.0;
  if (dutyHours > 17) augmentation = 1.8;
  else if (dutyHours > 15) augmentation = 1.5;
  else if (dutyHours > 13) augmentation = 1.2;

  // Long sectors require augmented/rest-capable crewing and generate layover/per-diem expense.
  const hourly = type.crew * 95 * totalBlockHours * augmentation;
  const perDiem = blockPerFlight >= 6 ? type.crew * 75 * flights : 0;
  const layover = blockPerFlight >= 10 ? type.crew * 140 * flights : 0;
  return hourly + perDiem + layover;
}

function applyAircraftUsage(state, aircraft, type, flownCycles, flownBlockHours, nowMs, rng = Math.random) {
  const previousHours = aircraft.flightHours || 0;
  const previousCycles = aircraft.cycles || 0;
  if (!aircraft.nextScheduledCheckHours) {
    aircraft.nextScheduledCheckHours = (Math.floor(previousHours / SCHEDULED_CHECK_INTERVAL_HOURS) + 1) * SCHEDULED_CHECK_INTERVAL_HOURS;
  }
  if (!aircraft.nextScheduledCheckCycles) {
    aircraft.nextScheduledCheckCycles = (Math.floor(previousCycles / SCHEDULED_CHECK_INTERVAL_CYCLES) + 1) * SCHEDULED_CHECK_INTERVAL_CYCLES;
  }

  aircraft.flightHours = previousHours + flownBlockHours;
  aircraft.cycles = previousCycles + flownCycles;
  aircraft.condition = clamp(aircraft.condition - flownBlockHours * 0.035 - flownCycles * 0.025, 10, 100);

  const scheduledDue =
    aircraft.flightHours >= aircraft.nextScheduledCheckHours ||
    aircraft.cycles >= aircraft.nextScheduledCheckCycles;
  let maintenanceCost = 0;
  let scheduled = false;

  if (scheduledDue) {
    scheduled = true;
    aircraft.status = 'MAINTENANCE';
    aircraft.maintUntil = nowMs + SCHEDULED_CHECK_DURATION_HOURS * 3600000;
    maintenanceCost = type.maintPerHour * SCHEDULED_CHECK_DURATION_HOURS;
    while (aircraft.nextScheduledCheckHours <= aircraft.flightHours) aircraft.nextScheduledCheckHours += SCHEDULED_CHECK_INTERVAL_HOURS;
    while (aircraft.nextScheduledCheckCycles <= aircraft.cycles) aircraft.nextScheduledCheckCycles += SCHEDULED_CHECK_INTERVAL_CYCLES;
    state.log.push({ week: state.meta.week, type: 'MAINT', text: `${aircraft.id} entre en visite programmée après seuil heures/cycles.` });
  } else if (aircraft.condition < 65 && flownCycles > 0) {
    const perCycleRisk = 0.001 + Math.max(0, 65 - aircraft.condition) * 0.00035;
    const unscheduledRisk = 1 - Math.pow(1 - perCycleRisk, flownCycles);
    if (rng() < unscheduledRisk) {
      aircraft.status = 'MAINTENANCE';
      aircraft.maintUntil = nowMs + 2 * DAY_MS;
      maintenanceCost = type.maintPerHour * 25;
      state.log.push({ week: state.meta.week, type: 'MAINT', text: `${aircraft.id} est immobilisé pour maintenance non programmée.` });
    }
  }

  return { maintenanceCost, scheduled };
}
'''
replace_once(
    'insert crew/maintenance realism helpers',
    "function v3EnsureFinance(state) {",
    insert + "\nfunction v3EnsureFinance(state) {",
)

regex_once(
    'scoped carbon compliance cost',
    r"function v3ApplyCarbonCost\(state, fuelLiters\) \{.*?\n\}",
    r'''function v3ApplyCarbonCost(state, fuelLiters, originId = null, destId = null) {
  // Model direct allowance cost only for flights inside the covered European carbon market.
  // Extra-European emissions remain tracked physically but are not charged a fictional flat ETS fee.
  const covered = EUROPEAN_CARBON_MARKET_AIRPORTS.has(originId) && EUROPEAN_CARBON_MARKET_AIRPORTS.has(destId);
  if (!covered) return 0;
  const tonnesCO2 = fuelLiters * AERODESK_V3.co2KgPerLiterJetA / 1000;
  const eurCost = tonnesCO2 * AERODESK_V3.carbonEURPerTonneCO2;
  const eurUsd = state.market?.fx?.EURUSD || 1.08;
  const costUSD = eurCost * eurUsd;
  v3BookAccounting(state, 'taxesExpense', costUSD);
  return costUSD;
}''',
)
replace_once(
    'carbon route scope call',
    "    const carbonCost = v3ApplyCarbonCost(state, fuelBurnLiters(dist, type) * flights);",
    "    const carbonCost = v3ApplyCarbonCost(state, fuelBurnLiters(dist, type) * flights, route.originId, route.destId);",
)

replace_once(
    'augmented crew operating cost',
    "    const crewCost = type.crew * 95 * blockH;",
    "    const crewCost = crewCostForOperations(type, blockH, flights);",
)

old_usage = '''    const assigned = state.fleet.filter(f => f.assignedRouteId === route.id && f.status === 'ACTIVE');
    assigned.forEach(f => {
      f.flightHours = (f.flightHours || 0) + blockH;
      f.cycles = (f.cycles || 0) + flights;
      f.condition = clamp(f.condition - blockH * 0.035, 10, 100);
      if (f.condition < 55 && rng() < 0.02) {
        f.status = 'MAINTENANCE';
        f.maintUntil = toMs + 2 * DAY_MS;
        const eventCost = type.maintPerHour * 25;
        costs += eventCost;
        breakdown.maint += eventCost;
        accounting.maintenanceExpense = (accounting.maintenanceExpense || 0) + eventCost;
        addLedger(state, state.meta.week, 'MAINT_UNSCHEDULED', -eventCost, 'Maintenance non programmée');
      }
    });'''
new_usage = '''    const assigned = state.fleet.filter(f => f.assignedRouteId === route.id && f.status === 'ACTIVE' && f.typeId === route.aircraftTypeId);
    const blockPerFlight = blockTimeHours(dist, type.cruiseKmh);
    assigned.forEach((f, index) => {
      const baseFlights = Math.floor(flights / assigned.length);
      const tailFlights = baseFlights + (index < (flights % assigned.length) ? 1 : 0);
      if (!tailFlights) return;
      const usage = applyAircraftUsage(state, f, type, tailFlights, blockPerFlight * tailFlights, toMs, rng);
      if (usage.maintenanceCost > 0) {
        costs += usage.maintenanceCost;
        breakdown.maint += usage.maintenanceCost;
        accounting.maintenanceExpense = (accounting.maintenanceExpense || 0) + usage.maintenanceCost;
        addLedger(state, state.meta.week, usage.scheduled ? 'MAINT_SCHEDULED' : 'MAINT_UNSCHEDULED', -usage.maintenanceCost, usage.scheduled ? 'Visite de maintenance programmée' : 'Maintenance non programmée');
      }
    });'''
replace_once('per-tail utilization and maintenance', old_usage, new_usage)

for required in [
    "currency: 'USD'",
    'fx: { EURUSD: 1.08 }',
    'crewCostForOperations',
    'applyAircraftUsage',
    'EUROPEAN_CARBON_MARKET_AIRPORTS',
    "v3ApplyCarbonCost(state, fuelBurnLiters(dist, type) * flights, route.originId, route.destId)",
]:
    if required not in source:
        raise RuntimeError(f'missing expected phase-2 behavior: {required}')

path.write_text(source)
print('AeroDesk phase-2 realism upgrade applied.')
