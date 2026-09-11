import fs from 'node:fs';

const path = 'aerodesk.jsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`${label}: expected source block not found`);
  if (source.indexOf(before, first + before.length) !== -1) throw new Error(`${label}: source block is not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  'accounting crew bucket',
  `        laborExpense: 0,\n        maintenanceExpense: 0,`,
  `        laborExpense: 0,\n        crewExpense: 0,\n        maintenanceExpense: 0,`,
);

replaceOnce(
  'recurring costs cash handling',
  `function v3ProcessRecurringCosts(state, elapsedMs) {\n  const days = elapsedMs / DAY_MS;\n  const activeRoutes = state.routes.filter(r => r.status === 'ACTIVE').length;\n  const aircraftCount = state.fleet.length;\n\n  // Labor is modeled as a continuous operating expense rather than a weekly click.\n  const labor =\n    (AERODESK_V3.laborDailyBaseEUR +\n      aircraftCount * AERODESK_V3.laborPerAircraftDailyEUR +\n      activeRoutes * AERODESK_V3.laborPerRouteDailyEUR) * days;\n\n  // Insurance is tied to the current fleet replacement value.\n  const insuredValue = fleetValue(state);\n  const insurance =\n    insuredValue * AERODESK_V3.insuranceAnnualRate * days / 365;\n\n  state.company.cash -= labor + insurance;\n\n  v3BookAccounting(state, 'laborExpense', labor);\n  v3BookAccounting(state, 'insuranceExpense', insurance);\n\n  addLedger(state, state.meta.week, 'LABOR', -labor, 'Personnel et charges opérationnelles');\n  addLedger(state, state.meta.week, 'INSURANCE', -insurance, 'Assurance flotte');\n\n  return state;\n}`,
  `function v3ProcessRecurringCosts(state, elapsedMs) {\n  const days = elapsedMs / DAY_MS;\n  const activeRoutes = state.routes.filter(r => r.status === 'ACTIVE').length;\n  const aircraftCount = state.fleet.length;\n\n  // Labor is modeled as a continuous operating expense rather than a weekly click.\n  const labor =\n    (AERODESK_V3.laborDailyBaseEUR +\n      aircraftCount * AERODESK_V3.laborPerAircraftDailyEUR +\n      activeRoutes * AERODESK_V3.laborPerRouteDailyEUR) * days;\n\n  // Insurance is tied to the current fleet replacement value.\n  const insuredValue = fleetValue(state);\n  const insurance =\n    insuredValue * AERODESK_V3.insuranceAnnualRate * days / 365;\n\n  v3BookAccounting(state, 'laborExpense', labor);\n  v3BookAccounting(state, 'insuranceExpense', insurance);\n\n  addLedger(state, state.meta.week, 'LABOR', -labor, 'Personnel et charges opérationnelles');\n  addLedger(state, state.meta.week, 'INSURANCE', -insurance, 'Assurance flotte');\n\n  return { labor, insurance };\n}`,
);

replaceOnce(
  'ancillary single cash posting',
  `function v3AddAncillaryRevenue(state, passengerRevenue) {\n  const ancillary = passengerRevenue * AERODESK_V3.ancillaryRate;\n  state.company.cash += ancillary;\n  v3BookAccounting(state, 'ancillaryRevenue', ancillary);\n  return ancillary;\n}`,
  `function v3AddAncillaryRevenue(state, passengerRevenue) {\n  const ancillary = passengerRevenue * AERODESK_V3.ancillaryRate;\n  v3BookAccounting(state, 'ancillaryRevenue', ancillary);\n  return ancillary;\n}`,
);

replaceOnce(
  'carbon single cash posting',
  `function v3ApplyCarbonCost(state, fuelLiters) {\n  const tonnesCO2 = fuelLiters * AERODESK_V3.co2KgPerLiterJetA / 1000;\n  const cost = tonnesCO2 * AERODESK_V3.carbonEURPerTonneCO2;\n  state.company.cash -= cost;\n  v3BookAccounting(state, 'taxesExpense', cost);\n  return cost;\n}`,
  `function v3ApplyCarbonCost(state, fuelLiters) {\n  const tonnesCO2 = fuelLiters * AERODESK_V3.co2KgPerLiterJetA / 1000;\n  const cost = tonnesCO2 * AERODESK_V3.carbonEURPerTonneCO2;\n  v3BookAccounting(state, 'taxesExpense', cost);\n  return cost;\n}`,
);

replaceOnce(
  'P&L crew expense',
  `    (a.fuelExpense || 0) +\n    (a.laborExpense || 0) +\n    (a.maintenanceExpense || 0) +`,
  `    (a.fuelExpense || 0) +\n    (a.laborExpense || 0) +\n    (a.crewExpense || 0) +\n    (a.maintenanceExpense || 0) +`,
);

replaceOnce(
  'real-time recurring cost aggregation',
  `  let revenue = 0, costs = 0;\n  v3RefreshOperationalCounters(state);\n  v3ProcessRecurringCosts(state, elapsed);\n  const breakdown = { fuel: 0, crew: 0, maint: 0, airport: 0, handling: 0, leasing: 0, distribution: 0, insurance: 0, overhead: 0, interest: 0 };`,
  `  let revenue = 0, costs = 0;\n  v3RefreshOperationalCounters(state);\n  const breakdown = { fuel: 0, crew: 0, maint: 0, airport: 0, handling: 0, leasing: 0, distribution: 0, insurance: 0, overhead: 0, interest: 0, taxes: 0 };\n  const recurring = v3ProcessRecurringCosts(state, elapsed);\n  costs += recurring.labor + recurring.insurance;\n  breakdown.crew += recurring.labor;\n  breakdown.insurance += recurring.insurance;`,
);

replaceOnce(
  'route accounting crew bucket',
  `    accounting.passengerRevenue = (accounting.passengerRevenue || 0) + routeRev;\n    accounting.fuelExpense = (accounting.fuelExpense || 0) + fuelCost;\n    accounting.maintenanceExpense = (accounting.maintenanceExpense || 0) + maintCost;`,
  `    accounting.passengerRevenue = (accounting.passengerRevenue || 0) + routeRev;\n    accounting.fuelExpense = (accounting.fuelExpense || 0) + fuelCost;\n    accounting.crewExpense = (accounting.crewExpense || 0) + crewCost;\n    accounting.maintenanceExpense = (accounting.maintenanceExpense || 0) + maintCost;`,
);

replaceOnce(
  'carbon breakdown',
  `    breakdown.handling += handlingCost;\n    breakdown.distribution += distributionCost;`,
  `    breakdown.handling += handlingCost;\n    breakdown.distribution += distributionCost;\n    breakdown.taxes += carbonCost;`,
);

replaceOnce(
  'unscheduled maintenance cash and P&L',
  `        const eventCost = type.maintPerHour * 25;\n        state.company.cash -= eventCost;\n        addLedger(state, state.meta.week, 'MAINT_UNSCHEDULED', -eventCost, 'Maintenance non programmée');`,
  `        const eventCost = type.maintPerHour * 25;\n        costs += eventCost;\n        breakdown.maint += eventCost;\n        accounting.maintenanceExpense = (accounting.maintenanceExpense || 0) + eventCost;\n        addLedger(state, state.meta.week, 'MAINT_UNSCHEDULED', -eventCost, 'Maintenance non programmée');`,
);

replaceOnce(
  'leasing and overhead real-time costs',
  `  const fleetValueNow = fleetValue(state);\n  const insurance = 0;\n  const overhead = prorateWeekly(9000 + state.fleet.length * 900 + state.routes.filter(r => r.status === 'ACTIVE').length * 300, elapsed);\n  breakdown.insurance = insurance;\n  breakdown.overhead = overhead;\n  costs += overhead;\n\n  const accounting2 = v3EnsureFinance(state);\n  accounting2.overheadExpense = (accounting2.overheadExpense || 0) + overhead;`,
  `  const leasing = state.fleet\n    .filter(f => f.ownership === 'LEASED')\n    .reduce((sum, f) => sum + prorateWeekly(aircraftType(f.typeId).leaseWeekly, elapsed), 0);\n  const overhead = prorateWeekly(9000 + state.fleet.length * 900 + state.routes.filter(r => r.status === 'ACTIVE').length * 300, elapsed);\n  breakdown.leasing = leasing;\n  breakdown.overhead = overhead;\n  costs += leasing + overhead;\n\n  const accounting2 = v3EnsureFinance(state);\n  accounting2.leasingExpense = (accounting2.leasingExpense || 0) + leasing;\n  accounting2.overheadExpense = (accounting2.overheadExpense || 0) + overhead;`,
);

replaceOnce(
  'finance chart taxes',
  `Autres: Math.round(p.breakdown.handling + p.breakdown.distribution + p.breakdown.insurance + p.breakdown.overhead + p.breakdown.interest + p.breakdown.leasing)`,
  `Autres: Math.round(p.breakdown.handling + p.breakdown.distribution + p.breakdown.insurance + p.breakdown.overhead + p.breakdown.interest + p.breakdown.leasing + (p.breakdown.taxes || 0))`,
);

replaceOnce(
  'React persist declaration order',
  `  const [toasts, setToasts] = useState([]);\n  const toastId = useRef(0);\n  const [saveLabel, setSaveLabel] = useState('');\n\n  useEffect(() => {\n    let timer;\n    (async () => {\n      const saved = await loadSave();\n      if (saved) setState(saved);\n      setLoading(false);\n    })();\n    timer = setInterval(() => {\n      setState(prev => {\n        if (!prev || prev.company.bankrupt) return prev;\n        const next = realTimeTick(prev, Date.now());\n        if (next === prev) return prev;\n        persist(next);\n        return next;\n      });\n    }, 10000);\n    return () => clearInterval(timer);\n  }, [persist]);\n\n  const notify = useCallback((text, tone) => {\n    const id = ++toastId.current;\n    setToasts(t => [...t, { id, text, tone: tone || 'neutral' }]);\n    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);\n  }, []);\n\n  const persist = useCallback(async (s) => {\n    setSaveLabel('Enregistrement…');\n    const ok = await writeSave(s);\n    setSaveLabel(ok ? 'Sauvegardé' : 'Sauvegarde indisponible');\n    setTimeout(() => setSaveLabel(''), 1500);\n  }, []);`,
  `  const [toasts, setToasts] = useState([]);\n  const toastId = useRef(0);\n  const [saveLabel, setSaveLabel] = useState('');\n\n  const persist = useCallback(async (s) => {\n    setSaveLabel('Enregistrement…');\n    const ok = await writeSave(s);\n    setSaveLabel(ok ? 'Sauvegardé' : 'Sauvegarde indisponible');\n    setTimeout(() => setSaveLabel(''), 1500);\n  }, []);\n\n  useEffect(() => {\n    let timer;\n    (async () => {\n      const saved = await loadSave();\n      if (saved) setState(saved);\n      setLoading(false);\n    })();\n    timer = setInterval(() => {\n      setState(prev => {\n        if (!prev || prev.company.bankrupt) return prev;\n        const next = realTimeTick(prev, Date.now());\n        if (next === prev) return prev;\n        persist(next);\n        return next;\n      });\n    }, 10000);\n    return () => clearInterval(timer);\n  }, [persist]);\n\n  const notify = useCallback((text, tone) => {\n    const id = ++toastId.current;\n    setToasts(t => [...t, { id, text, tone: tone || 'neutral' }]);\n    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);\n  }, []);`,
);

if (source.indexOf('const persist = useCallback') > source.indexOf('useEffect(() =>')) {
  throw new Error('persist must be declared before the effect that depends on it');
}
if (source.includes('state.company.cash += ancillary')) throw new Error('ancillary revenue is still double-posted to cash');
if (source.includes('state.company.cash -= cost;\n  v3BookAccounting(state, \'taxesExpense\'')) throw new Error('carbon cost is still double-posted to cash');
if (!source.includes("accounting2.leasingExpense = (accounting2.leasingExpense || 0) + leasing")) throw new Error('leasing expense is not booked');
if (!source.includes("accounting.crewExpense = (accounting.crewExpense || 0) + crewCost")) throw new Error('crew expense is not booked');

fs.writeFileSync(path, source);
console.log('AeroDesk V3 fixes applied successfully.');
