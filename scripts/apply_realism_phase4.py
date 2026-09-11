from pathlib import Path
import re

path = Path('aerodesk.jsx')
source = path.read_text()


def replace_once(label, old, new):
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one occurrence, found {count}')
    source = source.replace(old, new, 1)


def regex_once(label, pattern, replacement):
    global source
    updated, count = re.subn(pattern, lambda m: replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected one regex match, found {count}')
    source = updated


replace_once(
    'finance opening balances and depreciation account',
'''    finance: {
      loans: [],
      cashHistory: [{ week: 0, cash: 45e6 }],''',
'''    finance: {
      loans: [],
      leaseDeposits: 0,
      cashHistory: [{ week: 0, cash: 45e6 }],''')
replace_once(
    'depreciation accounting bucket',
'''        distributionExpense: 0,
        leasingExpense: 0,''',
'''        distributionExpense: 0,
        disruptionExpense: 0,
        depreciationExpense: 0,
        leasingExpense: 0,''')

schedule_helpers = r'''
function buildWeeklySchedule(frequencyPerWeek, baseMinute) {
  const frequency = Math.max(1, Math.round(frequencyPerWeek));
  const dailyCounts = Array(7).fill(Math.floor(frequency / 7));
  for (let i = 0; i < frequency % 7; i += 1) dailyCounts[i] += 1;
  const schedule = [];
  dailyCounts.forEach((count, dayOfWeek) => {
    if (!count) return;
    const spacing = count === 1 ? 0 : Math.min(600, Math.floor(720 / (count - 1)));
    let first = baseMinute;
    if (count > 1) first = clamp(baseMinute - spacing * (count - 1) / 2, 360, 21 * 60);
    for (let wave = 0; wave < count; wave += 1) {
      const minute = Math.round(clamp(first + wave * spacing, 300, 23 * 60 + 30));
      schedule.push({ dayOfWeek, minute });
    }
  });
  return schedule;
}

function deliveryLeadDays(type, ownership) {
  if (ownership === 'LEASED') {
    if (type.category === 'REGIONAL') return 21;
    if (type.category?.startsWith('WIDEBODY')) return 45;
    return 30;
  }
  if (type.category === 'REGIONAL') return 365;
  if (type.category?.startsWith('WIDEBODY')) return 730;
  return 540;
}

function calculateDepreciationExpense(state, elapsedMs) {
  const years = elapsedMs / (365 * DAY_MS);
  return state.fleet
    .filter(f => f.ownership === 'OWNED' && (f.ageWeeks || 0) / 52 < 25)
    .reduce((sum, f) => {
      const type = aircraftType(f.typeId);
      const depreciableBase = type.price * 0.85; // 15% residual value
      return sum + (depreciableBase / 25) * years;
    }, 0);
}
'''
replace_once(
    'commercial scheduling helpers',
    "function actionOpenRoute(state, { originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy, departMinute }) {",
    schedule_helpers + "\nfunction actionOpenRoute(state, { originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy, departMinute }) {",
)

replace_once(
    'route opening uses distributed schedule',
    "  const schedule = Array.from({ length: frequencyPerWeek }, (_, i) => ({ dayOfWeek: i % 7, minute: departMinute }));",
    "  const schedule = buildWeeklySchedule(frequencyPerWeek, departMinute);",
)
replace_once(
    'frequency change uses distributed schedule',
    "    r.schedule = Array.from({ length: frequencyPerWeek }, (_, i) => ({ dayOfWeek: i % 7, minute: r.schedule[0]?.minute ?? 480 }));",
    "    r.schedule = buildWeeklySchedule(frequencyPerWeek, r.schedule[0]?.minute ?? 480);",
)

regex_once(
    'realistic aircraft procurement',
    r"function actionBuyAircraft\(state, typeId, ownership\) \{.*?\n\}\n\nfunction actionAssignAircraft",
    r'''function actionBuyAircraft(state, typeId, ownership) {
  const s = structuredCloneLite(state);
  const type = aircraftType(typeId);
  if (!type) return { state: s, error: 'Type avion inconnu.' };
  const leadDays = deliveryLeadDays(type, ownership);

  if (ownership === 'OWNED') {
    const equityShare = 0.15;
    const downPayment = type.price * equityShare;
    if (s.company.cash < downPayment) return { state: s, error: 'Trésorerie insuffisante pour l’apport de financement.' };
    s.company.cash -= downPayment;
    const principal = type.price - downPayment;
    const annualRate = clamp(0.057 + Math.max(0, 60 - s.company.reputation) * 0.0008 + (s.company.cash < 10e6 ? 0.012 : 0), 0.05, 0.105);
    const weeklyRate = Math.pow(1 + annualRate, 1 / 52) - 1;
    const termWeeks = 624; // 12 years
    const annuityFactor = weeklyRate / (1 - Math.pow(1 + weeklyRate, -termWeeks));
    s.finance.loans.push({
      id: 'L' + Date.now() % 100000, principal, weeklyRate, annualRate,
      remainingWeeks: termWeeks, weeklyPayment: principal * annuityFactor,
      assetTypeId: typeId,
    });
  } else if (ownership === 'LEASED') {
    const securityDeposit = type.leaseWeekly * 8;
    if (s.company.cash < securityDeposit) return { state: s, error: 'Trésorerie insuffisante pour le dépôt de garantie du bail.' };
    s.company.cash -= securityDeposit;
    s.finance.leaseDeposits = (s.finance.leaseDeposits || 0) + securityDeposit;
    s.orders.push({ typeId, ownership, securityDeposit, weeksLeft: leadDays / 7, deliveryAt: Date.now() + leadDays * DAY_MS });
    return { state: s, error: null };
  }

  s.orders.push({ typeId, ownership, weeksLeft: leadDays / 7, deliveryAt: Date.now() + leadDays * DAY_MS });
  return { state: s, error: null };
}

function actionAssignAircraft''')

regex_once(
    'assignment dispatch validation',
    r"function actionAssignAircraft\(state, aircraftId, routeId\) \{.*?\n\}",
    r'''function actionAssignAircraft(state, aircraftId, routeId) {
  const s = structuredCloneLite(state);
  const f = s.fleet.find(x => x.id === aircraftId);
  const route = s.routes.find(x => x.id === routeId);
  delete s.lastActionError;
  if (!f || !route) {
    s.lastActionError = 'Appareil ou ligne introuvable.';
    return s;
  }
  if (f.status !== 'ACTIVE') {
    s.lastActionError = `${f.id} n’est pas disponible pour affectation.`;
    return s;
  }
  if (f.typeId !== route.aircraftTypeId) {
    s.lastActionError = `Le type de ${f.id} ne correspond pas au type programmé sur ${route.id}.`;
    return s;
  }
  f.assignedRouteId = routeId;
  return s;
}''')

replace_once(
    'depreciation P&L bucket',
    "    (a.disruptionExpense || 0) +\n    (a.leasingExpense || 0) +",
    "    (a.disruptionExpense || 0) +\n    (a.depreciationExpense || 0) +\n    (a.leasingExpense || 0) +",
)

replace_once(
    'depreciation breakdown',
    "  const breakdown = { fuel: 0, crew: 0, maint: 0, airport: 0, handling: 0, leasing: 0, distribution: 0, disruption: 0, insurance: 0, overhead: 0, interest: 0, taxes: 0 };",
    "  const breakdown = { fuel: 0, crew: 0, maint: 0, airport: 0, handling: 0, leasing: 0, distribution: 0, disruption: 0, depreciation: 0, insurance: 0, overhead: 0, interest: 0, taxes: 0 };",
)

replace_once(
    'noncash depreciation accrual',
'''  const recurring = v3ProcessRecurringCosts(state, elapsed);
  costs += recurring.labor + recurring.insurance;
  breakdown.crew += recurring.labor;
  breakdown.insurance += recurring.insurance;''',
'''  const recurring = v3ProcessRecurringCosts(state, elapsed);
  costs += recurring.labor + recurring.insurance;
  breakdown.crew += recurring.labor;
  breakdown.insurance += recurring.insurance;
  const depreciation = calculateDepreciationExpense(state, elapsed);
  breakdown.depreciation += depreciation;
  v3BookAccounting(state, 'depreciationExpense', depreciation);''')

replace_once(
    'cash versus accounting profit separation',
'''  state.company.cash += revenue - costs - principalPaid;
  const netIncome = revenue - costs;
  upsertWeeklyFinanceHistory(state, toMs, revenue, costs, netIncome, breakdown);''',
'''  state.company.cash += revenue - costs - principalPaid;
  const accountingCosts = costs + depreciation;
  const netIncome = revenue - accountingCosts;
  upsertWeeklyFinanceHistory(state, toMs, revenue, accountingCosts, netIncome, breakdown);''')

replace_once(
    'finance chart depreciation',
    "p.breakdown.handling + p.breakdown.distribution + (p.breakdown.disruption || 0) + p.breakdown.insurance + p.breakdown.overhead + p.breakdown.interest + p.breakdown.leasing + (p.breakdown.taxes || 0)",
    "p.breakdown.handling + p.breakdown.distribution + (p.breakdown.disruption || 0) + (p.breakdown.depreciation || 0) + p.breakdown.insurance + p.breakdown.overhead + p.breakdown.interest + p.breakdown.leasing + (p.breakdown.taxes || 0)",
)

replace_once(
    'acquisition UI wording',
    "            <option value=\"LEASED\">Location (pas d'apport, loyer hebdomadaire)</option>\n            <option value=\"OWNED\">Achat (apport de 20 %, financement 10 ans)</option>",
    "            <option value=\"LEASED\">Location (dépôt de garantie + loyer hebdomadaire)</option>\n            <option value=\"OWNED\">Achat neuf (apport 15 %, financement 12 ans, délai de production)</option>",
)

for required in [
    'buildWeeklySchedule',
    'deliveryLeadDays',
    'calculateDepreciationExpense',
    'leaseDeposits',
    'depreciationExpense',
    'securityDeposit',
    'accountingCosts',
]:
    if required not in source:
        raise RuntimeError(f'missing expected phase-4 behavior: {required}')

path.write_text(source)
print('AeroDesk phase-4 commercial/accounting realism upgrade applied.')
