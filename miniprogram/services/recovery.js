// services/recovery.js - 每日身体状态记录数据层（recovery_records）
// 职责：
//   1. 每日恢复状态记录（每天 1 条，upsert）：睡眠质量 / 疲劳程度 / 肌肉酸痛 / 训练意愿 / 今日身体状态 / 备注
//   2. 按日期查询 / 修改 / 删除 / 历史查询
// 口径：
//   - 唯一键：openid + date（YYYY-MM-DD）→ 同一天重复保存为更新，不产生重复文档
//   - 所有评分 1-5 整数（1 差 / 5 好；疲劳、酸痛、意愿按各自语义）
//   - 日期隔离：getTodayRecovery 只查今天，历史互不影响
// 安全：所有查询按 _openid 过滤（'{openid}' 自动替换）
// 性能：今日/历史/近 N 天各缓存 5 分钟；保存/删除后立即失效
const { formatDate } = require('../utils/date');
const cache = require('../utils/cache');

const db = wx.cloud.database();
const COLLECTION = 'recovery_records';
const RECOVERY_TTL = 5 * 60 * 1000;

// 缓存键
const TODAY_KEY = 'recovery_today';
const HISTORY_KEY = 'recovery_history';
const RECENT_KEY = 'recovery_recent';

function invalidateRecoveryCache() {
  cache.remove(TODAY_KEY);
  cache.remove(HISTORY_KEY);
  cache.remove(RECENT_KEY);
  // 首页「今日建议」聚合缓存一并失效（键名约定，避免跨模块依赖）
  cache.remove('home_advice');
}

// 评分合法化：1-5 整数，非法返回默认值
function clampScore(v, def) {
  const n = Math.round(Number(v));
  if (!n || n < 1 || n > 5) return def;
  return n;
}

/**
 * 获取今日恢复记录；未记录返回 null
 * @returns {Promise<Object|null>}
 */
async function getTodayRecovery() {
  const cached = cache.get(TODAY_KEY);
  if (cached !== null) return cached;

  try {
    const date = formatDate(new Date());
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}', date })
      .limit(1)
      .get();
    const rec = res.data.length > 0 ? res.data[0] : null;
    cache.set(TODAY_KEY, rec, RECOVERY_TTL);
    return rec;
  } catch (err) {
    console.error('[recovery] getTodayRecovery 失败', err);
    return null; // 集合未创建等错误静默降级，不阻塞首页
  }
}

/**
 * 按日期获取恢复记录
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<Object|null>}
 */
async function getRecoveryByDate(date) {
  try {
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}', date })
      .limit(1)
      .get();
    return res.data.length > 0 ? res.data[0] : null;
  } catch (err) {
    console.error('[recovery] getRecoveryByDate 失败', err);
    return null;
  }
}

/**
 * 保存（更新或新增）某日恢复记录
 * 同一天已存在则更新；不存在则新增
 * @param {Object} data { date, sleep_quality, fatigue, soreness, motivation, body_status, note }
 * @returns {Promise<Object>} { id, inserted }
 */
async function saveRecovery(data) {
  const date = data.date || formatDate(new Date());
  const payload = {
    date,
    sleep_quality: clampScore(data.sleep_quality, 3),
    fatigue: clampScore(data.fatigue, 3),
    soreness: clampScore(data.soreness, 3),
    motivation: clampScore(data.motivation, 3),
    body_status: clampScore(data.body_status, 3),
    note: String(data.note || '').slice(0, 200),
    updated_at: db.serverDate()
  };
  try {
    const exist = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}', date })
      .limit(1)
      .get();
    if (exist.data.length > 0) {
      await db.collection(COLLECTION).doc(exist.data[0]._id).update({ data: payload });
      invalidateRecoveryCache();
      return { id: exist.data[0]._id, inserted: false };
    }
    payload.created_at = db.serverDate();
    const res = await db.collection(COLLECTION).add({ data: payload });
    invalidateRecoveryCache();
    return { id: res._id, inserted: true };
  } catch (err) {
    console.error('[recovery] saveRecovery 失败', err);
    throw err;
  }
}

/**
 * 删除某日恢复记录
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteRecovery(date) {
  try {
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}', date })
      .remove();
    invalidateRecoveryCache();
    return res.stats.removed > 0;
  } catch (err) {
    console.error('[recovery] deleteRecovery 失败', err);
    throw err;
  }
}

/**
 * 恢复记录历史（倒序）
 * @param {number} [limit] 最大条数，默认 30
 * @returns {Promise<Array>}
 */
async function getRecoveryHistory(limit) {
  const n = Math.min(60, Math.max(1, Number(limit) || 30));
  const key = HISTORY_KEY + '_' + n;
  const cached = cache.get(key);
  if (cached !== null) return cached;

  try {
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}' })
      .orderBy('date', 'desc')
      .limit(n)
      .get();
    cache.set(key, res.data, RECOVERY_TTL);
    return res.data;
  } catch (err) {
    console.error('[recovery] getRecoveryHistory 失败', err);
    return [];
  }
}

/**
 * 最近 N 天恢复记录（升序，供训练状态分析）
 * @param {number} [days] 天数，默认 14
 * @returns {Promise<Array>}
 */
async function getRecentRecovery(days) {
  const n = Math.min(60, Math.max(1, Number(days) || 14));
  const key = RECENT_KEY + '_' + n;
  const cached = cache.get(key);
  if (cached !== null) return cached;

  try {
    const start = formatDate(new Date(Date.now() - (n - 1) * 24 * 60 * 60 * 1000));
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}', date: db.command.gte(start) })
      .orderBy('date', 'asc')
      .limit(60)
      .get();
    cache.set(key, res.data, RECOVERY_TTL);
    return res.data;
  } catch (err) {
    console.error('[recovery] getRecentRecovery 失败', err);
    return [];
  }
}

module.exports = {
  getTodayRecovery,
  getRecoveryByDate,
  saveRecovery,
  deleteRecovery,
  getRecoveryHistory,
  getRecentRecovery
};
