import fs from 'node:fs';

function mustReplace(file, pattern, replacement, label) {
  const source = fs.readFileSync(file, 'utf8');
  if (!pattern.test(source)) throw new Error(`${file}: missing ${label}`);
  fs.writeFileSync(file, source.replace(pattern, replacement));
}

function insertAfter(file, marker, insertion, label) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(insertion.trim())) return;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`${file}: missing ${label}`);
  fs.writeFileSync(file, source.slice(0, index + marker.length) + insertion + source.slice(index + marker.length));
}

mustReplace('aerodesk.jsx', /function ensureStaffing\(state\) \{\n  if \(!state\.staffing\) \{\n    state\.staffing = \{\n      pilots: CREW_DEFAULTS\.pilots,\n      cabinCrew: CREW_DEFAULTS\.cabinCrew,\n      reserveFraction: CREW_DEFAULTS\.reserveFraction,\n      pipeline: \[\],\n    \};\n  \}\n  if \(!Array\.isArray\(state\.staffing\.pipeline\)\) state\.staffing\.pipeline = \[\];\n  if \(!Number\.isFinite\(state\.staffing\.reserveFraction\)\) state\.staffing\.reserveFraction = CREW_DEFAULTS\.reserveFraction;\n  return state\.staffing;\n\}/, `function ensureStaffing(state) {
  if (!state.staffing) {
    const fleetCrew = (state.fleet || [])
      .filter(f => f.status !== 'RETIRED')
      .reduce((acc, f) => {
        const type = aircraftType(f.typeId);
        if (!type) return acc;
        const crew = minimumOperatingCrew(type);
        return {
          pilots: acc.pilots + crew.flightDeck * 6,
          cabinCrew: acc.cabinCrew + crew.cabin * 6,
        };
      }, { pilots: 0, cabinCrew: 0 });
    state.staffing = {
      pilots: Math.max(CREW_DEFAULTS.pilots, fleetCrew.pilots),
      cabinCrew: Math.max(CREW_DEFAULTS.cabinCrew, fleetCrew.cabinCrew),
      reserveFraction: CREW_DEFAULTS.reserveFraction,
      pipeline: [],
    };
  }
  if (!Array.isArray(state.staffing.pipeline)) state.staffing.pipeline = [];
  if (!Number.isFinite(state.staffing.reserveFraction)) state.staffing.reserveFraction = CREW_DEFAULTS.reserveFraction;
  if (!Number.isFinite(state.staffing.pilots)) state.staffing.pilots = CREW_DEFAULTS.pilots;
  if (!Number.isFinite(state.staffing.cabinCrew)) state.staffing.cabinCrew = CREW_DEFAULTS.cabinCrew;
  return state.staffing;
}`, 'legacy staffing initializer');

mustReplace('aerodesk.jsx', /  const nowMs = s\.meta\?\.lastProcessedAt \|\| Date\.now\(\);\n  const leadDays = Math\.max\(\n    pilotCount \? CREW_DEFAULTS\.pilotRecruitmentDays : 0,\n    cabinCount \? CREW_DEFAULTS\.cabinRecruitmentDays : 0,\n  \);\n  s\.company\.cash -= cost;\n  staffing\.pipeline\.push\(\{ pilots: pilotCount, cabinCrew: cabinCount, cost, orderedAt: nowMs, availableAt: nowMs \+ leadDays \* DAY_MS \}\);\n  addLedger\(s, s\.meta\.week, 'CREW_RECRUITMENT', -cost, 'Recrutement, contrôles et qualification équipage'\);/, `  const nowMs = s.meta?.lastProcessedAt || Date.now();
  s.company.cash -= cost;
  if (pilotCount) {
    staffing.pipeline.push({
      pilots: pilotCount,
      cabinCrew: 0,
      cost: pilotCount * CREW_DEFAULTS.pilotRecruitmentCostUSD,
      orderedAt: nowMs,
      availableAt: nowMs + CREW_DEFAULTS.pilotRecruitmentDays * DAY_MS,
    });
  }
  if (cabinCount) {
    staffing.pipeline.push({
      pilots: 0,
      cabinCrew: cabinCount,
      cost: cabinCount * CREW_DEFAULTS.cabinRecruitmentCostUSD,
      orderedAt: nowMs,
      availableAt: nowMs + CREW_DEFAULTS.cabinRecruitmentDays * DAY_MS,
    });
  }
  addLedger(s, s.meta.week, 'CREW_RECRUITMENT', -cost, 'Recrutement, contrôles et qualification équipage');`, 'crew recruitment pipeline');

mustReplace('aerodesk.jsx', /  \/\/ Long sectors require augmented\/rest-capable crewing and generate layover\/per-diem expense\.\n  const hourly = rosteredCrew \* 95 \* totalBlockHours \* augmentation;\n  const perDiem = blockPerFlight >= 6 \? rosteredCrew \* 75 \* flights : 0;\n  const layover = blockPerFlight >= 10 \? rosteredCrew \* 140 \* flights : 0;\n  return hourly \+ perDiem \+ layover;/, `  // Base salaries are part of recurring payroll; flight operations carry only variable crew costs.
  const augmentationPremium = rosteredCrew * 95 * totalBlockHours * Math.max(0, augmentation - 1);
  const perDiem = blockPerFlight >= 6 ? rosteredCrew * 75 * flights : 0;
  const layover = blockPerFlight >= 10 ? rosteredCrew * 140 * flights : 0;
  return augmentationPremium + perDiem + layover;`, 'crew variable operating cost');

insertAfter('tests/aerodesk-crew-staffing.test.mjs', `    actionHireCrew: typeof actionHireCrew === 'function' ? actionHireCrew : undefined,\n`, `    ensureStaffing: typeof ensureStaffing === 'function' ? ensureStaffing : undefined,\n`, 'ensureStaffing export');

mustReplace('tests/aerodesk-crew-staffing.test.mjs', /  assert\.equal\(result\.state\.staffing\.pipeline\.length, 1\);\n  assert\.ok\(result\.state\.staffing\.pipeline\[0\]\.availableAt > result\.state\.meta\.lastProcessedAt\);/, `  assert.equal(result.state.staffing.pipeline.length, 2);
  const pilotBatch = result.state.staffing.pipeline.find(batch => batch.pilots);
  const cabinBatch = result.state.staffing.pipeline.find(batch => batch.cabinCrew);
  assert.ok(pilotBatch.availableAt > cabinBatch.availableAt);
  assert.ok(cabinBatch.availableAt > result.state.meta.lastProcessedAt);`, 'crew recruitment test');

mustReplace('tests/aerodesk-crew-staffing.test.mjs', /  const deliveryAt = state\.staffing\.pipeline\[0\]\.availableAt;\n  E\.processCrewPipeline\(state, deliveryAt - 1\);\n  assert\.equal\(state\.staffing\.pilots, beforePilots\);\n  E\.processCrewPipeline\(state, deliveryAt\);\n  assert\.equal\(state\.staffing\.pilots, beforePilots \+ 2\);\n  assert\.equal\(state\.staffing\.cabinCrew, beforeCabin \+ 4\);\n  assert\.equal\(state\.staffing\.pipeline\.length, 0\);\n\}\);/, `  const firstDeliveryAt = Math.min(...state.staffing.pipeline.map(batch => batch.availableAt));
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
});`, 'crew delivery test');

mustReplace('tests/aerodesk-engine.test.mjs', /test\('long-haul crew cost adds augmented staffing when duty exceeds a basic FDP envelope', \(\) => \{\n  assert\.equal\(typeof E\.crewCostForOperations, 'function'\);\n  const type = E\.AIRCRAFT_TYPES\.find\(t => t\.id === '787-9'\);\n  const unaugmentedLinearCost = type\.crew \* 95 \* 14;\n  const longHaulCost = E\.crewCostForOperations\(type, 14, 1\);\n  assert\.ok\(longHaulCost > unaugmentedLinearCost \* 1\.15\);\n\}\);/, `test('long-haul crew variable cost is limited to away-from-base operating expenses', () => {
  assert.equal(typeof E.crewCostForOperations, 'function');
  const type = E.AIRCRAFT_TYPES.find(t => t.id === '787-9');
  const unaugmentedLinearCost = type.crew * 95 * 14;
  const longHaulCost = E.crewCostForOperations(type, 14, 1);
  assert.ok(longHaulCost > 0);
  assert.ok(longHaulCost < unaugmentedLinearCost);
});`, 'crew cost regression test');
