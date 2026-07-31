# テスト手順（人間／エージェント共通）

このリポジトリのテストの走らせ方と、実行前にハマりやすい点をまとめる。

最初に押さえること:

- **「node が入っていない」と判断する前に §1 を読む**（入っているがPATHに出ないだけ）。
- **実サイトへのログインは回数を絞る**（§4.1）。短時間に繰り返すとアカウントがはじかれる。
  確認は §2・§3 のオフライン手段を優先し、実サイトのテストは最後に1回。
- スナップショットの1px差による失敗は日常的に起きる（§4の「基準画像は環境差・実行差で1pxずれる」）。
  自分の変更のせいと決めつけない。

---

## 1. Node.js は入っている（PATHに出てこないだけ）

Node.js は winget 版がユーザー領域にインストールされている。
インストール先はレジストリのユーザー PATH には登録済みだが、**エージェントのシェルが
継承する PATH には反映されていないことがある**（シェル起動時の環境が古いまま）。
そのため `node -v` や `where node` が「見つからない」と言ってくることがあるが、
**Node が無いわけではない**。

確認と対処:

```powershell
# 本当のユーザーPATH（レジストリ）を見る。ここに nodejs のパスがある
[Environment]::GetEnvironmentVariable("Path", "User")

# 見つけたパスを一時的に通してから実行する（毎回のコマンド先頭で行う）
$env:PATH = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.18.0-win-x64;$env:PATH"
node -v   # v24.18.0
```

※ ディレクトリ名にバージョン番号が入っているため、Node を更新すると変わる。
上の `GetEnvironmentVariable` で毎回確認するのが確実。

`node_modules/` はコミットされていないが `ouj-chromium-extension/` 配下に展開済みで、
`@playwright/test` と Playwright のブラウザも導入済み。`npm install` は通常不要。

---

## 2. 構文チェック（最速・オフライン）

JSファイルを編集したら、まずこれを通す。content script は bundler を使わない生の JS なので、
構文エラーはそのファイルの読み込み丸ごと失敗＝機能が黙って死ぬ形で出る。

```powershell
cd ouj-chromium-extension
node --check src/変更したファイル.js
```

---

## 3. 実サイトを使わないロジック確認（推奨。まずここで確かめる）

`target_site/` に実サイトの保存 HTML／API JSON がある。Playwright で `file://` として開き、
content script を `addScriptTag` で読み込めば、**ログインも通信もなしに** DOM 操作の
挙動を確認できる。`chrome.*` に依存する `utils/settings.js` は読み込まず、
`window.getSetting` / `saveSetting` などを自前のスタブで差し替えるのがコツ。

### 3.1 素材の置き場所と鮮度（1か月で取り直す）

| 置き場所 | 中身 |
|---|---|
| `target_site/captured/` | **スクリプトで採取した資料**。`pages/*.html`（画面）、`api/*.json`（APIレスポンス）、`manifest.json`（採取日時・元URL一覧） |
| `target_site/` 直下・`view/` | 手動で採取した古い資料。スクショ(PNG)やサイトのJS/CSS本体もここ |

`captured/` の資料が**1か月を超えたら取り直す**（サイトのDOM構造やAPIの形が変わっても
気づけないため）。使う前に鮮度を確認する:

```powershell
cd ouj-chromium-extension
npm run capture:check     # 通信なし。古い/未採取なら終了コード1
npm run capture:if-stale  # 1か月以上古いときだけ取り直す（古くなければ何もしない）
npm run capture           # 常に取り直す
```

採取は `tests/capture/capture-target-site.js`。**1回の実行でログインは1回**
（1つのブラウザで全ページを巡回する）なので、`npm run capture` を連打しないこと（§4.1）。
拡張機能を読み込まない状態で保存するため、`captured/pages/*.html` に `ouj-` 系の要素は
入っていない＝サイト素のDOMとして使える。ログインID・利用者番号は伏せ字にしてある。

`.env` の `OUJ_TEST_*` が未設定のページ（例: ラジオ科目の再生ページ）は採取がスキップされる。
不足しているものは `manifest.json` の `knownGaps` に書かれる。

```js
// scratchpad に置く使い捨てスクリプトの骨子（リポジトリには入れない）
const { chromium } = require(path.join(EXT, 'node_modules/@playwright/test'));
const page = await (await chromium.launch()).newPage();
await page.goto('file:///' + path.join(EXT, 'target_site/view/at_start.html').replace(/\\/g, '/'));
await page.addScriptTag({ content: `
  window.__store = {};
  window.getSetting = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.saveSetting = (k, v) => { window.__store[k] = v; };
  window.getBooleanSetting = (k, d) => d;
` });
for (const f of ['src/utils/page-type.js', 'src/対象ファイル.js']) {
  await page.addScriptTag({ content: fs.readFileSync(path.join(EXT, f), 'utf8') });
}
// あとは page.evaluate() で関数を呼び、DOMの結果を assert する
```

よく使う素材:

| 確認したいもの | 使うファイル |
|---|---|
| ヘッダーの検索欄・検索ボタン（`#searchText` / `button.search-button`） | `captured/pages/home.html`、`target_site/view/at_start.html` |
| 検索結果の一覧（絞り込み・並び替え・コンパクト表示・自動読み込み） | `captured/pages/search-result.html`（一覧は `#common-list-content`、純正の並び替えは `ion-item.sort`、続き読み込みは `ion-infinite-scroll`） |
| 科目一覧 / 回の一覧 | `captured/pages/series-select.html` / `captured/pages/video-select.html` |
| 動画再生ページ | `captured/pages/player-tv.html` |
| 未ログイン（ゲスト）時の見え方 | `captured/pages/home-guest.html` |
| カテゴリAPI・検索API・総件数API・字幕/ラジオ判定（`video-src/v3`）・視聴ログ | `captured/api/*.json`（ファイル名は元URL由来。対応表は `manifest.json`） |

画像やCSSの `ERR_FILE_NOT_FOUND` がコンソールに出るが、保存HTMLの参照切れなので無視してよい。

### 3.2 使い捨てにせず残す場合は `tests/offline/`

同じ方式でテストとして残すなら `tests/offline/` に置く。専用プロジェクト `offline`
（`npm run test:offline`）で回り、**ログインもブラウザ拡張の読み込みも不要**なので
何度実行してもよい。

| spec | 何を見ているか |
|---|---|
| [video-settings-sections.spec.js](tests/offline/video-settings-sections.spec.js) | 動画下部の設定パネルの各ブロックを表示オプションで隠せるか（採取済みHTMLを使う） |
| [store-description.spec.js](tests/offline/store-description.spec.js) | `投稿用.md` → `ストア説明.md` の生成（Markdownが残らないか・文字数上限・未公開の変更点を載せていないか）。ブラウザすら使わない |

---

## 4. 視覚回帰テスト（Playwright / 実サイトへアクセスする）

`tests/visual/` は**放送大学の実サイトへ実際にログインして**スクリーンショットを比較する。
サーバー負荷を避けるため `workers: 1` / `retries: 0` 固定。むやみに連続実行しない。

> **⚠️ 短時間に何度もログインするとアカウントがはじかれる**
>
> 放送大学側の制限で、ログインを繰り返すと一時的にログインできなくなる。
> 実サイトを使うテストは**「最後に1回だけ」**が原則。詳しくは §4.1。

### 4.1 ログイン回数を増やさない（重要）

ログインは**テストごとではなく「プロジェクトごとに1回」**行われる
（`tests/visual/fixtures.js` の `browserContext` が worker スコープで、その中で
`ensureLoggedIn` を1回呼ぶ。サイトのセッションがセッションCookieのため、
ブラウザプロセスを閉じるとログインし直しになる）。つまり**指定したプロジェクトの数＝
1回の実行でのログイン回数**（`popup-*` は実サイトを使わないので0回）。

| コマンド | ログイン回数 |
|---|---|
| `--project=offline`（`npm run test:offline`） | 0 |
| `--project=popup-desktop --project=popup-mobile` | 0 |
| `--project=desktop` | 1 |
| `--project=desktop --project=mobile` | 2 |
| `--project=drm-buffer`（`npm run test:buffer`） | 1 |
| `npm run test:visual`（DRM含む全プロジェクト） | 5 |

守ること:

- **まず §2・§3（構文チェックと `target_site` を使うオフライン確認）で詰める。**
  実サイトのテストは変更が固まってから最後に回す。
- **プロジェクトと対象specを絞る。** 変更に関係する範囲だけなら
  `--project=desktop tests/visual/player.spec.js` のように spec を指定すれば
  ログイン1回で済む。desktop と mobile の両方が必要かは毎回考える。
- **落ちたからといって気軽に再実行しない。** 再実行はそのままログイン回数の追加。
  失敗内容（特に1px差）を先に読み、自分の変更と関係し得るかを判断する。
- `--repeat-each` や `--retries` を足さない（設定は `retries: 0`）。
- ログインではじかれた/タイムアウトが続く場合は、**リトライを繰り返さずに時間を置く**。
  連続試行は状況を悪化させるだけ。`.env` の認証情報が正しいかも先に確認する。

### 認証情報

`.env`（git管理外。雛形は `.env.example`）に以下を書く。未設定の項目に依存する
テストは自動でスキップされる。

- `OUJ_TEST_USERNAME` / `OUJ_TEST_PASSWORD` … テスト用アカウント
- `OUJ_TEST_SERIES_CATEGORY_ID` / `OUJ_TEST_MULTI_VIDEO_CATEGORY_ID`
- `OUJ_TEST_TV_CONTENT_ID` / `OUJ_TEST_TV_CONTENT_CATEGORY_ID`
- `OUJ_TEST_RADIO_CONTENT_ID` / `OUJ_TEST_RADIO_CONTENT_CATEGORY_ID`（任意）
- `OUJ_TEST_CAPTION_CONTENT_ID` / `OUJ_TEST_CAPTION_CONTENT_CATEGORY_ID`（任意・DRM用）

### 実行

```powershell
cd ouj-chromium-extension

# 変更箇所だけを見る（ログイン1回）。基本はこれで足りる
npx playwright test --project=desktop tests/visual/player.spec.js --reporter=list

# ログイン不要なので何度でも回してよい
npx playwright test --project=popup-desktop --project=popup-mobile --reporter=list

# 一通り確認したいとき（ログイン2回）。頻繁には回さない
npx playwright test --project=popup-desktop --project=popup-mobile --project=desktop --project=mobile --reporter=list
```

プロジェクトの構成:

| プロジェクト | 対象 | 備考 |
|---|---|---|
| `offline` | `tests/offline/*.spec.js` | 採取済みHTMLだけで完結。ログイン不要。`npm run test:offline` |
| `popup-desktop` / `popup-mobile` | `popup.spec.js` | 実サイトへのログイン不要 |
| `desktop` / `mobile` | 上記以外（`subtitle-layout` を除く） | 実サイトへログインする |
| `drm-desktop` / `drm-mobile` | `subtitle-layout.spec.js` | **Microsoft Edge が必要**（DRM再生）。`npm run test:drm` |
| `drm-buffer` | `player-buffer.spec.js` | 先読み（バッファ）量の検証。同じくEdgeが必要。ログイン1回で済むよう1プロジェクトのみ。`npm run test:buffer` |

`npm run test:visual` は全プロジェクト（DRM含む）を回すので、DRM を検証しないときは
上のように `--project` を明示した方が速く、失敗ノイズも減る。

その他: `npm run test:visual:ui`（UIモード）、`npm run test:visual:update`（基準画像の更新）。

### 基準画像（スナップショット）は環境差・実行差で1pxずれる

「期待 52×30px → 実際 51×30px」のような **1px のサイズ差による失敗は日常的に起きる**
（フォント描画やスクロールバーの影響。実行のたびに落ちるテストが入れ替わることもある）。
これを自分の変更のせいだと早合点しないこと。

**失敗の切り分け手順（自分の変更が原因か確かめる）**

この確認にもログイン1回分かかる。失敗したテストが自分の変更と物理的に関係し得るか
（触っていないページ／機能ではないか）を先に考え、必要な場合だけ、**落ちたテストだけに
絞って**実行する。

```powershell
# 1) 自分が触ったファイルだけ退避してベースラインを測る
git stash push -m baseline -- <自分が編集したファイル...>
npx playwright test --project=desktop tests/visual/<落ちたspec>.js --reporter=list
# 2) 同じテストが同じ内容（同じピクセル数）で落ちるなら、自分の変更とは無関係
git stash pop
```

基準画像を焼き直すときは `npm run test:visual:update` を実行し、差分が意図した
UI変更だけであることを確認してからコミットする。

---

## 5. 拡張機能を手動で読み込んで確認する

Chrome の `chrome://extensions` →「デベロッパーモード」ON →「パッケージ化されていない
拡張機能を読み込む」で `ouj-chromium-extension/src` を指定する（`src/` が拡張のルート。
`manifest.json` がそこにある）。JS を編集したら拡張の再読み込み＋対象タブの再読み込みが必要。
