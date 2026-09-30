// ネイティブ風の右ペイン表示の共通基盤（年度別・お気に入り・履歴・おすすめ動画で共通利用）
// モーダルパネルではなく、#main（動画一覧ページの右ペイン）に直接オーバーレイを
// 差し込み、本来のカテゴリー一覧ページと同じクラス構成のHTMLを使うことで、
// 拡張機能の追加パネルではなく画面の一部のように見せる。

const NATIVE_OVERLAY_ID = 'ouj-native-overlay';
const NATIVE_OVERLAY_CLOSE_CLASS = 'ouj-native-overlay-close';
const NATIVE_OVERLAY_TOP_CLASS = 'ouj-native-overlay-top';
// 画面更新(F5)すると拡張機能のオーバーレイはDOM/JSごと消えてしまい、パネルを
// 開いていたはずが元のネイティブ画面に戻ってしまう。sessionStorageに「今開いて
// いるパネルのid」を持たせておき、リロード後にcontent.js側で読み直して同じ
// パネルを自動的に開き直すことで復元する(タブを閉じれば消える想定でlocalStorage
// ではなくsessionStorageを使う)。
const OUJ_OPEN_PANEL_STORAGE_KEY = 'oujOpenNativePanelId';

let oujNativeOverlayCleanup = null;
let oujNativeOverlayOutsideClickTimeout = null;
// パネルから別のパネルへ切り替えている最中かどうか。切り替えでは一度
// removeNativeOverlay()を通るが、すぐ次のパネルが動画を覆い隠すので、
// このときだけは動画を小窓(PiP)からページへ戻さない。
let oujIsSwitchingNativeOverlay = false;

function setOujOpenNativePanelId(panelId) {
  try {
    if (panelId) sessionStorage.setItem(OUJ_OPEN_PANEL_STORAGE_KEY, panelId);
    else sessionStorage.removeItem(OUJ_OPEN_PANEL_STORAGE_KEY);
  } catch (e) {
    // プライベートモード等でsessionStorageが使えない場合は復元機能を諦めるだけでよい
  }
}

function getOujOpenNativePanelId() {
  try {
    return sessionStorage.getItem(OUJ_OPEN_PANEL_STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

function removeNativeOverlay() {
  const overlay = document.getElementById(NATIVE_OVERLAY_ID);
  if (overlay) overlay.remove();
  setOujOpenNativePanelId(null);
  // パネルを開いたときに動画を覆い隠すため自動で小窓(PiP)へ逃がしていた場合は、
  // パネルを閉じたらページ内の元の場所へ戻す。小窓が残ったままだと、動画が
  // ページに戻っているのに小窓も出ている紛らわしい状態になる。
  // ユーザーが「⧉ 小窓」ボタンで自分から始めた小窓は意図的なものなので触らない。
  if (overlay && !oujIsSwitchingNativeOverlay
      && window.oujPipStartedByOverlay && document.pictureInPictureElement) {
    window.oujPipStartedByOverlay = false;
    // パネル内を下までスクロールしてから閉じると、動画をページへ戻しただけでは
    // 動画が画面外に残り、「小窓が消えたのに動画もどこにも無い」状態になる。
    // 戻すときは必ず動画が見える位置までスクロールする（scrollIntoViewの
    // block:'nearest'は、既に見えている場合は何もしないので画面が飛ばない）
    document.exitPictureInPicture()
      .then(() => {
        const video = document.querySelector('video');
        if (video) video.scrollIntoView({ block: 'nearest' });
      })
      .catch(() => {});
  }
  // 前のオーバーレイ用に予約されていた「外側クリック監視の設定」がまだ
  // 実行されていなければキャンセルする。これをしないと、100ms以内に
  // 別のオーバーレイを開いた場合、古いオーバーレイ用のクリックハンドラが
  // 新しいオーバーレイ表示後に登録され、直後のクリックで誤って閉じてしまう。
  if (oujNativeOverlayOutsideClickTimeout) {
    clearTimeout(oujNativeOverlayOutsideClickTimeout);
    oujNativeOverlayOutsideClickTimeout = null;
  }
  if (oujNativeOverlayCleanup) {
    oujNativeOverlayCleanup();
    oujNativeOverlayCleanup = null;
  }
}

/**
 * ネイティブ風オーバーレイを開く。同時に開けるオーバーレイは1つだけ。
 * @param {(overlay: HTMLElement) => void} render - オーバーレイのDOMに描画する処理
 * @param {string} [panelId] - 画面更新後の復元用に記録するパネルID（省略時は復元しない）
 */
function openNativeOverlay(render, panelId) {
  // このオーバーレイは#main全体を覆うため、再生ページで開くと動画(と操作ボタン)が
  // 見えなくなる。再生中の動画があれば覆い隠す前に小窓(PiP)へ切り替え、PiPが
  // 使えない場合(ラジオ番組等)は一時停止して、見えない場所で操作不能なまま
  // 再生され続ける不具合を防ぐ。PiP APIはユーザー操作(このオーバーレイを開いた
  // クリック)起点でなければ動かないため、await前に同期的に呼び出す必要がある
  if (typeof window.pipOrPauseCurrentVideoIfPlaying === 'function') {
    window.pipOrPauseCurrentVideoIfPlaying();
  }
  // 別のパネルへの切り替えでは、動画は次のパネルにも覆われたままなので小窓のまま残す
  oujIsSwitchingNativeOverlay = true;
  removeNativeOverlay();
  oujIsSwitchingNativeOverlay = false;
  const mainEl = document.getElementById('main');
  if (!mainEl) return null;

  // #mainがposition:staticのままだと、オーバーレイのposition:absoluteが
  // body基準になってしまい右ペインからずれるため、position:relativeにしておく
  if (window.getComputedStyle(mainEl).position === 'static') {
    mainEl.style.position = 'relative';
  }

  const overlay = document.createElement('div');
  overlay.id = NATIVE_OVERLAY_ID;
  Object.assign(overlay.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '20',
    background: '#fff',
    overflowY: 'auto'
  });
  mainEl.appendChild(overlay);

  // 右上ボタン（↑／✕）のクリック処理。パネルは表示切り替えのたびにinnerHTMLを
  // 丸ごと書き換えるため、ボタン自身ではなく（書き換えられない）overlayに委譲で登録する
  overlay.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest(`.${NATIVE_OVERLAY_CLOSE_CLASS}`)) {
      removeNativeOverlay();
    } else if (target.closest(`.${NATIVE_OVERLAY_TOP_CLASS}`)) {
      scrollNativeOverlayToTop(overlay);
    }
  });

  render(overlay);
  setOujOpenNativePanelId(panelId);

  const closeOnNavigate = () => removeNativeOverlay();
  window.addEventListener('hashchange', closeOnNavigate);
  window.addEventListener('popstate', closeOnNavigate);
  // このSPAは内部遷移にhistory.pushState/replaceStateを使っており、それらは
  // ネイティブのhashchange/popstateを発火しない(content.js側もこの理由で別途
  // pushState/replaceStateをフックしている)。クリックを伴わない遷移(オーバーレイ
  // 内のリンク経由等)ではhashchange/popstateだけでは閉じ漏れるため、content.jsが
  // URL変化を検知するたびに発行する汎用イベントでも閉じるようにする
  window.addEventListener('ouj:locationchange', closeOnNavigate);
  const closeOnOutsideClick = (event) => {
    // event.targetではなくcomposedPath()を使う。表示切り替え時にinnerHTMLを
    // 書き換えてクリック元の要素がDOMから切り離されるため、その後に発火する
    // このハンドラでevent.targetを見るとoverlay外判定になり、表示直後に消えて
    // しまう不具合があった。composedPath()はイベント発火時点の経路を保持する
    // ため、この問題が起きない。
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (!path.includes(overlay)) removeNativeOverlay();
  };
  oujNativeOverlayOutsideClickTimeout = setTimeout(() => {
    oujNativeOverlayOutsideClickTimeout = null;
    document.addEventListener('click', closeOnOutsideClick);
  }, 100);

  oujNativeOverlayCleanup = () => {
    window.removeEventListener('hashchange', closeOnNavigate);
    window.removeEventListener('popstate', closeOnNavigate);
    window.removeEventListener('ouj:locationchange', closeOnNavigate);
    document.removeEventListener('click', closeOnOutsideClick);
  };

  return overlay;
}

// パネル右上の操作ボタン（↑ 一番上へ ／ ✕ 閉じる）。
// 従来はパネル外をクリックするか画面遷移するしか閉じる手段が無く、閉じ方が
// 分からない／再生ページでは動画に戻れない状態になっていた。
// お気に入りや履歴は数百件になるため、「↑」で一気に先頭へ戻れるようにしている。
// 高さ0のsticky帯に入れることで、レイアウトを押し下げずに、パネル内を
// スクロールしても常に右上へ留まる（＝長い一覧の途中でも押せる）。
// このHTMLは各パネルの再描画(overlay.innerHTML書き換え)のたびに作り直されるため、
// クリック処理はボタンに直接ではなくoverlayへの委譲で登録する（openNativeOverlay参照）。
const NATIVE_OVERLAY_BUTTON_STYLE = 'width:34px;height:34px;line-height:1;padding:0;cursor:pointer;font-size:17px;color:#555;background:#fff;border:1px solid #ddd;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.15);';

function buildNativeOverlayActionsHtml() {
  return `
    <div style="position:sticky;top:0;z-index:30;height:0;text-align:right;">
      <div style="position:relative;top:10px;right:14px;display:inline-flex;gap:6px;">
        <button type="button" class="${NATIVE_OVERLAY_TOP_CLASS}" title="${t('common.backToTop')}" aria-label="${t('common.backToTop')}"
          style="${NATIVE_OVERLAY_BUTTON_STYLE}">↑</button>
        <button type="button" class="${NATIVE_OVERLAY_CLOSE_CLASS}" title="${t('common.close')}" aria-label="${t('common.close')}"
          style="${NATIVE_OVERLAY_BUTTON_STYLE}">✕</button>
      </div>
    </div>
  `;
}

// パネルを先頭までスクロールする。
// 実際にスクロールしている要素はサイト側CSS次第でoverlay自身のことも内側の
// .scroll-contentのこともあるため、スクロール位置を持っている要素を全て戻す。
// どれも動いていなければページ自体がスクロールしているとみなす。
function scrollNativeOverlayToTop(overlay) {
  const candidates = [overlay].concat(Array.from(overlay.querySelectorAll('.scroll-content')));
  let scrolled = false;
  candidates.forEach((el) => {
    if (el && el.scrollTop > 0) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
      scrolled = true;
    }
  });
  if (!scrolled) window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * カテゴリー一覧ページと同じクラス構成のシェルHTML。
 * asideList（パンくず＋フォルダ一覧）とmain（動画カード等）を両方持てる。
 */
function renderNativeShellHtml({ breadcrumbHtml, extraAsideHtml = '', asideListHtml = '', mainHtml = '' }) {
  return `
    <div class="scroll-content">
      ${buildNativeOverlayActionsHtml()}
      <list-title>
        <div class="common-outer-main-content-area">
          <ion-title class="page-list-title common-list-title-bottom title title-md">
            <div class="toolbar-title toolbar-title-md">
              <span class="list-title-span" role="heading">${t('nativeShell.videos')}</span>
            </div>
          </ion-title>
        </div>
      </list-title>
      <vod-list-navigator>
        <aside role="complementary">
          <div class="breadcrumbs">
            <ul aria-label="${t('nativeShell.breadcrumbList')}">${breadcrumbHtml}</ul>
          </div>
          ${extraAsideHtml}
          <ion-list class="vod-category-list list list-md" role="list" aria-label="${t('nativeShell.categories')}">
            ${asideListHtml}
          </ion-list>
        </aside>
      </vod-list-navigator>
      <div aria-labelledby="list-title-span" role="main">
        ${mainHtml}
      </div>
    </div>
  `;
}

// アサイド内で使う簡易検索ボックス（ネイティブページには無いが、件数が多い
// お気に入り/履歴/おすすめ動画では絞り込みが実用上必要なため追加する）
function buildNativeSearchBoxHtml({ id, placeholder, value = '' }) {
  const safeValue = value.replace(/"/g, '&quot;');
  return `
    <div style="padding:0 20px 12px 20px;">
      <input id="${id}" type="text" placeholder="${placeholder}" value="${safeValue}" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;color:#374151;">
    </div>
  `;
}

// 動画カード一覧のmainHtml。サムネイルやカード関連のCSSは
// ion-list#common-list-content配下限定で定義されているため、このidが必須
function renderNativeVideoListMainHtml({ topHtml = '', itemsHtml = '' }) {
  return `
    ${topHtml}
    <ion-list aria-describedby="list-title-span" id="common-list-content" role="list" class="list list-md">
      ${itemsHtml}
    </ion-list>
  `;
}

// パンくずの<li>群を組み立てる。items: [{ text, id? }]
function buildNativeBreadcrumbHtml(items) {
  return items.map((item) => `<li class="child-breadcrumb"><a href="javascript:void(0);"${item.id ? ` id="${item.id}"` : ''}>${item.text}</a></li>`).join('');
}

// リスト内のグループ見出し。サイドバーの「カテゴリー」見出しと同じ.item-header/.top-text-areaを再利用
function buildNativeSectionHeaderHtml(text) {
  return `
    <ion-item aria-hidden="true" class="item-header item item-block item-md">
      <div class="item-inner">
        <div class="input-wrapper">
          <ion-label class="label label-md">
            <div class="icon-text"><div class="top-text-area">${text}</div></div>
          </ion-label>
        </div>
      </div>
      <div class="button-effect"></div>
    </ion-item>
  `;
}

/**
 * カテゴリー/科目フォルダ用の項目（年度別のフォルダ・科目、お気に入りの科目で共通利用）
 * id="link-item-button"はサイト側CSS（button#link-item-button）がボタンの
 * 背景を透明・全面リセットするために必須。省くとブラウザ標準の灰色ボタンになる。
 * extraHtmlは<button>の外（.icon-textの中）に置く前提のHTMLのみ受け取ること。
 * <button>の中に<button>をネストするとHTML仕様違反になり、innerHTMLで挿入した際に
 * ブラウザが外側のbuttonを強制的に閉じてタグ構造ごと崩れるため、お気に入り星等は
 * <span role="button">で作ること（buildFavoriteToggleHtml参照）。
 */
function buildNativeCategoryItemHtml({ text, buttonClass = '', dataAttrs = {}, extraHtml = '', subText = '' }) {
  const dataAttrHtml = Object.entries(dataAttrs).map(([key, value]) => `data-${key}="${value}"`).join(' ');
  return `
    <ion-item class="item item-block item-md" role="listitem">
      <div class="item-inner">
        <div class="input-wrapper">
          <ion-label class="label label-md">
            <button class="child-category-button ${buttonClass}" id="link-item-button" ${dataAttrHtml}>
              <div class="icon-text">
                <div aria-hidden="true" class="icon-area">
                  <ion-icon name="folder" role="img" class="icon icon-md ion-md-folder item-icon" aria-label="folder"></ion-icon>
                </div>
                <div class="text-area">${text}</div>
                ${extraHtml}
              </div>
              ${subText ? `<div class="sub-icon-text"><div class="icon-area"></div><div class="text-area">${subText}</div></div>` : ''}
            </button>
          </ion-label>
        </div>
      </div>
      <div class="button-effect"></div>
    </ion-item>
  `;
}

// お気に入り星（<span role="button">。<button>の中に入れても仕様違反にならない）
function buildFavoriteToggleHtml(categoryId, isFavorite) {
  const iconName = isFavorite ? 'star' : 'star-outline';
  const iconClass = isFavorite ? 'ion-md-star' : 'ion-md-star-outline';
  return `
    <span class="favorite-btn" role="button" tabindex="0" title="${t('common.favorites')}" data-category-id="${categoryId}" style="display: inline-flex; align-items: center; justify-content: center; padding: 2px 16px; border: none; background: transparent; cursor: pointer; border-radius: 8px; transition: background 0.2s; margin-left: 8px;">
      <ion-icon name="${iconName}" class="icon icon-md ${iconClass} item-icon" aria-label="${t('common.favorites')}" style="font-size:24px;"></ion-icon>
    </span>
  `;
}

// ピン止めボタン（<span role="button">。favorite-btnと同様に<button>内で使える）
// ionicons v3にpinアイコンが無いためインラインSVGを使用する
function buildPinToggleHtml(categoryId, isPinned) {
  const color = isPinned ? '#0075C1' : '#9ca3af';
  const fill = isPinned ? color : 'none';
  return `
    <span class="pin-btn" role="button" tabindex="0" title="${isPinned ? t('nativeShell.unpin') : t('favorites.pinned')}" data-category-id="${categoryId}" style="display: inline-flex; align-items: center; justify-content: center; padding: 2px 12px; border: none; background: transparent; cursor: pointer; border-radius: 8px; transition: background 0.2s;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H8L6 9h12L16 3z M12 9v12"/></svg>
    </span>
  `;
}

/**
 * 動画（1エピソード）用の項目（履歴・おすすめ動画で共通利用）。
 * extraHtmlは<ion-item>直下（.item-innerの外）に置かれるので、削除ボタンなど
 * position:absoluteで重ねる用途に使う（.item-mdは元々position:relativeなので
 * 追加のCSSなしで右上等に配置できる）。
 */
function buildNativeVideoItemHtml({ contentId, categoryId, title, summary, categoryPath, durationLabel = '', rightAreaHtml = '', progressPercent = 0, extraHtml = '' }) {
  const thumb = contentId ? `https://v.ouj.ac.jp/v1/tenants/1/vod-contents/${contentId}/thumbnail/large` : '';
  const safeTitle = (title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeSummary = (summary || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const showProgress = progressPercent > 0 && progressPercent < 95;
  return `
    <ion-item class="item item-block item-md" role="listitem">
      <div class="item-inner">
        <div class="input-wrapper">
          <ion-label class="label label-md">
            <button id="link-item-button" class="native-video-button" data-content-id="${contentId || ''}" data-category-id="${categoryId || ''}">
              <ion-row class="row">
                <ion-col class="col">
                  <div class="main-content">
                    <div class="thumb-content">
                      <div class="thumb-main">
                        <img class="thumb-img" src="${thumb}" onerror="this.style.display='none';">
                        ${showProgress ? `<div class="progress-bar-container"><div class="progress-bar" style="width:${progressPercent}%;"></div></div>` : ''}
                        <div aria-hidden="true" class="thumb-footer">
                          <div aria-hidden="true" class="thumb-label">${durationLabel}</div>
                        </div>
                      </div>
                    </div>
                    <div class="list-content">
                      <ion-row class="list-content-title row">
                        <ion-col class="col">
                          <div class="title">${safeTitle}</div>
                          <div class="view-date">${rightAreaHtml}</div>
                        </ion-col>
                      </ion-row>
                      <ion-row class="list-content-detail row">
                        <ion-col class="col">${safeSummary || t('nativeShell.noSummary')}</ion-col>
                      </ion-row>
                      ${categoryPath ? `
                      <ion-row class="list-content-category row">
                        <ion-col class="col">
                          <div><label aria-hidden="true" class="content-category">${categoryPath}</label></div>
                        </ion-col>
                      </ion-row>` : ''}
                    </div>
                  </div>
                </ion-col>
              </ion-row>
            </button>
          </ion-label>
        </div>
      </div>
      ${extraHtml}
      <div class="button-effect"></div>
    </ion-item>
  `;
}

// 視聴済み/視聴日を示すネイティブ風の丸ピル（履歴用）
function buildViewedDateHtml(dateStr) {
  return `
    <div class="div-right" title="${t('nativeShell.viewedDate')}">
      <div class="viewed-item no-aria-label" aria-label="${t('nativeShell.viewedDate')}">
        <div class="viewed-button"><ion-icon aria-hidden="true" class="check icon icon-md ion-md-checkmark" name="checkmark" role="img" aria-label="checkmark"></ion-icon></div>
      </div>
      <div class="viewed-item">
        <div aria-hidden="true" class="viewed-button">${dateStr}</div>
      </div>
    </div>
  `;
}

/**
 * categories配列とcategoryIdから「親 > 親 > 自分」形式のパスを作る
 */
function buildCategoryPathText(categories, categoryId) {
  if (!Array.isArray(categories) || !categoryId) return '';
  const byId = {};
  categories.forEach((c) => { byId[c.categoryId] = c; });
  const path = [];
  let current = byId[categoryId];
  let guard = 0;
  while (current && guard < 10) {
    path.unshift(current.name);
    current = current.parentId ? byId[current.parentId] : null;
    guard++;
  }
  return path.join(' &gt; ');
}

// グローバルwindowに関数を公開
window.openNativeOverlay = openNativeOverlay;
window.removeNativeOverlay = removeNativeOverlay;
window.getOujOpenNativePanelId = getOujOpenNativePanelId;
window.isOujNativeOverlayOpen = () => !!document.getElementById(NATIVE_OVERLAY_ID);
window.renderNativeShellHtml = renderNativeShellHtml;
window.buildNativeSearchBoxHtml = buildNativeSearchBoxHtml;
window.renderNativeVideoListMainHtml = renderNativeVideoListMainHtml;
window.buildNativeBreadcrumbHtml = buildNativeBreadcrumbHtml;
window.buildNativeSectionHeaderHtml = buildNativeSectionHeaderHtml;
window.buildNativeCategoryItemHtml = buildNativeCategoryItemHtml;
window.buildFavoriteToggleHtml = buildFavoriteToggleHtml;
window.buildPinToggleHtml = buildPinToggleHtml;
window.buildNativeVideoItemHtml = buildNativeVideoItemHtml;
window.buildViewedDateHtml = buildViewedDateHtml;
window.buildCategoryPathText = buildCategoryPathText;
