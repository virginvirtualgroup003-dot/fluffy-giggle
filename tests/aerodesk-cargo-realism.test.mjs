import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__cargo = {\n    AIRCRAFT_TYPES, newGame,\n    bellyCargoEconomics: typeof bellyCargoEconomics === 'function' ? bellyCargoEconomics : undefined,\n    cargoLoadFactorTarget: typeof cargoLoadFactorTarget === 'function' ? cargoLoadFactorTarget : undefined,\n    availableBellyCargoKg: typeof availableBellyCargoKg === 'function' ? availableBellyCargoKg : undefined,\n    v3GetPnl: typeof v3GetPnl === 'function' ? v3GetPnl : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-cargo.vm.js' });
  return context.__cargo;
}

const E = loadEngine();
const type = id => E.AIRCRAFT_TYPES.find(t => t.id === id);

test('cargo load-factor target is anchored near current industry utilization rather than assuming a full hold', () => {
  assert.equal(typeof E.cargoLoadFactorTarget, 'function');
  const state = E.newGame('Cargo Air', 'CDG', 1201);
  const target = E.cargoLoadFactorTarget(state, 'CDG', 'JFK');
  assert.ok(target >= 0.40 && target <= 0.65);
});

test('belly cargo never exceeds payload remaining after passenger and baggage traffic load', () => {
  assert.equal(typeof E.bellyCargoEconomics, 'function');
  const state = E.newGame('Cargo Air', 'CDG', 1202);
  const b789 = type('787-9');
  const distanceKm = 6000;
  const economics = E.bellyCargoEconomics(state, b789, 'CDG', 'JFK', distanceKm, 220, 1);
  const physicalLimit = E.availableBellyCargoKg(b789, distanceKm, 220, 'CDG', 'JFK');
  assert.ok(economics.carriedKg <= physicalLimit + 1e-9);
  assert.ok(economics.carriedKg >= 0);
});

test('more passenger payload reduces belly freight carried on the same mission', () => {
  const state = E.newGame('Cargo Air', 'CDG', 1203);
  const b789 = type('787-9');
  const distanceKm = 6500;
  const lightCabin = E.bellyCargoEconomics(state, b789, 'CDG', 'JFK', distanceKm, 80, 1);
  const heavyCabin = E.bellyCargoEconomics(state, b789, 'CDG', 'JFK', distanceKm, 280, 1);
  assert.ok(lightCabin.carriedKg > heavyCabin.carriedKg);
});

test('cargo economics creates revenue and handling cost and P&L has dedicated cargo buckets', () => {
  const state = E.newGame('Cargo Air', 'CDG', 1204);
  const b789 = type('787-9');
  const economics = E.bellyCargoEconomics(state, b789, 'CDG', 'JFK', 5800, 180, 2);
  assert.ok(economics.revenueUSD > 0);
  assert.ok(economics.handlingCostUSD > 0);
  state.finance.accounting.cargoRevenue = economics.revenueUSD;
  state.finance.accounting.cargoHandlingExpense = economics.handlingCostUSD;
  const pnl = E.v3GetPnl(state);
  assert.ok(pnl.revenue >= economics.revenueUSD);
  assert.ok(pnl.expenses >= economics.handlingCostUSD);
});
