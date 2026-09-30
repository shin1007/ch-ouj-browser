// Media Session API対応
// キーボードのメディアキー・スマホの通知領域/ロック画面・イヤホンのボタンから
// 再生/停止・±10秒シーク・前後の回への移動ができるようにする。
// また、通知領域に科目名・回タイトル・サムネイルが表示されるようになる。

// 前の回のcontentIdを取得する（video-player-coreが保持する科目内リストを利用）
function getPrevVideoIdInCourse() {
  const list = window.videoListInCourse;
  const idx = window.currentVideoIndexInCourse;
  if (!Array.isArray(list) || typeof idx !== 'number' || idx <= 0) return null;
  return list[idx - 1] ? list[idx - 1].contentId : null;
}

function navigateToVideo(contentId) {
  if (!contentId) return;
  const url = window.location.href;
  const matchCo = url.match(/co=(\d+)/);
  if (matchCo) {
    window.location.href = url.replace(matchCo[0], `co=${contentId}`);
  }
}

/**
 * Media Sessionのメタデータとアクションを設定する。
 * @param {Object} currentVideo - 動画情報（title, detail, contentId等）
 */
function startMediaSession(currentVideo) {
  if (!('mediaSession' in navigator)) return;

  const title = currentVideo?.title || '';
  const detail = currentVideo?.detail || '';
  const detailLines = detail.split('\n');
  // detailの1行目から科目名を取得し、末尾の年度表記を削除
  const courseName = (detailLines[0] || '').replace(/（’\d{2}）$/, '').trim();
  const artists = detailLines.slice(1).join(', ').trim() || t('mediaSession.artist');

  const artwork = currentVideo?.contentId
    ? [{ src: `https://v.ouj.ac.jp/v1/tenants/1/vod-contents/${currentVideo.contentId}/thumbnail/large`, sizes: '512x512', type: 'image/jpeg' }]
    : [{ src: 'https://v.ouj.ac.jp/view/ouj/assets/images/webclip/apple-touch-icon.png', sizes: '512x512', type: 'image/png' }];

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      album: courseName,
      artist: artists,
      artwork: artwork,
    });
  } catch (e) {
    // MediaMetadataが使えない環境では何もしない
    return;
  }

  const getVideo = () => document.querySelector('video');
  const trySetHandler = (action, handler) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (e) {
      // 対応していないアクションは無視
    }
  };

  trySetHandler('play', () => {
    const video = getVideo();
    if (video) video.play().catch(() => {});
  });
  trySetHandler('pause', () => {
    const video = getVideo();
    if (video) video.pause();
  });
  trySetHandler('seekbackward', (details) => {
    const video = getVideo();
    if (video) video.currentTime = Math.max(0, video.currentTime - (details.seekOffset || 10));
  });
  trySetHandler('seekforward', (details) => {
    const video = getVideo();
    if (video && isFinite(video.duration)) {
      video.currentTime = Math.min(video.duration, video.currentTime + (details.seekOffset || 10));
    }
  });
  trySetHandler('previoustrack', () => {
    navigateToVideo(getPrevVideoIdInCourse());
  });
  trySetHandler('nexttrack', () => {
    if (window.nextVideoId && typeof window.skipToNextVideo === 'function') {
      window.skipToNextVideo();
    }
  });
}

window.startMediaSession = startMediaSession;
