// 動画終了監視機能と、次の動画へ進む前のカウントダウン表示
//
// 以前は「動画が終了しました」の通知を出して2秒後に即遷移していたが、
// 突然画面が切り替わったように感じるため、YouTube風の
// 「n秒後に次の動画へ進みます（キャンセル/すぐ進む）」のオーバーレイを挟む。
// 動画末尾の自動スキップ（video-playback-management.js）からも同じ関数を使う。

// カウントダウンが表示中かどうか（末尾スキップの毎秒チェックからの多重起動防止）
let oujCountdownActive = false;
// ユーザーがキャンセルした場合、この動画では再びカウントダウンを出さない
let oujCountdownCancelled = false;
let oujCountdownIntervalId = null;

// 次の動画のタイトルを取得する（同一科目内ならリストから、それ以外はAPIから）
async function getNextVideoTitle() {
  const nextId = window.nextVideoId;
  if (!nextId) return '';
  const list = window.videoListInCourse;
  if (Array.isArray(list)) {
    const found = list.find((item) => String(item.contentId) === String(nextId));
    if (found && found.title) return found.title;
  }
  try {
    const video = await window.getVideoData(nextId);
    return video && video.title ? video.title : '';
  } catch (e) {
    return '';
  }
}

function removeNextVideoCountdown() {
  const overlay = document.getElementById('ouj-next-video-countdown');
  if (overlay) overlay.remove();
  if (oujCountdownIntervalId) {
    clearInterval(oujCountdownIntervalId);
    oujCountdownIntervalId = null;
  }
  oujCountdownActive = false;
}

/**
 * 次の動画へのカウントダウンオーバーレイを表示する。
 * @param {number} seconds - 遷移までの秒数
 * @returns {boolean} 表示を開始したかどうか（既に表示中/キャンセル済み/次動画なしはfalse）
 */
function startNextVideoCountdown(seconds = 5) {
  if (oujCountdownActive || oujCountdownCancelled) return false;
  // 既にskipToNextVideo()による遷移が開始済みなら、動画終了イベント等からの
  // 再入で新しいカウントダウンを二重に出さない
  if (typeof window.isOujSkipNavigationInProgress === 'function' && window.isOujSkipNavigationInProgress()) return false;
  if (!window.nextVideoId) return false;
  const video = document.querySelector('video');
  const container = video ? video.parentElement : null;
  if (!container) return false;
  oujCountdownActive = true;

  container.style.position = 'relative';
  const overlay = document.createElement('div');
  overlay.id = 'ouj-next-video-countdown';
  overlay.style.cssText = `
    position: absolute;
    left: 50%;
    bottom: 18%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 14px 18px;
    border-radius: 10px;
    z-index: 1001;
    font-size: 14px;
    max-width: 85%;
    box-sizing: border-box;
    text-align: center;
  `;
  overlay.innerHTML = `
    <div style="margin-bottom:6px;color:#bbdefb;font-size:12px;">次の動画</div>
    <div id="ouj-countdown-title" style="font-weight:bold;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:400px;"></div>
    <div style="margin-bottom:10px;"><span id="ouj-countdown-num" style="font-size:20px;font-weight:bold;color:#90caf9;">${seconds}</span> 秒後に自動で進みます</div>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button id="ouj-countdown-cancel" style="padding:6px 14px;border:1px solid #999;background:transparent;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;">キャンセル</button>
      <button id="ouj-countdown-now" style="padding:6px 14px;border:none;background:#1976d2;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;">すぐ進む</button>
    </div>
  `;
  container.appendChild(overlay);

  // タイトルは非同期で埋める
  getNextVideoTitle().then((title) => {
    const titleEl = document.getElementById('ouj-countdown-title');
    if (titleEl) titleEl.textContent = title || '（タイトル不明）';
  });

  overlay.querySelector('#ouj-countdown-cancel').addEventListener('click', (event) => {
    event.stopPropagation();
    oujCountdownCancelled = true;
    removeNextVideoCountdown();
  });
  overlay.querySelector('#ouj-countdown-now').addEventListener('click', (event) => {
    event.stopPropagation();
    removeNextVideoCountdown();
    window.skipToNextVideo();
  });

  let remaining = seconds;
  oujCountdownIntervalId = setInterval(() => {
    remaining--;
    const numEl = document.getElementById('ouj-countdown-num');
    if (numEl) numEl.textContent = String(remaining);
    if (remaining <= 0) {
      removeNextVideoCountdown();
      window.skipToNextVideo();
    }
  }, 1000);
  return true;
}

// 動画終了監視機能
function startVideoEndMonitoring() {
  if (typeof window.waitForElement !== 'function') {
    setTimeout(startVideoEndMonitoring, 100);
    return;
  }
  // 動画（SPA遷移）ごとにカウントダウンの状態をリセットする
  oujCountdownCancelled = false;
  removeNextVideoCountdown();
  window.waitForElement('video', (video) => {
    // 動画終了時にカウントダウンを出してから次の動画へスキップ
    const handleVideoEnded = () => {
      // 「あとで見る」リストの動画を最後まで見たらリストから外す（キューとして消化）
      const currentId = window.getCurrentVideoId ? window.getCurrentVideoId() : null;
      if (currentId && typeof window.isInWatchLater === 'function' && window.isInWatchLater(currentId)) {
        window.removeFromWatchLater(currentId);
      }
      // スリープタイマー「この回の終わりまで」が設定されていればここで停止する
      if (typeof window.consumeSleepAtEpisodeEnd === 'function' && window.consumeSleepAtEpisodeEnd()) {
        return;
      }
      const autoNextVideoEnabled = window.getBooleanSetting('autoNextVideoEnabled', true);
      if (!autoNextVideoEnabled) {
        return;
      }
      if (window.nextVideoId) {
        // 表示オプションでカウントダウン表示を隠している場合は、表示せずに
        // そのまま次の動画へ進む（「自動で次に進む」設定とは別物なので止めない）
        const countdownVisible = typeof window.isOujFeatureVisible !== 'function'
          || window.isOujFeatureVisible('player-next-countdown');
        if (countdownVisible) {
          startNextVideoCountdown(5);
        } else if (typeof window.skipToNextVideo === 'function') {
          window.skipToNextVideo();
        }
      }
    };
    // SPA遷移で同じvideo要素が使い回される場合の重複登録を防ぐ
    if (video.dataset.oujEndedListener !== '1') {
      video.dataset.oujEndedListener = '1';
      video.addEventListener('ended', handleVideoEnded);
    }
  });
}

window.startVideoEndMonitoring = startVideoEndMonitoring;
window.startNextVideoCountdown = startNextVideoCountdown;
window.isNextVideoCountdownActive = () => oujCountdownActive;
window.isNextVideoCountdownCancelled = () => oujCountdownCancelled;
