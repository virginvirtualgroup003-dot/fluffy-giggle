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


replace_once(
    'fuel planning layer',
'''function fuelBurnLiters(distanceKm, type) {
  const t = blockTimeHours(distanceKm, type.cruiseKmh);
  const cruiseHours = Math.max(0, t - 0.4);
  return type.fixedBurn + type.cruiseBurn * cruiseHours;
}''',
'''function fuelBurnLiters(distanceKm, type) {
  const t = blockTimeHours(distanceKm, type.cruiseKmh);
  const cruiseHours = Math.max(0, t - 0.4);
  return type.fixedBurn + type.cruiseBurn * cruiseHours;
}

function buildFuelPlan(distanceKm, type) {
  const tripLiters = fuelBurnLiters(distanceKm, type);
  const taxiLiters = Math.max(50, type.cruiseBurn * 0.12);
  const contingencyLiters = tripLiters * 0.05;
  const alternateLiters = type.cruiseBurn * 0.25;
  const finalReserveLiters = type.cruiseBurn * 0.5;
  const dispatchLiters = tripLiters + taxiLiters + contingencyLiters + alternateLiters + finalReserveLiters;
  // Reserve and alternate fuel are protected planning quantities, not assumed consumed on every flight.
  const expectedBurnLiters = tripLiters + taxiLiters + contingencyLiters * 0.25;
  return { tripLiters, taxiLiters, contingencyLiters, alternateLiters, finalReserveLiters, dispatchLiters, expectedBurnLiters };
}''')

replace_once(
    'minimum regulatory crew and augmented cost',
'''function crewCostForOperations(type, totalBlockHours, flights) {
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
}''',
'''function minimumOperatingCrew(type) {
  const flightDeck = 2;
  const cabin = Math.max(1, Math.ceil(type.seats / 50));
  return { flightDeck, cabin, total: flightDeck + cabin };
}

function crewCostForOperations(type, totalBlockHours, flights) {
  if (!flights || totalBlockHours <= 0) return 0;
  const blockPerFlight = totalBlockHours / flights;
  const dutyHours = blockPerFlight + 1.5; // report, taxi/turn and post-flight duty proxy
  let augmentation = 1.0;
  if (dutyHours > 17) augmentation = 1.8;
  else if (dutyHours > 15) augmentation = 1.5;
  else if (dutyHours > 13) augmentation = 1.2;

  const regulatoryCrew = minimumOperatingCrew(type).total;
  const rosteredCrew = Math.max(type.crew, regulatoryCrew);
  // Long sectors require augmented/rest-capable crewing and generate layover/per-diem expense.
  const hourly = rosteredCrew * 95 * totalBlockHours * augmentation;
  const perDiem = blockPerFlight >= 6 ? rosteredCrew * 75 * flights : 0;
  const layover = blockPerFlight >= 10 ? rosteredCrew * 140 * flights : 0;
  return hourly + perDiem + layover;
}''')

rights_layer = r'''
const EU_PASSENGER_RIGHTS_AIRPORTS = new Set(['CDG', 'FRA', 'AMS', 'MAD', 'FCO']);

function euPassengerRightsCovered(state, route) {
  const originEU = EU_PASSENGER_RIGHTS_AIRPORTS.has(route.originId);
  const destinationEU = EU_PASSENGER_RIGHTS_AIRPORTS.has(route.destId);
  const carrierEU = EU_PASSENGER_RIGHTS_AIRPORTS.has(state.company.homeBase);
  return originEU || (destinationEU && carrierEU);
}

function passengerDisruptionCost(state, route, plan, bookedPassengers) {
  const empty = { affectedPassengers: 0, eligiblePassengers: 0, compensationUSD: 0, careUSD: 0, reaccommodationUSD: 0, totalUSD: 0 };
  if (!plan?.scheduledFlights || !plan.cancelledFlights || bookedPassengers <= 0 || !euPassengerRightsCovered(state, route)) return empty;

  const cancelledShare = clamp(plan.cancelledFlights / plan.scheduledFlights, 0, 1);
  const affectedPassengers = bookedPassengers * cancelledShare;
  const controllableCancelled = Math.min(
    plan.cancelledFlights,
    (plan.technicalCancellations || 0) + (plan.utilizationCancellations || 0) + (plan.curfewCancellations || 0),
  );
  const eligiblePassengers = bookedPassengers * clamp(controllableCancelled / plan.scheduledFlights, 0, 1);
  const distanceKm = distanceBetween(route.originId, route.destId);
  const intraEU = EU_PASSENGER_RIGHTS_AIRPORTS.has(route.originId) && EU_PASSENGER_RIGHTS_AIRPORTS.has(route.destId);
  const compensationEUR = distanceKm <= 1500 ? 250 : ((intraEU || distanceKm <= 3500) ? 400 : 600);
  const fx = state.market?.fx?.EURUSD || 1.08;

  const compensationUSD = eligiblePassengers * compensationEUR * fx;
  const careEURPerPassenger = 20 + Math.min(80, distanceKm / 40);
  const careUSD = affectedPassengers * careEURPerPassenger * fx;
  const reaccommodationEUR = affectedPassengers * (45 + Math.min(350, distanceKm * 0.05));
  const reaccommodationUSD = reaccommodationEUR * fx;
  return {
    affectedPassengers,
    eligiblePassengers,
    compensationUSD,
    careUSD,
    reaccommodationUSD,
    totalUSD: compensationUSD + careUSD + reaccommodationUSD,
  };
}
'''
replace_once(
    'passenger rights layer',
    "function v3EnsureFinance(state) {",
    rights_layer + "\nfunction v3EnsureFinance(state) {",
)

replace_once(
    'P&L disruption bucket',
    "    (a.distributionExpense || 0) +\n    (a.leasingExpense || 0) +",
    "    (a.distributionExpense || 0) +\n    (a.disruptionExpense || 0) +\n    (a.leasingExpense || 0) +",
)

replace_once(
    'booked passenger map',
    "  const routeRevenue = {};\n  const routePax = {};\n  const compRouteRevenue = {};",
    "  const routeRevenue = {};\n  const routePax = {};\n  const routeBookedPax = {};\n  const compRouteRevenue = {};",
)

replace_once(
    'booked demand before operations',
'''        const departures = product.legs === 1
          ? (routeOperationalPlans[product.route.id]?.operatedFlights || 0)
          : Math.min(routeOperationalPlans[product.route.id]?.operatedFlights || 0, routeOperationalPlans[product.secondRoute.id]?.operatedFlights || 0);
        const flightsShare = departures / freq;
        const pax = weeklyPax * flightsShare;
        const rev = pax * e.fare;
        if (product.legs === 1) {
          routeRevenue[product.route.id] = (routeRevenue[product.route.id] || 0) + rev;
          routePax[product.route.id] = (routePax[product.route.id] || 0) + pax;
        } else {''',
'''        const departures = product.legs === 1
          ? (routeOperationalPlans[product.route.id]?.operatedFlights || 0)
          : Math.min(routeOperationalPlans[product.route.id]?.operatedFlights || 0, routeOperationalPlans[product.secondRoute.id]?.operatedFlights || 0);
        const scheduledDepartures = product.legs === 1
          ? (routeOperationalPlans[product.route.id]?.scheduledFlights || 0)
          : Math.min(routeOperationalPlans[product.route.id]?.scheduledFlights || 0, routeOperationalPlans[product.secondRoute.id]?.scheduledFlights || 0);
        const flightsShare = departures / freq;
        const bookedShare = scheduledDepartures / freq;
        const pax = weeklyPax * flightsShare;
        const bookedPax = weeklyPax * bookedShare;
        const rev = pax * e.fare;
        if (product.legs === 1) {
          routeRevenue[product.route.id] = (routeRevenue[product.route.id] || 0) + rev;
          routePax[product.route.id] = (routePax[product.route.id] || 0) + pax;
          routeBookedPax[product.route.id] = (routeBookedPax[product.route.id] || 0) + bookedPax;
        } else {''')

replace_once(
    'connecting booked demand',
'''          [product.route, product.secondRoute].forEach(leg => {
            routeRevenue[leg.id] = (routeRevenue[leg.id] || 0) + split;
            routePax[leg.id] = (routePax[leg.id] || 0) + pax;
          });''',
'''          [product.route, product.secondRoute].forEach(leg => {
            routeRevenue[leg.id] = (routeRevenue[leg.id] || 0) + split;
            routePax[leg.id] = (routePax[leg.id] || 0) + pax;
            routeBookedPax[leg.id] = (routeBookedPax[leg.id] || 0) + bookedPax;
          });''')

replace_once(
    'disruption breakdown',
    "  const breakdown = { fuel: 0, crew: 0, maint: 0, airport: 0, handling: 0, leasing: 0, distribution: 0, insurance: 0, overhead: 0, interest: 0, taxes: 0 };",
    "  const breakdown = { fuel: 0, crew: 0, maint: 0, airport: 0, handling: 0, leasing: 0, distribution: 0, disruption: 0, insurance: 0, overhead: 0, interest: 0, taxes: 0 };",
)

replace_once(
    'disruption liabilities before early cancellation return',
'''    const flights = plan.operatedFlights;
    const pax = routePax[route.id] || 0;
    const routeRev = routeRevenueValue(routeRevenue, route.id);
    if (!flights) {
      if (plan.scheduledFlights) {
        route.history = route.history || [];
        route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: 0, revenue: 0, cost: 0, loadFactor: 0, scheduledFlights: plan.scheduledFlights, operatedFlights: 0, cancelledFlights: plan.cancelledFlights, delayedFlights: 0 });
        if (route.history.length > 365) route.history.splice(0, route.history.length - 365);
      }
      return;
    }
    const fuelCost = fuelBurnLiters(dist, type) * flights * state.market.fuelPrice;''',
'''    const flights = plan.operatedFlights;
    const pax = routePax[route.id] || 0;
    const bookedPax = routeBookedPax[route.id] || pax;
    const routeRev = routeRevenueValue(routeRevenue, route.id);
    const disruption = passengerDisruptionCost(state, route, plan, bookedPax);
    const accounting = v3EnsureFinance(state);
    if (disruption.totalUSD > 0) {
      costs += disruption.totalUSD;
      breakdown.disruption += disruption.totalUSD;
      accounting.disruptionExpense = (accounting.disruptionExpense || 0) + disruption.totalUSD;
      addLedger(state, state.meta.week, 'PASSENGER_RIGHTS', -disruption.totalUSD, 'Indemnisation, assistance et réacheminement passagers');
    }
    if (!flights) {
      if (plan.scheduledFlights) {
        route.history = route.history || [];
        route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: 0, revenue: 0, cost: disruption.totalUSD, loadFactor: 0, scheduledFlights: plan.scheduledFlights, operatedFlights: 0, cancelledFlights: plan.cancelledFlights, delayedFlights: 0 });
        if (route.history.length > 365) route.history.splice(0, route.history.length - 365);
      }
      return;
    }
    const fuelPlan = buildFuelPlan(dist, type);
    const fuelLitersBurned = fuelPlan.expectedBurnLiters * flights;
    const fuelCost = fuelLitersBurned * state.market.fuelPrice;''')

# accounting is now initialized before the zero-flight branch, so remove the later duplicate declaration.
replace_once(
    'remove duplicate accounting declaration',
    "    const accounting = v3EnsureFinance(state);\n    accounting.passengerRevenue = (accounting.passengerRevenue || 0) + routeRev;",
    "    accounting.passengerRevenue = (accounting.passengerRevenue || 0) + routeRev;",
)

replace_once(
    'carbon uses expected operational burn',
    "    const carbonCost = v3ApplyCarbonCost(state, fuelBurnLiters(dist, type) * flights, route.originId, route.destId);",
    "    const carbonCost = v3ApplyCarbonCost(state, fuelLitersBurned, route.originId, route.destId);",
)

replace_once(
    'route contribution includes passenger-rights costs',
    "    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), revenue: routeRev + ancillary, cost: routeCost + carbonCost, loadFactor, scheduledFlights: plan.scheduledFlights, operatedFlights: flights, cancelledFlights: plan.cancelledFlights, delayedFlights: plan.delayedFlights });",
    "    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), revenue: routeRev + ancillary, cost: routeCost + carbonCost + disruption.totalUSD, loadFactor, scheduledFlights: plan.scheduledFlights, operatedFlights: flights, cancelledFlights: plan.cancelledFlights, delayedFlights: plan.delayedFlights });",
)

# Include disruption liabilities in the finance chart's aggregated 'other' costs.
replace_once(
    'finance chart disruption costs',
    "p.breakdown.handling + p.breakdown.distribution + p.breakdown.insurance + p.breakdown.overhead + p.breakdown.interest + p.breakdown.leasing + (p.breakdown.taxes || 0)",
    "p.breakdown.handling + p.breakdown.distribution + (p.breakdown.disruption || 0) + p.breakdown.insurance + p.breakdown.overhead + p.breakdown.interest + p.breakdown.leasing + (p.breakdown.taxes || 0)",
)

for required in [
    'buildFuelPlan',
    'minimumOperatingCrew',
    'passengerDisruptionCost',
    'euPassengerRightsCovered',
    'disruptionExpense',
    'fuelLitersBurned',
]:
    if required not in source:
        raise RuntimeError(f'missing expected phase-3 behavior: {required}')

path.write_text(source)
print('AeroDesk phase-3 regulatory realism upgrade applied.')
