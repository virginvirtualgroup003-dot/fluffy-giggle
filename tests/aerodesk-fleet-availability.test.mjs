import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__fleet = {\n    AIRCRAFT_TYPES, newGame, actionBuyAircraft,\n    aircraftCommercialStatus: typeof aircraftCommercialStatus === 'function' ? aircraftCommercialStatus : undefined,\n    commerciallyAvailableAircraftTypes: typeof commerciallyAvailableAircraftTypes === 'function' ? commerciallyAvailableAircraftTypes : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-fleet-availability.vm.js' });
  return context.__fleet;
}

const E = loadEngine();

test('777-9 remains unavailable while certification and first delivery are still pending in 2026', () => {
  assert.equal(typeof E.aircraftCommercialStatus, 'function');
  const status = E.aircraftCommercialStatus('777-9', Date.UTC(2026, 8, 11));
  assert.equal(status.available, false);
  assert.match(status.reason || '', /certification|livraison|service/i);
});

test('A321XLR is commercially available in 2026', () => {
  const status = E.aircraftCommercialStatus('A321XLR', Date.UTC(2026, 8, 11));
  assert.equal(status.available, true);
});

test('procurement rejects an aircraft that has not entered commercial service', () => {
  const state = E.newGame('Certified Air', 'CDG', 991);
  state.meta.currentTime = '2026-09-11T08:00:00.000Z';
  state.meta.lastProcessedAt = Date.UTC(2026, 8, 11, 8);
  const beforeCash = state.company.cash;
  const result = E.actionBuyAircraft(state, '777-9', 'LEASED');
  assert.ok(result.error);
  assert.equal(result.state.orders.length, 0);
  assert.equal(result.state.company.cash, beforeCash);
});

test('commercially available fleet catalogue excludes uncertified types from AI/player selection', () => {
  assert.equal(typeof E.commerciallyAvailableAircraftTypes, 'function');
  const ids = E.commerciallyAvailableAircraftTypes(Date.UTC(2026, 8, 11)).map(t => t.id);
  assert.ok(ids.includes('A321XLR'));
  assert.ok(!ids.includes('777-9'));
});
