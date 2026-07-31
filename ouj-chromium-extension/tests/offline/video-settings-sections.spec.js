// 動画下部の設定パネルの各ブロックを、表示オプションで1つずつ隠せることを検証する。
//
// 実サイトへログインせず、採取済みの再生ページHTML（target_site/captured/pages/player-tv.html）を
// file:// で開き、必要なスクリプトだけを読み込んで組み立てる（TESTING.md §3 の方式）。
// ログイン回数を増やさずに回せるので、パネルを触ったときはまずこれを走らせること。
const fs = require('fs');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');

const EXT_ROOT = path.join(__dirname, '..', '..');
const CAPTURED_PLAYER_PAGE = path.join(EXT_ROOT, 'target_site', 'captured', 'pages', 'player-tv.html');

// 表示オプションのid -> パネル内コンテナのid。
// utils/display-options.js の selectors と page-video/video-settings.js の
// settingsSection() 呼び出しの対応表そのもの。ズレると「隠せない項目」が生まれる。
const SECTIONS = {
  'player-panel-speed': 'playback-speed-section',
  'player-ab-repeat': 'ab-repeat-container',
  'player-panel-caption': 'caption-settings-section',
  'player-panel-volume': 'volume-normalization-section',
  'player-panel-autoplay': 'autoplay-settings-section',
  'player-panel-next-source': 'next-video-source-section',
  'player-panel-skip': 'skip-settings-section',
  'player-panel-playlog': 'playlog-settings-section',
  'player-target-buffer': 'target-buffer-container',
  'player-panel-wake-lock': 'wake-lock-section',
  'player-panel-sleep-timer': 'sleep-timer-section',
};

// パネルの組み立てに必要なだけの依存を差し替える。
// 実サイトのプレイヤーや他ページの挿入処理まで動かす必要はないため、
// ここでは「呼ばれても何もしない」で十分（DOM構造の検証が目的）。
const STUB_SCRIPT = `
  window.getCurrentCategoryId = () => '1';
  window.insertPrevNextLinks = async () => {};
  window.insertEpisodeListMenu = async () => {};
  window.showCaptionAccordingToSetting = () => {};
  window.applyCaptionShrinkFix = () => {};
  window.toggleCaptionTv = () => {};
  window.toggleCaptionRadio = () => {};
  window.setPlaybackSpeed = () => {};
  window.startWakeLockManagement = () => {};
  window.releaseVideoWakeLock = () => {};
  window.applyVolumeNormalizationSetting = () => {};
  window.armSleepTimer = () => {};
  window.armSleepTimerEndOfEpisode = () => {};
  window.clearSleepTimer = () => {};
  window.getSleepTimerRemainingMinutes = () => 0;
  window.isSleepAtEpisodeEnd = () => false;
  window.insertAbRepeatControls = (container) => { container.innerHTML = '<div>A-B</div>'; };
`;

const SOURCE_FILES = [
  'src/utils/settings.js',
  'src/utils/dom-wait.js',
  'src/utils/display-options.js',
  'src/page-video/video-settings.js',
];

test.skip(
  !fs.existsSync(CAPTURED_PLAYER_PAGE),
  '採取済みの再生ページHTMLがありません。`npm run capture` で取得してください（TESTING.md §3.1）'
);

let browser;
let page;

test.beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  page.on('pageerror', (error) => {
    throw new Error(`ページ内でエラーが発生しました: ${error.message}`);
  });
});

test.afterAll(async () => {
  if (browser) await browser.close();
});

// 指定した表示オプションで設定パネルを組み立て直す。
async function buildPanel(displayOptions) {
  await page.goto('file:///' + CAPTURED_PLAYER_PAGE.replace(/\\/g, '/'));
  await page.addScriptTag({ content: STUB_SCRIPT });
  for (const file of SOURCE_FILES) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(EXT_ROOT, file), 'utf8') });
  }
  await page.evaluate((options) => {
    localStorage.setItem('displayOptions', JSON.stringify(options));
    window.applyOujDisplayOptionStyles();
    window.addVideoSettingsPanel();
  }, displayOptions);
  await page.waitForSelector('#video-settings-panel', { timeout: 5000 });
}

function sectionState(containerId) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return 'absent';
    return getComputedStyle(el).display === 'none' ? 'hidden' : 'visible';
  }, containerId);
}

test.describe('設定パネル内のブロックの表示オプション', () => {
  test('既定ではすべてのブロックが表示される', async () => {
    await buildPanel({});
    for (const containerId of Object.values(SECTIONS)) {
      expect(await sectionState(containerId), `${containerId} が表示されていません`).toBe('visible');
    }
  });

  test('オプションを外したブロックだけが消える', async () => {
    for (const [optionId, containerId] of Object.entries(SECTIONS)) {
      await buildPanel({ [optionId]: false });

      // 挿入時のゲートで、そのブロックだけがDOMに作られない
      expect(await sectionState(containerId), `${optionId} を外しても ${containerId} が残っています`).toBe('absent');

      // 他のブロックとパネル本体は影響を受けない
      for (const [otherOptionId, otherContainerId] of Object.entries(SECTIONS)) {
        if (otherOptionId === optionId) continue;
        expect(await sectionState(otherContainerId), `${optionId} を外したら ${otherContainerId} まで消えました`).toBe('visible');
      }
      await expect(page.locator('#video-settings-panel')).toBeVisible();
    }
  });

  test('区切り線は見えているブロックの境目にだけ引かれる', async () => {
    // ブロックを隠しても区切り線だけが残らないこと（<hr>を置かずCSSの境界線にしている理由）
    await buildPanel({ 'player-panel-speed': false, 'player-panel-caption': false });

    const borders = await page.evaluate(() =>
      [...document.querySelectorAll('#video-settings-panel .ouj-settings-section')]
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => getComputedStyle(el).borderTopWidth)
    );

    expect(borders.length).toBeGreaterThan(1);
    expect(borders[0], '先頭のブロックの上に区切り線が出ています').toBe('0px');
    expect(borders.slice(1).every((width) => width === '1px'), '2つ目以降のブロックに区切り線がありません').toBe(true);
    expect(await page.locator('#video-settings-panel hr').count()).toBe(0);
  });
});
