// 検索結果APIの「1ページあたりの件数」を増やすパッチ。
//
// サイトの検索は1ページ30件で、続きは無限スクロールで1ページずつ読む。
// 「自動読み込み」(page-search-result-autoload.js)がONのときは続きをまとめて読むため、
// 1回のリクエストで取れる件数を増やした方が回数も待ち時間も減る。
// 実測（実サイト）:
//   - limit=100 に書き換えてもサイトは100件を正しく表示し、続きも offset=100 → 200 → 300 と
//     正しく続く（重複なし）。サイト側は「受け取った件数」からoffsetを決めているため。
//   - 1リクエストの所要時間は30件でも100件でもほぼ同じ（0.6〜1.3秒）。つまり同じ時間で
//     3倍以上読める。817件なら 27リクエスト → 9リクエスト。
//
// 【重要】このファイルだけは MAIN world（サイト自身のJSと同じ世界）で動く。
// 他の拡張ファイルは isolated world で動くため、サイトのfetch/XHRには触れないため。
// manifest.jsonの2つ目のcontent_scriptsエントリ（world: "MAIN", run_at: document_start）で読み込む。
// MAIN worldではchrome.* APIは使えないので、設定はページと共有しているlocalStorageから直接読む
// （拡張の設定は utils/settings.js が同じlocalStorageに入れている）。
//
// 書き換えるのは「自動読み込みがONのとき」の「検索の一覧取得」だけ。
// 普通に検索しただけのユーザーには従来どおり30件しか取りに行かせない（サーバー負荷を
// 増やさないため）。総件数API（/vod-contents/count?…）やカテゴリ一覧は対象外。
(function () {
  const OUJ_AUTOLOAD_SETTING_KEY = 'searchAutoLoadMore';
  const OUJ_SEARCH_LIST_URL = /\/v1\/tenants\/\d+\/vod-contents\?/;
  const OUJ_PATCHED_PAGE_SIZE = 100;

  function isAutoLoadEnabled() {
    try {
      return localStorage.getItem(OUJ_AUTOLOAD_SETTING_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function rewriteUrl(url) {
    try {
      if (typeof url !== 'string') return url;
      if (!OUJ_SEARCH_LIST_URL.test(url)) return url;
      // q= が付くのは検索の一覧取得のみ。カテゴリ内の一覧などは触らない
      if (!/[?&]q=/.test(url)) return url;
      if (!/[?&]limit=\d+/.test(url)) return url;
      if (!isAutoLoadEnabled()) return url;
      return url.replace(/([?&]limit=)\d+/, `$1${OUJ_PATCHED_PAGE_SIZE}`);
    } catch (e) {
      return url;
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string') {
          return originalFetch.call(this, rewriteUrl(input), init);
        }
        if (typeof Request !== 'undefined' && input instanceof Request) {
          const newUrl = rewriteUrl(input.url);
          if (newUrl !== input.url) return originalFetch.call(this, new Request(newUrl, input), init);
        }
      } catch (e) { /* 失敗しても素通しする（サイトの通信を壊さないことを優先） */ }
      return originalFetch.call(this, input, init);
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    const args = Array.prototype.slice.call(arguments);
    args[1] = rewriteUrl(url);
    return originalOpen.apply(this, args);
  };
})();
