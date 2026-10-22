// services/fitness-memory.js - 长期健身记忆数据层（fitness_memory）
// 职责：维护属于当前用户的「结构化长期记忆」（每用户 1 条文档）：
//   1. training_preferences  训练偏好（方式/喜欢动作/不喜欢动作/时间/时长）
//   2. training_habits       训练习惯（周频率/常见时间/常缺席日/常见模式）
//   3. body_response         身体反馈（恢复慢部位/易疲劳动作/历史反馈）
//   4. goals                 目标（当前/历史/变化时间）
//   5. ai_notes              AI 长期有价值的训练备注
// 口径：
//   - 每用户 1 条（openid 唯一），upsert；旧用户无文档时返回默认空结构，系统正常
//   - 所有文本保存前经敏感信息过滤（utils/sensitive.js），敏感信息不入库
//   - 数组条目上限（防滥用）：各列表 50 条，历史反馈/AI 备注 30 条
// 安全：按 _openid 过滤（'{openid}' 自动替换）
// 性能：缓存 5 分钟；保存/删除后立即失效
const cache = require('../utils/cache');
const { detectSensitive, filterSensitiveList } = require('../utils/sensitive');

const db = wx.cloud.database();
const COLLECTION = 'fitness_memory';
const MEMORY_TTL = 5 * 60 * 1000;
const MEMORY_CACHE_KEY = 'fitness_memory';

// 各区块字段白名单（保存时只接受这些键）
const SECTION_KEYS = {
  training_preferences: ['preferred_training_styles', 'favorite_exercises', 'disliked_exercises', 'preferred_time', 'preferred_duration'],
  training_habits: ['weekly_frequency', 'common_time', 'often_missed_days', 'common_patterns'],
  body_response: ['slow_recovery_parts', 'easily_tired_exercises', 'feedback'],
  goals: ['current', 'history', 'updated_at'],
  ai_notes: []
};
const SECTIONS = Object.keys(SECTION_KEYS);

// 数组上限
const LIST_MAX = 50;
const NOTE_MAX = 30;

// 默认空记忆结构（旧用户无文档时返回）
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

function invalidateMemoryCache() {
  cache.remove(MEMORY_CACHE_KEY);
}

// 字符串数组规范化（去空、去重、限长、滤敏感）
function normalizeList(list, max) {
  if (!Array.isArray(list)) return [];
  const seen = {};
  const out = [];
  const cap = max || LIST_MAX;
  (list || []).forEach((item) => {
    const s = String(item || '').trim();
    if (!s) return;
    if (detectSensitive(s)) return; // 敏感信息直接丢弃
    if (seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  return out.slice(0, cap);
}

// 对象数组规范化（{ content, date } 结构）
function normalizeNoteList(list, max) {
  if (!Array.isArray(list)) return [];
  const cap = max || NOTE_MAX;
  const out = [];
  (list || []).forEach((item) => {
    if (!item) return;
    const content = String(item.content || item.goal || '').trim();
    if (!content || detectSensitive(content)) return;
    const date = item.date || item.changed_at || '';
    out.push({ content, date: String(date || '') });
  });
  return out.slice(-cap); // 保留最新
}

// 结构归一化：缺失字段补默认、类型修正、敏感过滤
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
  out.body_response.feedback = normalizeNoteList(body.feedback, NOTE_MAX);

  const goals = m.goals || {};
  out.goals.current = detectSensitive(goals.current) ? '' : String(goals.current || '').slice(0, 50);
  out.goals.history = normalizeNoteList(goals.history, NOTE_MAX);
  out.goals.updated_at = String(goals.updated_at || '').slice(0, 20);

  out.ai_notes = normalizeNoteList(m.ai_notes, NOTE_MAX);
  return out;
}

/**
 * 获取当前用户的长期健身记忆；无文档返回默认空结构（不报错）
 * @returns {Promise<Object>} 规范化后的记忆结构
 */
async function getFitnessMemory() {
  const cached = cache.get(MEMORY_CACHE_KEY);
  if (cached !== null) return cached;

  try {
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}' })
      .limit(1)
      .get();
    const memory = res.data.length > 0 ? normalizeMemory(res.data[0]) : JSON.parse(JSON.stringify(EMPTY_MEMORY));
    cache.set(MEMORY_CACHE_KEY, memory, MEMORY_TTL);
    return memory;
  } catch (err) {
    console.error('[fitness-memory] getFitnessMemory 失败', err);
    // 集合未创建/查询失败：降级返回空结构，不影响功能
    return JSON.parse(JSON.stringify(EMPTY_MEMORY));
  }
}

/**
 * 保存（全量 upsert）长期记忆
 * @param {Object} memory 记忆结构（可只含部分区块，缺失区块保留默认）
 * @returns {Promise<Object>} 保存后的规范化记忆
 */
async function saveFitnessMemory(memory) {
  const existing = await getFitnessMemory(); // 用于合并未提供的区块（读缓存或库）
  const merged = Object.assign({}, existing, memory || {});
  const normalized = normalizeMemory(merged);
  const payload = {
    training_preferences: normalized.training_preferences,
    training_habits: normalized.training_habits,
    body_response: normalized.body_response,
    goals: normalized.goals,
    ai_notes: normalized.ai_notes,
    updated_at: db.serverDate()
  };
  try {
    const exist = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}' })
      .limit(1)
      .get();
    if (exist.data.length > 0) {
      await db.collection(COLLECTION).doc(exist.data[0]._id).update({ data: payload });
    } else {
      payload.created_at = db.serverDate();
      await db.collection(COLLECTION).add({ data: payload });
    }
  } catch (err) {
    console.error('[fitness-memory] saveFitnessMemory 失败', err);
    throw err;
  }
  invalidateMemoryCache();
  return normalized;
}

/**
 * 局部更新：替换某个区块（或追加 ai_notes / goals.history / body_response.feedback）
 * @param {Object} patch
 * @param {string} patch.section 区块名：training_preferences / training_habits / body_response / goals / ai_notes
 * @param {Object} [patch.data] 区块新内容（整体替换该区块）
 * @param {string} [patch.append] 追加内容（仅 ai_notes / body_response.feedback / goals.history 支持，追加 {content,date}）
 * @returns {Promise<Object>} 更新后的记忆
 */
async function updateFitnessMemory(patch) {
  const section = patch && patch.section;
  if (SECTIONS.indexOf(section) < 0) {
    throw new Error('未知记忆区块: ' + section);
  }
  const memory = await getFitnessMemory();
  if (section === 'ai_notes') {
    if (patch.append) {
      memory.ai_notes = memory.ai_notes.concat([{ content: String(patch.append).slice(0, 300), date: nowDateStr() }]);
    }
  } else if (section === 'goals' && patch.append && !patch.data) {
    // 追加历史目标（同时更新 current 与 updated_at）
    const content = String(patch.append).slice(0, 50);
    if (content) {
      const oldCurrent = memory.goals.current;
      if (oldCurrent && oldCurrent !== content) {
        memory.goals.history = memory.goals.history.concat([{ content: oldCurrent, date: memory.goals.updated_at || nowDateStr() }]);
      }
      memory.goals.current = content;
      memory.goals.updated_at = nowDateStr();
    }
  } else if (section === 'body_response' && patch.append && !patch.data) {
    memory.body_response.feedback = memory.body_response.feedback.concat([{ content: String(patch.append).slice(0, 300), date: nowDateStr() }]);
  } else {
    // 整体替换区块（白名单键）
    const data = patch.data || {};
    const allowed = SECTION_KEYS[section] || [];
    const clean = {};
    allowed.forEach((k) => {
      if (data[k] !== undefined) clean[k] = data[k];
    });
    memory[section] = Object.assign({}, memory[section], clean);
  }
  return saveFitnessMemory(memory);
}

// 当前日期字符串（本地时区）
function nowDateStr() {
  const d = new Date();
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/**
 * 删除长期记忆（整条）
 * @returns {Promise<boolean>}
 */
async function deleteFitnessMemory() {
  try {
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}' })
      .remove();
    invalidateMemoryCache();
    return res.stats.removed > 0;
  } catch (err) {
    console.error('[fitness-memory] deleteFitnessMemory 失败', err);
    throw err;
  }
}

module.exports = {
  getFitnessMemory,
  saveFitnessMemory,
  updateFitnessMemory,
  deleteFitnessMemory,
  normalizeMemory,
  EMPTY_MEMORY,
  SECTIONS
};
