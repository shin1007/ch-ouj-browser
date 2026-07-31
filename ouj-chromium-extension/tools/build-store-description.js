#!/usr/bin/env node
// 投稿用.md から、Chrome ウェブストアの「詳細な説明」にそのまま貼れる ストア説明.md を作る。
//
// なぜ変換が必要か:
//   ストアの説明欄は**プレーンテキスト**で、Markdownは一切解釈されない（`#`や`-`、
//   `[text](url)` がそのまま文字として出てしまう）。上限は16,000文字。
//   投稿用.md はGitHub等での読みやすさ優先なので、そのままでは貼れない。
//
// 何をどの順で載せるか:
//   紹介 → 使い方・対応ブラウザ → 直近の変更点 → できること → 不具合のご報告について
//   → 見送っていること → ご注意 → 連絡先 → これまでの変更点（長いので最後）
//   ストアを見に来た人が知りたい順（何ができるか → 使い方 → 履歴）に並べ替えている。
//   落とすのは「変更点（次回リリース予定）」（未公開のため）と、自分自身のストアページへの
//   リンク（ストア上では意味がないため）だけ。それ以外は投稿用.mdの内容をすべて載せる。
//
// 使い方:
//   node tools/build-store-description.js            … ストア説明.md を生成
//   node tools/build-store-description.js --check    … 生成物が最新か確認（差分があれば終了コード1）
//   node tools/build-store-description.js --release 2026.8.1
//        … 投稿用.md の「変更点（次回リリース予定）」を「変更点（2026.8.1）」に書き換えてから生成する。
//          バージョンを省略すると manifest.json の version を使う。リリース作業で使う。
//   （npm run store / npm run store:check / npm run store:release -- 2026.8.1）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, '投稿用.md');
const OUTPUT_PATH = path.join(ROOT, 'ストア説明.md');
const MANIFEST_PATH = path.join(ROOT, 'src', 'manifest.json');

// Chrome ウェブストアの入力欄の上限
const DETAILED_DESCRIPTION_LIMIT = 16000;
const SUMMARY_LIMIT = 132;

// 「■ 変更点」として上部に載せる最新版の数（それ以前は末尾の「これまでの変更点」に入る）
const CHANGELOG_SECTIONS_TO_INCLUDE = 2;

/**
 * Markdownのインラインリンクなどを、プレーンテキストとして読める形にする。
 * リンクは文の途中に入ることが多く、その場所にURLを展開すると文が読めなくなるため
 * （例:「こちらのページ https://… をブックマークすると…」）、表示テキストだけを文中に残し、
 * URLは行末にまとめる。
 */
function toPlainText(line) {
  const urls = [];
  const text = line
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, linkText, url) => {
      urls.push(url);
      return linkText.trim() === url ? '' : linkText;
    })
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trimEnd();
  const uniqueUrls = [...new Set(urls)];
  return [text.trim(), ...uniqueUrls].filter(Boolean).join(' ');
}

/** 箇条書き記号を、プレーンテキストで階層が分かる形に置き換える */
function toPlainListItem(line, forcedLevel) {
  const match = line.match(/^(\s*)[-*]\s+(.*)$/);
  if (!match) return toPlainText(line);
  const level = forcedLevel !== undefined ? forcedLevel : Math.floor(match[1].length / 2);
  const bullet = level === 0 ? '・' : `${'　'.repeat(level)}- `;
  return `${bullet}${toPlainText(match[2])}`;
}

/**
 * 投稿用.md を見出し単位に分解する。
 * @returns {Array<{level:number, title:string, lines:string[]}>} 出現順のセクション
 */
function parseSections(markdown) {
  const sections = [];
  let current = null;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^(#{2,3})\s*(.+?)\s*$/);
    if (heading) {
      current = { level: heading[1].length, title: heading[2].replace(/^【|】$/g, ''), lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(rawLine);
  }
  return sections;
}

// この拡張機能自身のストアページのID。ストアの説明欄に自分へのリンクを載せても意味がないので落とす。
// （他の拡張機能のストアページへのリンクは残す必要があるため、IDで判定している）
const OWN_STORE_EXTENSION_ID = 'mjphckgpnhhjfdpgkblomeiehjgeaagb';

/** 自分自身のストアページへのリンク行かどうか */
function isOwnStoreLink(line) {
  return line.includes(OWN_STORE_EXTENSION_ID);
}

/**
 * 冒頭セクション（タイトル直下）の行を、紹介文・使い方・連絡先に振り分ける。
 * 連絡先（X / GitHub）は末尾へ回した方がストアでは読みやすいため。
 */
function splitIntro(lines) {
  const lead = [];
  const usage = [];
  const contact = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || isOwnStoreLink(line)) continue;
    if (line.includes('x.com/') || line.includes('github.com/')) {
      contact.push(`・${toPlainText(line.replace(/^[-*・]\s*/, ''))}`);
      continue;
    }
    // 投稿用.mdの冒頭では「・」が見出し的な行、「-」がその下にぶら下がる行という使い分けなので、
    // それぞれ第1階層・第2階層として扱う
    if (line.startsWith('・')) {
      usage.push(toPlainListItem(line.replace(/^・\s*/, '- '), 0));
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      usage.push(toPlainListItem(line, 1));
      continue;
    }
    lead.push(toPlainText(line));
  }
  return { lead, usage, contact };
}

/** 箇条書き中心のセクション本文をプレーンテキスト化する */
function renderBody(lines) {
  const out = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (isOwnStoreLink(line)) continue;
    // 投稿用.mdでは文が長いとき、リンクだけを次の行に折り返していることがある
    // （例:「キーボードショートカットは」＋改行＋「[こういったものを…](URL)」）。
    // プレーンテキストでは行が切れると意味が通らないので、前の行につなげる。
    if (line.startsWith('[') && out.length && out[out.length - 1] !== '') {
      out[out.length - 1] = `${out[out.length - 1]} ${toPlainText(line)}`;
      continue;
    }
    out.push(/^[-*]\s/.test(line) ? toPlainListItem(rawLine) : toPlainText(line));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

/** ストアの「詳細な説明」用テキストを組み立てる */
function buildStoreDescription(markdown) {
  const sections = parseSections(markdown);
  if (!sections.length) throw new Error('投稿用.md から見出しを1つも読み取れませんでした');

  const title = sections[0].title;
  const { lead, usage, contact } = splitIntro(sections[0].lines);

  // 「## 過去の変更点」以降の変更点は載せない（古い履歴で文字数を食うだけのため）。
  // 「次回リリース予定」もまだ公開されていない内容なので載せない
  // （リリース時は --release でバージョン番号を入れてから生成する。そこで自動的に載る）。
  const pastChangelogIndex = sections.findIndex((section) => section.title === '過去の変更点');
  const changelogs = sections
    .slice(0, pastChangelogIndex >= 0 ? pastChangelogIndex : sections.length)
    .filter((section) => section.title.startsWith('変更点') && !section.title.includes('次回リリース予定'))
    .slice(0, CHANGELOG_SECTIONS_TO_INCLUDE);

  const notes = sections.find((section) => section.title === '注意事項');

  const blocks = [];
  blocks.push(title, '', ...lead);

  if (usage.length) blocks.push('', '■ 使い方・対応ブラウザ', ...usage);

  for (const changelog of changelogs) {
    const label = changelog.title.replace(/^変更点\s*[（(]?/, '').replace(/[）)]$/, '');
    blocks.push('', `■ 変更点（${label}）`, ...renderBody(changelog.lines));
  }

  // 「## 見出し」とその配下の「### 小見出し」をまとめて1ブロックにする
  const appendSectionWithChildren = (sourceTitle, heading) => {
    const parentIndex = sections.findIndex((section) => section.title === sourceTitle);
    if (parentIndex < 0) return;
    const rendered = [];
    const parentBody = renderBody(sections[parentIndex].lines);
    if (parentBody.length) rendered.push(...parentBody);
    for (let i = parentIndex + 1; i < sections.length && sections[i].level > 2; i++) {
      const childBody = renderBody(sections[i].lines);
      if (!childBody.length) continue;
      rendered.push('', `◆ ${sections[i].title}`, ...childBody);
    }
    if (rendered.length) blocks.push('', heading, ...rendered);
  };

  appendSectionWithChildren('現在の機能', '■ できること');
  appendSectionWithChildren('今後、変更したいこと', '■ 不具合のご報告について');
  appendSectionWithChildren('実装しようとしてあきらめたこと', '■ 検討したうえで見送っていること');

  if (notes) blocks.push('', '■ ご注意', ...renderBody(notes.lines));
  if (contact.length) blocks.push('', '■ ご意見・不具合のご報告', ...contact);
  // 履歴は読み飛ばせるよう最後に置く
  appendSectionWithChildren('過去の変更点', '■ これまでの変更点');

  // 空行が3つ以上続かないように整える
  const text = blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return `${text}\n`;
}

/** ストアの「概要」欄（132文字）の下書き。冒頭の紹介文から作る */
function buildSummaryDraft(description) {
  const lead = description.split('\n').slice(1).find((line) => line.trim());
  if (!lead) return '';
  return lead.length <= SUMMARY_LIMIT ? lead : `${lead.slice(0, SUMMARY_LIMIT - 1)}…`;
}

/** リリース時に「変更点（次回リリース予定）」へバージョン番号を入れる */
function stampReleaseVersion(markdown, version) {
  const heading = /^###\s*変更点（次回リリース予定）\s*$/m;
  if (!heading.test(markdown)) {
    console.warn('※「変更点（次回リリース予定）」が見つからないため、バージョンの書き込みは行いませんでした');
    return markdown;
  }
  return markdown.replace(heading, `### 変更点（${version}）`);
}

function readManifestVersion() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).version;
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const releaseIndex = args.indexOf('--release');

  let markdown = fs.readFileSync(SOURCE_PATH, 'utf8');

  if (releaseIndex >= 0) {
    if (isCheck) {
      console.error('--release と --check は同時に使えません');
      process.exit(2);
    }
    const version = args[releaseIndex + 1] && !args[releaseIndex + 1].startsWith('--')
      ? args[releaseIndex + 1]
      : readManifestVersion();
    const stamped = stampReleaseVersion(markdown, version);
    if (stamped !== markdown) {
      fs.writeFileSync(SOURCE_PATH, stamped);
      console.log(`投稿用.md: 「変更点（次回リリース予定）」→「変更点（${version}）」に更新しました`);
    }
    markdown = stamped;
  }

  const description = buildStoreDescription(markdown);

  if (isCheck) {
    const current = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : null;
    if (current !== description) {
      console.error('ストア説明.md が投稿用.md と一致していません。`npm run store` を実行してください。');
      process.exit(1);
    }
    console.log('ストア説明.md は最新です。');
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, description);

  const length = description.length;
  console.log(`ストア説明.md を生成しました（${length} 文字 / 上限 ${DETAILED_DESCRIPTION_LIMIT} 文字）`);
  if (length > DETAILED_DESCRIPTION_LIMIT) {
    console.error(`※ 上限を ${length - DETAILED_DESCRIPTION_LIMIT} 文字超えています。載せる変更点を減らしてください。`);
    process.exit(1);
  }
  console.log('');
  console.log(`概要欄（${SUMMARY_LIMIT}文字）の下書き:`);
  console.log(`  ${buildSummaryDraft(description)}`);
}

if (require.main === module) {
  main();
}

// テスト（tests/offline/store-description.spec.js）から使う
module.exports = {
  buildStoreDescription,
  buildSummaryDraft,
  stampReleaseVersion,
  SOURCE_PATH,
  OUTPUT_PATH,
  DETAILED_DESCRIPTION_LIMIT,
  SUMMARY_LIMIT,
};
