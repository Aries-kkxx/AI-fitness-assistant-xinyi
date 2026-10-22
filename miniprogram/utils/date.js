// utils/date.js - 日期时间工具
// 统一封装日期格式化，避免各页面重复书写

// 数字补零：9 -> '09'
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// 返回 YYYY-MM-DD（用于饮水记录的 date 字段与查询条件）
function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// 返回 HH:mm（用于饮水记录的 drink_time 字段）
function formatTime(d) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// 返回本周一日期 YYYY-MM-DD（周一为一周起点，与训练计划一致）
function getMondayDate(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay() || 7; // getDay(): 0=周日 → 转成 7
  date.setDate(date.getDate() - day + 1);
  return formatDate(date);
}

// 返回本月第一天 YYYY-MM-DD
function getMonthStartDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01';
}

module.exports = {
  formatDate,
  formatTime,
  getMondayDate,
  getMonthStartDate
};
