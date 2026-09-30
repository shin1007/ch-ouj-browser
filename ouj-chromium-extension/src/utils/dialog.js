/**
 * モーダルダイアログのユーティリティ。
 * showConfirmDialog（確認）/ showPromptDialog（1行入力）。
 */

/**
 * 確認ダイアログを表示する関数
 * @param {string} message - 確認メッセージ
 * @param {string} title - ダイアログのタイトル（デフォルト: '確認'）
 * @param {Object} options - オプション設定
 * @returns {Promise<boolean>} ユーザーの選択（true: OK, false: キャンセル）
 */
const showConfirmDialog = (message, title = t('common.confirm'), options = {}) => {
    return new Promise((resolve) => {
        const {
            okText = 'OK',
            cancelText = t('common.cancel'),
            okButtonClass = 'confirm-ok',
            cancelButtonClass = 'confirm-cancel'
        } = options;

        // 既存の確認ダイアログがあれば削除する。単にDOMから消すだけだと、その
        // ダイアログのkeydownリスナーがdocumentに残ったままPromiseも未解決のまま
        // 宙に浮き、後から別のダイアログでEnterを押した際に誤って古いPromiseが
        // resolve(true)されてしまう(古い呼び出し元が意図せず処理を進めてしまう)。
        // 強制クローズ用の後始末関数を経由して確実にリスナー解除・Promise解決する。
        const existingDialog = document.getElementById('confirm-dialog');
        if (existingDialog) {
            if (typeof existingDialog._oujForceClose === 'function') {
                existingDialog._oujForceClose();
            } else {
                existingDialog.remove();
            }
        }

        // ダイアログ要素を作成
        const dialog = document.createElement('div');
        dialog.id = 'confirm-dialog';
        dialog.className = 'confirm-dialog';

        // オーバーレイを作成
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';

        // ダイアログコンテンツを作成
        const content = document.createElement('div');
        content.className = 'confirm-content';

        // スタイルを適用
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: '10001',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.3s ease-in-out'
        });

        Object.assign(content.style, {
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            transform: 'scale(0.95)',
            transition: 'transform 0.3s ease-in-out',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        });

        // HTMLコンテンツを設定
        content.innerHTML = `
            <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #1f2937;">${title}</h3>
            <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.5; color: #4b5563;">${message}</p>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button class="${cancelButtonClass}" style="
                    padding: 8px 16px;
                    border: 1px solid #d1d5db;
                    background: #ffffff;
                    color: #374151;
                    border-radius: 6px;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s ease-in-out;
                ">${cancelText}</button>
                <button class="${okButtonClass}" style="
                    padding: 8px 16px;
                    border: none;
                    background: #3b82f6;
                    color: #ffffff;
                    border-radius: 6px;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s ease-in-out;
                ">${okText}</button>
            </div>
        `;

        // 要素を組み立て
        overlay.appendChild(content);
        dialog.appendChild(overlay);
        document.body.appendChild(dialog);

        // アニメーション開始
        setTimeout(() => {
            overlay.style.opacity = '1';
            content.style.transform = 'scale(1)';
        }, 10);

        // ボタンイベントリスナー
        const okButton = content.querySelector(`.${okButtonClass}`);
        const cancelButton = content.querySelector(`.${cancelButtonClass}`);

        // OKボタンに自動フォーカス
        setTimeout(() => {
            okButton.focus();
        }, 50);

        const closeDialog = (result) => {
            // イベントリスナーを削除
            document.removeEventListener('keydown', handleKeydown);
            dialog._oujForceClose = null;

            overlay.style.opacity = '0';
            content.style.transform = 'scale(0.95)';
            setTimeout(() => {
                if (dialog.parentNode) {
                    dialog.remove();
                }
                resolve(result);
            }, 300);
        };
        // 次のshowConfirmDialog呼び出しに、このダイアログを即座に(アニメーション無しで)
        // 後始末させるためのフック。キャンセル相当の結果で解決する
        dialog._oujForceClose = () => {
            document.removeEventListener('keydown', handleKeydown);
            dialog._oujForceClose = null;
            if (dialog.parentNode) dialog.remove();
            resolve(false);
        };

        okButton.addEventListener('click', () => closeDialog(true));
        cancelButton.addEventListener('click', () => closeDialog(false));

        // オーバーレイクリックでキャンセル
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                closeDialog(false);
            }
        });

        // キーボードイベント
        const handleKeydown = (event) => {
            if (event.key === 'Enter') {
                // フォーカス中の要素で判定
                const active = document.activeElement;
                if (active === okButton) {
                    closeDialog(true);
                } else if (active === cancelButton) {
                    closeDialog(false);
                } else {
                    closeDialog(true);
                }
            } else if (event.key === 'Escape') {
                closeDialog(false);
            }
        };
        document.addEventListener('keydown', handleKeydown);
    });
};

/**
 * 1行テキスト入力ダイアログを表示する関数（しおりのメモ入力などに使用）
 * @param {string} message - 説明メッセージ
 * @param {string} title - ダイアログのタイトル
 * @param {Object} options - { placeholder, defaultValue, okText, cancelText }
 * @returns {Promise<string|null>} 入力文字列（キャンセル時はnull）
 */
const showPromptDialog = (message, title = t('common.input'), options = {}) => {
    return new Promise((resolve) => {
        const {
            placeholder = '',
            defaultValue = '',
            okText = 'OK',
            cancelText = t('common.cancel')
        } = options;

        // 既存のダイアログがあれば削除する（理由はshowConfirmDialogのコメント参照）
        const existingDialog = document.getElementById('prompt-dialog');
        if (existingDialog) {
            if (typeof existingDialog._oujForceClose === 'function') {
                existingDialog._oujForceClose();
            } else {
                existingDialog.remove();
            }
        }

        const dialog = document.createElement('div');
        dialog.id = 'prompt-dialog';

        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            background: 'rgba(0, 0, 0, 0.5)', zIndex: '10001',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: '0', transition: 'opacity 0.3s ease-in-out'
        });

        const content = document.createElement('div');
        Object.assign(content.style, {
            background: '#ffffff', borderRadius: '12px', padding: '24px',
            maxWidth: '400px', width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            transform: 'scale(0.95)', transition: 'transform 0.3s ease-in-out',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        });

        content.innerHTML = `
            <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #1f2937;">${title}</h3>
            <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5; color: #4b5563;">${message}</p>
            <input type="text" class="prompt-input" placeholder="${placeholder.replace(/"/g, '&quot;')}" style="
                width: 100%; box-sizing: border-box; padding: 8px 12px; margin-bottom: 20px;
                border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; color: #1f2937;">
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button class="prompt-cancel" style="padding: 8px 16px; border: 1px solid #d1d5db; background: #ffffff; color: #374151; border-radius: 6px; font-size: 14px; cursor: pointer;">${cancelText}</button>
                <button class="prompt-ok" style="padding: 8px 16px; border: none; background: #3b82f6; color: #ffffff; border-radius: 6px; font-size: 14px; cursor: pointer;">${okText}</button>
            </div>
        `;

        overlay.appendChild(content);
        dialog.appendChild(overlay);
        document.body.appendChild(dialog);

        const input = content.querySelector('.prompt-input');
        input.value = defaultValue;

        setTimeout(() => {
            overlay.style.opacity = '1';
            content.style.transform = 'scale(1)';
            input.focus();
        }, 10);

        const closeDialog = (result) => {
            document.removeEventListener('keydown', handleKeydown);
            dialog._oujForceClose = null;
            overlay.style.opacity = '0';
            content.style.transform = 'scale(0.95)';
            setTimeout(() => {
                if (dialog.parentNode) dialog.remove();
                resolve(result);
            }, 300);
        };
        // 次のshowPromptDialog呼び出しに、このダイアログを即座に(アニメーション無しで)
        // 後始末させるためのフック。キャンセル相当の結果で解決する
        dialog._oujForceClose = () => {
            document.removeEventListener('keydown', handleKeydown);
            dialog._oujForceClose = null;
            if (dialog.parentNode) dialog.remove();
            resolve(null);
        };

        content.querySelector('.prompt-ok').addEventListener('click', () => closeDialog(input.value));
        content.querySelector('.prompt-cancel').addEventListener('click', () => closeDialog(null));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeDialog(null);
        });

        const handleKeydown = (event) => {
            if (event.key === 'Enter') {
                closeDialog(input.value);
            } else if (event.key === 'Escape') {
                closeDialog(null);
            }
        };
        document.addEventListener('keydown', handleKeydown);
    });
};

// グローバル関数として公開
window.showConfirmDialog = showConfirmDialog;
window.showPromptDialog = showPromptDialog;
