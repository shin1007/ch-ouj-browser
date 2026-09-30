// 動画の先読み（バッファ）量を増やすパッチ。
//
// サイトの再生プレイヤーは THEOplayer 7 で、先読み量は ABR 設定の targetBuffer（秒）で決まる。
// サイトはこれを既定のまま（20秒）で使っているため、回線が不安定だと20秒ぶんを使い切った時点で
// 再生が止まる。ここでは利用者が設定パネルで選んだ秒数を targetBuffer に流し込み、
// 先の方まで貯めておけるようにする。
//
// 【重要】このファイルは page-size-patch.js と同じく MAIN world（サイト自身のJSと同じ世界）で動く。
// isolated world からは window.THEOplayer が見えないため。
// MAIN worldではchrome.* APIが使えないので、設定はページと共有しているlocalStorageから直接読む
// （拡張の設定は utils/settings.js が同じlocalStorageにJSONで入れている）。
//
// 効き方の注意（過度な期待をしないこと）:
//   - 実際に貯まる量は THEOplayer 内部で min(targetBuffer, maxBufferLength) に丸められ、さらに
//     ブラウザのMSEバッファ上限（ソースバッファのクォータ）でも頭打ちになる。指定した秒数まで
//     必ず貯まるわけではなく、「上限まで貯めてよい」と伝えるだけ。
//   - 途中で視聴をやめると先読みした分の通信は無駄になるため、既定は「標準（サイトのまま）」。
(function () {
  const OUJ_TARGET_BUFFER_KEY = 'videoTargetBufferSeconds';
  // プレイヤーが差し替わっても元の値に戻せるよう、最初に見たときの値を覚えておく
  const originalTargetBuffers = new WeakMap();

  function getDesiredTargetBufferSeconds() {
    try {
      const raw = localStorage.getItem(OUJ_TARGET_BUFFER_KEY);
      if (raw === null) return 0;
      const seconds = Number(JSON.parse(raw));
      if (!Number.isFinite(seconds) || seconds <= 0) return 0;
      return seconds;
    } catch (e) {
      return 0;
    }
  }

  function applyToPlayer(player, desiredSeconds) {
    const abr = player && player.abr;
    if (!abr || typeof abr.targetBuffer !== 'number') return;

    if (!originalTargetBuffers.has(player)) {
      originalTargetBuffers.set(player, abr.targetBuffer);
    }
    // 0（標準）を選び直したときはサイト既定へ戻す
    const target = desiredSeconds > 0 ? desiredSeconds : originalTargetBuffers.get(player);
    if (abr.targetBuffer !== target) {
      abr.targetBuffer = target;
    }
  }

  function applyToAllPlayers() {
    try {
      const players = window.THEOplayer && window.THEOplayer.players;
      if (!players || !players.length) return;
      const desiredSeconds = getDesiredTargetBufferSeconds();
      for (let i = 0; i < players.length; i++) {
        applyToPlayer(players[i], desiredSeconds);
      }
    } catch (e) { /* 失敗しても再生は続けさせる（サイトを壊さないことを優先） */ }
  }

  // SPAなので再生ページへの出入りでプレイヤーが作り直される。また設定パネルでの変更も
  // 再生中に反映したいので、常時ポーリングする（処理は上記のとおりごく軽い）。
  setInterval(applyToAllPlayers, 2000);
})();
