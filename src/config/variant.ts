const buildVariant = (() => {
  try {
    return import.meta.env?.VITE_VARIANT || 'full';
  } catch {
    return 'full';
  }
})();

const KNOWN_VARIANTS = ['tech', 'full', 'finance', 'happy', 'commodity', 'energy', 'geopol-jp'] as const;
type KnownVariant = typeof KNOWN_VARIANTS[number];

function isKnownVariant(v: string | null): v is KnownVariant {
  return !!v && (KNOWN_VARIANTS as readonly string[]).includes(v);
}

export const SITE_VARIANT: string = (() => {
  if (typeof window === 'undefined') return buildVariant;

  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (isTauri) {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (isKnownVariant(stored)) return stored;
    return buildVariant;
  }

  const h = location.hostname;
  if (h.startsWith('tech.')) return 'tech';
  if (h.startsWith('finance.')) return 'finance';
  if (h.startsWith('happy.')) return 'happy';
  if (h.startsWith('commodity.')) return 'commodity';
  if (h.startsWith('energy.')) return 'energy';
  if (h.startsWith('geopol-jp.') || h.startsWith('geopol.')) return 'geopol-jp';

  if (h === 'localhost' || h === '127.0.0.1') {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (isKnownVariant(stored)) return stored;
    return buildVariant;
  }

  return 'full';
})();
