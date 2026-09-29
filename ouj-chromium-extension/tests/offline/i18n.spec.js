// 多言語化（src/utils/i18n.js と src/i18n/messages-*.js）の検証。
// ブラウザも実サイトも使わず、vm上にwindow/chrome/localStorageのスタブを作って動かす。
// 翻訳の追加・キー追加のたびに起きがちな「訳し漏れ」「プレースホルダの不一致」「未定義キーの参照」を検出する。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');

const SRC = path.join(__dirname, '..', '..', 'src');
const LANGS = ['ja', 'en', 'ko', 'zh_CN', 'zh_TW'];

/** i18n.js を読み込んだスタブ環境を作る。uiLanguage: ブラウザ言語、stored: chrome.storage.syncの保存値、mirror: localStorageのミラー */
function loadI18n({ uiLanguage = 'ja', stored, mirror } = {}) {
  const local = mirror ? { oujLanguage: mirror } : {};
  const changeListeners = [];
  const window = {};
  const sandbox = {
    window,
    document: {},
    navigator: { language: uiLanguage },
    localStorage: {
      getItem: (k) => (k in local ? local[k] : null),
      setItem: (k, v) => { local[k] = String(v); },
    },
    chrome: {
      i18n: { getUILanguage: () => uiLanguage },
      storage: {
        sync: {
          get: (keys, cb) => cb(stored === undefined ? {} : { language: stored }),
          set: (obj, cb) => cb && cb(),
        },
        onChanged: { addListener: (fn) => changeListeners.push(fn) },
      },
    },
    console,
  };
  vm.createContext(sandbox);
  for (const lang of LANGS) {
    vm.runInContext(fs.readFileSync(path.join(SRC, 'i18n', `messages-${lang}.js`), 'utf8'), sandbox);
  }
  vm.runInContext(fs.readFileSync(path.join(SRC, 'utils', 'i18n.js'), 'utf8'), sandbox);
  return { window, local, changeListeners };
}

const messages = loadI18n().window.OUJ_I18N_MESSAGES;
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');

test.describe('メッセージ定義', () => {
  for (const lang of LANGS.filter((l) => l !== 'ja')) {
    test(`${lang}: 日本語と同じキーを過不足なく持つ`, () => {
      const ja = Object.keys(messages.ja);
      const other = Object.keys(messages[lang]);
      expect(ja.filter((k) => !(k in messages[lang])), '訳し漏れのキー').toEqual([]);
      expect(other.filter((k) => !(k in messages.ja)), 'jaに無い余分なキー').toEqual([]);
    });

    test(`${lang}: プレースホルダが日本語と一致し、空文字の訳が無い`, () => {
      for (const key of Object.keys(messages.ja)) {
        const text = messages[lang][key];
        expect(text, `${lang} ${key} が空`).toBeTruthy();
        expect(placeholders(text), `${lang} ${key} の {…} が ja と不一致`).toBe(placeholders(messages.ja[key]));
      }
    });
  }

  test('ソース中で t(\'…\') が参照するキーは全て日本語に定義されている', () => {
    const missing = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'i18n' && entry.name !== '_locales') walk(full);
        } else if (entry.name.endsWith('.js') && !full.endsWith(path.join('utils', 'i18n.js'))) {
          const text = fs.readFileSync(full, 'utf8');
          for (const m of text.matchAll(/(?<![\w.])t\('([\w.-]+)'/g)) {
            if (!(m[1] in messages.ja)) missing.push(`${path.relative(SRC, full)}: ${m[1]}`);
          }
        }
      }
    };
    walk(SRC);
    expect(missing).toEqual([]);
  });
});

test.describe('言語の決定と t()', () => {
  test('設定が auto ならブラウザ言語に追従する', () => {
    const cases = { 'en-US': 'en', 'ko-KR': 'ko', 'ja-JP': 'ja', 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', 'zh-HK': 'zh_TW', 'zh-Hant': 'zh_TW', 'zh': 'zh_CN' };
    for (const [ui, expected] of Object.entries(cases)) {
      expect(loadI18n({ uiLanguage: ui }).window.oujI18n.getLanguage(), ui).toBe(expected);
    }
  });

  test('対応外のブラウザ言語は日本語になる', () => {
    expect(loadI18n({ uiLanguage: 'fr-FR' }).window.oujI18n.getLanguage()).toBe('ja');
  });

  test('手動設定はブラウザ言語より優先される', () => {
    const { window } = loadI18n({ uiLanguage: 'en-US', stored: 'ko' });
    expect(window.oujI18n.getLanguage()).toBe('ko');
    expect(window.t('common.cancel')).toBe(messages.ko['common.cancel']);
  });

  test('保存値はlocalStorageにミラーされ、次回起動時に同期で使われる', () => {
    const first = loadI18n({ uiLanguage: 'ja-JP', stored: 'zh_TW' });
    expect(first.local.oujLanguage).toBe('zh_TW');
    // storageの応答が遅れる状況を模して、ミラーだけがある状態で起動する
    const second = loadI18n({ uiLanguage: 'ja-JP', mirror: 'en', stored: 'en' });
    expect(second.window.oujI18n.getLanguage()).toBe('en');
  });

  test('ポップアップでの言語変更が開いているページへ伝わり、リスナーが呼ばれる', () => {
    const { window, changeListeners, local } = loadI18n({ uiLanguage: 'ja-JP' });
    const seen = [];
    window.oujI18n.onChange((lang) => seen.push(lang));
    changeListeners.forEach((fn) => fn({ language: { newValue: 'en' } }, 'sync'));
    expect(seen).toEqual(['en']);
    expect(window.t('common.cancel')).toBe(messages.en['common.cancel']);
    expect(local.oujLanguage).toBe('en');
    // 別の領域や別キーの変更は無視する
    changeListeners.forEach((fn) => fn({ language: { newValue: 'ko' } }, 'local'));
    expect(seen).toEqual(['en']);
  });

  test('訳が無いキーは日本語、日本語にも無ければキー名を返す', () => {
    const { window } = loadI18n({ uiLanguage: 'en-US' });
    window.OUJ_I18N_MESSAGES.ja['test.onlyJa'] = '日本語のみ';
    expect(window.t('test.onlyJa')).toBe('日本語のみ');
    expect(window.t('test.nowhere')).toBe('test.nowhere');
  });

  test('{param} を置換し、渡されなかったものはそのまま残す', () => {
    const { window } = loadI18n({ uiLanguage: 'en-US' });
    expect(window.t('progress.watched', { finished: 3, total: 15 })).toBe('3/15 watched');
    expect(window.t('progress.watched', { finished: 3 })).toBe('3/{total} watched');
  });
});
