import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__rotation = {\n    DAY_MS, WEEK_MS, AIRCRAFT_TYPES, newGame, actionOpenRoute, actionAssignAircraft,\n    buildOperationalPlan, buildPlayerProducts, realTimeTick, seededRandom, distanceBetween, blockTimeHours,\n    returnDepartureSlots: typeof returnDepartureSlots === 'function' ? returnDepartureSlots : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-rotation.vm.js' });
  return context.__rotation;
}

const E = loadEngine();

function stateWithRoute(originId = 'CDG', destId = 'LHR', typeId = 'A220-300', frequency = 7) {
  let state = E.newGame('Rotation Air', originId, 3001);
  state.fleet.push({ id: 'A1', typeId, ownership: 'OWNED', ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null });
  state = E.actionOpenRoute(state, { originId, destId, aircraftTypeId: typeId, frequencyPerWeek: frequency, fareStrategy: 'COMPETITIVE', departMinute: 8 * 60 + 30 });
  state = E.actionAssignAircraft(state, 'A1', state.routes.at(-1).id);
  return state;
}

test('a published route is operated as physical round trips and returns the tail to origin', () => {
  const state = stateWithRoute();
  const route = state.routes[0];
  const from = Date.UTC(2026, 0, 5, 0, 0);
  const plan = E.buildOperationalPlan(state, route, from, from + E.WEEK_MS, () => 0.99);
  assert.equal(plan.scheduledFlights, plan.scheduledRotations * 2);
  assert.equal(plan.operatedFlights, plan.operatedRotations * 2);
  assert.equal(plan.operatedDepartureTimes.length, plan.operatedFlights);
  assert.ok(plan.returnDepartureTimes.length === plan.operatedRotations);
});

test('one aircraft capacity is based on complete round-trip duty rather than independent one-way sectors', () => {
  const state = stateWithRoute('CDG', 'JFK', '787-9', 7);
  const route = state.routes[0];
  const from = Date.UTC(2026, 0, 5, 0, 0);
  const plan = E.buildOperationalPlan(state, route, from, from + E.WEEK_MS, () => 0.99);
  assert.ok(plan.operatedRotations < 7, 'a single tail cannot sustain seven CDG-JFK round trips inside the service-hours envelope');
  assert.ok(plan.utilizationCancellations > 0);
});

test('a route sells direct service in both directions using a derived return schedule', () => {
  assert.equal(typeof E.returnDepartureSlots, 'function');
  const state = stateWithRoute('CDG', 'LHR', 'A220-300', 7);
  state.meta.lastProcessedAt = Date.UTC(2026, 0, 5, 0, 0);
  const outbound = E.buildPlayerProducts(state, 'CDG', 'LHR').filter(p => p.legs === 1);
  const inbound = E.buildPlayerProducts(state, 'LHR', 'CDG').filter(p => p.legs === 1);
  assert.equal(outbound.length, 1);
  assert.equal(inbound.length, 1);
  assert.notEqual(outbound[0].key, inbound[0].key);
  assert.equal(inbound[0].direction, 'RETURN');
  assert.ok(inbound[0].departSlots.length > 0);
});

test('a realtime week books tail cycles and hours for both sectors of each operated rotation', () => {
  const start = Date.UTC(2026, 0, 5, 0, 0);
  let state = stateWithRoute('CDG', 'LHR', 'A220-300', 7);
  state.meta.lastProcessedAt = start;
  state.meta.currentTime = new Date(start).toISOString();
  state.fleet[0].cycles = 0;
  state.fleet[0].flightHours = 0;
  const next = E.realTimeTick(state, start + E.WEEK_MS);
  const history = next.routes[0].history;
  const operatedSectors = history.reduce((sum, item) => sum + (item.operatedFlights || 0), 0);
  const blockPerSector = E.blockTimeHours(E.distanceBetween('CDG', 'LHR'), E.AIRCRAFT_TYPES.find(t => t.id === 'A220-300').cruiseKmh);
  assert.equal(next.fleet[0].cycles, operatedSectors);
  assert.ok(Math.abs(next.fleet[0].flightHours - operatedSectors * blockPerSector) < 0.01);
  assert.ok(operatedSectors % 2 === 0);
});
