// 視聴回数バッジ（例:「5/15回視聴済み」）の見た目を、科目一覧ページ
// (page-course-select-progress.js)とお気に入りパネル(menu/menu-favorites.js)で共通化する。
//
// 過去に科目一覧ページで、バッジが空プレースホルダー→実データへ切り替わる瞬間に幅が変わり、
// 後続のお気に入り星が左右にずれる不具合が起きた(min-widthを設けて解消済み)。お気に入り
// パネルの視聴回数バッジも同じgetCategoryProgress由来・同じ見た目でmin-widthが無く、
// 同じ不具合を再現していたため、プレースホルダーのスタイルと色分けロジックをここに集約し、
// 新しく同種のバッジを追加する時にmin-width指定を書き忘れないようにする。

// 「999/999回視聴済み+」相当まで入っても幅が変わらないための下限
const OUJ_PROGRESS_BADGE_MIN_WIDTH = 110;

function oujProgressBadgeStyleText() {
  return `display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:${OUJ_PROGRESS_BADGE_MIN_WIDTH}px;margin-left:8px;padding:2px 10px;border-radius:12px;font-size:12px;color:#666;background:#eee;white-space:nowrap;`;
}

// 視聴回数バッジに文言・状態別の色を反映する（要素の追加・削除はしない＝幅が変わるのはテキスト量のみ）。
// 動画が無い等でバッジ自体を消す判断は呼び出し側の責務（min-widthはあくまで「表示するなら
// 最初から確保しておく」ためのもので、非表示にするケースまでは吸収しない）
function fillProgressCountBadge(badge, { finishedCount, total, suffix = '' }) {
  badge.textContent = `${t('progress.watched', { finished: finishedCount, total })}${suffix}`;
  if (finishedCount >= total) {
    badge.style.background = '#dcedc8';
    badge.style.color = '#33691e';
  } else if (finishedCount > 0) {
    badge.style.background = '#e3f2fd';
    badge.style.color = '#1565c0';
  } else {
    badge.style.background = '#eee';
    badge.style.color = '#666';
  }
}

// 全科目絞り込みパネル(search-box-all-subjects-panel.js)用。「視聴済み」「視聴途中」の
// 短い状態ラベルのみを出すバッジで、視聴回数バッジとは文言が違うため別にmin-widthを持つ
// （実測値: 両文言とも12pxフォントで68px。同じ文字数なので既に幅は揃っているが、
// 空欄プレースホルダーの時点から確保しておく必要がある）
const OUJ_STATE_BADGE_MIN_WIDTH = 68;

function oujStateBadgeStyleText() {
  return `display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:${OUJ_STATE_BADGE_MIN_WIDTH}px;margin-left:8px;padding:2px 10px;border-radius:12px;font-size:12px;color:#666;background:#eee;white-space:nowrap;`;
}

// 科目一覧の1行(サイト純正の.icon-textフレックス行)に、拡張が追加するお気に入り星・
// 視聴進捗バッジ・「▶続き」ボタンを差し込むための共通レイアウト処理。
//
// 3要素の合計幅(お気に入り約51px＋バッジ最小110px＋続きボタン約70px)が、モバイル幅や
// 科目名が長い場合にサイト純正の科目名(.text-area)を圧迫し、科目名が1文字ずつ折り返されて
// 行全体が縦に大きく間延びする不具合が実機で見つかった(flexの既定align-itemsにより、
// 追加要素も伸びた行の高さいっぱいに引き伸ばされてしまう)。対策として、
// (1) 行自体をflex-wrapさせ、(2) 科目名は2行までに制限してそれ以上は省略し、
// (3) お気に入り/バッジ/続きボタンは共有のラッパー1つにまとめることで、幅が足りない時に
// バラバラにではなく「まとまって」2行目へ折り返す。
// page-course-select.js(お気に入り星)とpage-course-select-progress.js(バッジ・続き
// ボタン)の両方から呼ばれる(呼び出し順は問わない・何度呼んでも安全)。
function ensureOujCourseRowWrapLayout(row) {
  if (row.dataset.oujRowLayoutApplied) return;
  row.dataset.oujRowLayoutApplied = '1';
  row.style.flexWrap = 'wrap';
  row.style.rowGap = '4px';
  const textArea = row.querySelector(':scope > .text-area');
  if (textArea) {
    // サイト純正CSSが.text-areaに width:100% を指定しており、flex-basis:autoはこの
    // widthを基準に解決されるため、widthを明示的に上書きしないと常に行の全幅を要求してしまい
    // (十分な余白があってもお気に入り等が2行目に落ちてしまう)、幅に応じた折り返しにならない
    textArea.style.width = 'auto';
    textArea.style.flex = '1 1 auto';
    textArea.style.minWidth = '120px';
    textArea.style.display = '-webkit-box';
    textArea.style.webkitLineClamp = '2';
    textArea.style.webkitBoxOrient = 'vertical';
    textArea.style.overflow = 'hidden';
  }
}

const OUJ_COURSE_ROW_ACTIONS_CLASS = 'course-row-actions';

// お気に入り星・進捗バッジ・続きボタンをまとめて追加するための共有コンテナ。無ければ作る。
function getOujCourseRowActions(row) {
  ensureOujCourseRowWrapLayout(row);
  let actions = row.querySelector(`:scope > .${OUJ_COURSE_ROW_ACTIONS_CLASS}`);
  if (actions) return actions;
  actions = document.createElement('span');
  actions.className = OUJ_COURSE_ROW_ACTIONS_CLASS;
  actions.style.cssText = 'display:inline-flex;align-items:center;flex-wrap:nowrap;flex:0 0 auto;';
  row.appendChild(actions);
  return actions;
}

window.oujProgressBadgeStyleText = oujProgressBadgeStyleText;
window.fillProgressCountBadge = fillProgressCountBadge;
window.oujStateBadgeStyleText = oujStateBadgeStyleText;
window.getOujCourseRowActions = getOujCourseRowActions;
