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
    label: 'ヘッダー（画面上部）',
    options: [
      {
        id: 'search-box-panel',
        label: '検索ボックスの絞り込みパネル',
        description: '検索欄をクリックしたときに開く「最近の検索」「年度・コースで探す」パネル',
        selectors: ['#ouj-search-box-panel'],
        inPage: true,
      },
      {
        id: 'header-darkmode',
        label: 'テーマ切替ボタン（🌓）',
        description: 'ライト／ダーク／自動を切り替えるボタン。隠してもメニューの「ダークモード」から切り替えられます',
        selectors: ['.ouj-header-darkmode-toggle'],
        inPage: true,
      },
      {
        id: 'header-wakaba',
        label: 'システムWAKABAボタン（🎓）',
        description: '学生ポータルを新しいタブで開くボタン',
        selectors: ['.ouj-header-wakaba-link'],
        inPage: true,
      },
      {
        id: 'header-collapse',
        label: 'ヘッダー折りたたみボタン',
        description: 'ロゴ・検索欄の行を隠して表示領域を広げるボタン',
        selectors: ['#ouj-header-collapse-tab', '#ouj-header-expand-tab'],
        inPage: true,
      },
    ],
  },
  {
    id: 'lists',
    label: '一覧画面',
    options: [
      {
        id: 'home-continue',
        label: 'ホームの「続きから見る」パネル',
        description: 'ホーム画面の先頭に表示される、見かけの回の一覧',
        selectors: ['#ouj-home-continue-panel'],
        inPage: true,
      },
      {
        id: 'breadcrumb-favorite',
        label: 'パンくずのお気に入り星',
        description: '回の一覧・再生ページの上部（パンくず）に出る★ボタン',
        selectors: ['#favorite-button'],
        inPage: true,
      },
      {
        id: 'course-filters',
        label: '科目一覧の絞り込みバー',
        description: 'テレビ／ラジオ・字幕・視聴状況・年度で絞り込むバー',
        selectors: ['#course-list-filter-bar'],
        inPage: true,
      },
      {
        id: 'course-favorite',
        label: '科目一覧のお気に入り星',
        description: '科目一覧の各行に付く★ボタン',
        selectors: ['.ouj-course-fav-btn'],
        inPage: true,
      },
      {
        id: 'course-progress',
        label: '科目一覧の視聴進捗バッジ・「▶続き」',
        description: '「3/15回」などの進捗バッジと、最初の未視聴回へ飛ぶボタン',
        selectors: ['.course-progress-badge', '.course-continue-btn'],
        inPage: true,
      },
      {
        id: 'search-result-filters',
        label: '検索結果・回一覧の絞り込みバー',
        description: '絞り込みと並び替えのバー（検索結果と回の一覧で共通）',
        selectors: ['#search-result-filter-bar'],
        inPage: true,
      },
      {
        id: 'video-select-watch-later',
        label: '回一覧の「あとで見る」ボタン',
        description: '回の一覧の各行に付く「あとで見る」トグル',
        selectors: ['.ouj-video-select-watch-later'],
        inPage: true,
      },
      {
        id: 'thumbnail-progress',
        label: 'サムネイルの再生進捗バー',
        description: 'サムネイル下部に重なる、どこまで見たかの青いバー',
        selectors: ['.progress-bar-container'],
        inPage: true,
      },
    ],
  },
  {
    id: 'player',
    label: '再生ページ',
    options: [
      {
        id: 'player-next-countdown',
        label: '次の動画のカウントダウン',
        description: '動画終了時に次の動画名とカウントダウンを重ねて表示',
        selectors: ['#ouj-next-video-countdown'],
        inPage: true,
      },
      {
        id: 'player-share',
        label: '共有ボタン',
        description: '動画タイトル横の共有ボタン',
        selectors: ['.video-share-button'],
        inPage: true,
      },
      {
        id: 'player-actions',
        label: '小窓（PiP）・しおり・あとで見るボタン',
        description: '動画タイトル横のアクションボタン群',
        selectors: ['.video-pip-button', '.video-bookmark-button', '.video-watch-later-button'],
        inPage: true,
      },
      {
        id: 'player-remaining-time',
        label: '実質残り時間の表示',
        description: '動画タイトル横に出る、再生速度を加味した残り時間',
        selectors: ['#ouj-remaining-time'],
        inPage: true,
      },
      {
        id: 'player-prev-next',
        label: '前後の回へのリンク',
        description: '動画タイトルの下に出る「前の回／次の回」',
        selectors: ['#prev-next-links'],
        inPage: true,
      },
      {
        id: 'player-episode-list',
        label: '「回一覧」メニュー',
        description: '同じ科目の他の回へ直接ジャンプできる折りたたみメニュー',
        selectors: ['#episode-list-menu'],
        inPage: true,
      },
      {
        id: 'player-settings-panel',
        label: '動画下部の設定パネル（全体）',
        description: '再生速度・字幕・スキップ秒数などの設定パネル。パネルごと隠します（中の項目を1つずつ選ぶなら次のグループ）',
        selectors: ['#video-settings-panel'],
        inPage: true,
      },
    ],
  },
  {
    id: 'player-settings-panel-items',
    label: '動画下部の設定パネルの中の項目',
    description: '使わない設定だけを1ブロックずつ隠せます。隠しても保存済みの設定はそのまま効き続けます（変更できなくなるだけです）。パネルごと消すなら「再生ページ」の「動画下部の設定パネル（全体）」を外してください。',
    options: [
      {
        id: 'player-panel-speed',
        label: '再生速度',
        description: '「再生速度を調整する」と速度の選択',
        selectors: ['#playback-speed-section'],
        inPage: true,
      },
      {
        id: 'player-ab-repeat',
        label: 'A-B区間リピートの操作行',
        description: '区間を指定して繰り返す操作（語学の聞き取り練習用）',
        selectors: ['#ab-repeat-container'],
        inPage: true,
      },
      {
        id: 'player-panel-caption',
        label: '字幕の表示設定',
        description: 'テレビ／ラジオの字幕表示と「字幕表示時に画面を縮小しない」',
        selectors: ['#caption-settings-section'],
        inPage: true,
      },
      {
        id: 'player-panel-volume',
        label: '音量正規化',
        description: '「番組間の音量差を自動で抑える」',
        selectors: ['#volume-normalization-section'],
        inPage: true,
      },
      {
        id: 'player-panel-autoplay',
        label: '自動再生・自動で次へ',
        description: '「可能なら動画を自動再生する」と「動画終了時に自動で次の動画に進む」',
        selectors: ['#autoplay-settings-section'],
        inPage: true,
      },
      {
        id: 'player-panel-next-source',
        label: '次に再生する動画の選び方',
        description: '同じ科目／お気に入りからランダム／「あとで見る」の順、の選択',
        selectors: ['#next-video-source-section'],
        inPage: true,
      },
      {
        id: 'player-panel-skip',
        label: '最初・最後のスキップ秒数',
        description: 'オープニング／エンディングを飛ばす秒数の選択',
        selectors: ['#skip-settings-section'],
        inPage: true,
      },
      {
        id: 'player-panel-playlog',
        label: '再生ログの保存頻度',
        description: '再生位置を大学側へ記録する間隔の選択',
        selectors: ['#playlog-settings-section'],
        inPage: true,
      },
      {
        id: 'player-target-buffer',
        label: '先読み（バッファ）の設定',
        description: '動画をどれだけ先まで読み込んでおくかの選択',
        selectors: ['#target-buffer-container'],
        inPage: true,
      },
      {
        id: 'player-panel-wake-lock',
        label: '画面の自動ロック防止',
        description: '「再生中に画面が自動でロックされないようにする」',
        selectors: ['#wake-lock-section'],
        inPage: true,
      },
      {
        id: 'player-panel-sleep-timer',
        label: 'スリープタイマー',
        description: '指定時間／この回の終わりで自動停止する設定',
        selectors: ['#sleep-timer-section'],
        inPage: true,
      },
    ],
  },
  {
    id: 'menu',
    label: '拡張機能メニューの項目',
    options: [
      { id: 'menu-favorites', label: 'お気に入り', selectors: ['#favorites-menu-item'], inPage: false },
      { id: 'menu-watchlater', label: 'あとで見る', selectors: ['#watchlater-menu-item'], inPage: false },
      { id: 'menu-bookmarks', label: 'しおり', selectors: ['#bookmarks-menu-item'], inPage: false },
      { id: 'menu-history', label: '履歴', selectors: ['#history-menu-item'], inPage: false },
      { id: 'menu-recommend', label: 'おすすめ動画', selectors: ['#recommend-menu-item'], inPage: false },
      { id: 'menu-studytime', label: '学習時間', selectors: ['#studytime-menu-item'], inPage: false },
      { id: 'menu-whatsnew', label: 'お知らせ', selectors: ['#whatsnew-menu-item'], inPage: false },
      { id: 'menu-darkmode', label: 'ダークモード', selectors: ['#darkmode-menu-item'], inPage: false },
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
