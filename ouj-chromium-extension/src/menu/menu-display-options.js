// 「表示オプション」パネル
// この拡張機能がページに追加するUIを、機能ごとに表示/非表示できる設定画面。
// 定義と保存・即時反映のロジックは utils/display-options.js にある。
//
// 非表示への切り替えは utils/display-options.js のCSSで即座に反映される。
// 表示へ戻す方向は「挿入自体をしなかった要素」が対象なので、メニューの作り直しと
// ページ側の挿入処理の再実行（reapplyOujFeaturesAfterDisplayOptionChange）で反映する。
// それでも取りこぼす表示があり得るため、保険として再読み込みバーは残している。

function buildDisplayOptionRowHtml(option, visible) {
  const descriptionHtml = option.description
    ? `<div style="font-size:11px;color:#888;line-height:1.5;margin-top:2px;">${option.description}</div>`
    : '';
  return `
    <label style="display:flex;align-items:flex-start;gap:8px;padding:7px 0;cursor:pointer;">
      <input type="checkbox" class="ouj-display-option-checkbox" data-option-id="${option.id}" ${visible ? 'checked' : ''} style="margin-top:2px;flex-shrink:0;">
      <span style="flex:1;">
        <span style="font-size:13px;color:#374151;">${option.label}</span>
        ${descriptionHtml}
      </span>
    </label>
  `;
}

function buildDisplayOptionsMainHtml() {
  const saved = window.getOujDisplayOptions();
  const groupsHtml = (window.OUJ_DISPLAY_OPTION_GROUPS || []).map((group) => `
    <div style="padding:0 20px 4px 20px;">
      <div style="font-size:13px;font-weight:bold;color:#1565c0;margin:18px 0 4px 0;">${group.label}</div>
      ${group.description ? `<div style="font-size:11px;color:#888;line-height:1.6;margin:0 0 6px 0;">${group.description}</div>` : ''}
      <div style="border-top:1px solid #eee;">
        ${group.options.map((option) => buildDisplayOptionRowHtml(option, saved[option.id] !== false)).join('')}
      </div>
    </div>
  `).join('');

  return `
    <div style="text-align:left;">
      <div style="padding:16px 20px 0 20px;font-size:12px;color:#666;line-height:1.7;">
        この拡張機能が画面に追加している表示を、機能ごとにオフにできます。
        チェックを外すとその表示だけが消え、機能そのもの（お気に入りや履歴の記録など）は残ります。
      </div>
      <div style="padding:12px 20px 0 20px;display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" id="ouj-display-options-minimal" style="padding:6px 14px;border-radius:14px;font-size:12px;cursor:pointer;border:1px solid #1976d2;background:#fff;color:#1976d2;">ページ内の追加表示を最小限にする</button>
        <button type="button" id="ouj-display-options-reset" style="padding:6px 14px;border-radius:14px;font-size:12px;cursor:pointer;border:1px solid #ddd;background:#fff;color:#333;">すべて表示（初期状態）に戻す</button>
      </div>
      <div id="ouj-display-options-reload" style="display:none;padding:12px 20px 0 20px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:8px 12px;">
          <span style="font-size:12px;color:#795548;">設定を保存し、この画面に反映しました。反映されていない表示があれば再読み込みしてください。</span>
          <button type="button" id="ouj-display-options-reload-button" style="padding:5px 12px;border-radius:12px;font-size:12px;cursor:pointer;border:1px solid #1976d2;background:#1976d2;color:#fff;">再読み込み</button>
        </div>
      </div>
      ${groupsHtml}
      <div style="padding:16px 20px 20px 20px;font-size:12px;color:#999;">
        ※「表示オプション」の項目自体は非表示にできません（設定に戻れなくなるため）
      </div>
    </div>
  `;
}

// 隠すだけでは操作不能な状態が残ってしまう項目の後始末。
// ヘッダー折りたたみボタンは、折りたたんだ状態でボタンを消すとヘッダーを
// 戻せなくなるため、その場でヘッダーを開き直す（設定値自体は変えないので、
// ボタンを再表示すれば元の折りたたみ状態に戻る）。
function applyDisplayOptionSideEffect(optionId, visible) {
  if (optionId === 'header-collapse' && !visible && typeof window.applyOujHeaderCollapsed === 'function') {
    window.applyOujHeaderCollapsed(false);
  }
}

// 「非表示 → 表示」に戻したときの即時反映。
// 非表示の機能は挿入処理のゲート（isOujFeatureVisible）でそもそもDOMに作られない
// ため、utils/display-options.js のCSSを外すだけでは何も現れない。特に「初期状態で
// 非表示」の項目はページを開いた時点で一度も挿入されておらず、再読み込みするまで
// 戻らなかった。ここでメニューを作り直し、ページ側の挿入処理を走らせ直す。
// 各挿入処理は冪等なので、既にある要素が重複することはない。
function reapplyOujFeaturesAfterDisplayOptionChange() {
  if (typeof window.rebuildOujMenus === 'function') window.rebuildOujMenus();
  if (typeof window.oujRerunPageFeatures === 'function') window.oujRerunPageFeatures();
}

function renderDisplayOptionsPanel(overlay) {
  overlay.innerHTML = window.renderNativeShellHtml({
    breadcrumbHtml: window.buildNativeBreadcrumbHtml([{ text: '表示オプション' }]),
    mainHtml: buildDisplayOptionsMainHtml(),
  });

  const reloadBar = overlay.querySelector('#ouj-display-options-reload');
  const showReloadBar = () => {
    if (reloadBar) reloadBar.style.display = 'block';
  };

  overlay.querySelectorAll('.ouj-display-option-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const optionId = event.target.dataset.optionId;
      window.setOujFeatureVisible(optionId, event.target.checked);
      applyDisplayOptionSideEffect(optionId, event.target.checked);
      if (event.target.checked) reapplyOujFeaturesAfterDisplayOptionChange();
      showReloadBar();
    });
  });

  const minimalButton = overlay.querySelector('#ouj-display-options-minimal');
  if (minimalButton) {
    minimalButton.addEventListener('click', () => {
      // ページ内に直接追加される表示だけをまとめてオフにする。
      // メニューの項目は残すので、お気に入り・履歴などの機能には引き続きアクセスできる。
      const next = {};
      window.getOujDisplayOptionList().forEach((option) => {
        next[option.id] = !option.inPage;
        if (option.inPage) applyDisplayOptionSideEffect(option.id, false);
      });
      window.setOujDisplayOptions(next);
      // メニュー項目は表示のまま残すため、作り直して確実に出しておく
      reapplyOujFeaturesAfterDisplayOptionChange();
      renderDisplayOptionsPanel(overlay);
      const bar = overlay.querySelector('#ouj-display-options-reload');
      if (bar) bar.style.display = 'block';
    });
  }

  const resetButton = overlay.querySelector('#ouj-display-options-reset');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      window.resetOujDisplayOptions();
      reapplyOujFeaturesAfterDisplayOptionChange();
      renderDisplayOptionsPanel(overlay);
      const bar = overlay.querySelector('#ouj-display-options-reload');
      if (bar) bar.style.display = 'block';
    });
  }

  const reloadButton = overlay.querySelector('#ouj-display-options-reload-button');
  if (reloadButton) {
    reloadButton.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

function handleDisplayOptionsPanelOpen() {
  window.openNativeOverlay((overlay) => {
    renderDisplayOptionsPanel(overlay);
  }, 'displayoptions');
}

// グローバルwindowに関数を公開
window.handleDisplayOptionsPanelOpen = handleDisplayOptionsPanelOpen;
