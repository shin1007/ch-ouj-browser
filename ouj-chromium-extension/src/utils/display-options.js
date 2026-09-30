/**
 * 表示オプション（この拡張機能が画面に追加するUIの表示/非表示）。
 *
 * 追加機能が増えたことで画面が見づらいという要望に対応するため、機能ごとに
 * 表示/非表示を切り替えられるようにする。設定UIは menu/menu-display-options.js。
 *
 * 仕組みは2段構え。
 * 1. 挿入時のゲート … 各機能の挿入処理の冒頭で isOujFeatureVisible() を見て、
 *    非表示なら挿入自体を行わない（不要なAPI取得や監視も走らせない）。
 * 2. CSSによる即時非表示 … 既に挿入済みの要素は、設定を切り替えたその場で
 *    消えてほしい。非表示の機能のセレクタをまとめた<style>を差し込むことで、
 *    ページを再読み込みしなくても見た目に反映される。
 * 逆方向（非表示→表示）は、1のゲートでそもそも挿入されなかった要素が対象になる。
 * CSSを外すだけでは何も現れないため、設定パネル側（menu/menu-display-options.js）が
 * メニューの作り直しとページ側の挿入処理の再実行を行って反映する。
 */

const OUJ_DISPLAY_OPTIONS_KEY = 'displayOptions';
const OUJ_DISPLAY_OPTIONS_STYLE_ID = 'ouj-display-options-style';

/**
 * 表示オプションの定義。
 * - id: 保存キー。既存の設定を壊さないため、一度公開したidは変えないこと
 * - selectors: 「既に挿入済みの要素」を即時に隠すためのCSSセレクタ
 * - group: 表示オプション画面での見出し。groupの `description` は見出しの下に補足として出る
 *          （どこに出る表示なのかが分かりにくいグループで使う）
 *
 * **並び順は「画面に出てくる順」に合わせている**（グループも、グループ内の項目も、
 * 画面の上から下・左から右の順）。探している表示を目で追う順に見つけられるようにするため。
 * 項目を追加するときも、その表示が画面のどこに出るかを見て差し込む位置を決めること。
 * 最後の「拡張機能メニューの項目」だけは例外で、ページ内の表示ではなくメニューの
 * 中身なので、ページ内の項目をすべて挙げた後ろにまとめている（並びはメニューと同じ順）。
 * - inPage: ページ内に直接追加される要素かどうか（false＝拡張機能メニューの項目）。
 *           「ページ内の追加表示を最小限にする」プリセットの対象判定に使う
 */
const OUJ_DISPLAY_OPTION_GROUPS = [
  {
    id: 'header',
    get label() { return t('displayOptions.header.label'); },
    options: [
      {
        id: 'search-box-panel',
        get label() { return t('displayOptions.search-box-panel.label'); },
        get description() { return t('displayOptions.search-box-panel.description'); },
        selectors: ['#ouj-search-box-panel'],
        inPage: true,
      },
      {
        id: 'header-darkmode',
        get label() { return t('displayOptions.header-darkmode.label'); },
        get description() { return t('displayOptions.header-darkmode.description'); },
        selectors: ['.ouj-header-darkmode-toggle'],
        inPage: true,
      },
      {
        id: 'header-wakaba',
        get label() { return t('displayOptions.header-wakaba.label'); },
        get description() { return t('displayOptions.header-wakaba.description'); },
        selectors: ['.ouj-header-wakaba-link'],
        inPage: true,
      },
      {
        id: 'header-collapse',
        get label() { return t('displayOptions.header-collapse.label'); },
        get description() { return t('displayOptions.header-collapse.description'); },
        selectors: ['#ouj-header-collapse-tab', '#ouj-header-expand-tab'],
        inPage: true,
      },
    ],
  },
  {
    id: 'lists',
    get label() { return t('displayOptions.lists.label'); },
    options: [
      {
        id: 'home-continue',
        get label() { return t('displayOptions.home-continue.label'); },
        get description() { return t('displayOptions.home-continue.description'); },
        selectors: ['#ouj-home-continue-panel'],
        inPage: true,
      },
      {
        id: 'breadcrumb-favorite',
        get label() { return t('displayOptions.breadcrumb-favorite.label'); },
        get description() { return t('displayOptions.breadcrumb-favorite.description'); },
        selectors: ['#favorite-button'],
        inPage: true,
      },
      {
        id: 'course-filters',
        get label() { return t('displayOptions.course-filters.label'); },
        get description() { return t('displayOptions.course-filters.description'); },
        selectors: ['#course-list-filter-bar'],
        inPage: true,
      },
      {
        id: 'course-favorite',
        get label() { return t('displayOptions.course-favorite.label'); },
        get description() { return t('displayOptions.course-favorite.description'); },
        selectors: ['.ouj-course-fav-btn'],
        inPage: true,
      },
      {
        id: 'course-progress',
        get label() { return t('displayOptions.course-progress.label'); },
        get description() { return t('displayOptions.course-progress.description'); },
        selectors: ['.course-progress-badge', '.course-continue-btn'],
        inPage: true,
      },
      {
        id: 'search-result-filters',
        get label() { return t('displayOptions.search-result-filters.label'); },
        get description() { return t('displayOptions.search-result-filters.description'); },
        selectors: ['#search-result-filter-bar'],
        inPage: true,
      },
      {
        id: 'video-select-watch-later',
        get label() { return t('displayOptions.video-select-watch-later.label'); },
        get description() { return t('displayOptions.video-select-watch-later.description'); },
        selectors: ['.ouj-video-select-watch-later'],
        inPage: true,
      },
      {
        id: 'thumbnail-progress',
        get label() { return t('displayOptions.thumbnail-progress.label'); },
        get description() { return t('displayOptions.thumbnail-progress.description'); },
        selectors: ['.progress-bar-container'],
        inPage: true,
      },
    ],
  },
  {
    id: 'player',
    get label() { return t('displayOptions.player.label'); },
    options: [
      {
        id: 'player-next-countdown',
        get label() { return t('displayOptions.player-next-countdown.label'); },
        get description() { return t('displayOptions.player-next-countdown.description'); },
        selectors: ['#ouj-next-video-countdown'],
        inPage: true,
      },
      {
        id: 'player-share',
        get label() { return t('displayOptions.player-share.label'); },
        get description() { return t('displayOptions.player-share.description'); },
        selectors: ['.video-share-button'],
        inPage: true,
      },
      {
        id: 'player-actions',
        get label() { return t('displayOptions.player-actions.label'); },
        get description() { return t('displayOptions.player-actions.description'); },
        selectors: ['.video-pip-button', '.video-bookmark-button', '.video-watch-later-button'],
        inPage: true,
      },
      {
        id: 'player-remaining-time',
        get label() { return t('displayOptions.player-remaining-time.label'); },
        get description() { return t('displayOptions.player-remaining-time.description'); },
        selectors: ['#ouj-remaining-time'],
        inPage: true,
      },
      {
        id: 'player-prev-next',
        get label() { return t('displayOptions.player-prev-next.label'); },
        get description() { return t('displayOptions.player-prev-next.description'); },
        selectors: ['#prev-next-links'],
        inPage: true,
      },
      {
        id: 'player-episode-list',
        get label() { return t('displayOptions.player-episode-list.label'); },
        get description() { return t('displayOptions.player-episode-list.description'); },
        selectors: ['#episode-list-menu'],
        inPage: true,
      },
      {
        id: 'player-settings-panel',
        get label() { return t('displayOptions.player-settings-panel.label'); },
        get description() { return t('displayOptions.player-settings-panel.description'); },
        selectors: ['#video-settings-panel'],
        inPage: true,
      },
    ],
  },
  {
    id: 'player-settings-panel-items',
    get label() { return t('displayOptions.player-settings-panel-items.label'); },
    get description() { return t('displayOptions.player-settings-panel-items.description'); },
    options: [
      {
        id: 'player-panel-speed',
        get label() { return t('displayOptions.player-panel-speed.label'); },
        get description() { return t('displayOptions.player-panel-speed.description'); },
        selectors: ['#playback-speed-section'],
        inPage: true,
      },
      {
        id: 'player-ab-repeat',
        get label() { return t('displayOptions.player-ab-repeat.label'); },
        get description() { return t('displayOptions.player-ab-repeat.description'); },
        selectors: ['#ab-repeat-container'],
        inPage: true,
      },
      {
        id: 'player-panel-caption',
        get label() { return t('displayOptions.player-panel-caption.label'); },
        get description() { return t('displayOptions.player-panel-caption.description'); },
        selectors: ['#caption-settings-section'],
        inPage: true,
      },
      {
        id: 'player-panel-volume',
        get label() { return t('displayOptions.player-panel-volume.label'); },
        get description() { return t('displayOptions.player-panel-volume.description'); },
        selectors: ['#volume-normalization-section'],
        inPage: true,
      },
      {
        id: 'player-panel-autoplay',
        get label() { return t('displayOptions.player-panel-autoplay.label'); },
        get description() { return t('displayOptions.player-panel-autoplay.description'); },
        selectors: ['#autoplay-settings-section'],
        inPage: true,
      },
      {
        id: 'player-panel-next-source',
        get label() { return t('displayOptions.player-panel-next-source.label'); },
        get description() { return t('displayOptions.player-panel-next-source.description'); },
        selectors: ['#next-video-source-section'],
        inPage: true,
      },
      {
        id: 'player-panel-skip',
        get label() { return t('displayOptions.player-panel-skip.label'); },
        get description() { return t('displayOptions.player-panel-skip.description'); },
        selectors: ['#skip-settings-section'],
        inPage: true,
      },
      {
        id: 'player-panel-playlog',
        get label() { return t('displayOptions.player-panel-playlog.label'); },
        get description() { return t('displayOptions.player-panel-playlog.description'); },
        selectors: ['#playlog-settings-section'],
        inPage: true,
      },
      {
        id: 'player-target-buffer',
        get label() { return t('displayOptions.player-target-buffer.label'); },
        get description() { return t('displayOptions.player-target-buffer.description'); },
        selectors: ['#target-buffer-container'],
        inPage: true,
      },
      {
        id: 'player-panel-wake-lock',
        get label() { return t('displayOptions.player-panel-wake-lock.label'); },
        get description() { return t('displayOptions.player-panel-wake-lock.description'); },
        selectors: ['#wake-lock-section'],
        inPage: true,
      },
      {
        id: 'player-panel-sleep-timer',
        get label() { return t('displayOptions.player-panel-sleep-timer.label'); },
        get description() { return t('displayOptions.player-panel-sleep-timer.description'); },
        selectors: ['#sleep-timer-section'],
        inPage: true,
      },
    ],
  },
  {
    id: 'menu',
    get label() { return t('displayOptions.menu.label'); },
    options: [
      { id: 'menu-favorites', get label() { return t('displayOptions.menu-favorites.label'); }, selectors: ['#favorites-menu-item'], inPage: false },
      { id: 'menu-watchlater', get label() { return t('displayOptions.menu-watchlater.label'); }, selectors: ['#watchlater-menu-item'], inPage: false },
      { id: 'menu-bookmarks', get label() { return t('displayOptions.menu-bookmarks.label'); }, selectors: ['#bookmarks-menu-item'], inPage: false },
      { id: 'menu-history', get label() { return t('displayOptions.menu-history.label'); }, selectors: ['#history-menu-item'], inPage: false },
      { id: 'menu-recommend', get label() { return t('displayOptions.menu-recommend.label'); }, selectors: ['#recommend-menu-item'], inPage: false },
      { id: 'menu-studytime', get label() { return t('displayOptions.menu-studytime.label'); }, selectors: ['#studytime-menu-item'], inPage: false },
      { id: 'menu-whatsnew', get label() { return t('displayOptions.menu-whatsnew.label'); }, selectors: ['#whatsnew-menu-item'], inPage: false },
      { id: 'menu-darkmode', get label() { return t('displayOptions.menu-darkmode.label'); }, selectors: ['#darkmode-menu-item'], inPage: false },
    ],
  },
];

// id -> 定義 の索引
const oujDisplayOptionById = {};
OUJ_DISPLAY_OPTION_GROUPS.forEach((group) => {
  group.options.forEach((option) => {
    oujDisplayOptionById[option.id] = option;
  });
});

/**
 * 保存済みの表示オプション（id -> boolean）。未設定のidは「表示する」扱い。
 * これにより、この機能の追加前からのユーザーや、今後追加される機能は
 * すべて従来どおり表示された状態から始まる。
 */
function getOujDisplayOptions() {
  const saved = window.getSetting ? window.getSetting(OUJ_DISPLAY_OPTIONS_KEY, {}) : {};
  return (saved && typeof saved === 'object' && !Array.isArray(saved)) ? saved : {};
}

/**
 * その機能を表示するかどうか。未知のidは常にtrue（＝隠す設定が無ければ従来どおり）。
 * @param {string} optionId
 * @returns {boolean}
 */
function isOujFeatureVisible(optionId) {
  const options = getOujDisplayOptions();
  return options[optionId] !== false;
}

/**
 * 表示/非表示を保存し、既に挿入済みの要素にも即座に反映する。
 * @param {string} optionId
 * @param {boolean} visible
 */
function setOujFeatureVisible(optionId, visible) {
  const options = getOujDisplayOptions();
  options[optionId] = !!visible;
  window.saveSetting(OUJ_DISPLAY_OPTIONS_KEY, options);
  applyOujDisplayOptionStyles();
}

/**
 * 複数のオプションをまとめて保存する（プリセット用）。
 * @param {Object} partialOptions - id -> boolean
 */
function setOujDisplayOptions(partialOptions) {
  const options = Object.assign(getOujDisplayOptions(), partialOptions);
  window.saveSetting(OUJ_DISPLAY_OPTIONS_KEY, options);
  applyOujDisplayOptionStyles();
}

/** すべて初期状態（すべて表示）に戻す */
function resetOujDisplayOptions() {
  if (window.removeSetting) window.removeSetting(OUJ_DISPLAY_OPTIONS_KEY);
  applyOujDisplayOptionStyles();
}

/** 全オプション定義を平坦な配列で返す */
function getOujDisplayOptionList() {
  return OUJ_DISPLAY_OPTION_GROUPS.reduce((list, group) => list.concat(group.options), []);
}

/**
 * 非表示にしている機能のセレクタをまとめた<style>を差し込む（既にあれば中身を差し替える）。
 * 挿入時のゲートだけでは「切り替えた瞬間に消える」を実現できないため併用する。
 */
function applyOujDisplayOptionStyles() {
  const options = getOujDisplayOptions();
  const selectors = [];
  getOujDisplayOptionList().forEach((option) => {
    if (options[option.id] === false && Array.isArray(option.selectors)) {
      selectors.push(...option.selectors);
    }
  });

  let styleEl = document.getElementById(OUJ_DISPLAY_OPTIONS_STYLE_ID);
  if (selectors.length === 0) {
    if (styleEl) styleEl.remove();
    return;
  }
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = OUJ_DISPLAY_OPTIONS_STYLE_ID;
    (document.head || document.documentElement).appendChild(styleEl);
  }
  // サイト側のCSSより確実に勝たせるため!importantを付ける
  styleEl.textContent = `${selectors.join(',\n')} { display: none !important; }`;
}

// グローバル関数として公開
window.OUJ_DISPLAY_OPTION_GROUPS = OUJ_DISPLAY_OPTION_GROUPS;
window.getOujDisplayOptions = getOujDisplayOptions;
window.getOujDisplayOptionList = getOujDisplayOptionList;
window.isOujFeatureVisible = isOujFeatureVisible;
window.setOujFeatureVisible = setOujFeatureVisible;
window.setOujDisplayOptions = setOujDisplayOptions;
window.resetOujDisplayOptions = resetOujDisplayOptions;
window.applyOujDisplayOptionStyles = applyOujDisplayOptionStyles;

// 読み込み時点で反映しておく（各機能の挿入より前にスタイルを用意する）
applyOujDisplayOptionStyles();
