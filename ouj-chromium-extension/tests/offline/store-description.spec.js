// ストア説明.md の生成（tools/build-store-description.js）の検証。
// ブラウザも実サイトも使わない純粋なテキスト変換なので、ログインなしで回せる。
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const {
  buildStoreDescription,
  buildSummaryDraft,
  stampReleaseVersion,
  SOURCE_PATH,
  OUTPUT_PATH,
  DETAILED_DESCRIPTION_LIMIT,
  SUMMARY_LIMIT,
} = require('../../tools/build-store-description.js');

const sourceExists = fs.existsSync(SOURCE_PATH);
test.skip(!sourceExists, '投稿用.md がありません（git管理外のため、無い環境ではスキップします）');

const markdown = sourceExists ? fs.readFileSync(SOURCE_PATH, 'utf8') : '';

test.describe('ストア説明.mdの生成', () => {
  test('Markdown記法が残らない（ストアの説明欄はプレーンテキストのため）', () => {
    const description = buildStoreDescription(markdown);

    expect(description, 'リンク記法 [text](url) が残っています').not.toMatch(/\]\(https?:/);
    expect(description, '見出しの # が残っています').not.toMatch(/^#/m);
    // 行頭の「- 」はMarkdownの箇条書きの残り。
    // 全角スペースで字下げした「　- 」は、階層を見せるために意図して使っている表記なので許す
    expect(description, 'Markdownの箇条書き（行頭の -）が残っています').not.toMatch(/^-\s/m);
    expect(description, '強調の ** が残っています').not.toContain('**');
  });

  test('文字数がストアの上限に収まる', () => {
    const description = buildStoreDescription(markdown);
    expect(description.length).toBeLessThanOrEqual(DETAILED_DESCRIPTION_LIMIT);
    expect(buildSummaryDraft(description).length).toBeLessThanOrEqual(SUMMARY_LIMIT);
  });

  test('未公開の「次回リリース予定」は載せず、リリース版の変更点は載せる', () => {
    const description = buildStoreDescription(markdown);
    expect(description).not.toContain('次回リリース予定');
    expect(description, '「■ 変更点（バージョン）」が1つも出ていません').toMatch(/■ 変更点（[\d.]+）/);
  });

  test('--release でバージョンを入れると、その内容が変更点として載る', () => {
    const stamped = stampReleaseVersion(markdown, '9999.9.9');
    const description = buildStoreDescription(stamped);
    expect(description).toContain('■ 変更点（9999.9.9）');
    expect(description).not.toContain('次回リリース予定');
  });

  test('必要な見出しがそろっている', () => {
    const description = buildStoreDescription(markdown);
    for (const heading of ['■ 使い方・対応ブラウザ', '■ できること', '■ ご注意', '■ ご意見・不具合のご報告', '■ これまでの変更点']) {
      expect(description, `${heading} がありません`).toContain(heading);
    }
    // 自分自身のストアページへのリンクは載せない（他拡張へのリンクは残す）
    expect(description).not.toContain('mjphckgpnhhjfdpgkblomeiehjgeaagb');
  });

  test('生成済みの ストア説明.md が最新（ずれていたら npm run store）', () => {
    expect(fs.existsSync(OUTPUT_PATH), 'ストア説明.md がありません').toBe(true);
    expect(fs.readFileSync(OUTPUT_PATH, 'utf8')).toBe(buildStoreDescription(markdown));
  });
});
