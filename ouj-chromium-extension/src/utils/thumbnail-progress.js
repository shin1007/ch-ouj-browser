// サムネイルに再生進捗バーを表示する機能

// 拡張機能自身が描画するネイティブ風パネル(履歴/おすすめ/お気に入り/あとで見る)のオーバーレイID。
// menu-native-shell.jsのNATIVE_OVERLAY_IDと同値だが、content_scriptの読み込み順に依存させない
// ため文字列として個別に持つ。このパネル内の.thumb-mainはbuildNativeVideoItemHtml側で既に
// 進捗を描画済みのため、対象から除外する(含めると進捗バーが二重表示される)。
const OUJ_NATIVE_OVERLAY_SELECTOR = '#ouj-native-overlay';

/**
 * サムネイルに進捗バーを追加する
 * @param {HTMLElement} thumbnailElement - サムネイル要素
 * @param {number} progress - 再生進捗率（0-1の値）
 */
function addProgressBarToThumbnail(thumbnailElement, progress) {
  // 既に進捗バーが追加されている場合はスキップ
  if (thumbnailElement.querySelector('.progress-bar')) {
    return;
  }

  // 進捗バーのコンテナを作成
  const progressContainer = document.createElement('div');
  progressContainer.className = 'progress-bar-container';
  progressContainer.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(0, 0, 0, 0.3);
    z-index: 10;
  `;

  // 進捗バーを作成
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  progressBar.style.cssText = `
    height: 100%;
    background: #0091d9;
    width: ${Math.max(0, Math.min(100, progress * 100))}%;
    transition: width 0.3s ease;
  `;

  progressContainer.appendChild(progressBar);
  thumbnailElement.appendChild(progressContainer);
}

/**
 * サムネイル要素からコンテンツIDを抽出する
 * @param {HTMLElement} thumbnailElement - サムネイル要素
 * @returns {string|null} コンテンツID
 */
function extractContentIdFromThumbnail(thumbnailElement) {
  // img.thumb-imgのsrc属性からcontentIdを抽出
  const img = thumbnailElement.querySelector('img.thumb-img');
  if (img && img.src) {
    const match = img.src.match(/\/vod-contents\/(\d+)\//);
    if (match) {
      return match[1];
    }
  }
  // 既存の親要素探索も残す
  let currentElement = thumbnailElement;
  while (currentElement && currentElement !== document.body) {
    if (currentElement.tagName === 'ION-ITEM' && currentElement.getAttribute('data-content-id')) {
      return currentElement.getAttribute('data-content-id');
    }
    const contentIdMatch = currentElement.innerHTML.match(/contentId["\s]*:["\s]*(\d+)/);
    if (contentIdMatch) {
      return contentIdMatch[1];
    }
    currentElement = currentElement.parentElement;
  }
  return null;
}

/**
 * サムネイルに進捗バーを表示するメイン関数
 */
async function showThumbnailProgress() {
  // サムネイル要素を取得
  const thumbnails = document.querySelectorAll('.thumb-main');

  for (const thumbnail of thumbnails) {
    try {
      // 拡張機能自身のネイティブ風パネル内のサムネイルは進捗描画済みのため対象外
      if (thumbnail.closest(OUJ_NATIVE_OVERLAY_SELECTOR)) {
        continue;
      }
      // コンテンツIDを抽出
      const contentId = extractContentIdFromThumbnail(thumbnail);
      if (!contentId) {
        continue;
      }
      
      // 再生進捗を取得
      const progress = await window.getVideoProgress(contentId);
      
      // 進捗が0より大きい場合のみ進捗バーを表示
      if (progress > 0) {
        addProgressBarToThumbnail(thumbnail, progress);
      }
    } catch (error) {
      console.error('showThumbnailProgress: エラーが発生しました:', error);
    }
  }
}

/**
 * サムネイルの進捗バーを更新する
 */
async function updateThumbnailProgress() {
  const progressBars = document.querySelectorAll('.progress-bar');
  
  for (const progressBar of progressBars) {
    const container = progressBar.closest('.progress-bar-container');
    const thumbnail = container?.parentElement;
    
    if (thumbnail) {
      const contentId = extractContentIdFromThumbnail(thumbnail);
      if (contentId) {
        const progress = await window.getVideoProgress(contentId);
        progressBar.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
      }
    }
  }
}

/**
 * ページ読み込み時にサムネイル進捗を表示する
 */
function initializeThumbnailProgress() {
  // 表示オプション(utils/display-options.js)で非表示にしている場合は、
  // 進捗の取得や監視ごと行わない
  if (typeof window.isOujFeatureVisible === 'function' && !window.isOujFeatureVisible('thumbnail-progress')) return;

  // 初期表示
  showThumbnailProgress();
  
  // 定期的に更新（30分ごと）
  setInterval(updateThumbnailProgress, 30 * 60 * 1000);
  
  // DOM変更を監視して新しいサムネイルが追加されたときに進捗を表示
  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList?.contains('thumb-main') || node.querySelector?.('.thumb-main')) {
              shouldUpdate = true;
            }
          }
        });
      }
    });
    
    if (shouldUpdate) {
      setTimeout(showThumbnailProgress, 100); // 少し遅延させてDOMの構築を待つ
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

window.extractContentIdFromThumbnail = extractContentIdFromThumbnail;

// ページ読み込み時に初期化
// サムネイル一覧(.thumb-main)は動画配信サービス(v.ouj.ac.jp)のAngular画面にのみ存在し、
// WAKABA/通信指導/試験システム等の他サブドメインには存在しないため、対象をv.ouj.ac.jpに絞る。
// (単に'ouj.ac.jp'を含むかだけのチェックだと他サイトでも動作してしまう不具合があったため、
// その保護は保ったまま、対象サブドメインもv.ouj.ac.jpのみに絞り込む)
if (!window.location.href.includes('v.ouj.ac.jp')) {
// v.ouj.ac.jp以外では動作しない
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeThumbnailProgress);
} else {
  initializeThumbnailProgress();
} 