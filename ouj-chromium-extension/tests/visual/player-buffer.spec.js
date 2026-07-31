// 先読み（バッファ）量の設定（src/player-buffer-patch.js + 設定パネルの #target-buffer）を
// 実サイトの動画上で検証する。
//
// 実際にセグメントがバッファされるところまで見たいので、DRM動画をデコードできる環境が要る。
// そのため subtitle-layout.spec.js と同じくMicrosoft Edge(channel:'msedge')を使う専用
// プロジェクト(drm-buffer)でのみ実行する（playwright.config.js / fixtures.js 参照）。
//
// 実サイトへの負荷を抑えるため、動画を開くのは各テスト1本ずつ・再生も短時間に留める。
const { test, expect } = require('./fixtures');
const { gotoPlayer } = require('./helpers');

const tvContentId = process.env.OUJ_TEST_TV_CONTENT_ID;
const tvCategoryId = process.env.OUJ_TEST_TV_CONTENT_CATEGORY_ID;

// THEOplayerの既定の先読み量（秒）。拡張が「標準」のときはこの値のままであること。
const SITE_DEFAULT_TARGET_BUFFER = 20;

test.skip(
  !tvContentId || !tvCategoryId,
  '.env に OUJ_TEST_TV_CONTENT_ID / OUJ_TEST_TV_CONTENT_CATEGORY_ID を設定してください（.env.example参照）'
);

async function waitForVideoPlaying(page) {
  await page.waitForFunction(() => {
    const v = document.querySelector('.theoplayer-container video');
    return !!(v && v.videoWidth > 0);
  }, { timeout: 20000 });
}

// page.evaluateはMAIN world（サイト自身のJSと同じ世界）で動くため、
// player-buffer-patch.jsが触っているのと同じTHEOplayerインスタンスを直接読める。
function readTargetBuffer(page) {
  return page.evaluate(() => {
    const players = window.THEOplayer && window.THEOplayer.players;
    if (!players || !players.length) return null;
    return players[0].abr.targetBuffer;
  });
}

// 設定パネルで秒数を選び、patch側のポーリング(2秒間隔)が反映するまで待つ。
async function selectTargetBufferSeconds(page, value) {
  const select = page.locator('#target-buffer');
  await select.waitFor({ state: 'visible', timeout: 15000 });
  await select.selectOption(value);
  await page.waitForFunction(
    (expected) => {
      const players = window.THEOplayer && window.THEOplayer.players;
      return !!(players && players.length) && players[0].abr.targetBuffer === expected;
    },
    Number(value) > 0 ? Number(value) : SITE_DEFAULT_TARGET_BUFFER,
    { timeout: 10000 }
  );
}

// 現在の再生位置から先に、連続して貯まっているバッファの秒数。
function getBufferedAheadSeconds(page) {
  return page.evaluate(() => {
    const v = document.querySelector('.theoplayer-container video');
    if (!v || !v.buffered || !v.buffered.length) return 0;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= v.currentTime) {
        return v.buffered.end(i) - v.currentTime;
      }
    }
    return 0;
  });
}

test.describe('先読み（バッファ）量の設定', () => {
  // localStorageはブラウザプロファイル単位で共有され、テスト間で持ち越される。
  // 各テストが「標準」から始まるように、毎回明示的に初期化する。
  test.beforeEach(async ({ page }) => {
    await page.goto('https://v.ouj.ac.jp/view/ouj/#/navi/home');
    await page.evaluate(() => localStorage.removeItem('videoTargetBufferSeconds'));
  });

  test('既定（標準）ではサイトの先読み量を変更しない', async ({ page }) => {
    await gotoPlayer(page, tvContentId, tvCategoryId);
    await waitForVideoPlaying(page);
    // patch側のポーリング1周ぶんを待ってもなお既定のままであることを見る
    await page.waitForTimeout(3000);

    expect(await readTargetBuffer(page)).toBe(SITE_DEFAULT_TARGET_BUFFER);
  });

  test('3分を選ぶとtargetBufferに反映され、標準に戻すと元の値に戻る', async ({ page }) => {
    await gotoPlayer(page, tvContentId, tvCategoryId);
    await waitForVideoPlaying(page);

    await selectTargetBufferSeconds(page, '180');
    expect(await readTargetBuffer(page)).toBe(180);

    // 同じプレイヤーインスタンスのまま「標準」へ戻す（WeakMapに退避した元値の復元）
    await selectTargetBufferSeconds(page, '0');
    expect(await readTargetBuffer(page)).toBe(SITE_DEFAULT_TARGET_BUFFER);
  });

  test('先読みを増やすと実際に既定(約20秒)より多く貯まる', async ({ page }) => {
    await gotoPlayer(page, tvContentId, tvCategoryId);
    await waitForVideoPlaying(page);

    // まず「標準」のまま貯まり方を見る。既定の20秒を大きく超えないことが前提。
    await page.evaluate(() => {
      const v = document.querySelector('.theoplayer-container video');
      if (v) { v.muted = true; v.play().catch(() => {}); }
    });
    await page.waitForTimeout(8000);
    const aheadWithDefault = await getBufferedAheadSeconds(page);

    await selectTargetBufferSeconds(page, '180');

    // 先読みが増えるのを待つ。回線・配信側の速度に依存するため、
    // 「既定より明らかに多い」ことが確認できた時点で打ち切る。
    const grew = await page
      .waitForFunction(() => {
        const v = document.querySelector('.theoplayer-container video');
        if (!v || !v.buffered || !v.buffered.length) return false;
        for (let i = 0; i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= v.currentTime) {
            return v.buffered.end(i) - v.currentTime > 40;
          }
        }
        return false;
      }, undefined, { timeout: 90000 })
      .then(() => true)
      .catch(() => false);

    const aheadWithBoost = await getBufferedAheadSeconds(page);
    console.log(`先読み: 標準=${aheadWithDefault.toFixed(1)}秒 / 3分設定=${aheadWithBoost.toFixed(1)}秒`);

    expect(grew, `先読みが伸びませんでした（標準=${aheadWithDefault.toFixed(1)}秒 / 3分設定=${aheadWithBoost.toFixed(1)}秒）`).toBe(true);
    expect(aheadWithBoost).toBeGreaterThan(aheadWithDefault);
  });
});
