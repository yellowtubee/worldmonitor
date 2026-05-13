/**
 * UserApiKeysModal — lightweight self-contained modal that lets the user enter
 * their Gemini API key. Stored ONLY in browser localStorage via user-api-keys.
 *
 * Designed to be opened from anywhere in the geopol-jp variant
 * (BilateralRelationsPanel, settings shortcut, etc).
 */

import { userApiKeys } from '@/services/user-api-keys';

let overlay: HTMLDivElement | null = null;

function close(): void {
  if (!overlay) return;
  overlay.remove();
  overlay = null;
  document.removeEventListener('keydown', onEsc);
}

function onEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') close();
}

export function showUserApiKeysModal(): void {
  if (overlay) return;

  const current = userApiKeys.get().geminiApiKey ?? '';

  overlay = document.createElement('div');
  overlay.className = 'user-api-keys-overlay';
  overlay.innerHTML = `
    <style>
      .user-api-keys-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.65);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000;
      }
      .user-api-keys-dialog {
        background: #161616; border: 1px solid #333; border-radius: 6px;
        width: min(540px, 92vw); padding: 22px 24px; color: #e0e0e0;
        font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif;
      }
      .user-api-keys-dialog h2 { margin: 0 0 6px 0; font-size: 16px; }
      .user-api-keys-dialog .lead { color: #aaa; font-size: 12px; line-height: 1.55; margin-bottom: 14px; }
      .user-api-keys-dialog label { display: block; font-size: 12px; color: #ccc; margin: 10px 0 4px; }
      .user-api-keys-dialog input[type="password"],
      .user-api-keys-dialog input[type="text"] {
        width: 100%; box-sizing: border-box;
        background: #0c0c0c; border: 1px solid #333; color: #e0e0e0;
        padding: 7px 10px; border-radius: 3px; font-family: ui-monospace, Menlo, monospace; font-size: 12px;
      }
      .user-api-keys-dialog .help {
        font-size: 11px; color: #888; margin-top: 4px;
      }
      .user-api-keys-dialog .help a { color: #88aaff; }
      .user-api-keys-dialog .actions {
        display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px;
      }
      .user-api-keys-dialog button {
        background: #1f1f1f; border: 1px solid #444; color: #ccc;
        padding: 6px 14px; border-radius: 3px; cursor: pointer; font-size: 12px;
      }
      .user-api-keys-dialog button.primary {
        background: #1a3a6e; border-color: #4488ff; color: #cbd6ff;
      }
      .user-api-keys-dialog button.primary:hover { background: #244e94; }
      .user-api-keys-dialog button:hover { background: #2a2a2a; }
      .user-api-keys-dialog button.danger { color: #ff8866; }
      .user-api-keys-dialog .toggle-row {
        display: flex; align-items: center; gap: 6px; margin-top: 4px;
        font-size: 11px; color: #aaa;
      }
    </style>
    <div class="user-api-keys-dialog" role="dialog" aria-modal="true" aria-labelledby="ukm-title">
      <h2 id="ukm-title">API キー設定 (ローカル保存のみ)</h2>
      <p class="lead">
        入力された API キーは <b>このブラウザの localStorage にのみ保存</b>され、サーバーに送信されることはありません。
        AI ブリーフ生成時にブラウザから直接 Google Generative Language API を呼び出すために使われます。
      </p>

      <label for="ukm-gemini">Gemini API Key</label>
      <input id="ukm-gemini" type="password" autocomplete="off" spellcheck="false"
             placeholder="AIza..." value="${current.replace(/"/g, '&quot;')}" />
      <div class="toggle-row">
        <input id="ukm-show" type="checkbox" />
        <label for="ukm-show" style="margin:0;font-size:11px">キーを表示</label>
      </div>
      <div class="help">
        取得: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>
        (無料枠あり / gemini-2.0-flash 推奨)
      </div>

      <div class="actions">
        <button type="button" class="danger" data-ukm-action="clear">キーを削除</button>
        <button type="button" data-ukm-action="cancel">キャンセル</button>
        <button type="button" class="primary" data-ukm-action="save">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onEsc);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const input = overlay.querySelector<HTMLInputElement>('#ukm-gemini')!;
  const showCheckbox = overlay.querySelector<HTMLInputElement>('#ukm-show')!;
  showCheckbox.addEventListener('change', () => {
    input.type = showCheckbox.checked ? 'text' : 'password';
  });

  overlay.querySelectorAll<HTMLButtonElement>('button[data-ukm-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.ukmAction;
      if (action === 'save') {
        userApiKeys.set({ geminiApiKey: input.value });
        close();
      } else if (action === 'clear') {
        userApiKeys.clear();
        close();
      } else {
        close();
      }
    });
  });

  // Focus the input after the modal mounts.
  setTimeout(() => input.focus(), 0);
}
