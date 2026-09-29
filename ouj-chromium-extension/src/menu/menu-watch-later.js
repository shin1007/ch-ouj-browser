// あとで見る一覧パネル（メニューの「あとで見る」から開く）
// 動画（回）単位のキュー。設定パネルで「あとで見るリストの順に次を再生」を選ぶと
// このリストの順に連続再生され、最後まで見た動画は自動的にリストから外れる。
// オーバーレイの共通基盤はmenu-native-shell.jsを利用する。

// リストの各項目について動画情報と再生進捗を取得する
function createWatchLaterListData() {
  const list = window.getWatchLaterList();
  return Promise.all(list.map(async (entry) => {
    try {
      const video = await window.getVideoData(entry.contentId) || {};
      if (!video.title) throw new Error('動画情報取得失敗');
      const progress = await window.getVideoProgress(entry.contentId);
      return { ...video, progress, addedAt: entry.addedAt, contentId: entry.contentId, categoryId: video.categoryId || entry.categoryId };
    } catch (e) {
      // 情報が取れなくても項目自体は表示する（削除できるようにするため）
      return { contentId: entry.contentId, categoryId: entry.categoryId, title: t('watchLater.unavailable', { id: entry.contentId }), summary: '', progress: 0, addedAt: entry.addedAt };
    }
  })).then((items) => window.getCategoriesData().then((categories) => ({ categories, items })));
}

function buildWatchLaterItemHtml(item, categories) {
  const dateStr = item.addedAt
    ? new Date(item.addedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '';
  const categoryPath = window.buildCategoryPathText(categories, item.categoryId);
  const deleteHtml = `
    <span class="watch-later-delete-btn" role="button" tabindex="0" title="${t('watchLater.removeFromList')}" data-content-id="${item.contentId}" style="position:absolute;top:10px;right:16px;z-index:2;background:rgba(255,255,255,0.9);border-radius:6px;padding:6px;cursor:pointer;color:#9ca3af;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
    </span>
  `;
  return window.buildNativeVideoItemHtml({
    contentId: item.contentId,
    categoryId: item.categoryId,
    title: item.title,
    summary: item.summary,
    categoryPath: `${categoryPath}${dateStr ? t('common.addedOn', { date: dateStr }) : ''}`,
    progressPercent: Math.floor((item.progress || 0) * 100),
    extraHtml: deleteHtml,
  });
}

function handleWatchLaterPanelOpen() {
  window.openNativeOverlay((overlay) => {
    let validItems = [];
    let categories = [];

    function wireItemEvents() {
      overlay.querySelectorAll('.native-video-button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const contentId = btn.getAttribute('data-content-id');
          const categoryId = btn.getAttribute('data-category-id');
          if (contentId) {
            window.removeNativeOverlay();
            window.location.href = `https://v.ouj.ac.jp/view/ouj/#/navi/player?co=${contentId}&ct=V&ca=${categoryId || ''}`;
          }
        });
      });
      overlay.querySelectorAll('.watch-later-delete-btn').forEach((delBtn) => {
        const onDelete = (event) => {
          event.stopPropagation();
          event.preventDefault();
          const contentId = delBtn.getAttribute('data-content-id');
          window.removeFromWatchLater(contentId);
          validItems = validItems.filter((item) => String(item.contentId) !== String(contentId));
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

    function renderList() {
      const listEl = overlay.querySelector('#common-list-content');
      if (listEl) {
        listEl.innerHTML = validItems.length
          ? validItems.map((item) => buildWatchLaterItemHtml(item, categories)).join('')
          : `<div style="padding:16px;color:#666;">${t('watchLater.empty')}</div>`;
      }
      wireItemEvents();
    }

    overlay.innerHTML = window.renderNativeShellHtml({
      breadcrumbHtml: window.buildNativeBreadcrumbHtml([{ text: t('menu.watchLater') }]),
      mainHtml: window.renderNativeVideoListMainHtml({
        topHtml: `
          <ion-item class="sort item item-block item-md">
            <div class="item-inner">
              <div class="input-wrapper">
                <div style="padding:8px 0;font-size:12px;color:#666;">
                  ${t('watchLater.note')}
                </div>
              </div>
            </div>
          </ion-item>
        `,
        itemsHtml: `<div style="padding:16px;color:#666;">${t('common.loading')}</div>`
      })
    });

    createWatchLaterListData().then(({ categories: fetchedCategories, items }) => {
      // オーバーレイが（ナビゲーション等で）既に閉じられていれば描画しない
      if (!document.body.contains(overlay)) return;
      categories = fetchedCategories;
      validItems = items;
      renderList();
    });
  }, 'watchlater');
}

// グローバルwindowに関数を公開
window.handleWatchLaterPanelOpen = handleWatchLaterPanelOpen;
