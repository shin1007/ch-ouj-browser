// お気に入り機能（menu.jsから分離）
// ネイティブなカテゴリー一覧ページ（右ペイン）と同じ見た目で科目一覧を表示する
// オーバーレイの共通基盤はmenu-native-shell.jsを利用する
// 並び順は「カテゴリ別（従来）」と「手動（↑↓ボタンで入れ替え）」を切り替えられる。
// 手動並び替えはfavorites配列自体の順序を入れ替えるため、同期・エクスポートにもそのまま反映される。

async function fetchFavoriteItems(favorites, categories) {
  const idToCategory = {};
  (Array.isArray(categories) ? categories : []).forEach((cat) => {
    idToCategory[cat.categoryId] = cat;
    idToCategory[cat.categoryId.toString()] = cat;
  });
  const pinned = window.getSetting('pinnedFavorites', []);
  return Promise.all(favorites.map(async (id) => {
    const category = idToCategory[id];
    const parentCategoryName = await window.getParentCategoryName(id);
    return {
      id,
      name: category ? category.name : t('favorites.unknownCourse', { id }),
      unknown: !category,
      summary: category ? category.summary : '',
      parentCategoryName: parentCategoryName || t('common.other'),
      pinned: pinned.includes(id)
    };
  }));
}

async function createFavoriteListData() {
  const favorites = window.getSetting('favorites', []);
  if (!favorites.length) return [];
  const categories = await window.getCategoriesData();
  let items = await fetchFavoriteItems(favorites, categories);
  // キャッシュが古く科目名が引けなかった場合は強制的に再取得して1回だけ再試行する
  // (先頭以外の項目だけが未解決のケースも拾えるよう、全件を確認する)
  if (items.some((item) => item.unknown)) {
    const freshCategories = await window.getCategoriesData(0);
    items = await fetchFavoriteItems(favorites, freshCategories);
  }
  return items;
}

function groupFavoriteItems(items) {
  const pinnedItems = items.filter((item) => item.pinned);
  const unpinnedItems = items.filter((item) => !item.pinned);
  const grouped = {};
  unpinnedItems.forEach((item) => {
    const key = item.parentCategoryName;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });
  const sortedNames = Object.keys(grouped).sort((a, b) => {
    const aNum = parseInt((a.match(/^[0-9]+/) || ['0'])[0], 10);
    const bNum = parseInt((b.match(/^[0-9]+/) || ['0'])[0], 10);
    return aNum - bNum;
  });
  return { pinnedItems, groups: sortedNames.map((name) => ({ name, items: grouped[name] })) };
}

// 視聴回数バッジ（例:「5/15回視聴済み」）のプレースホルダー。
// 中身は表示後にIntersectionObserverで遅延計算して埋める（wireProgressBadges参照）。
// スタイル（min-width含む）はutils/progress-badge.jsで科目一覧ページと共通化している
// （空欄→実データで幅が変わりお気に入り星がずれる不具合が page-course-select-progress.js で
// 過去に起きたため、同じ見た目のこのバッジも最初から同じ幅を確保する）
function buildProgressBadgePlaceholderHtml(categoryId) {
  return `<span class="favorite-progress-badge" data-category-id="${categoryId}" style="${window.oujProgressBadgeStyleText()}"></span>`;
}

// バッジ要素に集計結果を反映する。resultがnull（動画0件）ならバッジ自体を消す。
function fillFavoriteProgressBadge(badge, result) {
  if (!result) {
    badge.remove();
    return;
  }
  const { finishedCount, total, suffix } = result;
  window.fillProgressCountBadge(badge, { finishedCount, total, suffix });
}

// 「▶続き」ボタン（その科目の最初の未視聴回へ直行）
function buildContinueButtonHtml(categoryId) {
  return `
    <span class="favorite-continue-btn" role="button" tabindex="0" title="${t('favorites.continueTitle')}" data-category-id="${categoryId}" style="display:inline-flex;align-items:center;padding:2px 10px;border:1px solid #1976d2;color:#1976d2;background:transparent;cursor:pointer;border-radius:12px;font-size:12px;white-space:nowrap;margin-left:8px;">${t('favorites.continue')}</span>
  `;
}

// 手動並び替え用の↑↓ボタン
function buildMoveButtonsHtml(categoryId) {
  const btnStyle = 'display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid #d1d5db;background:#fff;color:#374151;cursor:pointer;border-radius:6px;font-size:12px;';
  return `
    <span class="favorite-move-up" role="button" tabindex="0" title="${t('favorites.moveUp')}" data-category-id="${categoryId}" style="${btnStyle}margin-left:8px;">↑</span>
    <span class="favorite-move-down" role="button" tabindex="0" title="${t('favorites.moveDown')}" data-category-id="${categoryId}" style="${btnStyle}margin-left:4px;">↓</span>
  `;
}

function buildFavoriteItemHtml(item, sortMode) {
  let extraHtml = buildProgressBadgePlaceholderHtml(item.id);
  extraHtml += buildContinueButtonHtml(item.id);
  if (sortMode === 'manual') {
    extraHtml += buildMoveButtonsHtml(item.id);
  } else {
    extraHtml += window.buildPinToggleHtml(item.id, item.pinned);
  }
  extraHtml += window.buildFavoriteToggleHtml(item.id, true);
  return window.buildNativeCategoryItemHtml({
    text: item.name,
    buttonClass: 'favorite-course-button',
    dataAttrs: { 'category-id': item.id },
    extraHtml,
    subText: item.summary || ''
  });
}

function buildFavoriteListHtml(items, sortMode) {
  if (!items.length) {
    return `<div style="padding:16px;color:#666;">${t('favorites.empty')}</div>`;
  }
  if (sortMode === 'manual') {
    // 手動モードはfavorites配列の順そのまま（グループ分けしない）
    return items.map((item) => buildFavoriteItemHtml(item, sortMode)).join('');
  }
  const { pinnedItems, groups } = groupFavoriteItems(items);
  let html = '';
  if (pinnedItems.length) {
    html += window.buildNativeSectionHeaderHtml(t('favorites.pinned'));
    html += pinnedItems.map((item) => buildFavoriteItemHtml(item, sortMode)).join('');
  }
  groups.forEach((group) => {
    html += window.buildNativeSectionHeaderHtml(group.name);
    html += group.items.map((item) => buildFavoriteItemHtml(item, sortMode)).join('');
  });
  return html;
}

// favorites配列内で指定IDを前後に移動する
function moveFavorite(categoryId, direction) {
  const favorites = window.getSetting('favorites', []);
  const index = favorites.indexOf(String(categoryId));
  if (index === -1) return;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= favorites.length) return;
  [favorites[index], favorites[newIndex]] = [favorites[newIndex], favorites[index]];
  window.saveSetting('favorites', favorites);
}

function handleFavoritesPanelOpen() {
  window.openNativeOverlay((overlay) => {
    let allItems = [];
    let filterValue = '';

    // 視聴回数バッジの遅延計算用。renderListは絞り込み・並び替えのたびに
    // innerHTMLを丸ごと作り直すため、一度計算した結果はcategoryIdごとに
    // キャッシュして再計算（＝サーバーへの再リクエスト）を避ける。
    const progressCache = new Map();
    const progressGate = window.createConcurrencyGate(4);
    let progressObserver = null;

    // お気に入り星・ピン止めボタンは表示を更新するたびに作り直すので、
    // イベントリスナーもその都度再登録する
    function wireListEvents() {
      const sortMode = window.getSetting('favoritesSortMode', 'category');
      overlay.querySelectorAll('.favorite-course-button').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          if (event.target.closest('.favorite-btn') || event.target.closest('.pin-btn')
            || event.target.closest('.favorite-continue-btn')
            || event.target.closest('.favorite-move-up') || event.target.closest('.favorite-move-down')) return;
          const categoryId = btn.getAttribute('data-category-id');
          if (categoryId) {
            window.removeNativeOverlay();
            window.location.href = `https://v.ouj.ac.jp/view/ouj/#/navi/vod?ca=${categoryId}`;
          }
        });
      });
      overlay.querySelectorAll('.favorite-btn').forEach((favBtn) => {
        const toggle = async (event) => {
          event.stopPropagation();
          event.preventDefault();
          if (favBtn.dataset.busy === '1') return;
          favBtn.dataset.busy = '1';
          const categoryId = favBtn.getAttribute('data-category-id');
          await window.toggleFavorite(categoryId);
          allItems = await createFavoriteListData();
          renderList();
        };
        favBtn.addEventListener('click', toggle);
        favBtn.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle(event);
          }
        });
      });
      overlay.querySelectorAll('.pin-btn').forEach((pinBtn) => {
        const togglePin = async (event) => {
          event.stopPropagation();
          event.preventDefault();
          if (pinBtn.dataset.busy === '1') return;
          pinBtn.dataset.busy = '1';
          const categoryId = pinBtn.getAttribute('data-category-id');
          let pinned = window.getSetting('pinnedFavorites', []);
          pinned = pinned.includes(categoryId) ? pinned.filter((id) => id !== categoryId) : [...pinned, categoryId];
          window.saveSetting('pinnedFavorites', pinned);
          allItems = await createFavoriteListData();
          renderList();
        };
        pinBtn.addEventListener('click', togglePin);
        pinBtn.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            togglePin(event);
          }
        });
      });
      // 「▶続き」ボタン: 最初の未視聴回を探して再生ページへ直行する
      overlay.querySelectorAll('.favorite-continue-btn').forEach((contBtn) => {
        const onContinue = async (event) => {
          event.stopPropagation();
          event.preventDefault();
          if (contBtn.dataset.busy === '1') return;
          contBtn.dataset.busy = '1';
          const categoryId = contBtn.getAttribute('data-category-id');
          contBtn.textContent = t('favorites.searching');
          try {
            const next = await window.findFirstUnfinishedVideo(categoryId);
            if (next) {
              window.removeNativeOverlay();
              window.location.href = `https://v.ouj.ac.jp/view/ouj/#/navi/player?co=${next.contentId}&ct=V&ca=${categoryId}`;
              return;
            }
            window.showInfoNotification(t('favorites.allWatched'));
          } catch (e) {
            window.showErrorNotification(t('favorites.searchFailed'));
          }
          contBtn.textContent = t('favorites.continue');
          contBtn.dataset.busy = '';
        };
        contBtn.addEventListener('click', onContinue);
        contBtn.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onContinue(event);
          }
        });
      });
      // 手動並び替えの↑↓ボタン
      if (sortMode === 'manual') {
        const wireMove = (selector, direction) => {
          overlay.querySelectorAll(selector).forEach((moveBtn) => {
            const onMove = async (event) => {
              event.stopPropagation();
              event.preventDefault();
              moveFavorite(moveBtn.getAttribute('data-category-id'), direction);
              allItems = await createFavoriteListData();
              renderList();
            };
            moveBtn.addEventListener('click', onMove);
            moveBtn.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onMove(event);
              }
            });
          });
        };
        wireMove('.favorite-move-up', -1);
        wireMove('.favorite-move-down', 1);
      }
    }

    // バッジのプレースホルダーに視聴回数を埋める。お気に入りが多いと科目ごとに
    // 動画一覧＋各回の視聴状況を取得するため、科目一覧ページ(page-course-select-progress.js)
    // と同様に、画面内に入った科目だけをIntersectionObserverで遅延計算し、
    // 同時リクエスト数もゲートで制限する。
    function wireProgressBadges() {
      if (!progressObserver) {
        progressObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const badge = entry.target;
            progressObserver.unobserve(badge);
            const categoryId = badge.dataset.categoryId;
            window.getCategoryProgress(categoryId, progressGate)
              .then((result) => {
                progressCache.set(categoryId, result);
                // 再描画で差し替わっていなければ（＝まだDOM上にあれば）反映する
                if (badge.isConnected) fillFavoriteProgressBadge(badge, result);
              })
              .catch(() => {
                progressCache.set(categoryId, null);
                if (badge.isConnected) badge.remove();
              });
          });
        }, { root: null, rootMargin: '100px 0px', threshold: 0 });
      }
      overlay.querySelectorAll('.favorite-progress-badge').forEach((badge) => {
        const categoryId = badge.dataset.categoryId;
        // 計算済みの科目はキャッシュから即反映（再リクエストしない）
        if (progressCache.has(categoryId)) {
          fillFavoriteProgressBadge(badge, progressCache.get(categoryId));
          return;
        }
        progressObserver.observe(badge);
      });
    }

    // 検索ボックスは全体を再描画すると入力中にフォーカスが切れてしまうため、
    // リスト部分（#favorite-native-list）だけを差し替える
    function renderList() {
      const sortMode = window.getSetting('favoritesSortMode', 'category');
      const keyword = filterValue.trim().toLowerCase();
      const filtered = keyword
        ? allItems.filter((item) => item.name.toLowerCase().includes(keyword) || item.parentCategoryName.toLowerCase().includes(keyword))
        : allItems;
      const listEl = overlay.querySelector('#favorite-native-list');
      if (listEl) listEl.innerHTML = buildFavoriteListHtml(filtered, sortMode);
      // 並び順トグルの表示も更新
      const sortToggle = overlay.querySelector('#favorite-sort-toggle');
      if (sortToggle) {
        sortToggle.textContent = sortMode === 'manual' ? t('favorites.sortManual') : t('favorites.sortCategory');
      }
      wireListEvents();
      wireProgressBadges();
    }

    overlay.innerHTML = window.renderNativeShellHtml({
      breadcrumbHtml: window.buildNativeBreadcrumbHtml([{ text: t('menu.favorites') }]),
      extraAsideHtml: `
        ${window.buildNativeSearchBoxHtml({ id: 'favorite-native-search', placeholder: t('favorites.searchPlaceholder') })}
        <div style="padding:0 20px 12px 20px;">
          <span id="favorite-sort-toggle" role="button" tabindex="0" style="display:inline-block;padding:4px 12px;border:1px solid #d1d5db;border-radius:12px;font-size:12px;color:#374151;cursor:pointer;">${t('favorites.sortCategory')}</span>
        </div>
      `,
      asideListHtml: `<div id="favorite-native-list" style="padding:16px;color:#666;">${t('common.loading')}</div>`
    });

    const searchInput = overlay.querySelector('#favorite-native-search');
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        filterValue = event.target.value;
        renderList();
      });
    }

    const sortToggle = overlay.querySelector('#favorite-sort-toggle');
    if (sortToggle) {
      const onToggleSort = () => {
        const current = window.getSetting('favoritesSortMode', 'category');
        window.saveSetting('favoritesSortMode', current === 'manual' ? 'category' : 'manual');
        renderList();
      };
      sortToggle.addEventListener('click', onToggleSort);
      sortToggle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggleSort();
        }
      });
    }

    createFavoriteListData().then((items) => {
      // オーバーレイが（ナビゲーション等で）既に閉じられていれば描画しない
      if (!document.body.contains(overlay)) return;
      allItems = items;
      renderList();
    });
  }, 'favorites');
}

// グローバルwindowに関数を公開
window.createFavoriteListData = createFavoriteListData;
window.handleFavoritesPanelOpen = handleFavoritesPanelOpen;
