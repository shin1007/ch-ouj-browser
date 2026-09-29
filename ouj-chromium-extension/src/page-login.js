// ログインページのURLをチェック
async function waitForPasswordAndLogin() {
    // 共通関数の存在をチェック
    if (typeof window.waitForElement !== 'function') {
        setTimeout(waitForPasswordAndLogin, 100);
        return;
    }
    // ログイン要素を待つ
    window.waitForElement('#username', (usernameField) => {
        window.waitForElement('#password', (passwordField) => {
            insertReferTo();
            window.waitForElement('button[name="submitBtn"][type="submit"]', (loginButton) => {
                // ユーザー名フィールドにフォーカス
                usernameField.focus();

                // 入力を監視
                let autoLoginEnabled = true;
                const interval = setInterval(() => {
                    const len = passwordField.value.length;
                    // 1文字以上入力された場合は自動ログインをオフ
                    if (len > 0 && len <= 7) {
                        autoLoginEnabled = false;
                        clearInterval(interval);
                        return;
                    }
                    // 8文字以上で自動ログイン有効時のみ自動クリック
                    if (len > 0 && autoLoginEnabled && len > 7) {
                        clearInterval(interval);
                        loginButton.click();
                    }
                }, 100);

                // 3分で監視終了
                setTimeout(() => {
                    clearInterval(interval);
                }, 3*60*1000);
            });
        });
    });
}

async function insertReferTo() {
    // 既に情報が挿入されている場合はスキップ
    if (document.querySelector('#ouj-login-redirect-info')) {
        return;
    }
    const nextElement = document.querySelector('#usernameSection > label');
    if (nextElement) {
        const message = await getReferToMessage();
        // このawait中に別の呼び出し(insertReferToが同時に複数回走った場合)が先に
        // 挿入している可能性があるため、実際にDOMへ挿入する直前で再チェックする
        // (冒頭のチェックだけだとawaitを挟む分のTOCTOUで二重挿入しうる)
        if (document.querySelector('#ouj-login-redirect-info')) {
            return;
        }
        const infoDiv = document.createElement('div');
        infoDiv.style.marginTop = '8px';
        infoDiv.style.marginBottom = '8px';
        infoDiv.style.fontSize = '12px';
        infoDiv.style.color = '#555';
        // id
        infoDiv.id = 'ouj-login-redirect-info';
        infoDiv.textContent = t('loginRedirect.destination', { name: message });
        nextElement.parentNode.insertBefore(infoDiv, nextElement);
    }
}

async function getReferToMessage() {
    const referTo = await window.detectOujPageType(window.location.href);
    if (!referTo) {
        return null;
    }
    // 表示名は言語切替に追従させるためキー(t()の引数)で持ち、表示の直前に翻訳する。
    // 翻訳後の文字列で分岐すると言語ごとに比較が壊れるので、分岐はキーで行う
    const subDomainKeys = {
        'wakaba': 'loginRedirect.wakaba',
        'tsushin': 'loginRedirect.tsushin',
        'shiken': 'loginRedirect.shiken',
        'online': 'loginRedirect.online',
        'live': 'loginRedirect.live',
        'sls': 'loginRedirect.sls',
        'nurse': 'loginRedirect.nurse',
        'info': 'loginRedirect.info',
        'v': 'loginRedirect.v'
    };
    const infoKeys = {
        'kyozaipdf': 'loginRedirect.kyozaipdf',
        'mondai': 'loginRedirect.mondai',
        'gakubu': 'loginRedirect.gakubu',
        'daigakuin': 'loginRedirect.daigakuin',
        'shisho': 'loginRedirect.shisho',
        'inronbun': 'loginRedirect.inronbun'
    };
    const vodKeys = {
        'home': 'loginRedirect.vodHome',
        'player': 'loginRedirect.vodPlayer',
        'search-result': 'loginRedirect.vodSearchResult',
        'series-select': 'loginRedirect.vodSeriesSelect',
        'video-select': 'loginRedirect.vodVideoSelect',
        'other': 'common.other'
    };
    const subDomain = referTo.referTo.subDomain;
    let key = subDomainKeys[subDomain] || 'loginRedirect.unknown';
    if (subDomain === 'info') {
        key = infoKeys[referTo.referTo.page] || key;
    }
    let message;
    if (subDomain === 'v') {
        key = vodKeys[referTo.referTo.page] || key;
        message = t(key);
        const category = await window.getCategoryData(String(referTo.referTo.categoryId));
        if (category){
            message += `（${category.name}）`;
        }
    } else {
        message = t(key);
    }

    return message;
}

// キャッシュされたカテゴリデータを削除する関数
async function clearCachedCategoriesData() {
    try {
        await chrome.storage.local.remove(['cachedCategoriesData']);
        console.log('[OUJ拡張] ログイン成功を検知し、カテゴリキャッシュを削除しました。');
    } catch (error) {
        console.error("clearCachedCategoriesData: カテゴリデータのキャッシュ削除に失敗しました:", error);
    }
}


// グローバル関数として公開
window.waitForPasswordAndLogin = waitForPasswordAndLogin;
window.clearCachedCategoriesData = clearCachedCategoriesData;