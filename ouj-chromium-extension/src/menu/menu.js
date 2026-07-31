// 拡張機能メニュー本体（左メニュー／ポップオーバーへの挿入とイベント登録）。
// ヘッダーのダークモード切替は menu-header-darkmode.js、
// ヘッダーの折りたたみは menu-header-collapse.js に分離している。

// メニュー設定
const MENU_CONFIG = {
  title: "拡張機能",
  items: [
    { id: "favorites", text: "お気に入り", icon: "star" },
    { id: "watchlater", text: "あとで見る", icon: "list" },
    { id: "bookmarks", text: "しおり", icon: "bookmark" },
    { id: "history", text: "履歴", icon: "time" },
    { id: "recommend", text: "おすすめ動画", icon: "play" },
    { id: "studytime", text: "学習時間", icon: "stats" },
    { id: "whatsnew", text: "お知らせ", icon: "notifications" },
    { id: "darkmode", text: "ダークモード", icon: "moon" },
    // 表示オプションは他の項目を隠すための入口なので、表示オプション自体では隠せない
    { id: "displayoptions", text: "表示オプション", icon: "options" }
  ]
};

// 表示オプションで非表示にされたメニュー項目を除いた一覧を返す。
// （CSS側でも隠しているが、そもそもDOMに作らないことでクリック判定等も無くす）
function getVisibleMenuItems() {
  if (typeof window.isOujFeatureVisible !== 'function') return MENU_CONFIG.items;
  return MENU_CONFIG.items.filter((item) => window.isOujFeatureVisible(`menu-${item.id}`));
}
const LEFT_SELECTOR = '#menu > menu-navi > ion-content > div.scroll-content > ion-content > div.scroll-content > ion-list:nth-child(3)';
const POPOVER_SELECTOR = 'body > ion-app > ion-popover > div > div.popover-content > div > menu-navi > ion-content > div.scroll-content > ion-content > div.scroll-content > ion-list:nth-child(3)';


// メニューHTMLを生成する関数
function createMenuHTML() {
  const titleHTML = `
    <ion-item aria-hidden="true" class="item-header item item-block item-md" id="menu-title">
      <div class="item-inner">
        <div class="input-wrapper"><!---->
          <ion-label class="label label-md">
            <div class="icon-text">
                <div class="top-text-area">
                  ${MENU_CONFIG.title}
                </div>
            </div>
          </ion-label>
        </div><!---->
      </div>
      <div class="button-effect"></div>
    </ion-item>
  `;

  const itemsHTML = getVisibleMenuItems().map(item => `
    <ion-item class="item-selectable item item-block item-md" id="${item.id}-menu-item">
      <div class="item-inner">
        <div class="input-wrapper"><!---->
          <ion-label class="label label-md">
            <button id="link-item-button" class="">
              <div class="icon-text">
                <div class="icon-area">
                  <ion-icon aria-hidden="true" name="${item.icon}" role="img" class="icon icon-md ion-md-${item.icon} item-icon" aria-label="${item.text}">
                  </ion-icon>
                </div>
                <div class="text-area">
                  ${item.text}${item.id === 'darkmode' ? '<span class="ouj-darkmode-current-label" style="display:block;font-size:11px;font-weight:normal;opacity:0.7;"></span>' : ''}
                </div>
              </div>
            </button>
          </ion-label>
        </div><!---->
      </div>
      <div class="button-effect"></div>
    </ion-item>
  `).join('');

  return `
    <ion-list class="menu-list list list-md" role="list" aria-label="拡張機能">
      ${titleHTML}
      ${itemsHTML}
    </ion-list>
  `;
}
function startMenuOpeningMutationObserver() {
  if (window.oujMenuOpeningObserver) {
    return;
  }
  const ionApp = document.querySelector('ion-app');
  if (!ionApp) {
    // The <ion-app> element might not be available when the script first runs.
    // Log a warning and rely on subsequent executions (e.g., from URL changes) to set up the observer.
    console.warn('[OUJ拡張] <ion-app> element not found. Popover menu observer not attached.');
    return;
  }
  const observer = new MutationObserver((mutations) => {
    // SPA遷移で左メニュー(#menu)が作り直された場合に備え、DOMの変化のたびに
    // 拡張機能メニューを（冪等に）入れ直す。挿入先が未構築なら何もせず、
    // 次の変化で再挿入されるため取りこぼさない。挿入済みならinsertMenuが
    // aria-labelで判定して即returnするので、繰り返し呼んでも無害。
    insertMenu(LEFT_SELECTOR);
    mutations.forEach((mutation) => {
      // ion-popoverが開かれたかどうかをチェック
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }
        if (node.tagName.toLowerCase() === 'ion-popover') {
          // 少し遅延してからメニュー挿入を試みる
          setTimeout(() => {
            insertPopoverMenu();
          }, 100);
        }
      });

    });
  });
  observer.observe(ionApp, { childList: true, subtree: true });
  window.oujMenuOpeningObserver = observer;
}
// 挿入先（設定リスト）を待ってメニューを挿入する処理
function insertLeftMenu() {
  // 重要な関数が設定されていなければ再実行
  if (typeof window.waitForElement !== 'function') {
    setTimeout(insertLeftMenu, 100);
    return;
  }
  // 挿入先である左メニューの設定リスト(LEFT_SELECTOR)が現れてから挿入する。
  insertMenuWhenReady(LEFT_SELECTOR);
}

// 挿入先セレクタ（設定リスト等）が現れるまで待ってからメニューを挿入する。
// 以前はヘッダーのロゴ出現だけを待って即挿入していたため、ロゴ（ヘッダーは
// ページ遷移でも保持される）は用意済みでも、挿入先のメニュー本体（#menu／
// ポップオーバー）がまだ構築中だと挿入先が見つからず取りこぼし、しかも再試行
// しないので拡張機能メニューが出ないことがあった。特にホームの「続きから見る」
// カードや「▶続き」ボタンでプレーヤー画面へ直接遷移したときに再現する。
// 挿入先そのものを待つことでこの取りこぼしを防ぐ。insertMenuはaria-labelで
// 二重挿入を防ぐ冪等な処理なので、多重に呼ばれても安全。
function insertMenuWhenReady(selector) {
  window.waitForElement(selector, () => insertMenu(selector), 100, 50); // 最大約5秒待つ
}
function insertMenu(selector){
  // 既にメニューが存在する場合はスキップ（aria-labelで検索）
  const existing = document.querySelector(selector);
  const isMenuInserted = existing && existing.getAttribute('aria-label') === '拡張機能';
  if (isMenuInserted) return;
  // メニュー要素を作成
  const menuList = createMenuList();

  // 設定リストの前に挿入
  const settingList = document.querySelector(selector);
  if (!settingList) return;
  settingList.parentNode.insertBefore(menuList, settingList);
}
function insertPopoverMenu() {
  insertMenuWhenReady(POPOVER_SELECTOR);
}

// 表示オプションで項目の表示/非表示を切り替えたときに、拡張機能メニューを作り直す。
// メニュー項目の有無はDOM生成時（createMenuHTML→getVisibleMenuItems）に決まるため、
// 「非表示 → 表示」に戻しても、既に挿入済みのメニューはinsertMenu()の二重挿入防止に
// 阻まれて更新されない。一度取り除いてから入れ直すことで再読み込みなしに反映する。
function rebuildOujMenus() {
  document.querySelectorAll('ion-list.menu-list[aria-label="拡張機能"]').forEach((menu) => menu.remove());
  insertMenu(LEFT_SELECTOR);
  // ポップオーバー（狭い画面でのメニュー）は開いているときだけ存在する
  insertMenu(POPOVER_SELECTOR);
}

// メニューのイベントリスナーを追加
function createMenuList() {
  // メニュー要素を作成
  const menuContainer = document.createElement('div');
  menuContainer.innerHTML = createMenuHTML();
  const menuList = menuContainer.firstElementChild;
  const historyItem = menuList.querySelector('#history-menu-item');
  if (historyItem) {
    historyItem.addEventListener('click', window.handleHistoryPanelOpen);
  }
  const favoritesItem = menuList.querySelector('#favorites-menu-item');
  if (favoritesItem) {
    favoritesItem.addEventListener('click', window.handleFavoritesPanelOpen);
  }
  const watchLaterItem = menuList.querySelector('#watchlater-menu-item');
  if (watchLaterItem) {
    watchLaterItem.addEventListener('click', window.handleWatchLaterPanelOpen);
  }
  const bookmarksItem = menuList.querySelector('#bookmarks-menu-item');
  if (bookmarksItem) {
    bookmarksItem.addEventListener('click', window.handleBookmarksPanelOpen);
  }
  const whatsNewItem = menuList.querySelector('#whatsnew-menu-item');
  if (whatsNewItem) {
    whatsNewItem.addEventListener('click', window.handleWhatsNewPanelOpen);
    // 拡張機能の更新後、まだ「お知らせ」を開いていなければNEWバッジを表示する
    if (typeof window.updateWhatsNewBadge === 'function') {
      window.updateWhatsNewBadge(whatsNewItem);
    }
  }
  const recommendItem = menuList.querySelector('#recommend-menu-item');
  if (recommendItem) {
    recommendItem.addEventListener('click', window.handleRecommendPanelOpen);
  }
  const studyTimeItem = menuList.querySelector('#studytime-menu-item');
  if (studyTimeItem) {
    studyTimeItem.addEventListener('click', window.handleStudyTimePanelOpen);
  }
  const displayOptionsItem = menuList.querySelector('#displayoptions-menu-item');
  if (displayOptionsItem) {
    displayOptionsItem.addEventListener('click', window.handleDisplayOptionsPanelOpen);
  }
  const darkModeItem = menuList.querySelector('#darkmode-menu-item');
  if (darkModeItem) {
    updateDarkModeMenuLabel(darkModeItem);
    darkModeItem.addEventListener('click', () => {
      if (typeof window.cycleOujDarkModeSetting === 'function') {
        window.cycleOujDarkModeSetting((next) => updateDarkModeMenuLabel(darkModeItem, next));
      }
    });
  }
  return menuList;
}

// ヘッダー（拡張機能メニュー）内の「ダークモード」項目に、現在の設定値
// （自動／ライト／ダーク）をラベルとして表示する
function updateDarkModeMenuLabel(menuItemEl, settingValue) {
  const labelEl = menuItemEl.querySelector('.ouj-darkmode-current-label');
  if (!labelEl) return;
  const labels = window.OUJ_DARK_MODE_LABELS || { auto: '自動', light: 'ライト', dark: 'ダーク' };
  if (settingValue) {
    labelEl.textContent = `（${labels[settingValue] || labels.auto}）`;
    return;
  }
  if (typeof window.getOujDarkModeSetting === 'function') {
    window.getOujDarkModeSetting((setting) => {
      labelEl.textContent = `（${labels[setting] || labels.auto}）`;
    });
  }
}

// =========================
// saveSettingラッパーでキャッシュ更新
// =========================
(function() {
  const originalSaveSetting = window.saveSetting;
  window.saveSetting = function(key, value) {
    originalSaveSetting.apply(this, arguments);
    if (key === 'history' || key === 'favorites' || key === 'pinnedFavorites') {
      window.prefetchRecommendListData();
    }
  };
})();

// =========================
// 初期化時にプリフェッチ
// =========================
window.prefetchRecommendListData();

// アイコンやSVGのHTMLを共通化（共有ボタン等でも使うため、menu本体側に置いて
// video-player-coreより先に読み込ませる）
function getIconHtml(type, filled = false) {
  switch (type) {
    case 'share':
      return `<svg width="16" height="12" viewBox="0 0 24 24" fill="${filled ? 'white' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
    default:
      return '';
  }
}
window.getIconHtml = getIconHtml;
window.insertLeftMenu = insertLeftMenu;
window.rebuildOujMenus = rebuildOujMenus;
window.startMenuOpeningMutationObserver = startMenuOpeningMutationObserver;
