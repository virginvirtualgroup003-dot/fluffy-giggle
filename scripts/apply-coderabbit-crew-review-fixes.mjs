import fs from 'node:fs';

function replaceOnce(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${file}: expected one match, found ${count}`);
  }
  fs.writeFileSync(file, source.replace(before, after));
}

replaceOnce('aerodesk.jsx', `function ensureStaffing(state) {
  if (!state.staffing) {
    state.staffing = {
      pilots: CREW_DEFAULTS.pilots,
      cabinCrew: CREW_DEFAULTS.cabinCrew,
      reserveFraction: CREW_DEFAULTS.reserveFraction,
      pipeline: [],
    };
  }
  if (!Array.isArray(state.staffing.pipeline)) state.staffing.pipeline = [];
  if (!Number.isFinite(state.staffing.reserveFraction)) state.staffing.reserveFraction = CREW_DEFAULTS.reserveFraction;
  return state.staffing;
}
`, `function ensureStaffing(state) {
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
}
`);

replaceOnce('aerodesk.jsx', `  const nowMs = s.meta?.lastProcessedAt || Date.now();
  const leadDays = Math.max(
    pilotCount ? CREW_DEFAULTS.pilotRecruitmentDays : 0,
    cabinCount ? CREW_DEFAULTS.cabinRecruitmentDays : 0,
  );
  s.company.cash -= cost;
  staffing.pipeline.push({ pilots: pilotCount, cabinCrew: cabinCount, cost, orderedAt: nowMs, availableAt: nowMs + leadDays * DAY_MS });
  addLedger(s, s.meta.week, 'CREW_RECRUITMENT', -cost, 'Recrutement, contrôles et qualification équipage');
`, `  const nowMs = s.meta?.lastProcessedAt || Date.now();
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
  addLedger(s, s.meta.week, 'CREW_RECRUITMENT', -cost, 'Recrutement, contrôles et qualification équipage');
`);

replaceOnce('aerodesk.jsx', `  // Long sectors require augmented/rest-capable crewing and generate layover/per-diem expense.
  const hourly = rosteredCrew * 95 * totalBlockHours * augmentation;
  const perDiem = blockPerFlight >= 6 ? rosteredCrew * 75 * flights : 0;
  const layover = blockPerFlight >= 10 ? rosteredCrew * 140 * flights : 0;
  return hourly + perDiem + layover;
`, `  // Base salaries are part of recurring payroll; flight operations carry only variable crew costs.
  const augmentationPremium = rosteredCrew * 95 * totalBlockHours * Math.max(0, augmentation - 1);
  const perDiem = blockPerFlight >= 6 ? rosteredCrew * 75 * flights : 0;
  const layover = blockPerFlight >= 10 ? rosteredCrew * 140 * flights : 0;
  return augmentationPremium + perDiem + layover;
`);

replaceOnce('tests/aerodesk-crew-staffing.test.mjs', `    actionHireCrew: typeof actionHireCrew === 'function' ? actionHireCrew : undefined,
    crewLegalLimits: typeof crewLegalLimits === 'function' ? crewLegalLimits : undefined,
`, `    actionHireCrew: typeof actionHireCrew === 'function' ? actionHireCrew : undefined,
    ensureStaffing: typeof ensureStaffing === 'function' ? ensureStaffing : undefined,
    crewLegalLimits: typeof crewLegalLimits === 'function' ? crewLegalLimits : undefined,
`);

replaceOnce('tests/aerodesk-crew-staffing.test.mjs', `  assert.equal(result.state.staffing.pipeline.length, 1);
  assert.ok(result.state.staffing.pipeline[0].availableAt > result.state.meta.lastProcessedAt);
`, `  assert.equal(result.state.staffing.pipeline.length, 2);
  const pilotBatch = result.state.staffing.pipeline.find(batch => batch.pilots);
  const cabinBatch = result.state.staffing.pipeline.find(batch => batch.cabinCrew);
  assert.ok(pilotBatch.availableAt > cabinBatch.availableAt);
  assert.ok(cabinBatch.availableAt > result.state.meta.lastProcessedAt);
`);

replaceOnce('tests/aerodesk-crew-staffing.test.mjs', `  const deliveryAt = state.staffing.pipeline[0].availableAt;
  E.processCrewPipeline(state, deliveryAt - 1);
  assert.equal(state.staffing.pilots, beforePilots);
  E.processCrewPipeline(state, deliveryAt);
  assert.equal(state.staffing.pilots, beforePilots + 2);
  assert.equal(state.staffing.cabinCrew, beforeCabin + 4);
  assert.equal(state.staffing.pipeline.length, 0);
});
`, `  const firstDeliveryAt = Math.min(...state.staffing.pipeline.map(batch => batch.availableAt));
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
`);

replaceOnce('tests/aerodesk-engine.test.mjs', `test('long-haul crew cost adds augmented staffing when duty exceeds a basic FDP envelope', () => {
  assert.equal(typeof E.crewCostForOperations, 'function');
  const type = E.AIRCRAFT_TYPES.find(t => t.id === '787-9');
  const unaugmentedLinearCost = type.crew * 95 * 14;
  const longHaulCost = E.crewCostForOperations(type, 14, 1);
  assert.ok(longHaulCost > unaugmentedLinearCost * 1.15);
});
`, `test('long-haul crew variable cost is limited to away-from-base operating expenses', () => {
  assert.equal(typeof E.crewCostForOperations, 'function');
  const type = E.AIRCRAFT_TYPES.find(t => t.id === '787-9');
  const unaugmentedLinearCost = type.crew * 95 * 14;
  const longHaulCost = E.crewCostForOperations(type, 14, 1);
  assert.ok(longHaulCost > 0);
  assert.ok(longHaulCost < unaugmentedLinearCost);
});
`);
