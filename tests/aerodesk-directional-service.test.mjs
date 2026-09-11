import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

function loadEngine() {
  const source = fs.readFileSync(new URL('../aerodesk.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('// =============================================================================\n// SIMULATION ENGINE');
  const end = source.indexOf('// =============================================================================\n// UI LAYER');
  const engine = source.slice(start, end) + `\n;globalThis.__directional = {\n    directionalServiceCounts: typeof directionalServiceCounts === 'function' ? directionalServiceCounts : undefined,\n    directionalServiceShares: typeof directionalServiceShares === 'function' ? directionalServiceShares : undefined\n  };`;
  const context = vm.createContext({ console, Date, Math, JSON, Intl, setTimeout, clearTimeout });
  vm.runInContext(engine, context, { filename: 'aerodesk-directional.vm.js' });
  return context.__directional;
}

const E = loadEngine();

test('directional booking counts use rotations rather than both sectors of a round trip', () => {
  assert.equal(typeof E.directionalServiceCounts, 'function');
  const counts = E.directionalServiceCounts({
    scheduledRotations: 7,
    operatedRotations: 6,
    scheduledFlights: 14,
    operatedFlights: 12,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(counts)), { scheduled: 7, operated: 6 });
});

test('directional service shares cannot exceed one because the return sector is not extra demand frequency', () => {
  assert.equal(typeof E.directionalServiceShares, 'function');
  const shares = E.directionalServiceShares({
    scheduledRotations: 7,
    operatedRotations: 5,
    scheduledFlights: 14,
    operatedFlights: 10,
  }, 7);
  assert.equal(shares.bookedShare, 1);
  assert.equal(shares.operatedShare, 5 / 7);
});

test('legacy plans without rotation fields are safely interpreted as paired sectors', () => {
  const counts = E.directionalServiceCounts({ scheduledFlights: 14, operatedFlights: 10 });
  assert.deepEqual(JSON.parse(JSON.stringify(counts)), { scheduled: 7, operated: 5 });
});
