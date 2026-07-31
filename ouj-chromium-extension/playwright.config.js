require('dotenv/config');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/visual',
  // 実サイト（放送大学）へのアクセスを伴うため、多重アクセスや再試行での
  // 余計なリクエストを避ける。
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: 'html',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // popup.spec.jsは実サイトへのログインが不要なため専用プロジェクトで実行する
    // （tests/visual/fixtures.js 側でプロジェクト名を見てログイン処理をスキップする）。
    {
      name: 'popup-desktop',
      testMatch: /popup\.spec\.js/,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'popup-mobile',
      testMatch: /popup\.spec\.js/,
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: 'desktop',
      testMatch: /.*\.spec\.js/,
      testIgnore: [/popup\.spec\.js/, /subtitle-layout\.spec\.js/, /player-buffer\.spec\.js/],
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile',
      testMatch: /.*\.spec\.js/,
      testIgnore: [/popup\.spec\.js/, /subtitle-layout\.spec\.js/, /player-buffer\.spec\.js/],
      use: {
        viewport: { width: 390, height: 844 },
      },
    },
    // DRM保護された動画を実際にデコードして検証するテスト専用プロジェクト。
    // Microsoft Edge(channel:'msedge')を使う必要があるため他と分離している
    // (詳細はtests/visual/fixtures.jsのisDrmProject()コメント参照)。
    // スクリーンショット比較(toHaveScreenshot)はブラウザ間でレンダリングが
    // 異なり不安定なため使わず、要素の位置関係(重なりの有無)のみ検証する。
    {
      name: 'drm-desktop',
      testMatch: /subtitle-layout\.spec\.js/,
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'drm-mobile',
      testMatch: /subtitle-layout\.spec\.js/,
      use: {
        viewport: { width: 390, height: 844 },
      },
    },
    // 先読み（バッファ）量の検証も実際のDRM動画の読み込みを見るためEdgeが要る。
    // ビューポート差は関係ない検証なので1プロジェクトだけ（＝ログインも1回だけ）にしている。
    {
      name: 'drm-buffer',
      testMatch: /player-buffer\.spec\.js/,
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
