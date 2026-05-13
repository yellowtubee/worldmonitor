/**
 * BilateralRelationsPanel — JP-US / JP-CN / US-CN bilateral relations tracker.
 *
 * Data flow (entirely browser-side, no worldmonitor backend dependency):
 *   1. GDELT 2.0 Doc API → article list + tone timeline per pair (no key, CORS OK)
 *   2. User's Gemini API key (localStorage) → synthesizes a Japanese brief
 *      AND answers free-form follow-up questions in a per-pair chat box.
 *
 * The panel renders three columns (one per pair), each showing:
 *   - Mean tone over the window (color-coded)
 *   - Tone slope (improving / deteriorating arrow)
 *   - Sparkline of the tone timeline
 *   - Top 5 recent articles
 *   - AI-synthesized brief in Japanese (gated on Gemini key being set)
 *   - Chat box for ad-hoc follow-up questions, with per-pair history
 */

import { Panel } from './Panel';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import {
  BILATERAL_PAIRS,
  loadAllPairs,
  type PairSnapshot,
  type GdeltArticle,
  type BilateralPair,
} from '@/services/gdelt-bilateral';
import { geminiGenerate, GeminiKeyMissingError, GeminiRequestError } from '@/services/gemini-browser';
import { userApiKeys } from '@/services/user-api-keys';
import { showUserApiKeysModal } from './UserApiKeysModal';

const STORAGE_KEY_BRIEFS = 'geopol-jp:bilateral-briefs';
const STORAGE_KEY_CHATS = 'geopol-jp:bilateral-chats';
const BRIEF_TTL_MS = 60 * 60 * 1000; // 1 hour
const CHAT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedBrief {
  text: string;
  generatedAt: number;
}
interface CachedBriefs { [pairId: string]: CachedBrief; }

interface ChatTurn { role: 'user' | 'assistant'; text: string; ts: number; }
interface CachedChats { [pairId: string]: { turns: ChatTurn[]; updatedAt: number }; }

function loadBriefCache(): CachedBriefs {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_BRIEFS) ?? '{}') as CachedBriefs; }
  catch { return {}; }
}
function saveBriefCache(briefs: CachedBriefs): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY_BRIEFS, JSON.stringify(briefs)); } catch { /* quota */ }
}
function loadChatCache(): CachedChats {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_CHATS) ?? '{}') as CachedChats;
    const now = Date.now();
    for (const id of Object.keys(raw)) {
      if (now - (raw[id]?.updatedAt ?? 0) > CHAT_TTL_MS) delete raw[id];
    }
    return raw;
  } catch { return {}; }
}
function saveChatCache(chats: CachedChats): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY_CHATS, JSON.stringify(chats)); } catch { /* quota */ }
}

function toneColor(avg: number): string {
  if (avg >= 2) return '#44ff88';
  if (avg >= 0) return '#88e0a0';
  if (avg >= -2) return '#ffaa66';
  if (avg >= -4) return '#ff7744';
  return '#ff4444';
}
function toneLabel(avg: number): string {
  if (avg >= 2) return '協調的';
  if (avg >= 0) return 'やや協調';
  if (avg >= -2) return '中立';
  if (avg >= -4) return 'やや緊張';
  return '緊張';
}
function trendArrow(slope: number): string {
  if (slope > 0.15) return '<span style="color:#44ff88">▲ 改善傾向</span>';
  if (slope < -0.15) return '<span style="color:#ff7744">▼ 悪化傾向</span>';
  return '<span style="color:#888">→ 横ばい</span>';
}
function sparkline(samples: { value: number }[]): string {
  if (samples.length < 2) return '';
  const w = 220, h = 36;
  const values = samples.map(s => s.value);
  const min = Math.min(...values, -1), max = Math.max(...values, 1);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const zeroY = h - ((0 - min) / range) * h;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;margin:6px 0">
    <line x1="0" y1="${zeroY}" x2="${w}" y2="${zeroY}" stroke="#444" stroke-dasharray="2,2" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="#88aaff" stroke-width="1.6"/></svg>`;
}
function formatDate(seendate: string): string {
  if (seendate.length < 13) return seendate;
  return `${seendate.slice(0,4)}-${seendate.slice(4,6)}-${seendate.slice(6,8)} ${seendate.slice(9,11)}:${seendate.slice(11,13)}`;
}
function articleRow(a: GdeltArticle): string {
  const safeUrl = sanitizeUrl(a.url);
  const safeTitle = escapeHtml(a.title || '(no title)');
  const safeDomain = escapeHtml(a.domain || '');
  return `<li class="bilateral-article">
    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>
    <div class="bilateral-article-meta"><span>${safeDomain}</span><span>${escapeHtml(formatDate(a.seendate))}</span></div>
  </li>`;
}

function buildBriefPrompt(snapshot: PairSnapshot): string {
  const headlines = snapshot.articles.slice(0, 12).map((a, i) =>
    `${i + 1}. [${a.domain}] ${a.title}`).join('\n');
  return `あなたは日本の地政学アナリストです。下記は GDELT が収集した「${snapshot.pair.label}」関係の直近7日間の見出しと、トーン指標（-10 緊張 〜 +10 協調）です。日本の読者向けに、客観的かつ簡潔な動向ブリーフを日本語で書いてください。

【統計】
- 平均トーン: ${snapshot.toneAvg.toFixed(2)}
- トーン傾き: ${snapshot.toneSlope.toFixed(3)} (正=改善 / 負=悪化)
- 記事数: ${snapshot.articles.length}

【見出し（最新順）】
${headlines}

【出力形式】
- 3〜4文の段落、日本語
- 「協調」「緊張」「対立」「合意」など具体的な動詞・名詞を使う
- 推測ではなく見出しから読み取れる事実に基づく
- 末尾に「要注視: 〜」の1行で次に注目すべき論点を1つだけ示す
- マークダウン記号や箇条書きは使わない`;
}

function buildChatContext(snapshot: PairSnapshot): string {
  const headlines = snapshot.articles.slice(0, 10).map((a, i) =>
    `${i + 1}. [${a.domain}] ${a.title}`).join('\n');
  return `あなたは日本の地政学アナリストです。ユーザーは「${snapshot.pair.label}」関係について質問しています。下記のデータを根拠として、日本語で簡潔・客観的に回答してください。データに含まれない事項については「直近のデータからは断定できません」と明言してください。マークダウン記号や箇条書きは使わず、自然な日本語の文章で答えてください。

【統計（直近7日）】
- 平均トーン: ${snapshot.toneAvg.toFixed(2)}（-10 緊張 〜 +10 協調）
- トーン傾き: ${snapshot.toneSlope.toFixed(3)}（正=改善 / 負=悪化）
- 記事数: ${snapshot.articles.length}

【見出し（最新順）】
${headlines}`;
}

const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  'JP-US': [
    '今週の日米関係で最大の論点は?',
    '在日米軍関連の動きはあった?',
    '日米通商で注目すべき動きは?',
  ],
  'JP-CN': [
    '今週の日中関係で最大の論点は?',
    '尖閣・台湾に関する動きは?',
    '経済安全保障や半導体規制への影響は?',
  ],
  'US-CN': [
    '今週の米中対立で最大の論点は?',
    '関税・輸出管理の最新動向は?',
    '台湾海峡情勢の変化は?',
  ],
};

export class BilateralRelationsPanel extends Panel {
  private snapshots: PairSnapshot[] = [];
  private briefs: CachedBriefs = loadBriefCache();
  private chats: CachedChats = loadChatCache();
  private loading = false;
  private loadingStep = '';
  private error: string | null = null;
  private generatingForPair: string | null = null;
  private chattingForPair: string | null = null;
  private chatDrafts: Record<string, string> = {};
  private fetchAbort: AbortController | null = null;
  private chatAbort: AbortController | null = null;
  private unsubscribeKeys: (() => void) | null = null;

  constructor() {
    super({
      id: 'bilateral-relations',
      title: '二国間関係 (日米・日中・米中)',
      showCount: false,
      infoTooltip: 'GDELT 2.0 Doc API による日米・日中・米中の直近7日間の報道トーン分析。AIブリーフ・チャットは設定した Gemini API キー（ローカル保存のみ）でブラウザ内で実行されます。',
    });
    this.unsubscribeKeys = userApiKeys.subscribe(() => this.render());
    void this.fetchData();
  }

  public destroy(): void {
    this.fetchAbort?.abort();
    this.chatAbort?.abort();
    this.unsubscribeKeys?.();
    this.unsubscribeKeys = null;
    super.destroy();
  }

  public async refresh(): Promise<void> { await this.fetchData(); }

  private async fetchData(): Promise<void> {
    if (this.loading) return;
    this.fetchAbort?.abort();
    this.fetchAbort = new AbortController();
    this.loading = true;
    this.loadingStep = '';
    this.error = null;
    this.snapshots = []; // Clear so progressive rendering shows from scratch
    this.render();
    try {
      this.snapshots = await loadAllPairs({
        signal: this.fetchAbort.signal,
        onProgress: (snap) => {
          // Append as it arrives so the user sees each card pop in.
          this.snapshots = [...this.snapshots, snap];
          this.render();
        },
        onStep: (msg) => {
          this.loadingStep = msg;
          this.render();
        },
      });
      this.error = null;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      this.error = `GDELT データの取得に失敗しました: ${(e as Error).message}`;
    } finally {
      this.loading = false;
      this.loadingStep = '';
      this.render();
    }
  }

  private snapshotFor(pairId: string): PairSnapshot | undefined {
    return this.snapshots.find(s => s.pair.id === pairId);
  }

  private async generateBrief(pairId: string): Promise<void> {
    const snap = this.snapshotFor(pairId);
    if (!snap) return;
    if (!userApiKeys.hasGemini()) { showUserApiKeysModal(); return; }
    this.generatingForPair = pairId;
    this.render();
    try {
      const text = await geminiGenerate(buildBriefPrompt(snap), {
        maxOutputTokens: 600,
        temperature: 0.35,
        systemInstruction: 'You are a Japanese geopolitical analyst writing concise objective briefs in Japanese.',
      });
      this.briefs[pairId] = { text, generatedAt: Date.now() };
      saveBriefCache(this.briefs);
    } catch (e) {
      if (e instanceof GeminiKeyMissingError) {
        showUserApiKeysModal();
      } else if (e instanceof GeminiRequestError) {
        this.briefs[pairId] = { text: `[エラー] Gemini 呼び出し失敗: ${e.message}`, generatedAt: Date.now() };
      } else {
        this.briefs[pairId] = { text: `[エラー] ${(e as Error).message}`, generatedAt: Date.now() };
      }
    } finally {
      this.generatingForPair = null;
      this.render();
    }
  }

  private async sendChatMessage(pairId: string, message: string): Promise<void> {
    const snap = this.snapshotFor(pairId);
    if (!snap) return;
    const trimmed = message.trim();
    if (!trimmed) return;
    if (!userApiKeys.hasGemini()) { showUserApiKeysModal(); return; }
    if (this.chattingForPair) return;

    const entry = this.chats[pairId] ?? { turns: [], updatedAt: 0 };
    entry.turns.push({ role: 'user', text: trimmed, ts: Date.now() });
    entry.updatedAt = Date.now();
    this.chats[pairId] = entry;
    saveChatCache(this.chats);
    this.chatDrafts[pairId] = '';
    this.chattingForPair = pairId;
    this.render();
    this.focusChatInput(pairId);

    const context = buildChatContext(snap);
    const recent = entry.turns.slice(-7);
    const transcript = recent.map(t =>
      `${t.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${t.text}`).join('\n\n');
    const fullPrompt = `${context}\n\n【これまでの会話】\n${transcript}\n\nアシスタント:`;

    this.chatAbort?.abort();
    this.chatAbort = new AbortController();
    try {
      const text = await geminiGenerate(fullPrompt, {
        maxOutputTokens: 700,
        temperature: 0.4,
        signal: this.chatAbort.signal,
        systemInstruction: 'You are a Japanese geopolitical analyst. Answer in Japanese, concisely and grounded in the provided data only.',
      });
      const e2 = this.chats[pairId];
      if (e2) {
        e2.turns.push({ role: 'assistant', text, ts: Date.now() });
        e2.updatedAt = Date.now();
        saveChatCache(this.chats);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const errMsg = e instanceof GeminiRequestError
        ? `Gemini 呼び出し失敗: ${e.message}`
        : (e as Error).message;
      const e2 = this.chats[pairId];
      if (e2) {
        e2.turns.push({ role: 'assistant', text: `[エラー] ${errMsg}`, ts: Date.now() });
        e2.updatedAt = Date.now();
        saveChatCache(this.chats);
      }
    } finally {
      this.chattingForPair = null;
      this.render();
    }
  }

  private clearChat(pairId: string): void {
    delete this.chats[pairId];
    saveChatCache(this.chats);
    this.render();
  }

  private focusChatInput(pairId: string): void {
    requestAnimationFrame(() => {
      this.content
        .querySelector<HTMLTextAreaElement>(`textarea[data-bilateral-chat-input="${pairId}"]`)
        ?.focus();
    });
  }

  private render(): void {
    if (this.loading && this.snapshots.length === 0) {
      const step = this.loadingStep || 'GDELT データ取得中…';
      this.setContent(`
        <div class="bilateral-loading">
          <div style="font-size:13px;color:#cbd6ff;margin-bottom:6px">${escapeHtml(step)}</div>
          <div style="font-size:11px;color:#888;line-height:1.5">
            GDELT は「5秒に1リクエスト」の制限があるため、初回ロードは最大30秒程度かかります。<br>
            一度取得すると6時間ローカルキャッシュされます。
          </div>
        </div>
      `);
      return;
    }
    if (this.error && this.snapshots.length === 0) {
      this.setContent(`<div class="bilateral-error">${escapeHtml(this.error)}</div>`);
      return;
    }
    const hasKey = userApiKeys.hasGemini();
    const keyStatusLine = hasKey
      ? '<span style="color:#44ff88">● Gemini APIキー設定済み (ローカル保存)</span>'
      : '<span style="color:#ffaa66">○ Gemini APIキー未設定</span>';
    const ordered = BILATERAL_PAIRS.map(p => this.snapshotFor(p.id))
      .filter((s): s is PairSnapshot => !!s);
    const cards = ordered.map(snap => this.renderCard(snap)).join('');

    const html = `
      <style>
        .bilateral-panel-root { font-size: 12px; }
        .bilateral-header { display:flex;justify-content:space-between;align-items:center;padding:6px 10px;gap:8px;flex-wrap:wrap;border-bottom:1px solid #2a2a2a; }
        .bilateral-header button { background:#1f1f1f;border:1px solid #444;color:#ccc;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px; }
        .bilateral-header button:hover { background:#2a2a2a; }
        .bilateral-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px;padding:10px; }
        .bilateral-card { background:#161616;border:1px solid #2a2a2a;border-radius:4px;padding:10px;display:flex;flex-direction:column;gap:6px; }
        .bilateral-card-title { font-weight:600;font-size:13px;color:#e0e0e0; }
        .bilateral-metrics { display:flex;justify-content:space-between;align-items:center;font-size:11px; }
        .bilateral-tone-pill { padding:2px 8px;border-radius:10px;font-weight:600;color:#111; }
        .bilateral-article { margin:4px 0;line-height:1.35; }
        .bilateral-article a { color:#cbd6ff;text-decoration:none; }
        .bilateral-article a:hover { text-decoration:underline; }
        .bilateral-article-meta { font-size:10px;color:#777;display:flex;gap:8px; }
        .bilateral-brief { background:#0e1a2a;border-left:3px solid #4488ff;padding:8px 10px;margin-top:6px;line-height:1.55;color:#d8e2f5;font-size:12px;white-space:pre-wrap; }
        .bilateral-brief-meta { font-size:10px;color:#888;margin-top:4px; }
        .bilateral-generate-btn { background:#1a3a6e;border:1px solid #4488ff;color:#cbd6ff;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;margin-top:4px; }
        .bilateral-generate-btn:hover { background:#244e94; }
        .bilateral-generate-btn:disabled { opacity:0.6;cursor:wait; }
        .bilateral-key-status { font-size:11px; }
        .bilateral-loading, .bilateral-error { padding:20px;text-align:center;color:#888; }
        .bilateral-error { color:#ff7744; }
        .bilateral-chat { margin-top:8px;border-top:1px dashed #333;padding-top:8px;display:flex;flex-direction:column;gap:6px; }
        .bilateral-chat-header { display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#aaa; }
        .bilateral-chat-clear { background:transparent;border:none;color:#888;cursor:pointer;font-size:10px;padding:0; }
        .bilateral-chat-clear:hover { color:#ff7744;text-decoration:underline; }
        .bilateral-chat-log { max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:5px;padding-right:2px; }
        .bilateral-chat-turn { padding:6px 8px;border-radius:4px;font-size:12px;line-height:1.45;white-space:pre-wrap; }
        .bilateral-chat-turn.user { background:#1a2638;color:#cbd6ff;align-self:flex-end;max-width:90%; }
        .bilateral-chat-turn.assistant { background:#1c1c20;color:#e0e0e0;align-self:flex-start;max-width:95%;border-left:2px solid #4488ff; }
        .bilateral-chat-suggestions { display:flex;flex-wrap:wrap;gap:4px;margin-top:2px; }
        .bilateral-chat-suggestion { background:#1a1a1a;border:1px solid #333;color:#aaa;padding:3px 8px;border-radius:12px;font-size:10.5px;cursor:pointer; }
        .bilateral-chat-suggestion:hover { background:#232323;color:#cbd6ff;border-color:#4488ff; }
        .bilateral-chat-input-row { display:flex;gap:6px;align-items:stretch; }
        .bilateral-chat-input-row textarea { flex:1;background:#0c0c0c;border:1px solid #333;color:#e0e0e0;padding:6px 8px;border-radius:3px;font-size:12px;font-family:inherit;resize:vertical;min-height:32px;max-height:120px; }
        .bilateral-chat-input-row textarea:focus { outline:none;border-color:#4488ff; }
        .bilateral-chat-send { background:#1a3a6e;border:1px solid #4488ff;color:#cbd6ff;padding:0 12px;border-radius:3px;cursor:pointer;font-size:11px;min-width:56px; }
        .bilateral-chat-send:hover { background:#244e94; }
        .bilateral-chat-send:disabled { opacity:0.6;cursor:wait; }
        .bilateral-chat-thinking { font-size:11px;color:#88aaff;font-style:italic;padding:2px 4px; }
      </style>
      <div class="bilateral-panel-root">
        <div class="bilateral-header">
          <span class="bilateral-key-status">${keyStatusLine}</span>
          <div style="display:flex;gap:6px">
            <button data-bilateral-action="configure">⚙ APIキー設定</button>
            <button data-bilateral-action="refresh">↻ 更新</button>
          </div>
        </div>
        ${this.loading && this.loadingStep ? `
          <div style="padding:6px 10px;font-size:11px;color:#88aaff;border-bottom:1px solid #2a2a2a;background:#0c1424">
            ⏳ ${escapeHtml(this.loadingStep)}
          </div>` : ''}
        <div class="bilateral-grid">${cards}</div>
      </div>`;
    this.setContent(html);
    this.bindEvents();
  }

  private bindEvents(): void {
    this.content.querySelectorAll<HTMLButtonElement>('button[data-bilateral-action]').forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.bilateralAction;
        if (action === 'configure') showUserApiKeysModal();
        if (action === 'refresh') void this.fetchData();
      };
    });
    this.content.querySelectorAll<HTMLButtonElement>('button[data-bilateral-generate]').forEach(btn => {
      btn.onclick = () => {
        const pairId = btn.dataset.bilateralGenerate;
        if (pairId) void this.generateBrief(pairId);
      };
    });
    this.content.querySelectorAll<HTMLButtonElement>('button[data-bilateral-chat-clear]').forEach(btn => {
      btn.onclick = () => {
        const pairId = btn.dataset.bilateralChatClear;
        if (pairId) this.clearChat(pairId);
      };
    });
    this.content.querySelectorAll<HTMLButtonElement>('button[data-bilateral-chat-suggestion]').forEach(btn => {
      btn.onclick = () => {
        const pairId = btn.dataset.bilateralChatSuggestion;
        const text = btn.dataset.bilateralChatSuggestionText;
        if (pairId && text) void this.sendChatMessage(pairId, text);
      };
    });
    this.content.querySelectorAll<HTMLTextAreaElement>('textarea[data-bilateral-chat-input]').forEach(ta => {
      const pairId = ta.dataset.bilateralChatInput!;
      ta.value = this.chatDrafts[pairId] ?? '';
      ta.oninput = () => { this.chatDrafts[pairId] = ta.value; };
      ta.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          void this.sendChatMessage(pairId, ta.value);
        }
      };
    });
    this.content.querySelectorAll<HTMLButtonElement>('button[data-bilateral-chat-send]').forEach(btn => {
      btn.onclick = () => {
        const pairId = btn.dataset.bilateralChatSend;
        if (!pairId) return;
        const ta = this.content.querySelector<HTMLTextAreaElement>(`textarea[data-bilateral-chat-input="${pairId}"]`);
        if (ta) void this.sendChatMessage(pairId, ta.value);
      };
    });
  }

  private renderCard(snap: PairSnapshot): string {
    const pillColor = toneColor(snap.toneAvg);
    const articles = snap.articles.slice(0, 5).map(articleRow).join('');
    const cached = this.briefs[snap.pair.id];
    const cachedFresh = cached && (Date.now() - cached.generatedAt < BRIEF_TTL_MS);
    const generating = this.generatingForPair === snap.pair.id;

    const briefBlock = cached ? `
      <div class="bilateral-brief">${escapeHtml(cached.text)}</div>
      <div class="bilateral-brief-meta">
        AI生成: ${new Date(cached.generatedAt).toLocaleString('ja-JP')}
        ${cachedFresh ? '' : '<span style="color:#ffaa66"> (古いキャッシュ — 再生成推奨)</span>'}
      </div>` : '';

    const btnLabel = generating
      ? '生成中…'
      : userApiKeys.hasGemini()
        ? (cached ? 'AIブリーフを再生成' : 'AIブリーフを生成')
        : 'Gemini APIキーを設定してAIブリーフを生成';

    return `
      <div class="bilateral-card">
        <div class="bilateral-card-title">${escapeHtml(snap.pair.label)}</div>
        <div class="bilateral-metrics">
          <span class="bilateral-tone-pill" style="background:${pillColor}">
            ${toneLabel(snap.toneAvg)} (${snap.toneAvg.toFixed(2)})
          </span>
          <span>${trendArrow(snap.toneSlope)}</span>
        </div>
        ${sparkline(snap.tone)}
        <ul style="list-style:none;padding:0;margin:4px 0">${articles}</ul>
        <button class="bilateral-generate-btn" data-bilateral-generate="${snap.pair.id}" ${generating ? 'disabled' : ''}>
          ${escapeHtml(btnLabel)}
        </button>
        ${briefBlock}
        ${this.renderChat(snap.pair)}
      </div>`;
  }

  private renderChat(pair: BilateralPair): string {
    const entry = this.chats[pair.id];
    const turns = entry?.turns ?? [];
    const busy = this.chattingForPair === pair.id;
    const hasKey = userApiKeys.hasGemini();

    const logHtml = turns.map(t =>
      `<div class="bilateral-chat-turn ${t.role}">${escapeHtml(t.text)}</div>`).join('');

    const suggestions = SUGGESTED_QUESTIONS[pair.id] ?? [];
    const showSuggestions = turns.length === 0 && hasKey;
    const suggestionsHtml = showSuggestions
      ? `<div class="bilateral-chat-suggestions">${suggestions.map(q =>
          `<button class="bilateral-chat-suggestion" data-bilateral-chat-suggestion="${pair.id}" data-bilateral-chat-suggestion-text="${escapeHtml(q)}">${escapeHtml(q)}</button>`
        ).join('')}</div>`
      : '';

    const thinking = busy ? '<div class="bilateral-chat-thinking">Gemini が回答を生成中…</div>' : '';
    const clearBtn = turns.length > 0
      ? `<button class="bilateral-chat-clear" data-bilateral-chat-clear="${pair.id}">履歴をクリア</button>`
      : '';
    const placeholder = hasKey
      ? '質問を入力 (Enter で送信 / Shift+Enter で改行)'
      : '⚙ APIキー設定 から Gemini キーを保存してください';
    const labelShort = pair.label.split(' (')[0] ?? pair.label;

    return `
      <div class="bilateral-chat">
        <div class="bilateral-chat-header">
          <span>💬 ${escapeHtml(labelShort)} について質問</span>
          ${clearBtn}
        </div>
        <div class="bilateral-chat-log">${logHtml}</div>
        ${thinking}
        ${suggestionsHtml}
        <div class="bilateral-chat-input-row">
          <textarea data-bilateral-chat-input="${pair.id}" rows="1" placeholder="${escapeHtml(placeholder)}" ${!hasKey ? 'disabled' : ''}></textarea>
          <button class="bilateral-chat-send" data-bilateral-chat-send="${pair.id}" ${busy || !hasKey ? 'disabled' : ''}>送信</button>
        </div>
      </div>`;
  }
}
