import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__slots = {\n    newGame, actionOpenRoute,\n    airportCoordinationLevel: typeof airportCoordinationLevel === 'function' ? airportCoordinationLevel : undefined,\n    slotScarcityFactor: typeof slotScarcityFactor === 'function' ? slotScarcityFactor : undefined,\n    slotSeriesRequirements: typeof slotSeriesRequirements === 'function' ? slotSeriesRequirements : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-slots.vm.js' });
  return context.__slots;
}

const E = loadEngine();

test('Heathrow and Charles de Gaulle are treated as Level 3 coordinated airports', () => {
  assert.equal(typeof E.airportCoordinationLevel, 'function');
  assert.equal(E.airportCoordinationLevel('LHR'), 3);
  assert.equal(E.airportCoordinationLevel('CDG'), 3);
});

test('modeled slot scarcity is materially higher in a peak bank than overnight/off-peak', () => {
  assert.equal(typeof E.slotScarcityFactor, 'function');
  const peak = E.slotScarcityFactor('LHR', 8 * 60 + 30);
  const offPeak = E.slotScarcityFactor('LHR', 13 * 60);
  assert.ok(peak > offPeak);
});

test('opening a route at coordinated airports reserves seasonal slot series for each movement', () => {
  let state = E.newGame('Slot Air', 'LHR', 8801);
  state = E.actionOpenRoute(state, {
    originId: 'LHR', destId: 'CDG', aircraftTypeId: 'A220-300',
    frequencyPerWeek: 7, fareStrategy: 'COMPETITIVE', departMinute: 8 * 60 + 30,
  });
  assert.equal(state.routes.length, 1);
  assert.ok(Array.isArray(state.operations?.slotAllocations));
  assert.ok(state.operations.slotAllocations.length >= 14, 'daily round trips should reserve arrival/departure series at coordinated endpoints');
  assert.ok(state.operations.slotAllocations.every(a => a.routeId === state.routes[0].id));
});

test('a saturated coordinated peak bucket rejects another identical series instead of inventing capacity', () => {
  let state = E.newGame('Slot Air', 'LHR', 8802);
  const request = {
    originId: 'LHR', destId: 'CDG', aircraftTypeId: 'A220-300',
    frequencyPerWeek: 7, fareStrategy: 'COMPETITIVE', departMinute: 8 * 60 + 30,
  };
  state = E.actionOpenRoute(state, request);
  assert.equal(state.routes.length, 1);
  state = E.actionOpenRoute(state, request);
  assert.equal(state.routes.length, 1);
  assert.match(state.lastActionError || '', /créneau|slot|capacité/i);
});

test('non-coordinated airports do not require artificial slot allocation records', () => {
  let state = E.newGame('Open Air', 'JNB', 8803);
  state = E.actionOpenRoute(state, {
    originId: 'JNB', destId: 'LOS', aircraftTypeId: 'A220-300',
    frequencyPerWeek: 5, fareStrategy: 'COMPETITIVE', departMinute: 10 * 60,
  });
  assert.equal(state.routes.length, 1);
  assert.equal(state.operations?.slotAllocations?.length || 0, 0);
});
