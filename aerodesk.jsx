/*
  AERODESK V3 - REAL-TIME AIRLINE SIMULATOR
  Built from the supplied aerodesk.jsx and the realtime engine.
  The simulation clock advances from wall-clock timestamps; there is no
  "advance one week" action. Economic parameters are simulation assumptions,
  not claims of live market data.
*/
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Plane, TrendingUp, TrendingDown, AlertTriangle, Wallet, Users, Clock, MapPin,
  Settings, HelpCircle, Wrench, Building2, Newspaper, Gauge, Plus, X, Check,
  ChevronRight, LayoutDashboard, Network, Landmark, Globe2, ArrowRight, Trash2,
} from 'lucide-react';

// =============================================================================
// SIMULATION ENGINE — Airline management game
// Pure logic module. No UI. No I/O besides pure functions on a state object.
// Reference-data provenance (see rule "no fake data presented as real"):
//   - Airport coordinates: DERIVED (approximate public geographic knowledge)
//   - Aircraft models/specs: real aircraft families with rounded manufacturer figures.
//     Acquisition and lease values are modeled because airline transaction prices are not public.
//   - Airport size/tourist/vfr/corporate indices: SYNTHETIC (invented for balance)
//   - Demand, pricing, competitor behavior: MODELED (game economy, not real stats)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. WORLD REFERENCE DATA
// -----------------------------------------------------------------------------

const AIRPORTS = [
  { id: 'LHR', city: 'Londres', country: 'Royaume-Uni', lat: 51.47, lon: -0.45, size: 95, tourist: 80, vfr: 55, corp: 95, fee: 9000, infra: 90, curfew: false, region: 'EU' },
  { id: 'CDG', city: 'Paris', country: 'France', lat: 49.01, lon: 2.55, size: 90, tourist: 85, vfr: 45, corp: 90, fee: 8000, infra: 88, curfew: false, region: 'EU' },
  { id: 'FRA', city: 'Francfort', country: 'Allemagne', lat: 50.03, lon: 8.57, size: 88, tourist: 55, vfr: 40, corp: 92, fee: 7800, infra: 90, curfew: true, region: 'EU' },
  { id: 'AMS', city: 'Amsterdam', country: 'Pays-Bas', lat: 52.31, lon: 4.76, size: 78, tourist: 70, vfr: 35, corp: 80, fee: 7000, infra: 85, curfew: false, region: 'EU' },
  { id: 'MAD', city: 'Madrid', country: 'Espagne', lat: 40.47, lon: -3.57, size: 72, tourist: 75, vfr: 40, corp: 70, fee: 6000, infra: 80, curfew: false, region: 'EU' },
  { id: 'FCO', city: 'Rome', country: 'Italie', lat: 41.80, lon: 12.25, size: 68, tourist: 88, vfr: 35, corp: 55, fee: 6200, infra: 72, curfew: false, region: 'EU' },
  { id: 'JFK', city: 'New York', country: 'États-Unis', lat: 40.64, lon: -73.78, size: 98, tourist: 82, vfr: 60, corp: 96, fee: 9500, infra: 82, curfew: false, region: 'NA' },
  { id: 'LAX', city: 'Los Angeles', country: 'États-Unis', lat: 33.94, lon: -118.41, size: 90, tourist: 78, vfr: 55, corp: 82, fee: 8500, infra: 78, curfew: false, region: 'NA' },
  { id: 'ORD', city: 'Chicago', country: 'États-Unis', lat: 41.98, lon: -87.90, size: 82, tourist: 45, vfr: 40, corp: 85, fee: 7200, infra: 80, curfew: false, region: 'NA' },
  { id: 'MIA', city: 'Miami', country: 'États-Unis', lat: 25.80, lon: -80.29, size: 65, tourist: 85, vfr: 70, corp: 55, fee: 6500, infra: 75, curfew: false, region: 'NA' },
  { id: 'YYZ', city: 'Toronto', country: 'Canada', lat: 43.68, lon: -79.63, size: 72, tourist: 50, vfr: 60, corp: 75, fee: 6800, infra: 78, curfew: false, region: 'NA' },
  { id: 'GRU', city: 'São Paulo', country: 'Brésil', lat: -23.43, lon: -46.47, size: 75, tourist: 45, vfr: 50, corp: 78, fee: 6000, infra: 65, curfew: false, region: 'SA' },
  { id: 'EZE', city: 'Buenos Aires', country: 'Argentine', lat: -34.82, lon: -58.54, size: 55, tourist: 55, vfr: 45, corp: 55, fee: 5000, infra: 60, curfew: false, region: 'SA' },
  { id: 'DXB', city: 'Dubaï', country: 'Émirats arabes unis', lat: 25.25, lon: 55.36, size: 80, tourist: 90, vfr: 65, corp: 88, fee: 7000, infra: 95, curfew: false, region: 'ME' },
  { id: 'DEL', city: 'Delhi', country: 'Inde', lat: 28.56, lon: 77.10, size: 78, tourist: 55, vfr: 80, corp: 70, fee: 4500, infra: 68, curfew: false, region: 'AS' },
  { id: 'SIN', city: 'Singapour', country: 'Singapour', lat: 1.36, lon: 103.99, size: 85, tourist: 80, vfr: 45, corp: 90, fee: 7500, infra: 96, curfew: false, region: 'AS' },
  { id: 'HKG', city: 'Hong Kong', country: 'Chine (RAS)', lat: 22.31, lon: 113.91, size: 82, tourist: 75, vfr: 55, corp: 88, fee: 7500, infra: 92, curfew: false, region: 'AS' },
  { id: 'NRT', city: 'Tokyo', country: 'Japon', lat: 35.76, lon: 140.39, size: 88, tourist: 72, vfr: 30, corp: 85, fee: 8200, infra: 82, curfew: true, region: 'AS' },
  { id: 'ICN', city: 'Séoul', country: 'Corée du Sud', lat: 37.46, lon: 126.44, size: 78, tourist: 65, vfr: 35, corp: 78, fee: 6800, infra: 90, curfew: false, region: 'AS' },
  { id: 'SYD', city: 'Sydney', country: 'Australie', lat: -33.95, lon: 151.18, size: 75, tourist: 78, vfr: 40, corp: 72, fee: 7200, infra: 80, curfew: true, region: 'OC' },
  { id: 'JNB', city: 'Johannesburg', country: 'Afrique du Sud', lat: -26.13, lon: 28.24, size: 55, tourist: 55, vfr: 45, corp: 60, fee: 4800, infra: 62, curfew: false, region: 'AF' },
  { id: 'CAI', city: 'Le Caire', country: 'Égypte', lat: 30.11, lon: 31.40, size: 48, tourist: 65, vfr: 60, corp: 45, fee: 4000, infra: 55, curfew: false, region: 'AF' },
  { id: 'LOS', city: 'Lagos', country: 'Nigéria', lat: 6.58, lon: 3.32, size: 50, tourist: 25, vfr: 75, corp: 50, fee: 4200, infra: 48, curfew: false, region: 'AF' },
  { id: 'AKL', city: 'Auckland', country: 'Nouvelle-Zélande', lat: -37.01, lon: 174.79, size: 45, tourist: 70, vfr: 30, corp: 50, fee: 5500, infra: 75, curfew: true, region: 'OC' },
];

const AIRPORT_OPERATIONAL_DATA = {
  LHR: { timeZone: 'Europe/London', runwayM: 3902 },
  CDG: { timeZone: 'Europe/Paris', runwayM: 4215 },
  FRA: { timeZone: 'Europe/Berlin', runwayM: 4000, curfewWindow: { startMinute: 23 * 60, endMinute: 5 * 60 } },
  AMS: { timeZone: 'Europe/Amsterdam', runwayM: 3800 },
  MAD: { timeZone: 'Europe/Madrid', runwayM: 4348 },
  FCO: { timeZone: 'Europe/Rome', runwayM: 3902 },
  JFK: { timeZone: 'America/New_York', runwayM: 4423 },
  LAX: { timeZone: 'America/Los_Angeles', runwayM: 3685 },
  ORD: { timeZone: 'America/Chicago', runwayM: 3962 },
  MIA: { timeZone: 'America/New_York', runwayM: 3962 },
  YYZ: { timeZone: 'America/Toronto', runwayM: 3389 },
  GRU: { timeZone: 'America/Sao_Paulo', runwayM: 3700 },
  EZE: { timeZone: 'America/Argentina/Buenos_Aires', runwayM: 3300 },
  DXB: { timeZone: 'Asia/Dubai', runwayM: 4447 },
  DEL: { timeZone: 'Asia/Kolkata', runwayM: 4430 },
  SIN: { timeZone: 'Asia/Singapore', runwayM: 4000 },
  HKG: { timeZone: 'Asia/Hong_Kong', runwayM: 3800 },
  NRT: { timeZone: 'Asia/Tokyo', runwayM: 4000, curfewWindow: { startMinute: 0, endMinute: 6 * 60 } },
  ICN: { timeZone: 'Asia/Seoul', runwayM: 3750 },
  SYD: { timeZone: 'Australia/Sydney', runwayM: 3962, curfewWindow: { startMinute: 23 * 60, endMinute: 6 * 60 } },
  JNB: { timeZone: 'Africa/Johannesburg', runwayM: 4421 },
  CAI: { timeZone: 'Africa/Cairo', runwayM: 4000 },
  LOS: { timeZone: 'Africa/Lagos', runwayM: 3900 },
  AKL: { timeZone: 'Pacific/Auckland', runwayM: 3635 },
};

AIRPORTS.forEach(a => {
  const ops = AIRPORT_OPERATIONAL_DATA[a.id] || { timeZone: 'UTC', runwayM: 3000 };
  Object.assign(a, ops);
  a.curfew = Boolean(ops.curfewWindow);
});

const AIRCRAFT_TYPES = [
  // Real aircraft families. Performance figures are rounded from manufacturer data;
  // acquisition/lease figures remain modeled because transaction prices are confidential.
  { id: 'ATR72-600', name: 'ATR 72-600', manufacturer: 'ATR', category: 'TURBOPROP', seats: 72, rangeKm: 1528, cruiseKmh: 510, cruiseBurn: 280, fixedBurn: 70, price: 27e6, leaseWeekly: 62000, crew: 4, maintPerHour: 1150, turnaround: 25, noise: 68, runway: 1330 },
  { id: 'E190-E2', name: 'Embraer E190-E2', manufacturer: 'Embraer', category: 'REGIONAL_JET', seats: 114, rangeKm: 5280, cruiseKmh: 829, cruiseBurn: 1500, fixedBurn: 420, price: 60e6, leaseWeekly: 125000, crew: 5, maintPerHour: 1550, turnaround: 35, noise: 62, runway: 1800 },
  { id: 'A220-300', name: 'Airbus A220-300', manufacturer: 'Airbus', category: 'NARROWBODY', seats: 145, rangeKm: 6297, cruiseKmh: 870, cruiseBurn: 2150, fixedBurn: 560, price: 82e6, leaseWeekly: 175000, crew: 5, maintPerHour: 1750, turnaround: 35, noise: 58, runway: 1900 },
  { id: 'A320neo', name: 'Airbus A320neo', manufacturer: 'Airbus', category: 'NARROWBODY', seats: 180, rangeKm: 6300, cruiseKmh: 840, cruiseBurn: 2500, fixedBurn: 700, price: 111e6, leaseWeekly: 235000, crew: 6, maintPerHour: 1950, turnaround: 40, noise: 60, runway: 2100 },
  { id: 'A321neo', name: 'Airbus A321neo', manufacturer: 'Airbus', category: 'NARROWBODY', seats: 206, rangeKm: 7400, cruiseKmh: 840, cruiseBurn: 2750, fixedBurn: 760, price: 130e6, leaseWeekly: 275000, crew: 6, maintPerHour: 2150, turnaround: 42, noise: 61, runway: 2200 },
  { id: 'A321XLR', name: 'Airbus A321XLR', manufacturer: 'Airbus', category: 'NARROWBODY_XR', seats: 206, rangeKm: 8700, cruiseKmh: 840, cruiseBurn: 2800, fixedBurn: 780, price: 145e6, leaseWeekly: 305000, crew: 6, maintPerHour: 2250, turnaround: 45, noise: 61, runway: 2200 },
  { id: '737-8', name: 'Boeing 737-8', manufacturer: 'Boeing', category: 'NARROWBODY', seats: 178, rangeKm: 6480, cruiseKmh: 839, cruiseBurn: 2450, fixedBurn: 690, price: 121e6, leaseWeekly: 245000, crew: 6, maintPerHour: 1950, turnaround: 40, noise: 60, runway: 2100 },
  { id: '787-9', name: 'Boeing 787-9', manufacturer: 'Boeing', category: 'WIDEBODY_MED', seats: 296, rangeKm: 14100, cruiseKmh: 903, cruiseBurn: 5700, fixedBurn: 1500, price: 292e6, leaseWeekly: 610000, crew: 10, maintPerHour: 3600, turnaround: 85, noise: 58, runway: 2600 },
  { id: 'A330-900', name: 'Airbus A330-900', manufacturer: 'Airbus', category: 'WIDEBODY_LARGE', seats: 287, rangeKm: 13334, cruiseKmh: 905, cruiseBurn: 6100, fixedBurn: 1600, price: 300e6, leaseWeekly: 640000, crew: 11, maintPerHour: 3700, turnaround: 90, noise: 59, runway: 2600 },
  { id: 'A350-900', name: 'Airbus A350-900', manufacturer: 'Airbus', category: 'WIDEBODY_LARGE', seats: 325, rangeKm: 15000, cruiseKmh: 903, cruiseBurn: 6300, fixedBurn: 1650, price: 317e6, leaseWeekly: 680000, crew: 12, maintPerHour: 3900, turnaround: 95, noise: 56, runway: 2600 },
  { id: 'A350-1000', name: 'Airbus A350-1000', manufacturer: 'Airbus', category: 'WIDEBODY_XL', seats: 369, rangeKm: 16100, cruiseKmh: 903, cruiseBurn: 7000, fixedBurn: 1800, price: 366e6, leaseWeekly: 780000, crew: 13, maintPerHour: 4300, turnaround: 100, noise: 57, runway: 2800 },
  { id: '777-9', name: 'Boeing 777-9', manufacturer: 'Boeing', category: 'WIDEBODY_XL', seats: 426, rangeKm: 13900, cruiseKmh: 905, cruiseBurn: 7900, fixedBurn: 2000, price: 442e6, leaseWeekly: 930000, crew: 14, maintPerHour: 4700, turnaround: 110, noise: 63, runway: 3000 },
];

const SEGMENTS = ['BUSINESS', 'LEISURE', 'VFR'];

const FARE_STRATEGIES = {
  DISCOUNT: { refMult: 0.85, alloc: { deep: 0.35, disc: 0.35, std: 0.20, flex: 0.07, prem: 0.03 } },
  VALUE: { refMult: 0.95, alloc: { deep: 0.20, disc: 0.30, std: 0.30, flex: 0.12, prem: 0.08 } },
  COMPETITIVE: { refMult: 1.00, alloc: { deep: 0.12, disc: 0.23, std: 0.35, flex: 0.18, prem: 0.12 } },
  PREMIUM: { refMult: 1.25, alloc: { deep: 0.05, disc: 0.10, std: 0.25, flex: 0.30, prem: 0.30 } },
  YIELD_OPTIMIZED: { refMult: 1.05, alloc: { deep: 0.12, disc: 0.22, std: 0.33, flex: 0.20, prem: 0.13 }, adaptive: true },
};

const COMPETITOR_TEMPLATES = [
  { name: 'Meridian Air', strategy: 'PREMIUM_NETWORK', hub: 'FRA', theme: '#4FC1E9' },
  { name: 'SkyValue', strategy: 'LOWCOST', hub: 'MAD', theme: '#E8A33D' },
  { name: 'Pacific Crown', strategy: 'MEGA_HUB', hub: 'SIN', theme: '#8B7FD1' },
  { name: 'Condor Regional', strategy: 'REGIONAL', hub: 'YYZ', theme: '#6FBF73' },
];

// -----------------------------------------------------------------------------
// 2. UTILITIES
// -----------------------------------------------------------------------------

function airport(id) { return AIRPORTS.find(a => a.id === id); }
function aircraftType(id) { return AIRCRAFT_TYPES.find(t => t.id === id); }


// Commercial availability is deliberately separate from the technical catalogue. A type may
// exist for planning/reference purposes without being certificated or delivered to airlines yet.
const AIRCRAFT_COMMERCIAL_OVERRIDES = {
  '777-9': {
    available: false,
    status: 'CERTIFICATION_PENDING',
    reason: 'Certification en cours ; première livraison commerciale annoncée pour 2027.',
  },
};

function aircraftCommercialStatus(typeId, timestampMs = Date.now()) {
  const type = aircraftType(typeId);
  if (!type) return { available: false, status: 'UNKNOWN', reason: 'Type avion inconnu.' };
  const override = AIRCRAFT_COMMERCIAL_OVERRIDES[typeId];
  if (override) return { ...override };
  return { available: true, status: 'IN_SERVICE', reason: null };
}

function commerciallyAvailableAircraftTypes(timestampMs = Date.now()) {
  return AIRCRAFT_TYPES.filter(type => aircraftCommercialStatus(type.id, timestampMs).available);
}


// Regulatory market access is simplified to the freedoms-of-the-air concepts represented by
// the game's geography. Specific bilateral/fifth/seventh/ninth-freedom rights can be granted
// explicitly in company.trafficRights instead of assuming universal market access.
const EU_COMMUNITY_AOC_COUNTRIES = new Set([
  'France', 'Allemagne', 'Pays-Bas', 'Espagne', 'Italie', 'Belgique', 'Irlande',
  'Portugal', 'Autriche', 'Danemark', 'Suède', 'Finlande', 'Grèce', 'Pologne',
]);

function hasSpecificTrafficRight(state, originId, destId) {
  return (state?.company?.trafficRights || []).some(right =>
    (right.originId === originId && right.destId === destId) ||
    (right.originId === destId && right.destId === originId)
  );
}

function trafficRightStatus(state, originId, destId) {
  const origin = airport(originId);
  const destination = airport(destId);
  if (!origin || !destination) return { allowed: false, basis: 'REFERENCE', reason: 'Aéroport inconnu.' };
  const aocCountry = state?.company?.aocCountry || airport(state?.company?.homeBase)?.country;
  if (!aocCountry) return { allowed: false, basis: 'AOC', reason: 'Pays de l’AOC non défini.' };

  if (hasSpecificTrafficRight(state, originId, destId)) {
    return { allowed: true, basis: 'SPECIFIC_TRAFFIC_RIGHT', reason: null };
  }

  const originCountry = origin.country;
  const destinationCountry = destination.country;
  const communityCarrier = EU_COMMUNITY_AOC_COUNTRIES.has(aocCountry);
  const bothCommunity = EU_COMMUNITY_AOC_COUNTRIES.has(originCountry) && EU_COMMUNITY_AOC_COUNTRIES.has(destinationCountry);

  if (originCountry === destinationCountry) {
    if (originCountry === aocCountry) return { allowed: true, basis: 'HOME_DOMESTIC', reason: null };
    if (communityCarrier && bothCommunity) return { allowed: true, basis: 'EU_COMMUNITY_MARKET', reason: null };
    return {
      allowed: false,
      basis: 'CABOTAGE',
      reason: 'Cabotage étranger interdit sans droit ou autorisation spécifique.',
    };
  }

  if (originCountry === aocCountry || destinationCountry === aocCountry) {
    return { allowed: true, basis: '3RD_4TH_FREEDOM_HOME_STATE', reason: null };
  }

  if (communityCarrier && bothCommunity) {
    return { allowed: true, basis: 'EU_COMMUNITY_MARKET', reason: null };
  }

  return {
    allowed: false,
    basis: 'EXTRA_BILATERAL_RIGHT_REQUIRED',
    reason: 'Droit de trafic ou autorisation de 5e/7e liberté requis pour cette liaison hors pays de l’AOC.',
  };
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distanceBetween(idA, idB) {
  return haversineKm(airport(idA), airport(idB));
}

function blockTimeHours(distanceKm, cruiseKmh) {
  return distanceKm / cruiseKmh + 0.35; // taxi + climb/descent buffer
}

function fuelBurnLiters(distanceKm, type) {
  const t = blockTimeHours(distanceKm, type.cruiseKmh);
  const cruiseHours = Math.max(0, t - 0.4);
  return type.fixedBurn + type.cruiseBurn * cruiseHours;
}

function buildFuelPlan(distanceKm, type) {
  const tripLiters = fuelBurnLiters(distanceKm, type);
  const taxiLiters = Math.max(50, type.cruiseBurn * 0.12);
  const contingencyLiters = tripLiters * 0.05;
  const alternateLiters = type.cruiseBurn * 0.25;
  const finalReserveLiters = type.cruiseBurn * 0.5;
  const dispatchLiters = tripLiters + taxiLiters + contingencyLiters + alternateLiters + finalReserveLiters;
  // Reserve and alternate fuel are protected planning quantities, not assumed consumed on every flight.
  const expectedBurnLiters = tripLiters + taxiLiters + contingencyLiters * 0.25;
  return { tripLiters, taxiLiters, contingencyLiters, alternateLiters, finalReserveLiters, dispatchLiters, expectedBurnLiters };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function softmax(utilities) {
  const max = Math.max(...utilities);
  const exps = utilities.map(u => Math.exp(u - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

// -----------------------------------------------------------------------------
// 3. DEMAND MODEL CONSTANTS (internal — not surfaced to the player)
// -----------------------------------------------------------------------------

const SEG_PARAMS = {
  BUSINESS: { priceBeta: 0.0068, freqW: 0.45, schedW: 1.5, durW: 0.065, stopPen: 1.35, mctPen: 0.9, reputW: 1.4, otpW: 1.1, loyaltyW: 0.6, availW: 1.1, valueW: 0.15, outsideBase: -1.1, fareMult: 1.55 },
  LEISURE: { priceBeta: 0.0075, freqW: 0.22, schedW: 0.55, durW: 0.035, stopPen: 0.55, mctPen: 0.45, reputW: 0.7, otpW: 0.5, loyaltyW: 0.25, availW: 0.2, valueW: 1.3, outsideBase: 0.35, fareMult: 0.82 },
  VFR: { priceBeta: 0.0105, freqW: 0.15, schedW: 0.30, durW: 0.02, stopPen: 0.35, mctPen: 0.30, reputW: 0.35, otpW: 0.3, loyaltyW: 0.55, availW: 0.1, valueW: 1.6, outsideBase: -0.15, fareMult: 0.62 },
};

const SEG_POTENTIAL_K = { BUSINESS: 0.168, LEISURE: 0.272, VFR: 0.152 };

function fareReference(distanceKm) {
  return 55 + 0.115 * Math.pow(distanceKm, 0.84);
}

function groundAltBonus(distanceKm, seg) {
  if (distanceKm > 1800) return 0;
  const strength = seg === 'VFR' ? 1.3 : seg === 'LEISURE' ? 1.0 : 0.35;
  return strength * Math.max(0, (1800 - distanceKm) / 1800) * 1.1;
}

function seasonalFactor(seg, weekOfYear, latitude = 45) {
  const shiftedWeek = latitude < 0 ? ((weekOfYear + 25) % 52) + 1 : weekOfYear;
  const phase = (shiftedWeek / 52) * 2 * Math.PI;
  if (seg === 'LEISURE') return 1 + 0.28 * Math.sin(phase - Math.PI / 2.3);
  if (seg === 'VFR') return 1 + 0.22 * Math.sin(phase - Math.PI / 1.6);
  return 1 + 0.08 * Math.sin(phase);
}

function marketSizeIndex(o, d) { return Math.sqrt(o.size * d.size); }

function segmentBasePotential(o, d, distanceKm, seg, weekOfYear, macro) {
  const size = marketSizeIndex(o, d);
  const seasonal = seasonalFactor(seg, weekOfYear, (o.lat + d.lat) / 2);
  let val;
  if (seg === 'BUSINESS') {
    val = SEG_POTENTIAL_K.BUSINESS * size * Math.sqrt(o.corp * d.corp) / Math.pow(1 + distanceKm / 4000, 1.05);
  } else if (seg === 'LEISURE') {
    val = SEG_POTENTIAL_K.LEISURE * Math.pow(size, 0.92) * Math.sqrt(Math.max(o.tourist, d.tourist) * 10 + 20) / Math.pow(1 + distanceKm / 2500, 1.15) * seasonal;
  } else {
    val = SEG_POTENTIAL_K.VFR * Math.pow(size, 0.75) * Math.sqrt(o.vfr * d.vfr) / Math.pow(1 + distanceKm / 3000, 1.0) * seasonal;
  }
  return Math.max(0, val * macro.demandIndex);
}

// -----------------------------------------------------------------------------
// REAL-TIME CLOCK + CALENDAR
// -----------------------------------------------------------------------------
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / DAY_MS) + 1) / 7);
}

function zonedParts(timestampMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestampMs));
  const values = {};
  parts.forEach(part => { if (part.type !== 'literal') values[part.type] = Number(part.value); });
  return values;
}

function zonedLocalToUtcMs(year, month, day, hour, minute, timeZone) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = desired;
  for (let i = 0; i < 4; i += 1) {
    const actualParts = zonedParts(guess, timeZone);
    const actual = Date.UTC(actualParts.year, actualParts.month - 1, actualParts.day, actualParts.hour, actualParts.minute, 0, 0);
    const delta = desired - actual;
    guess += delta;
    if (Math.abs(delta) < 60_000) break;
  }
  return guess;
}

function minuteFallsInWindow(minute, window) {
  if (!window) return false;
  if (window.startMinute < window.endMinute) return minute >= window.startMinute && minute < window.endMinute;
  return minute >= window.startMinute || minute < window.endMinute;
}

function movementBlockedByCurfew(airportId, timestampMs) {
  const ap = airport(airportId);
  if (!ap?.curfewWindow) return false;
  const local = zonedParts(timestampMs, ap.timeZone);
  return minuteFallsInWindow(local.hour * 60 + local.minute, ap.curfewWindow);
}

function scheduledDepartureTimesBetween(route, fromMs, toMs) {
  const origin = airport(route.originId);
  const timeZone = origin?.timeZone || 'UTC';
  const fromLocal = zonedParts(fromMs, timeZone);
  const toLocal = zonedParts(toMs, timeZone);
  const startDay = Date.UTC(fromLocal.year, fromLocal.month - 1, fromLocal.day) - DAY_MS;
  const endDay = Date.UTC(toLocal.year, toLocal.month - 1, toLocal.day) + DAY_MS;
  const departures = [];

  for (let daySerial = startDay; daySerial <= endDay; daySerial += DAY_MS) {
    const localDate = new Date(daySerial);
    const dow = localDate.getUTCDay();
    (route.schedule || []).forEach(slot => {
      if (slot.dayOfWeek !== dow) return;
      const departure = zonedLocalToUtcMs(
        localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, localDate.getUTCDate(),
        Math.floor(slot.minute / 60), slot.minute % 60, timeZone,
      );
      if (departure > fromMs && departure <= toMs) departures.push(departure);
    });
  }
  return departures.sort((a, b) => a - b);
}

function scheduledDeparturesBetween(route, fromMs, toMs) {
  return scheduledDepartureTimesBetween(route, fromMs, toMs).length;
}


const AIRPORT_MCT_MINUTES = {
  LHR: 75, CDG: 60, FRA: 60, AMS: 50, MAD: 60, FCO: 60,
  JFK: 75, LAX: 60, ORD: 55, MIA: 60, YYZ: 60,
  GRU: 60, EZE: 60, DXB: 75, DEL: 60, SIN: 60, HKG: 60,
  NRT: 60, ICN: 60, SYD: 60, JNB: 60, CAI: 60, LOS: 60, AKL: 45,
};

function minimumConnectionTimeHours(airportId) {
  return (AIRPORT_MCT_MINUTES[airportId] || 60) / 60;
}

function startOfIsoWeekUtc(referenceMs) {
  const date = new Date(referenceMs);
  const day = date.getUTCDay() || 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 1, 0, 0, 0, 0);
}

function connectionScheduleMetrics(firstRoute, secondRoute, referenceMs = Date.now()) {
  if (!firstRoute || !secondRoute || firstRoute.destId !== secondRoute.originId) {
    return { feasibleFrequency: 0, averageWaitHours: Infinity, mctHours: 1 };
  }
  const hubId = firstRoute.destId;
  const mctHours = minimumConnectionTimeHours(hubId);
  const firstType = aircraftType(firstRoute.aircraftTypeId);
  const firstBlockH = blockTimeHours(distanceBetween(firstRoute.originId, firstRoute.destId), firstType.cruiseKmh);
  const weekStart = startOfIsoWeekUtc(referenceMs);
  const horizonEnd = weekStart + 8 * DAY_MS;
  const firstDepartures = scheduledDepartureTimesBetween(firstRoute, weekStart - DAY_MS, weekStart + 7 * DAY_MS);
  const secondDepartures = scheduledDepartureTimesBetween(secondRoute, weekStart - DAY_MS, horizonEnd);
  const waits = [];

  firstDepartures.forEach(firstDeparture => {
    const arrival = firstDeparture + firstBlockH * 3600000;
    const earliestConnection = arrival + mctHours * 3600000;
    const latestUsefulConnection = arrival + 8 * 3600000;
    const secondDeparture = secondDepartures.find(dep => dep >= earliestConnection && dep <= latestUsefulConnection);
    if (secondDeparture) waits.push((secondDeparture - arrival) / 3600000);
  });

  const feasibleFrequency = Math.min(waits.length, firstRoute.frequencyPerWeek || waits.length, secondRoute.frequencyPerWeek || waits.length);
  const selectedWaits = waits.slice(0, feasibleFrequency);
  return {
    feasibleFrequency,
    averageWaitHours: selectedWaits.length ? selectedWaits.reduce((sum, wait) => sum + wait, 0) / selectedWaits.length : Infinity,
    mctHours,
  };
}

function airportCongestionFactor(airportId, timestampMs) {
  const ap = airport(airportId);
  if (!ap) return 0.5;
  const local = zonedParts(timestampMs, ap.timeZone || 'UTC');
  const minute = local.hour * 60 + local.minute;
  const sizeBase = clamp((ap.size || 50) / 100, 0.25, 1.0);
  let wave = 0.65;
  if ((minute >= 6 * 60 && minute < 10 * 60) || (minute >= 16 * 60 && minute < 20 * 60 + 30)) wave = 1.25;
  else if (minute >= 10 * 60 && minute < 16 * 60) wave = 0.82;
  else if (minute >= 20 * 60 + 30 && minute < 23 * 60) wave = 0.92;
  else wave = 0.45;
  return clamp(sizeBase * wave, 0.12, 1.35);
}


// Airport coordination status is reference data; residual player-access capacity below is a
// modeled game constraint, not a claim about live coordinator inventory. Level 3 means a slot
// must be allocated before a planned arrival or departure can be operated.
const AIRPORT_SLOT_COORDINATION = {
  LHR: { level: 3, modeledPeakSeriesPerHalfHour: 1, modeledOffPeakSeriesPerHalfHour: 2 },
  CDG: { level: 3, modeledPeakSeriesPerHalfHour: 1, modeledOffPeakSeriesPerHalfHour: 3 },
};

function airportCoordinationLevel(airportId) {
  return AIRPORT_SLOT_COORDINATION[airportId]?.level || 1;
}

function slotScarcityFactor(airportId, localMinute) {
  if (airportCoordinationLevel(airportId) !== 3) return 0;
  const morningPeak = localMinute >= 6 * 60 && localMinute < 10 * 60;
  const eveningPeak = localMinute >= 16 * 60 && localMinute < 20 * 60 + 30;
  if (morningPeak || eveningPeak) return airportId === 'LHR' ? 1.0 : 0.9;
  if (localMinute >= 10 * 60 && localMinute < 16 * 60) return airportId === 'LHR' ? 0.55 : 0.45;
  return airportId === 'LHR' ? 0.35 : 0.28;
}

function localSlotDescriptor(airportId, timestampMs, movement) {
  const ap = airport(airportId);
  const local = zonedParts(timestampMs, ap?.timeZone || 'UTC');
  const dayOfWeek = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  const minute = local.hour * 60 + local.minute;
  return {
    airportId,
    dayOfWeek,
    minute,
    bucketMinute: Math.floor(minute / 30) * 30,
    movement,
  };
}

function slotSeriesRequirements(route, referenceMs = Date.UTC(2026, 5, 7, 12, 0, 0)) {
  const type = aircraftType(route.aircraftTypeId);
  if (!type) return [];
  const origin = airport(route.originId);
  const distanceKm = distanceBetween(route.originId, route.destId);
  const blockMs = blockTimeHours(distanceKm, type.cruiseKmh) * 3600000;
  const turnaroundMs = (type.turnaround || 30) * 60000;
  const reference = new Date(referenceMs);
  const sunday = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() - reference.getUTCDay());
  const requirements = [];

  (route.schedule || []).forEach(slot => {
    const date = new Date(sunday + slot.dayOfWeek * DAY_MS);
    const outboundDeparture = zonedLocalToUtcMs(
      date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
      Math.floor(slot.minute / 60), slot.minute % 60, origin?.timeZone || 'UTC',
    );
    const outboundArrival = outboundDeparture + blockMs;
    const returnDeparture = outboundArrival + turnaroundMs;
    const returnArrival = returnDeparture + blockMs;
    [
      localSlotDescriptor(route.originId, outboundDeparture, 'DEPARTURE'),
      localSlotDescriptor(route.destId, outboundArrival, 'ARRIVAL'),
      localSlotDescriptor(route.destId, returnDeparture, 'DEPARTURE'),
      localSlotDescriptor(route.originId, returnArrival, 'ARRIVAL'),
    ].forEach(requirement => {
      if (airportCoordinationLevel(requirement.airportId) === 3) requirements.push(requirement);
    });
  });
  return requirements;
}

function modeledSlotBucketCapacity(requirement) {
  const config = AIRPORT_SLOT_COORDINATION[requirement.airportId];
  if (!config || config.level !== 3) return Infinity;
  const scarcity = slotScarcityFactor(requirement.airportId, requirement.minute);
  return scarcity >= 0.8 ? config.modeledPeakSeriesPerHalfHour : config.modeledOffPeakSeriesPerHalfHour;
}

function slotRequirementKey(requirement) {
  return [requirement.airportId, requirement.dayOfWeek, requirement.bucketMinute, requirement.movement].join('|');
}

function ensureSlotPortfolio(state) {
  state.operations = state.operations || {};
  state.operations.slotAllocations = state.operations.slotAllocations || [];
  return state.operations.slotAllocations;
}

function canReserveRouteSlots(state, route, excludingRouteId = null) {
  const portfolio = ensureSlotPortfolio(state);
  const existing = excludingRouteId ? portfolio.filter(a => a.routeId !== excludingRouteId) : portfolio;
  const requirements = slotSeriesRequirements(route, state.meta?.lastProcessedAt || Date.now());
  const proposedCounts = {};
  for (const requirement of requirements) {
    const key = slotRequirementKey(requirement);
    proposedCounts[key] = (proposedCounts[key] || 0) + 1;
    const occupied = existing.filter(a => slotRequirementKey(a) === key).length;
    if (occupied + proposedCounts[key] > modeledSlotBucketCapacity(requirement)) {
      return { ok: false, requirement, requirements };
    }
  }
  return { ok: true, requirements };
}

function reserveRouteSlots(state, route, requirements = null) {
  const portfolio = ensureSlotPortfolio(state);
  const needed = requirements || slotSeriesRequirements(route, state.meta?.lastProcessedAt || Date.now());
  needed.forEach(requirement => portfolio.push({ ...requirement, routeId: route.id, seasonallyAllocated: true }));
  return needed.length;
}

function validateRoutePlan({ originId, destId, aircraftTypeId, departMinute }) {
  const issues = [];
  const origin = airport(originId);
  const destination = airport(destId);
  const type = aircraftType(aircraftTypeId);
  if (!origin || !destination || !type) return [{ code: 'REFERENCE', message: 'Référence aéroport ou appareil inconnue.' }];
  if (originId === destId) issues.push({ code: 'SAME_AIRPORT', message: 'Origine et destination doivent être différentes.' });

  const distanceKm = distanceBetween(originId, destId);
  if (distanceKm > type.rangeKm) {
    issues.push({ code: 'RANGE', message: `${type.name} ne dispose pas de l’autonomie publiée nécessaire pour ${Math.round(distanceKm)} km.` });
  }
  const limitingRunway = Math.min(origin.runwayM || Infinity, destination.runwayM || Infinity);
  if (type.runway && limitingRunway < type.runway) {
    issues.push({ code: 'RUNWAY', message: `La piste disponible est inférieure au besoin de référence de ${type.runway} m pour ${type.name}.` });
  }
  if (minuteFallsInWindow(departMinute, origin.curfewWindow)) {
    issues.push({ code: 'CURFEW_ORIGIN', message: `${originId} interdit les mouvements planifiés sur ce créneau local.` });
  }

  if (!issues.some(issue => issue.code === 'RANGE')) {
    const nowLocal = zonedParts(Date.now(), origin.timeZone);
    const departureUtc = zonedLocalToUtcMs(
      nowLocal.year, nowLocal.month, nowLocal.day,
      Math.floor(departMinute / 60), departMinute % 60, origin.timeZone,
    );
    const arrivalUtc = departureUtc + blockTimeHours(distanceKm, type.cruiseKmh) * 3600000;
    if (movementBlockedByCurfew(destId, arrivalUtc)) {
      issues.push({ code: 'CURFEW_DEST', message: `L’arrivée estimée tombe dans la période de couvre-feu de ${destId}.` });
    }
  }
  return issues;
}

const MAX_AIRCRAFT_SERVICE_HOURS_PER_DAY = 16;

function buildOperationalPlan(state, route, fromMs, toMs, rng = Math.random, sharedCrewLedger = null) {
  const type = aircraftType(route.aircraftTypeId);
  const distanceKm = distanceBetween(route.originId, route.destId);
  const blockH = blockTimeHours(distanceKm, type.cruiseKmh);
  const turnaroundH = (type.turnaround || 30) / 60;
  const scheduledRotationStarts = scheduledDepartureTimesBetween(route, fromMs, toMs);

  const legalRotations = [];
  let curfewRotations = 0;
  scheduledRotationStarts.forEach(outboundDeparture => {
    const outboundArrival = outboundDeparture + blockH * 3600000;
    const returnDeparture = outboundArrival + turnaroundH * 3600000;
    const returnArrival = returnDeparture + blockH * 3600000;
    const blocked =
      movementBlockedByCurfew(route.originId, outboundDeparture) ||
      movementBlockedByCurfew(route.destId, outboundArrival) ||
      movementBlockedByCurfew(route.destId, returnDeparture) ||
      movementBlockedByCurfew(route.originId, returnArrival);
    if (blocked) curfewRotations += 1;
    else legalRotations.push({ outboundDeparture, outboundArrival, returnDeparture, returnArrival });
  });

  const assigned = state.fleet.filter(f =>
    f.assignedRouteId === route.id && f.status === 'ACTIVE' && f.typeId === route.aircraftTypeId
  );
  const elapsedDays = Math.max(0, (toMs - fromMs) / DAY_MS);
  const serviceHoursPerRotation = blockH * 2 + turnaroundH * 2;
  const capacityHours = assigned.length * MAX_AIRCRAFT_SERVICE_HOURS_PER_DAY * elapsedDays;
  const utilizationCapacityRotations = serviceHoursPerRotation > 0
    ? Math.floor(capacityHours / serviceHoursPerRotation + 1e-9)
    : 0;
  const candidateRotations = legalRotations.slice(0, utilizationCapacityRotations);
  const utilizationCancelledRotations = Math.max(0, legalRotations.length - candidateRotations.length);
  const avgCondition = assigned.length ? assigned.reduce((sum, f) => sum + f.condition, 0) / assigned.length : 0;
  const crewLedger = sharedCrewLedger || createCrewPeriodLedger(state, fromMs, toMs);

  const outboundDepartureTimes = [];
  const returnDepartureTimes = [];
  const operatedDepartureTimes = [];
  let technicalCancelledRotations = 0;
  let crewCancelledRotations = 0;
  let delayedFlights = 0;

  candidateRotations.forEach(rotation => {
    if (!reserveCrewForRotation(crewLedger, type, blockH)) {
      crewCancelledRotations += 1;
      return;
    }
    const congestion = (
      airportCongestionFactor(route.originId, rotation.outboundDeparture) +
      airportCongestionFactor(route.destId, rotation.outboundArrival) +
      airportCongestionFactor(route.destId, rotation.returnDeparture) +
      airportCongestionFactor(route.originId, rotation.returnArrival)
    ) / 4;
    const cancellationRisk = clamp(0.0015 + Math.max(0, 75 - avgCondition) * 0.0008 + congestion * 0.0045, 0.0015, 0.08);
    const delayRisk = clamp(0.025 + congestion * 0.13 + Math.max(0, 85 - avgCondition) * 0.002, 0.03, 0.40);

    if (rng() < cancellationRisk) {
      technicalCancelledRotations += 1;
      return;
    }

    outboundDepartureTimes.push(rotation.outboundDeparture);
    returnDepartureTimes.push(rotation.returnDeparture);
    operatedDepartureTimes.push(rotation.outboundDeparture, rotation.returnDeparture);
    if (rng() < delayRisk) delayedFlights += 1;
    if (rng() < delayRisk) delayedFlights += 1;
  });

  const scheduledRotations = scheduledRotationStarts.length;
  const operatedRotations = outboundDepartureTimes.length;
  const cancelledRotations = curfewRotations + utilizationCancelledRotations + technicalCancelledRotations + crewCancelledRotations;

  return {
    scheduledRotations,
    operatedRotations,
    cancelledRotations,
    scheduledFlights: scheduledRotations * 2,
    operatedFlights: operatedRotations * 2,
    cancelledFlights: cancelledRotations * 2,
    delayedFlights,
    curfewCancellations: curfewRotations * 2,
    utilizationCancellations: utilizationCancelledRotations * 2,
    technicalCancellations: technicalCancelledRotations * 2,
    crewCancellations: crewCancelledRotations * 2,
    outboundDepartureTimes,
    returnDepartureTimes,
    operatedDepartureTimes: operatedDepartureTimes.sort((a, b) => a - b),
    blockHoursPerFlight: blockH,
    serviceHoursPerFlight: blockH + turnaroundH,
    serviceHoursPerRotation,
    utilizationCapacity: utilizationCapacityRotations * 2,
    utilizationCapacityRotations,
  };
}

function prorateWeekly(value, elapsedMs) {
  return value * (elapsedMs / WEEK_MS);
}

// -----------------------------------------------------------------------------
// 4. NEW GAME
// -----------------------------------------------------------------------------

function newGame(companyName, homeBaseId, rngSeed) {
  const rng = seededRandom(rngSeed || Date.now() % 100000);
  const competitors = COMPETITOR_TEMPLATES.map((tpl, i) => ({
    id: 'C' + i, name: tpl.name, strategy: tpl.strategy, hub: tpl.hub, theme: tpl.theme,
    cash: 180e6 + rng() * 60e6, reputation: 55 + rng() * 15,
    fleet: [], routes: [],
  }));
  competitors.forEach(c => seedCompetitorNetwork(c, rng));

  return {
    version: 3,
    meta: { week: 1, year: new Date().getUTCFullYear(), weekOfYear: getISOWeek(new Date()), createdAt: Date.now(), lastProcessedAt: Date.now(), currentTime: new Date().toISOString(), rngSeed: rngSeed || Date.now() % 100000, realTime: true },
    company: {
      name: companyName, homeBase: homeBaseId, aocCountry: airport(homeBaseId).country, trafficRights: [],
      cash: 45e6, currency: 'USD', reputation: 50, otp: 88,
      founded: true, bankrupt: false, nextAircraftSerial: 1, nextRouteSerial: 1,
    },
    fleet: [],
    routes: [],
    orders: [], // pending aircraft deliveries
    operations: { activeFlights: 0, completedFlights: 0, cancelledFlights: 0, delayedFlights: 0, totalPassengers: 0, activeFlightWindows: [], slotAllocations: [] },
    staffing: { pilots: CREW_DEFAULTS.pilots, cabinCrew: CREW_DEFAULTS.cabinCrew, reserveFraction: CREW_DEFAULTS.reserveFraction, pipeline: [] },
    finance: {
      loans: [],
      leaseDeposits: 0,
      cashHistory: [{ week: 0, cash: 45e6 }],
      plHistory: [],
      ledgerRecent: [],
      accounting: {
        passengerRevenue: 0,
        ancillaryRevenue: 0,
        cargoRevenue: 0,
        fuelExpense: 0,
        laborExpense: 0,
        crewExpense: 0,
        maintenanceExpense: 0,
        airportExpense: 0,
        handlingExpense: 0,
        cargoHandlingExpense: 0,
        distributionExpense: 0,
        disruptionExpense: 0,
        depreciationExpense: 0,
        leasingExpense: 0,
        insuranceExpense: 0,
        overheadExpense: 0,
        interestExpense: 0,
        taxesExpense: 0,
      },
    },
    market: {
      competitors,
      fuelPrice: 0.82,
      fx: { EURUSD: 1.08 },
      macro: { demandIndex: 1.0, fuelTrend: 0, cycle: 'NORMAL' },
      events: [],
    },
    log: [{ week: 0, type: 'FOUNDING', text: `${companyName} est fondée avec sa base à ${airport(homeBaseId).city}.` }],
  };
}

function seedCompetitorNetwork(c, rng) {
  const near = AIRPORTS
    .filter(a => a.id !== c.hub)
    .map(a => ({ a, d: distanceBetween(c.hub, a.id) }))
    .sort((x, y) => x.d - y.d);
  const routeCount = c.strategy === 'MEGA_HUB' ? 10 : c.strategy === 'REGIONAL' ? 5 : 7;
  const pickList = c.strategy === 'REGIONAL' ? near.slice(0, 8) : near.slice(0, 16);
  const chosen = [];
  while (chosen.length < routeCount && pickList.length) {
    const idx = Math.floor(rng() * pickList.length);
    chosen.push(pickList.splice(idx, 1)[0]);
  }
  chosen.forEach((entry, i) => {
    const type = pickAircraftForDistance(entry.d, c.strategy);
    const acId = 'CAC' + c.id + i;
    c.fleet.push({ id: acId, typeId: type.id, condition: 80 + rng() * 15 });
    c.routes.push({
      id: 'CR' + c.id + i, origin: c.hub, dest: entry.a.id, aircraftTypeId: type.id,
      freq: c.strategy === 'LOWCOST' ? 5 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 3),
      fareStrategy: c.strategy === 'LOWCOST' ? 'DISCOUNT' : c.strategy === 'PREMIUM_NETWORK' ? 'PREMIUM' : 'COMPETITIVE',
      refMultOverride: null,
      history: [],
    });
  });
}

function pickAircraftForDistance(d, strategy) {
  const availableTypes = commerciallyAvailableAircraftTypes();
  const candidates = availableTypes.filter(t => t.rangeKm >= d * 1.15);
  const pool = candidates.length ? candidates : availableTypes.filter(t => t.category?.startsWith('WIDEBODY')).slice(-2);
  if (!pool.length) return availableTypes[availableTypes.length - 1];
  if (strategy === 'REGIONAL') return pool[0];
  if (d < 2000) return pool.find(t => t.category === 'NARROWBODY' || t.category === 'REGIONAL') || pool[0];
  return pool[Math.floor(pool.length / 2)];
}

// -----------------------------------------------------------------------------
// 5. PRODUCT / OFFER ENUMERATION FOR A MARKET (O,D)
// -----------------------------------------------------------------------------

function scheduleFitScore(seg, departSlots) {
  // departSlots: array of minutes-from-midnight for this product's weekly departures
  if (!departSlots.length) return 0;
  const ideal = seg === 'BUSINESS' ? [7 * 60, 8 * 60 + 30, 17 * 60, 19 * 60] : [9 * 60, 14 * 60, 18 * 60];
  let best = 0;
  departSlots.forEach(slot => {
    ideal.forEach(id => {
      const diff = Math.min(Math.abs(slot - id), 1440 - Math.abs(slot - id));
      const score = Math.max(0, 1 - diff / 300);
      if (score > best) best = score;
    });
  });
  return best;
}


// Structural payload reference values are rounded planning figures. They are deliberately
// separate from the published maximum-range number because maximum range is not available
// at maximum payload. The taper below approximates the payload-range tradeoff until a full
// type-specific AFM/performance implementation is introduced.
const AIRCRAFT_MAX_PAYLOAD_KG = {
  'ATR72-600': 7500,
  'E190-E2': 13500,
  'A220-300': 18500,
  'A320neo': 19000,
  'A321neo': 25300,
  'A321XLR': 25000,
  '737-8': 20500,
  '787-9': 52600,
  'A330-900': 44500,
  'A350-900': 53000,
  'A350-1000': 64000,
  '777-9': 70000,
};

function standardCheckedBaggageKg(originId, destId) {
  const origin = airport(originId);
  const destination = airport(destId);
  if (!origin || !destination) return 13;
  if (origin.country === destination.country) return 11;
  if (origin.region === 'EU' && destination.region === 'EU') return 13;
  if (origin.region !== destination.region) return 15;
  return 13;
}

function standardTrafficMassPerPassengerKg(originId, destId) {
  // EASA standard all-adult passenger mass includes hand baggage; checked baggage is added separately.
  return 84 + standardCheckedBaggageKg(originId, destId);
}

function missionPayloadLimitKg(type, distanceKm) {
  if (!type || distanceKm < 0) return 0;
  const structuralPayload = AIRCRAFT_MAX_PAYLOAD_KG[type.id] || type.seats * 105;
  if (!type.rangeKm || distanceKm > type.rangeKm) return 0;
  const rangeRatio = distanceKm / type.rangeKm;
  if (rangeRatio <= 0.65) return structuralPayload;
  const progress = clamp((rangeRatio - 0.65) / 0.35, 0, 1);
  const payloadFraction = 1 - 0.45 * progress;
  return structuralPayload * payloadFraction;
}

function payloadLimitedSeats(type, distanceKm, originId, destId) {
  const trafficMass = standardTrafficMassPerPassengerKg(originId, destId);
  if (!trafficMass) return 0;
  return Math.max(0, Math.min(type.seats, Math.floor(missionPayloadLimitKg(type, distanceKm) / trafficMass)));
}

function availableBellyCargoKg(type, distanceKm, passengers, originId, destId) {
  const trafficMass = Math.max(0, passengers) * standardTrafficMassPerPassengerKg(originId, destId);
  return Math.max(0, missionPayloadLimitKg(type, distanceKm) - trafficMass);
}


// Cargo utilization is anchored to current IATA industry load-factor levels, while route-level
// yield and corridor demand multipliers remain transparent simulation assumptions rather than
// live freight quotations.
function cargoLoadFactorTarget(state, originId, destId) {
  const origin = airport(originId);
  const destination = airport(destId);
  const international = origin?.country && destination?.country && origin.country !== destination.country;
  const industryAnchor = international ? 0.524 : 0.463;
  const macro = clamp(state?.market?.macro?.demandIndex || 1, 0.70, 1.30);
  let corridor = 1;
  const pair = [origin?.region, destination?.region].sort().join('|');
  if (pair === 'ASIA|EU') corridor = 1.08;
  else if (pair === 'EU|NA') corridor = 1.04;
  else if (pair === 'ASIA|NA') corridor = 1.10;
  else if (pair.includes('AFRICA')) corridor = 0.96;
  return clamp(industryAnchor * corridor * (0.9 + 0.1 * macro), 0.30, 0.68);
}

function cargoYieldUSDPerKg(distanceKm, originId, destId) {
  const origin = airport(originId);
  const destination = airport(destId);
  const international = origin?.country && destination?.country && origin.country !== destination.country;
  const distanceComponent = 0.00018 * Math.max(0, distanceKm);
  return clamp((international ? 1.05 : 0.82) + distanceComponent, 0.85, 4.25);
}

function bellyCargoEconomics(state, type, originId, destId, distanceKm, passengersPerFlight, flights) {
  const sectors = Math.max(0, flights || 0);
  if (!type || sectors <= 0) return { availableKg: 0, carriedKg: 0, revenueUSD: 0, handlingCostUSD: 0, yieldUSDPerKg: 0, loadFactor: 0 };
  const availablePerFlightKg = availableBellyCargoKg(type, distanceKm, passengersPerFlight, originId, destId);
  const availableKg = availablePerFlightKg * sectors;
  const loadFactor = cargoLoadFactorTarget(state, originId, destId);
  const carriedKg = availableKg * loadFactor;
  const yieldUSDPerKg = cargoYieldUSDPerKg(distanceKm, originId, destId);
  const revenueUSD = carriedKg * yieldUSDPerKg;
  const handlingCostUSD = carriedKg * 0.16;
  return { availableKg, carriedKg, revenueUSD, handlingCostUSD, yieldUSDPerKg, loadFactor };
}

function routeHasActiveAircraft(state, route) {
  return state.fleet.some(f => f.assignedRouteId === route.id && f.status === 'ACTIVE');
}


function returnDepartureSlots(route, referenceMs = Date.now()) {
  const type = aircraftType(route.aircraftTypeId);
  if (!type) return [];
  const destination = airport(route.destId);
  const blockH = blockTimeHours(distanceBetween(route.originId, route.destId), type.cruiseKmh);
  const turnaroundMs = (type.turnaround || 30) * 60000;
  const weekStart = startOfIsoWeekUtc(referenceMs);
  const departures = scheduledDepartureTimesBetween(route, weekStart - DAY_MS, weekStart + 7 * DAY_MS);
  return departures.map(outboundDeparture => {
    const returnDeparture = outboundDeparture + blockH * 3600000 + turnaroundMs;
    const local = zonedParts(returnDeparture, destination?.timeZone || 'UTC');
    return local.hour * 60 + local.minute;
  });
}

function buildPlayerProducts(state, originId, destId) {
  const products = [];

  // Published routes are physical round trips. The stored route describes the outbound
  // commercial service; its return sector is derived from block time + turnaround.
  const outboundRoutes = state.routes.filter(r =>
    r.status === 'ACTIVE' && r.originId === originId && r.destId === destId && routeHasActiveAircraft(state, r)
  );
  outboundRoutes.forEach(route => products.push(
    makeProductFromRoute(route, 'PLAYER', state.company, [route], {
      direction: 'OUTBOUND', originId, destId,
      departSlots: route.schedule.map(s => s.minute),
    })
  ));

  const returnRoutes = state.routes.filter(r =>
    r.status === 'ACTIVE' && r.originId === destId && r.destId === originId && routeHasActiveAircraft(state, r)
  );
  returnRoutes.forEach(route => products.push(
    makeProductFromRoute(route, 'PLAYER', state.company, [route], {
      direction: 'RETURN', originId, destId,
      departSlots: returnDepartureSlots(route, state.meta?.lastProcessedAt || Date.now()),
    })
  ));

  // Keep connection construction schedule-aware. Connections are built from published
  // outbound legs here; reverse-direction direct service is still fully sellable above.
  const legsOut = state.routes.filter(r =>
    r.status === 'ACTIVE' && r.originId === originId && r.destId !== destId && routeHasActiveAircraft(state, r)
  );
  legsOut.forEach(leg1 => {
    state.routes
      .filter(r => r.status === 'ACTIVE' && r.originId === leg1.destId && r.destId === destId && routeHasActiveAircraft(state, r))
      .forEach(leg2 => {
        if (leg1.destId !== originId) {
          const metrics = connectionScheduleMetrics(leg1, leg2, state.meta?.lastProcessedAt || Date.now());
          if (metrics.feasibleFrequency > 0) products.push(makeConnectProduct([leg1, leg2], 'PLAYER', state.company, metrics));
        }
      });
  });
  return products;
}

function buildCompetitorProducts(state, originId, destId) {
  const products = [];
  state.market.competitors.forEach(c => {
    const r = c.routes.find(rt => rt.origin === originId && rt.dest === destId);
    if (r) products.push(makeProductFromCompetitorRoute(r, c));
  });
  return products;
}

function makeProductFromRoute(route, owner, company, legs, options = {}) {
  const oType = aircraftType(route.aircraftTypeId);
  const originId = options.originId || route.originId;
  const destId = options.destId || route.destId;
  const direction = options.direction || 'OUTBOUND';
  const dist = distanceBetween(originId, destId);
  const departSlots = options.departSlots || route.schedule.map(s => s.minute);
  const missionSeats = payloadLimitedSeats(oType, dist, originId, destId);
  return {
    key: direction === 'RETURN' ? 'P-' + route.id + '-RETURN' : 'P-' + route.id,
    owner, ownerRef: company, legs: 1, distanceKm: dist,
    freq: route.frequencyPerWeek, fareStrategy: route.fareStrategy,
    departSlots,
    totalTripHours: blockTimeHours(dist, oType.cruiseKmh),
    reputation: company.reputation, otp: company.otp,
    seats: missionSeats, nominalSeats: oType.seats, route, direction, originId, destId,
  };
}

function makeConnectProduct(legs, owner, company, metrics = null) {
  const [l1, l2] = legs;
  const t1 = aircraftType(l1.aircraftTypeId), t2 = aircraftType(l2.aircraftTypeId);
  const d1 = distanceBetween(l1.originId, l1.destId), d2 = distanceBetween(l2.originId, l2.destId);
  const bt1 = blockTimeHours(d1, t1.cruiseKmh), bt2 = blockTimeHours(d2, t2.cruiseKmh);
  const connection = metrics || connectionScheduleMetrics(l1, l2);
  const waitHours = Number.isFinite(connection.averageWaitHours) ? connection.averageWaitHours : connection.mctHours;
  const seats1 = payloadLimitedSeats(t1, d1, l1.originId, l1.destId);
  const seats2 = payloadLimitedSeats(t2, d2, l2.originId, l2.destId);
  return {
    key: 'P-' + l1.id + '-' + l2.id, owner, ownerRef: company, legs: 2,
    distanceKm: d1 + d2,
    freq: connection.feasibleFrequency || Math.min(l1.frequencyPerWeek, l2.frequencyPerWeek),
    fareStrategy: l1.fareStrategy,
    departSlots: l1.schedule.map(s => s.minute),
    totalTripHours: bt1 + bt2 + waitHours,
    reputation: company.reputation, otp: company.otp - 6,
    seats: Math.min(seats1, seats2), route: l1, secondRoute: l2,
    mctGap: waitHours,
  };
}

function makeProductFromCompetitorRoute(route, competitor) {
  const type = aircraftType(route.aircraftTypeId);
  const dist = distanceBetween(route.origin, route.dest);
  const spreadSlots = [6 * 60 + 30, 11 * 60, 15 * 60, 19 * 60 + 30, 21 * 60];
  const departSlots = Array.from({ length: Math.min(route.freq, 5) }, (_, i) => spreadSlots[i % spreadSlots.length]);
  return {
    key: 'P-' + route.id, owner: 'AI:' + competitor.id, ownerRef: competitor, legs: 1,
    distanceKm: dist, freq: route.freq, fareStrategy: route.fareStrategy,
    departSlots, totalTripHours: blockTimeHours(dist, type.cruiseKmh),
    reputation: competitor.reputation, otp: 83,
    seats: payloadLimitedSeats(type, dist, route.origin, route.dest), nominalSeats: type.seats, route,
  };
}

// -----------------------------------------------------------------------------
// 6. FARE + UTILITY + SHARE COMPUTATION
// -----------------------------------------------------------------------------

function productFareForSegment(product, seg) {
  const strat = FARE_STRATEGIES[product.fareStrategy] || FARE_STRATEGIES.COMPETITIVE;
  const routeMultiplier = product.fareStrategy === 'YIELD_OPTIMIZED'
    ? (product.route?._yieldMult || strat.refMult)
    : strat.refMult;
  const ref = fareReference(product.distanceKm) * routeMultiplier;
  const p = SEG_PARAMS[seg];
  return ref * p.fareMult;
}

function productUtility(product, seg, marketState) {
  const p = SEG_PARAMS[seg];
  const strat = FARE_STRATEGIES[product.fareStrategy] || FARE_STRATEGIES.COMPETITIVE;
  const fare = productFareForSegment(product, seg);
  const alloc = product.fareStrategy === 'YIELD_OPTIMIZED' && product.route?._yieldAlloc
    ? product.route._yieldAlloc
    : strat.alloc;
  const availShare = alloc.flex + alloc.prem;
  const valueShare = alloc.deep + alloc.disc;
  const sched = scheduleFitScore(seg, product.departSlots);
  const priorShare = marketState.priorShare[product.owner] || 0;
  let u = -p.priceBeta * fare
    + p.availW * availShare
    + p.valueW * valueShare
    + p.freqW * Math.log(1 + product.freq)
    + p.schedW * sched
    - p.durW * product.totalTripHours
    - p.stopPen * (product.legs - 1)
    - p.mctPen * Math.max(0, (product.mctGap || 0) - 0.75)
    + p.reputW * (product.reputation - 50) / 50
    + p.otpW * (product.otp - 80) / 20
    + p.loyaltyW * priorShare;
  return u;
}

function computeMarketOutcome(state, originId, destId, weekOfYear) {
  const o = airport(originId), d = airport(destId);
  const dist = distanceBetween(originId, destId);
  const playerProducts = buildPlayerProducts(state, originId, destId);
  const compProducts = buildCompetitorProducts(state, originId, destId);
  const products = [...playerProducts, ...compProducts];
  if (products.length === 0) return null;

  const marketKey = originId + '|' + destId;
  const priorShare = state._priorShareCache && state._priorShareCache[marketKey] || {};
  const marketState = { priorShare };

  const result = { originId, destId, distanceKm: dist, segments: {} };

  SEGMENTS.forEach(seg => {
    const potential = segmentBasePotential(o, d, dist, seg, weekOfYear, state.market.macro);
    const utilities = products.map(pr => productUtility(pr, seg, marketState));
    const outsideU = SEG_PARAMS[seg].outsideBase - groundAltBonus(dist, seg);
    const shares = softmax([...utilities, outsideU]);
    const segResult = { potential, products: [] };
    products.forEach((pr, i) => {
      const rawPax = shares[i] * potential;
      segResult.products.push({ key: pr.key, owner: pr.owner, seg, pax: rawPax, fare: productFareForSegment(pr, seg) });
    });
    result.segments[seg] = segResult;
  });

  // capacity constraint + single-pass spill/recapture
  applyCapacityConstraints(result, products);

  return result;
}

function applyCapacityConstraints(result, products) {
  const capUsed = {};
  products.forEach(p => { capUsed[p.key] = 0; });
  const capacity = {};
  products.forEach(p => { capacity[p.key] = p.seats * p.freq; });

  const allEntries = [];
  SEGMENTS.forEach(seg => result.segments[seg].products.forEach(e => allEntries.push(e)));

  // pass 1: raw fill, track overflow
  let overflowPool = 0;
  allEntries.forEach(e => {
    const room = Math.max(0, capacity[e.key] - capUsed[e.key]);
    if (e.pax > room) {
      overflowPool += (e.pax - room);
      e.pax = room;
    }
    capUsed[e.key] += e.pax;
  });

  // pass 2: redistribute overflow proportionally to entries with remaining room
  if (overflowPool > 0.5) {
    const withRoom = allEntries.filter(e => capacity[e.key] - capUsed[e.key] > 0.5);
    const totalRoom = withRoom.reduce((s, e) => s + (capacity[e.key] - capUsed[e.key]), 0);
    if (totalRoom > 0) {
      withRoom.forEach(e => {
        const room = capacity[e.key] - capUsed[e.key];
        const take = Math.min(room, overflowPool * (room / totalRoom));
        e.pax += take;
        capUsed[e.key] += take;
      });
    }
    // remaining overflow beyond total system room is simply lost demand (realistic: no purchase)
  }
}

// -----------------------------------------------------------------------------
// 7. FINANCE HELPERS
// -----------------------------------------------------------------------------

function fleetValue(state) {
  return state.fleet.filter(f => f.ownership === 'OWNED').reduce((s, f) => {
    const type = aircraftType(f.typeId);
    const ageYears = f.ageWeeks / 52;
    const residual = Math.max(0.15, 1 - ageYears / 25);
    return s + type.price * residual;
  }, 0);
}

function addLedger(state, week, category, amount, note) {
  state.finance.ledgerRecent.push({ week, category, amount, note });
  if (state.finance.ledgerRecent.length > 300) {
    state.finance.ledgerRecent.splice(0, state.finance.ledgerRecent.length - 300);
  }
}

// -----------------------------------------------------------------------------
// 8. WEEKLY TICK
// -----------------------------------------------------------------------------


/* =========================
   AERODESK V3 ECONOMIC LAYER
   ========================= */

const AERODESK_V3 = {
  ancillaryRate: 0.14,
  laborDailyBaseUSD: 1800,
  laborPerAircraftDailyUSD: 520,
  laborPerRouteDailyUSD: 180,
  insuranceAnnualRate: 0.008,
  carbonEURPerTonneCO2: 90,
  co2KgPerLiterJetA: 2.52,
  airportInflationAnnual: 0.025,
};


const EUROPEAN_CARBON_MARKET_AIRPORTS = new Set(['LHR', 'CDG', 'FRA', 'AMS', 'MAD', 'FCO']);
const SCHEDULED_CHECK_INTERVAL_HOURS = 650;
const SCHEDULED_CHECK_INTERVAL_CYCLES = 400;
const SCHEDULED_CHECK_DURATION_HOURS = 18;


const CREW_DEFAULTS = {
  pilots: 12,
  cabinCrew: 24,
  reserveFraction: 0.15,
  pilotRecruitmentDays: 56,
  cabinRecruitmentDays: 28,
  pilotRecruitmentCostUSD: 15000,
  cabinRecruitmentCostUSD: 4000,
};

function ensureStaffing(state) {
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

function crewLegalLimits(elapsedMs) {
  const days = Math.max(0, elapsedMs / DAY_MS);
  if (!days) return { dutyHoursPerPerson: 0, flightHoursPerPerson: 0 };
  // ORO.FTL.210 ceilings: 60 duty h/7d, 110/14d, 190/28d, and 100 flight h/28d.
  // The 28-day limits are prorated as a planning envelope to avoid scheduling the whole
  // rolling allowance into a single short period; daily FDP limits remain modeled separately.
  const dutyHoursPerPerson = Math.min(
    60 * Math.max(1, days / 7),
    110 * Math.max(1, days / 14),
    190 * Math.max(1, days / 28),
    (190 / 28) * days,
  );
  const flightHoursPerPerson = Math.min(100, (100 / 28) * days);
  return { dutyHoursPerPerson, flightHoursPerPerson };
}

function crewCapacityForPeriod(state, fromMs, toMs) {
  const staffing = ensureStaffing(state);
  const elapsed = Math.max(0, toMs - fromMs);
  const legal = crewLegalLimits(elapsed);
  const schedulableShare = clamp(1 - staffing.reserveFraction, 0.5, 1);
  return {
    pilotDutyHours: staffing.pilots * schedulableShare * legal.dutyHoursPerPerson,
    pilotFlightHours: staffing.pilots * schedulableShare * legal.flightHoursPerPerson,
    cabinDutyHours: staffing.cabinCrew * schedulableShare * legal.dutyHoursPerPerson,
    cabinFlightHours: staffing.cabinCrew * schedulableShare * legal.flightHoursPerPerson,
  };
}

function crewRequirementForRotation(type, blockHoursPerSector) {
  const base = minimumOperatingCrew(type);
  const flightHours = blockHoursPerSector * 2;
  const dutyHours = flightHours + ((type.turnaround || 30) / 60) * 2 + 1.25;
  let pilots = base.flightDeck;
  if (dutyHours > 15) pilots = Math.max(pilots, 4);
  else if (dutyHours > 12.5) pilots = Math.max(pilots, 3);
  let cabin = base.cabin;
  if (dutyHours > 14) cabin = Math.ceil(cabin * 1.25);
  return {
    pilots,
    cabin,
    dutyHours,
    flightHours,
    pilotDutyHours: pilots * dutyHours,
    pilotFlightHours: pilots * flightHours,
    cabinDutyHours: cabin * dutyHours,
    cabinFlightHours: cabin * flightHours,
  };
}

function createCrewPeriodLedger(state, fromMs, toMs) {
  const capacity = crewCapacityForPeriod(state, fromMs, toMs);
  return {
    ...capacity,
    usedPilotDutyHours: 0,
    usedPilotFlightHours: 0,
    usedCabinDutyHours: 0,
    usedCabinFlightHours: 0,
  };
}

function reserveCrewForRotation(ledger, type, blockHoursPerSector) {
  if (!ledger || !type) return false;
  const req = crewRequirementForRotation(type, blockHoursPerSector);
  const fits =
    ledger.usedPilotDutyHours + req.pilotDutyHours <= ledger.pilotDutyHours + 1e-9 &&
    ledger.usedPilotFlightHours + req.pilotFlightHours <= ledger.pilotFlightHours + 1e-9 &&
    ledger.usedCabinDutyHours + req.cabinDutyHours <= ledger.cabinDutyHours + 1e-9 &&
    ledger.usedCabinFlightHours + req.cabinFlightHours <= ledger.cabinFlightHours + 1e-9;
  if (!fits) return false;
  ledger.usedPilotDutyHours += req.pilotDutyHours;
  ledger.usedPilotFlightHours += req.pilotFlightHours;
  ledger.usedCabinDutyHours += req.cabinDutyHours;
  ledger.usedCabinFlightHours += req.cabinFlightHours;
  return true;
}

function actionHireCrew(state, { pilots = 0, cabinCrew = 0 } = {}) {
  const s = structuredCloneLite(state);
  const staffing = ensureStaffing(s);
  const pilotCount = Math.max(0, Math.floor(pilots || 0));
  const cabinCount = Math.max(0, Math.floor(cabinCrew || 0));
  if (!pilotCount && !cabinCount) return { state: s, error: 'Aucun recrutement demandé.' };
  const cost = pilotCount * CREW_DEFAULTS.pilotRecruitmentCostUSD + cabinCount * CREW_DEFAULTS.cabinRecruitmentCostUSD;
  if (s.company.cash < cost) return { state: s, error: 'Trésorerie insuffisante pour le recrutement et la qualification.' };
  const nowMs = s.meta?.lastProcessedAt || Date.now();
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
  return { state: s, error: null };
}

function processCrewPipeline(state, nowMs) {
  const staffing = ensureStaffing(state);
  staffing.pipeline = staffing.pipeline.filter(batch => {
    if (batch.availableAt > nowMs) return true;
    staffing.pilots += batch.pilots || 0;
    staffing.cabinCrew += batch.cabinCrew || 0;
    state.log.push({ week: state.meta.week, type: 'CREW', text: 'Nouveaux équipages qualifiés et disponibles pour le planning.' });
    return false;
  });
  return staffing;
}

function minimumOperatingCrew(type) {
  const flightDeck = 2;
  const cabin = Math.max(1, Math.ceil(type.seats / 50));
  return { flightDeck, cabin, total: flightDeck + cabin };
}

function crewCostForOperations(type, totalBlockHours, flights) {
  if (!flights || totalBlockHours <= 0) return 0;
  const blockPerFlight = totalBlockHours / flights;
  const dutyHours = blockPerFlight + 1.5; // report, taxi/turn and post-flight duty proxy
  let augmentation = 1.0;
  if (dutyHours > 17) augmentation = 1.8;
  else if (dutyHours > 15) augmentation = 1.5;
  else if (dutyHours > 13) augmentation = 1.2;

  const regulatoryCrew = minimumOperatingCrew(type).total;
  const rosteredCrew = Math.max(type.crew, regulatoryCrew);
  // Base salaries are part of recurring payroll; flight operations carry only variable crew costs.
  const augmentationPremium = rosteredCrew * 95 * totalBlockHours * Math.max(0, augmentation - 1);
  const perDiem = blockPerFlight >= 6 ? rosteredCrew * 75 * flights : 0;
  const layover = blockPerFlight >= 10 ? rosteredCrew * 140 * flights : 0;
  return augmentationPremium + perDiem + layover;
}

function applyAircraftUsage(state, aircraft, type, flownCycles, flownBlockHours, nowMs, rng = Math.random) {
  const previousHours = aircraft.flightHours || 0;
  const previousCycles = aircraft.cycles || 0;
  if (!aircraft.nextScheduledCheckHours) {
    aircraft.nextScheduledCheckHours = (Math.floor(previousHours / SCHEDULED_CHECK_INTERVAL_HOURS) + 1) * SCHEDULED_CHECK_INTERVAL_HOURS;
  }
  if (!aircraft.nextScheduledCheckCycles) {
    aircraft.nextScheduledCheckCycles = (Math.floor(previousCycles / SCHEDULED_CHECK_INTERVAL_CYCLES) + 1) * SCHEDULED_CHECK_INTERVAL_CYCLES;
  }

  aircraft.flightHours = previousHours + flownBlockHours;
  aircraft.cycles = previousCycles + flownCycles;
  aircraft.condition = clamp(aircraft.condition - flownBlockHours * 0.035 - flownCycles * 0.025, 10, 100);

  const scheduledDue =
    aircraft.flightHours >= aircraft.nextScheduledCheckHours ||
    aircraft.cycles >= aircraft.nextScheduledCheckCycles;
  let maintenanceCost = 0;
  let scheduled = false;

  if (scheduledDue) {
    scheduled = true;
    aircraft.status = 'MAINTENANCE';
    aircraft.maintUntil = nowMs + SCHEDULED_CHECK_DURATION_HOURS * 3600000;
    maintenanceCost = type.maintPerHour * SCHEDULED_CHECK_DURATION_HOURS;
    while (aircraft.nextScheduledCheckHours <= aircraft.flightHours) aircraft.nextScheduledCheckHours += SCHEDULED_CHECK_INTERVAL_HOURS;
    while (aircraft.nextScheduledCheckCycles <= aircraft.cycles) aircraft.nextScheduledCheckCycles += SCHEDULED_CHECK_INTERVAL_CYCLES;
    state.log.push({ week: state.meta.week, type: 'MAINT', text: `${aircraft.id} entre en visite programmée après seuil heures/cycles.` });
  } else if (aircraft.condition < 65 && flownCycles > 0) {
    const perCycleRisk = 0.001 + Math.max(0, 65 - aircraft.condition) * 0.00035;
    const unscheduledRisk = 1 - Math.pow(1 - perCycleRisk, flownCycles);
    if (rng() < unscheduledRisk) {
      aircraft.status = 'MAINTENANCE';
      aircraft.maintUntil = nowMs + 2 * DAY_MS;
      maintenanceCost = type.maintPerHour * 25;
      state.log.push({ week: state.meta.week, type: 'MAINT', text: `${aircraft.id} est immobilisé pour maintenance non programmée.` });
    }
  }

  return { maintenanceCost, scheduled };
}


const EU_PASSENGER_RIGHTS_AIRPORTS = new Set(['CDG', 'FRA', 'AMS', 'MAD', 'FCO']);

function euPassengerRightsCovered(state, route) {
  const originEU = EU_PASSENGER_RIGHTS_AIRPORTS.has(route.originId);
  const destinationEU = EU_PASSENGER_RIGHTS_AIRPORTS.has(route.destId);
  const carrierEU = EU_PASSENGER_RIGHTS_AIRPORTS.has(state.company.homeBase);
  return originEU || (destinationEU && carrierEU);
}

function passengerDisruptionCost(state, route, plan, bookedPassengers) {
  const empty = { affectedPassengers: 0, eligiblePassengers: 0, compensationUSD: 0, careUSD: 0, reaccommodationUSD: 0, totalUSD: 0 };
  if (!plan?.scheduledFlights || !plan.cancelledFlights || bookedPassengers <= 0 || !euPassengerRightsCovered(state, route)) return empty;

  const cancelledShare = clamp(plan.cancelledFlights / plan.scheduledFlights, 0, 1);
  const affectedPassengers = bookedPassengers * cancelledShare;
  const controllableCancelled = Math.min(
    plan.cancelledFlights,
    (plan.technicalCancellations || 0) + (plan.utilizationCancellations || 0) + (plan.crewCancellations || 0) + (plan.curfewCancellations || 0),
  );
  const eligiblePassengers = bookedPassengers * clamp(controllableCancelled / plan.scheduledFlights, 0, 1);
  const distanceKm = distanceBetween(route.originId, route.destId);
  const intraEU = EU_PASSENGER_RIGHTS_AIRPORTS.has(route.originId) && EU_PASSENGER_RIGHTS_AIRPORTS.has(route.destId);
  const compensationEUR = distanceKm <= 1500 ? 250 : ((intraEU || distanceKm <= 3500) ? 400 : 600);
  const fx = state.market?.fx?.EURUSD || 1.08;

  const compensationUSD = eligiblePassengers * compensationEUR * fx;
  const careEURPerPassenger = 20 + Math.min(80, distanceKm / 40);
  const careUSD = affectedPassengers * careEURPerPassenger * fx;
  const reaccommodationEUR = affectedPassengers * (45 + Math.min(350, distanceKm * 0.05));
  const reaccommodationUSD = reaccommodationEUR * fx;
  return {
    affectedPassengers,
    eligiblePassengers,
    compensationUSD,
    careUSD,
    reaccommodationUSD,
    totalUSD: compensationUSD + careUSD + reaccommodationUSD,
  };
}

function v3EnsureFinance(state) {
  state.finance = state.finance || {};
  state.finance.accounting = state.finance.accounting || {};
  return state.finance.accounting;
}

function v3BookAccounting(state, bucket, amount) {
  const accounting = v3EnsureFinance(state);
  accounting[bucket] = (accounting[bucket] || 0) + amount;
}

function v3ProcessRecurringCosts(state, elapsedMs) {
  const days = elapsedMs / DAY_MS;
  const activeRoutes = state.routes.filter(r => r.status === 'ACTIVE').length;
  const aircraftCount = state.fleet.length;
  const staffing = ensureStaffing(state);

  // Loaded payroll: flight/cabin crew now scale with actual establishment rather than being
  // conjured per flight. Ground/administrative labor remains a compact fleet/network proxy.
  const flightCrewPayroll = staffing.pilots * 420 * days;
  const cabinCrewPayroll = staffing.cabinCrew * 190 * days;
  const groundAndAdmin = (
    AERODESK_V3.laborDailyBaseUSD +
    aircraftCount * AERODESK_V3.laborPerAircraftDailyUSD +
    activeRoutes * AERODESK_V3.laborPerRouteDailyUSD
  ) * days;
  const labor = flightCrewPayroll + cabinCrewPayroll + groundAndAdmin;

  const insuredValue = fleetValue(state);
  const insurance = insuredValue * AERODESK_V3.insuranceAnnualRate * days / 365;

  v3BookAccounting(state, 'laborExpense', labor);
  v3BookAccounting(state, 'insuranceExpense', insurance);

  return { labor, insurance };
}

function v3AddAncillaryRevenue(state, passengerRevenue) {
  const ancillary = passengerRevenue * AERODESK_V3.ancillaryRate;
  v3BookAccounting(state, 'ancillaryRevenue', ancillary);
  return ancillary;
}

function v3ApplyCarbonCost(state, fuelLiters, originId = null, destId = null) {
  // Model direct allowance cost only for flights inside the covered European carbon market.
  // Extra-European emissions remain tracked physically but are not charged a fictional flat ETS fee.
  const covered = EUROPEAN_CARBON_MARKET_AIRPORTS.has(originId) && EUROPEAN_CARBON_MARKET_AIRPORTS.has(destId);
  if (!covered) return 0;
  const tonnesCO2 = fuelLiters * AERODESK_V3.co2KgPerLiterJetA / 1000;
  const eurCost = tonnesCO2 * AERODESK_V3.carbonEURPerTonneCO2;
  const eurUsd = state.market?.fx?.EURUSD || 1.08;
  const costUSD = eurCost * eurUsd;
  v3BookAccounting(state, 'taxesExpense', costUSD);
  return costUSD;
}

function v3GetPnl(state) {
  const a = v3EnsureFinance(state);
  const revenue =
    (a.passengerRevenue || 0) +
    (a.ancillaryRevenue || 0) +
    (a.cargoRevenue || 0);

  const expenses =
    (a.fuelExpense || 0) +
    (a.laborExpense || 0) +
    (a.crewExpense || 0) +
    (a.maintenanceExpense || 0) +
    (a.airportExpense || 0) +
    (a.handlingExpense || 0) +
    (a.cargoHandlingExpense || 0) +
    (a.distributionExpense || 0) +
    (a.disruptionExpense || 0) +
    (a.depreciationExpense || 0) +
    (a.leasingExpense || 0) +
    (a.insuranceExpense || 0) +
    (a.overheadExpense || 0) +
    (a.interestExpense || 0) +
    (a.taxesExpense || 0);

  return {
    revenue,
    expenses,
    operatingResult: revenue - expenses,
    margin: revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0,
  };
}

function v3RefreshOperationalCounters(state) {
  state.operations = state.operations || {};
  state.operations.activeFlights = state.operations.activeFlights || 0;
  state.operations.completedFlights = state.operations.completedFlights || 0;
  state.operations.cancelledFlights = state.operations.cancelledFlights || 0;
  state.operations.delayedFlights = state.operations.delayedFlights || 0;
  state.operations.totalPassengers = state.operations.totalPassengers || 0;
  state.operations.activeFlightWindows = state.operations.activeFlightWindows || [];
  return state;
}

function realTimeTick(prevState, nowMs = Date.now()) {
  const state = structuredCloneLite(prevState);
  const previousMs = state.meta.lastProcessedAt || nowMs;
  if (nowMs <= previousMs) return state;

  // Do not invent a week jump: process only the elapsed real-world time.
  // When the app was closed, the same elapsed period is caught up on resume.
  let cursor = previousMs;
  const maxCatchupMs = 365 * DAY_MS;
  const target = Math.min(nowMs, previousMs + maxCatchupMs);

  while (cursor < target) {
    const next = Math.min(target, cursor + DAY_MS);
    const elapsed = next - cursor;
    const dayDate = new Date(next);
    const rng = seededRandom(Math.floor(next / DAY_MS) + state.meta.rngSeed);
    state.meta.week = getISOWeek(dayDate);
    state.meta.year = dayDate.getUTCFullYear();
    state.meta.weekOfYear = getISOWeek(dayDate);

    updateMacroRealTime(state, rng, elapsed);
    processDeliveriesRealTime(state, next);
    processCrewPipeline(state, next);
    processRealTimeDay(state, cursor, next, rng);
    cursor = next;
  }

  state.meta.lastProcessedAt = target;
  state.meta.currentTime = new Date(target).toISOString();
  state.meta.totalRealTimeHours = (state.meta.totalRealTimeHours || 0) + (target - previousMs) / 3600000;
  checkBankruptcy(state, target);
  return state;
}


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

function processRealTimeDay(state, fromMs, toMs, rng) {
  const elapsed = toMs - fromMs;
  restoreMaintenanceRealTime(state, toMs);
  ensureStaffing(state);
  const crewLedger = createCrewPeriodLedger(state, fromMs, toMs);
  const routeOperationalPlans = {};
  state.routes.filter(r => r.status === 'ACTIVE').forEach(r => {
    routeOperationalPlans[r.id] = buildOperationalPlan(state, r, fromMs, toMs, rng, crewLedger);
  });
  const periodOps = { scheduledFlights: 0, operatedFlights: 0, cancelledFlights: 0, delayedFlights: 0 };
  const marketKeys = new Set();
  state.routes.filter(r => r.status === 'ACTIVE').forEach(r => {
    marketKeys.add(r.originId + '|' + r.destId);
    marketKeys.add(r.destId + '|' + r.originId);
    state.routes.filter(r2 => r2.status === 'ACTIVE' && r2.originId === r.destId)
      .forEach(r2 => marketKeys.add(r.originId + '|' + r2.destId));
  });
  state.market.competitors.forEach(c => c.routes.forEach(r => marketKeys.add(r.origin + '|' + r.dest)));

  const priorShareCache = state._priorShareCache || {};
  state._priorShareCache = {};
  const routeRevenue = {};
  const routePax = {};
  const routeBookedPax = {};
  const compRouteRevenue = {};

  marketKeys.forEach(key => {
    const [oId, dId] = key.split('|');
    const outcome = computeMarketOutcome({ ...state, _priorShareCache: priorShareCache }, oId, dId, state.meta.weekOfYear);
    if (!outcome) return;
    const totalPaxByOwner = {};
    SEGMENTS.forEach(seg => outcome.segments[seg].products.forEach(e => {
      totalPaxByOwner[e.owner] = (totalPaxByOwner[e.owner] || 0) + e.pax;
      if (e.owner === 'PLAYER') {
        const productKey = e.key.replace('P-', '');
        const product = findPlayerProductByKey(state, oId, dId, productKey);
        if (!product) return;
        const freq = Math.max(1, product.freq);
        const weeklyPax = e.pax;
        const primaryCounts = directionalServiceCounts(routeOperationalPlans[product.route.id]);
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
        const bookedShare = clamp(scheduledDepartures / freq, 0, 1);
        const pax = weeklyPax * flightsShare;
        const bookedPax = weeklyPax * bookedShare;
        const rev = pax * e.fare;
        if (product.legs === 1) {
          routeRevenue[product.route.id] = (routeRevenue[product.route.id] || 0) + rev;
          routePax[product.route.id] = (routePax[product.route.id] || 0) + pax;
          routeBookedPax[product.route.id] = (routeBookedPax[product.route.id] || 0) + bookedPax;
        } else {
          // A connecting itinerary generates revenue for both operating legs.
          const split = rev / 2;
          [product.route, product.secondRoute].forEach(leg => {
            routeRevenue[leg.id] = (routeRevenue[leg.id] || 0) + split;
            routePax[leg.id] = (routePax[leg.id] || 0) + pax;
            routeBookedPax[leg.id] = (routeBookedPax[leg.id] || 0) + bookedPax;
          });
        }
      } else if (e.owner.startsWith('AI:')) {
        compRouteRevenue[e.key] = (compRouteRevenue[e.key] || 0) + e.pax * e.fare;
      }
    }));
    const totalMarketPax = Object.values(totalPaxByOwner).reduce((a, b) => a + b, 0) || 1;
    state._priorShareCache[key] = {};
    Object.keys(totalPaxByOwner).forEach(owner => {
      state._priorShareCache[key][owner] = totalPaxByOwner[owner] / totalMarketPax;
    });
  });

  let revenue = 0, costs = 0;
  v3RefreshOperationalCounters(state);
  const breakdown = { fuel: 0, crew: 0, maint: 0, airport: 0, handling: 0, leasing: 0, distribution: 0, disruption: 0, depreciation: 0, insurance: 0, overhead: 0, interest: 0, taxes: 0 };
  const recurring = v3ProcessRecurringCosts(state, elapsed);
  costs += recurring.labor + recurring.insurance;
  breakdown.crew += recurring.labor;
  breakdown.insurance += recurring.insurance;
  const depreciation = calculateDepreciationExpense(state, elapsed);
  breakdown.depreciation += depreciation;
  v3BookAccounting(state, 'depreciationExpense', depreciation);

  state.routes.forEach(route => {
    if (route.status !== 'ACTIVE') return;
    const type = aircraftType(route.aircraftTypeId);
    const dist = distanceBetween(route.originId, route.destId);
    const plan = routeOperationalPlans[route.id] || buildOperationalPlan(state, route, fromMs, toMs, rng);
    periodOps.scheduledFlights += plan.scheduledFlights;
    periodOps.operatedFlights += plan.operatedFlights;
    periodOps.cancelledFlights += plan.cancelledFlights;
    periodOps.delayedFlights += plan.delayedFlights;
    state.operations.cancelledFlights += plan.cancelledFlights;
    state.operations.delayedFlights += plan.delayedFlights;
    const flights = plan.operatedFlights;
    const pax = routePax[route.id] || 0;
    const bookedPax = routeBookedPax[route.id] || pax;
    const routeRev = routeRevenueValue(routeRevenue, route.id);
    const disruption = passengerDisruptionCost(state, route, plan, bookedPax);
    const accounting = v3EnsureFinance(state);
    if (disruption.totalUSD > 0) {
      costs += disruption.totalUSD;
      breakdown.disruption += disruption.totalUSD;
      accounting.disruptionExpense = (accounting.disruptionExpense || 0) + disruption.totalUSD;
      addLedger(state, state.meta.week, 'PASSENGER_RIGHTS', -disruption.totalUSD, 'Indemnisation, assistance et réacheminement passagers');
    }
    if (!flights) {
      if (plan.scheduledFlights) {
        route.history = route.history || [];
        route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: 0, revenue: 0, cost: disruption.totalUSD, loadFactor: 0, scheduledFlights: plan.scheduledFlights, operatedFlights: 0, cancelledFlights: plan.cancelledFlights, delayedFlights: 0 });
        if (route.history.length > 365) route.history.splice(0, route.history.length - 365);
      }
      return;
    }
    const fuelPlan = buildFuelPlan(dist, type);
    const fuelLitersBurned = fuelPlan.expectedBurnLiters * flights;
    const fuelCost = fuelLitersBurned * state.market.fuelPrice;
    const blockH = blockTimeHours(dist, type.cruiseKmh) * flights;
    const crewCost = crewCostForOperations(type, blockH, flights);
    const cond = avgConditionForRoute(state, route);
    const ageMult = clamp(1.25 + (100 - cond) / 80, 1, 1.8);
    const maintCost = type.maintPerHour * blockH * ageMult;
    const sizeFactor = type.seats / 180;
    const airportCost = ((airport(route.originId).fee + airport(route.destId).fee) / 3 * sizeFactor + dist * 0.34) * flights;
    const passengerHandlingCost = pax * 12;
    const passengersPerFlight = flights > 0 ? pax / flights : 0;
    const cargo = bellyCargoEconomics(state, type, route.originId, route.destId, dist, passengersPerFlight, flights);
    const distributionCost = routeRev * 0.045;
    const routeCost = fuelCost + crewCost + maintCost + airportCost + passengerHandlingCost + cargo.handlingCostUSD + distributionCost;

    const ancillary = v3AddAncillaryRevenue(state, routeRev);
    const carbonCost = v3ApplyCarbonCost(state, fuelLitersBurned, route.originId, route.destId);

    revenue += routeRev + ancillary + cargo.revenueUSD;
    costs += routeCost + carbonCost;
    breakdown.fuel += fuelCost;
    breakdown.crew += crewCost;
    breakdown.maint += maintCost;
    breakdown.airport += airportCost;
    breakdown.handling += passengerHandlingCost + cargo.handlingCostUSD;
    breakdown.distribution += distributionCost;
    breakdown.taxes += carbonCost;

    accounting.passengerRevenue = (accounting.passengerRevenue || 0) + routeRev;
    accounting.cargoRevenue = (accounting.cargoRevenue || 0) + cargo.revenueUSD;
    accounting.fuelExpense = (accounting.fuelExpense || 0) + fuelCost;
    accounting.crewExpense = (accounting.crewExpense || 0) + crewCost;
    accounting.maintenanceExpense = (accounting.maintenanceExpense || 0) + maintCost;
    accounting.airportExpense = (accounting.airportExpense || 0) + airportCost;
    accounting.handlingExpense = (accounting.handlingExpense || 0) + passengerHandlingCost;
    accounting.cargoHandlingExpense = (accounting.cargoHandlingExpense || 0) + cargo.handlingCostUSD;
    accounting.distributionExpense = (accounting.distributionExpense || 0) + distributionCost;

    state.operations.totalPassengers += Math.round(pax);
    state.operations.completedFlights += flights;
    plan.operatedDepartureTimes.forEach(departureAt => {
      state.operations.activeFlightWindows.push({ routeId: route.id, departureAt, arrivalAt: departureAt + plan.blockHoursPerFlight * 3600000 });
    });

    const loadFactor = flights ? pax / (type.seats * flights) : 0;
    route.history = route.history || [];
    route.history.push({ time: new Date(toMs).toISOString(), week: state.meta.week, pax: Math.round(pax), cargoKg: Math.round(cargo.carriedKg), cargoRevenue: cargo.revenueUSD, revenue: routeRev + ancillary + cargo.revenueUSD, cost: routeCost + carbonCost + disruption.totalUSD, loadFactor, scheduledFlights: plan.scheduledFlights, operatedFlights: flights, cancelledFlights: plan.cancelledFlights, delayedFlights: plan.delayedFlights });
    if (route.history.length > 365) route.history.splice(0, route.history.length - 365);
    if (route.fareStrategy === 'YIELD_OPTIMIZED') adaptYield(route, loadFactor);

    const assigned = state.fleet.filter(f => f.assignedRouteId === route.id && f.status === 'ACTIVE' && f.typeId === route.aircraftTypeId);
    const blockPerFlight = blockTimeHours(dist, type.cruiseKmh);
    assigned.forEach((f, index) => {
      const baseFlights = Math.floor(flights / assigned.length);
      const tailFlights = baseFlights + (index < (flights % assigned.length) ? 1 : 0);
      if (!tailFlights) return;
      const usage = applyAircraftUsage(state, f, type, tailFlights, blockPerFlight * tailFlights, toMs, rng);
      if (usage.maintenanceCost > 0) {
        costs += usage.maintenanceCost;
        breakdown.maint += usage.maintenanceCost;
        accounting.maintenanceExpense = (accounting.maintenanceExpense || 0) + usage.maintenanceCost;
        addLedger(state, state.meta.week, usage.scheduled ? 'MAINT_SCHEDULED' : 'MAINT_UNSCHEDULED', -usage.maintenanceCost, usage.scheduled ? 'Visite de maintenance programmée' : 'Maintenance non programmée');
      }
    });
  });

  const leasing = state.fleet
    .filter(f => f.ownership === 'LEASED')
    .reduce((sum, f) => sum + prorateWeekly(aircraftType(f.typeId).leaseWeekly, elapsed), 0);
  const overhead = prorateWeekly(9000 + state.fleet.length * 900 + state.routes.filter(r => r.status === 'ACTIVE').length * 300, elapsed);
  breakdown.leasing = leasing;
  breakdown.overhead = overhead;
  costs += leasing + overhead;

  const accounting2 = v3EnsureFinance(state);
  accounting2.leasingExpense = (accounting2.leasingExpense || 0) + leasing;
  accounting2.overheadExpense = (accounting2.overheadExpense || 0) + overhead;

  let interestPaid = 0, principalPaid = 0;
  state.finance.loans = state.finance.loans.filter(loan => {
    const interest = loan.principal * loan.weeklyRate * (elapsed / WEEK_MS);
    const scheduledPrincipal = Math.min(loan.principal, Math.max(0, loan.weeklyPayment - loan.principal * loan.weeklyRate) * (elapsed / WEEK_MS));
    loan.principal -= scheduledPrincipal;
    interestPaid += interest; principalPaid += scheduledPrincipal;
    loan.remainingWeeks = Math.max(0, loan.remainingWeeks - elapsed / WEEK_MS);
    return loan.principal > 1 && loan.remainingWeeks > 0;
  });
  breakdown.interest = interestPaid;
  costs += interestPaid;
  const accounting3 = v3EnsureFinance(state);
  accounting3.interestExpense = (accounting3.interestExpense || 0) + interestPaid;

  state.company.cash += revenue - costs - principalPaid;
  const accountingCosts = costs + depreciation;
  const netIncome = revenue - accountingCosts;
  upsertWeeklyFinanceHistory(state, toMs, revenue, accountingCosts, netIncome, breakdown);

  state.fleet.forEach(f => { f.ageWeeks = (f.ageWeeks || 0) + elapsed / WEEK_MS; });
  state.operations.activeFlightWindows = (state.operations.activeFlightWindows || []).filter(f => f.arrivalAt > toMs);
  state.operations.activeFlights = state.operations.activeFlightWindows.filter(f => f.departureAt <= toMs && f.arrivalAt > toMs).length;
  runCompetitorAI(state, rng, compRouteRevenue, elapsed);
  updateReputationAndOtp(state, rng, elapsed, periodOps);
  maybeTriggerEvent(state, rng, elapsed);
}

function upsertWeeklyFinanceHistory(state, toMs, revenue, costs, netIncome, breakdown) {
  const date = new Date(toMs);
  const week = getISOWeek(date);
  const year = date.getUTCFullYear();
  const periodKey = year + '-W' + String(week).padStart(2, '0');
  const time = date.toISOString();
  const last = state.finance.plHistory[state.finance.plHistory.length - 1];

  if (last?.periodKey === periodKey) {
    last.time = time;
    last.revenue += revenue;
    last.costs += costs;
    last.netIncome += netIncome;
    Object.keys(breakdown).forEach(key => { last.breakdown[key] = (last.breakdown[key] || 0) + (breakdown[key] || 0); });
  } else {
    state.finance.plHistory.push({ periodKey, year, week, time, revenue, costs, netIncome, breakdown: { ...breakdown } });
  }
  if (state.finance.plHistory.length > 156) state.finance.plHistory.splice(0, state.finance.plHistory.length - 156);

  const cashLast = state.finance.cashHistory[state.finance.cashHistory.length - 1];
  if (cashLast?.periodKey === periodKey) {
    cashLast.time = time;
    cashLast.cash = state.company.cash;
  } else {
    state.finance.cashHistory.push({ periodKey, year, week, time, cash: state.company.cash });
  }
  if (state.finance.cashHistory.length > 156) state.finance.cashHistory.splice(0, state.finance.cashHistory.length - 156);
}

function routeRevenueValue(map, id) { return map[id] || 0; }

function findPlayerProductByKey(state, originId, destId, key) {
  return buildPlayerProducts(state, originId, destId).find(p => p.key === 'P-' + key);
}

function updateMacroRealTime(state, rng, elapsedMs) {
  const days = elapsedMs / DAY_MS;
  state.market.fuelPrice = clamp(state.market.fuelPrice * (1 + (rng() - 0.5) * 0.004 * days), 0.45, 3.0);
  state.market.macro.demandIndex = clamp(state.market.macro.demandIndex + (rng() - 0.5) * 0.003 * days, 0.70, 1.30);
}

function processDeliveriesRealTime(state, nowMs) {
  state.orders = state.orders.filter(o => {
    if (!o.deliveryAt) o.deliveryAt = nowMs + Math.max(1, o.weeksLeft || 1) * WEEK_MS;
    o.weeksLeft = Math.max(0, (o.deliveryAt - nowMs) / WEEK_MS);
    if (o.deliveryAt <= nowMs) {
      state.fleet.push({ id: 'AC' + (state.company.nextAircraftSerial++), typeId: o.typeId, ownership: o.ownership, ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null });
      state.log.push({ week: state.meta.week, type: 'DELIVERY', text: `Livraison d'un ${aircraftType(o.typeId).name}.` });
      return false;
    }
    return true;
  });
}

function restoreMaintenanceRealTime(state, nowMs) {
  state.fleet.forEach(f => {
    if (f.status !== 'MAINTENANCE' || !f.maintUntil || f.maintUntil > nowMs) return;
    f.status = 'ACTIVE';
    f.condition = clamp(f.condition + 20, 0, 100);
    delete f.maintUntil;
    state.log.push({ week: state.meta.week, type: 'MAINT', text: `${f.id} est remis en service après maintenance.` });
  });
}

function avgConditionForRoute(state, route) {
  const assigned = state.fleet.filter(f => f.assignedRouteId === route.id);
  if (!assigned.length) return 85;
  return assigned.reduce((s, f) => s + f.condition, 0) / assigned.length;
}

function adaptYield(route, loadFactor) {
  const base = FARE_STRATEGIES.YIELD_OPTIMIZED;
  route._yieldMult = route._yieldMult || base.refMult;
  route._yieldAlloc = route._yieldAlloc || { ...base.alloc };
  if (loadFactor > 0.88) {
    route._yieldMult = clamp(route._yieldMult + 0.015, 0.9, 1.35);
    route._yieldAlloc.deep = clamp(route._yieldAlloc.deep - 0.01, 0.03, 0.25);
    route._yieldAlloc.prem = clamp(route._yieldAlloc.prem + 0.01, 0.08, 0.30);
  } else if (loadFactor < 0.55) {
    route._yieldMult = clamp(route._yieldMult - 0.015, 0.75, 1.1);
    route._yieldAlloc.deep = clamp(route._yieldAlloc.deep + 0.01, 0.08, 0.35);
    route._yieldAlloc.prem = clamp(route._yieldAlloc.prem - 0.01, 0.04, 0.20);
  }
}

function updateMacro(state, rng) {
  const m = state.market.macro;
  m.fuelTrend += (rng() - 0.5) * 0.02;
  m.fuelTrend = clamp(m.fuelTrend, -0.15, 0.15);
  state.market.fuelPrice = clamp(state.market.fuelPrice * (1 + m.fuelTrend * 0.1 + (rng() - 0.5) * 0.015), 0.45, 1.9);
  m.demandIndex = clamp(m.demandIndex + (rng() - 0.5) * 0.01, 0.75, 1.25);
}

function processDeliveries(state) {
  state.orders = state.orders.filter(o => {
    o.weeksLeft -= 1;
    if (o.weeksLeft <= 0) {
      state.fleet.push({
        id: 'AC' + (state.company.nextAircraftSerial++), typeId: o.typeId, ownership: o.ownership,
        ageWeeks: 0, cycles: 0, flightHours: 0, condition: 100, status: 'ACTIVE', assignedRouteId: null,
      });
      state.log.push({ week: state.meta.week, type: 'DELIVERY', text: `Livraison d'un ${aircraftType(o.typeId).name}.` });
      return false;
    }
    return true;
  });
}

function processMaintenance(state, rng) {
  state.fleet.forEach(f => {
    if (f.status === 'MAINTENANCE') {
      f.maintWeeksLeft -= 1;
      if (f.maintWeeksLeft <= 0) { f.status = 'ACTIVE'; f.condition = clamp(f.condition + 25, 0, 100); }
      return;
    }
    f.condition = clamp(f.condition - 0.35, 10, 100);
    const failRisk = 0.004 * (1 + (100 - f.condition) / 60);
    if (rng() < failRisk) {
      f.status = 'MAINTENANCE';
      f.maintWeeksLeft = 1 + Math.floor(rng() * 2);
      const type = aircraftType(f.typeId);
      const cost = type.maintPerHour * 40;
      state.company.cash -= cost;
      addLedger(state, state.meta.week, 'MAINT_UNSCHEDULED', -cost, 'Maintenance non programmée');
      state.log.push({ week: state.meta.week, type: 'MAINT', text: `Immobilisation imprévue d'un appareil pour maintenance.` });
    }
  });
}

function probabilityForElapsed(periodProbability, elapsedMs) {
  const periods = Math.max(0, elapsedMs / WEEK_MS);
  return 1 - Math.pow(1 - periodProbability, periods);
}

function updateReputationAndOtp(state, rng, elapsedMs = WEEK_MS, operationalPeriod = null) {
  const periods = Math.max(0, elapsedMs / WEEK_MS);
  const fleetCondition = state.fleet.length ? state.fleet.reduce((s, f) => s + f.condition, 0) / state.fleet.length : 85;
  let targetOtp;
  let cancellationRate = 0;

  if (operationalPeriod?.scheduledFlights > 0) {
    const completed = operationalPeriod.operatedFlights;
    const onTime = Math.max(0, completed - operationalPeriod.delayedFlights);
    const punctuality = completed > 0 ? (onTime / completed) * 100 : 0;
    const completion = (completed / operationalPeriod.scheduledFlights) * 100;
    cancellationRate = operationalPeriod.cancelledFlights / operationalPeriod.scheduledFlights;
    targetOtp = clamp(punctuality * 0.85 + completion * 0.15, 30, 99.5);
  } else {
    targetOtp = clamp(80 + fleetCondition / 7 - state.routes.filter(r => r.status === 'ACTIVE').length * 0.15 + (rng() - 0.5) * 2, 55, 98);
  }

  const otpAlpha = 1 - Math.pow(1 - 0.3, periods);
  state.company.otp = state.company.otp + (targetOtp - state.company.otp) * otpAlpha;
  const targetRep = clamp(42 + state.company.otp * 0.48 - cancellationRate * 35, 0, 100);
  const repAlpha = 1 - Math.pow(1 - 0.06, periods);
  state.company.reputation = clamp(state.company.reputation + (targetRep - state.company.reputation) * repAlpha, 0, 100);
}

function runCompetitorAI(state, rng, compRouteRevenue, elapsedMs = WEEK_MS) {
  state.market.competitors.forEach(c => {
    c.routes.forEach(r => {
      const rev = compRouteRevenue['P-' + r.id] || 0;
      r.history.push(rev);
      if (r.history.length > 8) r.history.shift();
      const type = aircraftType(r.aircraftTypeId);
      const periods = elapsedMs / WEEK_MS;
      const cost = fuelBurnLiters(distanceBetween(r.origin, r.dest), type) * r.freq * state.market.fuelPrice * 1.3 * periods;
      const margin = rev - cost;
      if (margin < -cost * 0.3 && rng() < probabilityForElapsed(0.25, elapsedMs)) {
        r.fareStrategy = r.fareStrategy === 'PREMIUM' ? 'COMPETITIVE' : r.fareStrategy === 'COMPETITIVE' ? 'VALUE' : r.fareStrategy;
      } else if (margin > cost * 0.5 && rng() < probabilityForElapsed(0.15, elapsedMs)) {
        r.fareStrategy = r.fareStrategy === 'VALUE' ? 'COMPETITIVE' : r.fareStrategy === 'COMPETITIVE' ? 'PREMIUM' : r.fareStrategy;
      }
    });
    c.cash += (rng() - 0.42) * 1.5e6 * (elapsedMs / WEEK_MS);
    if (rng() < probabilityForElapsed(0.01, elapsedMs) && c.routes.length < 14 && c.cash > 60e6) {
      const candidates = AIRPORTS.filter(a => a.id !== c.hub && !c.routes.find(r => r.dest === a.id));
      if (candidates.length) {
        const pick = candidates[Math.floor(rng() * candidates.length)];
        const d = distanceBetween(c.hub, pick.id);
        const type = pickAircraftForDistance(d, c.strategy);
        c.routes.push({
          id: 'CR' + c.id + Date.now() % 100000, origin: c.hub, dest: pick.id, aircraftTypeId: type.id,
          freq: 3, fareStrategy: 'COMPETITIVE', history: [],
        });
      }
    }
  });
}

function maybeTriggerEvent(state, rng, elapsedMs = WEEK_MS) {
  if (rng() < probabilityForElapsed(0.05, elapsedMs)) {
    const kinds = ['FUEL_SPIKE', 'TOURISM_BOOM', 'RECESSION_LOCAL', 'STRIKE'];
    const kind = kinds[Math.floor(rng() * kinds.length)];
    if (kind === 'FUEL_SPIKE') {
      state.market.fuelPrice = clamp(state.market.fuelPrice * 1.18, 0.45, 2.2);
      state.log.push({ week: state.meta.week, type: 'EVENT', text: `Le prix du carburant augmente sensiblement sur le marché mondial.` });
    } else if (kind === 'TOURISM_BOOM') {
      state.market.macro.demandIndex = clamp(state.market.macro.demandIndex * 1.06, 0.75, 1.3);
      state.log.push({ week: state.meta.week, type: 'EVENT', text: `Une hausse de la demande touristique est constatée sur plusieurs marchés.` });
    } else if (kind === 'RECESSION_LOCAL') {
      state.market.macro.demandIndex = clamp(state.market.macro.demandIndex * 0.94, 0.75, 1.3);
      state.log.push({ week: state.meta.week, type: 'EVENT', text: `Un ralentissement économique affecte la demande de voyages.` });
    } else if (kind === 'STRIKE') {
      state.company.otp = clamp(state.company.otp - 8, 30, 100);
      state.log.push({ week: state.meta.week, type: 'EVENT', text: `Des perturbations opérationnelles affectent la ponctualité du secteur.` });
    }
    if (state.log.length > 120) state.log.splice(0, state.log.length - 120);
  }
}

function checkBankruptcy(state, nowMs = Date.now()) {
  if (state.company.cash < -8e6) {
    if (!state.company.negativeCashSince) state.company.negativeCashSince = nowMs;
  } else {
    state.company.negativeCashSince = null;
    return;
  }
  if (!state.company.bankrupt && nowMs - state.company.negativeCashSince >= 6 * WEEK_MS) {
    state.company.bankrupt = true;
    state.log.push({ week: state.meta.week, type: 'BANKRUPTCY', text: `Trésorerie négative prolongée : la compagnie est en cessation de paiements.` });
  }
}

function structuredCloneLite(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// -----------------------------------------------------------------------------
// 9. PLAYER ACTIONS
// -----------------------------------------------------------------------------


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

function actionOpenRoute(state, { originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy, departMinute }) {
  const s = structuredCloneLite(state);
  if (!s.company.aocCountry) s.company.aocCountry = airport(s.company.homeBase)?.country;
  if (!Array.isArray(s.company.trafficRights)) s.company.trafficRights = [];

  const trafficRight = trafficRightStatus(s, originId, destId);
  if (!trafficRight.allowed) {
    s.lastActionError = trafficRight.reason;
    return s;
  }

  const issues = validateRoutePlan({ originId, destId, aircraftTypeId, departMinute });
  if (issues.length) {
    s.lastActionError = issues.map(issue => issue.message).join(' ');
    return s;
  }

  const id = 'R' + s.company.nextRouteSerial;
  const schedule = buildWeeklySchedule(frequencyPerWeek, departMinute);
  const candidate = { id, originId, destId, aircraftTypeId, frequencyPerWeek, fareStrategy: fareStrategy || 'COMPETITIVE', schedule, status: 'ACTIVE', history: [] };
  const slotCheck = canReserveRouteSlots(s, candidate);
  if (!slotCheck.ok) {
    s.lastActionError = 'Capacité de créneau indisponible à ' + slotCheck.requirement.airportId + ' sur ce bucket coordonné.';
    return s;
  }

  delete s.lastActionError;
  s.company.nextRouteSerial += 1;
  s.routes.push(candidate);
  reserveRouteSlots(s, candidate, slotCheck.requirements);
  return s;
}

function actionSetFareStrategy(state, routeId, fareStrategy) {
  const s = structuredCloneLite(state);
  const r = s.routes.find(x => x.id === routeId);
  if (r) r.fareStrategy = fareStrategy;
  return s;
}

function actionSetFrequency(state, routeId, frequencyPerWeek) {
  const s = structuredCloneLite(state);
  const r = s.routes.find(x => x.id === routeId);
  if (!r) return s;
  const candidate = { ...r, frequencyPerWeek, schedule: buildWeeklySchedule(frequencyPerWeek, r.schedule[0]?.minute ?? 480) };
  const slotCheck = canReserveRouteSlots(s, candidate, routeId);
  if (!slotCheck.ok) {
    s.lastActionError = 'Capacité de créneau indisponible à ' + slotCheck.requirement.airportId + ' pour cette hausse de fréquence.';
    return s;
  }
  delete s.lastActionError;
  r.frequencyPerWeek = candidate.frequencyPerWeek;
  r.schedule = candidate.schedule;
  const portfolio = ensureSlotPortfolio(s);
  s.operations.slotAllocations = portfolio.filter(a => a.routeId !== routeId);
  reserveRouteSlots(s, r, slotCheck.requirements);
  return s;
}

function actionSuspendRoute(state, routeId) {
  const s = structuredCloneLite(state);
  const r = s.routes.find(x => x.id === routeId);
  if (r) r.status = r.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  return s;
}

function actionBuyAircraft(state, typeId, ownership) {
  const s = structuredCloneLite(state);
  const type = aircraftType(typeId);
  if (!type) return { state: s, error: 'Type avion inconnu.' };
  const referenceMs = s.meta?.lastProcessedAt || (s.meta?.currentTime ? Date.parse(s.meta.currentTime) : Date.now());
  const commercialStatus = aircraftCommercialStatus(typeId, referenceMs);
  if (!commercialStatus.available) {
    return { state: s, error: type.name + ' indisponible : ' + commercialStatus.reason };
  }
  const leadDays = deliveryLeadDays(type, ownership);

  if (ownership === 'OWNED') {
    const equityShare = 0.15;
    const downPayment = type.price * equityShare;
    if (s.company.cash < downPayment) return { state: s, error: 'Trésorerie insuffisante pour l’apport de financement.' };
    s.company.cash -= downPayment;
    const principal = type.price - downPayment;
    const annualRate = clamp(0.057 + Math.max(0, 60 - s.company.reputation) * 0.0008 + (s.company.cash < 10e6 ? 0.012 : 0), 0.05, 0.105);
    const weeklyRate = Math.pow(1 + annualRate, 1 / 52) - 1;
    const termWeeks = 624;
    const annuityFactor = weeklyRate / (1 - Math.pow(1 + weeklyRate, -termWeeks));
    s.finance.loans.push({
      id: 'L' + Date.now() % 100000, principal, weeklyRate, annualRate,
      remainingWeeks: termWeeks, weeklyPayment: principal * annuityFactor,
      assetTypeId: typeId,
    });
  } else if (ownership === 'LEASED') {
    const securityDeposit = type.leaseWeekly * 8;
    if (s.company.cash < securityDeposit) return { state: s, error: 'Trésorerie insuffisante pour le dépôt de garantie du leasing.' };
    s.company.cash -= securityDeposit;
    s.finance.leaseDeposits = (s.finance.leaseDeposits || 0) + securityDeposit;
    addLedger(s, s.meta.week, 'LEASE_DEPOSIT', -securityDeposit, 'Dépôt de garantie leasing ' + type.name);
    s.orders.push({
      typeId, ownership, securityDeposit, weeksLeft: leadDays / 7,
      orderedAt: referenceMs,
      deliveryAt: referenceMs + leadDays * DAY_MS,
    });
    return { state: s, error: null };
  }

  s.orders.push({
    typeId, ownership, weeksLeft: leadDays / 7,
    orderedAt: referenceMs,
    deliveryAt: referenceMs + leadDays * DAY_MS,
  });
  return { state: s, error: null };
}

function actionAssignAircraft(state, aircraftId, routeId) {
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
}

// =============================================================================
// UI LAYER — React application shell (appended after the engine code)
// =============================================================================

const SAVE_KEY = 'airline-sim-save-v2-realtime';

const TIME_SLOTS = [
  { label: 'Tôt le matin (06:00)', minute: 360 },
  { label: 'Matin (08:30)', minute: 510 },
  { label: 'Midi (12:00)', minute: 720 },
  { label: 'Après-midi (15:00)', minute: 900 },
  { label: 'Soirée (18:30)', minute: 1110 },
  { label: 'Nuit (21:30)', minute: 1290 },
];

const FARE_LABELS = {
  DISCOUNT: 'Discount',
  VALUE: 'Value',
  COMPETITIVE: 'Compétitif',
  PREMIUM: 'Premium',
  YIELD_OPTIMIZED: 'Yield optimisé',
};

const REGION_LABELS = { EU: 'Europe', NA: 'Amérique du Nord', SA: 'Amérique du Sud', ME: 'Moyen-Orient', AS: 'Asie', AF: 'Afrique', OC: 'Océanie' };

function fmtMoney(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + ' Md';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + ' M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + ' k';
  return sign + '$' + Math.round(abs);
}
function fmtNum(n) { return isFinite(n) ? Math.round(n).toLocaleString('fr-FR') : '—'; }
function fmtPct(n) { return isFinite(n) ? Math.round(n) + ' %' : '—'; }
function minuteToHHMM(m) { const h = Math.floor(m / 60), mm = m % 60; return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); }

// -----------------------------------------------------------------------------
// Persistence helpers
// -----------------------------------------------------------------------------
async function loadSave() {
  try {
    if (window.storage?.get) {
      const res = await window.storage.get(SAVE_KEY, false);
      if (res?.value) return JSON.parse(res.value);
    }
  } catch (e) { /* fall through to localStorage */ }
  try {
    const raw = window.localStorage?.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
async function writeSave(state) {
  const payload = JSON.stringify(state);
  try {
    if (window.storage?.set) {
      await window.storage.set(SAVE_KEY, payload, false);
      return true;
    }
  } catch (e) { /* fall through to localStorage */ }
  try {
    window.localStorage?.setItem(SAVE_KEY, payload);
    return true;
  } catch (e) {
    return false;
  }
}
async function clearSave() {
  try { if (window.storage?.delete) await window.storage.delete(SAVE_KEY, false); } catch (e) { /* noop */ }
  try { window.localStorage?.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}

// -----------------------------------------------------------------------------
// Small building blocks
// -----------------------------------------------------------------------------
function Panel({ title, right, children, className }) {
  return (
    <div className={'panel ' + (className || '')}>
      {(title || right) && (
        <div className="panel-head">
          {title && <h3>{title}</h3>}
          {right}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone, sub }) {
  return (
    <div className="kpi-card">
      <div className={'kpi-icon tone-' + (tone || 'neutral')}><Icon size={18} /></div>
      <div className="kpi-text">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}

function ConditionBar({ value }) {
  const tone = value > 70 ? 'good' : value > 40 ? 'mid' : 'bad';
  return (
    <div className="cond-bar"><div className={'cond-fill tone-' + tone} style={{ width: clamp01(value) + '%' }} /></div>
  );
}
function clamp01(v) { return Math.max(0, Math.min(100, v)); }

function Toast({ items }) {
  if (!items.length) return null;
  return (
    <div className="toast-stack">
      {items.map(t => <div key={t.id} className={'toast tone-' + t.tone}>{t.text}</div>)}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Onboarding
// -----------------------------------------------------------------------------
function Onboarding({ onCreate }) {
  const [name, setName] = useState('');
  const [base, setBase] = useState('CDG');
  const sorted = [...AIRPORTS].sort((a, b) => b.size - a.size);
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-hero">
          <Plane size={30} />
          <div>
            <div className="onboarding-eyebrow">AERODESK · Simulation de gestion aérienne</div>
            <h1>Fondez votre compagnie</h1>
          </div>
        </div>
        <p className="onboarding-copy">
          Choisissez un nom et une base de départ. Vous démarrez avec une trésorerie modeste —
          le reste (réseau, flotte, tarification) se construit vol après vol.
        </p>
        <label className="field">
          <span>Nom de la compagnie</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ex. Meridian Wings" maxLength={40} />
        </label>
        <label className="field">
          <span>Base de départ</span>
          <select value={base} onChange={e => setBase(e.target.value)}>
            {sorted.map(a => <option key={a.id} value={a.id}>{a.city} ({a.id}) — {REGION_LABELS[a.region]}</option>)}
          </select>
        </label>
        <button className="btn btn-primary btn-lg" disabled={!name.trim()} onClick={() => onCreate(name.trim() || 'Ma Compagnie', base)}>
          Fonder la compagnie <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sidebar / shell
// -----------------------------------------------------------------------------
const NAV_ITEMS = [
  { id: 'DASHBOARD', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'NETWORK', label: 'Réseau', icon: Network },
  { id: 'FLEET', label: 'Flotte', icon: Plane },
  { id: 'FINANCE', label: 'Finances', icon: Landmark },
  { id: 'MARKET', label: 'Marché', icon: Globe2 },
  { id: 'JOURNAL', label: 'Journal', icon: Newspaper },
  { id: 'HELP', label: 'Aide', icon: HelpCircle },
];

function Sidebar({ screen, setScreen, company }) {
  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <Plane size={20} />
        <div className="sidebar-brand-text">
          <div className="brand-name">{company.name}</div>
          <div className="brand-sub">{airport(company.homeBase).city} · {company.homeBase}</div>
        </div>
      </div>
      <nav>
        {NAV_ITEMS.map(item => (
          <button key={item.id} className={'nav-item' + (screen === item.id ? ' active' : '')} onClick={() => setScreen(item.id)}>
            <item.icon size={17} /> <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function TopBar({ state, saveLabel }) {
  const last = state.finance.plHistory.length ? state.finance.plHistory[state.finance.plHistory.length - 1] : null;
  const now = state.meta.currentTime ? new Date(state.meta.currentTime) : new Date();
  return (
    <div className="topbar">
      <div className="topbar-stat"><div className="topbar-label">Temps réel</div><div className="topbar-value">{now.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div></div>
      <div className="topbar-stat"><div className="topbar-label">Trésorerie</div><div className={'topbar-value ' + (state.company.cash < 0 ? 'neg' : '')}>{fmtMoney(state.company.cash)}</div></div>
      <div className="topbar-stat"><div className="topbar-label">Résultat récent</div><div className={'topbar-value ' + ((last?.netIncome || 0) < 0 ? 'neg' : 'pos')}>{fmtMoney(last?.netIncome || 0)}</div></div>
      <div className="topbar-stat"><div className="topbar-label">Réputation</div><div className="topbar-value">{Math.round(state.company.reputation)}/100</div></div>
      <div className="topbar-spacer" />
      <div className="save-indicator">● Simulation en direct · {saveLabel}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------
function Dashboard({ state }) {
  const pl = state.finance.plHistory.slice(-16).map(p => ({ week: 'S' + p.week, Revenus: Math.round(p.revenue), Coûts: Math.round(p.costs), Résultat: Math.round(p.netIncome) }));
  const cash = state.finance.cashHistory.slice(-26).map(c => ({ week: 'S' + c.week, Trésorerie: Math.round(c.cash) }));
  const activeRoutes = state.routes.filter(r => r.status === 'ACTIVE');
  const alerts = buildAlerts(state);
  const lastLog = state.log.slice(-6).reverse();

  return (
    <div className="screen">
      <div className="kpi-row">
        <KpiCard icon={Wallet} label="Trésorerie" value={fmtMoney(state.company.cash)} tone={state.company.cash < 0 ? 'bad' : 'good'} />
        <KpiCard icon={Plane} label="Flotte" value={state.fleet.length + ' appareils'} sub={state.orders.length ? state.orders.length + ' en commande' : null} />
        <KpiCard icon={Network} label="Lignes actives" value={activeRoutes.length} />
        <KpiCard icon={Gauge} label="Ponctualité" value={fmtPct(state.company.otp)} tone={state.company.otp > 80 ? 'good' : 'mid'} />
        <KpiCard icon={Users} label="Réputation" value={Math.round(state.company.reputation) + '/100'} />
      </div>

      <div className="grid-2">
        <Panel title="Résultat hebdomadaire (16 dernières semaines)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pl}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" stroke="var(--text-dim)" fontSize={11} />
              <YAxis stroke="var(--text-dim)" fontSize={11} tickFormatter={v => fmtMoney(v)} width={64} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => fmtMoney(v)} />
              <Bar dataKey="Revenus" fill="#4FC1E9" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Coûts" fill="#E1595A" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Trésorerie (26 dernières semaines)">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={cash}>
              <defs>
                <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E8A33D" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#E8A33D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" stroke="var(--text-dim)" fontSize={11} />
              <YAxis stroke="var(--text-dim)" fontSize={11} tickFormatter={v => fmtMoney(v)} width={64} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => fmtMoney(v)} />
              <Area type="monotone" dataKey="Trésorerie" stroke="#E8A33D" fill="url(#cashGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title={'Alertes' + (alerts.length ? ' (' + alerts.length + ')' : '')}>
          {alerts.length === 0 && <div className="empty-hint">Aucune alerte active.</div>}
          {alerts.map((a, i) => (
            <div key={i} className={'alert-row tone-' + a.tone}>
              <AlertTriangle size={14} /> <span>{a.text}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Derniers événements">
          {lastLog.length === 0 && <div className="empty-hint">Rien à signaler.</div>}
          {lastLog.map((l, i) => (
            <div key={i} className="log-row">
              <span className="log-week">S{l.week}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function buildAlerts(state) {
  const alerts = [];
  if (state.company.cash < 0) alerts.push({ tone: 'bad', text: 'Trésorerie négative — réduisez les coûts ou augmentez les recettes rapidement.' });
  const maint = state.fleet.filter(f => f.status === 'MAINTENANCE');
  if (maint.length) alerts.push({ tone: 'mid', text: maint.length + ' appareil(s) immobilisé(s) en maintenance.' });
  const unassigned = state.fleet.filter(f => f.status === 'ACTIVE' && !f.assignedRouteId);
  if (unassigned.length) alerts.push({ tone: 'mid', text: unassigned.length + ' appareil(s) disponible(s) ne sont affectés à aucune ligne.' });
  state.routes.filter(r => r.status === 'ACTIVE').forEach(r => {
    const h = r.history || [];
    if (h.length >= 3) {
      const recent = h.slice(-3);
      const avgLf = recent.reduce((s, x) => s + x.loadFactor, 0) / recent.length;
      if (avgLf < 0.35) alerts.push({ tone: 'mid', text: `Ligne ${r.originId}–${r.destId} : coefficient de remplissage faible (${Math.round(avgLf * 100)} %).` });
      const avgProfit = recent.reduce((s, x) => s + (x.revenue - x.cost), 0) / recent.length;
      if (avgProfit < 0) alerts.push({ tone: 'bad', text: `Ligne ${r.originId}–${r.destId} : déficitaire sur les dernières semaines.` });
    }
  });
  if (state.company.otp < 70) alerts.push({ tone: 'mid', text: 'Ponctualité en dessous de 70 % — cela pèse sur votre réputation.' });
  return alerts.slice(0, 6);
}

const tooltipStyle = { background: '#1C2637', border: '1px solid #2A3448', borderRadius: 6, color: '#E7ECF5', fontSize: 12 };

// -----------------------------------------------------------------------------
// Network screen
// -----------------------------------------------------------------------------
function NetworkScreen({ state, dispatch }) {
  const [expanded, setExpanded] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const availableAircraft = state.fleet.filter(f => f.status === 'ACTIVE' && !f.assignedRouteId);

  return (
    <div className="screen">
      <Panel title="Vos lignes" right={
        <button className="btn btn-sm btn-primary" onClick={() => setShowNew(s => !s)}>
          <Plus size={14} /> Nouvelle ligne
        </button>
      }>
        {state.routes.length === 0 && <div className="empty-hint">Aucune ligne pour l'instant. Ouvrez-en une pour démarrer l'exploitation.</div>}
        <table className="data-table">
          <thead>
            <tr>
              <th>Ligne</th><th>Distance</th><th>Appareil</th><th>Fréq./sem.</th><th>Stratégie tarifaire</th>
              <th>Dern. remplissage</th><th>Dern. résultat</th><th>Statut</th><th></th>
            </tr>
          </thead>
          <tbody>
            {state.routes.map(r => {
              const type = aircraftType(r.aircraftTypeId);
              const dist = distanceBetween(r.originId, r.destId);
              const last = r.history && r.history.length ? r.history[r.history.length - 1] : null;
              return (
                <React.Fragment key={r.id}>
                  <tr className={r.status !== 'ACTIVE' ? 'row-dim' : ''} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="mono">{r.originId} → {r.destId}</td>
                    <td className="mono">{fmtNum(dist)} km</td>
                    <td>{type.name}</td>
                    <td>
                      <select className="inline-select" value={r.frequencyPerWeek} onClick={e => e.stopPropagation()}
                        onChange={e => dispatch(s => actionSetFrequency(s, r.id, parseInt(e.target.value, 10)))}>
                        {[1, 2, 3, 5, 7, 10, 14, 21].map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="inline-select" value={r.fareStrategy} onClick={e => e.stopPropagation()}
                        onChange={e => dispatch(s => actionSetFareStrategy(s, r.id, e.target.value))}>
                        {Object.keys(FARE_LABELS).map(k => <option key={k} value={k}>{FARE_LABELS[k]}</option>)}
                      </select>
                    </td>
                    <td className="mono">{last ? fmtPct(last.loadFactor * 100) : '—'}</td>
                    <td className={'mono ' + (last && (last.revenue - last.cost) < 0 ? 'neg' : last ? 'pos' : '')}>{last ? fmtMoney(last.revenue - last.cost) : '—'}</td>
                    <td><span className={'badge ' + (r.status === 'ACTIVE' ? 'badge-good' : 'badge-mid')}>{r.status === 'ACTIVE' ? 'Active' : 'Suspendue'}</span></td>
                    <td>
                      <button className="btn btn-xs" onClick={e => { e.stopPropagation(); dispatch(s => actionSuspendRoute(s, r.id)); }}>
                        {r.status === 'ACTIVE' ? 'Suspendre' : 'Reprendre'}
                      </button>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="row-detail">
                      <td colSpan={9}>
                        <RouteTrend route={r} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {showNew && <NewRouteForm state={state} dispatch={dispatch} availableAircraft={availableAircraft} onDone={() => setShowNew(false)} />}
    </div>
  );
}

function RouteTrend({ route }) {
  const data = (route.history || []).map(h => ({ week: 'S' + h.week, Remplissage: Math.round(h.loadFactor * 100), Résultat: Math.round(h.revenue - h.cost) }));
  if (!data.length) return <div className="empty-hint">Pas encore de données de vol.</div>;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="week" stroke="var(--text-dim)" fontSize={11} />
        <YAxis yAxisId="left" stroke="var(--text-dim)" fontSize={11} />
        <YAxis yAxisId="right" orientation="right" stroke="var(--text-dim)" fontSize={11} tickFormatter={v => fmtMoney(v)} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line yAxisId="left" type="monotone" dataKey="Remplissage" stroke="#4FC1E9" strokeWidth={2} dot={false} />
        <Line yAxisId="right" type="monotone" dataKey="Résultat" stroke="#E8A33D" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function NewRouteForm({ state, dispatch, availableAircraft, onDone }) {
  const [aircraftId, setAircraftId] = useState(availableAircraft[0]?.id || '');
  const [originId, setOriginId] = useState(state.company.homeBase);
  const [destId, setDestId] = useState('');
  const [freq, setFreq] = useState(7);
  const [fareStrategy, setFareStrategy] = useState('COMPETITIVE');
  const [slot, setSlot] = useState(TIME_SLOTS[1].minute);

  const acObj = availableAircraft.find(a => a.id === aircraftId);
  const type = acObj ? aircraftType(acObj.typeId) : null;
  const reachable = type ? AIRPORTS.filter(a => a.id !== originId && distanceBetween(originId, a.id) <= type.rangeKm && type.runway <= Math.min(airport(originId).runwayM || Infinity, a.runwayM || Infinity)) : [];
  const planningIssues = destId && type ? validateRoutePlan({ originId, destId, aircraftTypeId: type.id, departMinute: slot }) : [];

  if (!availableAircraft.length) {
    return <Panel title="Nouvelle ligne"><div className="empty-hint">Aucun appareil disponible. Achetez ou libérez un appareil dans l'onglet Flotte.</div></Panel>;
  }

  return (
    <Panel title="Nouvelle ligne" right={<button className="btn btn-xs" onClick={onDone}><X size={13} /></button>}>
      <div className="form-grid">
        <label className="field">
          <span>Appareil</span>
          <select value={aircraftId} onChange={e => setAircraftId(e.target.value)}>
            {availableAircraft.map(a => {
              const t = aircraftType(a.typeId);
              return <option key={a.id} value={a.id}>{a.id} — {t.name} ({t.seats} sièges)</option>;
            })}
          </select>
        </label>
        <label className="field">
          <span>Origine</span>
          <select value={originId} onChange={e => setOriginId(e.target.value)}>
            {AIRPORTS.map(a => <option key={a.id} value={a.id}>{a.city} ({a.id})</option>)}
          </select>
        </label>
        <label className="field">
          <span>Destination</span>
          <select value={destId} onChange={e => setDestId(e.target.value)}>
            <option value="">— choisir —</option>
            {reachable.map(a => <option key={a.id} value={a.id}>{a.city} ({a.id}) · {fmtNum(distanceBetween(originId, a.id))} km</option>)}
          </select>
        </label>
        <label className="field">
          <span>Fréquence / semaine</span>
          <select value={freq} onChange={e => setFreq(parseInt(e.target.value, 10))}>
            {[1, 2, 3, 5, 7, 10, 14, 21].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Créneau horaire</span>
          <select value={slot} onChange={e => setSlot(parseInt(e.target.value, 10))}>
            {TIME_SLOTS.map(s => <option key={s.minute} value={s.minute}>{s.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Stratégie tarifaire</span>
          <select value={fareStrategy} onChange={e => setFareStrategy(e.target.value)}>
            {Object.keys(FARE_LABELS).map(k => <option key={k} value={k}>{FARE_LABELS[k]}</option>)}
          </select>
        </label>
      </div>
      {type && !reachable.length && <div className="empty-hint">Aucune destination techniquement exploitable avec cet appareil depuis cette origine.</div>}
      {planningIssues.length > 0 && <div className="empty-hint">{planningIssues.map(issue => issue.message).join(' ')}</div>}
      <button className="btn btn-primary" disabled={!destId || planningIssues.length > 0} onClick={() => {
        dispatch(s => {
          const previousRouteCount = s.routes.length;
          let s2 = actionOpenRoute(s, { originId, destId, aircraftTypeId: type.id, frequencyPerWeek: freq, fareStrategy, departMinute: slot });
          if (s2.routes.length === previousRouteCount) return s2;
          const newRoute = s2.routes[s2.routes.length - 1];
          s2 = actionAssignAircraft(s2, aircraftId, newRoute.id);
          return s2;
        });
        onDone();
      }}>Ouvrir la ligne</button>
    </Panel>
  );
}

// -----------------------------------------------------------------------------
// Fleet screen
// -----------------------------------------------------------------------------
function FleetScreen({ state, dispatch, notify }) {
  const [showBuy, setShowBuy] = useState(false);
  return (
    <div className="screen">
      <Panel title="Votre flotte" right={<button className="btn btn-sm btn-primary" onClick={() => setShowBuy(s => !s)}><Plus size={14} /> Acquérir un appareil</button>}>
        {state.fleet.length === 0 && <div className="empty-hint">Aucun appareil. Achetez ou louez votre premier avion.</div>}
        <table className="data-table">
          <thead><tr><th>ID</th><th>Type</th><th>Propriété</th><th>Âge</th><th>Heures</th><th>Cycles</th><th>État</th><th>Statut</th><th>Ligne affectée</th></tr></thead>
          <tbody>
            {state.fleet.map(f => {
              const t = aircraftType(f.typeId);
              const route = state.routes.find(r => r.id === f.assignedRouteId);
              return (
                <tr key={f.id}>
                  <td className="mono">{f.id}</td>
                  <td>{t.name}</td>
                  <td>{f.ownership === 'OWNED' ? 'Propriété' : 'Location'}</td>
                  <td className="mono">{(f.ageWeeks / 52).toFixed(1)} ans</td>
                  <td className="mono">{fmtNum(f.flightHours || 0)} h</td>
                  <td className="mono">{fmtNum(f.cycles || 0)}</td>
                  <td style={{ minWidth: 110 }}><ConditionBar value={f.condition} /></td>
                  <td><span className={'badge ' + (f.status === 'ACTIVE' ? 'badge-good' : 'badge-mid')}>{f.status === 'ACTIVE' ? 'En service' : 'Maintenance'}</span></td>
                  <td>{route ? `${route.originId} → ${route.destId}` : <span className="text-dim">Non affecté</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {state.orders.length > 0 && (
        <Panel title="Commandes en cours">
          <table className="data-table">
            <thead><tr><th>Type</th><th>Propriété</th><th>Livraison estimée</th></tr></thead>
            <tbody>
              {state.orders.map((o, i) => (
                <tr key={i}><td>{aircraftType(o.typeId).name}</td><td>{o.ownership === 'OWNED' ? 'Propriété' : 'Location'}</td><td>{Math.max(0, o.weeksLeft || 0).toFixed(1)} semaine(s)</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {showBuy && <BuyAircraftForm state={state} dispatch={dispatch} notify={notify} onDone={() => setShowBuy(false)} />}
    </div>
  );
}

function BuyAircraftForm({ state, dispatch, notify, onDone }) {
  const [typeId, setTypeId] = useState(AIRCRAFT_TYPES[2].id);
  const [ownership, setOwnership] = useState('LEASED');
  const type = aircraftType(typeId);
  return (
    <Panel title="Acquérir un appareil" right={<button className="btn btn-xs" onClick={onDone}><X size={13} /></button>}>
      <div className="ac-grid">
        {commerciallyAvailableAircraftTypes(state.meta?.lastProcessedAt || Date.now()).map(t => (
          <button key={t.id} className={'ac-card' + (t.id === typeId ? ' selected' : '')} onClick={() => setTypeId(t.id)}>
            <div className="ac-card-name">{t.name}</div>
            <div className="ac-card-spec">{t.seats} sièges · {fmtNum(t.rangeKm)} km</div>
            <div className="ac-card-spec">{fmtMoney(t.price)} achat · {fmtMoney(t.leaseWeekly)}/sem. location</div>
          </button>
        ))}
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <label className="field">
          <span>Mode d'acquisition</span>
          <select value={ownership} onChange={e => setOwnership(e.target.value)}>
            <option value="LEASED">Location (dépôt de garantie + loyer hebdomadaire)</option>
            <option value="OWNED">Achat neuf (apport 15 %, financement 12 ans, délai de production)</option>
          </select>
        </label>
      </div>
      <button className="btn btn-primary" onClick={() => {
        dispatch(s => {
          const r = actionBuyAircraft(s, typeId, ownership);
          if (r.error) { notify(r.error, 'bad'); return s; }
          notify('Commande passée : ' + type.name + '.', 'good');
          return r.state;
        });
        onDone();
      }}>Confirmer</button>
    </Panel>
  );
}

// -----------------------------------------------------------------------------
// Finance screen
// -----------------------------------------------------------------------------
function FinanceScreen({ state }) {
  const pl = state.finance.plHistory.slice(-26);
  const chartData = pl.map(p => ({ week: 'S' + p.week, Carburant: Math.round(p.breakdown.fuel), Équipage: Math.round(p.breakdown.crew), Maintenance: Math.round(p.breakdown.maint), Aéroports: Math.round(p.breakdown.airport), Autres: Math.round(p.breakdown.handling + p.breakdown.distribution + (p.breakdown.disruption || 0) + (p.breakdown.depreciation || 0) + p.breakdown.insurance + p.breakdown.overhead + p.breakdown.interest + p.breakdown.leasing + (p.breakdown.taxes || 0)) }));
  const last = pl.length ? pl[pl.length - 1] : null;
  const fv = fleetValue(state);

  return (
    <div className="screen">
      <div className="kpi-row">
        <KpiCard icon={Wallet} label="Trésorerie" value={fmtMoney(state.company.cash)} tone={state.company.cash < 0 ? 'bad' : 'good'} />
        <KpiCard icon={TrendingUp} label="Revenus (dern. sem.)" value={last ? fmtMoney(last.revenue) : '—'} />
        <KpiCard icon={TrendingDown} label="Coûts (dern. sem.)" value={last ? fmtMoney(last.costs) : '—'} />
        <KpiCard icon={Building2} label="Valeur de flotte (nette)" value={fmtMoney(fv)} />
      </div>

      <Panel title="Répartition des coûts (26 dernières semaines)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="week" stroke="var(--text-dim)" fontSize={11} />
            <YAxis stroke="var(--text-dim)" fontSize={11} tickFormatter={v => fmtMoney(v)} width={64} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => fmtMoney(v)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Carburant" stackId="c" fill="#E8A33D" />
            <Bar dataKey="Équipage" stackId="c" fill="#4FC1E9" />
            <Bar dataKey="Maintenance" stackId="c" fill="#8B7FD1" />
            <Bar dataKey="Aéroports" stackId="c" fill="#6FBF73" />
            <Bar dataKey="Autres" stackId="c" fill="#5B6478" />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Emprunts en cours">
        {state.finance.loans.length === 0 && <div className="empty-hint">Aucun emprunt actif.</div>}
        {state.finance.loans.length > 0 && (
          <table className="data-table">
            <thead><tr><th>Capital restant</th><th>Échéance hebdo.</th><th>Semaines restantes</th></tr></thead>
            <tbody>
              {state.finance.loans.map(l => (
                <tr key={l.id}><td className="mono">{fmtMoney(l.principal)}</td><td className="mono">{fmtMoney(l.weeklyPayment)}</td><td className="mono">{l.remainingWeeks}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Market screen
// -----------------------------------------------------------------------------
const STRATEGY_LABELS = {
  PREMIUM_NETWORK: 'Réseau haut de gamme',
  LOWCOST: 'Bas coûts',
  MEGA_HUB: 'Méga-hub',
  REGIONAL: 'Régional',
};

function MarketScreen({ state }) {
  return (
    <div className="screen">
      <Panel title="Compagnies concurrentes">
        <div className="comp-grid">
          {state.market.competitors.map(c => (
            <div key={c.id} className="comp-card" style={{ borderTopColor: c.theme }}>
              <div className="comp-card-head">
                <span className="comp-dot" style={{ background: c.theme }} />
                <span className="comp-name">{c.name}</span>
              </div>
              <div className="comp-row"><span>Positionnement</span><span>{STRATEGY_LABELS[c.strategy]}</span></div>
              <div className="comp-row"><span>Base</span><span>{airport(c.hub).city} ({c.hub})</span></div>
              <div className="comp-row"><span>Lignes exploitées</span><span>{c.routes.length}</span></div>
              <div className="comp-row"><span>Flotte estimée</span><span>{c.fleet.length}+ appareils</span></div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Conjoncture">
        <div className="form-grid">
          <div className="stat-tile"><div className="stat-tile-label">Indice de carburant</div><div className="stat-tile-value">{state.market.fuelPrice.toFixed(2)} $/L</div></div>
          <div className="stat-tile"><div className="stat-tile-label">Indice de demande globale</div><div className="stat-tile-value">{Math.round(state.market.macro.demandIndex * 100)} %</div></div>
        </div>
      </Panel>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Journal
// -----------------------------------------------------------------------------
function JournalScreen({ state }) {
  const entries = [...state.log].reverse();
  return (
    <div className="screen">
      <Panel title="Journal de la compagnie">
        {entries.length === 0 && <div className="empty-hint">Rien à signaler pour l'instant.</div>}
        {entries.map((l, i) => (
          <div key={i} className="log-row"><span className="log-week">S{l.week}</span><span>{l.text}</span></div>
        ))}
      </Panel>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Help
// -----------------------------------------------------------------------------
function HelpScreen({ onReset }) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="screen">
      <Panel title="Prise en main">
        <div className="help-block">
          <h4>Principe général</h4>
          <p>Le jeu fonctionne en temps réel. Les vols partent selon leur horaire, les recettes et coûts sont comptabilisés au fil du temps, et la partie continue même lorsque vous ne cliquez sur aucun bouton.</p>
        </div>
        <div className="help-block">
          <h4>Ouvrir une ligne</h4>
          <p>Depuis l'onglet Réseau, choisissez un appareil disponible, une origine, une destination à sa portée, une fréquence hebdomadaire, un créneau horaire et une stratégie tarifaire.</p>
        </div>
        <div className="help-block">
          <h4>Stratégies tarifaires</h4>
          <p>Discount et Value privilégient le volume à bas tarif. Compétitif équilibre les deux. Premium vise une clientèle prête à payer plus pour davantage de disponibilité et de flexibilité. Yield optimisé ajuste automatiquement les tarifs selon le remplissage constaté.</p>
        </div>
        <div className="help-block">
          <h4>Ce qui compte</h4>
          <p>Le prix seul ne suffit pas : les horaires, la fréquence, la ponctualité, la réputation et l'adéquation entre la taille de l'appareil et la demande du marché influencent tous le résultat. Une ligne peut devenir déficitaire même si elle a bien démarré — surveillez vos alertes.</p>
        </div>
        <div className="help-block">
          <h4>Correspondances</h4>
          <p>Si vous exploitez deux lignes qui se rejoignent sur une même base, une partie de la demande entre les deux extrémités peut emprunter cette correspondance — la valeur d'un hub se construit ainsi, progressivement.</p>
        </div>
        <div className="help-block">
          <h4>Faillite</h4>
          <p>Une trésorerie durablement très négative peut conduire à la cessation de paiements. Surveillez votre trésorerie et évitez de sur-financer des appareils trop grands pour vos lignes.</p>
        </div>
      </Panel>
      <Panel title="Partie">
        {!confirmReset && <button className="btn btn-danger" onClick={() => setConfirmReset(true)}><Trash2 size={14} /> Réinitialiser la partie</button>}
        {confirmReset && (
          <div className="confirm-row">
            <span>Cette action supprime définitivement votre progression. Confirmer ?</span>
            <button className="btn btn-danger btn-sm" onClick={onReset}>Oui, réinitialiser</button>
            <button className="btn btn-sm" onClick={() => setConfirmReset(false)}>Annuler</button>
          </div>
        )}
      </Panel>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Bankruptcy screen
// -----------------------------------------------------------------------------
function BankruptcyScreen({ state, onReset }) {
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-hero"><AlertTriangle size={30} color="#E1595A" /><div><div className="onboarding-eyebrow">Cessation de paiements</div><h1>{state.company.name} a fait faillite</h1></div></div>
        <p className="onboarding-copy">
          Après {state.meta.week} semaines d'exploitation, la trésorerie négative prolongée a conduit à la liquidation de la compagnie.
          Un réseau mal dimensionné par rapport à sa flotte, ou un financement trop lourd, en sont généralement la cause.
        </p>
        <button className="btn btn-primary btn-lg" onClick={onReset}>Fonder une nouvelle compagnie</button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Root App
// -----------------------------------------------------------------------------
function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState('DASHBOARD');
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);
  const [saveLabel, setSaveLabel] = useState('');

  const persist = useCallback(async (s) => {
    setSaveLabel('Enregistrement…');
    const ok = await writeSave(s);
    setSaveLabel(ok ? 'Sauvegardé' : 'Sauvegarde indisponible');
    setTimeout(() => setSaveLabel(''), 1500);
  }, []);

  useEffect(() => {
    let timer;
    (async () => {
      const saved = await loadSave();
      if (saved) setState(saved);
      setLoading(false);
    })();
    timer = setInterval(() => {
      setState(prev => {
        if (!prev || prev.company.bankrupt) return prev;
        const next = realTimeTick(prev, Date.now());
        if (next === prev) return prev;
        persist(next);
        return next;
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [persist]);

  const notify = useCallback((text, tone) => {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, text, tone: tone || 'neutral' }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);

  const dispatch = useCallback((fn) => {
    setState(prev => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  const handleCreate = (name, base) => {
    const s = newGame(name, base, Math.floor(Math.random() * 100000));
    setState(s);
    persist(s);
  };

  const handleReset = async () => {
    await clearSave();
    setState(null);
    setScreen('DASHBOARD');
  };

  if (loading) {
    return <div className="app-loading"><Plane size={26} /><span>Chargement…</span></div>;
  }
  if (!state) {
    return <><GlobalStyle /><Onboarding onCreate={handleCreate} /></>;
  }
  if (state.company.bankrupt) {
    return <><GlobalStyle /><BankruptcyScreen state={state} onReset={handleReset} /></>;
  }

  let content;
  if (screen === 'DASHBOARD') content = <Dashboard state={state} />;
  else if (screen === 'NETWORK') content = <NetworkScreen state={state} dispatch={dispatch} />;
  else if (screen === 'FLEET') content = <FleetScreen state={state} dispatch={dispatch} notify={notify} />;
  else if (screen === 'FINANCE') content = <FinanceScreen state={state} />;
  else if (screen === 'MARKET') content = <MarketScreen state={state} />;
  else if (screen === 'JOURNAL') content = <JournalScreen state={state} />;
  else if (screen === 'HELP') content = <HelpScreen onReset={handleReset} />;

  return (
    <>
      <GlobalStyle />
      <div className="app-shell">
        <Sidebar screen={screen} setScreen={setScreen} company={state.company} />
        <div className="app-main">
          <TopBar state={state} saveLabel={saveLabel} />
          <div className="app-content">{content}</div>
        </div>
      </div>
      <Toast items={toasts} />
    </>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
      :root {
        --bg: #0E141F; --panel: #161E2C; --panel-alt: #1C2637; --border: #2A3448;
        --text: #E7ECF5; --text-dim: #8B96AC; --amber: #E8A33D; --cyan: #4FC1E9;
        --good: #4CAF7D; --bad: #E1595A; --mid: #E8A33D;
      }
      * { box-sizing: border-box; }
      .app-shell, .onboarding, .app-loading { font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; color: var(--text); }
      .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
      .app-shell { display: flex; height: 100%; min-height: 640px; background: var(--bg); }
      .app-loading { display:flex; align-items:center; justify-content:center; gap:10px; height: 100%; min-height: 400px; background: var(--bg); }
      .sidebar { width: 220px; flex-shrink: 0; background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 16px 10px; }
      .sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 6px 10px 18px; color: var(--amber); }
      .brand-name { font-weight: 600; font-size: 13.5px; color: var(--text); line-height: 1.3; }
      .brand-sub { font-size: 11px; color: var(--text-dim); }
      .nav-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; background: transparent; border: none; color: var(--text-dim); font-size: 13px; border-radius: 6px; cursor: pointer; text-align: left; margin-bottom: 2px; }
      .nav-item:hover { background: var(--panel-alt); color: var(--text); }
      .nav-item.active { background: var(--panel-alt); color: var(--cyan); font-weight: 600; }
      .app-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .topbar { display: flex; align-items: center; gap: 26px; padding: 12px 22px; border-bottom: 1px solid var(--border); background: var(--panel); }
      .topbar-label { font-size: 10.5px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .04em; }
      .topbar-value { font-size: 15px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; }
      .topbar-value.neg { color: var(--bad); } .topbar-value.pos { color: var(--good); }
      .topbar-spacer { flex: 1; }
      .save-indicator { font-size: 11px; color: var(--text-dim); min-width: 90px; text-align: right; }
      .app-content { flex: 1; overflow-y: auto; padding: 20px 24px 60px; }
      .screen { display: flex; flex-direction: column; gap: 16px; }
      .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
      .kpi-card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 13px 14px; display: flex; gap: 11px; align-items: flex-start; }
      .kpi-icon { width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: var(--panel-alt); color: var(--cyan); flex-shrink: 0; }
      .kpi-icon.tone-good { color: var(--good); } .kpi-icon.tone-bad { color: var(--bad); } .kpi-icon.tone-mid { color: var(--amber); }
      .kpi-label { font-size: 11px; color: var(--text-dim); margin-bottom: 3px; }
      .kpi-value { font-size: 16px; font-weight: 700; font-family: 'IBM Plex Mono', monospace; }
      .kpi-sub { font-size: 10.5px; color: var(--text-dim); margin-top: 2px; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
      .panel-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
      .panel-head h3 { margin: 0; font-size: 13px; font-weight: 600; color: var(--text); }
      .panel-body { padding: 14px 16px; }
      .empty-hint { color: var(--text-dim); font-size: 12.5px; padding: 8px 0; }
      .data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .data-table th { text-align: left; color: var(--text-dim); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; padding: 7px 8px; border-bottom: 1px solid var(--border); }
      .data-table td { padding: 8px 8px; border-bottom: 1px solid var(--border); }
      .data-table tbody tr:hover { background: var(--panel-alt); cursor: pointer; }
      .data-table tr.row-dim { opacity: .5; }
      .data-table tr.row-detail:hover { background: transparent; cursor: default; }
      .neg { color: var(--bad); } .pos { color: var(--good); } .text-dim { color: var(--text-dim); }
      .badge { font-size: 10.5px; padding: 2px 7px; border-radius: 20px; font-weight: 600; }
      .badge-good { background: rgba(76,175,125,.15); color: var(--good); }
      .badge-mid { background: rgba(232,163,61,.15); color: var(--amber); }
      .inline-select { background: var(--panel-alt); border: 1px solid var(--border); color: var(--text); border-radius: 5px; padding: 3px 5px; font-size: 12px; }
      .btn { display: inline-flex; align-items: center; gap: 6px; background: var(--panel-alt); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 500; cursor: pointer; }
      .btn:hover { border-color: var(--cyan); } .btn:disabled { opacity: .4; cursor: not-allowed; }
      .btn-primary { background: var(--amber); border-color: var(--amber); color: #1A1204; font-weight: 600; }
      .btn-primary:hover { filter: brightness(1.08); border-color: var(--amber); }
      .btn-danger { background: rgba(225,89,90,.12); border-color: var(--bad); color: var(--bad); }
      .btn-lg { padding: 11px 20px; font-size: 13.5px; width: 100%; justify-content: center; margin-top: 6px; }
      .btn-sm { padding: 6px 10px; font-size: 12px; } .btn-xs { padding: 4px 8px; font-size: 11.5px; }
      .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 12px; }
      .field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--text-dim); }
      .field input, .field select { background: var(--panel-alt); border: 1px solid var(--border); color: var(--text); padding: 9px 10px; border-radius: 6px; font-size: 13px; font-family: inherit; }
      .field input:focus, .field select:focus { outline: none; border-color: var(--cyan); }
      .ac-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
      .ac-card { background: var(--panel-alt); border: 1px solid var(--border); border-radius: 7px; padding: 10px; text-align: left; cursor: pointer; color: var(--text); }
      .ac-card.selected { border-color: var(--cyan); background: rgba(79,193,233,.08); }
      .ac-card-name { font-weight: 600; font-size: 12.5px; margin-bottom: 4px; }
      .ac-card-spec { font-size: 11px; color: var(--text-dim); }
      .cond-bar { width: 100%; height: 7px; background: var(--panel-alt); border-radius: 4px; overflow: hidden; }
      .cond-fill { height: 100%; } .cond-fill.tone-good { background: var(--good); } .cond-fill.tone-mid { background: var(--amber); } .cond-fill.tone-bad { background: var(--bad); }
      .alert-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 7px 0; border-bottom: 1px solid var(--border); color: var(--text); }
      .alert-row:last-child { border-bottom: none; }
      .alert-row.tone-bad { color: var(--bad); } .alert-row.tone-mid { color: var(--amber); }
      .log-row { display: flex; gap: 10px; font-size: 12.5px; padding: 7px 0; border-bottom: 1px solid var(--border); }
      .log-row:last-child { border-bottom: none; }
      .log-week { color: var(--text-dim); font-family: 'IBM Plex Mono', monospace; flex-shrink: 0; }
      .comp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
      .comp-card { background: var(--panel-alt); border: 1px solid var(--border); border-top: 3px solid; border-radius: 7px; padding: 12px; }
      .comp-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .comp-dot { width: 9px; height: 9px; border-radius: 50%; }
      .comp-name { font-weight: 600; font-size: 13px; }
      .comp-row { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-dim); padding: 3px 0; }
      .comp-row span:last-child { color: var(--text); }
      .stat-tile { background: var(--panel-alt); border: 1px solid var(--border); border-radius: 7px; padding: 12px; }
      .stat-tile-label { font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
      .stat-tile-value { font-size: 16px; font-weight: 700; font-family: 'IBM Plex Mono', monospace; }
      .help-block { margin-bottom: 14px; }
      .help-block h4 { margin: 0 0 4px; font-size: 13px; color: var(--cyan); }
      .help-block p { margin: 0; font-size: 12.5px; color: var(--text-dim); line-height: 1.55; }
      .confirm-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-dim); }
      .onboarding { display: flex; align-items: center; justify-content: center; height: 100%; min-height: 560px; background: var(--bg); padding: 20px; }
      .onboarding-card { width: 100%; max-width: 420px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
      .onboarding-hero { display: flex; align-items: center; gap: 12px; color: var(--amber); margin-bottom: 14px; }
      .onboarding-eyebrow { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .05em; }
      .onboarding-hero h1 { margin: 2px 0 0; font-size: 20px; color: var(--text); }
      .onboarding-copy { font-size: 13px; color: var(--text-dim); line-height: 1.6; margin-bottom: 18px; }
      .toast-stack { position: fixed; bottom: 18px; right: 18px; display: flex; flex-direction: column; gap: 8px; z-index: 50; }
      .toast { background: var(--panel-alt); border: 1px solid var(--border); border-radius: 7px; padding: 10px 14px; font-size: 12.5px; color: var(--text); box-shadow: 0 6px 20px rgba(0,0,0,.35); }
      .toast.tone-bad { border-color: var(--bad); color: var(--bad); }
      .toast.tone-good { border-color: var(--good); color: var(--good); }
      @media (max-width: 900px) {
        .kpi-row { grid-template-columns: repeat(2, 1fr); } .grid-2 { grid-template-columns: 1fr; }
        .sidebar { width: 64px; } .sidebar-brand-text, .nav-item span { display: none; }
        .topbar { flex-wrap: wrap; gap: 14px; }
      }
    `}</style>
  );
}

export default App;
