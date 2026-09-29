// 検索ボックス(#searchText)にフォーカスした時に、検索ボックス直下へ出す「最近の検索」パネル。
//
// 以前はここに年度・コースのジャンプ選択や検索結果フィルタの事前セットも同居していたが、
// キーワード検索の文脈と無関係な機能だったため、動画のフォルダ一覧ページ(series-select、
// 科目一覧より上の階層)に常時表示するバーへ移設した(page-course-select-filters.jsの
// renderFolderBrowseBar)。ここには「最近の検索」からの再検索だけが残る。
//
// ヘッダーの#searchTextは全ページ共通で存在し、SPA遷移で作り直されることがあるため、
// 個々の要素にリスナーを付けず、document階層のfocusin委譲で捕捉する（再バインド不要）。

const SEARCH_BOX_PANEL_ID = 'ouj-search-box-panel';

// パネル内の見出し(小さなラベル)を作る
function buildPanelSectionLabel(text) {
  const label = document.createElement('div');
  label.textContent = text;
  label.style.cssText = 'font-size:12px;font-weight:bold;color:#666;margin:0 0 6px 0;';
  return label;
}

// フォールバック用の簡易チップ生成（page-search-result-filters.jsが未ロードの場合）
function buildPanelChipFallback(label, isActive, onClick, activeColor = '#1976d2') {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.textContent = label;
  chip.style.cssText = `
    display:inline-flex;align-items:center;padding:6px 14px;margin:0 8px 8px 0;
    border-radius:16px;font-size:13px;cursor:pointer;
    border:1px solid ${isActive ? activeColor : '#ddd'};
    background:${isActive ? activeColor : '#fff'};color:${isActive ? '#fff' : '#333'};
  `;
  chip.onclick = onClick;
  return chip;
}
function makePanelChip(label, isActive, onClick, activeColor) {
  const builder = window.buildOujFilterChip || buildPanelChipFallback;
  return builder(label, isActive, onClick, activeColor);
}

// --- セクション1: 最近の検索 ---
function buildRecentSearchSection() {
  const historyKey = window.OUJ_SEARCH_KEYWORD_HISTORY_KEY || 'searchKeywordHistory';
  const history = window.getSetting(historyKey, []);
  if (!Array.isArray(history) || history.length === 0) return null;

  const section = document.createElement('div');
  section.style.cssText = 'margin-bottom:10px;';
  section.appendChild(buildPanelSectionLabel(t('filters.recentSearchesTitle')));

  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex;flex-wrap:wrap;';
  history.forEach((item) => {
    if (!item || !item.label) return;
    chips.appendChild(makePanelChip(item.label, false, () => {
      // 同じキーワードを選んだ場合はページ遷移が起きず、パネルが開いたまま残るので先に閉じる
      hideSearchBoxPanel();
      window.runOujSearchByKeyword(item.label);
    }));
  });
  section.appendChild(chips);
  return section;
}

// --- パネル本体 ---
function getSearchBoxPanel() {
  let panel = document.getElementById(SEARCH_BOX_PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = SEARCH_BOX_PANEL_ID;
  panel.style.cssText = `
    position: fixed;
    z-index: 100000;
    box-sizing: border-box;
    max-height: 70vh;
    overflow-y: auto;
    padding: 12px 14px 4px 14px;
    background: #fff;
    color: #333;
    border: 1px solid #ddd;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    display: none;
  `;
  document.body.appendChild(panel);
  return panel;
}

function renderSearchBoxPanelContent(panel) {
  panel.innerHTML = '';
  const sections = [buildRecentSearchSection()].filter(Boolean);
  sections.forEach((s) => panel.appendChild(s));
  return sections.length > 0;
}

function positionSearchBoxPanel(panel, input) {
  const rect = input.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(Math.max(rect.width, 340), window.innerWidth - margin * 2);
  let left = rect.left;
  if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
  if (left < margin) left = margin;
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.left = `${left}px`;
  panel.style.width = `${width}px`;
}

let oujPanelInput = null;
function repositionOpenPanel() {
  const panel = document.getElementById(SEARCH_BOX_PANEL_ID);
  if (!panel || panel.style.display === 'none' || !oujPanelInput) return;
  // 入力欄がDOMから外れた／非表示になったら閉じる。ヘッダー折りたたみを別タブの
  // storage同期やポップアップ経由で行うとmousedownを経由せず#searchTextが
  // display:noneになる。その場合isConnectedはtrueのまま（=以前は閉じられず、
  // 矩形が全ゼロになってパネルが左上隅に取り残された）ので、実描画の有無も見る。
  const rect = oujPanelInput.getBoundingClientRect();
  const hidden = !oujPanelInput.isConnected
    || oujPanelInput.offsetParent === null
    || (rect.width === 0 && rect.height === 0);
  if (hidden) { hideSearchBoxPanel(); return; }
  positionSearchBoxPanel(panel, oujPanelInput);
}

function showSearchBoxPanel(input) {
  const panel = getSearchBoxPanel();
  // 最近の検索が1件も無ければ出す内容が無いため、空のパネルは開かない
  if (!renderSearchBoxPanelContent(panel)) {
    panel.style.display = 'none';
    oujPanelInput = null;
    return;
  }
  oujPanelInput = input;
  positionSearchBoxPanel(panel, input);
  panel.style.display = 'block';
}

function hideSearchBoxPanel() {
  const panel = document.getElementById(SEARCH_BOX_PANEL_ID);
  if (panel) panel.style.display = 'none';
  oujPanelInput = null;
}

function initSearchBoxFilterPanel() {
  if (window.__oujSearchBoxPanelInit) return;
  window.__oujSearchBoxPanelInit = true;

  // フォーカスは要素ではなくdocumentのfocusin委譲で捕捉する（SPAで#searchTextが
  // 作り直されても再バインド不要）
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target && target.id === 'searchText') {
      showSearchBoxPanel(target);
    }
  });

  // パネル外のmousedownで閉じる。検索ボックス自身とパネル内は閉じない
  // （blurでは閉じないので、パネル内のselectやチップ操作を邪魔しない）。
  // キャプチャ相で登録することで、途中の固定UIがmousedownをstopPropagation
  // しても確実に閉じられる（パネル内クリックはpanel.contains判定で除外するため、
  // キャプチャ相でも誤って閉じることはない）。
  document.addEventListener('mousedown', (event) => {
    const panel = document.getElementById(SEARCH_BOX_PANEL_ID);
    if (!panel || panel.style.display === 'none') return;
    if (panel.contains(event.target)) return;
    if (event.target && event.target.id === 'searchText') return;
    hideSearchBoxPanel();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideSearchBoxPanel();
  });

  // 開いている間はスクロール/リサイズに追従させる（ヘッダーは固定なので通常は動かないが、
  // ヘッダー折りたたみ等のレイアウト変化に備える）
  window.addEventListener('scroll', repositionOpenPanel, true);
  window.addEventListener('resize', repositionOpenPanel);
}

window.initSearchBoxFilterPanel = initSearchBoxFilterPanel;
