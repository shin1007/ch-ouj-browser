function iconHtml(iconName) {
  return `<ion-icon name="${iconName}" class="icon icon-md ion-md-${iconName} item-icon" aria-label="${t('common.favorites')}" style="font-size:20px;"></ion-icon>`;
}
async function addFavoriteButtonToBreadCrumbs() {
    const categoryId = window.getCurrentCategoryId();
    if (!categoryId) {
        addCategoryIdToUrl();
        // カテゴリIDが取得できない場合はボタンを表示しない
        return;
    }

    // 挿入位置の存在確認
    const videoListSelector = '#main > main-vod-list > ion-content > div.scroll-content > vod-list-navigator > aside > div > ul > li:last-child ';
    const videoSelector =     '#main > main-player   > ion-content > div.scroll-content > player > vod-list-navigator > aside > div > ul > li:last-child';
    // #main > main-player > ion-content > div.scroll-content > player > vod-list-navigator > aside > div > ul > li:nth-child(3)
    // const selctor = document.querySelector(videoSelector) || document.querySelector(videoListSelector);
    // 要素が見つからない間は上限なしにリトライするため、対象要素が現れないまま
    // 別ページへ遷移した場合にタイマーが残り続けないよう、開始時点のURLと比較して打ち切る
    // (遷移先ページの分はcontent.js経由でこの関数自体が改めて呼ばれる)
    const startUrl = window.location.href;
    const aside = document.querySelector(videoSelector) || document.querySelector(videoListSelector);
    if (!aside) {
        setTimeout(() => {
            if (window.location.href !== startUrl) return;
            addFavoriteButtonToBreadCrumbs();
        }, 100);
        return;
    }

    // 現在のカテゴリIDを取得
    const categoryIdStr = categoryId.toString();
    
    // 既にお気に入りボタンがある場合は何もしない
    if (aside.querySelector('.favorite-button')) {
        return;
    }
    
    // お気に入りボタンを作成
    const favBtn = document.createElement('button');
    favBtn.id = 'favorite-button';
    favBtn.className = 'favorite-button';    
    favBtn.style.background = 'transparent';
    favBtn.style.transition = 'background 0.2s';
    favBtn.onmouseover = () => { favBtn.style.background = '#e0e0e0'; };
    favBtn.onmouseout = () => { favBtn.style.background = 'transparent'; };
    
    // お気に入りの状態を取得
    const isFavorite = window.isFavorite(categoryIdStr);
    favBtn.innerHTML = iconHtml(isFavorite ? 'star' : 'star-outline');
    
    // クリックイベントを追加
    favBtn.addEventListener('click', async (event) => {
        // ほかのイベントが発火しないようにする
        event.stopPropagation();
        event.preventDefault();

        // ボタンを一時的に無効化
        favBtn.disabled = true;
        const newIsFavorite = await window.toggleFavorite(categoryIdStr);
        favBtn.innerHTML = iconHtml(newIsFavorite ? 'star' : 'star-outline');
        // ボタンを再度有効化
        favBtn.disabled = false;
    }
    );
    // asideの子要素として追加
    aside.appendChild(favBtn);
}
async function addCategoryIdToUrl() {
  // 現在のURLを取得
  const currentUrl = new URL(window.location.href);
  
  const contentId = await window.getCurrentContentId().toString();
  const category = await window.getCategoryDataFromContentId(contentId);
    if (!category) {
      console.warn('[OUJ拡張] カテゴリIDが取得できませんでした。');
      return;
    }
  
  // URLのハッシュに`&ca=${category.categoryId}`を追加
  currentUrl.hash += `&ca=${category.categoryId}`;
  
    
  // URLを更新
  window.history.replaceState({}, '', currentUrl.toString());
  // ページをリロード
  window.location.reload();
}
window.addFavoriteButtonToBreadCrumbs = addFavoriteButtonToBreadCrumbs;