// 実サイトを使わないロジック確認(TESTING.md §3)のための素材を、実サイトから
// まとめて取得して target_site/captured/ に保存するスクリプト。
//
// 【なぜ必要か】
// target_site/ 直下と view/ にある保存HTML/JSONは手動で採取したもので、検索結果ページ
// (search-result)や検索系API(vod-contents?q=…、count)など、後から追加した機能が使う
// データが欠けている。ここで機械的に採取し、いつ採った資料かを manifest.json に残す。
//
// 【ログイン回数】
// 1回の実行につきログインは1回だけ(1つのブラウザプロセスで全ページを巡回する)。
// 実サイトのログインは短時間に繰り返すとはじかれるため、むやみに再実行しないこと
// (TESTING.md §4.1)。資料が新しいうちは --if-stale が何もせず終了する。
//
// 【使い方】
//   node tests/capture/capture-target-site.js --check      # 鮮度の確認だけ(通信なし)
//   node tests/capture/capture-target-site.js --if-stale   # 1か月以上古いときだけ取り直す
//   node tests/capture/capture-target-site.js              # 常に取り直す
//
// 拡張機能は読み込まずに採取する(サイト素のDOMを保存するため)。ログインIDなどの
// 個人情報は保存前に伏せ字へ置き換える。
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { ensureLoggedIn } = require('../visual/auth');

const EXT_ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(EXT_ROOT, 'target_site', 'captured');
const PAGES_DIR = path.join(OUT_DIR, 'pages');
const API_DIR = path.join(OUT_DIR, 'api');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');

// 資料の賞味期限。サイトのDOM構造やAPIの形が変わっていても気づけないため、
// 1か月を超えたら取り直す
const MAX_AGE_DAYS = 30;

const VIEW = 'https://v.ouj.ac.jp/view/ouj/#/navi';
// 検索結果は「件数が多く、複数の科目にまたがる」語を使う。1科目にまとまらないと
// コンパクト表示(同じ科目の回をまとめる)や自動読み込みの確認に使えないため
const SEARCH_KEYWORD = '心理';

const MASK = 'XXXXXXXXXX';

function daysSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    return null;
  }
}

// 資料が無い/古いか。理由の文字列も返す(古くなければ null)
function stalenessReason() {
  const manifest = readManifest();
  if (!manifest || !manifest.capturedAt) return 'まだ採取していない(target_site/captured/manifest.json が無い)';
  const age = daysSince(manifest.capturedAt);
  if (age > MAX_AGE_DAYS) {
    return `採取から${age.toFixed(0)}日経過(上限${MAX_AGE_DAYS}日)。採取日時: ${manifest.capturedAt}`;
  }
  return null;
}

// 個人情報を伏せる。保存物はリポジトリに入るため必須。
// - ログインID(学生番号) … ヘッダーの表示や users/own のuserIdに出る
// - userNo … サイト内部の利用者番号(users/own)。個人を指す値なので0にする
function maskPersonalInfo(text) {
  const username = process.env.OUJ_TEST_USERNAME;
  const masked = username ? text.split(username).join(MASK) : text;
  return masked.replace(/"userNo"\s*:\s*\d+/g, '"userNo":0');
}

// URLからファイル名を作る。/v1/tenants/1/ 以下のパスとクエリを平坦化する
function apiFileName(url) {
  const u = new URL(url);
  const base = `${u.pathname.replace(/^\/v1\/tenants\/\d+\//, '')}${u.search}`;
  return `${base.replace(/[^A-Za-z0-9._=&-]/g, '_').slice(0, 120)}.json`;
}

function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, maskPersonalInfo(text), 'utf8');
}

// 採取対象のページ。selectorはそのページが描画し終わったことの目印
function buildPageTargets(env) {
  const targets = [
    {
      name: 'home',
      url: `${VIEW}/home`,
      selector: 'common-header',
      note: 'ホーム画面(ログイン済み)',
    },
    {
      name: 'search-result',
      url: `${VIEW}/vod?se=${encodeURIComponent(SEARCH_KEYWORD)}`,
      selector: '#common-list-content',
      note: `検索結果(キーワード「${SEARCH_KEYWORD}」)。絞り込み/コンパクト表示/自動読み込みの確認用`,
    },
  ];
  if (env.OUJ_TEST_SERIES_CATEGORY_ID) {
    targets.push({
      name: 'series-select',
      url: `${VIEW}/vod?ca=${env.OUJ_TEST_SERIES_CATEGORY_ID}`,
      selector: '#common-list-content',
      note: '科目一覧(コース配下)',
    });
  }
  if (env.OUJ_TEST_MULTI_VIDEO_CATEGORY_ID) {
    targets.push({
      name: 'video-select',
      url: `${VIEW}/vod?ca=${env.OUJ_TEST_MULTI_VIDEO_CATEGORY_ID}`,
      selector: '#common-list-content',
      note: '回の一覧(1科目)',
    });
  }
  if (env.OUJ_TEST_TV_CONTENT_ID) {
    const ca = env.OUJ_TEST_TV_CONTENT_CATEGORY_ID ? `&ca=${env.OUJ_TEST_TV_CONTENT_CATEGORY_ID}` : '';
    targets.push({
      name: 'player-tv',
      url: `${VIEW}/player?co=${env.OUJ_TEST_TV_CONTENT_ID}&ct=V${ca}`,
      selector: 'video, .video-area',
      note: '動画再生ページ(テレビ科目)',
    });
  }
  if (env.OUJ_TEST_RADIO_CONTENT_ID) {
    const ca = env.OUJ_TEST_RADIO_CONTENT_CATEGORY_ID ? `&ca=${env.OUJ_TEST_RADIO_CONTENT_CATEGORY_ID}` : '';
    targets.push({
      name: 'player-radio',
      url: `${VIEW}/player?co=${env.OUJ_TEST_RADIO_CONTENT_ID}&ct=V${ca}`,
      selector: 'video, .video-area',
      note: '動画再生ページ(ラジオ科目)',
    });
  }
  return targets;
}

// ページのDOMを保存する。Angularの描画待ちはselector＋短い静定待ちで済ませる
async function capturePage(page, target, results) {
  process.stdout.write(`  ${target.name} … `);
  await page.goto(target.url, { waitUntil: 'domcontentloaded' });
  let rendered = true;
  try {
    await page.waitForSelector(target.selector, { state: 'attached', timeout: 20000 });
  } catch (e) {
    rendered = false;
  }
  // 一覧の遅延描画やサムネイル読み込みが一段落するのを待つ
  await page.waitForTimeout(2500);

  // ヘッダーに出るログインID(学生番号)を伏せる
  await page.evaluate((mask) => {
    document.querySelectorAll('.user-id-menu ion-label.user-id, .user-id').forEach((el) => {
      el.textContent = mask;
    });
  }, MASK);

  const html = await page.content();
  const file = path.join(PAGES_DIR, `${target.name}.html`);
  writeFile(file, html);
  results.push({
    name: target.name,
    file: path.relative(OUT_DIR, file).replace(/\\/g, '/'),
    url: target.url,
    note: target.note,
    renderedMarker: rendered,
    bytes: fs.statSync(file).size,
  });
  console.log(rendered ? 'OK' : 'OK(目印セレクタは出現せず)');
}

async function capture() {
  const env = process.env;
  if (!env.OUJ_TEST_USERNAME || !env.OUJ_TEST_PASSWORD) {
    throw new Error('.env に OUJ_TEST_USERNAME / OUJ_TEST_PASSWORD が必要です(.env.example 参照)');
  }

  // 拡張機能は読み込まない。保存したいのはサイト素のDOMのため
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const apiResponses = new Map();

  // ページを巡回している間に流れるAPIレスポンスをそのまま保存する。
  // URLの組み立て方(パラメータ)を推測せずに済み、実際の形が確実に手に入る
  context.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/v1/tenants/')) return;
    if (url.includes('/thumbnail')) return;
    if (!response.ok()) return;
    const type = response.headers()['content-type'] || '';
    if (!type.includes('json')) return;
    try {
      apiResponses.set(url, await response.text());
    } catch (e) { /* 本文を読めないレスポンスは捨てる */ }
  });

  const pages = [];
  const startedAt = new Date().toISOString();
  try {
    // 未ログイン(ゲスト)のホーム。ログイン前なのでログイン回数は増えない。
    // 拡張機能はゲスト時に表示を変える箇所があるため資料として要る
    const guest = await context.newPage();
    await capturePage(guest, {
      name: 'home-guest',
      url: `${VIEW}/home`,
      selector: 'common-header button.login-button',
      note: 'ホーム画面(未ログイン=ゲスト)',
    }, pages);
    await guest.close();

    console.log('  ログイン中 …');
    await ensureLoggedIn(context);

    const page = await context.newPage();
    for (const target of buildPageTargets(env)) {
      await capturePage(page, target, pages);
    }

    // 検索結果の2ページ目(offset=30)。無限スクロールを実際に発火させるのは条件が
    // シビアなので(page-search-result-autoload.jsのコメント参照)、ページ内から
    // 同じURLを直接fetchして採る。同一オリジンなのでセッションはそのまま効く
    process.stdout.write('  検索の2ページ目(offset=30) … ');
    const nextPageUrl = `https://v.ouj.ac.jp/v1/tenants/1/vod-contents?q=${encodeURIComponent(SEARCH_KEYWORD)}&qt=4&offset=30&limit=30&sortType=1&sortOrder=asc`;
    await page.evaluate((url) => fetch(url, { credentials: 'include' }).then((r) => r.text()), nextPageUrl);
    await page.waitForTimeout(1000);
    console.log('OK');
    await page.close();
  } finally {
    await context.close();
    await browser.close();
  }

  // APIレスポンスを書き出す
  fs.rmSync(API_DIR, { recursive: true, force: true });
  const api = [];
  for (const [url, body] of apiResponses) {
    const file = path.join(API_DIR, apiFileName(url));
    writeFile(file, body);
    api.push({
      file: path.relative(OUT_DIR, file).replace(/\\/g, '/'),
      url,
      bytes: fs.statSync(file).size,
    });
  }
  api.sort((a, b) => a.file.localeCompare(b.file));

  const manifest = {
    capturedAt: new Date().toISOString(),
    startedAt,
    maxAgeDays: MAX_AGE_DAYS,
    generatedBy: 'tests/capture/capture-target-site.js',
    note: [
      '実サイトから機械的に採取した資料。拡張機能本体ではない(参照用)。',
      '拡張機能を読み込まない状態のDOMなので、ここに ouj- 系の要素は含まれない。',
      'ログインID(学生番号)は伏せ字に置換済み。',
      `${MAX_AGE_DAYS}日を超えたら取り直すこと(npm run capture:check で確認できる)。`,
    ],
    searchKeyword: SEARCH_KEYWORD,
    pages,
    api,
  };
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\nページ ${pages.length}件 / API ${api.length}件を ${path.relative(EXT_ROOT, OUT_DIR)} に保存しました。`);
}

async function main() {
  const args = process.argv.slice(2);
  const reason = stalenessReason();

  if (args.includes('--check')) {
    if (reason) {
      console.log(`資料が古い/未採取です: ${reason}`);
      console.log('取り直す場合: npm run capture （実サイトへのログインが1回発生します）');
      process.exitCode = 1;
      return;
    }
    const manifest = readManifest();
    console.log(`資料は最新です(採取: ${manifest.capturedAt} / ${daysSince(manifest.capturedAt).toFixed(1)}日前)`);
    return;
  }

  if (args.includes('--if-stale') && !reason) {
    const manifest = readManifest();
    console.log(`資料は${daysSince(manifest.capturedAt).toFixed(1)}日前のものなので取得をスキップしました。`);
    return;
  }
  if (reason) console.log(`取り直します: ${reason}`);

  await capture();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
