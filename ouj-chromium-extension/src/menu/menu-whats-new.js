// 「お知らせ」パネルと更新通知バッジ
// 拡張機能が更新されたとき（manifestのversionが変わったとき）、メニューの
// 「お知らせ」項目にNEWバッジを表示し、開くと新機能の一覧を確認できる。
// 一度開いたらそのバージョンは既読として記録し、バッジを消す。
//
// ★リリース時: 下のOUJ_CHANGELOG_ENTRIESの先頭に新しいバージョンの項目を追加すること
//   （itemsは日本語。他言語は itemsByLang: { en: [...], ko: [...], zh_CN: [...], zh_TW: [...] } で
//    任意に追加でき、無い言語は日本語のまま表示する。過去バージョンの多言語化は必須ではない）

const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';

// 表示する変更点（新しい順）。内容はREADMEの変更点の要約
const OUJ_CHANGELOG_ENTRIES = [
  {
    version: '2026.9.30',
    items: [
      '日本語・English・한국어・简体中文・繁體中文に対応しました。ブラウザの言語に合わせて自動で切り替わり、設定から手動で選ぶこともできます',
      'Chromeウェブストア・拡張機能一覧の名前と説明文も、各言語で表示されます',
    ],
    itemsByLang: {
      en: [
        'Now available in Japanese, English, Korean, Simplified Chinese and Traditional Chinese. The language follows your browser automatically, and you can also choose it manually in the settings.',
        'The name and description shown in the Chrome Web Store and the extensions page are also translated.',
      ],
      ko: [
        '일본어·English·한국어·简体中文·繁體中文을 지원합니다. 브라우저 언어에 맞춰 자동으로 전환되며, 설정에서 직접 선택할 수도 있습니다.',
        'Chrome 웹 스토어와 확장 프로그램 목록에 표시되는 이름과 설명도 각 언어로 표시됩니다.',
      ],
      zh_CN: [
        '现已支持日语、English、한국어、简体中文和繁體中文。会根据浏览器语言自动切换，也可以在设置中手动选择。',
        'Chrome 应用商店和扩展程序列表中显示的名称和说明也会以各语言显示。',
      ],
      zh_TW: [
        '現已支援日語、English、한국어、简体中文與繁體中文。會依瀏覽器語言自動切換，也可以在設定中手動選擇。',
        'Chrome 線上應用程式商店與擴充功能清單中顯示的名稱和說明也會以各語言顯示。',
      ],
    },
  },
  {
    version: '2026.7.31',
    items: [
      'メニューに「表示オプション」を追加。この拡張機能が画面に追加している表示を機能ごとにオフにできます（お気に入りや履歴の記録などの機能自体は残ります）',
      '「ページ内の追加表示を最小限にする」ボタンで、ページ内の追加表示をまとめてオフにできます（メニューからの機能はそのまま使えます）',
      '拡張機能メニューの項目も、使わないものを個別に隠せます',
      '動画下部の設定パネルの中身も、使わない項目だけを1ブロックずつ隠せます（隠しても設定内容はそのまま効きます）',
      '動画の「先読み（バッファ）する長さ」を設定できるようにしました。標準（約20秒）から最大10分まで選べ、回線が不安定でも再生が止まりにくくなります',
    ],
    itemsByLang: {
      en: [
        'Added "Display options" to the menu. You can turn off the elements this extension adds to the screen, feature by feature (the features themselves, such as recording favorites and history, keep working).',
        'The "Minimize elements added to pages" button turns off everything added to pages at once (features in the menu remain available).',
        'Extension menu items you do not use can also be hidden individually.',
        'Inside the settings panel below the video, you can hide only the items you do not use, one block at a time (saved settings still apply even when hidden).',
        'You can now set how far ahead the video is preloaded (buffer). Choose from the default (about 20 seconds) up to 10 minutes, so playback is less likely to stall on an unstable connection.',
      ],
      ko: [
        '메뉴에 "표시 옵션"을 추가했습니다. 이 확장 프로그램이 화면에 추가하는 표시를 기능별로 끌 수 있습니다(즐겨찾기나 기록 저장 등 기능 자체는 유지됩니다).',
        '"페이지 내 추가 표시를 최소화" 버튼으로 페이지 내 추가 표시를 한 번에 끌 수 있습니다(메뉴의 기능은 그대로 사용할 수 있습니다).',
        '확장 프로그램 메뉴 항목도 사용하지 않는 것만 개별적으로 숨길 수 있습니다.',
        '동영상 하단 설정 패널의 내용도 사용하지 않는 항목만 블록 단위로 숨길 수 있습니다(숨겨도 설정 내용은 그대로 적용됩니다).',
        '동영상의 "미리 읽기(버퍼) 길이"를 설정할 수 있게 했습니다. 기본(약 20초)부터 최대 10분까지 선택할 수 있어, 회선이 불안정해도 재생이 멈추기 어려워집니다.',
      ],
      zh_CN: [
        '菜单中新增“显示选项”。可以按功能关闭此扩展在页面上添加的显示内容（收藏和历史记录的保存等功能本身仍会保留）。',
        '通过“将页面内的附加显示降到最少”按钮，可以一次性关闭页面内的所有附加显示（菜单中的功能仍可正常使用）。',
        '扩展菜单中不使用的项目也可以单独隐藏。',
        '视频下方设置面板中的内容也可以只逐块隐藏不使用的项目（隐藏后设置内容仍然有效）。',
        '现在可以设置视频的“预加载（缓冲）时长”。可从默认（约 20 秒）到最长 10 分钟中选择，即使网络不稳定也不容易卡顿。',
      ],
      zh_TW: [
        '選單中新增「顯示選項」。可以依功能關閉此擴充功能在頁面上新增的顯示內容（收藏和歷史紀錄的儲存等功能本身仍會保留）。',
        '透過「將頁面內的附加顯示降到最少」按鈕，可以一次關閉頁面內的所有附加顯示（選單中的功能仍可正常使用）。',
        '擴充功能選單中不使用的項目也可以單獨隱藏。',
        '影片下方設定面板中的內容也可以只逐塊隱藏不使用的項目（隱藏後設定內容仍然有效）。',
        '現在可以設定影片的「預先載入（緩衝）時長」。可從預設（約 20 秒）到最長 10 分鐘中選擇，即使網路不穩定也不容易卡頓。',
      ],
    },
  },
  {
    version: '2026.7.18',
    items: [
      'ヘッダーの検索欄右側に、システムWAKABA（学生ポータル）を新規タブで開くアイコンを追加',
      '拡張機能のポップアップにも、システムWAKABA（学生ポータル）を開くボタンを追加',
      '動画ページに「回一覧」を追加。同じ科目の他の回に直接ジャンプ可能に',
      '動画終了時に「次の動画」のタイトルとカウントダウンを表示（キャンセル可能）',
      'メディアキー・スマホのロック画面から再生/停止・前後の回への移動が可能に（Media Session対応）',
      '動画ページに「小窓（ピクチャーインピクチャー）」「しおり」「あとで見る」ボタンを追加',
      'しおり: 再生位置にメモ付きのしおりを挟んで、メニューから一覧・ジャンプ',
      'あとで見る: 動画単位のリスト。リスト順の連続再生モードも追加',
      '再生速度・冒頭/末尾スキップ秒数を科目ごとに記憶するように変更',
      '動画の最初をスキップする設定を追加（前回の続きから再生する場合はスキップしません）',
      '動画タイトル横に「実質残り時間」（倍速換算）を表示',
      'A-B区間リピート（語学の聞き取り練習用）を追加',
      'スリープタイマーに「この回の終わりまで」を追加',
      '科目一覧に視聴進捗のバッジ（「▶続き」ボタン・修了ペース予測付き）を表示。回一覧・動画一覧には視聴済みマーク（クリックで手動切替）と「あとで見る」ボタンを追加',
      '検索結果にテレビ/ラジオ・字幕・視聴状況のバッジを常時表示',
      '検索結果に「未完了のみ」「視聴途中のみ」フィルタ、年度・科目での絞り込み、「最近の検索」チップを追加',
      '検索ボックスにフォーカスすると、キーワードなしでも年度・科目から探せる絞り込みパネルを表示（最近の検索・検索結果フィルタの事前設定も可能）',
      'メニューの「年度別」を廃止（検索ボックスの絞り込みパネルで代替できるため）',
      'ホーム画面に「続きから見る」パネルを追加（最大6件）',
      'お気に入りに「▶続き」ボタン（最初の未視聴回へ直行）・手動並び替え・視聴回数バッジ（例:5/15回視聴済み）を追加',
      '学習時間: 期間切替（7/30/90日）・連続学習日数・1日の目標・科目別内訳を追加',
      '検索結果の並び替え（新しい順・未視聴を優先）を追加',
      '再生位置の保存を改善（動画が一瞬止まらない方式を優先し、失敗時のみ従来方式）',
      'テレビ/ラジオの絞り込みを独立トグルに変更（両方選ぶと両方表示）',
      'ラジオ番組・字幕判定の誤り、検索結果や年度別一覧での重複表示など細かな不具合を修正',
    ],
  },
];

function getChangelogItems(entry) {
  const byLang = entry.itemsByLang && entry.itemsByLang[window.oujI18n.getLanguage()];
  return byLang || entry.items;
}

function getExtensionVersion() {
  try {
    return chrome.runtime.getManifest().version;
  } catch (e) {
    return '';
  }
}

// 未読の更新があるかどうか
function hasUnseenUpdate() {
  const version = getExtensionVersion();
  if (!version) return false;
  const lastSeen = window.getSetting(LAST_SEEN_VERSION_KEY, null);
  // 初回インストール直後（lastSeen未設定）はバッジを出さず、現在のバージョンを既読にする
  if (lastSeen === null) {
    window.saveSetting(LAST_SEEN_VERSION_KEY, version);
    return false;
  }
  return lastSeen !== version;
}

// メニューの「お知らせ」項目にNEWバッジを付ける/消す
function updateWhatsNewBadge(menuItemEl) {
  if (!menuItemEl) return;
  const existing = menuItemEl.querySelector('.ouj-whats-new-badge');
  if (hasUnseenUpdate()) {
    if (existing) return;
    const textArea = menuItemEl.querySelector('.text-area');
    if (!textArea) return;
    const badge = document.createElement('span');
    badge.className = 'ouj-whats-new-badge';
    badge.textContent = 'NEW';
    badge.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 6px;border-radius:8px;background:#e53935;color:#fff;font-size:10px;font-weight:bold;vertical-align:middle;';
    textArea.appendChild(badge);
  } else if (existing) {
    existing.remove();
  }
}

function handleWhatsNewPanelOpen() {
  // 開いた時点で現在のバージョンを既読として記録する
  const version = getExtensionVersion();
  if (version) {
    window.saveSetting(LAST_SEEN_VERSION_KEY, version);
  }
  // 全メニュー（左メニュー・ポップオーバー）のバッジを消す
  document.querySelectorAll('.ouj-whats-new-badge').forEach((badge) => badge.remove());

  window.openNativeOverlay((overlay) => {
    const sectionsHtml = OUJ_CHANGELOG_ENTRIES.map((entry) => `
      <div style="padding:0 20px 8px 20px;">
        <div style="font-size:15px;font-weight:bold;color:#1565c0;margin:16px 0 8px 0;">${entry.version}</div>
        <ul style="margin:0;padding-left:20px;">
          ${getChangelogItems(entry).map((item) => `<li style="font-size:13px;color:#374151;line-height:1.8;">${item}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    overlay.innerHTML = window.renderNativeShellHtml({
      breadcrumbHtml: window.buildNativeBreadcrumbHtml([{ text: t('menu.whatsNew') }]),
      mainHtml: `
        <div style="text-align:left;">
          ${sectionsHtml}
          ${window.oujI18n.getLanguage() !== 'ja' ? `<div style="padding:0 20px;font-size:12px;color:#999;">${t('whatsNew.olderInJapanese')}</div>` : ''}
          <div style="padding:12px 20px 20px 20px;font-size:12px;color:#999;">
            ${t('whatsNew.versionLine', { version: getExtensionVersion() || t('whatsNew.unknown') })}
            <a href="https://github.com/shin1007/ch-ouj-browser" target="_blank" rel="noopener" style="color:#1976d2;">GitHub</a>
            ${t('whatsNew.reportSuffix')}
          </div>
        </div>
      `
    });
  }, 'whatsnew');
}

// グローバルwindowに関数を公開
window.handleWhatsNewPanelOpen = handleWhatsNewPanelOpen;
window.updateWhatsNewBadge = updateWhatsNewBadge;
