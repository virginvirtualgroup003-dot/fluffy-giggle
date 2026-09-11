import fs from 'node:fs';

const path = 'aerodesk.jsx';
let source = fs.readFileSync(path, 'utf8');

function replaceExact(label, before, after) {
  if (!source.includes(before)) throw new Error(`Missing anchor: ${label}`);
  if (source.split(before).length !== 2) throw new Error(`Anchor not unique: ${label}`);
  source = source.replace(before, after);
}

replaceExact(
  'overbooking capacity',
  `  products.forEach(p => { capacity[p.key] = p.seats * p.freq; });`,
  `  products.forEach(p => { capacity[p.key] = passengerSellableCapacity(p.seats, p.freq); });`,
);

replaceExact(
  'passenger realism helpers',
  `function v3EnsureFinance(state) {`,
  `// Passenger booking behavior is deliberately kept inside the simulation engine.\n// The UI exposes outcomes (loads, disruption and service quality), not the hidden tuning values.\nconst PASSENGER_REALISM_MODEL = {\n  overbookingFraction: 0.05,\n  baseShowUpRate: 0.965,\n  showUpJitter: 0.02,\n  nonEuCompensationBaseUSD: 240,\n  nonEuDistanceRateUSD: 0.045,\n  careUSDPerDenied: 45,\n  reaccommodationBaseUSD: 85,\n};\n\nfunction passengerSellableCapacity(seats, flights = 1) {\n  const installedSeats = Math.max(0, Math.floor(seats || 0));\n  const sectors = Math.max(0, Math.floor(flights || 0));\n  const physicalCapacity = installedSeats * sectors;\n  if (!physicalCapacity) return 0;\n  return Math.max(physicalCapacity, Math.floor(physicalCapacity * (1 + PASSENGER_REALISM_MODEL.overbookingFraction)));\n}\n\nfunction settlePassengerBookings(seats, flights, bookedPassengers, rng = Math.random) {\n  const physicalCapacity = Math.max(0, Math.floor(seats || 0)) * Math.max(0, Math.floor(flights || 0));\n  const sellableCapacity = passengerSellableCapacity(seats, flights);\n  const booked = Math.min(sellableCapacity, Math.max(0, Math.round(bookedPassengers || 0)));\n  let sample = 0.5;\n  if (typeof rng === 'function') {\n    const candidate = Number(rng());\n    if (Number.isFinite(candidate)) sample = clamp(candidate, 0, 1);\n  }\n  const showUpRate = clamp(\n    PASSENGER_REALISM_MODEL.baseShowUpRate + (sample - 0.5) * 2 * PASSENGER_REALISM_MODEL.showUpJitter,\n    0.92,\n    0.995,\n  );\n  const showUps = Math.min(booked, Math.max(0, Math.round(booked * showUpRate)));\n  const noShows = Math.max(0, booked - showUps);\n  const boardedPassengers = Math.min(showUps, physicalCapacity);\n  const deniedBoarding = Math.max(0, showUps - boardedPassengers);\n  return {\n    physicalCapacity, sellableCapacity, bookedPassengers: booked, showUpRate,\n    showUps, noShows, boardedPassengers, deniedBoarding,\n  };\n}\n\nfunction deniedBoardingLiability(state, route, deniedPassengers) {\n  const denied = Math.max(0, Math.round(deniedPassengers || 0));\n  const empty = { deniedPassengers: denied, compensationUSD: 0, careUSD: 0, reaccommodationUSD: 0, totalUSD: 0 };\n  if (!denied || !route) return empty;\n\n  const distanceKm = distanceBetween(route.originId, route.destId);\n  let compensationUSD = 0;\n  let careUSD = 0;\n  let reaccommodationUSD = 0;\n  if (euPassengerRightsCovered(state, route)) {\n    const intraEU = EU_PASSENGER_RIGHTS_AIRPORTS.has(route.originId) && EU_PASSENGER_RIGHTS_AIRPORTS.has(route.destId);\n    const compensationEUR = distanceKm <= 1500 ? 250 : ((intraEU || distanceKm <= 3500) ? 400 : 600);\n    const fx = state.market?.fx?.EURUSD || 1.08;\n    compensationUSD = denied * compensationEUR * fx;\n    careUSD = denied * (25 + Math.min(75, distanceKm / 50)) * fx;\n    reaccommodationUSD = denied * (50 + Math.min(300, distanceKm * 0.04)) * fx;\n  } else {\n    compensationUSD = denied * (PASSENGER_REALISM_MODEL.nonEuCompensationBaseUSD + Math.min(500, distanceKm * PASSENGER_REALISM_MODEL.nonEuDistanceRateUSD));\n    careUSD = denied * PASSENGER_REALISM_MODEL.careUSDPerDenied;\n    reaccommodationUSD = denied * (PASSENGER_REALISM_MODEL.reaccommodationBaseUSD + Math.min(300, distanceKm * 0.03));\n  }\n  return {\n    deniedPassengers: denied, compensationUSD, careUSD, reaccommodationUSD,\n    totalUSD: compensationUSD + careUSD + reaccommodationUSD,\n  };\n}\n\nfunction v3EnsureFinance(state) {`,
);

replaceExact(
  'route passenger flow',
  `    const flights = plan.operatedFlights;\n    const pax = routePax[route.id] || 0;\n    const bookedPax = routeBookedPax[route.id] || pax;\n    const routeRev = routeRevenueValue(routeRevenue, route.id);\n    const disruption = passengerDisruptionCost(state, route, plan, bookedPax);\n    const accounting = v3EnsureFinance(state);`,
  `    const flights = plan.operatedFlights;\n    const operatedBookings = routePax[route.id] || 0;\n    const operationalSeats = payloadLimitedSeats(type, dist, route.originId, route.destId);\n    const passengerFlow = settlePassengerBookings(operationalSeats, flights, operatedBookings, rng);\n    const pax = passengerFlow.boardedPassengers;\n    const bookedPax = routeBookedPax[route.id] || operatedBookings;\n    const routeRev = routeRevenueValue(routeRevenue, route.id);\n    const disruption = passengerDisruptionCost(state, route, plan, bookedPax);\n    const deniedBoarding = deniedBoardingLiability(state, route, passengerFlow.deniedBoarding);\n    const accounting = v3EnsureFinance(state);`,
);

replaceExact(
  'denied boarding accounting',
  `    if (disruption.totalUSD > 0) {\n      costs += disruption.totalUSD;\n      breakdown.disruption += disruption.totalUSD;\n      accounting.disruptionExpense = (accounting.disruptionExpense || 0) + disruption.totalUSD;\n      addLedger(state, state.meta.week, 'PASSENGER_RIGHTS', -disruption.totalUSD, 'Indemnisation, assistance et réacheminement passagers');\n    }\n    if (!flights) {`,
  `    if (disruption.totalUSD > 0) {\n      costs += disruption.totalUSD;\n      breakdown.disruption += disruption.totalUSD;\n      accounting.disruptionExpense = (accounting.disruptionExpense || 0) + disruption.totalUSD;\n      addLedger(state, state.meta.week, 'PASSENGER_RIGHTS', -disruption.totalUSD, 'Indemnisation, assistance et réacheminement passagers');\n    }\n    if (deniedBoarding.totalUSD > 0) {\n      costs += deniedBoarding.totalUSD;\n      breakdown.disruption += deniedBoarding.totalUSD;\n      accounting.disruptionExpense = (accounting.disruptionExpense || 0) + deniedBoarding.totalUSD;\n      addLedger(state, state.meta.week, 'DENIED_BOARDING', -deniedBoarding.totalUSD, 'Refus d’embarquement, assistance et réacheminement');\n    }\n    if (!flights) {`,
);

replaceExact(
  'passenger load factor',
  `    const loadFactor = flights ? pax / (type.seats * flights) : 0;`,
  `    const loadFactor = passengerFlow.physicalCapacity ? pax / passengerFlow.physicalCapacity : 0;`,
);

replaceExact(
  'route passenger history',
  `    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), cargoKg: Math.round(cargo.carriedKg), cargoRevenue: cargo.revenueUSD, revenue: routeRev + ancillary + cargo.revenueUSD, cost: routeCost + carbonCost + disruption.totalUSD, loadFactor, scheduledFlights: plan.scheduledFlights, operatedFlights: flights, cancelledFlights: plan.cancelledFlights, delayedFlights: plan.delayedFlights });`,
  `    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), bookedPax: passengerFlow.bookedPassengers, noShows: passengerFlow.noShows, deniedBoarding: passengerFlow.deniedBoarding, cargoKg: Math.round(cargo.carriedKg), cargoRevenue: cargo.revenueUSD, revenue: routeRev + ancillary + cargo.revenueUSD, cost: routeCost + carbonCost + disruption.totalUSD + deniedBoarding.totalUSD, loadFactor, scheduledFlights: plan.scheduledFlights, operatedFlights: flights, cancelledFlights: plan.cancelledFlights, delayedFlights: plan.delayedFlights });`,
);

fs.writeFileSync(path, source);
