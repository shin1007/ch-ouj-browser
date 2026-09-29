// 検索結果ページ絞り込み機能のUI描画(フィルターバー本体・チップ・年度/コースの複数選択
// ドロップダウン・並び替え行・最近の検索チップ)。
//
// page-search-result-filters.jsから分割したファイル(元は1ファイルで、renderFilterBar↔
// applyFilters/applySearchResultSortが双方向依存だったため分割を保留していたが、判定・絞り込み・
// 並び替えロジック側とUI描画側で分けた)。判定・絞り込み・並び替えの実処理(getSearchFilterState/
// applyFilters/applySearchResultSort/classifySearchResultItem等)はpage-search-result-filters.js
// が持つ。content scriptは各ファイルが独立スコープのため、双方向で参照する関数は
// window.*経由で呼び合う(本ファイルはwindow.getSearchFilterState/window.applyFilters/
// window.applySearchResultSultを呼び、あちら側はwindow.renderFilterBar/window.hideNativeSortControl
// を呼ぶ)。

// テレビ/ラジオはAND条件の他フィルタと違いOR条件（どちらか一方でも合致すれば表示）なので、
// チップの色も変えて区別する
const MEDIA_FILTER_CHIP_COLOR = '#00897b';

function buildFilterChip(label, isActive, onClick, activeColor = '#1976d2') {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.textContent = label;
  chip.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 6px 14px;
    margin: 0 8px 8px 0;
    border-radius: 16px;
    font-size: 13px;
    cursor: pointer;
    border: 1px solid ${isActive ? activeColor : '#ddd'};
    background: ${isActive ? activeColor : '#fff'};
    color: ${isActive ? '#fff' : '#333'};
    transition: background 0.2s, border-color 0.2s;
  `;
  chip.onmouseenter = () => {
    if (!isActive) chip.style.background = '#f0f0f0';
  };
  chip.onmouseleave = () => {
    chip.style.background = isActive ? activeColor : '#fff';
  };
  chip.onclick = onClick;
  return chip;
}

function renderFilterBar(list) {
  const old = document.getElementById('search-result-filter-bar');
  if (old) old.remove();

  const context = (list && list.oujFilterContext) || 'search';
  const isVideoSelect = context === 'video-select';
  const state = window.getSearchFilterState(list);
  const filterKeys = window.OUJ_SEARCH_FILTER_KEYS;
  const bar = document.createElement('div');
  bar.id = 'search-result-filter-bar';
  bar.style.cssText = `
    padding: 12px 16px 0 16px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  `;

  // 媒体・字幕・年度・コース・最近の検索は video-select(1科目の回一覧)では意味がないので出さない
  if (!isVideoSelect) {
    // テレビ/ラジオは他のAND条件チップと違いOR条件(どちらかON、両方ONで両方表示)なので独立トグルにする
    bar.appendChild(
      buildFilterChip(t('filters.tv'), state.media.tv, () => {
        window.saveSetting(filterKeys.media, { tv: !state.media.tv, radio: state.media.radio });
        renderFilterBar(list);
        window.applyFilters();
      }, MEDIA_FILTER_CHIP_COLOR)
    );
    bar.appendChild(
      buildFilterChip(t('filters.radio'), state.media.radio, () => {
        window.saveSetting(filterKeys.media, { tv: state.media.tv, radio: !state.media.radio });
        renderFilterBar(list);
        window.applyFilters();
      }, MEDIA_FILTER_CHIP_COLOR)
    );

    bar.appendChild(
      buildFilterChip(t('filters.captionOnly'), state.captionOnly, () => {
        window.saveSetting(filterKeys.captionOnly, !state.captionOnly);
        renderFilterBar(list);
        window.applyFilters();
      })
    );
  }

  bar.appendChild(
    buildFilterChip(t('filters.incompleteOnly'), state.incompleteOnly, () => {
      window.saveSetting(filterKeys.incompleteOnly, !state.incompleteOnly);
      renderFilterBar(list);
      window.applyFilters();
    })
  );

  bar.appendChild(
    buildFilterChip(t('filters.partialOnly'), state.partialOnly, () => {
      window.saveSetting(filterKeys.partialOnly, !state.partialOnly);
      renderFilterBar(list);
      window.applyFilters();
    })
  );

  if (!isVideoSelect) bar.appendChild(buildYearCourseRow(list));
  bar.appendChild(buildSortRow(list));

  // コンパクト表示(同じ科目の回を1行にまとめる)。1科目の回一覧(video-select)では
  // 全項目が同じ科目＝1グループになってしまい意味がないので出さない。
  // 自動読み込み(続きのページを自動で読む)も検索結果だけの機能なので同じ行に並べる
  if (!isVideoSelect && typeof window.buildOujCompactViewRow === 'function') {
    const displayRow = window.buildOujCompactViewRow(list);
    if (typeof window.buildOujAutoLoadControls === 'function') {
      displayRow.appendChild(window.buildOujAutoLoadControls(list));
    }
    bar.appendChild(displayRow);
  }

  if (!isVideoSelect) {
    const keywordRow = buildSearchKeywordHistoryRow(list);
    if (keywordRow) bar.appendChild(keywordRow);
  }

  list.parentNode.insertBefore(bar, list);

  // サイト純正の並び替えドロップダウン(ion-item.sort)を隠す。拡張の「並び替え」行と
  // 二重になって紛らわしいため一本化する。純正のsort要素は検索結果と回一覧(=拡張の
  // 並び替え行を出すページ)にだけ存在し、科目一覧など他ページには無いことを実機で確認済み。
  // 純正の既定は「タイトル順」で、これが拡張の「サイト表示順」に相当するため、タイトル順の
  // 並びは失われない。サーバー再取得を伴う純正の切替を隠すことでサーバー負荷も抑えられる。
  hideNativeSortControl();
}

// サイト純正の並び替えUI(ion-item.sort)を非表示にする。Angularの再描画で作り直される
// ことがあるため、都度クエリして隠す(renderFilterBarとリスト変化監視の両方から呼ぶ)。
function hideNativeSortControl() {
  document.querySelectorAll('ion-item.sort').forEach((el) => {
    if (el.style.display !== 'none') el.style.display = 'none';
  });
}

// 年度・コースのチェックボックス複数選択ドロップダウン。選択肢が5〜30件程度と多く、
// テレビ/ラジオのような独立チップ方式では並べきれないため、ボタンをクリックすると
// チェックボックス一覧が開くカスタムドロップダウンにする。
// options: [{value, label}] / selected: 選択値の配列（呼び出し元が保持する配列を直接
// 書き換える。参照を保つことで、renderFilterBarを経由しない再描画(oujSetOptions)でも
// 選択状態を見失わない）
// isLoading: trueの間は選択肢0件でも「選択肢がありません」ではなく「読み込み中...」を出す。
// 分類はページ内の項目を画面内に入るたびに遅延実行するため、表示直後は大半が未分類で
// 選択肢が一時的に0件になる。この間も「選択肢がありません」と表示すると、後から分類が
// 進んで選択肢が増えても既にドロップダウンを閉じたユーザーには「選べない」ように見えて
// しまう(実際に報告された不具合)。分類中は区別して案内する
function buildMultiSelectDropdown({ label, options, selected, onChange, isLoading = false }) {
  let currentOptions = options;
  let currentIsLoading = isLoading;

  const wrapper = document.createElement('div');
  wrapper.className = 'ouj-multiselect';
  wrapper.style.cssText = 'position:relative;display:inline-block;';

  const button = document.createElement('button');
  button.type = 'button';
  button.style.cssText = 'font-size:13px;padding:5px 8px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#333;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;text-align:left;';

  const panel = document.createElement('div');
  panel.className = 'ouj-multiselect-panel';
  panel.style.cssText = 'display:none;position:absolute;top:100%;left:0;z-index:100;margin-top:2px;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-height:260px;overflow-y:auto;min-width:180px;padding:4px 0;';

  function updateButtonText() {
    if (selected.length === 0) button.textContent = t('filters.dropdownAll', { label });
    else if (selected.length === 1) {
      const opt = currentOptions.find((o) => o.value === selected[0]);
      button.textContent = `${label}: ${opt ? opt.label : selected[0]}`;
    } else button.textContent = t('filters.dropdownSelected', { label, n: selected.length });
  }

  function renderPanelRows() {
    panel.innerHTML = '';
    if (currentOptions.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = currentIsLoading ? t('common.loading') : t('filters.noOptions');
      empty.style.cssText = 'padding:6px 12px;font-size:13px;color:#999;';
      panel.appendChild(empty);
      return;
    }
    currentOptions.forEach((opt) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:13px;color:#333;cursor:pointer;white-space:nowrap;';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected.includes(opt.value);
      checkbox.addEventListener('change', () => {
        const idx = selected.indexOf(opt.value);
        if (checkbox.checked && idx === -1) selected.push(opt.value);
        else if (!checkbox.checked && idx !== -1) selected.splice(idx, 1);
        updateButtonText();
        onChange();
      });
      row.appendChild(checkbox);
      const text = document.createElement('span');
      text.textContent = opt.label;
      row.appendChild(text);
      panel.appendChild(row);
    });
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = panel.style.display === 'none';
    // 他に開いているドロップダウンがあれば閉じる（年度・コースを同時に開かせない）
    document.querySelectorAll('.ouj-multiselect-panel').forEach((p) => { p.style.display = 'none'; });
    panel.style.display = willOpen ? 'block' : 'none';
  });

  wrapper.appendChild(button);
  wrapper.appendChild(panel);
  updateButtonText();
  renderPanelRows();
  ensureMultiSelectOutsideClickHandler();

  // 年度・コースは選択肢の取得(loadYearCourseOptions)が非同期のため、外部から
  // 開閉状態を保ったまま選択肢一覧・読み込み中フラグを後から差し替えられるようにする
  wrapper.oujSetOptions = (newOptions, newIsLoading = false) => {
    currentOptions = newOptions;
    currentIsLoading = newIsLoading;
    updateButtonText();
    renderPanelRows();
  };

  return wrapper;
}

// ドロップダウンの外側をクリックしたら開いているパネルを閉じる。パネルは
// renderFilterBarのたびに作り直されるため、リスナーはページに1つだけ登録する
function ensureMultiSelectOutsideClickHandler() {
  if (window.__oujMultiSelectOutsideClickInit) return;
  window.__oujMultiSelectOutsideClickInit = true;
  document.addEventListener('mousedown', (event) => {
    document.querySelectorAll('.ouj-multiselect-panel').forEach((panel) => {
      if (panel.style.display === 'none') return;
      const wrapper = panel.parentElement;
      if (wrapper && wrapper.contains(event.target)) return;
      panel.style.display = 'none';
    });
  }, true);
}

// 年度・コースの選択肢は、検索結果に実際に含まれる項目の分類状況に関わらず、サイト全体の
// 授業一覧(カテゴリツリー)から一度だけ求めて使う。
// 以前は画面内に入って分類が終わった項目だけから選択肢を集めていたため、スクロールしないと
// 選択肢が増えない・全項目を分類し終えるまで「読み込み中」のままになるなど、項目数の多い
// 検索結果で不必要に待たされる不具合があった。授業一覧から直接求めれば分類を待つ必要が無く
// なるが、選択した年度・コースが今回の検索結果に1件も無く0件表示になることはある(許容する)。
// 検索ボックスの絞り込みパネル(search-box-filter-panel.js)と同じ
// createYearListData/getCourseGroups(utils/year.js・utils/categories.js)を再利用するため、
// 両パネルで選択肢が一致する
let cachedYearCourseOptions = null; // { yearOptions, courseOptions } (両方揃ってから確定)
let yearCourseOptionsPromise = null;
// cachedYearCourseOptionsを取得した時点のログイン状態スタンプ(page-course-select-filters.js の
// getBrowseDataと同じ方式)。ログイン/ログアウトで取得できる科目数が変わる(login-state.js)ため、
// これが前回取得時から変わっていればキャッシュを作り直す。以前はスタンプ比較が無く、一度
// 選択肢を取得すると(ページ内でSPA遷移が続く限り)ログイン後もゲスト時点の少ない選択肢の
// ままになる不具合があった(実際に報告されたバグ: ログイン済みなのに検索結果の年度・コース
// 絞り込みの選択肢が数件しか出ないことがある)
let yearCourseOptionsStamp = null;

// page-course-select-filters.jsのgetBrowseDataと同じ構造: スタンプ比較自体は呼ばれるたびに
// 毎回行い(古いPromiseを使い回しているだけでは変化に気付けないため)、実際のカテゴリ取得
// (yearCourseOptionsPromise)だけをスタンプが一致する間再利用する
async function loadYearCourseOptions() {
  if (typeof window.syncOujLoginStateAndInvalidate === 'function') {
    await window.syncOujLoginStateAndInvalidate();
  }
  const currentStamp = (typeof window.getStampedCategoriesLoginState === 'function')
    ? await window.getStampedCategoriesLoginState()
    : null;
  if (yearCourseOptionsPromise && currentStamp && currentStamp !== yearCourseOptionsStamp) {
    yearCourseOptionsPromise = null;
    cachedYearCourseOptions = null;
  }
  if (yearCourseOptionsPromise) return yearCourseOptionsPromise;

  yearCourseOptionsStamp = currentStamp;
  yearCourseOptionsPromise = (async () => {
    let yearOptions = [];
    let courseOptions = [];
    try {
      if (typeof window.createYearListData === 'function') {
        const { yearBuckets } = await window.createYearListData();
        yearOptions = yearBuckets.map((b) => ({ value: String(b.year).slice(-2), label: t('filters.yearFormat', { year: b.year }) }));
      }
    } catch (e) { /* 取得失敗時は選択肢なし(=絞り込み無し)のまま */ }
    try {
      if (typeof window.getCourseGroups === 'function') {
        const groups = await window.getCourseGroups();
        const trim = (name) => (typeof window.trimCourseName === 'function') ? window.trimCourseName(name) : name;
        // 未ログイン(ゲスト)時は「01 テレビ」「02 ラジオ」がそれぞれ独立した大分類になり、
        // その下に同名の「OCW（全15回公開）」「授業科目(等)一覧（1回分のみ公開）」が
        // 別コースとして存在する。名前だけでは区別が付かないため、同名のコースが複数ある
        // 場合に限り所属する大分類名を付記して区別する。特定の文言(「テレビ」「OCW」等)を
        // 直接ハードコードすると表記が変わった時に効かなくなるため、あくまで名前の衝突検出で
        // 判定する(衝突していない通常の学部/大学院配下のコースには何も付けない)
        const raw = [];
        groups.forEach((g) => g.courses.forEach((c) => raw.push({ value: String(c.categoryId), label: trim(c.name), groupLabel: trim(g.parentName) })));
        const labelCounts = new Map();
        raw.forEach((c) => labelCounts.set(c.label, (labelCounts.get(c.label) || 0) + 1));
        raw.forEach((c) => {
          const label = labelCounts.get(c.label) > 1 ? `${c.label}（${c.groupLabel}）` : c.label;
          courseOptions.push({ value: c.value, label });
        });
        courseOptions.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
      }
    } catch (e) { /* 取得失敗時は選択肢なし(=絞り込み無し)のまま */ }
    cachedYearCourseOptions = { yearOptions, courseOptions };
    return cachedYearCourseOptions;
  })();
  return yearCourseOptionsPromise;
}

// 年度・コースの絞り込み行。選択肢はサイト全体の授業一覧(loadYearCourseOptions)から取得する。
// 初回はキャッシュがまだ無いため非同期取得を待つ間「読み込み中」を出し、取得できた時点で
// 差し替える。以降は再検索してもキャッシュを再利用するため即座に選択肢が揃う。複数選択可（OR条件）
function buildYearCourseRow(list) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;width:100%;margin-top:4px;';

  const isLoaded = !!cachedYearCourseOptions;

  const label = document.createElement('span');
  label.textContent = t('filters.label');
  label.style.cssText = 'font-size:13px;color:#666;';
  row.appendChild(label);

  if (!Array.isArray(list.oujYearFilter)) list.oujYearFilter = [];
  if (!Array.isArray(list.oujCourseFilter)) list.oujCourseFilter = [];

  const yearDropdown = buildMultiSelectDropdown({
    label: t('filters.year'),
    options: isLoaded ? cachedYearCourseOptions.yearOptions : [],
    selected: list.oujYearFilter,
    onChange: window.applyFilters,
    isLoading: !isLoaded,
  });
  yearDropdown.id = 'search-filter-year';
  row.appendChild(yearDropdown);

  const courseDropdown = buildMultiSelectDropdown({
    label: t('filters.course'),
    options: isLoaded ? cachedYearCourseOptions.courseOptions : [],
    selected: list.oujCourseFilter,
    onChange: window.applyFilters,
    isLoading: !isLoaded,
  });
  courseDropdown.id = 'search-filter-course';
  row.appendChild(courseDropdown);

  // isLoadedがtrueの間も毎回呼ぶ。ログイン状態がキャッシュ取得時点から変わっていないかは
  // loadYearCourseOptions内のスタンプ比較で都度確認しており、変化が無ければ既存のPromiseを
  // 再利用するだけなので軽量(選択肢を取り直した場合のみoujSetOptionsの内容が実際に変わる)
  loadYearCourseOptions().then((options) => {
    if (yearDropdown.oujSetOptions) yearDropdown.oujSetOptions(options.yearOptions, false);
    if (courseDropdown.oujSetOptions) courseDropdown.oujSetOptions(options.courseOptions, false);
  });

  return row;
}

// 「最近の検索」チップ行。クリックでそのキーワードの検索結果へ遷移する
function buildSearchKeywordHistoryRow(list) {
  const historyKey = window.OUJ_SEARCH_KEYWORD_HISTORY_KEY;
  const history = window.getSetting(historyKey, []);
  if (!Array.isArray(history) || history.length === 0) return null;
  // 現在表示中のキーワードは除いて表示する。URL上のエンコード段数は経路により変わるため、
  // デコード済みのキーワード同士で比較する
  const current = window.getOujCurrentSearchKeyword ? window.getOujCurrentSearchKeyword() : '';
  const others = history.filter((item) => item.label !== current);
  if (others.length === 0) return null;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;width:100%;margin-top:4px;';

  const label = document.createElement('span');
  label.textContent = t('filters.recentSearches');
  label.style.cssText = 'font-size:13px;color:#666;margin-right:8px;';
  row.appendChild(label);

  others.forEach((item) => {
    row.appendChild(
      buildFilterChip(item.label, false, () => {
        window.runOujSearchByKeyword(item.label);
      })
    );
  });

  // 履歴のクリア
  const clearChip = buildFilterChip(t('filters.clearRecent'), false, () => {
    window.saveSetting(historyKey, []);
    renderFilterBar(list);
  });
  clearChip.style.color = '#999';
  row.appendChild(clearChip);

  return row;
}

// 並び替えチップ行。「未視聴を優先」「視聴途中を優先」は全項目の分類(サーバーリクエスト)が
// 必要になるため、クリックされた時だけ非同期で分類してから並び替える
function buildSortRow(list) {
  const sortMode = list.oujSortMode || 'default';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;width:100%;margin-top:4px;';

  const label = document.createElement('span');
  label.textContent = t('sort.label');
  label.style.cssText = 'font-size:13px;color:#666;margin-right:8px;';
  row.appendChild(label);

  const sortOptions = [
    { value: 'default', label: t('sort.default') },
    { value: 'newest', label: t('sort.newest') },
    { value: 'unwatched', label: t('sort.unwatched') },
    { value: 'partial', label: t('sort.partial') },
  ];
  sortOptions.forEach(({ value, label: optionLabel }) => {
    row.appendChild(
      buildFilterChip(optionLabel, sortMode === value, async () => {
        if (list.oujSortMode === value && !list.oujSortLoading) return;
        list.oujSortMode = value;
        list.oujSortLoading = value === 'unwatched' || value === 'partial';
        renderFilterBar(list);
        await window.applySearchResultSort(list);
        list.oujSortLoading = false;
        renderFilterBar(list);
      })
    );
  });

  if (list.oujSortLoading) {
    const loading = document.createElement('span');
    loading.textContent = t('sort.sorting');
    loading.style.cssText = 'font-size:12px;color:#999;margin-left:8px;';
    row.appendChild(loading);
  }

  return row;
}

window.renderFilterBar = renderFilterBar;
window.hideNativeSortControl = hideNativeSortControl;
// 検索ボックスのクイック絞り込みパネル(search-box-filter-panel.js)・page-course-select-filters.js
// の年度絞り込みから再利用するチップ生成・複数選択ドロップダウン・チップ色
window.buildOujFilterChip = buildFilterChip;
window.buildOujMultiSelectDropdown = buildMultiSelectDropdown;
window.OUJ_MEDIA_FILTER_CHIP_COLOR = MEDIA_FILTER_CHIP_COLOR;
