/**
 * 多言語化（i18n）の共通ロジック。コンテンツスクリプト・ポップアップの両方から読み込まれる。
 *
 * 文字列は i18n/messages-<言語>.js が window.OUJ_I18N_MESSAGES[言語] に登録する。
 * chrome.i18n（_locales）を使わないのは、ブラウザ言語とは別に拡張機能内で言語を手動選択
 * できるようにするため。chrome.i18n.getMessage はブラウザのUI言語に固定で上書きできない。
 * なお _locales は manifest の name/description（ストア表示・拡張機能一覧）専用で、
 * それらはマニフェストの仕様上 chrome.i18n 経由でしか翻訳できない。
 *
 * 言語の決定: 保存された設定（chrome.storage.sync の `language`）が 'auto' または未設定なら
 * ブラウザのUI言語に追従し、対応外の言語は日本語にする。
 *
 * t() は同期で呼べる必要がある（各機能が読込時にUIを組み立てるため）が chrome.storage は
 * 非同期なので、選択結果を localStorage（`oujLanguage`）にミラーして起動時に同期で読む。
 * 設定を変えた直後の1回だけミラーが古いことがあり、その場合は非同期で読み直して
 * onChange リスナーを呼ぶ（静的なDOMは applyToDom で自動的に更新される）。
 */
(function () {
  const STORAGE_KEY = 'language';
  const MIRROR_KEY = 'oujLanguage';
  const DEFAULT_LANG = 'ja';

  /** 選択肢に出す言語。表示名は各言語自身の表記（翻訳しない）にして、読めない言語からでも戻せるようにする */
  const LANGUAGES = [
    { code: 'ja', name: '日本語' },
    { code: 'en', name: 'English' },
    { code: 'ko', name: '한국어' },
    { code: 'zh_CN', name: '简体中文' },
    { code: 'zh_TW', name: '繁體中文' },
  ];
  const LANG_CODES = LANGUAGES.map((l) => l.code);
  const HTML_LANG = { ja: 'ja', en: 'en', ko: 'ko', zh_CN: 'zh-CN', zh_TW: 'zh-TW' };

  const messages = (window.OUJ_I18N_MESSAGES = window.OUJ_I18N_MESSAGES || {});
  const listeners = [];

  /** ブラウザのUI言語から対応言語を選ぶ。繁体字圏（台湾・香港・マカオ）は zh_TW、他の中国語は zh_CN */
  function resolveAutoLanguage() {
    let ui = '';
    try {
      ui = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || navigator.language || '';
    } catch (e) {
      ui = navigator.language || '';
    }
    ui = ui.toLowerCase().replace('_', '-');
    if (ui.startsWith('ja')) return 'ja';
    if (ui.startsWith('en')) return 'en';
    if (ui.startsWith('ko')) return 'ko';
    if (ui.startsWith('zh')) return /-(tw|hk|mo|hant)/.test(ui) ? 'zh_TW' : 'zh_CN';
    return DEFAULT_LANG;
  }

  /** 'auto'／未設定／不正値を実際の言語コードにする */
  function normalize(setting) {
    return LANG_CODES.includes(setting) ? setting : resolveAutoLanguage();
  }

  function readMirror() {
    try {
      return localStorage.getItem(MIRROR_KEY);
    } catch (e) {
      return null;
    }
  }

  function writeMirror(setting) {
    try {
      localStorage.setItem(MIRROR_KEY, setting);
    } catch (e) {
      // ミラーは起動時の同期読みのための最適化なので、書けなくても機能は損なわれない
    }
  }

  // 選択中の設定値（'auto' か言語コード）と、それを解決した実際の言語
  let currentSetting = readMirror() || 'auto';
  let currentLang = normalize(currentSetting);

  function applySetting(setting) {
    const next = setting || 'auto';
    const nextLang = normalize(next);
    const changed = next !== currentSetting || nextLang !== currentLang;
    currentSetting = next;
    currentLang = nextLang;
    writeMirror(next);
    if (!changed) return;
    applyToDom();
    listeners.forEach((cb) => {
      try {
        cb(currentLang);
      } catch (e) {
        console.error('i18n: onChange リスナーでエラー', e);
      }
    });
  }

  /**
   * 翻訳文字列を返す。選択言語に無ければ日本語、日本語にも無ければキー自体を返す
   * （訳し漏れが空文字ではなくキーとして見えるので発見しやすい）。
   * @param {string} key - メッセージキー
   * @param {Object<string, string|number>} [params] - `{name}` 形式のプレースホルダの値
   */
  function t(key, params) {
    const text =
      (messages[currentLang] && messages[currentLang][key]) ??
      (messages[DEFAULT_LANG] && messages[DEFAULT_LANG][key]) ??
      key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
  }

  /**
   * data-i18n（本文）／data-i18n-title／data-i18n-aria-label を持つ要素を翻訳する。
   * 静的HTML（ポップアップ）用。JSで組み立てるUIは t() を直接呼ぶ。
   */
  function applyToDom(root) {
    const scope = root || document;
    if (!scope.querySelectorAll) return;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
    if (scope === document && document.documentElement) {
      document.documentElement.lang = HTML_LANG[currentLang] || 'ja';
    }
  }

  // 保存された設定を非同期で読み、ミラーとずれていれば反映する
  try {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      applySetting(result[STORAGE_KEY]);
    });
    // ポップアップでの言語変更を、開いているページにも反映する
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes[STORAGE_KEY]) {
        applySetting(changes[STORAGE_KEY].newValue);
      }
    });
  } catch (e) {
    // chrome.storage が使えない環境（単体テスト等）ではミラーのみで動く
  }

  window.oujI18n = {
    t,
    applyToDom,
    LANGUAGES,
    /** 現在解決されている言語コード */
    getLanguage: () => currentLang,
    /** 保存されている設定値（'auto' か言語コード） */
    getLanguageSetting: () => currentSetting,
    /** 設定値を保存する。反映は chrome.storage.onChanged 経由で全ページ・ポップアップに伝わる */
    setLanguageSetting: (setting, callback) => {
      chrome.storage.sync.set({ [STORAGE_KEY]: setting }, callback);
    },
    /** 言語が変わったときに呼ばれるリスナーを登録する（動的に組み立てたUIの作り直し用） */
    onChange: (cb) => listeners.push(cb),
  };
  window.t = t;
})();
