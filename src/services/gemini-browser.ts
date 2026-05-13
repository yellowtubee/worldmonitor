/**
 * Browser-side Gemini client. Uses the user's Gemini API key from
 * localStorage (see user-api-keys.ts). Calls the Google Generative Language
 * REST endpoint directly — no proxy, no server-side state.
 *
 * Why REST and not @google/genai? Avoids dragging another SDK into the bundle
 * (worldmonitor already has its own AI pipeline). One small fetch wrapper is
 * sufficient for the bilateral-relations use case.
 */

import { userApiKeys } from './user-api-keys';

export class GeminiKeyMissingError extends Error {
  constructor() {
    super('Gemini API key not set. Open the Bilateral Relations panel settings to configure.');
    this.name = 'GeminiKeyMissingError';
  }
}

export class GeminiRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GeminiRequestError';
    this.status = status;
  }
}

export interface GeminiGenerateOptions {
  /** Default: gemini-2.0-flash (fast, free tier friendly). */
  model?: string;
  /** Always set explicitly — defaults to 1024 to avoid premature truncation. */
  maxOutputTokens?: number;
  temperature?: number;
  /** Abort signal for cancellation (e.g. panel destroyed). */
  signal?: AbortSignal;
  /** System instruction to steer tone / language. */
  systemInstruction?: string;
}

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export async function geminiGenerate(
  prompt: string,
  opts: GeminiGenerateOptions = {},
): Promise<string> {
  const apiKey = userApiKeys.get().geminiApiKey;
  if (!apiKey) throw new GeminiKeyMissingError();

  const model = opts.model ?? 'gemini-2.0-flash';
  const url = `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      temperature: opts.temperature ?? 0.4,
    },
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new GeminiRequestError(`Network error contacting Gemini: ${(e as Error).message}`, 0);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message ?? JSON.stringify(errBody);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new GeminiRequestError(`Gemini ${res.status}: ${detail || res.statusText}`, res.status);
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new GeminiRequestError(`Gemini blocked the request: ${data.promptFeedback.blockReason}`, 400);
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map(p => p.text ?? '')
    .join('') ?? '';

  if (!text.trim()) {
    const reason = data.candidates?.[0]?.finishReason ?? 'EMPTY';
    throw new GeminiRequestError(`Gemini returned empty response (finishReason=${reason})`, 200);
  }

  return text;
}
