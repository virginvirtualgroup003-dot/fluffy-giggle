import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__rights = {\n    newGame, actionOpenRoute,\n    trafficRightStatus: typeof trafficRightStatus === 'function' ? trafficRightStatus : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-rights.vm.js' });
  return context.__rights;
}

const E = loadEngine();

test('new airline AOC country is derived from its licensed home base', () => {
  const state = E.newGame('Rights Air', 'CDG', 1301);
  assert.equal(state.company.aocCountry, 'France');
  assert.ok(Array.isArray(state.company.trafficRights));
});

test('home-state international services are allowed under third/fourth-freedom baseline', () => {
  assert.equal(typeof E.trafficRightStatus, 'function');
  const state = E.newGame('Rights Air', 'CDG', 1302);
  const right = E.trafficRightStatus(state, 'CDG', 'JFK');
  assert.equal(right.allowed, true);
  assert.match(right.basis, /3|4|home/i);
});

test('Community carrier may operate an intra-EU service away from its home member state', () => {
  const state = E.newGame('Rights Air', 'CDG', 1303);
  const right = E.trafficRightStatus(state, 'FRA', 'MAD');
  assert.equal(right.allowed, true);
  assert.match(right.basis, /EU|commun/i);
});

test('foreign domestic cabotage is denied unless a specific traffic right exists', () => {
  const state = E.newGame('Rights Air', 'CDG', 1304);
  const denied = E.trafficRightStatus(state, 'JFK', 'LAX');
  assert.equal(denied.allowed, false);
  assert.match(denied.reason || '', /cabotage|droit|autorisation/i);

  state.company.trafficRights.push({ originId: 'JFK', destId: 'LAX', kind: 'CABOTAGE' });
  const granted = E.trafficRightStatus(state, 'JFK', 'LAX');
  assert.equal(granted.allowed, true);
});

test('route opening enforces traffic rights rather than silently granting global market access', () => {
  let state = E.newGame('Rights Air', 'CDG', 1305);
  state = E.actionOpenRoute(state, {
    originId: 'JFK', destId: 'LAX', aircraftTypeId: 'A320neo',
    frequencyPerWeek: 3, fareStrategy: 'COMPETITIVE', departMinute: 10 * 60,
  });
  assert.equal(state.routes.length, 0);
  assert.match(state.lastActionError || '', /cabotage|droit|autorisation/i);
});
