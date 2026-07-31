// 検索結果の「自動読み込み」。
//
// サイトの検索結果は1ページ30件で、続きは下までスクロールしたときに読み込まれる
// (Ionicのion-infinite-scroll)。絞り込みやコンパクト表示を使うと画面に残る件数が減るため、
// 続きを見るのに何度も手でスクロールする必要があった。この機能をONにすると、その
// スクロール操作を拡張が肩代わりして次のページを順に読み込む。
//
// 発火のしかた(実サイトで挙動を確認して決めた):
//  - Ionicの無限スクロールは「scrollイベントが起きた瞬間のscrollTop」で判定する。
//    scrollTopを変えずにscrollイベントだけ投げても発火しない。
//  - そこで requestMoreItems() は「下端へ代入 → scrollイベントを同期dispatch →
//    その場でスクロール位置を元に戻す」を1つのタスクの中で行う。描画はフレーム境界で
//    しか起きないため、画面は一切動かない(requestAnimationFrameでscrollTopを測って
//    確認済み: 実行中も元の位置のまま)。ユーザーの現在位置を保ったまま追加読み込みできる。
//  - 読み込み中のIonicは次の発火を無視するので、1回の試行で1ページずつ増える。
//
// サーバー負荷への配慮(本拡張の重要方針):
//  - 既定はOFF。ONにしたときだけ動く。
//  - 一度に自動で読み込むのは OUJ_AUTOLOAD_MAX_ITEMS 件まで。上限に達したらいったん
//    停止して「さらに読み込む」ボタンを出す(押されるまで追加リクエストはしない)。
//  - 何度試しても件数が増えなければ「全部読み込んだ」と判断して停止する。
//  - 総件数はサイト自身が検索時に叩いているのと同じ count API から取得し(fetchWithCacheで
//    キャッシュ)、「60 / 817件」のように表示する。全部読み終わったかの判断にも使う。
//
// 対象は検索結果ページのみ。回一覧(video-select)は1科目分(十数件)が一度に出るため不要。

const OUJ_AUTOLOAD_SETTING_KEY = 'searchAutoLoadMore';
// 1回の「自動読み込み」で読む上限(件)。30件/ページなので10ページ分
const OUJ_AUTOLOAD_MAX_ITEMS = 300;
// 1ページ読み込めたか確認するまでの待ち時間と、あきらめるまでの試行回数
const OUJ_AUTOLOAD_STEP_WAIT_MS = 700;
const OUJ_AUTOLOAD_MAX_ATTEMPTS = 8;

function isOujAutoLoadEnabled() {
  return window.getBooleanSetting(OUJ_AUTOLOAD_SETTING_KEY, false);
}

function setOujAutoLoadEnabled(enabled) {
  window.saveSetting(OUJ_AUTOLOAD_SETTING_KEY, !!enabled);
}

function countAutoLoadItems(list) {
  return list.querySelectorAll(':scope > ion-item[role="listitem"]').length;
}

// 一覧を内側に持つスクロール要素(Ionicの.scroll-content)を探す。
// ページ内には.scroll-contentが複数あるので、一覧から親をたどって最初に見つかる
// 「実際にスクロールできるもの」を使う
function findAutoLoadScroller(list) {
  let el = list.parentElement;
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains('scroll-content') && el.scrollHeight > el.clientHeight + 4) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

// 項目が増えるとブラウザのスクロールアンカリングで数px勝手にずれることがあるため、
// 小さなズレだけ元に戻す(大きく変わっていた場合はユーザー自身のスクロール操作とみなして触らない)
const OUJ_AUTOLOAD_ANCHOR_DRIFT_PX = 50;

// 次の描画フレームを待つ。ただしバックグラウンドタブではrequestAnimationFrameが
// 呼ばれないため、タイマーでも先に進めるようにする。これが無いと「下端へ移動した
// まま復帰しない」状態で止まり、タブに戻ったとき一覧が一番下までスクロールされて
// しまう(実際にヘッドレス環境で発生した)
const OUJ_AUTOLOAD_FRAME_FALLBACK_MS = 50;

const nextFrame = () => new Promise((resolve) => {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    resolve();
  };
  requestAnimationFrame(finish);
  setTimeout(finish, OUJ_AUTOLOAD_FRAME_FALLBACK_MS);
});

// 追加読み込みを1回うながす。
// 「下端へ移動 → scrollイベント → 2フレームだけ下端に留める → 元の位置へ戻す」。
// 同じタスク内で即座に戻す方式(画面が完全に動かない)も試したが、実サイトでは発火せず
// 6秒粘っても読み込まれなかった(Ionicはscrollイベントの後のフレームでスクロール位置を
// 読み直すため)。2フレーム留める方式は実測で毎回発火する。ユーザーから見た動きは
// 30ms程度で元の位置に戻り、スクロール位置も保たれる
async function requestMoreItems(scroller) {
  const original = scroller.scrollTop;
  // 項目が増えたときにブラウザがスクロール位置を勝手に補正するのを止める(スクロールアンカリング)
  const previousAnchor = scroller.style.overflowAnchor;
  scroller.style.overflowAnchor = 'none';
  try {
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    await nextFrame();
    await nextFrame();
    scroller.scrollTop = original;
    // アンカリング以外の要因でずれた場合の保険。2フレーム見て小さなズレだけ直す
    for (let i = 0; i < 2; i++) {
      await nextFrame();
      const drift = scroller.scrollTop - original;
      if (drift !== 0 && Math.abs(drift) <= OUJ_AUTOLOAD_ANCHOR_DRIFT_PX) scroller.scrollTop = original;
    }
  } finally {
    scroller.style.overflowAnchor = previousAnchor;
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 検索キーワード(URLのse=)から総件数を取る。サイト自身が検索時に叩いているのと
// 同じAPI・同じパラメータ(qt=4)を使う。失敗したら総件数なし(null)として扱う
async function fetchSearchTotalCount() {
  const match = window.location.href.match(/[?&]se=([^&]+)/);
  if (!match) return null;
  let keyword = '';
  try {
    keyword = window.decodeURLComponentSafe(`se=${match[1]}`);
  } catch (e) {
    return null;
  }
  if (!keyword) return null;
  const url = `https://v.ouj.ac.jp/v1/tenants/1/vod-contents/count?q=${encodeURIComponent(keyword)}&qt=4`;
  try {
    const data = await window.fetchWithCache(url, `oujSearchCount_${keyword}`, 60);
    if (data && typeof data.count === 'number') return data.count;
  } catch (e) { /* 総件数は表示用なので取れなくても続行する */ }
  return null;
}

// 一覧ごとの状態。フィルターバーは何度も作り直されるので、表示はこの状態から描く
function getAutoLoadState(list) {
  if (!list.__oujAutoLoadState) {
    list.__oujAutoLoadState = { phase: 'idle', loaded: 0, total: null, cap: OUJ_AUTOLOAD_MAX_ITEMS };
  }
  return list.__oujAutoLoadState;
}

function updateAutoLoadRow(list) {
  const row = document.getElementById('ouj-autoload-row');
  if (row && row.oujRefresh) row.oujRefresh();
}

async function runAutoLoad(list) {
  if (list.__oujAutoLoadRunning) return;
  list.__oujAutoLoadRunning = true;
  const state = getAutoLoadState(list);
  state.phase = 'loading';
  state.loaded = countAutoLoadItems(list);
  updateAutoLoadRow(list);

  if (state.total === null) {
    state.total = await fetchSearchTotalCount();
    updateAutoLoadRow(list);
  }

  try {
    while (isOujAutoLoadEnabled() && document.contains(list)) {
      const before = countAutoLoadItems(list);
      state.loaded = before;
      // 総件数が分かっていて全部読み終わっているなら、無駄な試行をしない
      if (state.total !== null && before >= state.total) {
        state.phase = 'done';
        break;
      }
      if (before >= state.cap) {
        state.phase = 'capped';
        break;
      }
      updateAutoLoadRow(list);

      // まだ続きがあると分かっている場合は粘る。サーバーの応答が遅れただけで
      // 「もう無い」と誤判定すると、実際にはまだ数百件あるのに止まってしまう
      const moreExpected = state.total !== null && before < state.total;
      const attemptLimit = OUJ_AUTOLOAD_MAX_ATTEMPTS * (moreExpected ? 3 : 1);
      let grew = false;
      for (let attempt = 0; attempt < attemptLimit && !grew; attempt++) {
        if (!isOujAutoLoadEnabled()) break;
        const scroller = findAutoLoadScroller(list);
        // 一覧の描画が終わっていない間はスクロール要素が見つからない(まだスクロールできない)。
        // ここで打ち切ると、ページを開いた直後にONだった場合に一度も読み込めないまま
        // 「停止しました」になってしまうため、待って次の試行へ回す
        if (!scroller) {
          await delay(OUJ_AUTOLOAD_STEP_WAIT_MS);
          continue;
        }
        await requestMoreItems(scroller);
        await delay(OUJ_AUTOLOAD_STEP_WAIT_MS);
        grew = countAutoLoadItems(list) > before;
      }
      if (!grew) {
        // 総件数から見てまだ残っているのに増えないときは「読み込みが止まった」扱いにして
        // 手動で再開できるようにする(「すべて読み込み済み」と言い切らない)
        state.phase = moreExpected ? 'stalled' : 'done';
        break;
      }
    }
    if (!isOujAutoLoadEnabled()) state.phase = 'idle';
  } finally {
    list.__oujAutoLoadRunning = false;
    state.loaded = countAutoLoadItems(list);
    updateAutoLoadRow(list);
  }
}

// 検索結果ページで自動読み込みを開始する(OFFなら何もしない)。
// フィルターバーの設置時と、チップをONにしたときに呼ばれる
function startOujAutoLoad(list) {
  if (!list || (list.oujFilterContext || 'search') !== 'search') return;
  if (!isOujAutoLoadEnabled()) return;
  runAutoLoad(list);
}

// 絞り込みバーに置く「自動読み込み」チップ＋状況表示(page-search-result-filter-bar.jsから呼ぶ)
function buildAutoLoadControls(list) {
  const wrapper = document.createElement('span');
  wrapper.id = 'ouj-autoload-row';
  wrapper.style.cssText = 'display:inline-flex;flex-wrap:wrap;align-items:center;';

  wrapper.oujRefresh = () => {
    wrapper.innerHTML = '';
    const enabled = isOujAutoLoadEnabled();
    const state = getAutoLoadState(list);

    const chip = window.buildOujFilterChip(
      '自動読み込み',
      enabled,
      () => {
        setOujAutoLoadEnabled(!enabled);
        if (!enabled) {
          // ONにしたときは上限をその時点からの300件に取り直す
          state.cap = countAutoLoadItems(list) + OUJ_AUTOLOAD_MAX_ITEMS;
          state.phase = 'loading';
          wrapper.oujRefresh();
          runAutoLoad(list);
        } else {
          state.phase = 'idle';
          wrapper.oujRefresh();
        }
      },
      '#00695c'
    );
    chip.title = '検索結果の続きを自動で読み込みます（下までスクロールする操作を拡張が代わりに行います）';
    wrapper.appendChild(chip);

    const status = document.createElement('span');
    status.style.cssText = 'font-size:12px;color:#999;margin-left:4px;margin-bottom:8px;';
    const loaded = countAutoLoadItems(list);
    const totalText = state.total !== null ? ` / ${state.total}件` : '件';
    if (enabled && state.phase === 'loading') {
      status.textContent = `読み込み中... ${loaded}${totalText}`;
    } else if (state.phase === 'capped') {
      status.textContent = `${loaded}${totalText} まで読み込み`;
    } else if (state.phase === 'stalled') {
      status.textContent = `${loaded}${totalText} で停止しました`;
    } else if (state.phase === 'done') {
      status.textContent = `すべて読み込み済み（${loaded}件）`;
    } else if (enabled) {
      status.textContent = `${loaded}${totalText}`;
    }
    if (status.textContent) wrapper.appendChild(status);

    // 上限や停止で止まっているときだけ「さらに読み込む」を出す(押されるまで通信しない)
    if (enabled && (state.phase === 'capped' || state.phase === 'stalled')) {
      const more = window.buildOujFilterChip('さらに読み込む', false, () => {
        state.cap = countAutoLoadItems(list) + OUJ_AUTOLOAD_MAX_ITEMS;
        state.phase = 'loading';
        wrapper.oujRefresh();
        runAutoLoad(list);
      });
      more.style.marginLeft = '8px';
      wrapper.appendChild(more);
    }
  };

  wrapper.oujRefresh();
  return wrapper;
}

window.isOujAutoLoadEnabled = isOujAutoLoadEnabled;
window.startOujAutoLoad = startOujAutoLoad;
window.buildOujAutoLoadControls = buildAutoLoadControls;
