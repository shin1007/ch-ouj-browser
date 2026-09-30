// スリープタイマー機能。指定した分数が経過したら動画を自動で一時停止する。
// SPA内でのページ遷移(モジュールスコープは維持される)をまたいでカウントダウンを
// 継続させたいため、状態は本ファイルのモジュール変数として持ち、動画ページの
// 初期化のたびにリセットはしない(明示的にオフにするか、時間経過で解除されるまで維持する)。
let oujSleepTimerHandle = null;
let oujSleepTimerEndsAt = null;
// 「この回の終わりまで」モード。trueの間は動画終了時（または末尾スキップ位置到達時）に
// 次の動画へ進まず、そこで再生を停止する
let oujSleepAtEpisodeEnd = false;

function clearSleepTimer() {
  if (oujSleepTimerHandle) {
    clearTimeout(oujSleepTimerHandle);
    oujSleepTimerHandle = null;
  }
  oujSleepTimerEndsAt = null;
  oujSleepAtEpisodeEnd = false;
}

function armSleepTimer(minutes) {
  clearSleepTimer();
  if (!minutes || minutes <= 0) return;
  oujSleepTimerEndsAt = Date.now() + minutes * 60 * 1000;
  oujSleepTimerHandle = setTimeout(() => {
    oujSleepTimerHandle = null;
    oujSleepTimerEndsAt = null;
    const video = document.querySelector('video');
    if (video) {
      video.pause();
    }
    if (typeof window.showSuccessNotification === 'function') {
      window.showSuccessNotification(t('sleep.paused'), 5000);
    }
  }, minutes * 60 * 1000);
}

// 「この回の終わりまで」モードをセットする。
// 実際の停止処理は動画終了イベント側（video-ending.js / video-playback-management.js）が
// isSleepAtEpisodeEnd()を見て行う
function armSleepTimerEndOfEpisode() {
  clearSleepTimer();
  oujSleepAtEpisodeEnd = true;
}

// 「この回の終わりまで」モードで動画の終わりに達したときの処理。
// 一度停止したらモードは解除する（次の回まで持ち越さない）
function consumeSleepAtEpisodeEnd() {
  if (!oujSleepAtEpisodeEnd) return false;
  oujSleepAtEpisodeEnd = false;
  const video = document.querySelector('video');
  if (video) {
    video.pause();
  }
  if (typeof window.showSuccessNotification === 'function') {
    window.showSuccessNotification(t('sleep.stoppedAtEnd'), 5000);
  }
  return true;
}

function isSleepAtEpisodeEnd() {
  return oujSleepAtEpisodeEnd;
}

// 残り時間(分単位、切り上げ)。タイマー未設定なら0。
function getSleepTimerRemainingMinutes() {
  if (!oujSleepTimerEndsAt) return 0;
  return Math.max(0, Math.ceil((oujSleepTimerEndsAt - Date.now()) / 60000));
}

window.armSleepTimer = armSleepTimer;
window.armSleepTimerEndOfEpisode = armSleepTimerEndOfEpisode;
window.consumeSleepAtEpisodeEnd = consumeSleepAtEpisodeEnd;
window.isSleepAtEpisodeEnd = isSleepAtEpisodeEnd;
window.clearSleepTimer = clearSleepTimer;
window.getSleepTimerRemainingMinutes = getSleepTimerRemainingMinutes;
