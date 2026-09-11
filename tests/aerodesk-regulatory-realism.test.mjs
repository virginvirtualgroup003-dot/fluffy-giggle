import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const engine = source.slice(start, end) + `\n;globalThis.__reg = {\n    AIRCRAFT_TYPES, DAY_MS, newGame, distanceBetween, fuelBurnLiters,\n    buildFuelPlan: typeof buildFuelPlan === 'function' ? buildFuelPlan : undefined,\n    minimumOperatingCrew: typeof minimumOperatingCrew === 'function' ? minimumOperatingCrew : undefined,\n    passengerDisruptionCost: typeof passengerDisruptionCost === 'function' ? passengerDisruptionCost : undefined,\n    euPassengerRightsCovered: typeof euPassengerRightsCovered === 'function' ? euPassengerRightsCovered : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-regulatory.vm.js' });
  return context.__reg;
}

const E = loadEngine();

test('dispatch fuel planning includes taxi, contingency and protected turbine final reserve', () => {
  assert.equal(typeof E.buildFuelPlan, 'function');
  const type = E.AIRCRAFT_TYPES.find(t => t.id === 'A320neo');
  const distance = E.distanceBetween('CDG', 'FRA');
  const trip = E.fuelBurnLiters(distance, type);
  const plan = E.buildFuelPlan(distance, type);

  assert.ok(plan.taxiLiters > 0);
  assert.ok(plan.contingencyLiters >= trip * 0.05 - 0.001);
  assert.ok(plan.finalReserveLiters >= type.cruiseBurn * 0.5 - 0.001);
  assert.ok(plan.dispatchLiters > trip + plan.finalReserveLiters);
  assert.ok(plan.expectedBurnLiters < plan.dispatchLiters, 'protected reserve should not be treated as normally burned fuel');
});

test('minimum operating crew respects one cabin crew member per 50 installed passenger seats plus flight deck', () => {
  assert.equal(typeof E.minimumOperatingCrew, 'function');
  const a320 = E.AIRCRAFT_TYPES.find(t => t.id === 'A320neo');
  const crew = E.minimumOperatingCrew(a320);
  assert.equal(crew.flightDeck, 2);
  assert.ok(crew.cabin >= Math.ceil(a320.seats / 50));
  assert.equal(crew.total, crew.flightDeck + crew.cabin);
});

test('EU passenger-rights coverage follows departure airport and EU-carrier arrival rules', () => {
  assert.equal(typeof E.euPassengerRightsCovered, 'function');
  const euCarrier = E.newGame('Paris Air', 'CDG', 912);
  const ukCarrier = E.newGame('London Air', 'LHR', 913);

  assert.equal(E.euPassengerRightsCovered(euCarrier, { originId: 'CDG', destId: 'JFK' }), true);
  assert.equal(E.euPassengerRightsCovered(euCarrier, { originId: 'JFK', destId: 'CDG' }), true);
  assert.equal(E.euPassengerRightsCovered(ukCarrier, { originId: 'JFK', destId: 'CDG' }), false);
});

test('controllable European cancellations create compensation and care liabilities in base currency', () => {
  assert.equal(typeof E.passengerDisruptionCost, 'function');
  const state = E.newGame('Rights Air', 'CDG', 914);
  state.market.fx = { EURUSD: 1.10 };
  const route = { originId: 'CDG', destId: 'FRA' };
  const plan = {
    scheduledFlights: 10,
    operatedFlights: 8,
    cancelledFlights: 2,
    technicalCancellations: 1,
    utilizationCancellations: 1,
    curfewCancellations: 0,
  };
  const cost = E.passengerDisruptionCost(state, route, plan, 1000);
  assert.ok(cost.affectedPassengers > 0);
  assert.ok(cost.compensationUSD >= cost.affectedPassengers * 250 * 1.10 - 0.01);
  assert.ok(cost.totalUSD > cost.compensationUSD, 'care and reaccommodation should be additional liabilities');
});
