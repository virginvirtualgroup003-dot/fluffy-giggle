import fs from 'node:fs';

const path = 'aerodesk.jsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`${label}: expected source block not found`);
  if (source.indexOf(before, first + before.length) !== -1) throw new Error(`${label}: source block is not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  'UTC schedule calculation',
`function scheduledDeparturesBetween(route, fromMs, toMs) {
  let count = 0;
  const start = new Date(fromMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(toMs);
  end.setHours(0, 0, 0, 0);
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY_MS)) {
    const dow = d.getDay();
    (route.schedule || []).forEach(slot => {
      if (slot.dayOfWeek !== dow) return;
      const departure = new Date(d);
      departure.setHours(Math.floor(slot.minute / 60), slot.minute % 60, 0, 0);
      if (departure.getTime() > fromMs && departure.getTime() <= toMs) count += 1;
    });
  }
  return count;
}`,
`function scheduledDeparturesBetween(route, fromMs, toMs) {
  let count = 0;
  const start = new Date(fromMs);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(toMs);
  end.setUTCHours(0, 0, 0, 0);
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY_MS)) {
    const dow = d.getUTCDay();
    (route.schedule || []).forEach(slot => {
      if (slot.dayOfWeek !== dow) return;
      const departure = new Date(d);
      departure.setUTCHours(Math.floor(slot.minute / 60), slot.minute % 60, 0, 0);
      if (departure.getTime() > fromMs && departure.getTime() <= toMs) count += 1;
    });
  }
  return count;
}`,
);

replaceOnce(
  'route availability and multiple direct products',
`function buildPlayerProducts(state, originId, destId) {
  const products = [];
  const direct = state.routes.find(r => r.status === 'ACTIVE' && r.originId === originId && r.destId === destId);
  if (direct) {
    products.push(makeProductFromRoute(direct, 'PLAYER', state.company, [direct]));
  }
  // one-stop via player's own hub(s): any active route origin->hub and hub->dest
  const legsOut = state.routes.filter(r => r.status === 'ACTIVE' && r.originId === originId && r.destId !== destId);
  legsOut.forEach(leg1 => {
    const leg2 = state.routes.find(r => r.status === 'ACTIVE' && r.originId === leg1.destId && r.destId === destId);
    if (leg2 && leg1.destId !== originId) {
      products.push(makeConnectProduct([leg1, leg2], 'PLAYER', state.company));
    }
  });
  return products;
}`,
`function routeHasActiveAircraft(state, route) {
  return state.fleet.some(f => f.assignedRouteId === route.id && f.status === 'ACTIVE');
}

function buildPlayerProducts(state, originId, destId) {
  const products = [];
  const directRoutes = state.routes.filter(r =>
    r.status === 'ACTIVE' && r.originId === originId && r.destId === destId && routeHasActiveAircraft(state, r)
  );
  directRoutes.forEach(route => products.push(makeProductFromRoute(route, 'PLAYER', state.company, [route])));

  // One-stop products are offered only when both operating legs have serviceable aircraft.
  const legsOut = state.routes.filter(r =>
    r.status === 'ACTIVE' && r.originId === originId && r.destId !== destId && routeHasActiveAircraft(state, r)
  );
  legsOut.forEach(leg1 => {
    state.routes
      .filter(r => r.status === 'ACTIVE' && r.originId === leg1.destId && r.destId === destId && routeHasActiveAircraft(state, r))
      .forEach(leg2 => {
        if (leg1.destId !== originId) products.push(makeConnectProduct([leg1, leg2], 'PLAYER', state.company));
      });
  });
  return products;
}`,
);

replaceOnce(
  'route-specific yield fare',
`function productFareForSegment(product, seg) {
  const strat = FARE_STRATEGIES[product.fareStrategy] || FARE_STRATEGIES.COMPETITIVE;
  const ref = fareReference(product.distanceKm) * strat.refMult;
  const p = SEG_PARAMS[seg];
  return ref * p.fareMult;
}`,
`function productFareForSegment(product, seg) {
  const strat = FARE_STRATEGIES[product.fareStrategy] || FARE_STRATEGIES.COMPETITIVE;
  const routeMultiplier = product.fareStrategy === 'YIELD_OPTIMIZED'
    ? (product.route?._yieldMult || strat.refMult)
    : strat.refMult;
  const ref = fareReference(product.distanceKm) * routeMultiplier;
  const p = SEG_PARAMS[seg];
  return ref * p.fareMult;
}`,
);

replaceOnce(
  'yield allocation and connection penalty',
`  const strat = FARE_STRATEGIES[product.fareStrategy] || FARE_STRATEGIES.COMPETITIVE;
  const fare = productFareForSegment(product, seg);
  const availShare = strat.alloc.flex + strat.alloc.prem;
  const valueShare = strat.alloc.deep + strat.alloc.disc;`,
`  const strat = FARE_STRATEGIES[product.fareStrategy] || FARE_STRATEGIES.COMPETITIVE;
  const fare = productFareForSegment(product, seg);
  const alloc = product.fareStrategy === 'YIELD_OPTIMIZED' && product.route?._yieldAlloc
    ? product.route._yieldAlloc
    : strat.alloc;
  const availShare = alloc.flex + alloc.prem;
  const valueShare = alloc.deep + alloc.disc;`,
);
replaceOnce(
  'connection slack penalty',
`    - p.stopPen * (product.legs - 1)
    + p.reputW * (product.reputation - 50) / 50`,
`    - p.stopPen * (product.legs - 1)
    - p.mctPen * Math.max(0, (product.mctGap || 0) - 0.75)
    + p.reputW * (product.reputation - 50) / 50`,
);

replaceOnce('market loyalty cache key', `  const marketKey = originId + '-' + destId;`, `  const marketKey = originId + '|' + destId;`);

replaceOnce(
  'remove recurring ledger flood',
`  addLedger(state, state.meta.week, 'LABOR', -labor, 'Personnel et charges opérationnelles');
  addLedger(state, state.meta.week, 'INSURANCE', -insurance, 'Assurance flotte');

  return { labor, insurance };`,
`  return { labor, insurance };`,
);

replaceOnce(
  'restore maintenance before operations',
`function processRealTimeDay(state, fromMs, toMs, rng) {
  const elapsed = toMs - fromMs;
  const marketKeys = new Set();`,
`function processRealTimeDay(state, fromMs, toMs, rng) {
  const elapsed = toMs - fromMs;
  restoreMaintenanceRealTime(state, toMs);
  const marketKeys = new Set();`,
);

replaceOnce(
  'route contribution history',
`    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), revenue: routeRev, cost: routeCost, loadFactor });`,
`    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), revenue: routeRev + ancillary, cost: routeCost + carbonCost, loadFactor });`,
);

replaceOnce(
  'weekly finance aggregation',
`  state.company.cash += revenue - costs - principalPaid;
  const netIncome = revenue - costs;
  state.finance.plHistory.push({ week: state.meta.week, time: new Date(toMs).toISOString(), revenue, costs, netIncome, breakdown });
  if (state.finance.plHistory.length > 365) state.finance.plHistory.splice(0, state.finance.plHistory.length - 365);
  state.finance.cashHistory.push({ week: state.meta.week, time: new Date(toMs).toISOString(), cash: state.company.cash });
  if (state.finance.cashHistory.length > 730) state.finance.cashHistory.splice(0, state.finance.cashHistory.length - 730);
  if (revenue || costs) {
    addLedger(state, state.meta.week, 'REVENUE', revenue, 'Recettes en temps réel');
    addLedger(state, state.meta.week, 'COSTS', -costs, 'Coûts en temps réel');
  }

  state.fleet.forEach(f => { f.ageWeeks = (f.ageWeeks || 0) + elapsed / WEEK_MS; });
  state.operations.activeFlights = state.routes.filter(r => r.status === 'ACTIVE').length;
  runCompetitorAI(state, rng, compRouteRevenue);
  updateReputationAndOtp(state, rng);
  maybeTriggerEvent(state, rng);`,
`  state.company.cash += revenue - costs - principalPaid;
  const netIncome = revenue - costs;
  upsertWeeklyFinanceHistory(state, toMs, revenue, costs, netIncome, breakdown);

  state.fleet.forEach(f => { f.ageWeeks = (f.ageWeeks || 0) + elapsed / WEEK_MS; });
  state.operations.activeFlights = 0;
  runCompetitorAI(state, rng, compRouteRevenue, elapsed);
  updateReputationAndOtp(state, rng, elapsed);
  maybeTriggerEvent(state, rng, elapsed);`,
);

replaceOnce(
  'bankruptcy elapsed time call',
`  checkBankruptcy(state);
  return state;`,
`  checkBankruptcy(state, target);
  return state;`,
);

replaceOnce(
  'finance helper insertion',
`function routeRevenueValue(map, id) { return map[id] || 0; }`,
`function upsertWeeklyFinanceHistory(state, toMs, revenue, costs, netIncome, breakdown) {
  const date = new Date(toMs);
  const week = getISOWeek(date);
  const year = date.getUTCFullYear();
  const periodKey = year + '-W' + String(week).padStart(2, '0');
  const time = date.toISOString();
  const last = state.finance.plHistory[state.finance.plHistory.length - 1];

  if (last?.periodKey === periodKey) {
    last.time = time;
    last.revenue += revenue;
    last.costs += costs;
    last.netIncome += netIncome;
    Object.keys(breakdown).forEach(key => { last.breakdown[key] = (last.breakdown[key] || 0) + (breakdown[key] || 0); });
  } else {
    state.finance.plHistory.push({ periodKey, year, week, time, revenue, costs, netIncome, breakdown: { ...breakdown } });
  }
  if (state.finance.plHistory.length > 156) state.finance.plHistory.splice(0, state.finance.plHistory.length - 156);

  const cashLast = state.finance.cashHistory[state.finance.cashHistory.length - 1];
  if (cashLast?.periodKey === periodKey) {
    cashLast.time = time;
    cashLast.cash = state.company.cash;
  } else {
    state.finance.cashHistory.push({ periodKey, year, week, time, cash: state.company.cash });
  }
  if (state.finance.cashHistory.length > 156) state.finance.cashHistory.splice(0, state.finance.cashHistory.length - 156);
}

function routeRevenueValue(map, id) { return map[id] || 0; }`,
);

replaceOnce(
  'delivery countdown and maintenance restoration',
`function processDeliveriesRealTime(state, nowMs) {
  state.orders = state.orders.filter(o => {
    if (!o.deliveryAt) o.deliveryAt = nowMs + Math.max(1, o.weeksLeft || 1) * 7 * DAY_MS;
    if (o.deliveryAt <= nowMs) {
      state.fleet.push({ id: 'AC' + (state.company.nextAircraftSerial++), typeId: o.typeId, ownership: o.ownership, ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null });
      state.log.push({ week: state.meta.week, type: 'DELIVERY', text: `Livraison d'un ${aircraftType(o.typeId).name}.` });
      return false;
    }
    return true;
  });
}`,
`function processDeliveriesRealTime(state, nowMs) {
  state.orders = state.orders.filter(o => {
    if (!o.deliveryAt) o.deliveryAt = nowMs + Math.max(1, o.weeksLeft || 1) * WEEK_MS;
    o.weeksLeft = Math.max(0, (o.deliveryAt - nowMs) / WEEK_MS);
    if (o.deliveryAt <= nowMs) {
      state.fleet.push({ id: 'AC' + (state.company.nextAircraftSerial++), typeId: o.typeId, ownership: o.ownership, ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null });
      state.log.push({ week: state.meta.week, type: 'DELIVERY', text: `Livraison d'un ${aircraftType(o.typeId).name}.` });
      return false;
    }
    return true;
  });
}

function restoreMaintenanceRealTime(state, nowMs) {
  state.fleet.forEach(f => {
    if (f.status !== 'MAINTENANCE' || !f.maintUntil || f.maintUntil > nowMs) return;
    f.status = 'ACTIVE';
    f.condition = clamp(f.condition + 20, 0, 100);
    delete f.maintUntil;
    state.log.push({ week: state.meta.week, type: 'MAINT', text: `${f.id} est remis en service après maintenance.` });
  });
}`,
);

replaceOnce(
  'route-specific yield adaptation',
`function adaptYield(route, loadFactor) {
  route._yieldMult = route._yieldMult || 1.0;
  route._yieldAlloc = route._yieldAlloc || { ...FARE_STRATEGIES.YIELD_OPTIMIZED.alloc };
  if (loadFactor > 0.88) {
    route._yieldMult = clamp(route._yieldMult + 0.015, 0.9, 1.35);
  } else if (loadFactor < 0.55) {
    route._yieldMult = clamp(route._yieldMult - 0.015, 0.75, 1.1);
  }
  FARE_STRATEGIES.YIELD_OPTIMIZED.refMult = route._yieldMult; // simplified single global adaptive dial
}`,
`function adaptYield(route, loadFactor) {
  const base = FARE_STRATEGIES.YIELD_OPTIMIZED;
  route._yieldMult = route._yieldMult || base.refMult;
  route._yieldAlloc = route._yieldAlloc || { ...base.alloc };
  if (loadFactor > 0.88) {
    route._yieldMult = clamp(route._yieldMult + 0.015, 0.9, 1.35);
    route._yieldAlloc.deep = clamp(route._yieldAlloc.deep - 0.01, 0.03, 0.25);
    route._yieldAlloc.prem = clamp(route._yieldAlloc.prem + 0.01, 0.08, 0.30);
  } else if (loadFactor < 0.55) {
    route._yieldMult = clamp(route._yieldMult - 0.015, 0.75, 1.1);
    route._yieldAlloc.deep = clamp(route._yieldAlloc.deep + 0.01, 0.08, 0.35);
    route._yieldAlloc.prem = clamp(route._yieldAlloc.prem - 0.01, 0.04, 0.20);
  }
}`,
);

replaceOnce(
  'elapsed scaling helper and reputation',
`function updateReputationAndOtp(state, rng) {
  const fleetCondition = state.fleet.length ? state.fleet.reduce((s, f) => s + f.condition, 0) / state.fleet.length : 85;
  const targetOtp = clamp(78 + fleetCondition / 6 - state.routes.filter(r => r.status === 'ACTIVE').length * 0.25 + (rng() - 0.5) * 6, 45, 98);
  state.company.otp = state.company.otp + (targetOtp - state.company.otp) * 0.3;
  const targetRep = clamp(40 + state.company.otp * 0.5, 0, 100);
  state.company.reputation = clamp(state.company.reputation + (targetRep - state.company.reputation) * 0.06, 0, 100);
}

function runCompetitorAI(state, rng, compRouteRevenue) {`,
`function probabilityForElapsed(periodProbability, elapsedMs) {
  const periods = Math.max(0, elapsedMs / WEEK_MS);
  return 1 - Math.pow(1 - periodProbability, periods);
}

function updateReputationAndOtp(state, rng, elapsedMs = WEEK_MS) {
  const periods = Math.max(0, elapsedMs / WEEK_MS);
  const fleetCondition = state.fleet.length ? state.fleet.reduce((s, f) => s + f.condition, 0) / state.fleet.length : 85;
  const targetOtp = clamp(78 + fleetCondition / 6 - state.routes.filter(r => r.status === 'ACTIVE').length * 0.25 + (rng() - 0.5) * 6, 45, 98);
  const otpAlpha = 1 - Math.pow(1 - 0.3, periods);
  state.company.otp = state.company.otp + (targetOtp - state.company.otp) * otpAlpha;
  const targetRep = clamp(40 + state.company.otp * 0.5, 0, 100);
  const repAlpha = 1 - Math.pow(1 - 0.06, periods);
  state.company.reputation = clamp(state.company.reputation + (targetRep - state.company.reputation) * repAlpha, 0, 100);
}

function runCompetitorAI(state, rng, compRouteRevenue, elapsedMs = WEEK_MS) {`,
);

replaceOnce(
  'competitor elapsed scaling',
`      const cost = fuelBurnLiters(distanceBetween(r.origin, r.dest), type) * r.freq * state.market.fuelPrice * 1.3;
      const margin = rev - cost;
      if (margin < -cost * 0.3 && rng() < 0.25) {
        r.fareStrategy = r.fareStrategy === 'PREMIUM' ? 'COMPETITIVE' : r.fareStrategy === 'COMPETITIVE' ? 'VALUE' : r.fareStrategy;
      } else if (margin > cost * 0.5 && rng() < 0.15) {
        r.fareStrategy = r.fareStrategy === 'VALUE' ? 'COMPETITIVE' : r.fareStrategy === 'COMPETITIVE' ? 'PREMIUM' : r.fareStrategy;
      }
    });
    c.cash += (rng() - 0.42) * 1.5e6; // coarse abstracted cashflow drift for AI companies
    if (rng() < 0.01 && c.routes.length < 14 && c.cash > 60e6) {`,
`      const periods = elapsedMs / WEEK_MS;
      const cost = fuelBurnLiters(distanceBetween(r.origin, r.dest), type) * r.freq * state.market.fuelPrice * 1.3 * periods;
      const margin = rev - cost;
      if (margin < -cost * 0.3 && rng() < probabilityForElapsed(0.25, elapsedMs)) {
        r.fareStrategy = r.fareStrategy === 'PREMIUM' ? 'COMPETITIVE' : r.fareStrategy === 'COMPETITIVE' ? 'VALUE' : r.fareStrategy;
      } else if (margin > cost * 0.5 && rng() < probabilityForElapsed(0.15, elapsedMs)) {
        r.fareStrategy = r.fareStrategy === 'VALUE' ? 'COMPETITIVE' : r.fareStrategy === 'COMPETITIVE' ? 'PREMIUM' : r.fareStrategy;
      }
    });
    c.cash += (rng() - 0.42) * 1.5e6 * (elapsedMs / WEEK_MS);
    if (rng() < probabilityForElapsed(0.01, elapsedMs) && c.routes.length < 14 && c.cash > 60e6) {`,
);

replaceOnce(
  'event elapsed scaling',
`function maybeTriggerEvent(state, rng) {
  if (rng() < 0.05) {`,
`function maybeTriggerEvent(state, rng, elapsedMs = WEEK_MS) {
  if (rng() < probabilityForElapsed(0.05, elapsedMs)) {`,
);

replaceOnce(
  'bankruptcy duration',
`function checkBankruptcy(state) {
  if (state.company.cash < -8e6) {
    state.company._negativeStreak = (state.company._negativeStreak || 0) + 1;
  } else {
    state.company._negativeStreak = 0;
  }
  if (state.company._negativeStreak >= 6) {
    state.company.bankrupt = true;
    state.log.push({ week: state.meta.week, type: 'BANKRUPTCY', text: `Trésorerie négative prolongée : la compagnie est en cessation de paiements.` });
  }
}`,
`function checkBankruptcy(state, nowMs = Date.now()) {
  if (state.company.cash < -8e6) {
    if (!state.company.negativeCashSince) state.company.negativeCashSince = nowMs;
  } else {
    state.company.negativeCashSince = null;
    return;
  }
  if (!state.company.bankrupt && nowMs - state.company.negativeCashSince >= 6 * WEEK_MS) {
    state.company.bankrupt = true;
    state.log.push({ week: state.meta.week, type: 'BANKRUPTCY', text: `Trésorerie négative prolongée : la compagnie est en cessation de paiements.` });
  }
}`,
);

replaceOnce(
  'browser persistence fallback',
`async function loadSave() {
  try {
    const res = await window.storage.get(SAVE_KEY, false);
    if (!res) return null;
    return JSON.parse(res.value);
  } catch (e) {
    return null;
  }
}
async function writeSave(state) {
  try {
    await window.storage.set(SAVE_KEY, JSON.stringify(state), false);
    return true;
  } catch (e) {
    return false;
  }
}
async function clearSave() {
  try { await window.storage.delete(SAVE_KEY, false); } catch (e) { /* noop */ }
}`,
`async function loadSave() {
  try {
    if (window.storage?.get) {
      const res = await window.storage.get(SAVE_KEY, false);
      if (res?.value) return JSON.parse(res.value);
    }
  } catch (e) { /* fall through to localStorage */ }
  try {
    const raw = window.localStorage?.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
async function writeSave(state) {
  const payload = JSON.stringify(state);
  try {
    if (window.storage?.set) {
      await window.storage.set(SAVE_KEY, payload, false);
      return true;
    }
  } catch (e) { /* fall through to localStorage */ }
  try {
    window.localStorage?.setItem(SAVE_KEY, payload);
    return true;
  } catch (e) {
    return false;
  }
}
async function clearSave() {
  try { if (window.storage?.delete) await window.storage.delete(SAVE_KEY, false); } catch (e) { /* noop */ }
  try { window.localStorage?.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}`,
);

replaceOnce(
  'delivery display precision',
`<tr key={i}><td>{aircraftType(o.typeId).name}</td><td>{o.ownership === 'OWNED' ? 'Propriété' : 'Location'}</td><td>{o.weeksLeft} semaine(s)</td></tr>`,
`<tr key={i}><td>{aircraftType(o.typeId).name}</td><td>{o.ownership === 'OWNED' ? 'Propriété' : 'Location'}</td><td>{Math.max(0, o.weeksLeft || 0).toFixed(1)} semaine(s)</td></tr>`,
);

if (source.includes("FARE_STRATEGIES.YIELD_OPTIMIZED.refMult = route._yieldMult")) throw new Error('global yield mutation remains');
if (source.includes("const marketKey = originId + '-' + destId")) throw new Error('market cache key mismatch remains');
if (!source.includes('routeHasActiveAircraft(state, route)')) throw new Error('route availability guard missing');
if (!source.includes('upsertWeeklyFinanceHistory(state, toMs')) throw new Error('weekly finance aggregation missing');
if (!source.includes('negativeCashSince')) throw new Error('bankruptcy duration tracking missing');
if (!source.includes('probabilityForElapsed')) throw new Error('elapsed probability scaling missing');

fs.writeFileSync(path, source);
console.log('AeroDesk V3 comprehensive improvement patch applied.');
