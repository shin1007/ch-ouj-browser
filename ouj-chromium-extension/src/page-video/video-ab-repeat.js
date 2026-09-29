// A-B区間リピート機能
// 語学科目の聞き取り練習などで、動画の一部分を繰り返し再生できるようにする。
// A点・B点をセットすると、再生位置がB点を超えたときに自動でA点へ戻る。
// 設定は保存せず、動画を離れたらリセットされる（意図せずループし続けるのを防ぐため）。

let oujAbPointA = null;
let oujAbPointB = null;
let oujAbVideo = null;
let oujAbHandler = null;

function clearABRepeat() {
  if (oujAbVideo && oujAbHandler) {
    oujAbVideo.removeEventListener('timeupdate', oujAbHandler);
  }
  oujAbPointA = null;
  oujAbPointB = null;
  oujAbVideo = null;
  oujAbHandler = null;
  updateAbRepeatStatusLabel();
}

function formatAbTime(seconds) {
  if (seconds === null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateAbRepeatStatusLabel() {
  const label = document.getElementById('ab-repeat-status');
  if (!label) return;
  if (oujAbPointA === null && oujAbPointB === null) {
    label.textContent = t('abRepeat.unset');
    label.style.color = '#999';
  } else if (oujAbPointB === null) {
    label.textContent = t('abRepeat.aOnly', { a: formatAbTime(oujAbPointA) });
    label.style.color = '#1565c0';
  } else {
    label.textContent = t('abRepeat.repeating', { a: formatAbTime(oujAbPointA), b: formatAbTime(oujAbPointB) });
    label.style.color = '#2e7d32';
  }
}

function startAbRepeatLoop() {
  const video = document.querySelector('video');
  if (!video || oujAbPointA === null || oujAbPointB === null) return;
  // 既存のループ監視を解除してから登録し直す
  if (oujAbVideo && oujAbHandler) {
    oujAbVideo.removeEventListener('timeupdate', oujAbHandler);
  }
  oujAbVideo = video;
  oujAbHandler = () => {
    if (oujAbPointA === null || oujAbPointB === null) return;
    if (video.currentTime >= oujAbPointB || video.currentTime < oujAbPointA - 1) {
      video.currentTime = oujAbPointA;
    }
  };
  video.addEventListener('timeupdate', oujAbHandler);
}

function setAbPointA() {
  const video = document.querySelector('video');
  if (!video) return;
  oujAbPointA = video.currentTime;
  // A点をB点より後ろに設定し直した場合はB点をクリア
  if (oujAbPointB !== null && oujAbPointB <= oujAbPointA) {
    oujAbPointB = null;
    if (oujAbVideo && oujAbHandler) {
      oujAbVideo.removeEventListener('timeupdate', oujAbHandler);
      oujAbVideo = null;
      oujAbHandler = null;
    }
  }
  updateAbRepeatStatusLabel();
}

function setAbPointB() {
  const video = document.querySelector('video');
  if (!video) return;
  if (oujAbPointA === null) {
    window.showWarningNotification(t('abRepeat.needA'));
    return;
  }
  if (video.currentTime <= oujAbPointA) {
    window.showWarningNotification(t('abRepeat.bAfterA'));
    return;
  }
  oujAbPointB = video.currentTime;
  startAbRepeatLoop();
  updateAbRepeatStatusLabel();
}

/**
 * 設定パネル内にA-Bリピートの操作行を挿入する（video-settings.jsから呼ばれる）
 * @param {HTMLElement} container - 挿入先の要素
 */
function insertAbRepeatControls(container) {
  const row = document.createElement('div');
  row.style.cssText = 'margin-bottom: 8px;';
  row.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
      <span style="color: #333;">${t('abRepeat.title')}</span>
      <button type="button" id="ab-repeat-set-a" style="padding: 3px 10px; border: 1px solid #1976d2; background: #fff; color: #1976d2; border-radius: 4px; cursor: pointer; font-size: 12px;">${t('abRepeat.setA')}</button>
      <button type="button" id="ab-repeat-set-b" style="padding: 3px 10px; border: 1px solid #1976d2; background: #fff; color: #1976d2; border-radius: 4px; cursor: pointer; font-size: 12px;">${t('abRepeat.setB')}</button>
      <button type="button" id="ab-repeat-clear" style="padding: 3px 10px; border: 1px solid #999; background: #fff; color: #666; border-radius: 4px; cursor: pointer; font-size: 12px;">${t('abRepeat.clear')}</button>
      <span id="ab-repeat-status" style="font-size: 12px; color: #999;">${t('abRepeat.unset')}</span>
    </div>
    <div style="font-size: 11px; color: #999; margin-top: 2px;">${t('abRepeat.hint')}</div>
  `;
  container.appendChild(row);
  row.querySelector('#ab-repeat-set-a').addEventListener('click', setAbPointA);
  row.querySelector('#ab-repeat-set-b').addEventListener('click', setAbPointB);
  row.querySelector('#ab-repeat-clear').addEventListener('click', clearABRepeat);
  updateAbRepeatStatusLabel();
}

// グローバル関数として公開
window.insertAbRepeatControls = insertAbRepeatControls;
window.clearABRepeat = clearABRepeat;
