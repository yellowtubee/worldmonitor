/**
 * GDELT 2.0 Doc API client.
 * Used by BilateralRelationsPanel to fetch recent articles + tone series
 * for country pairs (JP-US, JP-CN, US-CN).
 *
 * The GDELT Doc 2.0 API is CORS-enabled and key-free, so this is
 * a pure browser-side fetch with localStorage TTL caching.
 *
 * Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 */

export interface GdeltArticle {
  url: string;
  url_mobile?: string;
  title: string;
  seendate: string;          // ISO 8601 string
  socialimage?: string;
  domain: string;
  language?: string;
  sourcecountry?: string;
}

export interface GdeltArtListResponse {
  articles?: GdeltArticle[];
}

export interface GdeltToneSample {
  date: string;              // YYYYMMDDHHMMSS
  value: number;             // tone (-100 .. +100)
}

export interface GdeltToneTimeline {
  timeline: Array<{
    series: string;
    data: GdeltToneSample[];
  }>;
}

export interface BilateralPair {
  id: 'JP-US' | 'JP-CN' | 'US-CN';
  label: string;
  /**
   * GDELT Doc API query. Includes English + native-language terms so we
   * catch headlines from JP / CN press in addition to the global anglo press.
   */
  query: string;
}

export const BILATERAL_PAIRS: BilateralPair[] = [
  {
    id: 'JP-US',
    label: '日米 (Japan – United States)',
    query: '(Japan AND ("United States" OR Washington OR "U.S.")) OR (日米 OR "日本 アメリカ" OR "日本 米国")',
  },
  {
    id: 'JP-CN',
    label: '日中 (Japan – China)',
    query: '(Japan AND (China OR Beijing OR PRC)) OR (日中 OR "日本 中国")',
  },
  {
    id: 'US-CN',
    label: '米中 (United States – China)',
    query: '(("United States" OR Washington OR "U.S.") AND (China OR Beijing OR PRC)) OR (米中 OR "中美")',
  },
];

/**
 * Endpoint selection:
 *   Production (Vercel deploy): hit our own /api/gdelt-proxy Edge Function
 *     (same-origin, no CORS, edge-cached). See api/gdelt-proxy.js.
 *   Local dev (npm run dev:geopol-jp): the Edge Function isn't running,
 *     so we fall back to public CORS proxies.
 */
const isLocalDev =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

const BASE = '/api/gdelt-proxy';
const DIRECT_GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';

// Local cache: avoid hammering GDELT on every refresh.
const CACHE_PREFIX = 'geopol-jp:gdelt-cache:';
const CACHE_TTL_MS = 20 * 60 * 1000; // 20min — matches feeds refresh interval

function cacheGet<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { v, t } = JSON.parse(raw) as { v: T; t: number };
    if (Date.now() - t > CACHE_TTL_MS) return null;
    return v;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ v: value, t: Date.now() }));
  } catch {
    /* ignore quota */
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  // Production path: same-origin Edge Function (no CORS issues).
  if (!isLocalDev) {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GDELT proxy HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`);
    }
    return (await res.json()) as T;
  }

  // Local dev path: reconstruct the direct GDELT URL and route through public proxies.
  const params = new URL(url, location.origin).searchParams;
  const directUrl = `${DIRECT_GDELT}?${params.toString()}`;
  const proxies: ((u: string) => string)[] = [
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => u,
  ];
  let lastErr: unknown = null;
  for (const wrap of proxies) {
    try {
      const res = await fetch(wrap(directUrl), { signal });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}: ${res.statusText}`);
        continue;
      }
      return (await res.json()) as T;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  throw new Error(
    `GDELT fetch failed via all dev routes: ${(lastErr as Error)?.message ?? 'unknown'}`,
  );
}

/**
 * Fetch up to `maxRecords` recent articles for a pair, sorted by date desc.
 * Timespan format: '7d' / '24h' / '3d' — GDELT-native.
 */
export async function fetchPairArticles(
  pair: BilateralPair,
  opts: { timespan?: string; maxRecords?: number; signal?: AbortSignal } = {},
): Promise<GdeltArticle[]> {
  const timespan = opts.timespan ?? '7d';
  const maxRecords = opts.maxRecords ?? 25;
  const cacheKey = `art:${pair.id}:${timespan}:${maxRecords}`;
  const cached = cacheGet<GdeltArticle[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    query: pair.query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(maxRecords),
    timespan,
    sort: 'DateDesc',
  });
  const url = `${BASE}?${params.toString()}`;
  const data = await fetchJson<GdeltArtListResponse>(url, opts.signal);
  const articles = data.articles ?? [];
  cacheSet(cacheKey, articles);
  return articles;
}

/**
 * Fetch a tone timeline for the pair. Each sample is one bucket's average tone.
 */
export async function fetchPairToneTimeline(
  pair: BilateralPair,
  opts: { timespan?: string; signal?: AbortSignal } = {},
): Promise<GdeltToneSample[]> {
  const timespan = opts.timespan ?? '7d';
  const cacheKey = `tone:${pair.id}:${timespan}`;
  const cached = cacheGet<GdeltToneSample[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    query: pair.query,
    mode: 'TimelineTone',
    format: 'json',
    timespan,
  });
  const url = `${BASE}?${params.toString()}`;
  const data = await fetchJson<GdeltToneTimeline>(url, opts.signal);
  const samples = data.timeline?.[0]?.data ?? [];
  cacheSet(cacheKey, samples);
  return samples;
}

export interface PairSnapshot {
  pair: BilateralPair;
  articles: GdeltArticle[];
  tone: GdeltToneSample[];
  /** Computed: mean tone over the window. */
  toneAvg: number;
  /** Computed: slope (tone change per day) — positive = improving. */
  toneSlope: number;
}

export function summarizeTone(samples: GdeltToneSample[]): { avg: number; slope: number } {
  if (samples.length === 0) return { avg: 0, slope: 0 };
  const values = samples.map(s => s.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  // Simple linear regression on the index → tone value.
  const n = values.length;
  const xs = values.map((_, i) => i);
  const xMean = (n - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - xMean) * (values[i]! - avg);
    den += (xs[i]! - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { avg, slope };
}

export async function loadAllPairs(
  signal?: AbortSignal,
  timespan = '7d',
): Promise<PairSnapshot[]> {
  return Promise.all(
    BILATERAL_PAIRS.map(async (pair) => {
      const [articles, tone] = await Promise.all([
        fetchPairArticles(pair, { timespan, maxRecords: 15, signal }),
        fetchPairToneTimeline(pair, { timespan, signal }),
      ]);
      const { avg, slope } = summarizeTone(tone);
      return { pair, articles, tone, toneAvg: avg, toneSlope: slope };
    }),
  );
}
