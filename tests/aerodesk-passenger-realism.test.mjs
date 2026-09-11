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
  const engine = source.slice(start, end) + `\n;globalThis.__passenger = {\n    newGame,\n    passengerSellableCapacity: typeof passengerSellableCapacity === 'function' ? passengerSellableCapacity : undefined,\n    settlePassengerBookings: typeof settlePassengerBookings === 'function' ? settlePassengerBookings : undefined,\n    deniedBoardingLiability: typeof deniedBoardingLiability === 'function' ? deniedBoardingLiability : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-passenger-realism.vm.js' });
  return context.__passenger;
}

const E = loadEngine();

test('sellable passenger capacity may exceed physical seats but remains tightly bounded', () => {
  assert.equal(typeof E.passengerSellableCapacity, 'function');
  const physical = 180 * 7;
  const sellable = E.passengerSellableCapacity(180, 7);
  assert.ok(sellable > physical);
  assert.ok(sellable <= physical * 1.08);
});

test('booked passengers can no-show before boarding', () => {
  assert.equal(typeof E.settlePassengerBookings, 'function');
  const flow = E.settlePassengerBookings(180, 1, 180, () => 0);
  assert.equal(flow.bookedPassengers, 180);
  assert.ok(flow.noShows > 0);
  assert.equal(flow.showUps + flow.noShows, flow.bookedPassengers);
  assert.equal(flow.deniedBoarding, 0);
});

test('excess show-ups are denied boarding instead of exceeding physical capacity', () => {
  const flow = E.settlePassengerBookings(180, 1, 189, () => 1);
  assert.equal(flow.physicalCapacity, 180);
  assert.equal(flow.boardedPassengers, 180);
  assert.ok(flow.deniedBoarding > 0);
  assert.equal(flow.boardedPassengers + flow.deniedBoarding, flow.showUps);
});

test('denied boarding creates a service-recovery liability', () => {
  assert.equal(typeof E.deniedBoardingLiability, 'function');
  const state = E.newGame('Passenger Air', 'CDG', 1804);
  state.market.fx = { EURUSD: 1.10 };
  const liability = E.deniedBoardingLiability(state, { originId: 'CDG', destId: 'JFK' }, 4);
  assert.equal(liability.deniedPassengers, 4);
  assert.ok(liability.compensationUSD > 0);
  assert.ok(liability.totalUSD > liability.compensationUSD);
});
