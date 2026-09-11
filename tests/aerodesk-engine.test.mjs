import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  assert.notEqual(start, -1, 'simulation engine marker must exist');
  assert.notEqual(end, -1, 'UI layer marker must exist');

  const engine = source.slice(start, end) + `\n;globalThis.__engine = {\n    AIRPORTS, AIRCRAFT_TYPES, FARE_STRATEGIES, AERODESK_V3, WEEK_MS, DAY_MS,\n    seededRandom, newGame, actionOpenRoute, actionAssignAircraft,\n    buildPlayerProducts, makeProductFromRoute, productFareForSegment, productUtility,\n    computeMarketOutcome, adaptYield, realTimeTick, checkBankruptcy, runCompetitorAI,\n    scheduledDeparturesBetween, seasonalFactor,\n    validateRoutePlan: typeof validateRoutePlan === 'function' ? validateRoutePlan : undefined,\n    buildOperationalPlan: typeof buildOperationalPlan === 'function' ? buildOperationalPlan : undefined\n  };`;

  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-engine.vm.js' });
  return context.__engine;
}

const E = loadEngine();

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function stateWithPlayerRoute() {
  let state = E.newGame('Test Air', 'CDG', 12345);
  state.fleet.push({
    id: 'AC1', typeId: 'A220-300', ownership: 'OWNED', ageWeeks: 0,
    cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null,
  });
  state = E.actionOpenRoute(state, {
    originId: 'CDG', destId: 'LHR', aircraftTypeId: 'A220-300',
    frequencyPerWeek: 7, fareStrategy: 'YIELD_OPTIMIZED', departMinute: 510,
  });
  const routeId = state.routes.at(-1).id;
  state = E.actionAssignAircraft(state, 'AC1', routeId);
  return state;
}

test('yield optimisation is isolated per route and never mutates the global strategy', () => {
  const state = stateWithPlayerRoute();
  const routeA = state.routes[0];
  const routeB = { ...routeA, id: 'R2', _yieldMult: 0.82 };
  const globalBefore = E.FARE_STRATEGIES.YIELD_OPTIMIZED.refMult;

  E.adaptYield(routeA, 0.96);
  assert.equal(E.FARE_STRATEGIES.YIELD_OPTIMIZED.refMult, globalBefore);

  const productA = E.makeProductFromRoute(routeA, 'PLAYER', state.company, [routeA]);
  const productB = E.makeProductFromRoute(routeB, 'PLAYER', state.company, [routeB]);
  assert.notEqual(E.productFareForSegment(productA, 'LEISURE'), E.productFareForSegment(productB, 'LEISURE'));
});

test('market loyalty cache uses the same key format when reading and writing shares', () => {
  const state = stateWithPlayerRoute();
  state.routes[0].fareStrategy = 'COMPETITIVE';
  state.market.competitors = [{
    id: 'C0', name: 'Rival', strategy: 'LOWCOST', hub: 'CDG', theme: '#fff',
    cash: 100e6, reputation: 50, fleet: [],
    routes: [{ id: 'CR0', origin: 'CDG', dest: 'LHR', aircraftTypeId: 'A220-300', freq: 7, fareStrategy: 'COMPETITIVE', history: [] }],
  }];

  const high = clone(state);
  high._priorShareCache = { 'CDG|LHR': { PLAYER: 0.9, 'AI:C0': 0.1 } };
  const low = clone(state);
  low._priorShareCache = { 'CDG|LHR': { PLAYER: 0.1, 'AI:C0': 0.9 } };

  const playerPax = outcome => Object.values(outcome.segments)
    .flatMap(segment => segment.products)
    .filter(product => product.owner === 'PLAYER')
    .reduce((sum, product) => sum + product.pax, 0);

  const highOutcome = E.computeMarketOutcome(high, 'CDG', 'LHR', 20);
  const lowOutcome = E.computeMarketOutcome(low, 'CDG', 'LHR', 20);
  assert.ok(playerPax(highOutcome) > playerPax(lowOutcome), 'prior loyalty must influence market share');
});

test('an active route without an active assigned aircraft is not sold as available capacity', () => {
  let state = E.newGame('Ghost Air', 'CDG', 222);
  state = E.actionOpenRoute(state, {
    originId: 'CDG', destId: 'LHR', aircraftTypeId: 'A220-300',
    frequencyPerWeek: 7, fareStrategy: 'COMPETITIVE', departMinute: 510,
  });
  assert.equal(E.buildPlayerProducts(state, 'CDG', 'LHR').length, 0);
});

test('financial history aggregates repeated realtime ticks into one ISO-week bucket', () => {
  const start = Date.UTC(2026, 0, 5, 12, 0, 0);
  let state = E.newGame('History Air', 'CDG', 333);
  state.meta.lastProcessedAt = start;
  state.meta.currentTime = new Date(start).toISOString();
  state.finance.plHistory = [];
  state.finance.cashHistory = [];

  state = E.realTimeTick(state, start + 10_000);
  state = E.realTimeTick(state, start + 20_000);
  assert.equal(state.finance.plHistory.length, 1);
  assert.equal(state.finance.cashHistory.length, 1);
});

test('bankruptcy requires six weeks of sustained negative cash, not six UI timer ticks', () => {
  const start = Date.UTC(2026, 0, 1);
  const state = E.newGame('Resilience Air', 'CDG', 444);
  state.company.cash = -9e6;

  for (let i = 0; i < 12; i += 1) E.checkBankruptcy(state, start + i * 10_000);
  assert.equal(state.company.bankrupt, false);

  E.checkBankruptcy(state, start + 41 * E.DAY_MS);
  assert.equal(state.company.bankrupt, false);
  E.checkBankruptcy(state, start + 42 * E.DAY_MS);
  assert.equal(state.company.bankrupt, true);
});

test('competitor cash drift is prorated by elapsed time', () => {
  const state = E.newGame('Scale Air', 'CDG', 555);
  const before = state.market.competitors.map(c => c.cash);
  E.runCompetitorAI(state, E.seededRandom(999), {}, 10_000);
  state.market.competitors.forEach((competitor, index) => {
    assert.ok(Math.abs(competitor.cash - before[index]) < 10_000, 'ten seconds must not move competitor cash by a weekly-scale amount');
  });
});

test('connection utility penalises excessive connection slack', () => {
  const baseProduct = {
    owner: 'PLAYER', fareStrategy: 'COMPETITIVE', distanceKm: 1500, freq: 7,
    departSlots: [510], totalTripHours: 4, legs: 2, reputation: 60, otp: 88,
  };
  const marketState = { priorShare: {} };
  const shortConnection = E.productUtility({ ...baseProduct, mctGap: 0.75 }, 'BUSINESS', marketState);
  const longConnection = E.productUtility({ ...baseProduct, mctGap: 3.0 }, 'BUSINESS', marketState);
  assert.ok(shortConnection > longConnection);
});

test('published schedules use airport local time and respect daylight saving time', () => {
  const state = stateWithPlayerRoute();
  const route = state.routes[0];
  route.schedule = [{ dayOfWeek: 1, minute: 8 * 60 + 30 }]; // Monday 08:30 Paris local

  const summer = E.scheduledDeparturesBetween(route, Date.UTC(2026, 6, 6, 6, 29), Date.UTC(2026, 6, 6, 6, 31));
  const winter = E.scheduledDeparturesBetween(route, Date.UTC(2026, 0, 5, 7, 29), Date.UTC(2026, 0, 5, 7, 31));
  assert.equal(summer, 1, '08:30 Europe/Paris should be 06:30 UTC in July');
  assert.equal(winter, 1, '08:30 Europe/Paris should be 07:30 UTC in January');
});

test('route planning blocks real airport curfews and technically impossible missions', () => {
  assert.equal(typeof E.validateRoutePlan, 'function');
  const fraNight = E.validateRoutePlan({ originId: 'FRA', destId: 'CDG', aircraftTypeId: 'A320neo', departMinute: 23 * 60 + 30 });
  assert.ok(fraNight.some(issue => issue.code === 'CURFEW_ORIGIN'));

  const sydNight = E.validateRoutePlan({ originId: 'SYD', destId: 'AKL', aircraftTypeId: 'A320neo', departMinute: 23 * 60 + 30 });
  assert.ok(sydNight.some(issue => issue.code === 'CURFEW_ORIGIN'));

  const impossibleRange = E.validateRoutePlan({ originId: 'LHR', destId: 'JFK', aircraftTypeId: 'ATR72-600', departMinute: 8 * 60 + 30 });
  assert.ok(impossibleRange.some(issue => issue.code === 'RANGE'));
});

test('southern hemisphere leisure seasonality is opposite to northern hemisphere seasonality', () => {
  const northernJanuary = E.seasonalFactor('LEISURE', 2, 49);
  const southernJanuary = E.seasonalFactor('LEISURE', 2, -34);
  assert.ok(southernJanuary > northernJanuary, 'January should be a stronger summer leisure period in the southern hemisphere');
});

test('Jet A carbon factor is volume-correct rather than using the per-kilogram factor as per-litre', () => {
  assert.ok(E.AERODESK_V3.co2KgPerLiterJetA >= 2.45 && E.AERODESK_V3.co2KgPerLiterJetA <= 2.60);
});

test('aircraft utilisation constrains impossible schedules and creates operational cancellations', () => {
  assert.equal(typeof E.buildOperationalPlan, 'function');
  const state = stateWithPlayerRoute();
  const route = state.routes[0];
  route.originId = 'LHR';
  route.destId = 'JFK';
  route.aircraftTypeId = '787-9';
  route.frequencyPerWeek = 21;
  route.schedule = Array.from({ length: 21 }, (_, i) => ({ dayOfWeek: i % 7, minute: 8 * 60 }));
  state.fleet[0].typeId = '787-9';

  const from = Date.UTC(2026, 0, 5, 0, 0);
  const to = from + E.WEEK_MS;
  const plan = E.buildOperationalPlan(state, route, from, to, E.seededRandom(12));
  assert.ok(plan.scheduledFlights > plan.operatedFlights);
  assert.ok(plan.cancelledFlights > 0);
});
