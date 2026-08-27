// utils/archive-math.js - 个人健身成长档案统计（纯函数，无 wx 依赖，可单测）
// 职责：
//   1. 训练统计：本周/本月/累计次数（按日期去重）、完成率、总容量、平均时长、PR 数量
//   2. 体重统计：当前 / 30 天变化 / 90 天变化 / 趋势
//   3. 饮水统计：本月总量 / 日均 / 达标天数 / 连续达标天数
//   4. 恢复统计：平均疲劳 / 平均睡眠 / 酸痛趋势
//   5. 趋势序列（近 N 天每日数据点，无数据补 0）
//   6. 成就检测（全部程序判定，数据依据）
// 注意：cloudfunctions/aiCoach 的统计镜像在 tools.js getFitnessReport 中（复用 analysis.js）
const analysis = require('./workout-analysis');

// ===== 日期工具 =====

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function addDays(dateStr, days) {
  const d = new Date(dateStr.replace(/-/g, '/'));
  d.setDate(d.getDate() + days);
  return formatDate(d);
}
function getMondayDate(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return formatDate(date);
}
function getMonthStartDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01';
}
function todayStr() {
  return formatDate(new Date());
}

// ===== 训练统计 =====

/**
 * 训练统计
 * @param {Array<string>} trainingDates 训练日期（YYYY-MM-DD，去重）
 * @param {Array} records 训练记录（含 set_records/duration_minutes）
 * @param {number} weeklyFrequency 每周计划训练次数（完成率分母）
 * @returns {Object} { week, month, total, completionRate, totalVolume, avgDuration, prCount }
 */
function computeTrainingStats(trainingDates, records, weeklyFrequency) {
  const dates = (trainingDates || []).slice().sort();
  const today = todayStr();
  const monday = getMondayDate(new Date());
  const monthStart = getMonthStartDate(new Date());

  let week = 0;
  let month = 0;
  dates.forEach((d) => {
    if (d >= monday && d <= today) week++;
    if (d >= monthStart && d <= today) month++;
  });
  const total = dates.length;

  // 完成率：近 7 天实际训练天数 / 每周计划次数（封顶 100%）
  const start7 = addDays(today, -6);
  const week7 = dates.filter((d) => d >= start7 && d <= today).length;
  const freq = Math.max(1, Number(weeklyFrequency) || 3);
  const completionRate = Math.min(100, Math.round((week7 / freq) * 100));

  // 总容量 / 平均时长
  let totalVolume = 0;
  let durationSum = 0;
  let durationCount = 0;
  (records || []).forEach((r) => {
    totalVolume += analysis.computeRecordStats(r).volume;
    const dm = Number(r.duration_minutes) || 0;
    if (dm > 0) {
      durationSum += dm;
      durationCount++;
    }
  });
  const avgDuration = durationCount > 0 ? Math.round((durationSum / durationCount) * 10) / 10 : 0;

  // PR 数量：每个动作 PR 项数合计（最大重量/最大次数/最大容量）
  const byEx = {};
  (records || []).forEach((r) => {
    if (!r.exercise_id) return;
    (byEx[r.exercise_id] = byEx[r.exercise_id] || []).push(r);
  });
  let prCount = 0;
  Object.keys(byEx).forEach((exId) => {
    const prs = analysis.computePRs(byEx[exId]);
    if (prs.maxWeightPR) prCount++;
    if (prs.maxRepsPR) prCount++;
    if (prs.maxVolumePR) prCount++;
  });

  return { week, month, total, completionRate, totalVolume, avgDuration, prCount };
}

// ===== 体重统计 =====

/**
 * 体重统计
 * @param {Array} records 体重记录（{ date, weight_kg }，任意顺序）
 * @returns {Object} { hasData, current, change30, change90, count }
 */
function computeWeightStats(records) {
  const list = (records || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (list.length === 0) return { hasData: false, current: 0, change30: null, change90: null, count: 0 };
  const current = list[list.length - 1].weight_kg;
  const today = todayStr();
  const d30 = addDays(today, -30);
  const d90 = addDays(today, -90);
  const first30 = list.find((r) => r.date >= d30);
  const first90 = list.find((r) => r.date >= d90);
  const change30 = first30 ? Math.round((current - first30.weight_kg) * 10) / 10 : null;
  const change90 = first90 ? Math.round((current - first90.weight_kg) * 10) / 10 : null;
  return { hasData: true, current, change30, change90, count: list.length };
}

// ===== 饮水统计 =====

/**
 * 饮水统计
 * @param {Array} dailyGroups 按日汇总 [{ date, total, target }]
 * @returns {Object} { monthTotal, avgPerDay, goalDays, streakDays }
 */
function computeWaterStats(dailyGroups) {
  const groups = dailyGroups || [];
  const today = todayStr();
  const monthStart = getMonthStartDate(new Date());
  const monthGroups = groups.filter((g) => g.date >= monthStart && g.date <= today);
  const monthTotal = monthGroups.reduce((s, g) => s + (g.total || 0), 0);
  const days = monthGroups.length;
  const avgPerDay = days > 0 ? Math.round(monthTotal / days) : 0;

  // 达标天数（本月）+ 连续达标（历史最长）
  const goalDays = monthGroups.filter((g) => g.target > 0 && g.total >= g.target).length;
  let streakDays = 0;
  let maxStreak = 0;
  const byDate = {};
  groups.forEach((g) => {
    byDate[g.date] = g.target > 0 && g.total >= g.target;
  });
  Object.keys(byDate).sort().forEach((d) => {
    if (byDate[d]) {
      streakDays++;
      if (streakDays > maxStreak) maxStreak = streakDays;
    } else {
      streakDays = 0;
    }
  });

  return { monthTotal, avgPerDay, goalDays, streakDays: maxStreak };
}

// ===== 恢复统计 =====

/**
 * 恢复统计（近 30 天）
 * @param {Array} records 恢复记录
 * @returns {Object} { avgFatigue, avgSleep, avgSoreness, painDays, trend }
 */
function computeRecoveryStats(records) {
  const list = (records || []).slice();
  if (list.length === 0) {
    return { avgFatigue: 0, avgSleep: 0, avgSoreness: 0, painDays: 0, trend: [] };
  }
  const avg = (k) => Math.round((list.reduce((s, r) => s + (Number(r[k]) || 0), 0) / list.length) * 10) / 10;
  const trend = list
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => ({ date: r.date, fatigue: Number(r.fatigue) || 0, soreness: Number(r.soreness) || 0 }));
  return {
    avgFatigue: avg('fatigue'),
    avgSleep: avg('sleep_quality'),
    avgSoreness: avg('soreness'),
    painDays: list.filter((r) => {
      const state = require('./training-state');
      return state.detectPain(r.note);
    }).length,
    trend
  };
}

// ===== 趋势序列 =====

/**
 * 近 N 天每日数据点（无数据补 0）
 * @param {Object} valueByDate 日期 → 值
 * @param {number} days
 * @returns {Array<{date, value}>} 升序
 */
function buildDailySeries(valueByDate, days) {
  const out = [];
  const n = Math.max(1, Number(days) || 30);
  const today = todayStr();
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    out.push({ date: d, value: valueByDate[d] || 0 });
  }
  return out;
}

/**
 * 每日新 PR 数（近 N 天）
 * @param {Array} records 全部训练记录（升序更佳）
 * @param {number} days
 * @returns {Array<{date, value}>}
 */
function computeDailyPRs(records, days) {
  const sorted = (records || []).slice().sort((a, b) => (a.workout_date < b.workout_date ? -1 : 1));
  const byEx = {};
  const daily = {};
  sorted.forEach((r) => {
    if (!r.exercise_id || !r.workout_date) return;
    const before = byEx[r.exercise_id] || [];
    const beforePrs = analysis.computePRs(before);
    const st = analysis.computeRecordStats(r);
    let newPr = 0;
    if (st.maxWeight > 0 && (!beforePrs.maxWeightPR || st.maxWeight > beforePrs.maxWeightPR.value)) newPr++;
    if (st.maxReps > 0 && (!beforePrs.maxRepsPR || st.maxReps > beforePrs.maxRepsPR.value)) newPr++;
    if (st.volume > 0 && (!beforePrs.maxVolumePR || st.volume > beforePrs.maxVolumePR.value)) newPr++;
    if (newPr > 0) daily[r.workout_date] = (daily[r.workout_date] || 0) + newPr;
    byEx[r.exercise_id] = before.concat([r]);
  });
  return buildDailySeries(daily, days);
}

// ===== 成就 =====

/**
 * 成就定义与检测（程序判定）
 * @param {Object} input {
 *   totalTrainingDays, maxStreak, totalVolume, prCount, weightStreak, waterStreak, cyclesCompleted
 * }
 * @returns {Array<{ key, title, desc, icon, unlocked, progress }>}
 */
const ACHIEVEMENTS = [
  { key: 'first_training', title: '第一次训练', desc: '完成第 1 次训练', icon: '🏋️', check: (i) => i.totalTrainingDays >= 1, progress: (i) => Math.min(100, i.totalTrainingDays * 100) },
  { key: 'training_10', title: '训练 10 次', desc: '累计训练 10 天', icon: '🎯', check: (i) => i.totalTrainingDays >= 10, progress: (i) => Math.min(100, Math.round((i.totalTrainingDays / 10) * 100)) },
  { key: 'training_50', title: '训练 50 次', desc: '累计训练 50 天', icon: '🔥', check: (i) => i.totalTrainingDays >= 50, progress: (i) => Math.min(100, Math.round((i.totalTrainingDays / 50) * 100)) },
  { key: 'training_100', title: '训练 100 次', desc: '累计训练 100 天', icon: '💪', check: (i) => i.totalTrainingDays >= 100, progress: (i) => Math.min(100, Math.round((i.totalTrainingDays / 100) * 100)) },
  { key: 'streak_7', title: '连续训练 7 天', desc: '历史上连续 7 天训练', icon: '📅', check: (i) => i.maxStreak >= 7, progress: (i) => Math.min(100, Math.round((i.maxStreak / 7) * 100)) },
  { key: 'water_streak_7', title: '连续饮水达标 7 天', desc: '历史上连续 7 天饮水达标', icon: '💧', check: (i) => i.waterStreak >= 7, progress: (i) => Math.min(100, Math.round((i.waterStreak / 7) * 100)) },
  { key: 'first_pr', title: '首个个人纪录', desc: '创造第 1 个 PR', icon: '🏆', check: (i) => i.prCount >= 1, progress: (i) => Math.min(100, i.prCount * 100) },
  { key: 'pr_10', title: '10 个个人纪录', desc: '累计创造 10 个 PR', icon: '🥇', check: (i) => i.prCount >= 10, progress: (i) => Math.min(100, Math.round((i.prCount / 10) * 100)) },
  { key: 'weight_30', title: '连续记录体重 30 天', desc: '历史上连续 30 天记录体重', icon: '⚖️', check: (i) => i.weightStreak >= 30, progress: (i) => Math.min(100, Math.round((i.weightStreak / 30) * 100)) },
  { key: 'volume_10000', title: '容量 10000kg', desc: '累计训练容量超过 10000kg', icon: '🗼', check: (i) => i.totalVolume >= 10000, progress: (i) => Math.min(100, Math.round((i.totalVolume / 10000) * 100)) },
  { key: 'cycle_completed', title: '完成训练周期', desc: '完成一个 4~8 周训练周期', icon: '🗓️', check: (i) => i.cyclesCompleted >= 1, progress: (i) => Math.min(100, i.cyclesCompleted * 100) }
];

function computeAchievements(input) {
  return ACHIEVEMENTS.map((a) => ({
    key: a.key,
    title: a.title,
    desc: a.desc,
    icon: a.icon,
    unlocked: a.check(input),
    progress: a.progress(input)
  }));
}

// 日期列表最长连续段（含今天起算的当前段）
function maxConsecutive(dates) {
  const set = {};
  (dates || []).forEach((d) => {
    if (d) set[d] = true;
  });
  let max = 0;
  let cur = 0;
  Object.keys(set)
    .sort()
    .forEach((d) => {
      if (set[addDays(d, -1)]) {
        cur++;
      } else {
        cur = 1;
      }
      if (cur > max) max = cur;
    });
  return max;
}

module.exports = {
  computeTrainingStats,
  computeWeightStats,
  computeWaterStats,
  computeRecoveryStats,
  buildDailySeries,
  computeDailyPRs,
  computeAchievements,
  maxConsecutive,
  ACHIEVEMENTS,
  formatDate,
  addDays,
  // 转发单条记录统计（archive.js 等复用）
  computeRecordStats: analysis.computeRecordStats
};
