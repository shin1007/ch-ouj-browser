// ダークモード制御（コンテンツスクリプト・ポップアップの両方から読み込まれる共通ロジック）
// darkModeの設定値: 'auto'（OS設定に追従・既定値） / 'light' / 'dark'
// 実際の暗色化はdark-mode.cssの`html.ouj-dark-mode`（invertフィルター）が担当し、
// このファイルはchrome.storageの設定値とOSのprefers-color-schemeを見て
// <html>にouj-dark-modeクラスを付け外しするだけの役割に徹する。

(function () {
  const STORAGE_KEY = 'darkMode';
  const DARK_CLASS = 'ouj-dark-mode';
  const SETTING_CYCLE = ['auto', 'light', 'dark'];
  const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  let currentSetting = 'auto';

  function computeIsDark(setting) {
    if (setting === 'dark') return true;
    if (setting === 'light') return false;
    return darkMediaQuery.matches;
  }

  function applyDarkMode(setting) {
    document.documentElement.classList.toggle(DARK_CLASS, computeIsDark(setting));
  }

  chrome.storage.sync.get([STORAGE_KEY], (result) => {
    currentSetting = result[STORAGE_KEY] || 'auto';
    applyDarkMode(currentSetting);
  });

  // OS側のダーク/ライト切り替えをリアルタイムに反映（autoの場合のみ意味を持つ）
  darkMediaQuery.addEventListener('change', () => {
    applyDarkMode(currentSetting);
  });

  // ポップアップ側でのテーマ変更をリアルタイムに反映
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes[STORAGE_KEY]) {
      currentSetting = changes[STORAGE_KEY].newValue || 'auto';
      applyDarkMode(currentSetting);
    }
  });

  // 他のスクリプトが現在の表示状態（ダークか否か）を参照するためのヘルパー
  window.isOujDarkModeActive = function () {
    return document.documentElement.classList.contains(DARK_CLASS);
  };

  // メニュー（ヘッダー）側の表示テーマ切り替えボタンから利用する共通API。
  // ポップアップと設定キー・切り替え順を共有することで、値のずれを防ぐ。
  // 言語切替に追従できるよう、参照のたびに t() を呼ぶgetterにしている
  window.OUJ_DARK_MODE_LABELS = {
    get auto() { return window.t ? window.t('darkmode.auto') : '自動'; },
    get light() { return window.t ? window.t('darkmode.light') : 'ライト'; },
    get dark() { return window.t ? window.t('darkmode.dark') : 'ダーク'; },
  };

  window.getOujDarkModeSetting = function (callback) {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      callback(result[STORAGE_KEY] || 'auto');
    });
  };

  window.cycleOujDarkModeSetting = function (callback) {
    window.getOujDarkModeSetting((setting) => {
      const nextIndex = (SETTING_CYCLE.indexOf(setting) + 1) % SETTING_CYCLE.length;
      const next = SETTING_CYCLE[nextIndex];
      chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => {
        if (typeof callback === 'function') callback(next);
      });
    });
  };
})();
