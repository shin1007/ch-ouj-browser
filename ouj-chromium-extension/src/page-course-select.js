
// 科目一覧の各動画にお気に入りボタンを追加
async function addFavoriteButtonsToCategoryList() {
  // 追加前に既存の.favorite-btnを全て削除
  document.querySelectorAll('.favorite-btn').forEach(btn => btn.remove());

  const ca = window.getCurrentCategoryId();
  if (!ca) {
    return;
  }
  // getChildIdsのawait中に別の科目一覧ページへ遷移すると、childCategories(古いページの
  // カテゴリ)とitems(新しいページのDOM)がインデックスでずれ、お気に入り星が別科目に
  // 誤って紐付いてしまう。取得開始時点のURLを記録し、変わっていたら描画をやめる
  // (遷移先のページはcontent.js経由で改めてこの関数が呼ばれる)
  const startUrl = window.location.href;
  const childCategories = await window.getChildIds(ca);
  if (window.location.href !== startUrl) return;
  const favorites = typeof window.getFavorites === 'function' ? window.getFavorites() : [];

  // ion-list#common-list-content内のion-itemを全て取得
  const items = document.querySelectorAll('#main div.icon-text > .icon-area');
  
  // childCategoriesとitemsを一緒にループ（Pythonのzipのような動作）
  const minLength = Math.min(childCategories.length, items.length);
  
  for (let i = 0; i < minLength; i++) {
    const item = items[i];
    const category = childCategories[i];
    
    // すでに追加済みならスキップ（item.parentNode全体で確認）
    if (item.parentNode.querySelector('.favorite-btn')) {
      continue;
    }

    // お気に入り星・進捗バッジ・続きボタンをまとめる共有コンテナ(utils/progress-badge.js)。
    // 幅が足りない時にこれらがバラバラにではなく「まとまって」2行目へ折り返されるようにする
    const actions = typeof window.getOujCourseRowActions === 'function'
      ? window.getOujCourseRowActions(item.parentNode)
      : item.parentNode;
    
    // お気に入りボタン作成
    const favBtn = document.createElement('button');
    // ouj-course-fav-btnは表示オプション(utils/display-options.js)で
    // 「科目一覧のお気に入り星」だけを隠すための目印。お気に入りパネル内の
    // .favorite-btn（menu-native-shell.js）を巻き込まないよう別クラスにしている
    favBtn.className = 'favorite-btn ouj-course-fav-btn';
    favBtn.title = t('common.favorites');
    favBtn.style.display = 'inline-flex';
    favBtn.style.alignItems = 'center';
    favBtn.style.justifyContent = 'center';
    favBtn.style.padding = '2px 16px'; // クリック領域拡大
    favBtn.style.border = 'none';
    favBtn.style.background = 'transparent';
    favBtn.style.cursor = 'pointer';
    favBtn.style.borderRadius = '8px';
    favBtn.style.transition = 'background 0.2s';
    favBtn.style.marginLeft = '8px';
    favBtn.onmouseover = () => favBtn.style.background = 'rgba(0,0,0,0.07)';
    favBtn.onmouseout = () => favBtn.style.background = 'transparent';
    
    // お気に入り状態に応じてアイコンを決定
    const isFavorite = window.isFavorite(category.categoryId);
    const iconName = isFavorite ? 'star' : 'star-outline';
    const iconClass = isFavorite ? 'ion-md-star' : 'ion-md-star-outline';
    
  favBtn.innerHTML = `<ion-icon name="${iconName}" class="icon icon-md ${iconClass} item-icon" aria-label="${t('common.favorites')}" style="font-size:24px;"></ion-icon>`;
    
    // クリックイベントを追加
    favBtn.addEventListener('click', async (event) => {
      // ほかのイベントが発火しないようにする
      event.stopPropagation();
      event.preventDefault();

      const categoryId = category.categoryId.toString();
      favBtn.disabled = true;
      const newIsFavorite = await window.toggleFavorite(categoryId);
      const newIconName = newIsFavorite ? 'star' : 'star-outline';
      const newIconClass = newIsFavorite ? 'ion-md-star' : 'ion-md-star-outline';
      favBtn.innerHTML = `<ion-icon name="${newIconName}" class="icon icon-md ${newIconClass} item-icon" aria-label="${t('common.favorites')}" style="font-size:24px;"></ion-icon>`;
      favBtn.disabled = false;
    });
    
    // タイトルの右側に追加
    actions.appendChild(favBtn);
  }
}

async function waitThenAddFavBtnToCategoryList(startUrl) {
  // 上限なしにリトライするため、待っている間に別ページへ遷移したら打ち切る
  // (遷移先ページの分はcontent.js経由でこの関数が改めて呼ばれる)
  if (startUrl === undefined) startUrl = window.location.href;
  if (window.location.href !== startUrl) return;
  // getChildIds関数が利用可能かチェック
  if (typeof window.getChildIds !== 'function') {
    setTimeout(() => waitThenAddFavBtnToCategoryList(startUrl), 100);
    return;
  }
  const ca = window.getCurrentCategoryId();
  if (!ca) {
    return;
  }
  // categoryIdからsummaryを取得、なければ何もしない
  const categories = await window.getCategoriesData();
  const childCategories = await window.getChildIds(ca);
  if (window.location.href !== startUrl) return;
  // 子カテゴリのsummaryが1つでも存在するかチェック
  const hasSummaryInChildren = childCategories.some(child => {
    const cat = categories.find(c => c.categoryId === child.categoryId);
    return cat && cat.summary;
  });
  if (!hasSummaryInChildren) {
    return;
  }
  // getFavorites関数が利用可能かチェック
  if (typeof window.getFavorites !== 'function') {
    setTimeout(() => waitThenAddFavBtnToCategoryList(startUrl), 100);
    return;
  }
  const items = document.querySelectorAll('#main div.icon-text > .icon-area');
  if (!items.length) {
    setTimeout(() => waitThenAddFavBtnToCategoryList(startUrl), 100);
    return;
  }
  await addFavoriteButtonsToCategoryList();

}
window.waitThenAddFavBtnToCategoryList = waitThenAddFavBtnToCategoryList;