import fs from 'node:fs';

const file = 'aerodesk.jsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const at = source.indexOf(oldText);
  if (at < 0) throw new Error(`Pattern not found: ${label}`);
  if (source.indexOf(oldText, at + oldText.length) >= 0) throw new Error(`Pattern not unique: ${label}`);
  source = source.slice(0, at) + newText + source.slice(at + oldText.length);
}

const helpers = String.raw`
function directionalServiceCounts(plan) {
  if (!plan) return { scheduled: 0, operated: 0 };
  const scheduled = plan.scheduledRotations ?? Math.floor((plan.scheduledFlights || 0) / 2);
  const operated = plan.operatedRotations ?? Math.floor((plan.operatedFlights || 0) / 2);
  return {
    scheduled: Math.max(0, scheduled),
    operated: Math.max(0, Math.min(operated, scheduled)),
  };
}

function directionalServiceShares(plan, publishedFrequency) {
  const frequency = Math.max(1, publishedFrequency || 1);
  const counts = directionalServiceCounts(plan);
  return {
    bookedShare: clamp(counts.scheduled / frequency, 0, 1),
    operatedShare: clamp(counts.operated / frequency, 0, 1),
  };
}
`;

if (!source.includes('function directionalServiceCounts(')) {
  const marker = 'function processRealTimeDay(state, fromMs, toMs, rng) {';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('processRealTimeDay marker missing');
  source = source.slice(0, at) + helpers + '\n' + source.slice(at);
}

replaceOnce(
`        const departures = product.legs === 1
          ? (routeOperationalPlans[product.route.id]?.operatedRotations ?? Math.floor((routeOperationalPlans[product.route.id]?.operatedFlights || 0) / 2))
          : Math.min(
              routeOperationalPlans[product.route.id]?.operatedRotations ?? Math.floor((routeOperationalPlans[product.route.id]?.operatedFlights || 0) / 2),
              routeOperationalPlans[product.secondRoute.id]?.operatedRotations ?? Math.floor((routeOperationalPlans[product.secondRoute.id]?.operatedFlights || 0) / 2)
            );
        const scheduledDepartures = product.legs === 1
          ? (routeOperationalPlans[product.route.id]?.scheduledFlights || 0)
          : Math.min(routeOperationalPlans[product.route.id]?.scheduledFlights || 0, routeOperationalPlans[product.secondRoute.id]?.scheduledFlights || 0);
        const flightsShare = departures / freq;
        const bookedShare = scheduledDepartures / freq;`,
`        const primaryCounts = directionalServiceCounts(routeOperationalPlans[product.route.id]);
        const secondaryCounts = product.legs === 2
          ? directionalServiceCounts(routeOperationalPlans[product.secondRoute.id])
          : null;
        const departures = product.legs === 1
          ? primaryCounts.operated
          : Math.min(primaryCounts.operated, secondaryCounts.operated);
        const scheduledDepartures = product.legs === 1
          ? primaryCounts.scheduled
          : Math.min(primaryCounts.scheduled, secondaryCounts.scheduled);
        const flightsShare = clamp(departures / freq, 0, 1);
        const bookedShare = clamp(scheduledDepartures / freq, 0, 1);`,
  'directional demand service shares',
);

fs.writeFileSync(file, source);
console.log('Applied AeroDesk realism phase 10: directional service counts for demand and disruption exposure.');
