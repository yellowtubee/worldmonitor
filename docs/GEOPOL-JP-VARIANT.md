# Geopol-JP Variant — 適用 & デプロイガイド

worldmonitor のフォークに対して、日本目線の地政学・エネルギー・二国間関係ダッシュボード `geopol-jp` variant を追加するパッチセットです。

## 0. 含まれているもの

```
wm-geopol-jp/
├── src/
│   ├── config/
│   │   ├── variant.ts                          (置換) hostname 検出に geopol-jp 追加
│   │   ├── variant-meta.ts                     (置換) 日本語 SEO メタデータ追加
│   │   ├── panels.ts                           (置換) GEOPOLJP_PANELS / MAP_LAYERS 追加
│   │   ├── feeds.ts                            (置換) GEOPOLJP_FEEDS 追加 (NHK/日経/朝日/産経/共同)
│   │   ├── markets.ts                          (置換) variant 別 stocks 切り替え
│   │   └── variants/geopol-jp.ts               (新規) variant 定義
│   ├── services/
│   │   ├── user-api-keys.ts                    (新規) localStorage API キー管理
│   │   ├── gemini-browser.ts                   (新規) Gemini REST クライアント
│   │   └── gdelt-bilateral.ts                  (新規) GDELT 2.0 Doc API クライアント
│   ├── components/
│   │   ├── BilateralRelationsPanel.ts          (新規) 二国間パネル + チャット機能
│   │   └── UserApiKeysModal.ts                 (新規) Gemini キー入力モーダル
│   └── app/
│       └── panel-layout.ts                     (置換) BilateralRelationsPanel 登録
├── shared/
│   └── stocks-geopol-jp.json                   (新規) JP 石油銘柄・FX・指数を含む銘柄リスト
├── package.json                                (置換) dev:geopol-jp / build:geopol-jp 等を追加
├── vercel.geopol-jp.json                       (新規) Vercel プロジェクト設定スニペット
└── docs/GEOPOL-JP-VARIANT.md                   (このファイル)
```

## 0.1. 含まれる機能 (v2 アップデート)

**ニュースフィード (日本語)**:
- NHK: 主要 / 国際 / 政治 / ビジネス / 中国 / 韓国・北朝鮮 / 中東 / アメリカ動向
- 日経 (Google経由): 主要 / 米国動向 / 中東 / エネルギー / 通商政策
- 朝日: ヘッドライン / 政治 / 国際
- 産経 (Google経由)
- 共同通信 (Google経由)
- 追加日本語クエリ: 日米関係 / 日中関係 / 米中関係 / 石油タンカー・ホルムズ / サプライチェーン

**株式・為替ウォッチリスト (`shared/stocks-geopol-jp.json`)**:
- 石油: INPEX (1605.T), ENEOS (5020.T), 出光 (5019.T), コスモ (5021.T), JAPEX (1662.T)
- 都市ガス: 東京ガス (9531.T), 大阪ガス (9532.T)
- 総合商社: 三菱 / 三井 / 伊藤忠 / 丸紅 / 住友
- グローバル石油メジャー: XOM, CVX, SHEL, BP, COP, TTE, OXY, EOG, SLB
- JP指数: 日経225 (^N225), TOPIX (^TPX), 香港ハンセン (^HSI), 上海総合 (000001.SS)
- 為替: USDJPY=X, EURJPY=X, CNYJPY=X, GBPJPY=X, AUDJPY=X, DXY

**チャット機能 (BilateralRelationsPanel)**:
- 各ペア (日米/日中/米中) ごとに独立したチャット欄
- 直近の GDELT 統計と見出しを文脈として Gemini に送信
- 候補質問ボタン (例: "今週の日米関係で最大の論点は?")
- 会話履歴 24時間 localStorage キャッシュ
- Enter 送信 / Shift+Enter 改行
- 履歴クリアボタン

## 1. 適用手順

```bash
# 1. worldmonitor をフォーク済みとする
cd ~/path/to/your/worldmonitor-fork

# 2. このアーカイブを展開
tar -xzf wm-geopol-jp.tar.gz -C /tmp
PATCH=/tmp/wm-geopol-jp

# 3. ファイルを上書きコピー
#    (置換ファイル: 既存を上書き / 新規ファイル: 単に追加されるだけ)
cp -r "$PATCH/src" .
cp "$PATCH/package.json" package.json
cp "$PATCH/vercel.geopol-jp.json" .
mkdir -p docs && cp "$PATCH/docs/GEOPOL-JP-VARIANT.md" docs/

# 4. 依存はそのまま (新規依存ゼロ)
npm install

# 5. ローカルで起動
npm run dev:geopol-jp
# → http://localhost:5173 で geopol-jp variant が表示される

# 6. 型チェック (推奨)
npm run typecheck
```

## 2. 起動後の確認

`http://localhost:5173` を開いたら:

1. **ヘッダー**: `地政学モニター JP` というタイトルが表示されること
2. **マップ初期レイヤー**: AIS タンカー、ホルムズ海峡 chokepoint、Iran attacks、conflicts が点灯していること
3. **パネル**: `二国間関係 (日米・日中・米中)` パネルが表示されること
4. **二国間パネル**: ⚙ APIキー設定 ボタンをクリックして Gemini キーを入力
   - キー取得: [Google AI Studio](https://aistudio.google.com/app/apikey)
   - 入力後、各カードの「AIブリーフを生成」ボタンが有効化
5. **AIブリーフ**: ボタンを押すと数秒で日本語の動向ブリーフが生成される（1時間キャッシュ）

## 3. データソース別の動作確認

| 要件 | パネル名 | データソース | キー要否 |
| --- | --- | --- | --- |
| ① イラン情勢 | Strait of Hormuz Tracker / Energy Disruptions Log / Sanctions Pressure / Middle East News | worldmonitor.app バックエンド (相乗り) | 不要 |
| ① 石油タンカー | マップ AIS / liveTankers レイヤー | AISStream (Railway リレー経由) | 不要 (相乗り) |
| ② 石油銘柄 | Oil & Gas Complex / Oil & Gas Inventories / Commodities | EIA / FRED / Finnhub | 不要 (相乗り) |
| ③ 為替 | Markets & FX (パネル名上書き済み) | Finnhub | 不要 (相乗り) |
| ④⑤⑥ 二国間 | 二国間関係 (日米・日中・米中) | **GDELT 2.0 Doc API (CORS OK, キー不要) + ユーザー Gemini キー** | Gemini キーのみ必須 |

「相乗り」= フォーク後も `worldmonitor.app` のパブリック API を経由してデータが流れる構成。SHINJI 側でバックエンドの seed を運用する必要なし。

## 4. Vercel デプロイ

### 4.1 新規 Vercel プロジェクトとして追加するパターン (推奨)

1. Vercel ダッシュボードで `Add New → Project` をクリック
2. SHINJI のフォークリポジトリを選択
3. プロジェクト名を `worldmonitor-geopol-jp` 等で作成 (既存プロジェクトと別)
4. プロジェクトの **Settings → Build & Development Settings**:
   - Build Command: `npm run build:geopol-jp`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. **Settings → Domains** で `geopol-jp.<your-domain>` を追加
   - DNS の CNAME を Vercel が指示する宛先に向ける
6. デプロイ完了後、`https://geopol-jp.<your-domain>` にアクセスすると `geopol-jp` variant が自動選択される

### 4.2 サブドメイン以外で動かしたい場合

`src/config/variant.ts` に hostname 検出を追加してあるので、`geopol-jp.` または `geopol.` で始まるホスト名なら自動判別されます。それ以外のホスト名で動かすなら以下のいずれか:

(a) **環境変数で固定**: Vercel の Environment Variables に `VITE_VARIANT=geopol-jp` を設定 (Build Command を `npm run build` に変更)

(b) **localStorage で切り替え** (localhost 限定): ブラウザ DevTools → Console で:
```js
localStorage.setItem('worldmonitor-variant', 'geopol-jp');
location.reload();
```

### 4.3 環境変数 (任意)

Vercel に何も設定しなくても、upstream の `worldmonitor.app` バックエンド経由で大半のデータが取得できます (CORS が同一オリジンでなく `Access-Control-Allow-Origin: *` で許可されているため)。

**より良い動作のため任意で設定推奨** (フォーク側の Vercel が自分で API リクエストを処理する場合):

| 環境変数 | 用途 | 必須? |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | API レスポンスキャッシュ | 任意 |
| `FINNHUB_API_KEY` | 株価データ | 任意 (なくても遅延データで動く) |
| `FRED_API_KEY` | マクロ指標 | 任意 |
| `EIA_API_KEY` | 石油在庫 | 任意 |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` | サーバー側 AI (Insights パネル等) | 任意 |

**Gemini キーはここに設定しない**。`BilateralRelationsPanel` の Gemini はブラウザ側で localStorage から読み込まれる設計。

## 5. アーキテクチャ上のポイント

### 5.1 二国間パネルのデータフロー

```
ブラウザ
  ├─→ GDELT 2.0 Doc API (api.gdeltproject.org)        ← キー不要、CORS OK
  │     mode=ArtList → 記事リスト (時系列・最新順)
  │     mode=TimelineTone → トーン時系列 (-100..+100)
  │
  └─→ Google Generative Language API                    ← ユーザーの Gemini キー
        (generativelanguage.googleapis.com)
        プロンプト: 記事見出し + トーン統計 → 日本語ブリーフ
```

### 5.2 キャッシュ

- **GDELT 結果**: localStorage に 20 分 TTL (`geopol-jp:gdelt-cache:*`)
- **AIブリーフ**: localStorage に 1 時間 TTL (`geopol-jp:bilateral-briefs`)
- **Gemini キー**: localStorage (`geopol-jp:user-api-keys`)、cross-tab 同期対応

### 5.3 既存 worldmonitor との独立性

- 既存の AI フォールバック (Ollama/Groq/OpenRouter) は変更していない
- `Insights` パネル等は引き続き worldmonitor サーバー側 LLM を使用
- 新規追加した Gemini パスは **`BilateralRelationsPanel` 専用**で完全に分離
- upstream を merge する際の衝突は最小限 (主に `panels.ts` と `variant.ts`)

## 6. 既知の制約

1. **GDELT のレート制限**: 公式の文書化されたハードリミットはないが、過度な並列リクエストは控える設計 (キャッシュ + 並列3本上限)
2. **Gemini 無料枠**: `gemini-2.0-flash` は無料枠で 1 分あたり 15 RPM 程度。3 ペア × たまにしか押さない使い方なら問題なし
3. **AGPL-3.0**: フォークを公開デプロイする場合、ソース公開義務あり (商用化はしないので OK)
4. **upstream API への相乗り**: `worldmonitor.app` バックエンドが将来 CORS を絞ったり API key 必須に変えた場合、フォーク側で代替が必要 (現時点では `Access-Control-Allow-Origin: *`)

## 7. トラブルシューティング

| 症状 | 原因 | 解決 |
| --- | --- | --- |
| 二国間パネルに「GDELT データ取得中…」のまま | GDELT 側の一時的不調 | しばらく待つ / 「↻ 更新」 |
| 「Gemini 401」エラー | キーが間違い / 無効化 | ⚙ APIキー設定 でやり直し |
| 「Gemini 429」エラー | レート制限 | 1 分待つ。`maxOutputTokens` は既に 600 に抑制済 |
| 「Gemini blocked the request」 | safety filter | プロンプトに含まれる見出しが過激なケース。GDELT 時間範囲を `24h` 等に絞る |
| マップに何も表示されない | upstream API への接続失敗 | ブラウザコンソールの Network タブを確認 |
| 変数 `SITE_VARIANT` が `full` のまま | hostname 判定が効いていない | localhost 開発時は `localStorage.setItem('worldmonitor-variant', 'geopol-jp')` |

## 8. 次のステップ案

将来的に拡張したくなったら:

- **GDELT GKG (Knowledge Graph)** で actor-actor のイベントカウント (CAMEO コード) を取って Goldstein スコア直接計算
- **AIS Stream API キー** を user-api-keys に追加して個別タンカー追跡を強化
- **ニュースフィード追加**: `shared/feeds-*.json` に日本語ソース (NHK / 日経 / 朝日 / 産経 / 共同) を追加
- **石油銘柄ウォッチリスト**: `shared/stocks.json` を上書きまたは別ファイル化して INPEX / ENEOS / 出光 / コスモ を追加
- **チャット質問**: `BilateralRelationsPanel` にチャット欄を追加し、Gemini に "今週の日中関係の最大の論点は?" 的な質問を投げられるように
