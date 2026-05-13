// Geopolitics Japan variant - geopol-jp.<your-domain>
//
// Focus: Japanese-perspective geopolitical & energy intelligence dashboard.
// Covers: Iran situation + oil tanker shipping (Hormuz), oil-related equities,
// FX rates, and JP-US / JP-CN / US-CN bilateral relations.
//
// NOTE: This file is a structured canonical description for reference. The
// runtime wiring lives in src/config/panels.ts (GEOPOLJP_PANELS,
// GEOPOLJP_MAP_LAYERS, GEOPOLJP_MOBILE_MAP_LAYERS) — modify both if the
// variant shape changes. Parallel to energy.ts / finance.ts / commodity.ts.
import type { PanelConfig, MapLayers } from '@/types';
import type { VariantConfig } from './base';

export * from './base';

// ─────────────────────────────────────────────────────────────────────────────
// PANEL CONFIGURATION — Japan-centric geopolitical + energy
// Maps to the 6 requirements:
//   ① Iran situation + oil tanker shipping → hormuz-tracker, energy-disruptions,
//      sanctions-pressure, supply-chain, middleeast news, ucdp-events
//   ② Oil-related equities → energy-complex, oil-inventories, commodities, markets
//   ③ FX → markets (includes USDJPY/EURJPY/CNYJPY), macro-signals
//   ④⑤⑥ JP-US / JP-CN / US-CN → bilateral-relations (custom panel), us news,
//      asia news, cii (Country Instability), gdelt-intel, trade-policy
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_PANELS: Record<string, PanelConfig> = {
  // Core
  map: { name: 'Geopolitical Map (JP)', enabled: true, priority: 1 },
  'live-news': { name: 'Geopolitical Headlines', enabled: true, priority: 1 },
  insights: { name: 'AI Insights', enabled: true, priority: 1 },

  // ④⑤⑥ Bilateral relations — the differentiator panel (uses user Gemini key)
  'bilateral-relations': { name: 'Bilateral Relations (JP-US / JP-CN / US-CN)', enabled: true, priority: 1 },

  // ④⑤⑥ Country context — news streams
  us: { name: 'United States', enabled: true, priority: 1 },
  asia: { name: 'Asia-Pacific', enabled: true, priority: 1 },
  middleeast: { name: 'Middle East', enabled: true, priority: 1 },

  // ④⑤⑥ Composite signals
  cii: { name: 'Country Instability', enabled: true, priority: 1 },
  'gdelt-intel': { name: 'Live Intelligence', enabled: true, priority: 1 },
  'strategic-posture': { name: 'AI Strategic Posture', enabled: true, priority: 1 },
  'trade-policy': { name: 'Trade Policy', enabled: true, priority: 1 },

  // ① Iran + oil tanker shipping
  'hormuz-tracker': { name: 'Strait of Hormuz Tracker', enabled: true, priority: 1 },
  'energy-disruptions': { name: 'Energy Disruptions Log', enabled: true, priority: 1 },
  'energy-crisis': { name: 'Energy Crisis Policy Tracker', enabled: true, priority: 1 },
  'sanctions-pressure': { name: 'Sanctions Pressure', enabled: true, priority: 1 },
  'supply-chain': { name: 'Chokepoints & Routes', enabled: true, priority: 2 },
  'ucdp-events': { name: 'UCDP Conflict Events', enabled: true, priority: 2 },

  // ② Oil-related equities and commodities
  'energy-complex': { name: 'Oil & Gas Complex', enabled: true, priority: 1 },
  'oil-inventories': { name: 'Oil & Gas Inventories', enabled: true, priority: 1 },
  commodities: { name: 'Energy Commodities (WTI, Brent, NatGas)', enabled: true, priority: 1 },
  'fuel-prices': { name: 'Retail Fuel Prices', enabled: true, priority: 2 },

  // ② + ③ Markets & FX
  markets: { name: 'Markets & FX', enabled: true, priority: 1 },
  'macro-signals': { name: 'Market Regime', enabled: true, priority: 2 },
  'fear-greed': { name: 'Fear & Greed', enabled: true, priority: 2 },

  // Tracking
  monitors: { name: 'My Monitors', enabled: true, priority: 3 },
  'world-clock': { name: 'World Clock', enabled: true, priority: 3 },
};

// ─────────────────────────────────────────────────────────────────────────────
// MAP LAYERS — Strait-of-Hormuz / Persian-Gulf / East-Asia focused
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_MAP_LAYERS: MapLayers = {
  // ── Maritime / energy (ENABLED) ───────────────────────────────────────────
  ais: true,               // All AIS vessels
  liveTankers: true,       // Tankers (AIS ship type 80-89) at chokepoints
  waterways: true,         // Strategic chokepoints (Hormuz / Suez / Malacca)
  tradeRoutes: true,       // Tanker trade routes
  pipelines: true,         // Oil & gas pipelines
  commodityPorts: true,    // LNG / crude import & export ports
  storageFacilities: true, // SPR / UGS / LNG / crude tank farms
  fuelShortages: true,
  sanctions: true,         // Energy sanctions

  // ── Iran / conflict context (ENABLED) ─────────────────────────────────────
  iranAttacks: true,       // Iran-linked attacks layer
  conflicts: true,
  ucdpEvents: true,
  gpsJamming: true,        // Persian Gulf is a GPS-jamming hotspot
  hotspots: true,

  // ── Asia-Pacific context (ENABLED) ────────────────────────────────────────
  military: true,          // Military aircraft (relevant to Taiwan strait, etc.)
  bases: true,             // US bases (relevant to 日米同盟)
  flights: false,          // Too noisy
  cables: true,            // Submarine cables (China-related, AAG cuts, etc.)

  // ── Environmental hazards (ENABLED) ───────────────────────────────────────
  natural: true,           // Earthquakes — JP relevance
  weather: true,
  fires: true,
  climate: true,
  outages: true,
  cyberThreats: true,

  // ── Choropleth / overlays (ENABLED) ───────────────────────────────────────
  ciiChoropleth: true,     // Country instability heatmap
  minerals: true,          // Critical minerals (energy transition)

  // ── Disabled noise ────────────────────────────────────────────────────────
  satellites: false,
  nuclear: false,
  irradiators: false,
  economic: false,
  datacenters: false,
  protests: false,
  spaceports: false,
  displacement: false,
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  resilienceScore: false,
  dayNight: false,
  miningSites: false,
  processingPlants: false,
  webcams: false,
  diseaseOutbreaks: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE MAP LAYERS — minimal for perf
// ─────────────────────────────────────────────────────────────────────────────
export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = {
  ais: false,
  liveTankers: true,
  waterways: true,
  tradeRoutes: false,
  pipelines: true,
  commodityPorts: true,
  storageFacilities: false,
  fuelShortages: false,
  sanctions: false,
  iranAttacks: true,
  conflicts: true,
  ucdpEvents: false,
  gpsJamming: false,
  hotspots: false,
  military: false,
  bases: false,
  flights: false,
  cables: false,
  natural: true,
  weather: false,
  fires: false,
  climate: false,
  outages: false,
  cyberThreats: false,
  ciiChoropleth: false,
  minerals: false,
  satellites: false,
  nuclear: false,
  irradiators: false,
  economic: false,
  datacenters: false,
  protests: false,
  spaceports: false,
  displacement: false,
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  resilienceScore: false,
  dayNight: false,
  miningSites: false,
  processingPlants: false,
  webcams: false,
  diseaseOutbreaks: false,
};

export const VARIANT_CONFIG: VariantConfig = {
  name: 'geopol-jp',
  description: 'Japanese-perspective geopolitical & energy intelligence — Iran/Hormuz, oil equities, FX, and JP-US/JP-CN/US-CN bilateral signals',
  panels: DEFAULT_PANELS,
  mapLayers: DEFAULT_MAP_LAYERS,
  mobileMapLayers: MOBILE_DEFAULT_MAP_LAYERS,
};
