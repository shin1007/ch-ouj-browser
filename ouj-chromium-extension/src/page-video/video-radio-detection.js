
// 再生ページ限定: 動画ストリームそのものの内在解像度(videoWidth/videoHeight)で判定する。
// 従来はCSSで指定された表示幅(style.vjs-styles-dimensions)をテキスト解析していたが、
// レイアウト計算が終わるタイミングに左右され、過去に両方向(ラジオがTV扱い/TVがラジオ扱い)の
// 誤判定を起こしていた。videoWidth/videoHeightは動画ストリーム自体が持つコーデック
// メタデータであり、DRM保護下でも(実ピクセルの読み取りとは違い)制限なく参照できるため、
// 表示上のCSS解析より直接的で確実な判定材料になる。
async function isTvSize(){
  const video = await new Promise(resolve => window.waitForElement('video', resolve));
  await new Promise((resolve) => {
    if (video.videoWidth > 0) {
      resolve();
      return;
    }
    const onLoadedMetadata = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      resolve();
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    // メタデータがどうしても読み込まれない場合に備えたフォールバック
    setTimeout(resolve, 5000);
  });

  // 解像度が取得できない場合は、誤ってラジオ番組表示を出さないよう安全側(テレビ番組扱い)に倒す
  if (!video.videoWidth) return true;

  return video.videoWidth > 300;
}

// video-src/v3のレスポンスをキャッシュ付きで取得する。contentTypeやexistsSamiFile
// (実字幕の有無。画像字幕を含む)など、カテゴリの説明文より確実な判定材料が含まれている。
// DRMチケット発行を伴うエンドポイントのため、isCaptionAvailable(検索結果一覧の「字幕あり
// のみ」フィルタ含む)でのみ使う。isRadioProgramの検索結果一覧向け判定(explicit contentId)
// では使わない。動画要素の実解像度という確実な代替判定材料があるisTvSize()と違い、
// video-src/v3のcontentTypeがラジオ/テレビをどう区別しているか未確認のため、誤った判定を
// 出すよりは既存の(精度が劣ることは分かっている)カテゴリ説明文判定に留める判断。
async function getVideoSrcInfo(contentId) {
  if (!contentId || typeof window.fetchWithCache !== 'function') return null;
  try {
    const url = `https://v.ouj.ac.jp/v1/tenants/1/vod-contents/${contentId}/video-src/v3?region=cdn`;
    const cacheKey = `videoSrcInfo_${contentId}`;
    const data = await window.fetchWithCache(url, cacheKey, 60);
    if (!data || !data.content) return null;
    return {
      contentType: data.content.contentType,
      existsSamiFile: !!data.existsSamiFile,
    };
  } catch (error) {
    return null;
  }
}

// contentIdを省略した場合は現在再生中の動画を対象にする（従来通りの挙動）。
// 検索結果一覧など、プレイヤー以外のページから任意の動画を判定したい場合はcontentIdを明示的に渡す。
async function isRadioProgram(contentId) {
  const isExplicitContentId = contentId !== undefined && contentId !== null;
  const currentVideoId = isExplicitContentId ? contentId : window.getCurrentContentId();
  if (!currentVideoId) return false;

  // 動画IDから現在のカテゴリデータを取得
  const currentCategory = await window.getCategoryDataFromContentId(currentVideoId);
  if (!currentCategory) return false;

  // 検索結果一覧など、動画要素が存在しないページでの判定はカテゴリの説明文に頼るしかない。
  // 「ラジオ番組の字幕付加実験」配下でも、サイト上はラジオ番組として案内されている科目に
  // 変わりはないため、一覧の絞り込み(テレビ/ラジオチップ)ではsummaryの表記をそのまま使う。
  // 下の「テレビ番組扱いとする」上書きは、実際に映像を確認できる再生ページ限定の判定
  // (isTvSize)に対する例外なので、ここでは適用しない
  if (isExplicitContentId) {
    return !!(currentCategory.summary && currentCategory.summary.startsWith('(ラジオ'));
  }

  // ラジオ番組の字幕付加実験のカテゴリはテレビ番組扱いとする。
  // grandParentCategoryNameから判断（parentだと教養学部か大学院になる。）
  const parentId = currentCategory.parentId;
  const grandParentCategoryName = await window.getParentCategoryName(parentId);
  if (grandParentCategoryName && grandParentCategoryName.includes('ラジオ番組の字幕付加実験')) {
    return false;
  }

  // 再生中のページでは、実際の動画ストリームの解像度を判定材料にする。カテゴリの説明文が
  // 「(ラジオ...)」表記でも実際には映像が配信されているコースがあるため、その場合は
  // 表記より実際に映像があるかどうかを優先する(映像があればラジオ番組表示は出さない)。
  return !(await isTvSize());
}
async function isCaptionAvailable(contentId) {
    const isExplicitContentId = contentId !== undefined && contentId !== null;
    // 現在の動画IDを取得（contentId省略時は現在再生中の動画）
    const currentVideoId = isExplicitContentId ? contentId : window.getCurrentContentId();
    if (!currentVideoId) return false;

    // 実字幕(SAMIファイル。画像字幕を含む)の有無を優先する。検索結果一覧の「字幕ありのみ」
    // フィルタ(contentId明示指定)でも使う。DRMチケット発行を伴うが、page-search-result-filters.js
    // 側で画面内に入った項目だけ・同時実行数を制限して呼ばれるため、既存のgetVideoViewingStatus
    // (視聴状況取得)と同程度の負荷増加に収まる。
    const videoSrcInfo = await getVideoSrcInfo(currentVideoId);
    if (videoSrcInfo && typeof videoSrcInfo.existsSamiFile === 'boolean') {
      return videoSrcInfo.existsSamiFile;
    }

    // API取得に失敗した場合のフォールバック
    const currentCategory = await window.getCategoryDataFromContentId(currentVideoId);
    if (!currentCategory) return false;

    // summary欄で「ラジオ番組の字幕付加実験」カテゴリかどうかを判定
    return !!(currentCategory.summary && currentCategory.summary.startsWith('(ラジオ・字幕'));
}
// ラジオ番組判定関数
async function checkIfRadioProgram() {
  // isRadioProgram()はカテゴリAPI取得や動画メタデータ読み込み待ち(最大5秒)を
  // 挟むため、待機中に次の動画へ遷移しうる。呼び出し開始時点のURLを記録し、
  // 判定結果が出た時点で既に別ページ/別動画へ移っていれば、古い判定結果で
  // 新しい動画にラジオ番組UIを誤挿入しないよう破棄する
  const startUrl = window.location.href;
  try {
    // ラジオ番組はUIを表示
    if (await isRadioProgram()) {
      if (window.location.href !== startUrl) return;
      showRadioProgramUI(startUrl);
    // テレビ番組の場合は何もしない
    } else {
    }
  } catch (error) {
    // console.error('checkIfRadioProgram: ラジオ番組判定でエラーが発生しました:', error);
  }
}


// ラジオ番組用のUI表示関数
// startUrlを省略した場合(直接呼び出し時等)は現在のURLを基準にする
function showRadioProgramUI(startUrl) {
  if (typeof startUrl !== 'string') startUrl = window.location.href;

  // 既にラジオ番組UIが表示されている場合は何もしない
  if (document.getElementById('radio-program-ui')) {
    return;
  }

  // 動画要素を待ってUIを挿入
  if (typeof window.waitForElement !== 'function') {
    setTimeout(() => showRadioProgramUI(startUrl), 100);
    return;
  }

  window.waitForElement('video', (video) => {
    // video要素が既に存在する場合はwaitForElementが即座に同期的にコールバックを
    // 呼ぶため、waitForElement自身のURLガードが実質働かない。ここでも念のため
    // 再確認してから挿入する
    if (window.location.href !== startUrl) return;
    if (document.getElementById('radio-program-ui')) return;
    // ラジオ番組用のUI要素を作成
    const radioUI = document.createElement('div');
    radioUI.id = 'radio-program-ui';
    radioUI.style.cssText = `
      position: absolute;
      top: 35%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 1px;
      border-radius: 5px;
      text-align: center;
      z-index: 1000;
      font-family: 'Arial', sans-serif;
      min-width: 150px;
    `;
    
    (async () => {
      const captionAvailable = await isCaptionAvailable();
      const inner = "rgb(1,116,193)";
      // const outer = "rgb(234,246,255)";
      const outer = "rgb(1,116,193, 0.7)";
      const outerPixel = "0.5px";
      radioUI.innerHTML = `
        <div style="font-size: 28px; 
        margin-bottom: 5px; 
        color: ${inner}; 
        text-shadow:
          ${outerPixel} ${outerPixel} 1px ${outer},   /* 右下 */
          -${outerPixel} ${outerPixel} 1px ${outer},  /* 左下 */
          ${outerPixel} -${outerPixel} 1px ${outer},  /* 右上 */
          -${outerPixel} -${outerPixel} 1px ${outer}, /* 左上 */
          ${outerPixel} 0px 1px ${outer},   /* 右 */
          -${outerPixel} 0px 1px ${outer},  /* 左 */
          0px -${outerPixel} 1px ${outer};  /* 上 */;
        ">♬</div>
        <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${t('filters.radio')}</div>
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">${await captionAvailable ? t('radio.captionAvailable') : t('radio.noCaption')}</div>
      `;
    })();
          // 0px ${outerPixel} 1px ${outer},   /* 下 */
    
    // 動画要素の親要素に挿入
    const videoContainer = video.parentElement;
    if (videoContainer) {
      videoContainer.style.position = 'relative';
      videoContainer.appendChild(radioUI);
      
    } else {
      console.error('showRadioProgramUI: 動画要素の親要素が見つかりませんでした');
    }
  });
}

// グローバル関数として公開
window.checkIfRadioProgram = checkIfRadioProgram;
window.showRadioProgramUI = showRadioProgramUI;
window.isRadioProgram = isRadioProgram;
window.isCaptionAvailable = isCaptionAvailable;
window.getVideoSrcInfo = getVideoSrcInfo;
