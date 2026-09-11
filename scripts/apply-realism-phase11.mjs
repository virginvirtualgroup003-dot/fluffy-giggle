import fs from 'node:fs';

const file = 'aerodesk.jsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const at = source.indexOf(oldText);
  if (at < 0) throw new Error(`Pattern not found: ${label}`);
  if (source.indexOf(oldText, at + oldText.length) >= 0) throw new Error(`Pattern not unique: ${label}`);
  source = source.slice(0, at) + newText + source.slice(at + oldText.length);
}

const cargoHelpers = String.raw`
// Cargo utilization is anchored to current IATA industry load-factor levels, while route-level
// yield and corridor demand multipliers remain transparent simulation assumptions rather than
// live freight quotations.
function cargoLoadFactorTarget(state, originId, destId) {
  const origin = airport(originId);
  const destination = airport(destId);
  const international = origin?.country && destination?.country && origin.country !== destination.country;
  const industryAnchor = international ? 0.524 : 0.463;
  const macro = clamp(state?.market?.macro?.demandIndex || 1, 0.70, 1.30);
  let corridor = 1;
  const pair = [origin?.region, destination?.region].sort().join('|');
  if (pair === 'ASIA|EU') corridor = 1.08;
  else if (pair === 'EU|NA') corridor = 1.04;
  else if (pair === 'ASIA|NA') corridor = 1.10;
  else if (pair.includes('AFRICA')) corridor = 0.96;
  return clamp(industryAnchor * corridor * (0.9 + 0.1 * macro), 0.30, 0.68);
}

function cargoYieldUSDPerKg(distanceKm, originId, destId) {
  const origin = airport(originId);
  const destination = airport(destId);
  const international = origin?.country && destination?.country && origin.country !== destination.country;
  const distanceComponent = 0.00018 * Math.max(0, distanceKm);
  return clamp((international ? 1.05 : 0.82) + distanceComponent, 0.85, 4.25);
}

function bellyCargoEconomics(state, type, originId, destId, distanceKm, passengersPerFlight, flights) {
  const sectors = Math.max(0, flights || 0);
  if (!type || sectors <= 0) return { availableKg: 0, carriedKg: 0, revenueUSD: 0, handlingCostUSD: 0, yieldUSDPerKg: 0, loadFactor: 0 };
  const availablePerFlightKg = availableBellyCargoKg(type, distanceKm, passengersPerFlight, originId, destId);
  const availableKg = availablePerFlightKg * sectors;
  const loadFactor = cargoLoadFactorTarget(state, originId, destId);
  const carriedKg = availableKg * loadFactor;
  const yieldUSDPerKg = cargoYieldUSDPerKg(distanceKm, originId, destId);
  const revenueUSD = carriedKg * yieldUSDPerKg;
  const handlingCostUSD = carriedKg * 0.16;
  return { availableKg, carriedKg, revenueUSD, handlingCostUSD, yieldUSDPerKg, loadFactor };
}
`;

if (!source.includes('function bellyCargoEconomics(')) {
  const marker = 'function routeHasActiveAircraft(state, route) {';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('cargo helper insertion marker missing');
  source = source.slice(0, at) + cargoHelpers + '\n' + source.slice(at);
}

replaceOnce(
`        passengerRevenue: 0,
        ancillaryRevenue: 0,
        fuelExpense: 0,`,
`        passengerRevenue: 0,
        ancillaryRevenue: 0,
        cargoRevenue: 0,
        fuelExpense: 0,`,
  'cargo revenue accounting bucket',
);

replaceOnce(
`        handlingExpense: 0,
        distributionExpense: 0,`,
`        handlingExpense: 0,
        cargoHandlingExpense: 0,
        distributionExpense: 0,`,
  'cargo handling accounting bucket',
);

replaceOnce(
`  const revenue =
    (a.passengerRevenue || 0) +
    (a.ancillaryRevenue || 0);`,
`  const revenue =
    (a.passengerRevenue || 0) +
    (a.ancillaryRevenue || 0) +
    (a.cargoRevenue || 0);`,
  'cargo in pnl revenue',
);

replaceOnce(
`    (a.airportExpense || 0) +
    (a.handlingExpense || 0) +
    (a.distributionExpense || 0) +`,
`    (a.airportExpense || 0) +
    (a.handlingExpense || 0) +
    (a.cargoHandlingExpense || 0) +
    (a.distributionExpense || 0) +`,
  'cargo in pnl expense',
);

replaceOnce(
`    const handlingCost = pax * 12;
    const distributionCost = routeRev * 0.045;
    const routeCost = fuelCost + crewCost + maintCost + airportCost + handlingCost + distributionCost;

    const ancillary = v3AddAncillaryRevenue(state, routeRev);
    const carbonCost = v3ApplyCarbonCost(state, fuelLitersBurned, route.originId, route.destId);

    revenue += routeRev + ancillary;
    costs += routeCost + carbonCost;
    breakdown.fuel += fuelCost;
    breakdown.crew += crewCost;
    breakdown.maint += maintCost;
    breakdown.airport += airportCost;
    breakdown.handling += handlingCost;
    breakdown.distribution += distributionCost;
    breakdown.taxes += carbonCost;

    accounting.passengerRevenue = (accounting.passengerRevenue || 0) + routeRev;
    accounting.fuelExpense = (accounting.fuelExpense || 0) + fuelCost;
    accounting.crewExpense = (accounting.crewExpense || 0) + crewCost;
    accounting.maintenanceExpense = (accounting.maintenanceExpense || 0) + maintCost;
    accounting.airportExpense = (accounting.airportExpense || 0) + airportCost;
    accounting.handlingExpense = (accounting.handlingExpense || 0) + handlingCost;
    accounting.distributionExpense = (accounting.distributionExpense || 0) + distributionCost;`,
`    const passengerHandlingCost = pax * 12;
    const passengersPerFlight = flights > 0 ? pax / flights : 0;
    const cargo = bellyCargoEconomics(state, type, route.originId, route.destId, dist, passengersPerFlight, flights);
    const distributionCost = routeRev * 0.045;
    const routeCost = fuelCost + crewCost + maintCost + airportCost + passengerHandlingCost + cargo.handlingCostUSD + distributionCost;

    const ancillary = v3AddAncillaryRevenue(state, routeRev);
    const carbonCost = v3ApplyCarbonCost(state, fuelLitersBurned, route.originId, route.destId);

    revenue += routeRev + ancillary + cargo.revenueUSD;
    costs += routeCost + carbonCost;
    breakdown.fuel += fuelCost;
    breakdown.crew += crewCost;
    breakdown.maint += maintCost;
    breakdown.airport += airportCost;
    breakdown.handling += passengerHandlingCost + cargo.handlingCostUSD;
    breakdown.distribution += distributionCost;
    breakdown.taxes += carbonCost;

    accounting.passengerRevenue = (accounting.passengerRevenue || 0) + routeRev;
    accounting.cargoRevenue = (accounting.cargoRevenue || 0) + cargo.revenueUSD;
    accounting.fuelExpense = (accounting.fuelExpense || 0) + fuelCost;
    accounting.crewExpense = (accounting.crewExpense || 0) + crewCost;
    accounting.maintenanceExpense = (accounting.maintenanceExpense || 0) + maintCost;
    accounting.airportExpense = (accounting.airportExpense || 0) + airportCost;
    accounting.handlingExpense = (accounting.handlingExpense || 0) + passengerHandlingCost;
    accounting.cargoHandlingExpense = (accounting.cargoHandlingExpense || 0) + cargo.handlingCostUSD;
    accounting.distributionExpense = (accounting.distributionExpense || 0) + distributionCost;`,
  'route belly cargo economics',
);

replaceOnce(
`    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), revenue: routeRev + ancillary, cost: routeCost + carbonCost + disruption.totalUSD, loadFactor, scheduledFlights: plan.scheduledFlights, operatedFlights: flights, cancelledFlights: plan.cancelledFlights, delayedFlights: plan.delayedFlights });`,
`    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), cargoKg: Math.round(cargo.carriedKg), cargoRevenue: cargo.revenueUSD, revenue: routeRev + ancillary + cargo.revenueUSD, cost: routeCost + carbonCost + disruption.totalUSD, loadFactor, scheduledFlights: plan.scheduledFlights, operatedFlights: flights, cancelledFlights: plan.cancelledFlights, delayedFlights: plan.delayedFlights });`,
  'cargo route history',
);

fs.writeFileSync(file, source);
console.log('Applied AeroDesk realism phase 11: belly cargo demand, revenue and handling.');
