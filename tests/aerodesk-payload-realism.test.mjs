import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__payload = {\n    AIRCRAFT_TYPES, newGame, actionOpenRoute, actionAssignAircraft, buildPlayerProducts, distanceBetween,\n    standardTrafficMassPerPassengerKg: typeof standardTrafficMassPerPassengerKg === 'function' ? standardTrafficMassPerPassengerKg : undefined,\n    missionPayloadLimitKg: typeof missionPayloadLimitKg === 'function' ? missionPayloadLimitKg : undefined,\n    payloadLimitedSeats: typeof payloadLimitedSeats === 'function' ? payloadLimitedSeats : undefined,\n    availableBellyCargoKg: typeof availableBellyCargoKg === 'function' ? availableBellyCargoKg : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-payload.vm.js' });
  return context.__payload;
}

const E = loadEngine();
const type = id => E.AIRCRAFT_TYPES.find(t => t.id === id);

test('traffic mass uses EASA-style adult plus checked-baggage standard masses', () => {
  assert.equal(typeof E.standardTrafficMassPerPassengerKg, 'function');
  assert.equal(E.standardTrafficMassPerPassengerKg('CDG', 'FRA'), 97); // 84 + 13 intra-Europe
  assert.equal(E.standardTrafficMassPerPassengerKg('CDG', 'JFK'), 99); // 84 + 15 intercontinental
});

test('payload-range limits sellable seats near published maximum range', () => {
  assert.equal(typeof E.missionPayloadLimitKg, 'function');
  assert.equal(typeof E.payloadLimitedSeats, 'function');
  const a220 = type('A220-300');
  const shortSeats = E.payloadLimitedSeats(a220, 1000, 'CDG', 'FRA');
  const longSeats = E.payloadLimitedSeats(a220, a220.rangeKm * 0.97, 'CDG', 'JFK');
  assert.equal(shortSeats, a220.seats);
  assert.ok(longSeats < shortSeats);
  assert.ok(longSeats > 0);
});

test('market products expose mission-limited passenger capacity instead of nominal seats', () => {
  let state = E.newGame('Payload Air', 'LHR', 771);
  state.fleet.push({ id: 'A1', typeId: 'A321XLR', ownership: 'OWNED', ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null });
  state = E.actionOpenRoute(state, { originId: 'LHR', destId: 'LAX', aircraftTypeId: 'A321XLR', frequencyPerWeek: 3, fareStrategy: 'COMPETITIVE', departMinute: 9 * 60 });
  state = E.actionAssignAircraft(state, 'A1', state.routes.at(-1).id);
  const product = E.buildPlayerProducts(state, 'LHR', 'LAX').find(p => p.legs === 1);
  assert.ok(product);
  assert.ok(product.seats < type('A321XLR').seats);
  assert.ok(product.seats > 0);
});

test('belly cargo can use only payload remaining after passenger and baggage traffic load', () => {
  assert.equal(typeof E.availableBellyCargoKg, 'function');
  const b789 = type('787-9');
  const distance = 6000;
  const emptyCabinCargo = E.availableBellyCargoKg(b789, distance, 0, 'CDG', 'JFK');
  const fullCabinCargo = E.availableBellyCargoKg(b789, distance, 250, 'CDG', 'JFK');
  assert.ok(emptyCabinCargo > fullCabinCargo);
  assert.ok(fullCabinCargo >= 0);
});
