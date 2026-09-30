// --- 回一覧ジャンプメニュー ---
// 前後動画リンク(video-prev-next.js)だけでは、試験前の見直しなどで特定の回に
// 直接飛びたいときに一度コース一覧まで戻る必要があるため、同じ科目内の全話を
// 折りたたみ一覧で表示し、クリックで直接ジャンプできるようにする。
// 各行には視聴済みマーク（クリックで手動の視聴済み/未視聴マークをトグル）と
// 「あとで見る」トグルも表示する。
async function insertEpisodeListMenu(titleElement) {
  const categoryId = window.getCurrentCategoryId();
  // insertPrevNextLinksと同じキャッシュキーを叩くため、直後に呼んでも追加のネットワークリクエストは発生しない
  const list = await window.getVideoListInCategory(categoryId);
  const currentVideoId = window.getCurrentVideoId();

  // categoryIdをawaitの前に確定しているため、await中に別科目の動画へ遷移すると
  // listは古い科目のものになりうる。insertPrevNextLinksと同様、現在の動画が
  // listに含まれない場合は別科目への遷移中の古い呼び出しとみなし、DOMに
  // 触れずに抜ける(ここでold.remove()してしまうと、新しい呼び出しが正しく
  // 挿入した回一覧を古いデータで上書き/消去してしまう)。
  if (!Array.isArray(list) || list.findIndex(item => String(item.contentId) === String(currentVideoId)) < 0) {
    return;
  }

  // 既存のメニューがあれば一度消す(SPA遷移での再構築対策)
  const old = document.getElementById('episode-list-menu');
  if (old) old.remove();

  if (list.length < 2) {
    return;
  }

  const details = document.createElement('details');
  details.id = 'episode-list-menu';
  details.style.cssText = `
    margin: 16px 0;
    padding: 0;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 14px;
  `;

  const summary = document.createElement('summary');
  summary.style.cssText = `
    padding: 12px 16px;
    cursor: pointer;
    font-weight: 600;
    color: #1565c0;
  `;
  summary.textContent = t('episodeList.summary', { n: list.length });
  details.appendChild(summary);

  const listContainer = document.createElement('div');
  listContainer.style.cssText = `
    max-height: 400px;
    overflow-y: auto;
    border-top: 1px solid #ddd;
  `;

  list.forEach((item) => {
    const isCurrent = String(item.contentId) === String(currentVideoId);

    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      background: ${isCurrent ? '#1976d2' : '#fff'};
      border-bottom: 1px solid #eee;
    `;

    const link = document.createElement('a');
    link.href = window.location.href.replace(/co=\d+/, 'co=' + item.contentId);
    if (isCurrent) {
      link.setAttribute('aria-current', 'true');
    }
    link.style.cssText = `
      display: block;
      flex: 1;
      min-width: 0;
      padding: 10px 16px;
      color: ${isCurrent ? '#fff' : '#333'};
      text-decoration: none;
      font-size: 14px;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    link.textContent = item.title || String(item.contentId);
    link.onclick = function (e) {
      e.preventDefault();
      window.location.href = this.href;
    };
    if (!isCurrent) {
      link.onmouseenter = () => { row.style.background = '#e3f2fd'; };
      link.onmouseleave = () => { row.style.background = '#fff'; };
    }
    row.appendChild(link);

    // 視聴済みマーク（クリックで手動マークをトグル）。状態は後から非同期で反映する
    const watchedToggle = document.createElement('span');
    watchedToggle.className = 'episode-watched-toggle';
    watchedToggle.dataset.contentId = item.contentId;
    watchedToggle.setAttribute('role', 'button');
    watchedToggle.setAttribute('tabindex', '0');
    watchedToggle.title = t('episodeList.toggleWatched');
    watchedToggle.style.cssText = `
      flex-shrink: 0;
      padding: 10px 8px;
      cursor: pointer;
      font-size: 14px;
      color: ${isCurrent ? '#bbdefb' : '#ccc'};
      user-select: none;
    `;
    watchedToggle.textContent = '～'; // 読み込み中の仮表示
    row.appendChild(watchedToggle);

    // あとで見るトグル
    const watchLaterToggle = document.createElement('span');
    watchLaterToggle.className = 'episode-watch-later-toggle';
    watchLaterToggle.setAttribute('role', 'button');
    watchLaterToggle.setAttribute('tabindex', '0');
    watchLaterToggle.title = t('episodeList.toggleWatchLater');
    const inWatchLater = typeof window.isInWatchLater === 'function' && window.isInWatchLater(item.contentId);
    watchLaterToggle.style.cssText = `
      flex-shrink: 0;
      padding: 10px 12px 10px 4px;
      cursor: pointer;
      font-size: 13px;
      user-select: none;
    `;
    watchLaterToggle.textContent = inWatchLater ? '✓⏱' : '⏱';
    watchLaterToggle.style.opacity = inWatchLater ? '1' : '0.45';
    watchLaterToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const nowActive = window.toggleWatchLater(item.contentId, categoryId);
      watchLaterToggle.textContent = nowActive ? '✓⏱' : '⏱';
      watchLaterToggle.style.opacity = nowActive ? '1' : '0.45';
    });
    row.appendChild(watchLaterToggle);

    listContainer.appendChild(row);
  });

  details.appendChild(listContainer);

  // titleElementの直後、既にprev-next-linksがあればその後ろに挿入
  const insertAfter = (titleElement.nextSibling && titleElement.nextSibling.id === 'prev-next-links')
    ? titleElement.nextSibling
    : titleElement;
  if (insertAfter.nextSibling) {
    insertAfter.parentNode.insertBefore(details, insertAfter.nextSibling);
  } else {
    insertAfter.parentNode.appendChild(details);
  }

  // 視聴状況を非同期で取得してマークに反映する（同時実行数を制限）。
  // 多くはキャッシュ(40分)から返るため、実際のリクエスト数は限定的
  const gate = window.createConcurrencyGate(3);
  listContainer.querySelectorAll('.episode-watched-toggle').forEach((toggle) => {
    const contentId = toggle.dataset.contentId;
    const applyState = (isFinished) => {
      // 表示文言は言語で変わるため、状態は文言ではなくdata属性で持つ
      toggle.dataset.finished = isFinished ? '1' : '';
      toggle.textContent = isFinished ? t('episodeList.done') : t('episodeList.notDone');
      toggle.style.color = isFinished ? '#2e7d32' : '#bbb';
      toggle.style.fontWeight = isFinished ? 'bold' : 'normal';
    };
    gate.run(() => window.getVideoViewingStatus(contentId)).then((status) => {
      applyState(status.isFinished);
      const onToggle = async (event) => {
        event.stopPropagation();
        // 現在の表示状態の逆を手動マークとして保存する
        const currentlyFinished = toggle.dataset.finished === '1';
        window.setWatchedOverride(contentId, !currentlyFinished);
        applyState(!currentlyFinished);
      };
      toggle.addEventListener('click', onToggle);
      toggle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle(event);
        }
      });
    }).catch(() => {
      toggle.textContent = '';
    });
  });
}

// グローバル関数として公開
window.insertEpisodeListMenu = insertEpisodeListMenu;
