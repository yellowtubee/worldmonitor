/**
 * User-supplied API keys, stored in localStorage on the client only.
 * Used by the geopol-jp variant for browser-side Gemini calls in the
 * BilateralRelationsPanel. Keys never leave the browser.
 *
 * Mirrors SHINJI's existing pattern from CogniLex / Instant English /
 * other personal apps: zero-server, user provides their own key.
 */

const STORAGE_KEY = 'geopol-jp:user-api-keys';

export interface UserApiKeys {
  geminiApiKey?: string;
}

type Listener = (keys: UserApiKeys) => void;
const listeners = new Set<Listener>();

function read(): UserApiKeys {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserApiKeys) : {};
  } catch {
    return {};
  }
}

function write(keys: UserApiKeys): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* quota or privacy mode — silently ignore */
  }
}

export const userApiKeys = {
  get(): UserApiKeys {
    return read();
  },

  set(patch: Partial<UserApiKeys>): void {
    const next = { ...read(), ...patch };
    // Trim and drop empty strings so hasGemini() reflects truth.
    if (typeof next.geminiApiKey === 'string') {
      const trimmed = next.geminiApiKey.trim();
      if (!trimmed) delete next.geminiApiKey;
      else next.geminiApiKey = trimmed;
    }
    write(next);
    listeners.forEach(l => {
      try { l(next); } catch { /* ignore */ }
    });
  },

  clear(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    listeners.forEach(l => {
      try { l({}); } catch { /* ignore */ }
    });
  },

  hasGemini(): boolean {
    return !!read().geminiApiKey;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// Listen to cross-tab updates so a key entered in one tab is reflected in others.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      const next = read();
      listeners.forEach(l => {
        try { l(next); } catch { /* ignore */ }
      });
    }
  });
}
