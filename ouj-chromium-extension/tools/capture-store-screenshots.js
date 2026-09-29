#!/usr/bin/env node
// ストア掲載用のスクリーンショットを、対応5言語ぶん撮り直す。
//
// 使い方: node tools/capture-store-screenshots.js [出力先ディレクトリ] [--langs=ja,en]
//   出力先の既定は store/assets/locales 。<出力先>/<言語>/screenshots/01.png〜05.png に書く。
//
// 実サイトへログインする（.env の OUJ_TEST_*）。ログインは**1回だけ**（全言語を同じブラウザで撮る）。
// 拡張機能のデータ（お気に入り・履歴など）はテスト用アカウントに無いので localStorage に仕込む。
// 仕込むのはブラウザ内のlocalStorageだけで、放送大学のサーバーには何も書き込まない。
//
// 画面: 01 科目一覧 / 02 お気に入り / 03 履歴 / 04 表示オプション / 05 動画ページの設定パネル
// サイズは 1280x800（ストアの規定）、アルファなしのPNG（page.screenshot はアルファを付けない）。
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { ensureLoggedIn } = require('../tests/visual/auth');
const { gotoHome, gotoSeriesSelect, gotoPlayer, ensureSideMenuOpen, BASE_URL } = require('../tests/visual/helpers');

const ROOT = path.join(__dirname, '..');
const EXTENSION_PATH = path.join(ROOT, 'src');
const ALL_LANGS = ['ja', 'en', 'ko', 'zh_CN', 'zh_TW'];

const args = process.argv.slice(2);
const langsArg = args.find((a) => a.startsWith('--langs='));
const LANGS = langsArg ? langsArg.slice(8).split(',') : ALL_LANGS;
const outRoot = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(ROOT, 'store', 'assets', 'locales'));

const env = process.env;
const SERIES_ID = env.OUJ_TEST_SERIES_CATEGORY_ID || '7';
const MULTI_ID = env.OUJ_TEST_MULTI_VIDEO_CATEGORY_ID;
const TV_ID = env.OUJ_TEST_TV_CONTENT_ID;
const TV_CATEGORY = env.OUJ_TEST_TV_CONTENT_CATEGORY_ID;

async function setLanguage(context, page, lang) {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  await sw.evaluate((l) => chrome.storage.sync.set({ language: l }), lang);
  await page.evaluate((l) => localStorage.setItem('oujLanguage', l), lang);
}

async function openOverlay(page, itemId) {
  await ensureSideMenuOpen(page);
  await page.locator(`#${itemId}:visible`).first().click();
  const overlay = page.locator('#ouj-native-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(2500); // サムネイル・一覧の描画待ち
}

async function main() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  try {
    await ensureLoggedIn(context);
    const page = await context.newPage();

    // 履歴・あとで見るに入れる動画IDを、複数本ある科目のページから拾う
    let contentIds = [];
    if (MULTI_ID) {
      await gotoSeriesSelect(page, MULTI_ID);
      await page.waitForTimeout(3000);
      contentIds = await page.$$eval('[data-content-id]', (els) => [...new Set(els.map((e) => e.getAttribute('data-content-id')).filter(Boolean))]);
    }
    if (TV_ID && !contentIds.includes(TV_ID)) contentIds.unshift(TV_ID);
    contentIds = contentIds.slice(0, 6);
    console.log('履歴に仕込む動画ID:', contentIds.join(', '));

    const favorites = [SERIES_ID, MULTI_ID, TV_CATEGORY].filter(Boolean).map(String);
    const now = Date.now();
    await gotoHome(page);
    await page.evaluate(
      ({ favorites, contentIds, now }) => {
        localStorage.setItem('favorites', JSON.stringify(favorites));
        localStorage.setItem('pinnedFavorites', JSON.stringify(favorites.slice(0, 1)));
        localStorage.setItem(
          'history',
          JSON.stringify(contentIds.map((contentId, i) => ({ contentId, date: new Date(now - i * 3600 * 1000 * 5).toISOString() })))
        );
        localStorage.setItem('displayOptions', '{}');
        localStorage.removeItem('displayOptions');
      },
      { favorites, contentIds, now }
    );

    for (const lang of LANGS) {
      const dir = path.join(outRoot, lang, 'screenshots');
      fs.mkdirSync(dir, { recursive: true });
      const shot = async (n) => {
        await page.screenshot({ path: path.join(dir, `${n}.png`) });
        console.log(`${lang}/${n}.png`);
      };

      await gotoHome(page);
      await setLanguage(context, page, lang);

      await gotoSeriesSelect(page, SERIES_ID);
      await page.reload();
      await page.locator('ion-list[aria-label]').first().waitFor({ state: 'attached', timeout: 15000 });
      await page.waitForTimeout(4000);
      await ensureSideMenuOpen(page);
      await shot('01');

      await gotoHome(page);
      await page.waitForTimeout(1500);
      await openOverlay(page, 'favorites-menu-item');
      await shot('02');

      await gotoHome(page);
      await page.waitForTimeout(1500);
      await openOverlay(page, 'history-menu-item');
      await shot('03');

      await gotoHome(page);
      await page.waitForTimeout(1500);
      await openOverlay(page, 'displayoptions-menu-item');
      await shot('04');

      await gotoPlayer(page, TV_ID, TV_CATEGORY);
      await page.locator('#video-settings-panel').waitFor({ state: 'visible', timeout: 20000 });
      await page.waitForTimeout(2500);
      await page.locator('#video-settings-panel').scrollIntoViewIfNeeded();
      await shot('05');
    }
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
