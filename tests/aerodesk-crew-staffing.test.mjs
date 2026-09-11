import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__crew = {\n    AIRCRAFT_TYPES, DAY_MS, WEEK_MS, newGame,\n    actionHireCrew: typeof actionHireCrew === 'function' ? actionHireCrew : undefined,\n    ensureStaffing: typeof ensureStaffing === 'function' ? ensureStaffing : undefined,\n    crewLegalLimits: typeof crewLegalLimits === 'function' ? crewLegalLimits : undefined,\n    crewCapacityForPeriod: typeof crewCapacityForPeriod === 'function' ? crewCapacityForPeriod : undefined,\n    createCrewPeriodLedger: typeof createCrewPeriodLedger === 'function' ? createCrewPeriodLedger : undefined,\n    reserveCrewForRotation: typeof reserveCrewForRotation === 'function' ? reserveCrewForRotation : undefined,\n    processCrewPipeline: typeof processCrewPipeline === 'function' ? processCrewPipeline : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-crew.vm.js' });
  return context.__crew;
}

const E = loadEngine();
const type = id => E.AIRCRAFT_TYPES.find(t => t.id === id);

test('new airline has a finite flight-deck and cabin-crew establishment', () => {
  const state = E.newGame('Crew Air', 'CDG', 1401);
  assert.ok(state.staffing);
  assert.ok(Number.isInteger(state.staffing.pilots) && state.staffing.pilots > 0);
  assert.ok(Number.isInteger(state.staffing.cabinCrew) && state.staffing.cabinCrew > 0);
  assert.ok(state.staffing.reserveFraction > 0 && state.staffing.reserveFraction < 0.4);
  assert.ok(Array.isArray(state.staffing.pipeline));
});

test('crew capacity is bounded by EASA cumulative duty and flight-time envelopes', () => {
  assert.equal(typeof E.crewLegalLimits, 'function');
  assert.equal(typeof E.crewCapacityForPeriod, 'function');
  const state = E.newGame('Crew Air', 'CDG', 1402);
  state.staffing.pilots = 10;
  state.staffing.cabinCrew = 20;
  state.staffing.reserveFraction = 0;
  const start = Date.UTC(2026, 8, 7);
  const capacity = E.crewCapacityForPeriod(state, start, start + 7 * E.DAY_MS);
  const legal = E.crewLegalLimits(7 * E.DAY_MS);
  assert.ok(capacity.pilotDutyHours <= 10 * legal.dutyHoursPerPerson + 1e-9);
  assert.ok(capacity.pilotFlightHours <= 10 * legal.flightHoursPerPerson + 1e-9);
  assert.ok(capacity.cabinDutyHours <= 20 * legal.dutyHoursPerPerson + 1e-9);
});

test('shared crew ledger refuses rotations once finite pilot or cabin capacity is exhausted', () => {
  assert.equal(typeof E.createCrewPeriodLedger, 'function');
  assert.equal(typeof E.reserveCrewForRotation, 'function');
  const state = E.newGame('Crew Air', 'CDG', 1403);
  state.staffing.pilots = 2;
  state.staffing.cabinCrew = 3;
  state.staffing.reserveFraction = 0;
  const start = Date.UTC(2026, 8, 7);
  const ledger = E.createCrewPeriodLedger(state, start, start + 7 * E.DAY_MS);
  const a220 = type('A220-300');
  let accepted = 0;
  for (let i = 0; i < 30; i += 1) {
    if (E.reserveCrewForRotation(ledger, a220, 2.2)) accepted += 1;
  }
  assert.ok(accepted > 0);
  assert.ok(accepted < 30, 'one cockpit pair and three cabin crew cannot legally cover unlimited weekly rotations');
});

test('crew recruitment has a lead time and does not create qualified staff instantly', () => {
  assert.equal(typeof E.actionHireCrew, 'function');
  const state = E.newGame('Crew Air', 'CDG', 1404);
  const before = state.staffing.pilots;
  const result = E.actionHireCrew(state, { pilots: 4, cabinCrew: 8 });
  assert.equal(result.error, null);
  assert.equal(result.state.staffing.pilots, before);
  assert.equal(result.state.staffing.pipeline.length, 2);
  const pilotBatch = result.state.staffing.pipeline.find(batch => batch.pilots);
  const cabinBatch = result.state.staffing.pipeline.find(batch => batch.cabinCrew);
  assert.ok(pilotBatch.availableAt > cabinBatch.availableAt);
  assert.ok(cabinBatch.availableAt > result.state.meta.lastProcessedAt);
});

test('qualified recruits enter the active establishment only after their pipeline date', () => {
  assert.equal(typeof E.actionHireCrew, 'function');
  assert.equal(typeof E.processCrewPipeline, 'function');
  let state = E.newGame('Crew Air', 'CDG', 1405);
  const result = E.actionHireCrew(state, { pilots: 2, cabinCrew: 4 });
  state = result.state;
  const beforePilots = state.staffing.pilots;
  const beforeCabin = state.staffing.cabinCrew;
  const firstDeliveryAt = Math.min(...state.staffing.pipeline.map(batch => batch.availableAt));
  const finalDeliveryAt = Math.max(...state.staffing.pipeline.map(batch => batch.availableAt));
  E.processCrewPipeline(state, firstDeliveryAt - 1);
  assert.equal(state.staffing.pilots, beforePilots);
  assert.equal(state.staffing.cabinCrew, beforeCabin);
  E.processCrewPipeline(state, firstDeliveryAt);
  assert.equal(state.staffing.pilots, beforePilots);
  assert.equal(state.staffing.cabinCrew, beforeCabin + 4);
  E.processCrewPipeline(state, finalDeliveryAt);
  assert.equal(state.staffing.pilots, beforePilots + 2);
  assert.equal(state.staffing.cabinCrew, beforeCabin + 4);
  assert.equal(state.staffing.pipeline.length, 0);
});

test('legacy saves without staffing are migrated from current fleet establishment', () => {
  assert.equal(typeof E.ensureStaffing, 'function');
  const state = E.newGame('Legacy Crew Air', 'CDG', 1406);
  state.fleet = [
    { id: 'AC1', typeId: 'A350-1000', status: 'ACTIVE' },
    { id: 'AC2', typeId: 'A350-1000', status: 'ACTIVE' },
  ];
  delete state.staffing;
  const staffing = E.ensureStaffing(state);
  assert.ok(staffing.pilots > 12);
  assert.ok(staffing.cabinCrew > 24);
  assert.ok(Array.isArray(staffing.pipeline));
  assert.equal(staffing.pipeline.length, 0);
});
