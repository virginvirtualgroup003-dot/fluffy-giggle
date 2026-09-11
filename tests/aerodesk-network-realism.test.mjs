import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__network = {\n    newGame, actionOpenRoute, actionAssignAircraft, buildPlayerProducts,\n    minimumConnectionTimeHours: typeof minimumConnectionTimeHours === 'function' ? minimumConnectionTimeHours : undefined,\n    connectionScheduleMetrics: typeof connectionScheduleMetrics === 'function' ? connectionScheduleMetrics : undefined,\n    airportCongestionFactor: typeof airportCongestionFactor === 'function' ? airportCongestionFactor : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-network.vm.js' });
  return context.__network;
}

const E = loadEngine();

function connectionState(secondDepartureMinute) {
  let state = E.newGame('Hub Air', 'CDG', 2001);
  // The second leg FRA-LHR is a third-country service for a French AOC after Brexit;
  // grant a specific fifth-freedom right so this fixture continues to test connection timing only.
  state.company.trafficRights = state.company.trafficRights || [];
  state.company.trafficRights.push({ originId: 'FRA', destId: 'LHR', kind: 'FIFTH_FREEDOM' });
  state.fleet.push(
    { id: 'A1', typeId: 'A220-300', ownership: 'OWNED', ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null },
    { id: 'A2', typeId: 'A220-300', ownership: 'OWNED', ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null },
  );
  state = E.actionOpenRoute(state, { originId: 'CDG', destId: 'FRA', aircraftTypeId: 'A220-300', frequencyPerWeek: 7, fareStrategy: 'COMPETITIVE', departMinute: 8 * 60 });
  state = E.actionAssignAircraft(state, 'A1', state.routes.at(-1).id);
  state = E.actionOpenRoute(state, { originId: 'FRA', destId: 'LHR', aircraftTypeId: 'A220-300', frequencyPerWeek: 7, fareStrategy: 'COMPETITIVE', departMinute: secondDepartureMinute });
  state = E.actionAssignAircraft(state, 'A2', state.routes.at(-1).id);
  state.meta.currentTime = '2026-01-05T00:00:00.000Z';
  state.meta.lastProcessedAt = Date.parse(state.meta.currentTime);
  return state;
}

test('major hubs require a realistic minimum connection time rather than a universal 45-minute shortcut', () => {
  assert.equal(typeof E.minimumConnectionTimeHours, 'function');
  assert.ok(E.minimumConnectionTimeHours('LHR') >= 1.0);
  assert.ok(E.minimumConnectionTimeHours('FRA') >= 0.75);
});

test('an impossible connection bank is not offered as a sellable itinerary', () => {
  const state = connectionState(9 * 60); // second leg leaves before first-leg arrival + MCT
  const products = E.buildPlayerProducts(state, 'CDG', 'LHR');
  assert.equal(products.filter(p => p.legs === 2).length, 0);
});

test('a feasible bank creates a connection product with frequency and actual waiting time derived from schedules', () => {
  assert.equal(typeof E.connectionScheduleMetrics, 'function');
  const state = connectionState(12 * 60);
  const [first, second] = state.routes;
  const metrics = E.connectionScheduleMetrics(first, second, state.meta.lastProcessedAt);
  assert.ok(metrics.feasibleFrequency >= 1);
  assert.ok(metrics.averageWaitHours >= metrics.mctHours);
  assert.ok(metrics.averageWaitHours <= 8);
  const products = E.buildPlayerProducts(state, 'CDG', 'LHR').filter(p => p.legs === 2);
  assert.equal(products.length, 1);
  assert.equal(products[0].freq, metrics.feasibleFrequency);
});

test('airport congestion is time-of-day sensitive in local airport time', () => {
  assert.equal(typeof E.airportCongestionFactor, 'function');
  const morningPeak = Date.UTC(2026, 0, 5, 8, 0); // 08:00 London local in January
  const midday = Date.UTC(2026, 0, 5, 13, 0);
  assert.ok(E.airportCongestionFactor('LHR', morningPeak) > E.airportCongestionFactor('LHR', midday));
});
