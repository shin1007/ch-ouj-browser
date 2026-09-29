// 履歴機能（menu.jsから分離）
// ネイティブな動画一覧ページ（右ペイン）と同じ見た目で視聴履歴を表示する
// オーバーレイの共通基盤はmenu-native-shell.jsを利用する

function createHistoryListData() {
  let history = [];
  try {
    history = window.getSetting('history', []);
  } catch (e) {
    history = [];
  }
  const contentIds = history.map((item) => item.contentId).filter(Boolean);
  return Promise.all(contentIds.map(async (contentId) => {
    try {
      const video = await window.getVideoData(contentId) || {};
      if (!video.title) throw new Error('動画情報取得失敗');
      const h = history.find((hh) => hh.contentId == contentId) || {};
      const progress = await window.getVideoProgress(contentId);
      return { ...video, progress, date: h.date, contentId };
    } catch (e) {
      return null;
    }
  })).then((videoItems) => {
    const validVideoItems = videoItems.filter(Boolean);
    return window.getCategoriesData().then((categories) => ({ history, categories, validVideoItems }));
  });
}

function buildHistoryTopHtml() {
  return `
    <ion-item class="sort item item-block item-md">
      <div class="item-inner">
        <div class="input-wrapper">
          <div style="display:flex;align-items:center;gap:12px;padding:8px 0;width:100%;">
            <input id="history-native-search" type="text" placeholder="${t('history.searchPlaceholder')}" style="flex:1;box-sizing:border-box;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
            <span id="history-native-clear-all" role="button" tabindex="0" style="white-space:nowrap;color:#dc2626;cursor:pointer;font-size:14px;padding:6px 10px;border-radius:6px;">${t('history.clearAll')}</span>
          </div>
        </div>
      </div>
    </ion-item>
  `;
}

function buildHistoryItemHtml(item, categories) {
  const dateStr = new Date(item.date).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const categoryPath = window.buildCategoryPathText(categories, item.categoryId);
  // 削除ボタンは<ion-item>直下（.item-mdは元々position:relative）に絶対配置する。
  // <button>の中に<button>を入れるとHTML仕様違反でタグ構造が壊れるため<span role="button">にする
  const deleteHtml = `
    <span class="history-delete-btn" role="button" tabindex="0" title="${t('common.delete')}" data-content-id="${item.contentId}" style="position:absolute;top:10px;right:16px;z-index:2;background:rgba(255,255,255,0.9);border-radius:6px;padding:6px;cursor:pointer;color:#9ca3af;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
    </span>
  `;
  return window.buildNativeVideoItemHtml({
    contentId: item.contentId,
    categoryId: item.categoryId,
    title: item.title,
    summary: item.summary,
    categoryPath,
    rightAreaHtml: window.buildViewedDateHtml(dateStr),
    progressPercent: Math.floor((item.progress || 0) * 100),
    extraHtml: deleteHtml
  });
}

function handleHistoryPanelOpen() {
  window.openNativeOverlay((overlay) => {
    let validItems = [];
    let categories = [];
    let filterValue = '';

    // 動画カード・削除ボタンは表示を更新するたびに作り直すので、
    // イベントリスナーもその都度再登録する
    function wireItemEvents() {
      overlay.querySelectorAll('.native-video-button').forEach((btn) => {
        btn.addEventListener('click', () => {
          // 履歴・おすすめ動画は科目一覧ではなく、その動画自体の再生ページへ直接遷移する
          const contentId = btn.getAttribute('data-content-id');
          const categoryId = btn.getAttribute('data-category-id');
          if (contentId) {
            window.removeNativeOverlay();
            window.location.href = `https://v.ouj.ac.jp/view/ouj/#/navi/player?co=${contentId}&ct=V&ca=${categoryId || ''}`;
          }
        });
      });
      overlay.querySelectorAll('.history-delete-btn').forEach((delBtn) => {
        const onDelete = (event) => {
          event.stopPropagation();
          event.preventDefault();
          const contentId = delBtn.getAttribute('data-content-id');
          let history = window.getSetting('history', []);
          history = history.filter((item) => item.contentId !== contentId);
          window.saveSetting('history', history);
          window.prefetchRecommendListData();
          validItems = validItems.filter((item) => item.contentId !== contentId);
          renderList();
        };
        delBtn.addEventListener('click', onDelete);
        delBtn.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onDelete(event);
          }
        });
      });
    }

    // 検索ボックスは全体を再描画すると入力中にフォーカスが切れてしまうため、
    // 動画リスト部分（#common-list-content）だけを差し替える
    function renderList() {
      const keyword = filterValue.trim().toLowerCase();
      const filtered = keyword
        ? validItems.filter((item) => (item.title || '').toLowerCase().includes(keyword) || window.buildCategoryPathText(categories, item.categoryId).toLowerCase().includes(keyword))
        : validItems;
      const sorted = filtered.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      const listEl = overlay.querySelector('#common-list-content');
      if (listEl) {
        listEl.innerHTML = sorted.length
          ? sorted.map((item) => buildHistoryItemHtml(item, categories)).join('')
          : `<div style="padding:16px;color:#666;">${t('history.empty')}</div>`;
      }
      wireItemEvents();
    }

    overlay.innerHTML = window.renderNativeShellHtml({
      breadcrumbHtml: window.buildNativeBreadcrumbHtml([{ text: t('menu.history') }]),
      mainHtml: window.renderNativeVideoListMainHtml({
        topHtml: buildHistoryTopHtml(),
        itemsHtml: `<div style="padding:16px;color:#666;">${t('common.loading')}</div>`
      })
    });

    const searchInput = overlay.querySelector('#history-native-search');
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        filterValue = event.target.value;
        renderList();
      });
    }
    const clearAllBtn = overlay.querySelector('#history-native-clear-all');
    if (clearAllBtn) {
      const onClearAll = async () => {
        if (!validItems.length) return;
        const confirmed = typeof window.showConfirmDialog === 'function'
          ? await window.showConfirmDialog(t('history.confirmClearAll', { count: validItems.length }), t('history.clearAllTitle'))
          : confirm(t('history.confirmClearAll', { count: validItems.length }));
        if (!confirmed) return;
        window.saveSetting('history', []);
        window.prefetchRecommendListData();
        validItems = [];
        renderList();
      };
      clearAllBtn.addEventListener('click', onClearAll);
      clearAllBtn.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClearAll();
        }
      });
    }

    createHistoryListData().then(({ categories: fetchedCategories, validVideoItems }) => {
      // オーバーレイが（ナビゲーション等で）既に閉じられていれば描画しない
      if (!document.body.contains(overlay)) return;
      categories = fetchedCategories;
      validItems = validVideoItems;
      renderList();
    });
  }, 'history');
}

// グローバルwindowに関数を公開
window.handleHistoryPanelOpen = handleHistoryPanelOpen;
