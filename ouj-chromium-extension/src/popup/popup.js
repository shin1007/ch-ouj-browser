document.addEventListener('DOMContentLoaded', function() {
    // 大きな放送大学ページボタン
    const openOujHomeButton = document.getElementById('open-ouj-home');

    // システムWAKABAボタン
    const openWakabaButton = document.getElementById('open-wakaba');

    // 自動ログインのチェックボックス
    const autoLoginCheckbox = document.getElementById('auto-login-checkbox');

    // 表示テーマの選択欄
    const themeSelect = document.getElementById('theme-select');

    // 表示言語の選択欄。先頭は「自動（ブラウザの言語）」、以降は各言語の自国語表記
    const languageSelect = document.getElementById('language-select');
    const buildLanguageOptions = () => {
        languageSelect.replaceChildren();
        const autoOption = new Option(oujI18n.t('popup.language.auto'), 'auto');
        languageSelect.add(autoOption);
        oujI18n.LANGUAGES.forEach((lang) => languageSelect.add(new Option(lang.name, lang.code)));
        languageSelect.value = oujI18n.getLanguageSetting();
    };
    oujI18n.applyToDom();
    buildLanguageOptions();
    // 保存値の非同期読み込み後や他の画面での変更時にも、文言と選択肢を追従させる
    oujI18n.onChange(buildLanguageOptions);
    languageSelect.addEventListener('change', () => {
        oujI18n.setLanguageSetting(languageSelect.value);
    });

    // ポップアップが開いた際にボタンにフォーカスを当てる
    openOujHomeButton.focus();

    // 保存された自動ログイン設定を読み込む
    // 未設定時、実際の自動ログイン処理(utils/goToLoginPage.js)はfalseが明示されない限り
    // 動作する(デフォルトON)。表示をこの実挙動に合わせるため、未設定時はチェック状態にする。
    chrome.storage.sync.get(['autoLogin'], function(result) {
        autoLoginCheckbox.checked = result.autoLogin !== false;
    });

    // 自動ログイン設定の変更を保存
    autoLoginCheckbox.addEventListener('change', function() {
        chrome.storage.sync.set({
            autoLogin: autoLoginCheckbox.checked
        }, function() {
            if (chrome.runtime.lastError) {
                console.error('自動ログイン設定の保存エラー:', chrome.runtime.lastError);
            }
        });
    });

    // 保存された表示テーマ設定を読み込む（未設定時は自動＝OS追従）
    chrome.storage.sync.get(['darkMode'], function(result) {
        themeSelect.value = result.darkMode || 'auto';
    });

    // 表示テーマ設定の変更を保存
    themeSelect.addEventListener('change', function() {
        chrome.storage.sync.set({
            darkMode: themeSelect.value
        }, function() {
            if (chrome.runtime.lastError) {
                console.error('表示テーマ設定の保存エラー:', chrome.runtime.lastError);
            }
        });
    });

    // 放送大学ホームページを開く
    openOujHomeButton.addEventListener('click', function() {
        const targetUrl = "https://v.ouj.ac.jp/view/ouj/#/navi/home";

        // 新しいタブで放送大学のホームページを開く
        chrome.tabs.create({
            url: targetUrl,
            active: true
        }, (newTab) => {
            if (chrome.runtime.lastError) {
                console.error('タブ作成エラー:', chrome.runtime.lastError);
            } else {
                // ポップアップを閉じる
                window.close();
            }
        });
    });

    // システムWAKABA（学生ポータル）を開く
    openWakabaButton.addEventListener('click', function() {
        // /portal/home/home/display は認証済みセッションが前提のURLで、未ログイン状態で
        // 開くとエラーになるため、未ログインでもログインボタンから遷移できるポータル
        // トップにリンクする（src/menu/menu-header-wakaba.jsと同じURL）。
        const targetUrl = "https://www.wakaba.ouj.ac.jp/portal/";

        chrome.tabs.create({
            url: targetUrl,
            active: true
        }, (newTab) => {
            if (chrome.runtime.lastError) {
                console.error('タブ作成エラー:', chrome.runtime.lastError);
            } else {
                window.close();
            }
        });
    });

    // ライセンスセクションのアコーディオン
    const licensesHeader = document.getElementById('licenses-header');
    const licensesContent = document.getElementById('licenses-content');
    if (licensesHeader && licensesContent) {
        const accordionIcon = licensesHeader.querySelector('.accordion-icon');
        licensesHeader.addEventListener('click', () => {
            const isOpen = licensesContent.style.display === 'block';
            licensesContent.style.display = isOpen ? 'none' : 'block';
            if (accordionIcon) accordionIcon.textContent = isOpen ? '▼' : '▲';
        });
    }
});
