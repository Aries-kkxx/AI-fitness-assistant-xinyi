// utils/sensitive.js - 敏感信息检测（纯函数，无 wx 依赖）
// 职责：检测文本中是否包含不应写入长期记忆的敏感信息
//   （手机号 / 身份证 / 银行卡 / 邮箱 / 密码上下文 / 详细住址）
// 注意：cloudfunctions/aiCoach/tools.js 内有相同逻辑（云函数独立部署，需同步修改）。
// 原则：敏感信息一律不进入 fitness_memory 等长期记忆；检测到即拒绝保存并提示用户。

// 敏感模式（宽松但够用，避免误伤健身相关文本）
const PATTERNS = [
  { key: '手机号', re: /\b1[3-9]\d{9}\b/ },
  { key: '身份证号', re: /\b\d{17}[\dXx]\b/ },
  { key: '银行卡号', re: /\b(?:62|60|4|5|9)\d{14,18}\b/ },
  { key: '邮箱', re: /\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/ },
  { key: '密码/账号', re: /(?:密码|口令|password|pwd)|(?:账号|account)\s*[:：]?\s*\S{4,}/i }
];

/**
 * 检测文本中的敏感信息
 * @param {string} text
 * @returns {string|null} 命中的敏感类型名；无则返回 null
 */
function detectSensitive(text) {
  if (!text) return null;
  const s = String(text);
  for (let i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].re.test(s)) return PATTERNS[i].key;
  }
  return null;
}

/**
 * 从字符串数组中剔除含敏感信息的条目
 * @param {Array<string>} list
 * @returns {Array<string>} 清洗后的数组
 */
function filterSensitiveList(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => !detectSensitive(item));
}

module.exports = {
  detectSensitive,
  filterSensitiveList,
  PATTERNS
};
