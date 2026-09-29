// ポップアップページ（src/popup/popup.html）はログイン不要で単体表示できるため、
// 実サイトへは一切アクセスせずにスクリーンショットを撮影する。
const { test, expect } = require('./fixtures');

const THEMES = ['auto', 'light', 'dark'];

for (const theme of THEMES) {
  test(`ポップアップ - テーマ:${theme} - アコーディオン閉`, async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    // 表示言語は既定でブラウザ言語に追従するため、実行環境で画像が変わらないよう日本語に固定する
    await page.selectOption('#language-select', 'ja');
    await page.selectOption('#theme-select', theme);
    await page.waitForTimeout(200);
    await expect(page.locator('#popup-container')).toHaveScreenshot(
      `popup-${theme}-closed.png`
    );
  });

  test(`ポップアップ - テーマ:${theme} - ライセンスアコーディオン開`, async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    // 表示言語は既定でブラウザ言語に追従するため、実行環境で画像が変わらないよう日本語に固定する
    await page.selectOption('#language-select', 'ja');
    await page.selectOption('#theme-select', theme);
    await page.click('#licenses-header');
    await page.waitForTimeout(200);
    await expect(page.locator('#popup-container')).toHaveScreenshot(
      `popup-${theme}-open.png`
    );
  });
}

// 表示言語の切り替え。言語ごとに見出しが変わり、選択が保存されて再表示後も残ること
const LANGUAGE_TITLES = {
  ja: '放送大学授業ブラウザ',
  en: 'OUJ Lecture Browser',
  ko: 'OUJ 강의 브라우저',
  zh_CN: 'OUJ 课程浏览器',
  zh_TW: 'OUJ 課程瀏覽器',
};

for (const [lang, title] of Object.entries(LANGUAGE_TITLES)) {
  test(`ポップアップ - 表示言語:${lang}`, async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.selectOption('#language-select', lang);
    await expect(page.locator('h1')).toHaveText(title);
    await page.reload();
    await expect(page.locator('#language-select')).toHaveValue(lang);
    await expect(page.locator('h1')).toHaveText(title);
    // 他のテストに設定を持ち越さない
    await page.selectOption('#language-select', 'ja');
  });
}
