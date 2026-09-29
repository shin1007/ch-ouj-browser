// 学習時間パネル（menu.jsから分離）
// study-time.jsが記録した日別学習時間を表示する。
// - 期間切替: 直近7日（日別）/ 30日（日別）/ 90日（週別）
// - ストリーク: 1日の目標分数を満たした日が何日連続しているか
// - 科目別内訳: 直近7日間でどの科目に時間を使ったか（上位5科目）
// 見た目の共通基盤はmenu-native-shell.jsを利用する。

const STUDY_TIME_WEEK_DAYS = 7;
const STUDY_TIME_GOAL_KEY = 'studyTimeGoalMinutes';
const STUDY_TIME_GOAL_DEFAULT = 15;

function formatStudyMinutes(totalSeconds) {
  return Math.round(totalSeconds / 60);
}

function studyTimeDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 今日を含む直近n日分の日付キー("YYYY-MM-DD")を古い順に返す
function getLastNDateKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push({ key: studyTimeDateKey(d), date: d });
  }
  return keys;
}

// startDaysAgo日前からendDaysAgoExclusive日前(を含まない)までの合計秒数
function sumStudyTimeRange(totalsByDate, startDaysAgo, endDaysAgoExclusive) {
  let total = 0;
  const now = new Date();
  for (let i = startDaysAgo; i < endDaysAgoExclusive; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    total += totalsByDate[studyTimeDateKey(d)] || 0;
  }
  return total;
}

// 目標分数を満たした日の連続数（ストリーク）を数える。
// 今日まだ目標未達でもストリークは切らさない（昨日までの連続数を返す）
function calcStudyStreak(totalsByDate, goalMinutes) {
  const goalSeconds = goalMinutes * 60;
  const now = new Date();
  const todayKey = studyTimeDateKey(now);
  const todayMet = (totalsByDate[todayKey] || 0) >= goalSeconds;
  let streak = todayMet ? 1 : 0;
  // 昨日から遡って数える
  for (let i = 1; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if ((totalsByDate[studyTimeDateKey(d)] || 0) >= goalSeconds) {
      streak++;
    } else {
      break;
    }
  }
  return { streak, todayMet };
}

// 日別の棒グラフ（7日/30日用）
function buildStudyTimeChartHtml(totalsByDate, days) {
  const dayLabels = [t('studyTime.day0'), t('studyTime.day1'), t('studyTime.day2'), t('studyTime.day3'), t('studyTime.day4'), t('studyTime.day5'), t('studyTime.day6')];
  const entries = getLastNDateKeys(days);
  const values = entries.map(({ key }) => totalsByDate[key] || 0);
  const maxValue = Math.max(...values, 60); // 全て0分でも棒が潰れないよう最低1分相当を確保
  const showEveryLabel = days <= 7;

  const bars = entries.map(({ key, date }, i) => {
    const seconds = values[i];
    const heightPercent = seconds > 0 ? Math.max(Math.round((seconds / maxValue) * 100), 4) : 0;
    const isToday = i === entries.length - 1;
    // 30日表示ではラベルを5日ごとに間引く（日付の数字を表示）
    let label = '';
    if (showEveryLabel) {
      label = dayLabels[date.getDay()];
    } else if (i % 5 === 0 || isToday) {
      label = `${date.getMonth() + 1}/${date.getDate()}`;
    }
    const valueLabel = showEveryLabel ? `<div style="font-size:11px;color:#666;margin-bottom:4px;white-space:nowrap;">${t('studyTime.minutes', { n: formatStudyMinutes(seconds) })}</div>` : '';
    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:0;" title="${key}: ${t('studyTime.minutes', { n: formatStudyMinutes(seconds) })}">
        ${valueLabel}
        <div style="width:100%;max-width:${showEveryLabel ? 32 : 12}px;height:120px;display:flex;align-items:flex-end;">
          <div style="width:100%;height:${heightPercent}%;background:${isToday ? '#1976d2' : '#90caf9'};border-radius:2px 2px 0 0;"></div>
        </div>
        <div style="font-size:10px;color:${isToday ? '#1976d2' : '#666'};font-weight:${isToday ? 'bold' : 'normal'};margin-top:4px;white-space:nowrap;">${label}</div>
      </div>
    `;
  }).join('');

  // box-sizing/width:100%でパネル幅を超えないようにし、日付ラベル等の横はみ出しは枠内でクリップする
  // （30日表示で棒やラベルがパネルからあふれるのを防ぐ）
  return `<div style="display:flex;gap:${showEveryLabel ? 8 : 2}px;padding:16px 20px;align-items:flex-end;box-sizing:border-box;width:100%;max-width:100%;overflow:hidden;">${bars}</div>`;
}

// 週別の棒グラフ（90日用）
function buildStudyTimeWeeklyChartHtml(totalsByDate) {
  const weeks = 13;
  const values = [];
  for (let w = weeks - 1; w >= 0; w--) {
    values.push(sumStudyTimeRange(totalsByDate, w * 7, (w + 1) * 7));
  }
  const maxValue = Math.max(...values, 60);
  const bars = values.map((seconds, i) => {
    const heightPercent = seconds > 0 ? Math.max(Math.round((seconds / maxValue) * 100), 4) : 0;
    const isThisWeek = i === values.length - 1;
    const weeksAgo = values.length - 1 - i;
    const label = isThisWeek ? t('studyTime.thisWeek') : (weeksAgo % 4 === 0 ? t('studyTime.weeksAgo', { n: weeksAgo }) : '');
    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:0;" title="${weeksAgo === 0 ? t('studyTime.thisWeek') : t('studyTime.weeksAgo', { n: weeksAgo })}: ${t('studyTime.minutes', { n: formatStudyMinutes(seconds) })}">
        <div style="font-size:10px;color:#666;margin-bottom:4px;white-space:nowrap;">${t('studyTime.minutes', { n: formatStudyMinutes(seconds) })}</div>
        <div style="width:100%;max-width:24px;height:120px;display:flex;align-items:flex-end;">
          <div style="width:100%;height:${heightPercent}%;background:${isThisWeek ? '#1976d2' : '#90caf9'};border-radius:3px 3px 0 0;"></div>
        </div>
        <div style="font-size:10px;color:${isThisWeek ? '#1976d2' : '#666'};font-weight:${isThisWeek ? 'bold' : 'normal'};margin-top:4px;white-space:nowrap;">${label}</div>
      </div>
    `;
  }).join('');
  return `<div style="display:flex;gap:4px;padding:16px 20px;align-items:flex-end;box-sizing:border-box;width:100%;max-width:100%;overflow:hidden;">${bars}</div>`;
}

function buildStudyTimeSummaryHtml(totalsByDate, goalMinutes) {
  const thisWeek = sumStudyTimeRange(totalsByDate, 0, STUDY_TIME_WEEK_DAYS);
  const lastWeek = sumStudyTimeRange(totalsByDate, STUDY_TIME_WEEK_DAYS, STUDY_TIME_WEEK_DAYS * 2);
  const diff = thisWeek - lastWeek;
  let diffText = t('studyTime.sameAsLastWeek');
  let diffColor = '#666';
  if (diff > 0) {
    diffText = t('studyTime.moreThanLastWeek', { n: formatStudyMinutes(diff) });
    diffColor = '#2e7d32';
  } else if (diff < 0) {
    diffText = t('studyTime.lessThanLastWeek', { n: formatStudyMinutes(Math.abs(diff)) });
    diffColor = '#c62828';
  }

  // ストリークと今日の目標
  const { streak, todayMet } = calcStudyStreak(totalsByDate, goalMinutes);
  const todaySeconds = totalsByDate[studyTimeDateKey(new Date())] || 0;
  const todayMinutes = formatStudyMinutes(todaySeconds);
  const remainingToGoal = Math.max(0, goalMinutes - todayMinutes);
  const streakHtml = streak > 0
    ? `<span style="font-size:15px;color:#e65100;font-weight:bold;">🔥 ${t('studyTime.streak', { n: streak })}</span>`
    : `<span style="font-size:13px;color:#999;">${t('studyTime.startStreak')}</span>`;
  const todayGoalHtml = todayMet
    ? `<span style="font-size:13px;color:#2e7d32;">${t('studyTime.goalMet', { n: goalMinutes })}</span>`
    : `<span style="font-size:13px;color:#666;">${t('studyTime.goalRemaining', { goal: goalMinutes, remaining: remainingToGoal })}</span>`;

  return `
    <div style="padding:20px 20px 0 20px;">
      <div style="font-size:22px;font-weight:bold;color:#1565c0;">${t('studyTime.thisWeekTotal', { n: formatStudyMinutes(thisWeek) })}</div>
      <div style="font-size:13px;color:${diffColor};margin-top:4px;">${diffText}${t('studyTime.lastWeekParen', { n: formatStudyMinutes(lastWeek) })}</div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        ${streakHtml}
        ${todayGoalHtml}
        <span style="font-size:12px;color:#999;">${t('studyTime.goalLabel')}
          <select id="study-time-goal-select" style="font-size:12px;">
            ${[5, 10, 15, 30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${m === goalMinutes ? 'selected' : ''}>${t('studyTime.perDay', { n: m })}</option>`).join('')}
          </select>
        </span>
      </div>
    </div>
  `;
}

// 科目別内訳（直近7日、上位5科目）。科目名の解決が非同期のためプレースホルダを返し、後から埋める
function buildCategoryBreakdownPlaceholderHtml() {
  return `
    <div id="study-time-category-breakdown" style="padding:0 20px 8px 20px;"></div>
  `;
}

async function fillCategoryBreakdown(overlay) {
  const container = overlay.querySelector('#study-time-category-breakdown');
  if (!container) return;
  const byCategory = window.getStudyTimeByCategory ? window.getStudyTimeByCategory(7) : {};
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (entries.length === 0) return;
  const categories = await window.getCategoriesData();
  const maxSeconds = entries[0][1];
  const rows = entries.map(([catId, seconds]) => {
    const category = (categories || []).find((c) => String(c.categoryId) === String(catId));
    const name = category ? window.trimCourseName(category.name) : t('studyTime.unknownCourse', { id: catId });
    const widthPercent = Math.max(Math.round((seconds / maxSeconds) * 100), 4);
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <div style="width:40%;min-width:120px;font-size:12px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${name}">${name}</div>
        <div style="flex:1;height:14px;background:#f0f0f0;border-radius:7px;overflow:hidden;">
          <div style="height:100%;width:${widthPercent}%;background:#64b5f6;"></div>
        </div>
        <div style="width:52px;text-align:right;font-size:12px;color:#666;">${t('studyTime.minutes', { n: formatStudyMinutes(seconds) })}</div>
      </div>
    `;
  }).join('');
  container.innerHTML = `
    <div style="font-size:13px;font-weight:bold;color:#374151;margin-bottom:8px;">${t('studyTime.byCourse')}</div>
    ${rows}
  `;
}

function renderStudyTimePanel(overlay, periodDays) {
  const totalsByDate = window.getStudyTimeTotalsByDate ? window.getStudyTimeTotalsByDate() : {};
  const goalMinutes = Number(window.getSetting(STUDY_TIME_GOAL_KEY, STUDY_TIME_GOAL_DEFAULT));

  // 期間切替タブ
  const periods = [
    { days: 7, label: t('studyTime.days', { n: 7 }) },
    { days: 30, label: t('studyTime.days', { n: 30 }) },
    { days: 90, label: t('studyTime.days', { n: 90 }) },
  ];
  const tabsHtml = `
    <div style="display:flex;gap:8px;padding:14px 20px 0 20px;">
      ${periods.map(({ days, label }) => `
        <button type="button" class="study-time-period-tab" data-days="${days}" style="
          padding:5px 14px;border-radius:14px;font-size:13px;cursor:pointer;
          border:1px solid ${days === periodDays ? '#1976d2' : '#ddd'};
          background:${days === periodDays ? '#1976d2' : '#fff'};
          color:${days === periodDays ? '#fff' : '#333'};
        ">${label}</button>
      `).join('')}
    </div>
  `;

  const chartHtml = periodDays === 90
    ? buildStudyTimeWeeklyChartHtml(totalsByDate)
    : buildStudyTimeChartHtml(totalsByDate, periodDays);

  overlay.innerHTML = window.renderNativeShellHtml({
    breadcrumbHtml: window.buildNativeBreadcrumbHtml([{ text: t('menu.studyTime') }]),
    mainHtml: `
      ${buildStudyTimeSummaryHtml(totalsByDate, goalMinutes)}
      ${tabsHtml}
      ${chartHtml}
      ${buildCategoryBreakdownPlaceholderHtml()}
      <div style="padding:0 20px 20px 20px;font-size:12px;color:#999;">
        ${t('studyTime.footnote')}
      </div>
    `
  });

  // 期間タブのイベント
  overlay.querySelectorAll('.study-time-period-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      renderStudyTimePanel(overlay, Number(tab.dataset.days));
    });
  });

  // 目標分数の変更
  const goalSelect = overlay.querySelector('#study-time-goal-select');
  if (goalSelect) {
    goalSelect.addEventListener('change', (event) => {
      window.saveSetting(STUDY_TIME_GOAL_KEY, Number(event.target.value));
      renderStudyTimePanel(overlay, periodDays);
    });
  }

  // 科目別内訳を非同期で埋める
  fillCategoryBreakdown(overlay);
}

function handleStudyTimePanelOpen() {
  window.openNativeOverlay((overlay) => {
    renderStudyTimePanel(overlay, 7);
  }, 'studytime');
}

// グローバルwindowに関数を公開
window.handleStudyTimePanelOpen = handleStudyTimePanelOpen;
