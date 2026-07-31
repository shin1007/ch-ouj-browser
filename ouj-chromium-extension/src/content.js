

async function main() {

  // 画面種別を判定して処理を分岐
  const pageType = await window.detectOujPageType(window.location.href);

  if (pageType.subDomain === 'sso') {
    // ログイン画面の処理
    await window.waitForPasswordAndLogin();
    // ログイン成功している場合はホームページに遷移
    // HTML内に「ログインしました」があれば成功しているとして扱う。
    // ただし遷移先(referTo)がv.ouj.ac.jp以外(システムWAKABA等)の場合にまで
    // ここでv.ouj.ac.jpへ強制遷移すると、CAS自身のservice遷移(本来の行き先)を
    // 横取りしてしまうため、v.ouj.ac.jp向けログインの場合のみ行う。
    if (pageType.referTo && pageType.referTo.subDomain === 'v'
        && document.body.innerHTML.includes('ログインしました')) {
      window.location.href = 'https://v.ouj.ac.jp/view/ouj/#/navi/home';
    }
    return;
  }
  if (pageType.subDomain !== 'v') {
    // v.ouj.ac.jp以外のサブドメインの場合は何もしない
    return;
  }
  // ログイン/ログアウトのタイミングで授業一覧(カテゴリ)を取得しなおすための監視を開始する。
  // ログイン前後で取得できる授業一覧が変わる(実測: ゲスト274件→ログイン529件)ため、状態が
  // 切り替わったらキャッシュ(cachedCategoriesData)を破棄する。監視の実体は login-state.js。
  if (typeof window.startOujLoginStateWatcher === 'function') {
    window.startOujLoginStateWatcher((newState) => {
      // ログイン直後(→ログイン済み)は、表示中の内容も最新の授業一覧で描き直す。
      // ログアウト方向はサイト側が自然にページをリロードするためここでは描き直さない
      // (遷移直前の再取得で古い一覧をキャッシュし直す事故を避ける)。
      if (newState === 'user') {
        window.oujLastMainTime = 0;
        callSafeMainOnce();
      }
    });
  }
  // 表示オプション（utils/display-options.js）で非表示にされた機能は挿入しない。
  // 各機能の表示/非表示はメニューの「表示オプション」から切り替える。
  const isVisible = (featureId) => (
    typeof window.isOujFeatureVisible !== 'function' || window.isOujFeatureVisible(featureId)
  );
  // 設定を切り替えた直後だけでなく、SPAの画面遷移で作り直された要素にも効くよう
  // ページ処理のたびに非表示用スタイルを入れ直す
  if (typeof window.applyOujDisplayOptionStyles === 'function') {
    window.applyOujDisplayOptionStyles();
  }

  window.insertLeftMenu();
  if (isVisible('header-darkmode')) window.insertHeaderDarkModeToggle();
  if (isVisible('header-collapse')) window.insertHeaderCollapseToggle();
  if (isVisible('header-wakaba')) window.insertHeaderWakabaLink();
  window.startMenuOpeningMutationObserver();
  restoreOujOpenNativePanelIfAny();
  // 検索ボックス(#searchText)フォーカス時のクイック絞り込みパネル（全ページ共通）
  if (typeof window.initSearchBoxFilterPanel === 'function' && isVisible('search-box-panel')) {
    window.initSearchBoxFilterPanel();
  }

  // SPA遷移対策: 前ページで挿入したフィルターバーが、Ionicの#common-list-content等の
  // DOM再利用によって残ることがある。ページ切り替えのたびに一旦除去し、必要なページ
  // (検索結果/回一覧 は search-result-filter-bar、科目一覧 は course-list-filter-bar、
  // フォルダツリーページ は course-folder-browse-bar)だけが下の分岐で作り直す。これにより
  // コース一覧(例: ca=3 大学院)に検索結果フィルタバーが残ってしまう問題を防ぐ。
  ['search-result-filter-bar', 'course-list-filter-bar', 'course-folder-browse-bar'].forEach((id) => {
    const staleBar = document.getElementById(id);
    if (staleBar) staleBar.remove();
  });

  if (pageType.page === 'home') {
    // ホームページの処理を呼び出す
    // 「続きから見る」パネルは自動ログイン判定と並行して挿入する
    if (typeof window.insertHomeContinuePanel === 'function' && isVisible('home-continue')) {
      window.insertHomeContinuePanel();
      // ヘッダーロゴクリック等、URLが変化しない「ホームの作り直し」でパネルが
      // 消えたままにならないよう監視する(内部で多重起動防止済み、詳細は
      // page-home-continue.js参照)
      if (typeof window.startHomeContinuePanelObserver === 'function') {
        window.startHomeContinuePanelObserver();
      }
    }
    await window.handleHomePageAutoLogin();
  } else if (pageType.page === 'search-result') {
    if (isVisible('search-result-filters')) window.initializeSearchResultFilters();
  } else if (pageType.page === 'player') {
    if (isVisible('breadcrumb-favorite')) window.addFavoriteButtonToBreadCrumbs();
    window.initializeVideoPlayer();
  } else if (pageType.page === 'series-select') {
    if (isVisible('course-favorite')) window.waitThenAddFavBtnToCategoryList();
    if (isVisible('course-progress')) window.waitThenAddProgressBadgesToCategoryList();
    // 科目フォルダ一覧の絞り込み(テレビ/ラジオ・字幕・未完了・視聴途中)
    if (typeof window.initializeCourseListFilters === 'function' && isVisible('course-filters')) {
      window.initializeCourseListFilters();
    }
  } else if (pageType.page === 'video-select') {
    if (isVisible('breadcrumb-favorite')) window.addFavoriteButtonToBreadCrumbs();
    if (isVisible('video-select-watch-later')) window.addWatchLaterButtonsToVideoList();
    // 回一覧は検索結果と同じDOMなのでフィルタ機構を流用(視聴状況フィルタ+並び替え)
    if (typeof window.initializeSearchResultFilters === 'function' && isVisible('search-result-filters')) {
      window.initializeSearchResultFilters('video-select');
    }
  } else {
    // その他の処理
  };
}

// 拡張機能のパネル(お気に入り/履歴/おすすめ等、menu-native-shell.jsの
// オーバーレイ)は画面更新(F5)するとDOM/JSごと消え、パネルが開いていたはずが
// いつの間にか元のネイティブ画面に戻ってしまう不具合があった。開いていた
// パネルのidはsessionStorageに記録してある(menu-native-shell.js)ので、
// リロード後にここで読み直して同じパネルを自動的に開き直す。SPA内の通常の
// 画面遷移では遷移時点でオーバーレイ側が自分でこの記録を消すため、ここでは
// 「本当に画面更新等で開きっぱなしのまま来た場合」だけが復元対象になる。
function restoreOujOpenNativePanelIfAny() {
  if (typeof window.getOujOpenNativePanelId !== 'function') return;
  const pendingPanelId = window.getOujOpenNativePanelId();
  if (!pendingPanelId || window.isOujNativeOverlayOpen()) return;
  const panelOpenHandlers = {
    favorites: window.handleFavoritesPanelOpen,
    watchlater: window.handleWatchLaterPanelOpen,
    bookmarks: window.handleBookmarksPanelOpen,
    history: window.handleHistoryPanelOpen,
    recommend: window.handleRecommendPanelOpen,
    studytime: window.handleStudyTimePanelOpen,
    whatsnew: window.handleWhatsNewPanelOpen,
    displayoptions: window.handleDisplayOptionsPanelOpen,
    'all-subjects-filter': window.handleAllSubjectsFilterPanelOpen
  };
  const openPanel = panelOpenHandlers[pendingPanelId];
  if (typeof openPanel !== 'function') return;
  // オーバーレイの挿入先(#main)はAngular/Ionic側の描画が終わるまで存在しない
  // ことがあるため、現れるまで待ってから開く
  window.waitForElement('#main', openPanel, 100, 50);
}

function safeMain() {
  
  const missing = [];
  if (typeof window.insertLeftMenu !== 'function') missing.push('waitForLogoAndInsertMenu');
  if (typeof window.getCategoriesData !== 'function') missing.push('getCategoriesData');
  if (typeof window.waitThenAddFavBtnToCategoryList !== 'function') missing.push('waitThenAddFavToCategoryList');
  if (typeof window.addFavoriteButtonToBreadCrumbs !== 'function') missing.push('addFavoriteButtonToBreadCrumbs');
  if (typeof window.getCurrentCategoryId !== 'function') missing.push('getCurrentCategoryId');
  if (typeof window.getFavorites !== 'function') missing.push('getFavorites');
  if (typeof window.categoriesUsedAsParent !== 'function') missing.push('parentCategories');
  
  if (missing.length > 0) {
    if (safeMain._warned !== missing.join(',')) {
      console.error('[OUJ拡張] グローバル関数未定義:', missing.join(', '));
      safeMain._warned = missing.join(',');
    }
    setTimeout(safeMain, 50);
    return;
  }
  
  main();
}

// safeMain()を一度だけ呼ぶ仕組み
window.oujLastMainTime = 0;
function callSafeMainOnce() {
  const now = Date.now();
  if (now - window.oujLastMainTime > 500) {
    window.oujLastMainTime = now;
    safeMain();
  }
}

// content.jsは、manifest.jsonの宣言的content_scripts(document_end)と、
// background.jsのwebNavigation.onCompletedによる再注入の両方から、同じページに対して
// 実行されることがある(background.js側は宣言的注入の補助として残っている)。実機で
// 検証したところ、この2つの注入経路は別々の分離ワールドとして実行され、window.*の状態
// (oujLastMainTime等)を共有できず、ここから下がまるごと二重に実行されてしまっていた。
// これによりmain()が多重実行され、UI要素の重複挿入(例: page-login.jsの遷移先案内
// バナーが2つ出る不具合をPlaywrightテストで確認)やAPIリクエストの倍増を引き起こしていた。
// window.*ではなくDOM上の属性は分離ワールド間でも共有されるため、これを
// 「このページで下記の初期化を実行済みか」の判定に使うことで二重実行を防ぐ。
if (!document.documentElement.hasAttribute('data-ouj-content-script-loaded')) {
  document.documentElement.setAttribute('data-ouj-content-script-loaded', '1');

  if (!window.location.href.includes('ouj.ac.jp')) {
  // 'ouj.ac.jp'をURLに含まない場合は動作をしない
  // ほかのサイトで動作をしてしまう不具合があったので念のために入れている
  } else if (document.readyState === "complete" || document.readyState === "interactive") {
    console.log("[OUJ拡張 DEBUG] DOM is already loaded");
    callSafeMainOnce();
  } else {
    console.log("[OUJ拡張 DEBUG] Waiting for DOM to be loaded");
    document.addEventListener("DOMContentLoaded", callSafeMainOnce);
  }

  // SPA対応: URL変化を監視してsafeMain()を再実行
  if (!window.location.href.includes('ouj.ac.jp')) {
  // 'ouj.ac.jp'をURLに含まない場合は動作をしない
  // ほかのサイトで動作をしてしまう不具合があったので念のために入れている
  } else {
    console.log("[OUJ拡張 DEBUG] URL listener added");
    (function() {
      let lastUrl = location.href;
      let pollingInterval = null; // ポーリング用のインターバルID

      // URLの変更を検知してメイン処理を呼び出す共通関数
      const handleUrlChange = (source) => {
        // requestAnimationFrameを使い、DOMの更新を待ってから処理を実行
        requestAnimationFrame(() => {
          const currentUrl = location.href;
          if (currentUrl !== lastUrl) {
            // console.log(`[OUJ拡張 DEBUG] URL change detected by ${source}. last: ${lastUrl}, current: ${currentUrl}`);
            // ログイン/ログアウトに伴う授業一覧キャッシュの破棄は、URL遷移ではなく実際の
            // ログイン状態の変化を見る login-state.js の監視(startOujLoginStateWatcher)に一本化した。
            // ログアウトは .../logout/cas 経由でログイン画面URLを通らず、従来のURL判定では
            // 捕捉できなかったため。

            lastUrl = currentUrl;
            window.oujLastMainTime = 0;
            // pushState/replaceStateによる遷移はネイティブのhashchange/popstateを
            // 発火しないため、それらだけを監視している他の機能(menu-native-shell.jsの
            // オーバーレイ自動クローズ等)がこの種の遷移を取りこぼす。ここで検知した
            // URL変化を汎用イベントとして流し、そちら側でも拾えるようにする
            window.dispatchEvent(new Event('ouj:locationchange'));
            callSafeMainOnce();
          }
        });
      };

      // history.pushState/replaceStateをフック
      ["pushState", "replaceState"].forEach(type => {
        const original = history[type];
        history[type] = function() {
          const result = original.apply(this, arguments);
          handleUrlChange(`history.${type}`);
          return result;
        };
      });

      // popstate (戻る/進む) と hashchange (ハッシュ変更) を監視
      window.addEventListener("popstate", () => handleUrlChange("popstate"));
      window.addEventListener("hashchange", () => handleUrlChange("hashchange"));

      // ★★★ フォールバックとしてURLのポーリングを追加 ★★★
      const startPolling = () => {
        if (pollingInterval) return; // 既に開始している場合は何もしない
        pollingInterval = setInterval(() => {
          if (location.href !== lastUrl) {
            handleUrlChange('polling');
          }
        }, 250); // 250ミリ秒ごとにチェック
      };

      startPolling();
    })();
  }
}
