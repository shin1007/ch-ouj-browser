// 検索結果の「コンパクト表示」。
//
// 検索結果は1回(エピソード)ごとに大きなサムネイル＋あらすじ付きの行になるため、同じ科目の
// 回がヒットすると同じ科目名の行が延々と並んで全体が見渡しづらい。コンパクト表示をONにすると
//  1. サムネイルとあらすじを隠して1行を小さくする
//  2. 同じ科目の回を1行にまとめ、科目名＋回のチップ(「第01回」など)として並べる
// の2点で一覧を圧縮する。チップをクリックするとその回の再生ページへ移動する。
//
// 科目の判定は各項目が元々持っているパンくず表示(.content-category、
// 例:「01 教養学部 > 09 看護師資格取得に資する科目 > 004 母性看護学（'26） 1887432」)から行う。
// 末尾の数字が科目のcategoryIdなので、追加のAPIリクエストなしでグループ化できる
// (放送大学サーバーへの負荷を増やさない＝本拡張の重要方針)。
//
// 絞り込み(page-search-result-filters.js)との関係:
//  - まとめ表示の対象は「絞り込みで残っている項目」。絞り込みで消えた回はチップにも出さない。
//  - 絞り込みは項目ごとの遅延分類(IntersectionObserver)の完了を待つため、分類中の回は
//    まだチップにできない。そこで分類が済んでいない回を持つグループは「確認中」を出したまま
//    行自体は表示し続ける。まとめ行が画面内に入るとそのグループの未分類の回をまとめて
//    分類する(グループ化で隠れた回はIntersectionObserverが発火しないため、この駆動が必要)。
//    分類が進むたびに再グループ化(scheduleCompactRegroup、デバウンス)して表示を更新する。
//
// 表示の切り替え自体は絞り込みバー(page-search-result-filter-bar.js)のチップから行う。
// バーごと隠せる表示オプション(search-result-filters)の配下なので、専用の表示オプションは持たない。
// 1科目の回一覧(video-select)は全項目が同じ科目＝1グループになってしまい意味がないため出さない。

const OUJ_COMPACT_VIEW_SETTING_KEY = 'searchCompactView';
const OUJ_COMPACT_STYLE_ID = 'ouj-compact-view-style';
const OUJ_COMPACT_REGROUP_DELAY_MS = 120;

function isOujCompactViewEnabled() {
  return window.getBooleanSetting(OUJ_COMPACT_VIEW_SETTING_KEY, false);
}

function setOujCompactViewEnabled(enabled) {
  window.saveSetting(OUJ_COMPACT_VIEW_SETTING_KEY, !!enabled);
}

// コンパクト表示用のCSS。サイト側のCSSに確実に勝たせるため!importantを付ける。
// まとめ行(.ouj-compact-grouped)はサイト純正の中身(.item-inner)ごと隠し、代わりに
// 拡張が作った.ouj-compact-groupだけを見せる(純正の内部構造に踏み込まずに済む)
function ensureCompactStyle() {
  if (document.getElementById(OUJ_COMPACT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = OUJ_COMPACT_STYLE_ID;
  style.textContent = `
    .ouj-compact-list .thumb-content,
    .ouj-compact-list .list-content-detail { display: none !important; }
    .ouj-compact-list > ion-item.ouj-compact-grouped > .item-inner { display: none !important; }
    .ouj-compact-group { padding: 8px 12px; width: 100%; }
    .ouj-compact-subject {
      display: inline-block; font-size: 14px; font-weight: bold; color: #1976d2;
      background: none; border: none; padding: 0; text-align: left; text-decoration: none;
    }
    a.ouj-compact-subject { cursor: pointer; }
    a.ouj-compact-subject:hover { text-decoration: underline; }
    span.ouj-compact-subject { color: #333; }
    .ouj-compact-count { font-size: 12px; font-weight: normal; color: #666; margin-left: 6px; }
    .ouj-compact-path { font-size: 11px; color: #888; margin-top: 2px; }
    .ouj-compact-episodes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .ouj-compact-ep {
      display: inline-block; font-size: 12px; padding: 3px 10px; border-radius: 12px;
      cursor: pointer; text-decoration: none; line-height: 1.5;
      border: 1px solid #ddd; background: #fff; color: #333; white-space: nowrap;
    }
    .ouj-compact-ep:hover { background: #f0f0f0; }
    .ouj-compact-ep.ouj-compact-done { border-color: #aed581; background: #dcedc8; color: #33691e; }
    .ouj-compact-ep.ouj-compact-partial { border-color: #ffcc80; background: #fff3e0; color: #e65100; }
    .ouj-compact-pending { font-size: 12px; color: #999; margin-top: 6px; }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// 項目のパンくず表示から科目(グループ)情報を取り出す。
// 「01 教養学部 > 09 看護師資格取得に資する科目 > 004 母性看護学（'26） 1887432」形式で、
// 末尾は科目コード。取れなければパンくず文字列そのものをキーにする。
// ※この数字はサイトのcategoryIdでは無いのでリンクには使えない(サイト自身は同じ回を
//   ca=30818 のような別の値で開く)。リンク用のcategoryIdはgetCompactRealCategoryIdを使う。
//
// 同じ科目が複数のコースに登録されていると、科目コードは数字の後ろに識別用の英字が付いた
// 形で枝分かれする(実データ例:「現代社会のなかの家族（’２６）」は 生活と福祉=1519549 /
// 心理と教育=1519549a / 社会と産業=1519549b の3件。回も別々のcontentIdで3件ずつ並ぶ)。
// 検索結果で同じ回が3回出てくるのがまさに畳みたい状態なので、英字を落とした数字部分を
// グループのキーにして1つの科目としてまとめる
function getCompactGroupInfo(item) {
  const label = item.querySelector('.content-category');
  if (!label) return null;
  const text = (label.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const match = text.match(/^(.*?)\s+(\d+[A-Za-z]*)$/);
  const path = match ? match[1].trim() : text;
  const subjectCode = (match ? match[2] : '').replace(/[A-Za-z]+$/, '');
  const segments = path.split('>').map((s) => s.trim()).filter(Boolean);
  return {
    key: subjectCode || path,
    subject: segments[segments.length - 1] || path,
    parentPath: segments.slice(0, -1).join(' > '),
  };
}

// 回のタイトル。分類後に付く拡張のバッジ(.ouj-result-badges)は除いて元のタイトルだけを取る
function getCompactItemTitle(item) {
  const titleEl = item.querySelector('.list-content-title .title') || item.querySelector('.title');
  if (!titleEl) return '';
  const clone = titleEl.cloneNode(true);
  clone.querySelectorAll('.ouj-result-badges').forEach((el) => el.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

// チップの短いラベル。「第01回 ○○」なら「第01回」だけにする(まとめ行では回番号が分かれば十分)
function getCompactEpisodeLabel(title) {
  const match = title.match(/^第\s*([0-9０-９]+)\s*回/);
  if (match) return `第${match[1]}回`;
  return title.length > 14 ? `${title.slice(0, 14)}…` : (title || '(無題)');
}

// 「第01回 …」から回番号を取り出す(全角数字もありうる)。取れなければ末尾扱いの大きな値
function getCompactEpisodeNumber(title) {
  const match = title.match(/^第\s*([0-9０-９]+)\s*回/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const halfWidth = match[1].replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
  return Number(halfWidth);
}

function isCompactItemClassified(item) {
  return item.dataset.oujClassified === 'done' || item.dataset.oujClassified === 'unavailable';
}

const OUJ_VIEW_BASE = 'https://v.ouj.ac.jp/view/ouj/#/navi';

// リンクに使える本物のcategoryId。パンくず末尾の数字は科目コード(例: 1519549)であって
// サイトのcategoryIdではない(実データで確認: サイト自身は同じ回を ca=30818 で開く)。
// 正しい値は分類時に取得済みのvod-contentから拾って dataset.oujCategoryId に入れてある
// (page-search-result-filters.js)。まだ分類が済んでいない項目では空になる
function getCompactRealCategoryId(items) {
  const found = items.find((item) => item.dataset.oujCategoryId);
  return found ? found.dataset.oujCategoryId : '';
}

// 回チップのリンク先。Ctrl+クリックや中クリックでブラウザに「新しいタブで開く」を
// させるには実際のhrefが必要なので、拡張側でURLを組み立てる(他パネルと同じ
// player?co=…&ct=V&ca=… 形式)。categoryIdが未取得の間はco=だけで開く(実サイトで
// ca無しでも再生ページが開けることを確認済み)。通常クリックではこのURLは使わず、
// サイト純正のリンクボタンを押す(下記 attachCompactLinkBehavior)
function buildCompactPlayerHref(item, groupCategoryId) {
  const contentId = window.extractContentIdFromThumbnail(item);
  if (!contentId) return '';
  // 自分の行がまだ分類されていなくても、同じ科目なので同じグループの値を使ってよい
  const categoryId = item.dataset.oujCategoryId || groupCategoryId || '';
  return `${OUJ_VIEW_BASE}/player?co=${contentId}&ct=V${categoryId ? `&ca=${categoryId}` : ''}`;
}

// 拡張が作るリンクに、ネイティブなリンクとしての振る舞いを持たせる。
// - Ctrl/⌘/Shift/Alt+クリック、中クリック … 何もしない＝ブラウザ標準の
//   「新しいタブ/ウィンドウで開く」に任せる(そのためのhref)。中クリックは
//   そもそもclickではなくauxclickなのでこのハンドラを通らない
// - 通常の左クリック … preventDefaultしてサイト純正のリンクボタンを押す。
//   サイト自身のルーティングに乗るため、検索キーワード(se=)などの文脈が保たれ、
//   ページ全体の再読み込みも起きない(SPA遷移)。純正ボタンが無ければ
//   preventDefaultせず、hrefへの通常遷移に任せる
function attachCompactLinkBehavior(anchor, getNativeButton) {
  anchor.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    const button = getNativeButton();
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    button.click();
  });
}

// チップにする回を決める。回番号の昇順に並べる(一覧の並び替えが新しい順・未視聴を
// 優先などどれであっても、同じ科目の中では第01回→第02回…の順に読めた方が探しやすい)。
// 回番号が取れないものは元の並び順のまま後ろに置く。
// 同じ科目が複数コースに登録されている場合、同じ回が(別のcontentIdで)コースの数だけ
// 並ぶので、同じタイトルの回は最初の1つだけを残す
function orderCompactEpisodes(shownItems) {
  const seenTitles = new Set();
  return shownItems
    .map((item, index) => ({ item, index, title: getCompactItemTitle(item) }))
    .filter((entry) => {
      if (seenTitles.has(entry.title)) return false;
      seenTitles.add(entry.title);
      return true;
    })
    .sort((a, b) => {
      const episodeA = getCompactEpisodeNumber(a.title);
      const episodeB = getCompactEpisodeNumber(b.title);
      if (episodeA !== episodeB) return episodeA - episodeB;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

// まとめ行の中身(科目名＋回のチップ)を作る。repは代表として表示し続ける項目
function renderCompactGroupBlock(rep, info, shownItems, pendingCount) {
  const old = rep.querySelector(':scope > .ouj-compact-group');
  if (old) old.remove();

  const ordered = orderCompactEpisodes(shownItems);
  const block = document.createElement('div');
  block.className = 'ouj-compact-group';

  // 科目名は科目の回一覧へのリンク。<a href>にしておくとCtrl+クリックや中クリックで
  // 新しいタブに開けるほか、リンク先がステータスバーに出る(サイト内のハッシュ遷移なので
  // 通常クリックでもページ全体の再読み込みは起きない)。
  // categoryIdは分類が済んだ回から得るため、まだ1件も分類できていない間はただの見出しに
  // しておく(分類が進むと再グループ化されてリンクになる)
  const realCategoryId = getCompactRealCategoryId(shownItems);
  const subject = document.createElement(realCategoryId ? 'a' : 'span');
  subject.className = 'ouj-compact-subject';
  subject.textContent = info.subject;
  if (realCategoryId) {
    subject.href = `${OUJ_VIEW_BASE}/vod?ca=${realCategoryId}`;
    subject.title = `${info.subject} の回一覧を開く`;
  }
  if (ordered.length > 0) {
    const count = document.createElement('span');
    count.className = 'ouj-compact-count';
    count.textContent = `${ordered.length}件`;
    subject.appendChild(count);
  }
  block.appendChild(subject);

  if (info.parentPath) {
    const path = document.createElement('div');
    path.className = 'ouj-compact-path';
    // 同じ科目が複数のコースに登録されている場合、代表のコースだけを見せると
    // 他のコースの科目が消えたように見えるので、まとめた数を添える
    const paths = new Set(shownItems.map((item) => (getCompactGroupInfo(item) || {}).parentPath).filter(Boolean));
    path.textContent = paths.size > 1 ? `${info.parentPath} ほか${paths.size - 1}コース` : info.parentPath;
    block.appendChild(path);
  }

  if (ordered.length > 0) {
    const episodes = document.createElement('div');
    episodes.className = 'ouj-compact-episodes';
    ordered.forEach((item) => {
      const title = getCompactItemTitle(item);
      const chip = document.createElement('a');
      chip.className = 'ouj-compact-ep';
      chip.textContent = getCompactEpisodeLabel(title);
      const href = buildCompactPlayerHref(item, realCategoryId);
      if (href) chip.href = href;
      if (item.dataset.oujWatchState === 'done') {
        chip.classList.add('ouj-compact-done');
        chip.title = `${title}（視聴済み）`;
      } else if (item.dataset.oujWatchState === 'partial') {
        chip.classList.add('ouj-compact-partial');
        chip.title = `${title}（途中 ${item.dataset.oujWatchPercent || ''}%）`;
      } else {
        chip.title = title;
      }
      attachCompactLinkBehavior(chip, () => item.querySelector('#link-item-button'));
      episodes.appendChild(chip);
    });
    block.appendChild(episodes);
  }

  if (pendingCount > 0) {
    const pending = document.createElement('div');
    pending.className = 'ouj-compact-pending';
    pending.textContent = `他 ${pendingCount}件を確認中...`;
    block.appendChild(pending);
  }

  rep.classList.add('ouj-compact-grouped');
  rep.appendChild(block);
}

// まとめ行が画面内に入ったら、そのグループの未分類の回をまとめて分類する。
// グループ化で隠した回(display:none)は本体のIntersectionObserverが発火しないため、
// ここで駆動しないと絞り込みが有効な間ずっと「確認中」のままになってしまう
function ensureCompactClassifyObserver(list) {
  if (list.__oujCompactObserver) return list.__oujCompactObserver;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const rep = entry.target;
        const members = rep.__oujCompactMembers || [];
        const gate = list.__oujFilterGate;
        if (!gate || typeof window.ensureOujItemClassified !== 'function') return;
        const context = list.oujFilterContext || 'search';
        // ensureOujItemClassifiedは分類済み/分類中の項目を二重に走らせない
        members.forEach((item) => window.ensureOujItemClassified(item, gate, context));
      });
    },
    { root: null, rootMargin: '150px 0px', threshold: 0 }
  );
  list.__oujCompactObserver = observer;
  return observer;
}

function clearCompactStateOnItem(item) {
  const block = item.querySelector(':scope > .ouj-compact-group');
  if (block) block.remove();
  item.classList.remove('ouj-compact-grouped');
  delete item.dataset.oujCompactState;
  item.__oujCompactMembers = null;
}

// コンパクト表示のON/OFFに応じて一覧を作り直す。OFFなら元の表示へ戻すだけ。
// 項目の表示/非表示は dataset.oujCompactState('shown'|'hidden') を通じて
// updateSearchResultItemVisibility(page-search-result-filters.js)に伝える。
// 分類完了のたびに呼ばれるapplyFiltersToItemが表示を戻してしまわないよう、
// 絞り込みの判定より優先させる必要があるため
function applyCompactGrouping(list) {
  if (!list) return;
  const items = Array.from(list.querySelectorAll(':scope > ion-item[role="listitem"]'));
  const enabled = isOujCompactViewEnabled() && (list.oujFilterContext || 'search') !== 'video-select';

  if (!enabled) {
    // 一度もまとめていない一覧なら戻す対象も無い
    if (!list.classList.contains('ouj-compact-list')) return;
    list.classList.remove('ouj-compact-list');
    if (list.__oujCompactObserver) {
      list.__oujCompactObserver.disconnect();
      list.__oujCompactObserver = null;
    }
    items.forEach((item) => {
      clearCompactStateOnItem(item);
      window.updateSearchResultItemVisibility(item);
    });
    return;
  }

  ensureCompactStyle();
  list.classList.add('ouj-compact-list');
  const observer = ensureCompactClassifyObserver(list);

  // 科目ごとにまとめる。DOM順(＝現在の並び替え結果)を保つため配列で持つ
  const groups = new Map();
  const ungrouped = [];
  items.forEach((item) => {
    clearCompactStateOnItem(item);
    const info = getCompactGroupInfo(item);
    if (!info) {
      ungrouped.push(item);
      return;
    }
    if (!groups.has(info.key)) groups.set(info.key, { info, members: [] });
    groups.get(info.key).members.push(item);
  });

  // 科目が判定できなかった項目は絞り込みの判定のまま素通しする
  ungrouped.forEach((item) => window.updateSearchResultItemVisibility(item));

  groups.forEach(({ info, members }) => {
    const shown = members.filter((item) => item.dataset.oujFilterHidden !== 'true');
    const unclassified = members.filter((item) => !isCompactItemClassified(item));
    // 絞り込みが有効な間、未分類の回は一旦隠れる(page-search-result-filters.jsの方針)ので
    // チップに出せない。この分を「確認中」として件数だけ知らせる
    const pending = unclassified.filter((item) => item.dataset.oujFilterHidden === 'true');

    // 絞り込みで全滅し、かつ分類待ちも無いグループは丸ごと隠す
    if (shown.length === 0 && pending.length === 0) {
      members.forEach((item) => {
        item.dataset.oujCompactState = 'hidden';
        window.updateSearchResultItemVisibility(item);
      });
      return;
    }

    const rep = shown[0] || members[0];
    members.forEach((item) => {
      item.dataset.oujCompactState = item === rep ? 'shown' : 'hidden';
      window.updateSearchResultItemVisibility(item);
    });

    rep.__oujCompactMembers = members;
    // まとめ行が画面内に入ったら、隠している回も含めて視聴状況を確認する。
    // 隠れた回はIntersectionObserverが発火しないため、ここで駆動しないとチップに
    // 視聴済み/途中の色が付かない(通常表示でスクロールした場合と同じ回数の取得で済む)
    if (unclassified.length > 0) observer.observe(rep);

    // 1件だけで分類待ちも無いグループは、まとめる意味が無いのでサイト純正の行のまま
    // (サムネイル・あらすじはCSSで隠れるので十分コンパクトになる)
    if (shown.length === 1 && pending.length === 0) return;

    renderCompactGroupBlock(rep, info, shown, pending.length);
  });
}

// 分類完了・絞り込み・並び替えのたびに呼ばれるため、まとめてからデバウンスして作り直す
function scheduleCompactRegroup(list) {
  const target = list || (typeof window.queryOujSearchResultList === 'function' ? window.queryOujSearchResultList() : null);
  if (!target) return;
  // OFFのまま(＝一度もまとめていない)なら何もしない。分類完了のたびに呼ばれる経路なので、
  // 使っていないユーザーに無駄な走査をさせない
  if (!isOujCompactViewEnabled() && !target.classList.contains('ouj-compact-list')) return;
  if (target.__oujCompactTimer) clearTimeout(target.__oujCompactTimer);
  target.__oujCompactTimer = setTimeout(() => {
    target.__oujCompactTimer = null;
    applyCompactGrouping(target);
  }, OUJ_COMPACT_REGROUP_DELAY_MS);
}

// 絞り込みバーに置く「コンパクト表示」チップ(page-search-result-filter-bar.jsから呼ぶ)
function buildCompactViewRow(list) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;width:100%;margin-top:4px;';

  const label = document.createElement('span');
  label.textContent = '表示:';
  label.style.cssText = 'font-size:13px;color:#666;margin-right:8px;';
  row.appendChild(label);

  const enabled = isOujCompactViewEnabled();
  const chip = window.buildOujFilterChip('コンパクト表示（同じ科目をまとめる）', enabled, () => {
    setOujCompactViewEnabled(!enabled);
    window.renderFilterBar(list);
    applyCompactGrouping(list);
  }, '#6a1b9a');
  row.appendChild(chip);

  return row;
}

window.isOujCompactViewEnabled = isOujCompactViewEnabled;
window.applyOujCompactGrouping = applyCompactGrouping;
window.scheduleOujCompactRegroup = scheduleCompactRegroup;
window.buildOujCompactViewRow = buildCompactViewRow;
