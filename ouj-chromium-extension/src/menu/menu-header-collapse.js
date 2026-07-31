// =========================
// ヘッダー（ロゴ・検索バーの行）の折りたたみ機能
// 右端にボタンを設置し、クリックでヘッダー行（ion-header）自体をdisplay:noneで
// 完全に隠す。単にヘッダーを隠すだけだと下記2つの理由で画面下部に空白が
// 残ってしまうため、それぞれ打ち消す処理を行う。
// 1. Ionicはヘッダーの高さ分の余白をコンテンツ側の.scroll-content要素の
//    margin-topにインラインstyleで動的設定していることがある。折りたたみ時は
//    そのmargin-topも0にし、展開時は捕捉しておいた元の値に戻す（Ionic自身の
//    再計算に頼らない。Ionicはページ遷移等の特定のタイミングでしか
//    margin-topを再計算しないため）。
// 2. サイト本体のCSSで #main（class="navi-main-default"／"navi-main-no-side-menu"）と
//    左側の固定ナビ #menu（幅265pxのカテゴリー一覧ペイン）の両方に、
//    `max-height: calc(100% - 3.0em)` 等、ヘッダー分の高さを固定値で
//    差し引くルールが直接指定されている。ヘッダー表示中はこれがヘッダーの
//    実高さとちょうど帳尻が合っているが、ヘッダーを隠しても値は動的に
//    再計算されないため、隠した分がそのまま埋まらない空白として残ってしまう
//    （#mainだけ解除して#menuを解除し忘れると、右ペインだけ追従して左ペイン
//    下部にだけ空白が残る）。折りたたみ時はこの両方のmax-height制限を外し
//    （100%まで広げる）、展開時に解除して元のCSSルールに戻す。
// =========================
const HEADER_COLLAPSE_STORAGE_KEY = 'headerCollapsed';
const HEADER_COLLAPSE_TAB_ID = 'ouj-header-collapse-tab';
const HEADER_EXPAND_TAB_ID = 'ouj-header-expand-tab';

// ヘッダー折りたたみ時にmargin-topを退避・解除する対象要素を探す。
// 通常は.scroll-content（ion-contentの直下）だが、構造が違うケースに備えて
// 段階的にフォールバックする。
function getOujHeaderContentElement(headerEl) {
  if (!headerEl || !headerEl.parentElement) return null;
  const parent = headerEl.parentElement;
  const direct = Array.from(parent.children).find((el) => el.tagName === 'ION-CONTENT');
  if (direct) return direct;
  const nested = parent.querySelector('ion-content');
  if (nested) return nested;
  return document.querySelector('ion-content');
}

function getOujHeaderScrollElement(headerEl) {
  const contentEl = getOujHeaderContentElement(headerEl);
  if (!contentEl) return null;
  return contentEl.querySelector('.scroll-content') || contentEl;
}

function findOujHeaderElement(logo) {
  const navbarEl = logo.closest('ion-navbar') || logo.closest('.toolbar');
  if (!navbarEl) return null;
  return navbarEl.closest('ion-header') || navbarEl;
}

function applyOujHeaderCollapsed(collapsed) {
  if (typeof window.waitForElement !== 'function') return;
  window.waitForElement('img.logo-img[src="./assets/images/icon_logo.png"]', (logo) => {
    const headerEl = findOujHeaderElement(logo);
    if (!headerEl) return;
    const scrollEl = getOujHeaderScrollElement(headerEl);
    const mainEl = document.getElementById('main');
    // 左側の固定ナビ（id="menu"、カテゴリー一覧や拡張機能メニューを含む265px幅の
    // ペイン）にも、#mainと全く同じ `max-height: calc(100% - 3.0em)` がサイト側の
    // CSSで指定されている。#mainだけリセットすると右ペインは追従するが、#menu側は
    // ヘッダー分の高さが空白として下部に残ってしまうため、同様にリセットする。
    const menuEl = document.getElementById('menu');

    if (collapsed) {
      if (scrollEl && scrollEl.dataset.oujOrigMarginTop === undefined) {
        scrollEl.dataset.oujOrigMarginTop = scrollEl.style.marginTop || '';
      }
      headerEl.style.setProperty('display', 'none', 'important');
      if (scrollEl) scrollEl.style.setProperty('margin-top', '0px', 'important');
      if (mainEl) {
        mainEl.style.setProperty('max-height', '100%', 'important');
        mainEl.style.setProperty('height', '100%', 'important');
      }
      if (menuEl) {
        menuEl.style.setProperty('max-height', '100%', 'important');
        menuEl.style.setProperty('height', '100%', 'important');
      }
    } else {
      headerEl.style.removeProperty('display');
      if (scrollEl && scrollEl.dataset.oujOrigMarginTop !== undefined) {
        if (scrollEl.dataset.oujOrigMarginTop) {
          scrollEl.style.setProperty('margin-top', scrollEl.dataset.oujOrigMarginTop);
        } else {
          scrollEl.style.removeProperty('margin-top');
        }
        delete scrollEl.dataset.oujOrigMarginTop;
      }
      if (mainEl) {
        mainEl.style.removeProperty('max-height');
        mainEl.style.removeProperty('height');
      }
      if (menuEl) {
        menuEl.style.removeProperty('max-height');
        menuEl.style.removeProperty('height');
      }
    }

    // ヘッダーの表示/非表示に連動してレイアウトを再計算するコンポーネントが
    // サイト側に存在するため（PlayerComponent等、複数箇所でwindow:resizeを
    // 購読している）、念のためresizeイベントを発火させて追従させる。
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const collapseTab = document.getElementById(HEADER_COLLAPSE_TAB_ID);
    if (collapseTab) collapseTab.style.display = collapsed ? 'none' : 'flex';
    const expandTab = document.getElementById(HEADER_EXPAND_TAB_ID);
    if (expandTab) expandTab.style.display = collapsed ? 'flex' : 'none';
  });
}

function cycleOujHeaderCollapsed() {
  chrome.storage.sync.get([HEADER_COLLAPSE_STORAGE_KEY], (result) => {
    const next = !result[HEADER_COLLAPSE_STORAGE_KEY];
    chrome.storage.sync.set({ [HEADER_COLLAPSE_STORAGE_KEY]: next }, () => {
      applyOujHeaderCollapsed(next);
    });
  });
}

// 折りたたみ用（▲）・展開用（▼）タブを共通のスタイルで生成する。
// どちらもヘッダー内部（ion-navbarなど）には置かず、常にdocument.bodyの
// 直接の子として配置する。ion-navbar.toolbarにはサイト側CSSで
// `transform: translateZ(0)` が指定されており、position:fixedな子要素は
// ビューポートではなくそのtransformされた祖先を基準に配置されてしまう
// （CSSの仕様上、transformを持つ要素は子孫のfixed要素の包含ブロックになる）。
// ヘッダー内に置くと2つのタブの左右位置がズレる原因になっていたため、
// 両方をbody直下に置き、同じtop/right/サイズを指定することで、
// 折りたたみ⇔展開で同じ場所にタブが表示されるようにしている。
function createOujHeaderTab({ id, title, text, onClick }) {
  const tab = document.createElement('div');
  tab.id = id;
  tab.setAttribute('role', 'button');
  tab.setAttribute('tabindex', '0');
  tab.title = title;
  tab.textContent = text;
  Object.assign(tab.style, {
    position: 'fixed',
    top: '0',
    right: '12px',
    zIndex: '2147483000',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '18px',
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    fontSize: '11px',
    lineHeight: '1',
    borderRadius: '0 0 8px 8px',
    cursor: 'pointer',
    userSelect: 'none'
  });
  tab.addEventListener('click', onClick);
  tab.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  });
  document.body.appendChild(tab);
  return tab;
}

function ensureHeaderCollapseTabs() {
  if (document.getElementById(HEADER_EXPAND_TAB_ID)) return;
  createOujHeaderTab({ id: HEADER_COLLAPSE_TAB_ID, title: 'ヘッダーを折りたたむ', text: '▲', onClick: cycleOujHeaderCollapsed });
  createOujHeaderTab({ id: HEADER_EXPAND_TAB_ID, title: 'ヘッダーを表示', text: '▼', onClick: cycleOujHeaderCollapsed });
}

function insertHeaderCollapseToggle() {
  if (typeof window.waitForElement !== 'function') {
    setTimeout(insertHeaderCollapseToggle, 100);
    return;
  }
  ensureHeaderCollapseTabs();
  window.waitForElement('img.logo-img[src="./assets/images/icon_logo.png"]', () => {
    // SPA遷移でヘッダーやコンテンツのDOMが作り直された場合に備え、
    // ページ遷移のたびに現在の設定値を適用し直す。
    chrome.storage.sync.get([HEADER_COLLAPSE_STORAGE_KEY], (result) => {
      applyOujHeaderCollapsed(!!result[HEADER_COLLAPSE_STORAGE_KEY]);
    });
  });
}
window.insertHeaderCollapseToggle = insertHeaderCollapseToggle;
// 表示オプションでこのボタンを隠したとき、折りたたんだままだと戻す手段が
// 無くなるため、パネル側からヘッダーを開き直せるように公開する
// （chrome.storageの設定値は変えないので、再度表示すれば元の状態に戻る）
window.applyOujHeaderCollapsed = applyOujHeaderCollapsed;

// ポップアップ等、他のタブでの変更もリアルタイムに反映
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[HEADER_COLLAPSE_STORAGE_KEY]) {
    applyOujHeaderCollapsed(!!changes[HEADER_COLLAPSE_STORAGE_KEY].newValue);
  }
});
