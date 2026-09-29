// ホーム画面の「続きから見る」パネル
// 視聴履歴の先頭6件のうち「途中まで見た」動画を、ホーム画面の最上部にカード表示する。
// ホームを開いてワンクリックで学習を再開できるようにするのが目的。

const HOME_CONTINUE_PANEL_ID = 'ouj-home-continue-panel';
const HOME_CONTINUE_MAX_CARDS = 6;
const HOME_CONTINUE_SCAN_LIMIT = 6; // 履歴の先頭から何件までを調べるか

// 履歴から「視聴途中」の動画を集める
async function collectContinueWatchingItems() {
  const history = window.getSetting('history', []);
  if (!Array.isArray(history) || history.length === 0) return [];
  const gate = window.createConcurrencyGate(3);
  const targets = history.slice(0, HOME_CONTINUE_SCAN_LIMIT);
  const results = await Promise.all(targets.map(async (entry) => {
    try {
      const status = await gate.run(() => window.getVideoViewingStatus(entry.contentId));
      // 「途中まで見た」ものだけを対象にする（未再生・視聴済みは除く）
      if (status.isFinished || !(status.currentTimeRate > 0.01)) return null;
      const video = await gate.run(() => window.getVideoData(entry.contentId));
      if (!video || !video.title) return null;
      return {
        contentId: entry.contentId,
        categoryId: video.categoryId,
        title: video.title,
        detail: video.detail || '',
        progress: status.currentTimeRate,
        date: entry.date,
      };
    } catch (e) {
      return null;
    }
  }));
  return results.filter(Boolean).slice(0, HOME_CONTINUE_MAX_CARDS);
}

function buildContinueCardHtml(item) {
  const thumb = `https://v.ouj.ac.jp/v1/tenants/1/vod-contents/${item.contentId}/thumbnail/large`;
  const percent = Math.floor(item.progress * 100);
  const courseName = (item.detail.split('\n')[0] || '').replace(/（’\d{2}）$/, '').trim();
  const safeTitle = (item.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeCourse = courseName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div class="ouj-continue-card" role="button" tabindex="0" data-content-id="${item.contentId}" data-category-id="${item.categoryId || ''}" style="
      flex: 1 1 200px;
      max-width: 260px;
      min-width: 170px;
      cursor: pointer;
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      transition: box-shadow 0.2s;
    ">
      <div style="position:relative;aspect-ratio:16/9;background:#000;">
        <img src="${thumb}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';">
        <div style="position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,0.4);">
          <div style="height:100%;width:${percent}%;background:linear-gradient(90deg, #ff0000, #ff4444);"></div>
        </div>
        <div style="position:absolute;right:6px;bottom:8px;background:rgba(0,0,0,0.75);color:#fff;font-size:11px;padding:1px 6px;border-radius:3px;">${t('homeContinue.watchedPercent', { percent })}</div>
      </div>
      <div style="padding:8px 10px;">
        <div style="font-size:13px;font-weight:bold;color:#333;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${safeTitle}</div>
        <div style="font-size:11px;color:#888;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeCourse}</div>
      </div>
    </div>
  `;
}

async function insertHomeContinuePanel() {
  if (typeof window.waitForElement !== 'function') return;

  // 以前はcollectContinueWatchingItems()(履歴の視聴状況をAPIに問い合わせる、
  // 数百ms〜数秒かかりうる処理)を待ってからwaitForElementを呼んでいた。
  // waitForElementは「呼び出した時点のURLから変わったら打ち切り、かつ最大
  // 試行回数(旧: 5秒分)に達したらリトライせず諦める」仕様のため、他ページから
  // ホームへ遷移した直後にデータ取得が長引くと、実質的な猶予がその分減って
  // しまい、パネルが挿入されないまま終わることがあった。データ取得と要素の
  // 待機を並行して始め、かつ待機上限を大きく延ばすことでこの余地を減らす。
  const scrollContentPromise = new Promise((resolve) => {
    window.waitForElement('#home-main-content .scroll-content', resolve, 100, 150); // 最大約15秒待つ
  });

  const items = await collectContinueWatchingItems();
  if (items.length === 0) return;

  const scrollContent = await scrollContentPromise;
  // 要素の待機がURL変化やタイムアウトで打ち切られた場合、あるいは取得完了までの
  // 間にホームから離脱してDOMが破棄された場合はここで諦める
  if (!scrollContent || !scrollContent.isConnected) return;

  // SPA遷移対策: 既にパネルがあれば作り直す
  const old = document.getElementById(HOME_CONTINUE_PANEL_ID);
  if (old) old.remove();

  const panel = document.createElement('div');
  panel.id = HOME_CONTINUE_PANEL_ID;
  panel.style.cssText = 'padding: 12px 16px 4px 16px;';
  panel.innerHTML = `
    <div style="font-size:15px;font-weight:bold;color:#1565c0;margin-bottom:8px;">${t('homeContinue.title')}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${items.map(buildContinueCardHtml).join('')}
    </div>
  `;
  scrollContent.insertBefore(panel, scrollContent.firstChild);

  panel.querySelectorAll('.ouj-continue-card').forEach((card) => {
    const go = () => {
      const contentId = card.dataset.contentId;
      const categoryId = card.dataset.categoryId;
      window.location.href = `https://v.ouj.ac.jp/view/ouj/#/navi/player?co=${contentId}&ct=V&ca=${categoryId}`;
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        go();
      }
    });
    card.addEventListener('mouseenter', () => { card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; });
    card.addEventListener('mouseleave', () => { card.style.boxShadow = 'none'; });
  });
}

// ヘッダーロゴをクリックすると、サイト側は(ホームに既にいる場合でも)ホームの
// データを作り直す「更新」動作を行う。この際URLのハッシュ自体は変化しないため、
// content.js側のURL変化検知(hashchange/popstate/pushStateフック)がどれも
// 発火せず、insertHomeContinuePanel()が再実行されないままDOMだけ丸ごと
// (#home-main-content ごと)作り直されてしまい、手動で挿入していたこのパネルだけ
// 復元されずに消えたままになる不具合があった(お気に入り等のパネルを開いた状態から
// ヘッダーロゴでホームに戻る操作で再現・実機検証済み)。URL変化に頼らず、DOM構造の
// 変化そのものを監視し、ホーム表示中にパネルが消えていたら再挿入する(監視対象に
// ついてはstartHomeContinuePanelObserver参照)。
//
// この作り直しは単発のイベントではなく、各ウィジェット(お知らせ・おすすめ等)が
// 非同期にロードされるたびに#home-main-content配下が何度も作り直される、数百ms〜
// 数秒続く一連の変化として起こる(実機検証で確認)。検知した瞬間に即座に挿入すると、
// その直後の別ウィジェット読み込みによる作り直しでまた消されてしまうことがあるため、
// DOM変化が一定時間(500ms)止まってから挿入することで再構築が落ち着くのを待つ。それでも
// 挿入処理(内部でAPI通信があり数百ms〜かかる)の実行中にさらに作り直しが起きることが
// あり、その変化はpending中のため素通りしてしまう。以降トリガーとなる変化が起きなければ
// 復旧できないまま終わるため、挿入処理が完了するたびに必ずもう一度チェックを予約し、
// 実行中に取りこぼした変化もここで拾い直す。
let oujHomeContinuePanelInsertPending = false;
function maybeReinsertHomeContinuePanel() {
  if (!window.location.href.includes('/navi/home')) return;
  if (oujHomeContinuePanelInsertPending) return;
  if (document.getElementById(HOME_CONTINUE_PANEL_ID)) return;
  if (!document.querySelector('#home-main-content .scroll-content')) return;
  oujHomeContinuePanelInsertPending = true;
  insertHomeContinuePanel().finally(() => {
    oujHomeContinuePanelInsertPending = false;
    scheduleReinsertCheck();
  });
}

let oujHomeContinuePanelDebounceTimer = null;
function scheduleReinsertCheck() {
  if (oujHomeContinuePanelDebounceTimer) clearTimeout(oujHomeContinuePanelDebounceTimer);
  oujHomeContinuePanelDebounceTimer = setTimeout(() => {
    oujHomeContinuePanelDebounceTimer = null;
    maybeReinsertHomeContinuePanel();
  }, 500);
}

let oujHomeContinuePanelObserver = null;
function startHomeContinuePanelObserver() {
  if (oujHomeContinuePanelObserver) return;
  // #mainを監視対象にしていたところ、ホームの作り直し時に#main自体が別ノードに
  // 差し替えられることがあり(常にではなく実機検証でも再現率にばらつきがあった)、
  // その場合古い#mainを監視し続けたままとなり以降の変化を一切検知できなくなる
  // 不具合があった。document.bodyはSPAのライフタイム中に差し替わることが無いため、
  // これを監視対象にする。
  oujHomeContinuePanelObserver = new MutationObserver(() => { scheduleReinsertCheck(); });
  oujHomeContinuePanelObserver.observe(document.body, { childList: true, subtree: true });
}

window.insertHomeContinuePanel = insertHomeContinuePanel;
window.startHomeContinuePanelObserver = startHomeContinuePanelObserver;
