// =========================
// ヘッダー（画面上部のツールバー）へのシステムWAKABAリンク設置
// ロゴ画像(img.logo-img)を目印にツールバーを特定し、検索ボックスの右側に
// システムWAKABA（学生ポータル）を新規タブで開くアイコンを挿入する。
// =========================
const HEADER_WAKABA_LINK_CLASS = 'ouj-header-wakaba-link';
// /portal/home/home/display は認証済みセッションが前提のURLで、未ログイン状態で開くと
// 「不正な操作が行われたため、処理を続けることができません」エラーになる。
// ポータルトップ（未ログインでもログインボタンから遷移できる）にリンクする。
const HEADER_WAKABA_URL = 'https://www.wakaba.ouj.ac.jp/portal/';

function insertHeaderWakabaLink() {
  if (typeof window.waitForElement !== 'function') {
    setTimeout(insertHeaderWakabaLink, 100);
    return;
  }
  window.waitForElement('img.logo-img[src="./assets/images/icon_logo.png"]', (logo) => {
    const toolbarContent = logo.closest('.toolbar-content');
    if (!toolbarContent) return;
    // 重複挿入防止
    if (toolbarContent.querySelector(`.${HEADER_WAKABA_LINK_CLASS}`)) return;

    // .vod-list-searchはflexで残り幅いっぱいに広がるため、その外側(afterend)に
    // 置くと折り返されてしまう。検索ボタン等と同じ行に収まるよう、内側の
    // .search-area（検索欄・検索ボタンを横並びにしているコンテナ）の末尾に入れる。
    const searchArea = toolbarContent.querySelector('.vod-list-search .search-area');

    const link = document.createElement('a');
    link.className = HEADER_WAKABA_LINK_CLASS;
    link.href = HEADER_WAKABA_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = t('header.openWakaba');
    link.textContent = '🎓';
    Object.assign(link.style, {
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
      textDecoration: 'none',
      userSelect: 'none'
    });

    if (searchArea) {
      searchArea.appendChild(link);
    } else {
      toolbarContent.appendChild(link);
    }
  });
}
window.insertHeaderWakabaLink = insertHeaderWakabaLink;
