// 動画下部に設定パネルを追加する関数
//
// waitForVideoElementAndInsertPanel経由でSPA遷移のたびに呼ばれるが、内部でinsertPrevNextLinks/
// insertEpisodeListMenuの非同期処理を待つため、短時間に2回呼ばれると1回目の処理が終わる前に
// 2回目が開始してしまうことがある。関数冒頭の重複チェックは呼び出し開始時点のDOMしか見ておらず、
// この非同期処理中の重複呼び出しは防げないため(2回とも「まだ存在しない」と判定してしまう)、
// video-settings-panelだけ二重に挿入される不具合があった。
// 単純な再入防止フラグだと、対象要素が見つからないまま(例: ページ離脱)フラグが永久にtrueの
// ままになり、次の動画で二度とパネルが挿入されなくなる恐れがあるため、代わりに「一番新しい
// 呼び出しだけが最終的な挿入を行う」トークン方式にする。
function addVideoSettingsPanel() {
  // 既にパネルが存在する場合は何もしない
  if (document.getElementById('video-settings-panel')) {
    const oldPanel = document.getElementById('video-settings-panel');
    oldPanel.remove(); // 古いパネルを削除してから再作成
  }

  // 対象要素を待って取得する関数
  if (typeof window.waitForElement !== 'function'
    || typeof window.getSetting !== 'function'
    || typeof window.getBooleanSetting !== 'function') {
    setTimeout(addVideoSettingsPanel, 100);
    return;
  }
  window.oujVideoSettingsPanelToken = (window.oujVideoSettingsPanelToken || 0) + 1;
  const myToken = window.oujVideoSettingsPanelToken;
  window.waitForElement('#content-detail-area > div.title', async (targetElement) => {
    if (isVideoUiVisible('player-prev-next')) {
      await window.insertPrevNextLinks(targetElement);
    }
    if (isVideoUiVisible('player-episode-list')) {
      await window.insertEpisodeListMenu(targetElement);
    }
    // 待っている間により新しい呼び出しが発生していれば、この呼び出しの結果は古いので破棄する
    if (window.oujVideoSettingsPanelToken !== myToken) return;
    if (isVideoUiVisible('player-settings-panel')) {
      insertSettingsPanel(targetElement);
    } else {
      // パネルを隠していても、字幕まわりの設定は従来どおり効かせる必要がある
      // （設定の適用がパネル生成処理の中にあるため、ここで同じ処理を行う）
      applyCaptionSettingsWithoutPanel();
    }
  });
}

// 表示オプション(utils/display-options.js)による表示判定
function isVideoUiVisible(featureId) {
  return typeof window.isOujFeatureVisible !== 'function' || window.isOujFeatureVisible(featureId);
}

/**
 * 設定パネル内の1ブロックを、表示オプションで隠せる形（idとclass付きのコンテナ）で組み立てる。
 * 隠す指定なら空文字を返し、そもそも挿入しない（表示オプションの「挿入時ゲート」側の役割。
 * 挿入済み要素を隠すCSSは utils/display-options.js が id セレクタで当てる）。
 * ブロックを隠しても、その設定の保存値は各機能側で従来どおり適用される（操作UIが消えるだけ）。
 * @param {string} optionId - 表示オプションのid
 * @param {string} containerId - コンテナのid（display-options.jsのselectorsと一致させること）
 * @param {string} innerHtml - ブロックの中身
 * @returns {string} HTML文字列（非表示なら空文字）
 */
function settingsSection(optionId, containerId, innerHtml) {
  if (!isVideoUiVisible(optionId)) return '';
  return `<div id="${containerId}" class="ouj-settings-section">${innerHtml}</div>`;
}

// 設定パネルを表示しない場合でも、保存済みの字幕設定は反映する
function applyCaptionSettingsWithoutPanel() {
  if (typeof window.showCaptionAccordingToSetting === 'function') {
    window.showCaptionAccordingToSetting();
  }
  if (typeof window.applyCaptionShrinkFix === 'function') {
    window.applyCaptionShrinkFix(window.getBooleanSetting('preventCaptionShrink', true));
  }
}
function insertSettingsPanel(targetElement) {
  // 設定パネルを作成
  const panel = document.createElement('div');
  panel.id = 'video-settings-panel';
  panel.style.cssText = `
    margin-top: 15px;
    padding: 15px;
    background: #f5f5f5;
    border-radius: 8px;
    font-size: 14px;
    border: 1px solid #ddd;
    text-align: left;
  `;

  // 保存された設定を取得
  const autoCaptionEnabledTV = window.getSetting('autoCaptionEnabledTV', true);
  const autoCaptionEnabledRadio = window.getSetting('autoCaptionEnabledRadio', true);
  const nextVideoMode = window.getSetting('nextVideoSetting', 'same-course');
  const autoNextVideoEnabled = window.getBooleanSetting('autoNextVideoEnabled', true);
  // 動画自動再生設定の取得
  const autoPlayEnabled = window.getBooleanSetting('autoPlayEnabled', false);

  // 現在の科目ID（再生速度・スキップ秒数の科目別記憶に使う）
  const currentCategoryId = window.getCurrentCategoryId ? window.getCurrentCategoryId() : null;

  // 新規追加設定の取得（スキップ秒数は科目別設定があればそれを優先）
  const skipEnd = Number(window.getPerCourseSetting('skipEndSeconds', currentCategoryId, 0));
  const skipStart = Number(window.getPerCourseSetting('skipStartSeconds', currentCategoryId, 0));
  const playlogIntervalMinutes = Number(window.getSetting('playlogIntervalMinutes', 3));
  // 再生速度設定の取得（科目別設定があればそれを優先）
  const playbackSpeedControlEnabled = window.getBooleanSetting('playbackSpeedControlEnabled', true);
  const playbackSpeed = Number(window.getPerCourseSetting('playbackSpeed', currentCategoryId, 1.0));
  // 字幕表示時に画面が縮小しないようにする設定の取得
  const preventCaptionShrink = window.getBooleanSetting('preventCaptionShrink', true);
  // 画面の自動ロック防止設定の取得
  const screenWakeLockEnabled = window.getBooleanSetting('screenWakeLockEnabled', true);
  // 音量正規化設定の取得
  const volumeNormalizationEnabled = window.getBooleanSetting('volumeNormalizationEnabled', false);
  // 先読み（バッファ）秒数。0＝サイト標準のまま（player-buffer-patch.jsが読む）
  const targetBufferSeconds = Number(window.getSetting('videoTargetBufferSeconds', 0));
  // スリープタイマーの残り時間（分）
  const sleepTimerRemainingMinutes = window.getSleepTimerRemainingMinutes ? window.getSleepTimerRemainingMinutes() : 0;

  // 再生速度の選択肢を生成
  let speedOptions = '';
  const speeds = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0, 2.5, 3.0];
  for (const speed of speeds) {
    const speedValue = speed.toFixed(1);
    // 浮動小数点数の比較誤差を考慮
    const selected = Math.abs(playbackSpeed - speed) < 0.01 ? 'selected' : '';
    speedOptions += `<option value="${speedValue}" ${selected}>${speedValue}x</option>`;
  }

  panel.innerHTML = `
    <style>
      /* ブロック間の区切り線。<hr>を独立した要素として置くと、表示オプションで
         ブロックを隠したときに区切り線だけが残ってしまうため、
         「隣り合うブロックの境目」としてCSSで引く */
      #video-settings-panel .ouj-settings-section + .ouj-settings-section {
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #ddd;
      }
    </style>
    <div style="display: flex; flex-direction: row; gap: 24px; align-items: flex-start;">
      <!-- 左カラム: 設定項目 -->
      <div style="flex: 1 1 0; min-width: 260px;">
        ${settingsSection('player-panel-speed', 'playback-speed-section', `
          <div style='margin-bottom: 8px;'>
            <input type="checkbox" id="playback-speed-control-enabled" ${playbackSpeedControlEnabled ? 'checked' : ''}>
            <label for="playback-speed-control-enabled" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.speedEnable')}</label>
          </div>
          <div id="playback-speed-container" style="margin-bottom: 8px; display: flex; align-items: center; ${playbackSpeedControlEnabled ? '' : 'display: none;'}">
            <label for="playback-speed" style="width: 300px; margin-right: 8px; color: #333;">${t('settings.speed')}</label>
            <select id="playback-speed" style="flex: 1;">
              ${speedOptions}
            </select>
          </div>
        `)}
        ${settingsSection('player-ab-repeat', 'ab-repeat-container', '')}
        ${settingsSection('player-panel-caption', 'caption-settings-section', `
          <div style='margin-bottom: 8px;'>
            <input type="checkbox" id="auto-caption-tv" ${autoCaptionEnabledTV ? 'checked' : ''}>
            <label for="auto-caption-tv" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.captionTv')}</label>
          </div>
          <div style='margin-bottom: 8px;'>
            <input type="checkbox" id="auto-caption-radio" ${autoCaptionEnabledRadio ? 'checked' : ''}>
            <label for="auto-caption-radio" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.captionRadio')}</label>
          </div>
          <div style='margin-bottom: 8px;'>
            <input type="checkbox" id="prevent-caption-shrink" ${preventCaptionShrink ? 'checked' : ''}>
            <label for="prevent-caption-shrink" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.captionNoShrink')}</label>
          </div>
        `)}
        ${settingsSection('player-panel-volume', 'volume-normalization-section', `
          <div style='margin-bottom: 8px;'>
            <input type="checkbox" id="volume-normalization" ${volumeNormalizationEnabled ? 'checked' : ''}>
            <label for="volume-normalization" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.volumeNorm')}</label>
          </div>
        `)}
        ${settingsSection('player-panel-autoplay', 'autoplay-settings-section', `
          <div style='margin-bottom: 8px;'>
            <input type="checkbox" id="auto-play-video" ${autoPlayEnabled ? 'checked' : ''}>
            <label for="auto-play-video" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.autoPlay')}</label>
          </div>
          <div style='margin-bottom: 8px;'>
            <input type="checkbox" id="auto-next-video" ${autoNextVideoEnabled ? 'checked' : ''}>
            <label for="auto-next-video" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.autoNext')}</label>
          </div>
        `)}
        ${settingsSection('player-panel-next-source', 'next-video-source-section', `
          <div style="margin-bottom: 8px;">
            <input type="radio" id="same-course" name="next-video" value="same-course" ${nextVideoMode === 'same-course' ? 'checked' : ''}>
            <label for="same-course" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.sameCourse')}</label>
          </div>
          <div style="margin-bottom: 8px;">
            <input type="radio" id="favorites-random" name="next-video" value="favorites-random" ${nextVideoMode === 'favorites-random' ? 'checked' : ''}>
            <label for="favorites-random" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.favoritesRandom')}</label>
          </div>
          <div style="margin-bottom: 8px;">
            <input type="radio" id="watch-later-queue" name="next-video" value="watch-later" ${nextVideoMode === 'watch-later' ? 'checked' : ''}>
            <label for="watch-later-queue" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.watchLaterQueue')}</label>
          </div>
        `)}
        ${settingsSection('player-panel-skip', 'skip-settings-section', `
          <div style="margin-bottom: 8px; display: flex; align-items: center;">
            <label for="skip-start" style="width: 300px; margin-right: 8px; color: #333; white-space: nowrap;">${t('settings.skipStart')}</label>
            <select id="skip-start">
              <option value="0" ${skipStart == 0 ? 'selected' : ''}>${t('common.none')}</option>
              <option value="15" ${skipStart == 15 ? 'selected' : ''}>${t('units.seconds', { n: 15 })}</option>
              <option value="30" ${skipStart == 30 ? 'selected' : ''}>${t('units.seconds', { n: 30 })}</option>
              <option value="45" ${skipStart == 45 ? 'selected' : ''}>${t('units.seconds', { n: 45 })}</option>
              <option value="60" ${skipStart == 60 ? 'selected' : ''}>${t('units.seconds', { n: 60 })}</option>
              <option value="75" ${skipStart == 75 ? 'selected' : ''}>${t('units.seconds', { n: 75 })}</option>
              <option value="90" ${skipStart == 90 ? 'selected' : ''}>${t('units.seconds', { n: 90 })}</option>
              <option value="105" ${skipStart == 105 ? 'selected' : ''}>${t('units.seconds', { n: 105 })}</option>
              <option value="120" ${skipStart == 120 ? 'selected' : ''}>${t('units.seconds', { n: 120 })}</option>
            </select>
          </div>
          <div style="margin-bottom: 8px; display: flex; align-items: center;">
            <label for="skip-end" style="width: 300px; margin-right: 8px; color: #333; white-space: nowrap;">${t('settings.skipEnd')}</label>
            <select id="skip-end">
              <option value="0" ${skipEnd == 0 ? 'selected' : ''}>${t('common.none')}</option>
              <option value="15" ${skipEnd == 15 ? 'selected' : ''}>${t('units.seconds', { n: 15 })}</option>
              <option value="30" ${skipEnd == 30 ? 'selected' : ''}>${t('units.seconds', { n: 30 })}</option>
              <option value="45" ${skipEnd == 45 ? 'selected' : ''}>${t('units.seconds', { n: 45 })}</option>
              <option value="60" ${skipEnd == 60 ? 'selected' : ''}>${t('units.seconds', { n: 60 })}</option>
              <option value="75" ${skipEnd == 75 ? 'selected' : ''}>${t('units.seconds', { n: 75 })}</option>
              <option value="90" ${skipEnd == 90 ? 'selected' : ''}>${t('units.seconds', { n: 90 })}</option>
              <option value="105" ${skipEnd == 105 ? 'selected' : ''}>${t('units.seconds', { n: 105 })}</option>
              <option value="120" ${skipEnd == 120 ? 'selected' : ''}>${t('units.seconds', { n: 120 })}</option>
            </select>
          </div>
        `)}
        ${settingsSection('player-panel-playlog', 'playlog-settings-section', `
          <div style="margin-bottom: 8px; display: flex; align-items: center;">
            <label for="playlog-interval" style="width: 300px; margin-right: 8px; color: #333;">${t('settings.playlog')}</label>
            <select id="playlog-interval">
              <option value="3" ${playlogIntervalMinutes == 3 ? 'selected' : ''}>${t('studyTime.minutes', { n: 3 })}</option>
              <option value="5" ${playlogIntervalMinutes == 5 ? 'selected' : ''}>${t('studyTime.minutes', { n: 5 })}</option>
              <option value="10" ${playlogIntervalMinutes == 10 ? 'selected' : ''}>${t('studyTime.minutes', { n: 10 })}</option>
              <option value="15" ${playlogIntervalMinutes == 15 ? 'selected' : ''}>${t('studyTime.minutes', { n: 15 })}</option>
            </select>
          </div>
        `)}
        ${settingsSection('player-target-buffer', 'target-buffer-container', `
          <div style="margin-bottom: 8px; display: flex; align-items: center;">
            <label for="target-buffer" style="width: 300px; margin-right: 8px; color: #333;">${t('settings.targetBuffer')}</label>
            <select id="target-buffer">
              <option value="0" ${targetBufferSeconds == 0 ? 'selected' : ''}>${t('settings.bufferDefault')}</option>
              <option value="60" ${targetBufferSeconds == 60 ? 'selected' : ''}>${t('studyTime.minutes', { n: 1 })}</option>
              <option value="180" ${targetBufferSeconds == 180 ? 'selected' : ''}>${t('studyTime.minutes', { n: 3 })}</option>
              <option value="300" ${targetBufferSeconds == 300 ? 'selected' : ''}>${t('studyTime.minutes', { n: 5 })}</option>
              <option value="600" ${targetBufferSeconds == 600 ? 'selected' : ''}>${t('studyTime.minutes', { n: 10 })}</option>
            </select>
          </div>
          <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
            ${t('settings.bufferNote')}
          </div>
        `)}
        ${settingsSection('player-panel-wake-lock', 'wake-lock-section', `
          <div style='margin-bottom: 8px;'>
            <input type="checkbox" id="screen-wake-lock" ${screenWakeLockEnabled ? 'checked' : ''}>
            <label for="screen-wake-lock" style="margin-left: 5px; cursor: pointer; color: #333;">${t('settings.wakeLock')}</label>
          </div>
        `)}
        ${settingsSection('player-panel-sleep-timer', 'sleep-timer-section', `
          <div style="margin-bottom: 8px; display: flex; align-items: center;">
            <label for="sleep-timer" style="width: 300px; margin-right: 8px; color: #333;">${t('settings.sleepTimer')}</label>
            <select id="sleep-timer">
              <option value="0">${t('common.off')}</option>
              <option value="episode-end" ${window.isSleepAtEpisodeEnd && window.isSleepAtEpisodeEnd() ? 'selected' : ''}>${t('settings.sleepEpisodeEnd')}</option>
              <option value="15">${t('studyTime.minutes', { n: 15 })}</option>
              <option value="30">${t('studyTime.minutes', { n: 30 })}</option>
              <option value="45">${t('studyTime.minutes', { n: 45 })}</option>
              <option value="60">${t('studyTime.minutes', { n: 60 })}</option>
              <option value="90">${t('studyTime.minutes', { n: 90 })}</option>
            </select>
          </div>
          ${sleepTimerRemainingMinutes > 0 ? `
          <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
            ${t('settings.sleepRemaining', { n: sleepTimerRemainingMinutes })}
          </div>` : ''}
          ${window.isSleepAtEpisodeEnd && window.isSleepAtEpisodeEnd() ? `
          <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
            ${t('settings.sleepAtEpisodeEnd')}
          </div>` : ''}
        `)}

        <div style="margin-top: 15px; font-size: 12px; color: #666;">
          ${t('settings.autoSaved')}
        </div>
      </div>
    </div>
  `;
      //   <!-- 分割バー -->
      // <div style="width: 1px; background: #ccc; height: 100%; min-height: 320px; margin: 0 8px; align-self: stretch;"></div>

  // 現在の科目ID（科目別設定の保存に使う）
  const panelCategoryId = window.getCurrentCategoryId ? window.getCurrentCategoryId() : null;

  // A-B区間リピートの操作行を挿入
  const abRepeatContainer = panel.querySelector('#ab-repeat-container');
  if (abRepeatContainer && typeof window.insertAbRepeatControls === 'function' && isVideoUiVisible('player-ab-repeat')) {
    window.insertAbRepeatControls(abRepeatContainer);
  }

  // 追加設定項目のイベントリスナー（スキップ秒数は科目別＋全体の両方に保存）
  const skipEndSelect = panel.querySelector('#skip-end');
  if (skipEndSelect) {
    skipEndSelect.addEventListener('change', (event) => {
      window.savePerCourseSetting('skipEndSeconds', panelCategoryId, Number(event.target.value));
    });
  }
  const skipStartSelect = panel.querySelector('#skip-start');
  if (skipStartSelect) {
    skipStartSelect.addEventListener('change', (event) => {
      window.savePerCourseSetting('skipStartSeconds', panelCategoryId, Number(event.target.value));
    });
  }
  const playlogIntervalSelect = panel.querySelector('#playlog-interval');
  if (playlogIntervalSelect) {
    playlogIntervalSelect.addEventListener('change', (event) => {
      window.saveSetting('playlogIntervalMinutes', Number(event.target.value));
    });
  }

  // 先読み（バッファ）秒数のイベントリスナー。
  // 実際の適用はMAIN worldのplayer-buffer-patch.jsが行う（THEOplayerのインスタンスは
  // isolated worldからは触れないため）。ここはlocalStorageに書くだけでよい。
  // 表示オプションで隠している場合はselect自体が無いが、保存済みの秒数は
  // player-buffer-patch.jsが読み続けるため、設定の効き方は変わらない。
  const targetBufferSelect = panel.querySelector('#target-buffer');
  if (targetBufferSelect) {
    targetBufferSelect.addEventListener('change', (event) => {
      window.saveSetting('videoTargetBufferSeconds', Number(event.target.value));
    });
  }

  // 再生速度調整のイベントリスナー
  const speedControlCheckbox = panel.querySelector('#playback-speed-control-enabled');
  const speedContainer = panel.querySelector('#playback-speed-container');
  const speedSelect = panel.querySelector('#playback-speed');

  if (speedControlCheckbox) {    
    speedControlCheckbox.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('playbackSpeedControlEnabled', enabled);
      if (speedContainer) {
        speedContainer.style.display = enabled ? 'flex' : 'none';
      }
      // 有効/無効に応じて再生速度を更新
      window.setPlaybackSpeed();
    });
  }

  if (speedSelect) {
    speedSelect.addEventListener('change', (event) => {
      const speed = Number(event.target.value);
      // 科目別＋全体の両方に保存（この科目は自分の速度を記憶し、他科目のデフォルトも更新される）
      window.savePerCourseSetting('playbackSpeed', panelCategoryId, speed);
      window.setPlaybackSpeed();
    });
  }

  // 字幕自動表示チェックボックスのイベントリスナー（テレビ番組）
  const autoCaptionCheckboxTV = panel.querySelector('#auto-caption-tv');
  if (autoCaptionCheckboxTV) {
    autoCaptionCheckboxTV.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('autoCaptionEnabledTV', enabled);
    });
  }
  // 字幕自動表示チェックボックスのイベントリスナー（ラジオ番組）
  const autoCaptionCheckboxRadio = panel.querySelector('#auto-caption-radio');
  if (autoCaptionCheckboxRadio) {
    autoCaptionCheckboxRadio.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('autoCaptionEnabledRadio', enabled);
    });
  }

  // ラジオボタンのイベントリスナーを追加
  const radioButtons = panel.querySelectorAll('input[type="radio"]');
  radioButtons.forEach(radio => {
    radio.addEventListener('change', (event) => {
      const setting = event.target.value;
      window.saveSetting('nextVideoSetting', setting);
    });
  });

  // 自動再生チェックボックスのイベントリスナー
  const autoPlayVideoCheckbox = panel.querySelector('#auto-play-video');
  if (autoPlayVideoCheckbox) {
    autoPlayVideoCheckbox.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('autoPlayEnabled', enabled);
    });
  }
  const autoNextVideoCheckbox = panel.querySelector('#auto-next-video');
  if (autoNextVideoCheckbox) {
    autoNextVideoCheckbox.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('autoNextVideoEnabled', enabled);
    });
  }

  const tvCaptionCheckbox = panel.querySelector('#auto-caption-tv');
  if (tvCaptionCheckbox) {
    tvCaptionCheckbox.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('autoCaptionEnabledTV', enabled);
      window.toggleCaptionTv(enabled);
    });
  }

  const radioCaptionCheckbox = panel.querySelector('#auto-caption-radio');
  if (radioCaptionCheckbox) {
    radioCaptionCheckbox.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('autoCaptionEnabledRadio', enabled);
      window.toggleCaptionRadio(enabled);
    });
  }
  window.showCaptionAccordingToSetting();

  // 字幕表示時に画面を縮小しない設定のイベントリスナー
  const preventCaptionShrinkCheckbox = panel.querySelector('#prevent-caption-shrink');
  if (preventCaptionShrinkCheckbox) {
    preventCaptionShrinkCheckbox.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('preventCaptionShrink', enabled);
      window.applyCaptionShrinkFix(enabled);
    });
  }
  window.applyCaptionShrinkFix(preventCaptionShrink);

  // 音量正規化設定のイベントリスナー
  const volumeNormalizationCheckbox = panel.querySelector('#volume-normalization');
  if (volumeNormalizationCheckbox) {
    volumeNormalizationCheckbox.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('volumeNormalizationEnabled', enabled);
      if (typeof window.applyVolumeNormalizationSetting === 'function') {
        window.applyVolumeNormalizationSetting(enabled);
      }
    });
  }

  // 画面の自動ロック防止設定のイベントリスナー
  const screenWakeLockCheckbox = panel.querySelector('#screen-wake-lock');
  if (screenWakeLockCheckbox) {
    screenWakeLockCheckbox.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      window.saveSetting('screenWakeLockEnabled', enabled);
      if (enabled) {
        window.startWakeLockManagement();
      } else if (typeof window.releaseVideoWakeLock === 'function') {
        window.releaseVideoWakeLock();
      }
    });
  }

  // スリープタイマーのイベントリスナー
  const sleepTimerSelect = panel.querySelector('#sleep-timer');
  if (sleepTimerSelect) {
    sleepTimerSelect.addEventListener('change', (event) => {
      const value = event.target.value;
      if (value === 'episode-end' && typeof window.armSleepTimerEndOfEpisode === 'function') {
        // この回の終わりまで再生し、そこで停止する
        window.armSleepTimerEndOfEpisode();
        return;
      }
      const minutes = Number(value);
      if (minutes > 0 && typeof window.armSleepTimer === 'function') {
        window.armSleepTimer(minutes);
      } else if (typeof window.clearSleepTimer === 'function') {
        window.clearSleepTimer();
      }
    });
  }

  // 設定パネルは前後リンク・回一覧メニューなど、タイトル直後に挿入される
  // 他の拡張機能UIの後ろに来るように挿入する
  const skippableIds = new Set(['prev-next-links', 'episode-list-menu']);
  let insertionPoint = targetElement.nextSibling;
  while (insertionPoint && skippableIds.has(insertionPoint.id)) {
    insertionPoint = insertionPoint.nextSibling;
  }
  if (insertionPoint) {
    targetElement.parentNode.insertBefore(panel, insertionPoint);
  } else {
    targetElement.parentNode.appendChild(panel);
  }
}

// グローバル関数として公開
window.addVideoSettingsPanel = addVideoSettingsPanel; 