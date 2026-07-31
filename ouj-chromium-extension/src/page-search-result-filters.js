// 検索結果ページの絞り込み機能(テレビ/ラジオ・字幕ありのみ・未完了のみ・視聴途中のみ・年度・コース)
//
// 種別/字幕/視聴状況/年度/コースの判定にはcontentId単位のAPIリクエストが必要になるため、
// page-course-select-progress.jsと同様にIntersectionObserverで画面内に入った
// 項目だけを対象に、同時実行数を制限しながら遅延分類する。フィルタが1つも有効でない間は
// 未分類の項目も隠さず表示し続けるが、フィルタが有効な間は未分類の項目を分類完了まで
// 一旦隠す(isAnyResultFilterActive/applyFiltersToItem)。後から対象外と判明した項目が
// 表示済み一覧から脱落して下の項目が繰り上がる(=並びが入れ替わって見える)ことを防ぐため。
// ただし年度・コースの「選択肢一覧」自体はこの遅延分類を待たない。サイト全体の
// 授業一覧(loadYearCourseOptions、page-search-result-filter-bar.js側)から直接求めるため、
// スクロールや個々の項目の分類完了を待たずに揃う(選んだ年度・コースが今回の検索結果に
// 無ければ0件表示になる)。
//
// 検索結果ページ(se=)だけでなく、動画一覧ページ(ca=の回一覧＝video-select)も同じ
// #common-list-content > ion-item[role="listitem"] 構造なので、この機構を流用する。
// video-selectは1科目内の回一覧のため媒体/字幕/年度/コースは全回で共通になり、これらで
// 絞ると全件が消えるだけになる。そこで video-select では視聴状況(未完了/視聴途中)フィルタ
// と並び替えのみを有効にし、媒体/字幕/年度/コース・最近の検索は出さない。分岐はlist要素上の
// oujFilterContext('search' | 'video-select')で行う(getSearchFilterState / renderFilterBar /
// classifySearchResultItem)。科目フォルダの一覧(series-select)は別DOMのため
// page-course-select-filters.jsで対応する。
//
// 本ファイルは判定・絞り込み・並び替えロジックと初期化(IntersectionObserver等)を担当する。
// フィルターバーの描画(チップ/年度・コースドロップダウン等のUI生成)はpage-search-result-filter-bar.js
// に分割した。content scriptは各ファイルが独立スコープのため、双方向で参照する関数
// (getSearchFilterState/applyFilters/applySearchResultSort ↔ renderFilterBar/hideNativeSortControl)
// はwindow.*経由で呼び合う。

const SEARCH_RESULT_FILTER_LIST_SELECTOR = '#common-list-content';

// menu-native-shell.jsのrenderNativeVideoListMainHtml(お気に入り/履歴/おすすめ動画パネル)も
// 同じid="common-list-content"を持つ要素を#ouj-native-overlay内に生成する。document.querySelectorは
// ID重複時に文書順で最初の要素を返すため、本来ページ側の#common-list-contentがまだ描画され切って
// いない瞬間にこれらのパネルが開いていると、オーバーレイ側の同名ID要素を誤って掴んでしまう
// (page-course-select-filters.jsのqueryCourseItemsで実際に確認したのと同じ理屈)。
// オーバーレイ内の要素は常に除外し、本来のページ側だけを対象にする。
function querySearchResultList() {
  return Array.from(document.querySelectorAll(SEARCH_RESULT_FILTER_LIST_SELECTOR))
    .find((el) => !el.closest('#ouj-native-overlay')) || null;
}

// フィルタの判定結果(dataset.oujFilterHidden)に応じて表示/非表示を切り替える共通関数。
// 以前は重複講義の非表示機能(page-search-result.js)もこのdatasetと合わせて判定していたが、
// 重複扱いされた科目が検索結果から見えなくなるのは望ましくないとのことでその機能自体を廃止した。
//
// コンパクト表示(page-search-result-compact.js)がONの間は、同じ科目の回を1行にまとめる都合で
// 「絞り込みでは残るが、まとめ役の行に集約したので隠す」項目が出る。まとめ側の判断
// (dataset.oujCompactState)を絞り込みより優先する。分類完了のたびに呼ばれる
// applyFiltersToItemが、まとめて隠した項目を表示し直してしまうのを防ぐため
function updateSearchResultItemVisibility(item) {
    const compactState = item.dataset.oujCompactState;
    if (compactState === 'shown' || compactState === 'hidden') {
      item.style.display = compactState === 'hidden' ? 'none' : '';
      return;
    }
    item.style.display = item.dataset.oujFilterHidden === 'true' ? 'none' : '';
}

const SEARCH_FILTER_SETTINGS_KEYS = {
  media: 'searchFilterMedia', // {tv: boolean, radio: boolean}。テレビ/ラジオはOR条件。既定(未操作時)は両方ONで「すべて」、両方OFFにすると0件になる
  captionOnly: 'searchFilterCaptionOnly',
  // 「未完了のみ」= 視聴が完了していない(done以外)を表示。キー名は旧「未視聴のみ」の
  // ものを流用し、既存ユーザーの選択状態を引き継ぐ
  incompleteOnly: 'searchFilterUnwatchedOnly',
  partialOnly: 'searchFilterPartialOnly',
};

// 媒体(テレビ/ラジオ)絞り込みの現在値を読む。{tv, radio}の真偽値。テレビ/ラジオは
// 全項目がどちらかに分類される排他的なOR条件なので、両方ONは「すべて表示」、
// 両方OFFは「どちらも要らない」＝0件表示になる。一度も操作していない(設定未保存=raw===null)
// 場合だけは両方ONを既定値にし、初回訪問時にいきなり0件になるのを防ぐ。旧形式
// ('all'|'tv'|'radio'の単一選択だった頃の設定値)が残っていれば新形式に読み替える
function getMediaFilterState(mediaKey) {
  const raw = window.getSetting(mediaKey, null);
  if (raw && typeof raw === 'object') return { tv: !!raw.tv, radio: !!raw.radio };
  if (raw === 'tv') return { tv: true, radio: false };
  if (raw === 'radio') return { tv: false, radio: true };
  return { tv: true, radio: true };
}

// 分類済み項目の媒体が現在の絞り込みで隠れる対象か。テレビ/ラジオ両方ONなら常に表示、
// 両方OFFなら('tv'/'radio'いずれとも一致しないため)常に隠れる
function isMediaFilterHidden(itemMedia, mediaState) {
  return !((mediaState.tv && itemMedia === 'tv') || (mediaState.radio && itemMedia === 'radio'));
}

// 検索キーワード履歴（最近の検索チップ用）
const SEARCH_KEYWORD_HISTORY_KEY = 'searchKeywordHistory';
const SEARCH_KEYWORD_HISTORY_MAX = 8;

// 年度・コースの絞り込みは検索ごとに選択肢が変わる（別検索に持ち越すと意図せず全件が
// 隠れる）ため、設定には保存せずlist要素上のプロパティ(oujYearFilter/oujCourseFilter、
// いずれも選択値の配列。複数選択可能で、空配列は「すべて」)で現在の検索結果表示中のみ保持する
function getSearchFilterState(list) {
  const incompleteOnly = window.getBooleanSetting(SEARCH_FILTER_SETTINGS_KEYS.incompleteOnly, false);
  const partialOnly = window.getBooleanSetting(SEARCH_FILTER_SETTINGS_KEYS.partialOnly, false);
  // video-select(1科目の回一覧)では媒体/字幕/年度/コースは全回共通。これらで絞ると全件が
  // 消えるだけ(例: プリセットで「ラジオのみ」を選んだままテレビ科目を開くと空になる)なので、
  // 保存済みの設定値に関わらず無効化し、視聴状況フィルタのみ効かせる。media は両方ONが
  // 「絞り込み無し」を表す値なので、無効化にはそちらを使う(両方OFFは0件を表す値になった)
  if (list && list.oujFilterContext === 'video-select') {
    return { media: { tv: true, radio: true }, captionOnly: false, incompleteOnly, partialOnly, year: [], courseId: [] };
  }
  return {
    media: getMediaFilterState(SEARCH_FILTER_SETTINGS_KEYS.media),
    captionOnly: window.getBooleanSetting(SEARCH_FILTER_SETTINGS_KEYS.captionOnly, false),
    incompleteOnly,
    partialOnly,
    year: (list && Array.isArray(list.oujYearFilter)) ? list.oujYearFilter : [],
    courseId: (list && Array.isArray(list.oujCourseFilter)) ? list.oujCourseFilter : [],
  };
}

// 現在のURLから検索キーワード（se=パラメータ）を取り出して履歴に保存する。
// rawはURLに入っていたそのままの値（再検索時にそのまま使う）、labelは表示用のデコード済み文字列
function recordSearchKeyword() {
  const match = window.location.href.match(/[?&]se=([^&]+)/);
  if (!match) return;
  const raw = match[1];
  let label = raw;
  try {
    label = window.decodeURLComponentSafe(`se=${raw}`);
  } catch (e) { /* デコード失敗時はrawのまま表示 */ }
  if (!label || !label.trim()) return;
  let history = window.getSetting(SEARCH_KEYWORD_HISTORY_KEY, []);
  if (!Array.isArray(history)) history = [];
  history = history.filter((item) => item.label !== label);
  history.unshift({ raw, label });
  if (history.length > SEARCH_KEYWORD_HISTORY_MAX) history = history.slice(0, SEARCH_KEYWORD_HISTORY_MAX);
  window.saveSetting(SEARCH_KEYWORD_HISTORY_KEY, history);
}

// 分類結果（字幕・視聴状況）を項目上に常時表示する小さなバッジ。
// テレビ/ラジオはサムネイルから自明なのでバッジには出さない
function applyBadgesToItem(item) {
  if (item.dataset.oujClassified !== 'done') return;
  if (item.querySelector('.ouj-result-badges')) return;
  const titleEl = item.querySelector('.list-content-title .title') || item.querySelector('.title');
  if (!titleEl) return;
  const badges = document.createElement('span');
  badges.className = 'ouj-result-badges';
  badges.style.cssText = 'display:inline-flex;gap:4px;margin-left:8px;vertical-align:middle;';
  const makeBadge = (text, bg, color) =>
    `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:normal;background:${bg};color:${color};white-space:nowrap;">${text}</span>`;
  let html = '';
  if (item.dataset.oujCaption === '1') {
    html += makeBadge('字幕あり', '#e8f5e9', '#2e7d32');
  }
  if (item.dataset.oujWatchState === 'done') {
    html += makeBadge('✓ 視聴済み', '#dcedc8', '#33691e');
  } else if (item.dataset.oujWatchState === 'partial') {
    html += makeBadge(`途中 ${item.dataset.oujWatchPercent || ''}%`, '#fff3e0', '#e65100');
  }
  if (!html) return;
  badges.innerHTML = html;
  titleEl.appendChild(badges);
}

// 検索結果1件を分類する。分類できた項目のみdataset.oujClassified='done'になる。
// gateは呼び出し元(startSearchFilterObserver)がページ全体で共有する同時実行数ゲート。
// contextが'video-select'のときは媒体/字幕/年度/コースのフィルタが無効(全回共通のため)なので、
// それらの判定用リクエスト(isCaptionAvailableはDRMチケット発行を伴い重い)は省き、
// 視聴状況(getVideoViewingStatus)だけを取得する
async function classifySearchResultItem(item, gate, context = 'search') {
  const needMediaCaptionYear = context !== 'video-select';
  const contentId = window.extractContentIdFromThumbnail(item);
  if (!contentId) {
    item.dataset.oujClassified = 'unavailable';
    applyFiltersToItem(item);
    return;
  }
  try {
    if (needMediaCaptionYear) {
      // isRadioProgram/isCaptionAvailableは内部で同じgetCategoryDataFromContentId(同じ
      // contentId)を叩く。並列にすると初回(未キャッシュ)時に同じvod-contents APIへの
      // リクエストが重複してしまうため、あえて直列に実行し2回目以降はキャッシュを効かせる
      const isRadio = await gate.run(() => window.isRadioProgram(contentId));
      const captionOk = await gate.run(() => window.isCaptionAvailable(contentId));
      item.dataset.oujMedia = isRadio ? 'radio' : 'tv';
      item.dataset.oujCaption = captionOk ? '1' : '0';
    }
    const status = await gate.run(() => window.getVideoViewingStatus(contentId));
    // 視聴状況は3値で持つ: unwatched(未視聴) / partial(視聴途中) / done(視聴済み)
    if (status && status.isFinished) {
      item.dataset.oujWatchState = 'done';
    } else if (status && status.currentTimeRate > 0) {
      item.dataset.oujWatchState = 'partial';
      item.dataset.oujWatchPercent = String(Math.floor(status.currentTimeRate * 100));
    } else {
      item.dataset.oujWatchState = 'unwatched';
    }
    // 既存の並び替え処理との互換用（未視聴を優先ソートで使用）
    item.dataset.oujUnwatched = status && status.isFinished ? '0' : '1';
    if (needMediaCaptionYear) {
      // 年度・コースはキャッシュ済みのvod-content(上のisRadio等が既に取得済み)から得るので基本キャッシュヒット。
      // 年度(西暦下2桁)はdetailの1行目「科目名（'YY）」形式から抽出。年度の数字は全角のことが
      // 多い(utils/year.jsのextractYearFromCategoryNameと同じ判定基準)ため、半角\dだけの
      // 正規表現では拾えず年度絞り込みの選択肢が常に空になる不具合があった。
      // コースは動画の科目(categoryId)からさらに親カテゴリ(コース)を辿って求める
      // (getCourseForSubjectId。学部/大学院 → コース → 科目 → 回の階層で、科目単体より
      // 粒度の粗いコース単位で絞り込みたいという要望のため科目そのものは使わない)
      const videoData = await gate.run(() => window.getVideoData(contentId));
      if (videoData) {
        // 動画が属する科目のcategoryId。サイト内リンク(player?…&ca= / vod?ca=)の組み立てに使う。
        // 項目のパンくず末尾に出ている数字は科目コードであってcategoryIdではないため、
        // リンクにはこちらを使う必要がある(page-search-result-compact.jsのリンク生成)
        if (videoData.categoryId) item.dataset.oujCategoryId = String(videoData.categoryId);
        const detailLine = (videoData.detail || '').split('\n')[0] || '';
        const yearMatch = detailLine.match(/[（(][’'‘`]?([0-9０-９]{2})[）)]/);
        if (yearMatch) item.dataset.oujYear = yearMatch[1].replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
        const course = videoData.categoryId ? await window.getCourseForSubjectId(videoData.categoryId) : null;
        if (course) item.dataset.oujCourseId = String(course.categoryId);
      }
    }
    item.dataset.oujClassified = 'done';
  } catch (error) {
    item.dataset.oujClassified = 'unavailable';
  }
  applyFiltersToItem(item);
  applyBadgesToItem(item);
  // コンパクト表示中は分類結果でまとめ方(チップに出す回・「確認中」の残数)が変わる
  if (window.scheduleOujCompactRegroup) window.scheduleOujCompactRegroup(querySearchResultList());
}

// 未分類の項目を1件だけ分類する(既に分類済み/分類中なら何もせず既存の結果を待つ)。
// IntersectionObserver・並び替え・コンパクト表示のいずれから呼ばれても、同じcontentIdへの
// 分類リクエストが二重に走らないようにするための共通入口
function ensureItemClassified(item, gate, context = 'search') {
  if (item.dataset.oujClassified === 'done' || item.dataset.oujClassified === 'unavailable') {
    return Promise.resolve();
  }
  if (item.dataset.oujClassified === 'pending' && item.__oujClassifyPromise) {
    return item.__oujClassifyPromise;
  }
  item.dataset.oujClassified = 'pending';
  const promise = classifySearchResultItem(item, gate, context);
  item.__oujClassifyPromise = promise;
  return promise;
}

// 何らかのフィルタ条件が有効になっているか(絞り込みが1つも掛かっていない「すべて表示」
// 状態かどうか)。未分類項目の暫定表示可否の判定に使う。media は両方ON(=絞り込み無し)の
// 時だけ「有効でない」扱いにする(片方だけON、または両方OFF＝0件はどちらも絞り込みが効いている)
function isAnyResultFilterActive(state) {
  return !(state.media.tv && state.media.radio) || state.captionOnly ||
    state.incompleteOnly || state.partialOnly || state.year.length > 0 || state.courseId.length > 0;
}

// 分類済みの項目にフィルター条件を適用する。
// フィルタが1つも有効でなければ、未分類・分類不能の項目も判定を待たずそのまま表示する
// (絞り込みが無いなら隠す理由が無い)。
// 一方、フィルタが有効な間は未分類の項目を暫定的に表示せず、分類完了まで隠す。
// これは「未分類の項目もとりあえず表示し、分類完了後に対象外と判明したら隠す」という
// 以前の実装だと、スクロールにつれて表示済みの項目が次々と脱落し、下の項目が繰り上がる
// ことで一覧の並びが入れ替わったように見えてしまう不具合があったため
// (実際に報告された不具合)。分類完了まで隠すことで、対象外の項目がそもそも表示されず、
// 該当すると判明した項目だけが順次追加表示される自然な挙動になる
function applyFiltersToItem(item, state) {
  if (!state) state = getSearchFilterState(querySearchResultList());
  if (item.dataset.oujClassified !== 'done') {
    item.dataset.oujFilterHidden = isAnyResultFilterActive(state) ? 'true' : 'false';
    window.updateSearchResultItemVisibility(item);
    return;
  }
  let hidden = false;
  // video-select(1科目の回一覧)ではclassifySearchResultItemがneedMediaCaptionYear=falseの間
  // item.dataset.oujMediaを意図的に設定しない(isRadioProgram等の追加リクエストを避けるため)。
  // 未設定(=空文字)のままisMediaFilterHiddenに渡すと「テレビにもラジオにも一致しない」と
  // 判定されて常にhidden=trueになってしまう(分類が終わった動画から次々消える不具合の原因だった)。
  // search文脈ではoujClassified==='done'の時点でoujMediaは必ず設定済みのため、この判定を
  // 追加してもsearch側の挙動(両方OFF→0件)は変わらない
  if (item.dataset.oujMedia && isMediaFilterHidden(item.dataset.oujMedia, state.media)) hidden = true;
  if (state.captionOnly && item.dataset.oujCaption !== '1') hidden = true;
  // 「未完了のみ」は視聴が完了していない(done以外＝未視聴＋視聴途中)を表示する
  if (state.incompleteOnly && item.dataset.oujWatchState === 'done') hidden = true;
  // 「視聴途中のみ」は途中まで見たものだけを表示する
  if (state.partialOnly && item.dataset.oujWatchState !== 'partial') hidden = true;
  // 年度で絞り込み（複数選択可。選択した年度のいずれかに合致すれば表示＝OR条件）
  if (state.year.length && !state.year.includes(item.dataset.oujYear)) hidden = true;
  // コースで絞り込み（複数選択可。選択したコースのいずれかに合致すれば表示＝OR条件）
  if (state.courseId.length && !state.courseId.includes(item.dataset.oujCourseId)) hidden = true;
  item.dataset.oujFilterHidden = hidden ? 'true' : 'false';
  window.updateSearchResultItemVisibility(item);
}

function applyFilters() {
  const list = querySearchResultList();
  if (!list) return;
  const state = getSearchFilterState(list);
  list.querySelectorAll(':scope > ion-item[role="listitem"]').forEach((item) => applyFiltersToItem(item, state));
  // 絞り込み結果が変わればまとめ方(各グループに残る回)も変わる
  if (window.applyOujCompactGrouping) window.applyOujCompactGrouping(list);
}

// --- 並び替え機能 ---
// 「未視聴を優先」「視聴途中を優先」は全項目の分類(サーバーリクエスト)が必要になるため、
// ページ表示時に自動実行はせず、ユーザーがチップを明示的にクリックした時だけ発火させる。
// 選択状態も設定として永続化はせず(次回訪問時に意図せず一括classifyが走るのを防ぐため)、
// list要素上のプロパティとして現在の検索結果表示中のみ保持する。

// 一覧の表示順(サイトが返した元の順番)をitemごとに記録しておく。並び替え後に
// 「サイト表示順」へ戻すため、無限スクロールで項目が追加されるたびに呼び出す想定
function assignSiteOrderIndexes(list) {
  if (list.oujSiteOrderCounter === undefined) list.oujSiteOrderCounter = 0;
  list.querySelectorAll(':scope > ion-item[role="listitem"]').forEach((item) => {
    if (item.dataset.oujSiteOrder !== undefined) return;
    item.dataset.oujSiteOrder = String(list.oujSiteOrderCounter++);
  });
}

// 'default'(サイト表示順) | 'newest'(新しい順) | 'unwatched'(未視聴を優先) | 'partial'(視聴途中を優先)
async function applySearchResultSort(list) {
  const sortMode = list.oujSortMode || 'default';
  const items = Array.from(list.querySelectorAll(':scope > ion-item[role="listitem"]'));
  if (items.length === 0) return;

  // 視聴状況で並べ替えるモードは全項目の視聴状況(サーバーリクエスト)が必要
  if (sortMode === 'unwatched' || sortMode === 'partial') {
    // 未分類の項目だけをまとめて分類する。既存のgateを共有し同時実行数を抑える
    const gate = list.__oujFilterGate || window.createConcurrencyGate(4);
    const context = list.oujFilterContext || 'search';
    // IntersectionObserverによって既に分類中(pending)の項目は、ここで再度
    // classifySearchResultItemを呼ぶと同じcontentIdへの分類リクエストが二重に走って
    // しまう。ensureItemClassifiedが既存の分類Promiseの使い回しを引き受ける
    await Promise.all(items.map((item) => ensureItemClassified(item, gate, context)));
  }

  // 視聴状況の優先度で並べ替える。同順位内はサイト表示順を保つ
  const sortByWatchStateRank = (stateRank) =>
    items.slice().sort((a, b) => {
      const rankA = stateRank(a);
      const rankB = stateRank(b);
      if (rankA !== rankB) return rankA - rankB;
      return Number(a.dataset.oujSiteOrder || 0) - Number(b.dataset.oujSiteOrder || 0);
    });

  let sorted;
  if (sortMode === 'newest') {
    // コンテンツIDは新しいコンテンツほど大きい値になる傾向があるため、追加リクエストなしで近似できる
    sorted = items.slice().sort((a, b) => {
      const idA = Number(window.extractContentIdFromThumbnail(a)) || 0;
      const idB = Number(window.extractContentIdFromThumbnail(b)) || 0;
      return idB - idA;
    });
  } else if (sortMode === 'unwatched') {
    // 未視聴 → 視聴途中 → 視聴済み の順に並べる
    sorted = sortByWatchStateRank((item) => {
      if (item.dataset.oujWatchState === 'done') return 2;
      if (item.dataset.oujWatchState === 'partial') return 1;
      return 0;
    });
  } else if (sortMode === 'partial') {
    // 視聴途中 → 未視聴 → 視聴済み の順に並べる（続きを見たいものを最優先）
    sorted = sortByWatchStateRank((item) => {
      if (item.dataset.oujWatchState === 'partial') return 0;
      if (item.dataset.oujWatchState === 'done') return 2;
      return 1;
    });
  } else {
    sorted = items.slice().sort((a, b) => Number(a.dataset.oujSiteOrder || 0) - Number(b.dataset.oujSiteOrder || 0));
  }

  sorted.forEach((item) => list.appendChild(item));
  // 並び替え後はグループの代表(先頭の回)も変わりうるのでまとめ直す
  if (window.applyOujCompactGrouping) window.applyOujCompactGrouping(list);
}

function startSearchFilterObserver(context = 'search') {
  // SPA遷移(検索キーワード変更等)で#common-list-contentがまるごと再生成されるため、
  // 呼び出しのたびに古い監視インスタンス/ゲートを破棄して作り直す
  if (window.__oujSearchFilterObserver) {
    window.__oujSearchFilterObserver.disconnect();
  }
  // ページ内の全検索結果項目で共有する同時実行数ゲート。IntersectionObserverは
  // 初回表示時に画面内の項目をまとめて検知するため、項目ごとに個別の並列数を
  // 持たせると合計の同時リクエスト数が際限なく増えてしまう
  const gate = window.createConcurrencyGate(4);
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const item = entry.target;
        // 二重ガード: 既に分類済み/分類中の項目は再度キューに入れない
        if (item.dataset.oujClassified) return;
        item.dataset.oujClassified = 'pending';
        observer.unobserve(item);
        // applySearchResultSort等、他の呼び出し元が同じ項目を再分類せず
        // このPromiseを待てるように保持しておく
        item.__oujClassifyPromise = classifySearchResultItem(item, gate, context);
      });
    },
    { root: null, rootMargin: '150px 0px', threshold: 0 }
  );
  window.__oujSearchFilterObserver = observer;
  observer.__oujGate = gate;
  return observer;
}

function registerItemsForClassification(observer, list) {
  // 並び替え(「サイト表示順」「未視聴を優先」)で使う元の表示順インデックスを付与
  assignSiteOrderIndexes(list);
  list.querySelectorAll(':scope > ion-item[role="listitem"]').forEach((item) => {
    if (item.dataset.oujClassified) return;
    observer.observe(item);
  });
}

// 1つの#common-list-content要素にフィルターバーと監視をセットアップする。
// バーが消えている時の貼り直しでも再利用するため、要素単位で冪等に作る。
function setupSearchFilterBarOnList(list, context) {
  list.oujFilterContext = context;
  list.oujSortMode = 'default';
  list.oujSortLoading = false;
  const observer = startSearchFilterObserver(context);
  list.__oujFilterGate = observer.__oujGate;
  window.renderFilterBar(list);
  registerItemsForClassification(observer, list);
  if (window.applyOujCompactGrouping) window.applyOujCompactGrouping(list);
  // 「自動読み込み」がONなら、続きのページを自動で読み始める(OFFなら何もしない)
  if (window.startOujAutoLoad) window.startOujAutoLoad(list);

  // 無限スクロールで追加される項目にも監視対象を広げる。あわせて、このリストへの流し込みと
  // 同じタイミングでバーが消えた場合にも入れ直す(itemが流し込まれる=検索/回一覧ページなので安全)。
  // 監視は要素ごとに1度だけ張る(oujFilterObserverAttachedは要素単位のフラグ)。
  if (list.oujFilterObserverAttached) return;
  list.oujFilterObserverAttached = true;
  const mutationObserver = new MutationObserver(() => {
    if (!document.getElementById('search-result-filter-bar')) {
      window.renderFilterBar(list);
    }
    // 検索結果の流し込み・再描画のたびに純正の並び替えが復活しうるので隠し直す
    window.hideNativeSortControl();
    registerItemsForClassification(observer, list);
    // 無限スクロールで足された項目もまとめ対象にする(既存グループへの追加もありうる)
    if (window.scheduleOujCompactRegroup) window.scheduleOujCompactRegroup(list);
  });
  mutationObserver.observe(list, { childList: true });
}

// contextは 'search'(検索結果ページ) | 'video-select'(科目内の回一覧ページ)。
// video-selectでは検索キーワード履歴の記録・媒体/字幕/年度/コースフィルタを行わない
function initializeSearchResultFilters(context = 'search') {
  // 検索キーワードを履歴に記録（「最近の検索」チップ用。検索結果ページのみ）
  if (context === 'search') recordSearchKeyword();
  // window.waitForElementは素のCSSセレクタ一致(document.querySelector)しかできず、
  // #ouj-native-overlay内の同名ID要素を除外できないため、querySearchResultListで
  // 自前にポーリングする(waitForCondition)。
  window.waitForCondition(() => !!querySearchResultList(), () => {
    const list = querySearchResultList();
    setupSearchFilterBarOnList(list, context);

    // 科目一覧(ca=)など、前ページの空の#common-list-contentが残っている状態から検索へ
    // 遷移すると、waitForConditionはその古い空リストへ即コールバックする。Angularはその後
    // #common-list-content要素を検索結果用の新しい要素に「置き換える」ため、古い要素へ挿した
    // バーは新要素には無いまま残る(古い要素はDOMから外れる)。そこで描画が落ち着くまでの数秒間、
    // 同一URL(=まだこの検索ページ)である限り、現在の#common-list-contentにバーが無ければ
    // その時点の要素に対して貼り直す。別ページへ移動したらURLが変わるので何もしない
    // (content.js側が正しいバーを作り直す)。
    const startUrl = window.location.href;
    [120, 350, 700, 1400, 2800].forEach((ms) => setTimeout(() => {
      if (window.location.href !== startUrl) return;
      if (document.getElementById('search-result-filter-bar')) return;
      const current = querySearchResultList();
      if (current) setupSearchFilterBarOnList(current, context);
    }, ms));
  });
}

// 検索結果ページを開いている状態で、検索ボックスのクイック絞り込みパネル
// (search-box-filter-panel.js)からプリセットのトグルが変更された時に、
// 下部のフィルターバーと一覧表示を即座に追従させるためのヘルパー。
// 検索結果ページ以外ではlistが無いので何もしない。
function refreshSearchResultFilterUI() {
  // 既にフィルターバーが出ているページ(＝検索結果/回一覧)でのみ追従させる。
  // コース一覧など#common-list-contentだけ存在するページで新たにバーを出さないよう、
  // バーの有無で判定する（SPA遷移時のバー除去はcontent.jsが行う）
  if (!document.getElementById('search-result-filter-bar')) return;
  const list = querySearchResultList();
  if (!list) return;
  window.renderFilterBar(list);
  applyFilters();
}

window.initializeSearchResultFilters = initializeSearchResultFilters;
window.refreshSearchResultFilterUI = refreshSearchResultFilterUI;
window.updateSearchResultItemVisibility = updateSearchResultItemVisibility;
// page-search-result-filter-bar.js(フィルターバー描画)から呼ばれる判定・絞り込み・並び替え関数
window.getSearchFilterState = getSearchFilterState;
window.applyFilters = applyFilters;
window.applySearchResultSort = applySearchResultSort;
// コンパクト表示(page-search-result-compact.js)から使う一覧要素の取得と単発分類
window.queryOujSearchResultList = querySearchResultList;
window.ensureOujItemClassified = ensureItemClassified;
// 検索ボックスのクイック絞り込みパネルから再利用する設定キー・履歴キー
window.OUJ_SEARCH_FILTER_KEYS = SEARCH_FILTER_SETTINGS_KEYS;
window.OUJ_SEARCH_KEYWORD_HISTORY_KEY = SEARCH_KEYWORD_HISTORY_KEY;
window.getOujMediaFilterState = getMediaFilterState;
