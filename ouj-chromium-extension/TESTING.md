# テスト手順（人間／エージェント共通）

このリポジトリのテストの走らせ方と、実行前にハマりやすい点をまとめる。
**「node が入っていない」と判断する前に、必ず §1 を読むこと。**

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

`target_site/` に実サイトの保存 HTML がある。Playwright で `file://` として開き、
content script を `addScriptTag` で読み込めば、**ログインも通信もなしに** DOM 操作の
挙動を確認できる。`chrome.*` に依存する `utils/settings.js` は読み込まず、
`window.getSetting` / `saveSetting` などを自前のスタブで差し替えるのがコツ。

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

`target_site/view/at_start.html` にはヘッダーの検索欄 `#searchText` と純正の検索ボタン
`button.search-button` があるので、検索まわりの確認に使える。
画像やCSSの `ERR_FILE_NOT_FOUND` がコンソールに出るが、保存HTMLの参照切れなので無視してよい。

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
| `--project=popup-desktop --project=popup-mobile` | 0 |
| `--project=desktop` | 1 |
| `--project=desktop --project=mobile` | 2 |
| `npm run test:visual`（DRM含む全プロジェクト） | 4 |

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
| `popup-desktop` / `popup-mobile` | `popup.spec.js` | 実サイトへのログイン不要 |
| `desktop` / `mobile` | 上記以外（`subtitle-layout` を除く） | 実サイトへログインする |
| `drm-desktop` / `drm-mobile` | `subtitle-layout.spec.js` | **Microsoft Edge が必要**（DRM再生）。`npm run test:drm` |

`npm run test:visual` は全プロジェクト（DRM含む）を回すので、DRM を検証しないときは
上のように `--project` を明示した方が速く、失敗ノイズも減る。

その他: `npm run test:visual:ui`（UIモード）、`npm run test:visual:update`（基準画像の更新）。

### 基準画像（スナップショット）は環境差・実行差で1pxずれる

「期待 52×30px → 実際 51×30px」のような **1px のサイズ差による失敗は日常的に起きる**
（フォント描画やスクロールバーの影響。実行のたびに落ちるテストが入れ替わることもある）。
これを自分の変更のせいだと早合点しないこと。

**失敗の切り分け手順（自分の変更が原因か確かめる）**

```powershell
# 1) 自分が触ったファイルだけ退避してベースラインを測る
git stash push -m baseline -- <自分が編集したファイル...>
npx playwright test --project=desktop --reporter=list
# 2) 同じテストが同じ内容で落ちるなら、自分の変更とは無関係
git stash pop
```

基準画像を焼き直すときは `npm run test:visual:update` を実行し、差分が意図した
UI変更だけであることを確認してからコミットする。

---

## 5. 拡張機能を手動で読み込んで確認する

Chrome の `chrome://extensions` →「デベロッパーモード」ON →「パッケージ化されていない
拡張機能を読み込む」で `ouj-chromium-extension/src` を指定する（`src/` が拡張のルート。
`manifest.json` がそこにある）。JS を編集したら拡張の再読み込み＋対象タブの再読み込みが必要。
