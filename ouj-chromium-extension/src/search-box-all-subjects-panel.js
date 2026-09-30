// 検索ボックスのクイック絞り込みパネル(search-box-filter-panel.js)で、キーワード欄が
// 空のまま絞り込みプリセットのチップ(テレビ/ラジオ・字幕あり・未完了・視聴途中)を操作した
// 瞬間に呼ばれ、ネイティブ風パネル(menu/menu-native-shell.js)で全科目中の該当科目を一覧表示する。
//
// 放送大学サイト自身の検索はキーワードが空だと0件になり、拡張もサイトの検索結果DOMに
// 相乗りしてフィルタしているだけ(page-search-result-filters.js)なので、キーワードが
// 無い場合はサイトに頼れない。一方、テレビ/ラジオ・字幕・年度・コース(親カテゴリ)の判定は
// カテゴリAPI(utils/categories.js の getCategoriesData。既にキャッシュ済み)のsummary/name欄と
// 親子関係だけで完結し追加通信が不要なため、この4条件は全科目分を即座に判定できる。未完了/視聴途中のみ
// 視聴進捗の取得(getCategoryProgress)が必要なので、お気に入りパネルの視聴回数バッジと
// 同様にIntersectionObserverで画面内に入った科目だけを遅延取得する(全科目を一斉に取得すると
// サーバー負荷が大きすぎるため、page-course-select-filters.jsのような即時一括分類はしない)。

const ALL_SUBJECTS_PANEL_ID = 'all-subjects-filter';

// 科目単位の視聴状況(getCategoryProgressの結果)をcategoryId単位でキャッシュする。
// パネルを閉じずにチップ操作で再描画しても取得済みの分は再リクエストしない
let oujAllSubjectsProgressCache = new Map();
let oujAllSubjectsProgressGate = null;
let oujAllSubjectsProgressObserver = null;

function getOujAllSubjectsProgressGate() {
  if (!oujAllSubjectsProgressGate) oujAllSubjectsProgressGate = window.createConcurrencyGate(4);
  return oujAllSubjectsProgressGate;
}

// ログイン/ログアウトが切り替わると視聴状況(誰の分か)が変わるため、login-state.jsの
// invalidateOujCachesForStateから呼んでもらいキャッシュを破棄する(page-course-select-filters.js
// のoujBrowseDataPromiseと同じ理由。以前はここにフックが無く、ゲスト時点で分類済みの
// 「未着手」表示がログイン後もそのまま残る不具合があった)
function clearOujAllSubjectsProgressCache() {
  oujAllSubjectsProgressCache = new Map();
}
window.clearOujAllSubjectsProgressCache = clearOujAllSubjectsProgressCache;

// 全科目(=他の科目の親として使われていない末端カテゴリ)を、重複登録(同じ講義が複数コースに
// 登録されているもの)を除いて返す。判定基準はutils/year.jsのcreateYearListDataと同じ
async function getAllSubjectItems() {
  const categories = await window.getCategoriesData();
  if (!Array.isArray(categories)) return [];
  const parentIds = await window.categoriesUsedAsParent();
  const parentIdSet = new Set(parentIds);
  const byId = new Map(categories.map((c) => [c.categoryId, c]));

  const usedAliasNumbers = new Set();
  const items = [];
  categories.forEach((category) => {
    if (parentIdSet.has(category.categoryId)) return; // フォルダ(コース等)は除外、末端の科目のみ対象
    const aliasNum = window.extractCategoryAliasNumber ? window.extractCategoryAliasNumber(category) : null;
    if (aliasNum) {
      if (usedAliasNumbers.has(aliasNum)) return; // 複数コースへの重複登録は先に見つかった1件のみ採用
      usedAliasNumbers.add(aliasNum);
    }
    const parent = category.parentId ? byId.get(category.parentId) : null;
    const { media, caption } = window.parseCourseMediaCaption(category.summary || '');
    items.push({
      categoryId: category.categoryId,
      name: category.name,
      summary: category.summary || '',
      parentName: parent ? parent.name : t('common.other'),
      media,
      caption,
      year: window.extractYearFromCategoryName(category.name),
    });
  });
  return items;
}

// 媒体・字幕・年度・コースの絞り込み。不明(空文字)な項目は隠さない安全側の判定
// (page-course-select-filters.jsのisCourseMediaCaptionHidden/isCourseYearHiddenと同じ基準)。
// テレビ/ラジオ両方ONは絞り込み無し、両方OFFは確定済みの項目が全て対象外になる(0件)。
// 年度・コースは複数選択可(OR条件、page-search-result-filters.jsのapplyFiltersToItemと同じ基準)
function passesAllSubjectsStaticFilters(item, state) {
  const media = state.media;
  if (item.media &&
      !((media.tv && item.media === 'tv') || (media.radio && item.media === 'radio'))) {
    return false;
  }
  if (state.captionOnly && item.caption === '0') return false;
  if (state.year.length && !state.year.includes(String(item.year || ''))) return false;
  if (state.course.length && !state.course.includes(item.parentName)) return false;
  return true;
}

// 視聴状況の絞り込み。未分類(watchStateが無い)の項目は隠さない
function passesAllSubjectsWatchFilter(watchState, state) {
  if (!watchState) return true;
  if (state.incompleteOnly && watchState === 'complete') return false;
  if (state.partialOnly && watchState !== 'partial') return false;
  return true;
}

// getCategoryProgressの結果から視聴状況を確定する。
// complete(全回視聴済み) / partial(一部だけ進行) / unstarted(未着手)
function classifyAllSubjectsWatchState(progress) {
  if (!progress) return 'unstarted';
  const { finishedCount, total, statuses } = progress;
  if (finishedCount >= total) return 'complete';
  const anyStarted = statuses.some((s) => s && (s.isFinished || s.currentTimeRate > 0));
  return anyStarted ? 'partial' : 'unstarted';
}

// スタイル（min-width含む）はutils/progress-badge.jsで共通化している（空欄→実データで幅が
// 変わり後続要素がずれる不具合がmenu-favorites.js/page-course-select-progress.jsで過去に
// 起きたため）。未着手（unstarted）が一覧の大半を占めるが、ここでbadge.remove()すると
// 結局その瞬間に幅が変わって同じ不具合を起こすため、要素は残したままvisibility:hiddenで
// 見た目だけ消す（＝要素の追加・削除はしない）
function buildAllSubjectsProgressBadgeHtml(categoryId) {
  return `<span class="all-subjects-progress-badge" data-category-id="${categoryId}" style="${window.oujStateBadgeStyleText()}"></span>`;
}

function fillAllSubjectsProgressBadge(badge, watchState) {
  if (watchState === 'complete') {
    badge.textContent = t('badge.watchedShort');
    badge.style.background = '#dcedc8';
    badge.style.color = '#33691e';
    badge.style.visibility = 'visible';
  } else if (watchState === 'partial') {
    badge.textContent = t('badge.partialShort');
    badge.style.background = '#e3f2fd';
    badge.style.color = '#1565c0';
    badge.style.visibility = 'visible';
  } else {
    badge.style.visibility = 'hidden';
  }
}

function buildAllSubjectsItemHtml(item) {
  return window.buildNativeCategoryItemHtml({
    text: item.name,
    buttonClass: 'all-subjects-course-button',
    dataAttrs: { 'category-id': item.categoryId },
    extraHtml: buildAllSubjectsProgressBadgeHtml(item.categoryId),
    subText: item.summary || ''
  });
}

// コース名先頭の番号を取り出す。グループ表示の並び順(groupAllSubjectsByParent)と
// コース絞り込み選択肢の並び順(buildAllSubjectsYearCourseOptions)で基準を揃えるため共用
function allSubjectsCourseNumPrefix(name) {
  const m = (name || '').match(/^\s*([0-9]+)/);
  return m ? parseInt(m[1], 10) : 9999;
}

// 親カテゴリ(コース)名でグループ化し、名前先頭の番号でソートする(getCourseGroupsと同じ並び方針)
function groupAllSubjectsByParent(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.parentName || t('common.other');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return Array.from(groups.entries())
    .map(([name, groupItems]) => ({ name, items: groupItems.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja')) }))
    .sort((a, b) => allSubjectsCourseNumPrefix(a.name) - allSubjectsCourseNumPrefix(b.name));
}

function buildAllSubjectsGroupedListHtml(items) {
  if (!items.length) return `<div style="padding:16px;color:#666;">${t('allSubjects.noMatch')}</div>`;
  const groups = groupAllSubjectsByParent(items);
  return groups
    .map((group) => window.buildNativeSectionHeaderHtml(group.name) + group.items.map(buildAllSubjectsItemHtml).join(''))
    .join('');
}

function buildAllSubjectsFilterSummaryText(state, count) {
  const parts = [];
  // テレビ/ラジオ両方ONは絞り込み無し(既定値)を表すため、ラベルには出さない。
  // 片方のみON、または両方OFF(0件)の時だけ状態が分かるように出す
  if (state.media.tv && !state.media.radio) parts.push(t('filters.tv'));
  if (state.media.radio && !state.media.tv) parts.push(t('filters.radio'));
  if (!state.media.tv && !state.media.radio) parts.push(t('allSubjects.bothHidden'));
  if (state.captionOnly) parts.push(t('filters.captionOnly'));
  if (state.incompleteOnly) parts.push(t('filters.incompleteOnly'));
  if (state.partialOnly) parts.push(t('filters.partialOnly'));
  if (state.year.length === 1) parts.push(t('filters.yearFormat', { year: state.year[0] }));
  else if (state.year.length > 1) parts.push(t('allSubjects.yearsSelected', { n: state.year.length }));
  if (state.course.length === 1) parts.push(state.course[0]);
  else if (state.course.length > 1) parts.push(t('allSubjects.coursesSelected', { n: state.course.length }));
  const condition = parts.length ? parts.join(t('allSubjects.separator')) : t('allSubjects.noCondition');
  return t('allSubjects.summary', { condition, count });
}

// 年度・コースの絞り込み選択肢を全科目一覧から作る(いずれも複数選択可のドロップダウン用)。
// コースの並びはグループ見出し(groupAllSubjectsByParent)と同じ番号順に揃える
function buildAllSubjectsYearCourseOptions(items) {
  const years = Array.from(new Set(items.map((i) => i.year).filter(Boolean))).sort((a, b) => b - a);
  const yearOptions = years.map((y) => ({ value: String(y), label: t('filters.yearFormat', { year: y }) }));

  const courseNames = Array.from(new Set(items.map((i) => i.parentName || t('common.other'))))
    .sort((a, b) => allSubjectsCourseNumPrefix(a) - allSubjectsCourseNumPrefix(b) || a.localeCompare(b, 'ja'));
  const courseOptions = courseNames.map((name) => ({ value: name, label: name }));

  return { yearOptions, courseOptions };
}

// パネル本体の描画。openNativeOverlayのrenderコールバックとして渡す
function renderAllSubjectsPanel(overlay) {
  let allItems = [];
  let filterValue = '';
  // buildOujMultiSelectDropdown(page-search-result-filters.js)に参照を渡して直接
  // 書き換えてもらう。選択値の配列そのものがフィルタ状態を兼ねる(空配列="すべて")
  const yearFilter = [];
  const courseFilter = [];

  function currentFilterState() {
    const keys = window.OUJ_SEARCH_FILTER_KEYS;
    return {
      media: window.getOujMediaFilterState(keys.media),
      captionOnly: window.getBooleanSetting(keys.captionOnly, false),
      incompleteOnly: window.getBooleanSetting(keys.incompleteOnly, false),
      partialOnly: window.getBooleanSetting(keys.partialOnly, false),
      year: yearFilter,
      course: courseFilter,
    };
  }

  function wireRowClicks() {
    overlay.querySelectorAll('.all-subjects-course-button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const categoryId = btn.getAttribute('data-category-id');
        if (!categoryId) return;
        window.removeNativeOverlay();
        const targetUrl = `https://v.ouj.ac.jp/view/ouj/#/navi/vod?ca=${categoryId}`;
        // ゲスト判定中に別コースへ移動する場合のみ、login-state.jsが一瞬homeを経由させて
        // ログイン状態の裏取りをする(utils/login-state.jsのnavigateWithOujGuestRevalidation)
        if (typeof window.navigateWithOujGuestRevalidation === 'function') {
          window.navigateWithOujGuestRevalidation(targetUrl);
        } else {
          window.location.href = targetUrl;
        }
      });
    });
  }

  // 視聴状況バッジの遅延計算(画面内に入った科目だけ、同時実行数を制限しつつ取得)。
  // 分類が完了し、現在の絞り込みで表示対象外になった行はその場で隠す(全体の再描画はしない)
  function wireProgressBadges() {
    if (oujAllSubjectsProgressObserver) oujAllSubjectsProgressObserver.disconnect();
    oujAllSubjectsProgressObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const badge = entry.target;
        oujAllSubjectsProgressObserver.unobserve(badge);
        const categoryId = badge.dataset.categoryId;
        window.getCategoryProgress(categoryId, getOujAllSubjectsProgressGate())
          .then((result) => {
            const watchState = classifyAllSubjectsWatchState(result);
            oujAllSubjectsProgressCache.set(String(categoryId), watchState);
            if (!badge.isConnected) return;
            fillAllSubjectsProgressBadge(badge, watchState);
            if (!passesAllSubjectsWatchFilter(watchState, currentFilterState())) {
              const row = badge.closest('ion-item');
              if (row) row.style.display = 'none';
            }
          })
          .catch(() => {
            oujAllSubjectsProgressCache.set(String(categoryId), 'unstarted');
          });
      });
    }, { root: null, rootMargin: '150px 0px', threshold: 0 });

    overlay.querySelectorAll('.all-subjects-progress-badge').forEach((badge) => {
      const categoryId = badge.dataset.categoryId;
      if (oujAllSubjectsProgressCache.has(String(categoryId))) {
        fillAllSubjectsProgressBadge(badge, oujAllSubjectsProgressCache.get(String(categoryId)));
        return;
      }
      oujAllSubjectsProgressObserver.observe(badge);
    });
  }

  function renderList() {
    const state = currentFilterState();
    const keyword = filterValue.trim().toLowerCase();
    const visible = allItems.filter((item) => {
      if (!passesAllSubjectsStaticFilters(item, state)) return false;
      const cached = oujAllSubjectsProgressCache.get(String(item.categoryId));
      if (!passesAllSubjectsWatchFilter(cached, state)) return false;
      if (keyword && !item.name.toLowerCase().includes(keyword) && !item.parentName.toLowerCase().includes(keyword)) return false;
      return true;
    });
    const listEl = overlay.querySelector('#all-subjects-native-list');
    if (listEl) listEl.innerHTML = buildAllSubjectsGroupedListHtml(visible);
    const summaryEl = overlay.querySelector('#all-subjects-filter-summary');
    if (summaryEl) summaryEl.textContent = buildAllSubjectsFilterSummaryText(state, visible.length);
    wireRowClicks();
    wireProgressBadges();
  }

  overlay.innerHTML = window.renderNativeShellHtml({
    breadcrumbHtml: window.buildNativeBreadcrumbHtml([{ text: t('allSubjects.title') }]),
    extraAsideHtml: `
      ${window.buildNativeSearchBoxHtml({ id: 'all-subjects-native-search', placeholder: t('allSubjects.searchPlaceholder') })}
      <div id="all-subjects-filter-summary" style="padding:0 20px 8px 20px;font-size:12px;color:#666;"></div>
      <div id="all-subjects-year-course-filters" style="padding:0 20px 12px 20px;display:flex;flex-wrap:wrap;gap:8px;"></div>
    `,
    asideListHtml: `<div id="all-subjects-native-list" style="padding:16px;color:#666;">${t('common.loading')}</div>`
  });

  const searchInput = overlay.querySelector('#all-subjects-native-search');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      filterValue = event.target.value;
      renderList();
    });
  }

  // 年度・コースは全科目一覧(getAllSubjectItems)の取得が終わるまで選択肢が確定しないため、
  // 検索結果ページのbuildYearCourseRowと同じくisLoading:trueで先に表示し、取得後にoujSetOptionsで差し替える
  const yearDropdown = window.buildOujMultiSelectDropdown({
    label: t('filters.year'), options: [], selected: yearFilter, onChange: renderList, isLoading: true,
  });
  const courseDropdown = window.buildOujMultiSelectDropdown({
    label: t('filters.course'), options: [], selected: courseFilter, onChange: renderList, isLoading: true,
  });
  const yearCourseContainer = overlay.querySelector('#all-subjects-year-course-filters');
  if (yearCourseContainer) {
    yearCourseContainer.appendChild(yearDropdown);
    yearCourseContainer.appendChild(courseDropdown);
  }

  getAllSubjectItems().then((items) => {
    if (!overlay.isConnected) return; // 取得中にパネルが閉じられていれば何もしない
    allItems = items;
    const { yearOptions, courseOptions } = buildAllSubjectsYearCourseOptions(allItems);
    if (yearDropdown.oujSetOptions) yearDropdown.oujSetOptions(yearOptions, false);
    if (courseDropdown.oujSetOptions) courseDropdown.oujSetOptions(courseOptions, false);
    renderList();
  });
}

// 全科目絞り込みパネルを開く。search-box-filter-panel.jsのプリセットチップ操作の
// たびに(既に開いていても)呼ばれる。openNativeOverlayは呼び出しの都度、既存の
// オーバーレイと「パネル外クリックで閉じる」監視を破棄してから新しく組み立てる仕様
// (menu-native-shell.js)なので、ここで毎回呼び直すことで、パネルの外側(検索ボックスの
// クイック絞り込みパネル)にあるチップ操作が直後に「パネル外クリック」と誤判定されて
// 即座に閉じてしまう事態を避けている。取得済みの視聴進捗(oujAllSubjectsProgressCache)は
// モジュール変数として残るため、開き直しても再取得は発生しない
function handleAllSubjectsFilterPanelOpen() {
  window.openNativeOverlay(renderAllSubjectsPanel, ALL_SUBJECTS_PANEL_ID);
}

window.handleAllSubjectsFilterPanelOpen = handleAllSubjectsFilterPanelOpen;
