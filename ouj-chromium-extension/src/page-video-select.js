// 動画一覧ページ（video-select）の各回に「あとで見る」トグルを追加する。
// 動画ページのタイトル横ボタン(video-player-actions.js)や回一覧メニュー
// (video-episode-list.js)と同じ「あとで見る」キューを、一覧から直接
// 追加/削除できるようにする。項目のDOM構造は検索結果ページと同じ
// (#common-list-content > ion-item[role="listitem"])。

const VIDEO_SELECT_LIST_SELECTOR = '#common-list-content';

// 「あとで見る」トグル。項目全体がクリックで動画へ遷移するボタンの内側に
// 置くため、click/keydownでstopPropagation+preventDefaultして遷移を止める。
// 入れ子<button>を避けたいので<span role="button">で作る。
function createVideoSelectWatchLaterToggle(contentId, categoryId) {
  const toggle = document.createElement('span');
  toggle.className = 'ouj-video-select-watch-later';
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('tabindex', '0');
  toggle.title = t('videoSelect.watchLaterTooltip');
  // 同じ行に並ぶ視聴状況バッジ(.ouj-result-badges / page-search-result-filters.js)と
  // 縦位置を揃える。inline-flexの既定のvertical-align:baselineは、中身を
  // align-items:centerで中央寄せしているぶんベースラインがずれて下がって見えるため、
  // バッジ側と同じvertical-align:middleを指定する（以前はmargin-topで下げていたが、
  // これがタイトル行に並んだときの不自然なズレの原因だった）
  toggle.style.cssText = `
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-left: 8px;
    padding: 3px 10px;
    border-radius: 14px;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    border: 1px solid #ccc;
    background: #f0f0f0;
    color: #555;
    user-select: none;
    white-space: nowrap;
  `;

  const updateLabel = () => {
    const active = window.isInWatchLater(contentId);
    toggle.textContent = active ? t('videoSelect.watchLaterOn') : t('videoSelect.watchLaterOff');
    toggle.style.background = active ? '#e3f2fd' : '#f0f0f0';
    toggle.style.borderColor = active ? '#90caf9' : '#ccc';
    toggle.style.color = active ? '#1565c0' : '#555';
  };
  updateLabel();

  const onToggle = (event) => {
    event.stopPropagation();
    event.preventDefault();
    const nowActive = window.toggleWatchLater(contentId, categoryId);
    updateLabel();
    window.showSuccessNotification(nowActive ? t('videoSelect.addedToWatchLater') : t('videoSelect.removedFromWatchLater'));
  };
  toggle.addEventListener('click', onToggle);
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle(event);
    }
  });
  return toggle;
}

// 一覧の1項目に「あとで見る」トグルを付ける。既に付いていれば何もしない
function addWatchLaterToggleToVideoItem(item, categoryId) {
  if (item.querySelector('.ouj-video-select-watch-later')) return;
  const contentId = window.extractContentIdFromThumbnail(item);
  if (!contentId) return;
  // タイトル列（.title / 視聴日 が入っている列）の末尾に追加する
  const titleCol = item.querySelector('.list-content-title .col') || item.querySelector('.list-content-title');
  if (!titleCol) return;
  titleCol.appendChild(createVideoSelectWatchLaterToggle(contentId, categoryId));
}

function addWatchLaterButtonsToVideoList() {
  window.waitForElement(VIDEO_SELECT_LIST_SELECTOR, (list) => {
    // categoryIdはページURLの ca= （＝この科目のカテゴリID）。あとで見る一覧から
    // 再生する際の遷移先URL(?co=...&ca=...)に使う
    const applyAll = () => {
      const categoryId = String(window.getCurrentCategoryId() || '');
      list.querySelectorAll(':scope > ion-item[role="listitem"]').forEach((item) => {
        addWatchLaterToggleToVideoItem(item, categoryId);
      });
    };
    applyAll();

    // 項目が非同期/SPA遷移で描画され直しても付け直せるよう監視する。
    // ion-itemは#common-list-contentの直下に追加されるためchildListのみで足りる
    // （subtreeにすると自分が追加したトグルでも監視が再発火してしまう）
    if (list.oujWatchLaterObserverAttached) return;
    list.oujWatchLaterObserverAttached = true;
    const observer = new MutationObserver(() => applyAll());
    observer.observe(list, { childList: true });
  });
}

window.addWatchLaterButtonsToVideoList = addWatchLaterButtonsToVideoList;
