// cloudfunctions/aiCoach/memory.js - 长期健身记忆工具（云函数端）
// ⚠️ 与前端 services/fitness-memory.js + utils/sensitive.js 保持逻辑一致（需同步修改）。
// 职责：fitness_memory 结构归一化、敏感信息过滤、区块白名单。

// 默认空记忆结构
const EMPTY_MEMORY = {
  training_preferences: {
    preferred_training_styles: [],
    favorite_exercises: [],
    disliked_exercises: [],
    preferred_time: '',
    preferred_duration: 45
  },
  training_habits: {
    weekly_frequency: 0,
    common_time: '',
    often_missed_days: [],
    common_patterns: []
  },
  body_response: {
    slow_recovery_parts: [],
    easily_tired_exercises: [],
    feedback: []
  },
  goals: {
    current: '',
    history: [],
    updated_at: ''
  },
  ai_notes: []
};

const SECTIONS = ['training_preferences', 'training_habits', 'body_response', 'goals', 'ai_notes'];

// 各区块字段白名单
const SECTION_KEYS = {
  training_preferences: ['preferred_training_styles', 'favorite_exercises', 'disliked_exercises', 'preferred_time', 'preferred_duration'],
  training_habits: ['weekly_frequency', 'common_time', 'often_missed_days', 'common_patterns'],
  body_response: ['slow_recovery_parts', 'easily_tired_exercises', 'feedback'],
  goals: ['current', 'history', 'updated_at'],
  ai_notes: []
};

// 敏感信息模式（与前端 utils/sensitive.js 一致）
const SENSITIVE_PATTERNS = [
  { key: '手机号', re: /\b1[3-9]\d{9}\b/ },
  { key: '身份证号', re: /\b\d{17}[\dXx]\b/ },
  { key: '银行卡号', re: /\b(?:62|60|4|5|9)\d{14,18}\b/ },
  { key: '邮箱', re: /\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/ },
  { key: '密码/账号', re: /(?:密码|口令|password|pwd)|(?:账号|account)\s*[:：]?\s*\S{4,}/i }
];

function detectSensitive(text) {
  if (!text) return null;
  const s = String(text);
  for (let i = 0; i < SENSITIVE_PATTERNS.length; i++) {
    if (SENSITIVE_PATTERNS[i].re.test(s)) return SENSITIVE_PATTERNS[i].key;
  }
  return null;
}

function normalizeList(list, max) {
  if (!Array.isArray(list)) return [];
  const seen = {};
  const out = [];
  const cap = max || 50;
  (list || []).forEach((item) => {
    const s = String(item || '').trim();
    if (!s) return;
    if (detectSensitive(s)) return;
    if (seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out.slice(0, cap);
}

function normalizeNoteList(list, max) {
  if (!Array.isArray(list)) return [];
  const cap = max || 30;
  const out = [];
  (list || []).forEach((item) => {
    if (!item) return;
    const content = String(item.content || item.goal || '').trim();
    if (!content || detectSensitive(content)) return;
    const date = item.date || item.changed_at || '';
    out.push({ content, date: String(date || '') });
  });
  return out.slice(-cap);
}

// 结构归一化
function normalizeMemory(raw) {
  const m = raw || {};
  const out = JSON.parse(JSON.stringify(EMPTY_MEMORY));

  const pre = m.training_preferences || {};
  out.training_preferences.preferred_training_styles = normalizeList(pre.preferred_training_styles);
  out.training_preferences.favorite_exercises = normalizeList(pre.favorite_exercises);
  out.training_preferences.disliked_exercises = normalizeList(pre.disliked_exercises);
  out.training_preferences.preferred_time = detectSensitive(pre.preferred_time) ? '' : String(pre.preferred_time || '').slice(0, 20);
  const dur = Math.round(Number(pre.preferred_duration));
  out.training_preferences.preferred_duration = dur >= 10 && dur <= 240 ? dur : 45;

  const hab = m.training_habits || {};
  out.training_habits.weekly_frequency = Math.min(7, Math.max(0, Math.round(Number(hab.weekly_frequency) || 0)));
  out.training_habits.common_time = detectSensitive(hab.common_time) ? '' : String(hab.common_time || '').slice(0, 20);
  out.training_habits.often_missed_days = normalizeList(hab.often_missed_days);
  out.training_habits.common_patterns = normalizeList(hab.common_patterns);

  const body = m.body_response || {};
  out.body_response.slow_recovery_parts = normalizeList(body.slow_recovery_parts);
  out.body_response.easily_tired_exercises = normalizeList(body.easily_tired_exercises);
  out.body_response.feedback = normalizeNoteList(body.feedback);

  const goals = m.goals || {};
  out.goals.current = detectSensitive(goals.current) ? '' : String(goals.current || '').slice(0, 50);
  out.goals.history = normalizeNoteList(goals.history);
  out.goals.updated_at = String(goals.updated_at || '').slice(0, 20);

  out.ai_notes = normalizeNoteList(m.ai_notes);
  return out;
}

module.exports = {
  EMPTY_MEMORY,
  SECTIONS,
  SECTION_KEYS,
  detectSensitive,
  normalizeMemory
};
