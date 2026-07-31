// 動画タイトル横のアクションボタン群（共有ボタンの隣に並ぶ）
// - PiP: ピクチャーインピクチャーで「ながら視聴」
// - しおり: 現在の再生位置にメモ付きのしおりを挟む（メニューの「しおり」から一覧・ジャンプ）
// - あとで見る: 動画単位の「あとで見る」リストへ追加/削除

const BOOKMARKS_STORAGE_KEY = 'bookmarks';
const BOOKMARKS_MAX_ITEMS = 200;
// しおりからのジャンプ時に「どの動画の何秒に飛ぶか」を受け渡すキー
const PENDING_SEEK_STORAGE_KEY = 'pendingSeek';

function getBookmarks() {
  const list = window.getSetting(BOOKMARKS_STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveBookmark(bookmark) {
  let list = getBookmarks();
  list.unshift(bookmark);
  if (list.length > BOOKMARKS_MAX_ITEMS) list = list.slice(0, BOOKMARKS_MAX_ITEMS);
  window.saveSetting(BOOKMARKS_STORAGE_KEY, list);
}

function removeBookmark(bookmarkId) {
  const list = getBookmarks().filter((item) => item.id !== bookmarkId);
  window.saveSetting(BOOKMARKS_STORAGE_KEY, list);
}

function formatBookmarkTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// タイトル横の小ボタンを共有ボタンと同じ見た目で作る
function createTitleActionButton({ className, title, html }) {
  const button = document.createElement('button');
  button.classList.add(className);
  button.style.marginLeft = '4px';
  button.style.verticalAlign = 'middle';
  button.style.padding = '2px 4px';
  button.style.fontSize = '12px';
  button.style.fontWeight = 'bold';
  button.style.cursor = 'pointer';
  button.style.border = '1px solid #ccc';
  button.style.borderRadius = '3px';
  button.style.backgroundColor = '#f0f0f0';
  button.title = title;
  button.innerHTML = html;
  return button;
}

// PiPボタン
// ラジオ番組(音声のみ)は動画トラックが無く、ブラウザのPiP APIが構造的に使えない
// (クリックすると必ずInvalidStateErrorで失敗する)ため、判定できる場合はボタン自体を出さない
async function addPipButton(titleElement) {
  // titleElementはSPA内で動画が切り替わっても同じDOMノードが使い回されることがある。
  // 前の動画(テレビ番組)で追加したボタンが、ラジオ番組への切り替え後も残らないよう、
  // 判定前に一旦取り除く(あればaddBookmarkButton等と同様に作り直す)
  const existing = titleElement.querySelector('.video-pip-button');
  if (existing) existing.remove();
  if (!document.pictureInPictureEnabled) return;
  const startUrl = window.location.href;
  const isRadio = typeof window.isRadioProgram === 'function' && await window.isRadioProgram();
  // 判定待ち(最大5秒程度)の間に別の動画/ページへ遷移していたら、古い判定結果で
  // 今のtitleElementにボタンを挿入しない
  if (window.location.href !== startUrl) return;
  if (isRadio) return;
  if (titleElement.querySelector('.video-pip-button')) return; // 判定待ちの間に他経路で追加済み
  const button = createTitleActionButton({
    className: 'video-pip-button',
    title: 'ピクチャーインピクチャー（小窓）で再生',
    html: '⧉ 小窓',
  });
  button.addEventListener('click', async () => {
    const video = document.querySelector('video');
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (e) {
      // 上のisRadioProgram判定をすり抜けたケース(判定失敗時など)への保険。
      // ラジオ番組は動画トラックが無くPiP自体が構造的に使えない(InvalidStateError)ため、
      // 原因不明の失敗と区別して対応不可であることを伝える
      if (e.name === 'InvalidStateError' && video.videoWidth === 0) {
        window.showErrorNotification('ラジオ番組（映像のない音声のみのコンテンツ）は小窓表示に対応していません');
      } else {
        window.showErrorNotification('小窓表示に失敗しました');
      }
    }
  });
  titleElement.appendChild(button);
}

// 再生中の動画があれば小窓(PiP)に切り替える。PiPが使えない場合(ラジオ番組など動画
// トラックが無い場合や、その他PiP自体に失敗した場合)は一時停止にフォールバックする。
// メニューのオーバーレイパネル(menu-native-shell.js)が動画を覆い隠す直前に呼ばれ、
// 「見えない場所で操作不能なまま再生され続ける」不具合を防ぐための共通処理。
async function pipOrPauseCurrentVideoIfPlaying() {
  const video = document.querySelector('video');
  if (!video || video.paused) return;
  if (document.pictureInPictureElement === video) return; // 既に小窓なら何もしない
  if (document.pictureInPictureEnabled) {
    try {
      await video.requestPictureInPicture();
      // 「パネルを開いたから小窓にした」ことを覚えておき、小窓を閉じたとき／
      // パネルを閉じたときに動画をページ内へ戻せるようにする（下記の
      // leavepictureinpicture 監視と menu-native-shell.js の removeNativeOverlay）
      window.oujPipStartedByOverlay = true;
      return;
    } catch (e) {
      // PiP不可(ラジオ番組等、動画トラックが無いコンテンツ)の場合は下の一時停止に
      // フォールバックする。無言で止めるとユーザーが「なぜ止まったか」分からず
      // 混乱するため、理由を通知する
    }
  }
  video.pause();
  if (typeof window.showInfoNotification === 'function') {
    window.showInfoNotification('ラジオ番組など小窓表示に対応していないコンテンツのため、動画を一時停止しました（閉じると続きから再生できます）');
  }
}

// PiP中に他ページへ実際に遷移すると、遷移先はAngular側が動画コンポーネントを
// 破棄してしまい、動画自体の再生は止まる(実機検証で確認: currentTimeが0に
// リセットされ再生も止まる)のに、PiPウィンドウの見た目だけが「開いたまま」
// 残ってしまう不具合があった。同一ページ内でオーバーレイパネルを開くだけなら
// 動画は生き続けるため無関係(pipOrPauseCurrentVideoIfPlaying側で対応済み)だが、
// URLが変わる本当のページ遷移が起きたら、中身の伴わないPiPウィンドウを残さない
// よう明示的に閉じる。content.jsがURL変化のたびに発行する汎用イベントを使う
if (!window.oujPipAutoExitOnNavigateAdded) {
  window.oujPipAutoExitOnNavigateAdded = true;
  window.addEventListener('ouj:locationchange', () => {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  });
}

// 小窓(PiP)を閉じた（PiPウィンドウの「タブに戻る」＝拡大ボタン、または×）ときの後始末。
// メニューのオーバーレイパネルを開くと動画は自動的に小窓へ逃がされるが、パネル自体は
// #main全体を覆ったまま残る。そのため小窓から戻ってきても動画は隠れたままで、
// 「拡張機能のパネルへ行くと動画に戻れない」状態になっていた。PiPが終わったら
// パネルを閉じ、動画を画面内までスクロールして必ず見える状態にする。
// leavepictureinpictureはvideo要素で発火してバブリングするため、SPAで動画要素が
// 差し替わっても効くようdocumentで受ける。
if (!window.oujPipShowVideoOnLeaveAdded) {
  window.oujPipShowVideoOnLeaveAdded = true;
  document.addEventListener('leavepictureinpicture', () => {
    // 先に降ろしておく。この後のremoveNativeOverlayが「パネルを閉じたので
    // PiPを解除する」処理へ入って二重に解除しようとするのを防ぐ
    window.oujPipStartedByOverlay = false;
    const overlayOpen = typeof window.isOujNativeOverlayOpen === 'function'
      && window.isOujNativeOverlayOpen();
    if (!overlayOpen) return;
    window.removeNativeOverlay();
    // パネル内を下までスクロールしていると、パネルを閉じただけでは動画が画面外に
    // ある。block:'nearest'なら既に見えているときは動かず、画面外のときだけ最小限
    // スクロールして必ず見える状態にできる
    const video = document.querySelector('video');
    if (video) video.scrollIntoView({ block: 'nearest' });
  });
}

// しおりボタン
function addBookmarkButton(titleElement, currentVideo) {
  // titleElementはSPA内で動画が切り替わっても(タイトルのテキストだけ更新されて)
  // 同じDOMノードが使い回されることがある。既存ボタンをそのまま残すと、クリック
  // ハンドラが最初に生成した時点のcurrentVideo(古い動画)をクロージャで握ったままに
  // なるため、既存があれば一度取り除いてから最新のcurrentVideoで作り直す
  const existing = titleElement.querySelector('.video-bookmark-button');
  if (existing) existing.remove();
  const button = createTitleActionButton({
    className: 'video-bookmark-button',
    title: '現在の再生位置にしおりを挟む（メニューの「しおり」から一覧できます）',
    html: '🔖 しおり',
  });
  button.addEventListener('click', async () => {
    const video = document.querySelector('video');
    if (!video) {
      window.showWarningNotification('動画が見つかりません');
      return;
    }
    const time = Math.floor(video.currentTime);
    const detailLines = (currentVideo?.detail || '').split('\n');
    const courseName = (detailLines[0] || '').replace(/（’\d{2}）$/, '').trim();
    const note = await window.showPromptDialog(
      `位置: ${formatBookmarkTime(time)} にしおりを挟みます。メモがあれば入力してください（空欄でもOK）。`,
      'しおりを追加',
      { placeholder: '例: 試験に出そうな用語の説明', okText: '追加' }
    );
    if (note === null) return; // キャンセル
    saveBookmark({
      id: `${currentVideo?.contentId || window.getCurrentVideoId()}_${time}_${Date.now()}`,
      contentId: String(currentVideo?.contentId || window.getCurrentVideoId()),
      categoryId: String(currentVideo?.categoryId || window.getCurrentCategoryId() || ''),
      time,
      title: currentVideo?.title || '',
      courseName,
      note: note.trim(),
      createdAt: new Date().toISOString(),
    });
    window.showSuccessNotification(`しおりを追加しました（${formatBookmarkTime(time)}）`);
  });
  titleElement.appendChild(button);
}

// あとで見るトグルボタン
function addWatchLaterButton(titleElement, currentVideo) {
  // 同じDOMノード再利用時に古いcontentIdのクロージャが残らないよう、既存があれば作り直す
  // (理由はaddBookmarkButtonのコメント参照)
  const existing = titleElement.querySelector('.video-watch-later-button');
  if (existing) existing.remove();
  const contentId = String(currentVideo?.contentId || window.getCurrentVideoId());
  const categoryId = String(currentVideo?.categoryId || window.getCurrentCategoryId() || '');
  const button = createTitleActionButton({
    className: 'video-watch-later-button',
    title: '「あとで見る」リストに追加/削除（メニューから一覧できます）',
    html: '',
  });
  const updateLabel = () => {
    const active = window.isInWatchLater(contentId);
    button.innerHTML = active ? '✓ あとで見る' : '⏱ あとで見る';
    button.style.backgroundColor = active ? '#e3f2fd' : '#f0f0f0';
  };
  updateLabel();
  button.addEventListener('click', () => {
    const nowActive = window.toggleWatchLater(contentId, categoryId);
    updateLabel();
    window.showSuccessNotification(nowActive ? '「あとで見る」に追加しました' : '「あとで見る」から削除しました');
  });
  titleElement.appendChild(button);
}

/**
 * タイトル横のアクションボタン群を追加する（video-player-coreから呼ばれる）
 */
function addPlayerActionButtons(currentVideo) {
  const titleElement = document.querySelector('#content-detail-area > div.title');
  if (!titleElement) return;
  addPipButton(titleElement);
  addBookmarkButton(titleElement, currentVideo);
  addWatchLaterButton(titleElement, currentVideo);
}

/**
 * しおり一覧から予約されたシーク（pendingSeek）があれば適用する。
 * しおりパネルはこのキーに{contentId, time}を書いてから動画ページに遷移する。
 */
function applyPendingSeekIfAny() {
  const pending = window.getSetting(PENDING_SEEK_STORAGE_KEY, null);
  if (!pending || !pending.contentId) return;
  const currentId = window.getCurrentVideoId();
  if (String(pending.contentId) !== String(currentId)) return;
  // 古い予約（5分以上前）は無視して破棄する
  if (!pending.setAt || Date.now() - pending.setAt > 5 * 60 * 1000) {
    window.removeSetting(PENDING_SEEK_STORAGE_KEY);
    return;
  }
  window.removeSetting(PENDING_SEEK_STORAGE_KEY);
  window.waitForElement('video', (video) => {
    const seek = () => {
      if (isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(pending.time, Math.max(0, video.duration - 1));
        window.showInfoNotification(`しおりの位置（${formatBookmarkTime(pending.time)}）から再生します`);
      }
    };
    if (video.readyState >= 1 && isFinite(video.duration)) {
      seek();
    } else {
      video.addEventListener('loadedmetadata', seek, { once: true });
    }
  });
}

// グローバル関数として公開
window.getBookmarks = getBookmarks;
window.removeBookmark = removeBookmark;
window.formatBookmarkTime = formatBookmarkTime;
window.addPlayerActionButtons = addPlayerActionButtons;
window.applyPendingSeekIfAny = applyPendingSeekIfAny;
window.pipOrPauseCurrentVideoIfPlaying = pipOrPauseCurrentVideoIfPlaying;
window.setPendingSeek = (contentId, time) => {
  window.saveSetting(PENDING_SEEK_STORAGE_KEY, { contentId: String(contentId), time, setAt: Date.now() });
};
