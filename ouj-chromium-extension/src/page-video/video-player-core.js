// グローバル変数として次の動画IDを保持
let nextVideoId = null;

// --- 追加: グローバル変数 ---
window.videoListInCourse = null;
window.currentVideoIndexInCourse = null;
window.nextVideoId = nextVideoId; // グローバルアクセス用

// 動画再生画面の初期化関数（最初に呼ばれる）
async function initializeVideoPlayer() {
  // 再入防止
  if (window.isInitializingVideo === true) {
    return;
  }
  window.isInitializingVideo = true;

  // ページ遷移がちゃんと終了しているかを確認する。
  // URLの変化だけではなく、動画タイトルがHTML内にあるかどうかを確認するのが有用そう。
  const contentId = window.getCurrentVideoId();

  const categoryData = await window.getCategoryDataFromContentId(contentId);
  if (categoryData === null) {
    console.log("initializeVideoPlayer: categoryData is null")
    // 再入防止フラグを戻し忘れると、以後このタブでinitializeVideoPlayerが
    // 二度と実行されなくなる(再生ページの機能が全滅する)ため必ず戻す
    window.isInitializingVideo = false;
    await window.handleHomePageAutoLogin();
    return;
  }
  // 動画リストから現在の動画IDを利用して動画タイトルを取得
  const videos = await window.getVideoListInCategory(categoryData.categoryId);
  let found = false;
  for (const video of videos) {
    if (String(video.contentId) === String(contentId)) {
      // 見つかった
      found = true;
      addFunctionPanel(video);
      break;
    }
  }
  // 動画が見つからなかった場合も、再入防止フラグを戻す(addFunctionPanel側での
  // リセットが呼ばれないため、ここで戻さないと以後ずっと初期化されなくなる)
  if (!found) {
    window.isInitializingVideo = false;
  }
}
async function addFunctionPanel(currentVideo, startUrl){
  // waitForElement/waitForConditionと同様、呼び出し開始時点のURLを記録し、
  // 離脱後(別ページ/別動画への遷移後)もポーリングが残り続けないよう打ち切る
  if (typeof startUrl !== 'string') startUrl = window.location.href;
  if (window.location.href !== startUrl) return;
  console.log("addFunctionPanel", currentVideo.title);
  const titleElement = document.querySelector('#content-detail-area > div.title');
  if (!titleElement || !titleElement.textContent.includes(currentVideo.title)) {
    // タイトルがまだ反映されていない
    window.isInitializingVideo = false;
    // 未ログインの場合はログインページに行く
    const pageChange = window.tryPushLoginButton();
    if (!pageChange){
      console.log("タイトル未反映、100ms後に再試行");
      setTimeout(addFunctionPanel, 100, currentVideo, startUrl);
    }
    return;
  }
  // 表示オプション(utils/display-options.js)で非表示にされていれば挿入しない
  const isPlayerUiVisible = (featureId) => (
    typeof window.isOujFeatureVisible !== 'function' || window.isOujFeatureVisible(featureId)
  );

  if (isPlayerUiVisible('player-share')) {
    addShareButtonAfterVideoTitle();
  }

  // タイトル横のアクションボタン群（PiP・しおり・あとで見る）を追加
  if (typeof window.addPlayerActionButtons === 'function' && isPlayerUiVisible('player-actions')) {
    window.addPlayerActionButtons(currentVideo);
  }

  // メディアキー・ロック画面からの操作と、通知領域への科目名/タイトル表示
  if (typeof window.startMediaSession === 'function') {
    window.startMediaSession(currentVideo);
  }

  // 動画が切り替わったのでA-B区間リピートをリセット
  if (typeof window.clearABRepeat === 'function') {
    window.clearABRepeat();
  }

  // しおりからのジャンプ（予約されたシーク位置）があれば適用
  if (typeof window.applyPendingSeekIfAny === 'function') {
    window.applyPendingSeekIfAny();
  }

  // videoタグの出現を監視し、出現した瞬間に設定パネルを挿入
  waitForVideoElementAndInsertPanel();
  // 動画ページのcontentIdを取得し、履歴に追加
  const url = window.location.href;
  const matchCo = url.match(/co=(\d+)/);
  if (matchCo) {
    addHistoryEntry(matchCo[1]);
  }
    
  // ラジオ番組判定を実行
  await checkIfRadioProgram();
    
  // 次の動画IDを取得
  await fetchNextVideoId();
  window.startVideoEndMonitoring();

  // エンディング検出、動画の最初と最後のスキップ機能を開始
  window.StartPlaybackManagement();

  // 再生中に画面が自動ロックされないようにする
  window.startWakeLockManagement();

  // 番組間の音量差を抑える音量正規化の音声グラフを準備する
  window.startVolumeNormalizationManagement();

  // 学習時間トラッキングを開始（科目IDはURL解析より信頼できるAPI由来の値を渡す）
  window.startStudyTimeTracking(currentVideo.categoryId);

  // 動画自動再生設定の取得
  const autoPlayEnabled = window.getBooleanSetting ? window.getBooleanSetting('autoPlayEnabled', false) : false;

  // videoタグが存在する場合は自動再生
  // 存在するまで待つ
  window.waitForElement('video', (video) => {
    if (video){
      // 自動再生設定が有効な場合はautoplay属性を付与する
      if (autoPlayEnabled) {
        video.autoplay = true;
      }
    }  }, 100, 30); // 100ms間隔で最大30回(約3秒)試行
  window.isInitializingVideo = false;
}

// videoタグの出現を監視し、出現したら設定パネルを挿入する関数
function waitForVideoElementAndInsertPanel() {
  window.waitForElement('video', (video) => {
    window.addVideoSettingsPanel();
  });
}
function enableBackgroundPlay(currentVideo) {
  /*
  currentVideoの中身
      {
        "contentId": 31765,
        "categoryId": 30211,
        "title": "第05回 呼吸器系の構造と働き",
        "summary": "ヒトは、酸素を身体に取り入れることでエネルギーを得るとともに、生じた二酸化炭素を排出している。この回では、呼吸器系の構造と機能、および運動への適応について概説する。",
        "detail": "運動と健康（’２２）\n関根　紀子（放送大学教授）\n関根　紀子(放送大学教授)",
        "alias": "5",
        "groupIds": [
            2,
            343
        ],
    },

  */
  window.waitForElement('video', (video) => {
    if (!video) return;
    // iOSや一部のAndroidブラウザで背景再生を可能にする属性を追加
    // 2025.10.13で試してみる
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('controls', 'true');
    video.muted = false; // 音声がミュートされないように明示的に設定
    video.style.backgroundColor = 'black'; // 背景を黒に設定
    video.style.objectFit = 'contain'; // アスペクト比を維持して表示
    video.play().catch(e => console.log("Autoplay was prevented.", e));

    if (video.parentElement) {
      video.parentElement.setAttribute('playsinline', 'true');
      video.parentElement.setAttribute('webkit-playsinline', 'true');
    }
    if ('mediaSession' in navigator) {
      const title = currentVideo?.title || '';
      const detail = currentVideo?.detail || '';
      const detailLines = detail.split('\n');
      
      // detailの1行目から科目名を取得し、不要な部分を削除
      const courseName = (detailLines[0] || '')
        .replace(/（’\d{2}）$/, '') // 末尾の（’XX）を削除
        .trim();
      const artists = detailLines.slice(1).join(', ').trim() || '';

      navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      album: courseName,
      artist: artists,
      artwork: [{ src: 'https://v.ouj.ac.jp/view/ouj/assets/images/webclip/apple-touch-icon.png', sizes: '512x512', type: 'image/jpg' }]
    });
  }
}, 100, 30); // 100ms間隔で最大30回(約3秒)試行
//<link rel="apple-touch-icon" href="./assets/images/webclip/apple-touch-icon.png">
}


// 次の動画IDを取得する関数
async function fetchNextVideoId() {
  const url = window.location.href;
  const matchCa = url.match(/ca=(\d+)/);
  const matchCo = url.match(/co=(\d+)/);
  if (matchCa && matchCo) {
    const currentCourseId = matchCa[1];
    const currentVideoId = matchCo[1];
    const setting = window.getSetting('nextVideoSetting', 'same-course');
    if (setting === 'same-course') {
      await fetchNextVideoFromSameCourse(currentCourseId, currentVideoId);
    } else if (setting === 'favorites-random') {
      await fetchNextVideoFromFavorites();
    } else if (setting === 'watch-later') {
      await fetchNextVideoFromWatchLater(currentVideoId);
    }
  } else {
    console.warn('[動画] fetchNextVideoId: URLから科目IDまたは動画IDを取得できません', url);
    nextVideoId = null;
    window.nextVideoId = nextVideoId;
  }
}

// 同じ科目の中で次の動画を取得
async function fetchNextVideoFromSameCourse(currentCourseId, currentVideoId) {
  try {
    const res = await window.getVideoListInCategory(currentCourseId);
    window.videoListInCourse = Array.isArray(res) ? res : null;
    window.currentVideoIndexInCourse = null;
    if (!Array.isArray(res)) {
      console.error('[動画] fetchNextVideoFromSameCourse: fetchWithCacheの返り値が配列でない', res);
    }
    if (Array.isArray(res) && res.length > 0) {
      const currentVideoIndex = res.findIndex(item => String(item.contentId) === String(currentVideoId));
      window.currentVideoIndexInCourse = currentVideoIndex;
      if (currentVideoIndex !== -1) {
        const nextVideoIndex = currentVideoIndex + 1;
        if (nextVideoIndex < res.length) {
          nextVideoId = res[nextVideoIndex].contentId;
          window.nextVideoId = nextVideoId;
          window.nextVideoCategoryId = null;
        } else {
          nextVideoId = null;
          window.nextVideoId = nextVideoId;
          window.nextVideoCategoryId = null;
        }
      } else {
        nextVideoId = null;
        window.nextVideoId = nextVideoId;
      }
    } else {
      console.warn('[動画] fetchNextVideoFromSameCourse: APIレスポンスが空配列', {currentCourseId, res});
      nextVideoId = null;
      window.nextVideoId = nextVideoId;
    }
  } catch (error) {
    console.error('[動画] fetchNextVideoFromSameCourse: 例外発生', error);
    nextVideoId = null;
    window.nextVideoId = nextVideoId;
  }
}

// お気に入りの中からランダムで次の動画を取得
async function fetchNextVideoFromFavorites() {
  try {
    // お気に入りリストを取得
    const favorites = window.getSetting('favorites', []);
    
    if (favorites.length === 0) {
      nextVideoId = null;
      window.nextVideoId = nextVideoId;
      return;
    }
    
    // 各お気に入り科目の未再生動画を取得
    const availableVideos = await getAvailableVideosFromFavorites(favorites);
    
    
    if (availableVideos.length === 0) {
      nextVideoId = null;
      window.nextVideoId = nextVideoId;
      return;
    }
    
    // ランダムに動画を選択
    const randomVideo = availableVideos[Math.floor(Math.random() * availableVideos.length)];
    nextVideoId = randomVideo.contentId;
    window.nextVideoId = nextVideoId;
    window.nextVideoCategoryId = randomVideo.categoryId;
    
    
  } catch (error) {
    console.error('fetchNextVideoFromFavorites: お気に入りからの動画取得に失敗しました:', error);
    nextVideoId = null;
    window.nextVideoId = nextVideoId;
  }
}

// 「あとで見る」リストの先頭（現在の動画以外）を次の動画にする
async function fetchNextVideoFromWatchLater(currentVideoId) {
  try {
    const next = typeof window.getNextWatchLaterVideo === 'function'
      ? window.getNextWatchLaterVideo(currentVideoId)
      : null;
    if (next) {
      nextVideoId = next.contentId;
      window.nextVideoId = nextVideoId;
      window.nextVideoCategoryId = next.categoryId || null;
    } else {
      nextVideoId = null;
      window.nextVideoId = nextVideoId;
      window.nextVideoCategoryId = null;
    }
  } catch (error) {
    console.error('fetchNextVideoFromWatchLater: あとで見るリストからの取得に失敗しました:', error);
    nextVideoId = null;
    window.nextVideoId = nextVideoId;
  }
}

// 現在の動画IDを取得する関数
function getCurrentVideoId() {
  const url = window.location.href;
  const matchCo = url.match(/co=(\d+)/);
  return matchCo ? matchCo[1] : null;
}

// 動画の再生状況をチェックする関数
async function checkVideoViewingStatus(video, favoriteId) {
  try {
    // 動画の再生状況を取得（共通関数を使用）
    const viewingStatus = await window.getVideoViewingStatus(video.contentId);
    const currentTimeRate = viewingStatus.currentTimeRate;
    
    // 再生が完了していない場合（currentTimeRate < 0.95）
    if (currentTimeRate < 0.95) {
      return {
        contentId: video.contentId,
        title: video.title,
        categoryId: favoriteId,
        currentTimeRate: currentTimeRate
      };
    }
    
    return null;
    
  } catch (viewingError) {
    // 最初の動画で失敗した場合は未再生として扱う
    return {
      contentId: video.contentId,
      title: video.title,
      categoryId: favoriteId,
      currentTimeRate: 0
    };
  }
}

// お気に入り科目から未再生動画を取得する関数
async function getAvailableVideosFromFavorites(favorites) {
  const availableVideos = [];
  const currentVideoId = getCurrentVideoId();
  
  for (const favoriteId of favorites) {
    try {
      
      // 科目の動画リストを取得
      const cacheKey = `cachedVodContents_${favoriteId}`;
      const videos = await fetchWithCache(`https://v.ouj.ac.jp/v1/tenants/1/vod-contents?qt=4&categoryId=${favoriteId}&offset=0&limit=30&sortType=1&sortOrder=asc`, cacheKey);
      
      if (!videos || videos.length === 0) {
        continue;
      }
      
      // 各動画の再生状況をチェック
      let firstUnfinishedVideo = null;
      
      for (const video of videos) {
        // 現在の動画の場合は再生完了として扱う
        if (video.contentId == currentVideoId) {
          continue;
        }
        
        const unfinishedVideo = await checkVideoViewingStatus(video, favoriteId);
        if (unfinishedVideo) {
          if (!firstUnfinishedVideo) {
            firstUnfinishedVideo = unfinishedVideo;
          }
        }
      }
      
      // 未完了動画が見つかった場合はリストに追加
      if (firstUnfinishedVideo) {
        availableVideos.push(firstUnfinishedVideo);
      }
      
    } catch (error) {
      // エラーは静かに処理
    }
  }
  return availableVideos;
}
// 履歴をlocalStorageに保存する関数
async function addHistoryEntry(contentId) {
  if (!contentId) return;
  // 最近の履歴追加をチェック（5秒以内の同じcontentIdは無視）
  const lastHistoryKey = `lastHistory_${contentId}`;
  const lastHistoryTime = window.getSetting(lastHistoryKey, 0);
  const now = Date.now();
  if (now - lastHistoryTime < 5000) {
    return;
  }
  const entry = {
    contentId,
    date: new Date().toISOString(),
  };
  let history = [];
  try {
    history = window.getSetting('history', []);
  } catch (e) {
    history = [];
  }
  // 既存の同じcontentIdは削除（重複防止）
  history = history.filter(item => item.contentId !== contentId);
  // 先頭に追加
  history.unshift(entry);
  // 最大30件まで
  if (history.length > 30) history = history.slice(0, 30);
  // ★おすすめリストのプリフェッチはsaveSettingのラッパー（menu.js）内で
  //   historyキー保存時に自動実行されるため、ここでの明示呼び出しは不要
  window.saveSetting('history', history);
  window.saveSetting(lastHistoryKey, now);
}

function addShareButtonAfterVideoTitle() {
  console.log("addShareButtonAfterVideoTitle");
  const titleElement = document.querySelector('#content-detail-area > div.title');
  if (!titleElement) return;
  const lectureName = document.querySelector('#main > main-player > ion-content > div.scroll-content > player > vod-list-navigator > aside > div > ul > li:nth-child(3) > a')?.textContent.trim() || '';
  // 以下のように不要な情報を削除
  // before: 030 幼児教育の指導法（’２２） 1529668a
  // after: 幼児教育の指導法
  const trimmedLectureName = lectureName
    .replace(/^[0-9]{3}\s+/, '') // 先頭の3桁の数字と空白を削除
    .replace(/\s+[a-zA-Z0-9]{5,}\s*$/, '') // 末尾の7桁以上の英数字と空白を削除
    .replace(/（.*?）\s*$/, '') // 全角括弧とその中身を削除
  const videoTitle = titleElement.textContent.trim();
  // titleElementはSPA内で動画が切り替わっても同じDOMノードが使い回されることがある。
  // 既存ボタンをそのまま残すと、クリック時にコピーされる科目名/タイトルが最初に
  // 生成した時点(古い動画)のクロージャのまま固定されてしまうため、作り直す
  const existingButton = document.querySelector('.video-share-button');
  if (existingButton) existingButton.remove();
  const button = document.createElement('button');
  button.classList.add('video-share-button');
  button.style.marginLeft = '2px';
  button.style.verticalAlign = 'middle';

  button.style.padding = '2px 4px';
  button.style.fontSize = '12px';
  button.style.fontWeight = 'bold';
  button.style.cursor = 'pointer';
  button.style.border = '1px solid #ccc';
  button.style.borderRadius = '3px';
  button.style.backgroundColor = '#f0f0f0';
  button.innerHTML = getIconHtml('share') + t('actions.share');
  button.title = t('actions.shareTitle');
  button.addEventListener('click', () => {
    // 既存のメッセージがあれば削除
    const existingMessage = button.parentNode.querySelector('.copy-status-message');
    if (existingMessage) {
      existingMessage.remove();
    }

    const showCopyStatusMessage = (message, isSuccess) => {
      const messageElement = document.createElement('span');
      messageElement.textContent = message;
      messageElement.className = 'copy-status-message';
      messageElement.style.marginLeft = '8px';
      messageElement.style.padding = '2px 6px';
      messageElement.style.borderRadius = '3px';
      messageElement.style.color = 'white';
      messageElement.style.backgroundColor = isSuccess ? '#4CAF50' : '#F44336'; // 成功時は緑、失敗時は赤
      messageElement.style.fontSize = '12px';
      button.parentNode.insertBefore(messageElement, button.nextSibling);
      setTimeout(() => messageElement.remove(), 2000);
    };

    const url = window.location.href;
    const copyText = `\n${trimmedLectureName} ${videoTitle}\n#放送大学\n${url}`;
    navigator.clipboard.writeText(copyText)
      .then(() => showCopyStatusMessage(t('actions.copied'), true))
      .catch(err => {
        console.error('クリップボードへのコピーに失敗しました:', err);
        showCopyStatusMessage(t('actions.copyFailed'), false);
      });
  });

  titleElement.appendChild(button, titleElement);
}

// グローバル関数として公開
window.getNextVideoId = () => window.nextVideoId;
window.initializeVideoPlayer = initializeVideoPlayer;
window.fetchNextVideoId = fetchNextVideoId;
window.fetchNextVideoFromSameCourse = fetchNextVideoFromSameCourse;
window.fetchNextVideoFromFavorites = fetchNextVideoFromFavorites;
window.getAvailableVideosFromFavorites = getAvailableVideosFromFavorites;
window.getCurrentVideoId = getCurrentVideoId; 