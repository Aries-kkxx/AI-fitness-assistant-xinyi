// utils/cycle-math.js - 训练周期日期与渐进规则（纯函数，无 wx 依赖，可单测）
// 职责：周期周窗口计算、当前周计算、渐进调整参数、减量周选择
// 注意：cloudfunctions/aiCoach/cycle.js 内有相同逻辑（云函数独立部署，需同步修改）

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// YYYY-MM-DD → Date（本地时区，兼容 iOS 的 '-' 解析）
function parseDate(dateStr) {
  return new Date(String(dateStr).replace(/-/g, '/'));
}

// 日期 + N 天 → YYYY-MM-DD（跨月/跨年安全）
function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// 周期第 weekNo 周的起止日期（weekNo 从 1 开始；第 n 周 = [start+(n-1)*7, start+n*7-1]）
function getWeekRange(startDate, weekNo) {
  return { start: addDays(startDate, (weekNo - 1) * 7), end: addDays(startDate, weekNo * 7 - 1) };
}

// 当前周号（1 起）；今天在周期外返回 0
function getCurrentWeek(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (today < start || today > end) return 0;
  const diffDays = Math.floor((today - start) / (24 * 60 * 60 * 1000));
  return Math.floor(diffDays / 7) + 1;
}

// 周期是否已结束（今天 > 结束日期）
function isCycleOver(endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > parseDate(endDate);
}

// 今天在周中的下标（0=周一）
function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

// 某周的动作调整参数（数据规则：每 2 周递增；减量周反向）
// 第1-2周 k=0, 3-4周 k=1, 5-6周 k=2, 7-8周 k=3
function buildAdjust(goal, weekNo, totalWeeks, deload) {
  if (deload) {
    return { sets_delta: -1, reps_delta: 0, weight_delta_pct: -20 };
  }
  const k = Math.floor((weekNo - 1) / 2);
  if (goal === '减脂') {
    return { sets_delta: Math.min(k, 2), reps_delta: 0, weight_delta_pct: 0 };
  }
  return { sets_delta: Math.min(k, 2), reps_delta: 0, weight_delta_pct: Math.min(k * 5, 15) };
}

// 减量周号（≥6 周周期在中段插入；4 周不插）
function getDeloadWeek(totalWeeks) {
  if (totalWeeks < 6) return 0;
  return Math.ceil(totalWeeks / 2);
}

module.exports = {
  formatDate,
  parseDate,
  addDays,
  getWeekRange,
  getCurrentWeek,
  isCycleOver,
  todayIndex,
  buildAdjust,
  getDeloadWeek
};
