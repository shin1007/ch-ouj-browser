let managedVideo = null;
let initialPosition = 0;
let currentPlaybackInterval = null;
// playlogの直接送信が一度失敗したら、このページセッション中は再試行しない
// （毎回失敗するリクエストを送り続けて放送大学サーバーに負荷をかけないため）
let playlogDirectFailed = false;
// skipToNextVideo()による遷移(co=だけ差し替えたハッシュURLへの代入で、JSコンテキストは
// 破棄されずSPA内遷移として処理される)が開始されてから実際に次の動画へ切り替わるまでの間、
// 1秒ごとのエンディング監視(下記currentPlaybackInterval)や動画終了イベントが同じ末尾条件を
// 再度満たし、二重にカウントダウン/遷移がトリガーされるのを防ぐフラグ。
// StartPlaybackManagement()が動画ごとに呼ばれるたびにリセットする
let oujSkipNavigationInProgress = false;

// 再生速度を設定するグローバル関数（科目別設定があればそれを優先）
function setPlaybackSpeed() {
  const categoryId = window.getCurrentCategoryId ? window.getCurrentCategoryId() : null;
  const speed = window.getPerCourseSetting
    ? Number(window.getPerCourseSetting('playbackSpeed', categoryId, 1.0))
    : Number(window.getSetting('playbackSpeed', 1.0));
  if (managedVideo) {
    const speedControlEnabled = window.getBooleanSetting('playbackSpeedControlEnabled', true);
    managedVideo.playbackRate = speedControlEnabled ? speed : 1.0;
  }
}

// 動画タイトル横に「実質残り時間」を表示する。
// 倍速再生時は「あと何分で見終わるか」が直感的に分からないため、
// 再生速度で割った換算値を表示する（等速なら実時間のみ）
function updateRemainingTimeDisplay(video) {
  // 表示オプション(utils/display-options.js)で非表示にしていれば作らない
  if (typeof window.isOujFeatureVisible === 'function' && !window.isOujFeatureVisible('player-remaining-time')) return;
  const titleEl = document.querySelector('#content-detail-area > div.title');
  if (!titleEl || !video || !isFinite(video.duration) || video.duration <= 0) return;
  let span = document.getElementById('ouj-remaining-time');
  if (!span) {
    span = document.createElement('span');
    span.id = 'ouj-remaining-time';
    span.style.cssText = 'margin-left: 8px; font-size: 12px; color: #888; font-weight: normal; vertical-align: middle; white-space: nowrap;';
    titleEl.appendChild(span);
  }
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const remainReal = Math.max(0, video.duration - video.currentTime);
  const rate = video.playbackRate || 1;
  if (Math.abs(rate - 1) < 0.01) {
    span.textContent = `残り ${formatTime(remainReal)}`;
  } else {
    span.textContent = `残り ${formatTime(remainReal / rate)}（${rate}x換算・実時間 ${formatTime(remainReal)}）`;
  }
}

// オープニングの自動スキップ。科目別の「動画の最初をスキップ」秒数が設定されていて、
// かつ再生がほぼ先頭から始まった場合のみシークする。
// サーバー側のレジューム（前回の続きから再生）が働いた場合は、その位置を尊重して何もしない
let oujOpeningSkipVideo = null;
let oujOpeningSkipHandler = null;

function armOpeningSkip(video) {
  const contentId = window.getCurrentVideoId ? window.getCurrentVideoId() : null;
  if (!contentId) return;
  // 同じ動画に対して二重にリスナーを張らない
  if (video.dataset.oujOpeningSkipFor === String(contentId)) return;
  video.dataset.oujOpeningSkipFor = String(contentId);

  // 前の動画用のhandlerがdone===trueになる(自己解除される)のを待たず、
  // 動画切り替え時に即座に外す。SPA内でvideoタグが使い回された場合、外し忘れると
  // 前のhandlerが新しい動画のtimeupdateに反応して意図しないシークを行いうる
  // (video-ab-repeat.jsと同じ方式に揃えた)
  if (oujOpeningSkipVideo && oujOpeningSkipHandler) {
    oujOpeningSkipVideo.removeEventListener('timeupdate', oujOpeningSkipHandler);
    oujOpeningSkipVideo = null;
    oujOpeningSkipHandler = null;
  }

  const categoryId = window.getCurrentCategoryId ? window.getCurrentCategoryId() : null;
  const skipStart = Number(window.getPerCourseSetting ? window.getPerCourseSetting('skipStartSeconds', categoryId, 0) : 0);
  if (!(skipStart > 0)) return;

  let done = false;
  const handler = () => {
    if (done) {
      video.removeEventListener('timeupdate', handler);
      return;
    }
    if (!isFinite(video.duration) || video.duration <= skipStart) {
      done = true;
      return;
    }
    if (video.currentTime < 3 && video.currentTime < skipStart) {
      // ほぼ先頭から再生が始まった → オープニングをスキップ
      done = true;
      video.currentTime = skipStart;
      if (typeof window.showInfoNotification === 'function') {
        window.showInfoNotification(`冒頭を${skipStart}秒スキップしました`);
      }
    } else if (video.currentTime >= 3) {
      // レジューム等で途中から始まった → スキップ不要
      done = true;
    }
  };
  oujOpeningSkipVideo = video;
  oujOpeningSkipHandler = handler;
  video.addEventListener('timeupdate', handler);
}

// 動画の再生管理機能
function StartPlaybackManagement() {
  // 新しい動画の初期化なので、前の動画のスキップ遷移中フラグを引き継がない
  oujSkipNavigationInProgress = false;
  // 動画切り替え時に前の監視が残らないよう、既存のタイマーを止めてから開始する
  if (currentPlaybackInterval) {
    clearInterval(currentPlaybackInterval);
    currentPlaybackInterval = null;
  }

  window.waitForElement('video', (v) => {
    managedVideo = v;
    initialPosition = managedVideo.currentTime;
    // 冒頭スキップ（科目別設定）を仕掛ける
    armOpeningSkip(managedVideo);
  });

  let i = 0;
  currentPlaybackInterval = setInterval(() => {
    // 再生ボタンを押したときに再生速度がx1.0になるっぽいので、その対策。
    // 本来は毎秒やる必要はないが、再生速度を適用する。
    setPlaybackSpeed();

    if (!managedVideo) {
      i++;
      return;
    }

    // タイトル横の残り時間表示を更新
    updateRemainingTimeDisplay(managedVideo);

    // 定期的に再生ログを残す（直接API送信を試み、失敗時は一時停止→再生のフォールバック）
    const playlogIntervalMinutes = window.getSetting('playlogIntervalMinutes', 3);
    const playlogIntervalSeconds = playlogIntervalMinutes * 60;
    if (i % playlogIntervalSeconds === 0) {
      sendPlayLog(managedVideo);
      i = 0; // カウンタをリセット
    }

    // エンディングのスキップ（科目別設定があればそれを優先）
    const categoryId = window.getCurrentCategoryId ? window.getCurrentCategoryId() : null;
    let skipEnd = Number(window.getPerCourseSetting ? window.getPerCourseSetting('skipEndSeconds', categoryId, 0) : 0);
    if (skipEnd > 0 && managedVideo.currentTime > managedVideo.duration - skipEnd) {
      // 再生ボタンが押されてから5秒以上が経過している場合のみ
      if (managedVideo.currentTime - initialPosition < 5) {
        i++;
        return;
      }
      // 動画が再生中の場合のみ
      if (!managedVideo.paused) {
        // スリープタイマー「この回の終わりまで」の場合はここで停止して終わる
        if (typeof window.isSleepAtEpisodeEnd === 'function' && window.isSleepAtEpisodeEnd()) {
          window.consumeSleepAtEpisodeEnd();
          i++;
          return;
        }
        // 既に次の動画への遷移が開始済みなら、遷移完了(SPA切り替え)を待つだけで
        // 二重にカウントダウン/遷移を起動しない
        if (oujSkipNavigationInProgress) {
          i++;
          return;
        }
        // カウントダウン付きで次の動画へ（表示中・キャンセル済みなら何もしない）
        if (typeof window.startNextVideoCountdown === 'function') {
          window.startNextVideoCountdown(5);
        } else {
          skipToNextVideo();
        }
      }
    }

    i++;
  }, 1000); // 1秒ごとにチェック

  // 監視を停止する関数を返す
  return () => {
    clearInterval(currentPlaybackInterval);
    currentPlaybackInterval = null;
  };
}

// 再生ログをサイトのAPIへ直接送信する。
// サイト本体は一時停止時にPOST /viewinglog/{viewId}/end-date へ現在の再生率を
// 送っている（classtream-webapiのupdateViewingLogEndDateと同じ形式）。
// 再生開始時にサイトが登録した最新の視聴ログのviewIdを取得し、同じ形式で
// 再生率を送ることで、動画を一瞬止めることなく再生位置を保存する。
// レスポンス形式が想定と違う場合はfalseを返し、従来の一時停止→再生方式に任せる。
async function sendPlayLogDirect(video) {
  if (playlogDirectFailed) return false;
  const contentId = window.getCurrentVideoId ? window.getCurrentVideoId() : null;
  if (!contentId || !isFinite(video.duration) || video.duration <= 0) return false;
  try {
    const latestRes = await fetch(`https://v.ouj.ac.jp/v1/tenants/1/vod-contents/${contentId}/viewinglog/latest`, {
      credentials: 'include',
    });
    if (!latestRes.ok) {
      playlogDirectFailed = true;
      return false;
    }
    const latest = await latestRes.json();
    // 想定した視聴ログの形（数値のcurrentTimeRateを持つオブジェクト）でなければ、
    // 誤ったIDのレコードへ書き込む事故を避けるため直接送信はあきらめてフォールバックに任せる。
    // getVideoProgressもこの/viewinglog/latestのcurrentTimeRateを読んでいるので、
    // この形が満たされない場合はそもそも想定外のレスポンス
    if (!latest || typeof latest !== 'object' || typeof latest.currentTimeRate !== 'number') {
      playlogDirectFailed = true;
      return false;
    }
    // viewIdのフィールド名はAPI仕様が公開されていないため候補を順に探し、
    // 使える型（正の数値 or 空でない文字列）であることも確認する
    const viewId = latest.viewId ?? latest.id ?? latest.viewingLogId ?? latest.logId;
    const viewIdUsable = (typeof viewId === 'number' && Number.isFinite(viewId) && viewId > 0)
      || (typeof viewId === 'string' && viewId.trim() !== '');
    if (!viewIdUsable) {
      playlogDirectFailed = true;
      return false;
    }
    const rate = Math.max(0, Math.min(video.currentTime / video.duration, 1));
    const savedRate = Math.max(0, Math.min(latest.currentTimeRate, 1));
    // 現在位置が記録済みの進捗より後ろ（シーク戻し・見直し）のときは、
    // 学習進捗を巻き戻さないよう送信しない。送信はしないが「処理済み」として返し、
    // フォールバックの一時停止→再生（これもサイト側に低い再生率を保存させてしまう）も走らせない。
    // 小さなfloat誤差で誤って抑止しないよう0.001の許容を持たせる
    if (rate + 0.001 < savedRate) {
      return true;
    }
    const postRes = await fetch(`https://v.ouj.ac.jp/v1/tenants/1/vod-contents/${contentId}/viewinglog/${viewId}/end-date`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ currentTimeRate: String(rate) }).toString(),
    });
    if (!postRes.ok) {
      playlogDirectFailed = true;
      return false;
    }
    // 進捗表示用のキャッシュ(videoViewingStatus_*)も更新しておく
    try {
      await chrome.storage.local.set({
        [`videoViewingStatus_${contentId}`]: {
          data: { ...latest, currentTimeRate: rate },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (e) { /* キャッシュ更新失敗は無視 */ }
    return true;
  } catch (e) {
    playlogDirectFailed = true;
    return false;
  }
}

async function sendPlayLog(video) {
  // 既に停止している場合は何もしない
  if (video.paused) return;
  // まずAPIへの直接送信を試みる（成功すれば動画は一瞬も止まらない）
  const directOk = await sendPlayLogDirect(video);
  if (directOk) return;
  // フォールバック: 一時停止→再生でサイト側に再生ログを保存させる
  if (video.paused) return;
  video.pause();
  setTimeout(() => {
    try {
      console.log('動画の再生ログを残すために一時停止後に再生します');
      video.play().catch(e => {
        console.log('動画の自動再生がブロックされました:', e);
      });
    } catch(e){
      console.log('動画の自動再生がブロックされました:', e);
    }
  }, 1);
}

async function skipToNextVideo() {
  // 既に遷移開始済みなら二重に発火させない(理由は上のoujSkipNavigationInProgress宣言部を参照)
  if (oujSkipNavigationInProgress) return;
  if (window.nextVideoId) {
    const url = window.location.href;
    const matchCo = url.match(/co=(\d+)/);
    if (matchCo) {
      oujSkipNavigationInProgress = true;
      let nextVideoUrl = url.replace(matchCo[0], `co=${window.nextVideoId}`);
      // お気に入りランダム再生など、次の動画が別科目の場合はca=も差し替える
      if (window.nextVideoCategoryId) {
        nextVideoUrl = nextVideoUrl.replace(/ca=\d+/, `ca=${window.nextVideoCategoryId}`);
      }
      window.location.href = nextVideoUrl;
    }
  }
}
// グローバル関数として公開
window.StartPlaybackManagement = StartPlaybackManagement;
window.setPlaybackSpeed = setPlaybackSpeed;
window.skipToNextVideo = skipToNextVideo;
window.isOujSkipNavigationInProgress = () => oujSkipNavigationInProgress;
