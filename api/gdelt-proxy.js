/**
 * GDELT 2.0 Doc API proxy for the geopol-jp variant.
 *
 * Why this exists: GDELT does NOT send Access-Control-Allow-Origin headers
 * (despite their docs claiming CORS support), so browsers cannot fetch it
 * directly. This Edge Function runs on Vercel, fetches from GDELT server-side
 * (no CORS), then returns the JSON to our frontend (same origin = no CORS).
 *
 * Used exclusively by src/services/gdelt-bilateral.ts in the geopol-jp variant.
 *
 * Route: /api/gdelt-proxy?{any-gdelt-query-params}
 *   → forwards to https://api.gdeltproject.org/api/v2/doc/doc?{same params}
 *
 * Edge runtime keeps it cheap (no cold start) and globally distributed.
 */

export const config = { runtime: 'edge' };

const UPSTREAM = 'https://api.gdeltproject.org/api/v2/doc/doc';

// Defense: only allow GDELT-known modes so this can't be turned into a generic
// open proxy. If the request lacks `mode` or supplies an unknown one, reject.
const ALLOWED_MODES = new Set([
  'ArtList',
  'ArtGallery',
  'ImageCollage',
  'TimelineVol',
  'TimelineVolRaw',
  'TimelineVolInfo',
  'TimelineTone',
  'TimelineLang',
  'TimelineSourceCountry',
  'ToneChart',
  'WordCloudEnglish',
  'WordCloudImageTags',
  'WordCloudImageWebTags',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '3600',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  const url = new URL(req.url);
  const params = url.searchParams;

  const mode = params.get('mode');
  if (!mode || !ALLOWED_MODES.has(mode)) {
    return json(400, { error: `Missing or invalid mode parameter. Allowed: ${[...ALLOWED_MODES].join(', ')}` });
  }
  if (!params.get('query')) {
    return json(400, { error: 'Missing query parameter' });
  }

  // Forward to GDELT
  const upstreamUrl = `${UPSTREAM}?${params.toString()}`;

  // GDELT can be slow on long timespans; cap at 25s (Vercel edge limit 30s).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);

  try {
    const res = await fetch(upstreamUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'worldmonitor-geopol-jp/1.0 (bilateral-relations-panel)',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return json(res.status, {
        error: `GDELT upstream HTTP ${res.status}`,
        detail: text.slice(0, 500),
      });
    }

    const body = await res.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
        // Edge cache: serve same params from CDN for 10min; SWR for another 20min
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
        ...CORS_HEADERS,
      },
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e?.message || String(e);
    const status = msg.includes('aborted') ? 504 : 502;
    return json(status, { error: 'GDELT proxy fetch failed', detail: msg });
  }
}
