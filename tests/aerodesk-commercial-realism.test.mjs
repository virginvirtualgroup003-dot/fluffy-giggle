import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__commercial = {\n    newGame, actionOpenRoute, actionBuyAircraft, actionAssignAircraft, actionSetFrequency,\n    calculateDepreciationExpense: typeof calculateDepreciationExpense === 'function' ? calculateDepreciationExpense : undefined,\n    buildWeeklySchedule: typeof buildWeeklySchedule === 'function' ? buildWeeklySchedule : undefined,\n    deliveryLeadDays: typeof deliveryLeadDays === 'function' ? deliveryLeadDays : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-commercial.vm.js' });
  return context.__commercial;
}

const E = loadEngine();

test('new-aircraft procurement has a material production lead time while operating leases are faster', () => {
  assert.equal(typeof E.deliveryLeadDays, 'function');
  const owned = E.deliveryLeadDays({ category: 'NARROWBODY' }, 'OWNED');
  const leased = E.deliveryLeadDays({ category: 'NARROWBODY' }, 'LEASED');
  assert.ok(owned >= 365, 'new narrowbody delivery should not look like a five-week retail purchase');
  assert.ok(leased >= 21 && leased < owned);
});

test('leasing requires a cash security deposit tracked as a restricted asset', () => {
  let state = E.newGame('Lease Air', 'CDG', 1001);
  state.company.cash = 100e6;
  const before = state.company.cash;
  const result = E.actionBuyAircraft(state, 'A320neo', 'LEASED');
  assert.equal(result.error, null);
  assert.ok(result.state.company.cash < before);
  assert.ok(result.state.finance.leaseDeposits > 0);
  assert.ok(result.state.orders[0].securityDeposit > 0);
});

test('multi-daily frequencies create distinct departure waves instead of duplicate same-time flights', () => {
  assert.equal(typeof E.buildWeeklySchedule, 'function');
  const schedule = E.buildWeeklySchedule(14, 8 * 60 + 30);
  assert.equal(schedule.length, 14);
  for (let day = 0; day < 7; day += 1) {
    const minutes = schedule.filter(slot => slot.dayOfWeek === day).map(slot => slot.minute);
    assert.equal(minutes.length, 2);
    assert.equal(new Set(minutes).size, 2);
  }
});

test('aircraft assignment rejects the wrong fleet type and unavailable aircraft', () => {
  let state = E.newGame('Dispatch Air', 'CDG', 1002);
  state.fleet.push({ id: 'A1', typeId: 'A220-300', ownership: 'OWNED', ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null });
  state.fleet.push({ id: 'A2', typeId: 'A320neo', ownership: 'OWNED', ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'MAINTENANCE', assignedRouteId: null });
  state = E.actionOpenRoute(state, { originId: 'CDG', destId: 'LHR', aircraftTypeId: 'A320neo', frequencyPerWeek: 7, fareStrategy: 'COMPETITIVE', departMinute: 510 });
  const routeId = state.routes.at(-1).id;

  const mismatch = E.actionAssignAircraft(state, 'A1', routeId);
  assert.equal(mismatch.fleet.find(f => f.id === 'A1').assignedRouteId, null);
  assert.ok(mismatch.lastActionError);

  const maintenance = E.actionAssignAircraft(state, 'A2', routeId);
  assert.equal(maintenance.fleet.find(f => f.id === 'A2').assignedRouteId, null);
  assert.ok(maintenance.lastActionError);
});

test('owned aircraft generate non-cash depreciation expense without depreciating leased aircraft', () => {
  assert.equal(typeof E.calculateDepreciationExpense, 'function');
  const state = E.newGame('Accounts Air', 'CDG', 1003);
  state.fleet.push({ id: 'OWN', typeId: 'A220-300', ownership: 'OWNED', ageWeeks: 52, cycles: 0, flightHours: 0, condition: 90, status: 'ACTIVE', assignedRouteId: null });
  state.fleet.push({ id: 'LEASE', typeId: 'A220-300', ownership: 'LEASED', ageWeeks: 52, cycles: 0, flightHours: 0, condition: 90, status: 'ACTIVE', assignedRouteId: null });
  const week = E.calculateDepreciationExpense(state, 7 * 24 * 3600 * 1000);
  assert.ok(week > 0);
  const doubleOwned = JSON.parse(JSON.stringify(state));
  doubleOwned.fleet[1].ownership = 'OWNED';
  assert.ok(E.calculateDepreciationExpense(doubleOwned, 7 * 24 * 3600 * 1000) > week * 1.9);
});
