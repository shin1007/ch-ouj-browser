// しおり一覧パネル（メニューの「しおり」から開く）
// 動画ページの「🔖しおり」ボタンで保存した再生位置＋メモの一覧を表示し、
// クリックでその動画・その位置へ直接ジャンプする。
// オーバーレイの共通基盤はmenu-native-shell.jsを利用する。

function buildBookmarkItemHtml(bookmark) {
  const dateStr = bookmark.createdAt
    ? new Date(bookmark.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '';
  const timeLabel = window.formatBookmarkTime(bookmark.time || 0);
  const deleteHtml = `
    <span class="bookmark-delete-btn" role="button" tabindex="0" title="${t('common.delete')}" data-bookmark-id="${bookmark.id}" style="position:absolute;top:10px;right:16px;z-index:2;background:rgba(255,255,255,0.9);border-radius:6px;padding:6px;cursor:pointer;color:#9ca3af;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
    </span>
  `;
  return window.buildNativeVideoItemHtml({
    contentId: bookmark.contentId,
    categoryId: bookmark.categoryId,
    title: `🔖 ${timeLabel} ｜ ${bookmark.title || t('bookmarks.unknownTitle')}`,
    summary: bookmark.note || t('bookmarks.noNote'),
    categoryPath: `${bookmark.courseName || ''}${dateStr ? t('common.addedOn', { date: dateStr }) : ''}`,
    durationLabel: timeLabel,
    extraHtml: deleteHtml,
  });
}

function handleBookmarksPanelOpen() {
  window.openNativeOverlay((overlay) => {
    let items = window.getBookmarks();
    let filterValue = '';
    // 直近に描画したしおりの配列（ボタンと同じ並び順。クリック時にインデックスで対応づける）
    let lastRendered = [];

    function wireItemEvents() {
      overlay.querySelectorAll('.native-video-button').forEach((btn, index) => {
        btn.addEventListener('click', () => {
          const contentId = btn.getAttribute('data-content-id');
          const categoryId = btn.getAttribute('data-category-id');
          if (!contentId) return;
          // 同じ動画に複数のしおりがあるため、行の並び順でどのしおりかを特定する
          const clicked = lastRendered[index];
          if (clicked) {
            window.setPendingSeek(contentId, clicked.time || 0);
          }
          window.removeNativeOverlay();
          window.location.href = `https://v.ouj.ac.jp/view/ouj/#/navi/player?co=${contentId}&ct=V&ca=${categoryId || ''}`;
        });
      });
      overlay.querySelectorAll('.bookmark-delete-btn').forEach((delBtn) => {
        const onDelete = (event) => {
          event.stopPropagation();
          event.preventDefault();
          const bookmarkId = delBtn.getAttribute('data-bookmark-id');
          window.removeBookmark(bookmarkId);
          items = items.filter((b) => b.id !== bookmarkId);
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
      const keyword = filterValue.trim().toLowerCase();
      const filtered = keyword
        ? items.filter((b) =>
            (b.title || '').toLowerCase().includes(keyword)
            || (b.courseName || '').toLowerCase().includes(keyword)
            || (b.note || '').toLowerCase().includes(keyword))
        : items;
      const listEl = overlay.querySelector('#common-list-content');
      if (listEl) {
        listEl.innerHTML = filtered.length
          ? filtered.map(buildBookmarkItemHtml).join('')
          : `<div style="padding:16px;color:#666;">${t('bookmarks.empty')}</div>`;
      }
      lastRendered = filtered;
      wireItemEvents();
    }

    overlay.innerHTML = window.renderNativeShellHtml({
      breadcrumbHtml: window.buildNativeBreadcrumbHtml([{ text: t('menu.bookmarks') }]),
      mainHtml: window.renderNativeVideoListMainHtml({
        topHtml: `
          <ion-item class="sort item item-block item-md">
            <div class="item-inner">
              <div class="input-wrapper">
                <div style="display:flex;align-items:center;gap:12px;padding:8px 0;width:100%;">
                  <input id="bookmark-native-search" type="text" placeholder="${t('bookmarks.searchPlaceholder')}" style="flex:1;box-sizing:border-box;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
                </div>
              </div>
            </div>
          </ion-item>
        `,
        itemsHtml: `<div style="padding:16px;color:#666;">${t('common.loading')}</div>`
      })
    });

    const searchInput = overlay.querySelector('#bookmark-native-search');
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        filterValue = event.target.value;
        renderList();
      });
    }

    renderList();
  }, 'bookmarks');
}

// グローバルwindowに関数を公開
window.handleBookmarksPanelOpen = handleBookmarksPanelOpen;
