// =========================
// ヘッダー（画面上部のツールバー）への表示テーマ切替ボタン設置
// ロゴ画像(img.logo-img)を目印にツールバーを特定し、検索ボックスの右側に
// トグルボタンを挿入する。ロゴはinsertLeftMenuでも待機に使っている、
// 常に存在する信頼できるアンカー要素。
// =========================
const HEADER_DARKMODE_TOGGLE_CLASS = 'ouj-header-darkmode-toggle';
const HEADER_DARKMODE_ICONS = { auto: '🌓', light: '☀️', dark: '🌙' };

function insertHeaderDarkModeToggle() {
  if (typeof window.waitForElement !== 'function') {
    setTimeout(insertHeaderDarkModeToggle, 100);
    return;
  }
  window.waitForElement('img.logo-img[src="./assets/images/icon_logo.png"]', (logo) => {
    const toolbarContent = logo.closest('.toolbar-content');
    if (!toolbarContent) return;
    // 重複挿入防止
    if (toolbarContent.querySelector(`.${HEADER_DARKMODE_TOGGLE_CLASS}`)) return;

    // .vod-list-searchはflexで残り幅いっぱいに広がるため、その外側(afterend)に
    // 置くと折り返されてしまう。検索ボタン等と同じ行に収まるよう、内側の
    // .search-area（検索欄・検索ボタンを横並びにしているコンテナ）の末尾に入れる。
    const searchArea = toolbarContent.querySelector('.vod-list-search .search-area');

    const toggle = document.createElement('span');
    toggle.className = HEADER_DARKMODE_TOGGLE_CLASS;
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', '0');
    Object.assign(toggle.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      marginLeft: '8px',
      flexShrink: '0',
      cursor: 'pointer',
      borderRadius: '50%',
      fontSize: '18px',
      lineHeight: '1',
      userSelect: 'none'
    });

    const applyLabel = (setting) => {
      const labels = window.OUJ_DARK_MODE_LABELS;
      toggle.textContent = HEADER_DARKMODE_ICONS[setting] || HEADER_DARKMODE_ICONS.auto;
      toggle.title = t('header.themeTitle', { theme: labels[setting] || labels.auto });
    };

    if (typeof window.getOujDarkModeSetting === 'function') {
      window.getOujDarkModeSetting(applyLabel);
    } else {
      applyLabel('auto');
    }

    const handleToggle = () => {
      if (typeof window.cycleOujDarkModeSetting === 'function') {
        window.cycleOujDarkModeSetting(applyLabel);
      }
    };
    toggle.addEventListener('click', handleToggle);
    toggle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleToggle();
      }
    });

    if (searchArea) {
      searchArea.appendChild(toggle);
    } else {
      toolbarContent.appendChild(toggle);
    }
  });
}
window.insertHeaderDarkModeToggle = insertHeaderDarkModeToggle;
