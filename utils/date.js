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

module.exports = {
  formatDate,
  formatTime
};
