// --- 追加: 前後動画リンク挿入関数 ---
async function insertPrevNextLinks(titleElement) {
  // データがなければ何もしない
  const categoryId = window.getCurrentCategoryId();
  const list = await window.getVideoListInCategory(categoryId);
  // const list = window.videoListInCourse;
  const currentVideoId = window.getCurrentVideoId();
  const idx = list.findIndex(item => String(item.contentId) === String(currentVideoId));
  if (!Array.isArray(list) || typeof idx !== 'number' || idx < 0) {
    return;
  }
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx < list.length - 1 ? list[idx + 1] : null;
  if (!prev && !next) {
    return;
  }
  // 既存のリンクがあれば一度消す
  const old = document.getElementById('prev-next-links');
  if (old) old.remove();

  // リンク用要素生成
  const container = document.createElement('div');
  container.id = 'prev-next-links';
  container.style.cssText = `
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 16px 0;
    padding: 12px 16px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 16px;
  `;
  
  if (prev) {
    const prevLink = document.createElement('a');
    prevLink.href = window.location.href.replace(/co=\d+/, 'co=' + prev.contentId);
    prevLink.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      color: #1976d2;
      text-decoration: none;
      cursor: pointer;
      padding: 16px 20px;
      border-radius: 6px;
      transition: all 0.2s ease;
      background: #fff;
      border: 1px solid #ddd;
      flex: 1;
      min-width: 0;
      min-height: 100px;  
      position: relative;
    `;
    prevLink.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
        <path d="M12 4L6 10L12 16" stroke="#1976d2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div style="overflow: hidden; flex: 1; text-align: center;">
        <div style="font-weight: 600; color: #1565c0; margin-bottom: 6px; font-size: 15px; letter-spacing: 0.5px;">${t('prevNext.prev')}</div>
        <div style="font-size: 14px; color: #424242; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">${prev.title || prev.contentId}</div>
      </div>
    `;
    prevLink.onclick = function(e){ e.preventDefault(); window.location.href = this.href; };
    prevLink.onmouseenter = function() {
      this.style.background = '#e3f2fd';
      this.style.borderColor = '#1976d2';
      this.style.transform = 'translateX(-2px)';
      
      // ツールチップを表示
      if (prev.summary) {
        prevLink.title = prev.summary;
        }
    };
    prevLink.onmouseleave = function() {
      this.style.background = '#fff';
      this.style.borderColor = '#ddd';
      this.style.transform = 'translateX(0)';
    };
    container.appendChild(prevLink);
  } else {
    // 前の動画がない場合は空の要素を追加してレイアウトを維持
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'flex: 1; min-width: 0;';
    container.appendChild(emptyDiv);
  }
  
  // 中央の区切り線
  const separator = document.createElement('div');
  separator.style.cssText = `
    width: 1px;
    height: 100px;
    background: #dee2e6;
    margin: 0 20px;
    flex-shrink: 0;
  `;
  container.appendChild(separator);
  
  if (next) {
    const nextLink = document.createElement('a');
    nextLink.href = window.location.href.replace(/co=\d+/, 'co=' + next.contentId);
    nextLink.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      color: #1976d2;
      text-decoration: none;
      cursor: pointer;
      padding: 16px 20px;
      border-radius: 6px;
      transition: all 0.2s ease;
      background: #fff;
      border: 1px solid #ddd;
      flex: 1;
      min-width: 0;
      min-height: 100px;
      position: relative;
    `;
    nextLink.innerHTML = `
      <div style="overflow: hidden; flex: 1; text-align: center;">
        <div style="font-weight: 600; color: #1565c0; margin-bottom: 6px; font-size: 15px; letter-spacing: 0.5px;">${t('ending.next')}</div>
        <div style="font-size: 14px; color: #424242; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">${next.title || next.contentId}</div>
      </div>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
        <path d="M8 4L14 10L8 16" stroke="#1976d2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    nextLink.onclick = function(e){ e.preventDefault(); window.location.href = this.href; };
    nextLink.onmouseenter = function() {
      this.style.background = '#e3f2fd';
      this.style.borderColor = '#1976d2';
      this.style.transform = 'translateX(2px)';
      
      // ツールチップを表示
      if (next.summary) {
        nextLink.title = next.summary; // ブラウザデフォルトツールチップ
      }
    };
    nextLink.onmouseleave = function() {
      this.style.background = '#fff';
      this.style.borderColor = '#ddd';
      this.style.transform = 'translateX(0)';
      
    };
    container.appendChild(nextLink);
  } else {
    // 次の動画がない場合は空の要素を追加してレイアウトを維持
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'flex: 1; min-width: 0;';
    container.appendChild(emptyDiv);
  }

  // タイトル要素の直後に挿入
  if (titleElement.nextSibling) {
    titleElement.parentNode.insertBefore(container, titleElement.nextSibling);
  } else {
    titleElement.parentNode.appendChild(container);
  }
}


// グローバル関数として公開
window.insertPrevNextLinks = insertPrevNextLinks;