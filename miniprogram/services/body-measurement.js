// services/body-measurement.js - 身体围度数据层（body_measurements）
// 记录：体脂率（可选）、腰围/胸围/臀围/手臂围/大腿围（cm）
// 口径：openid + date 每天一条（upsert）；同天重复保存为更新；历史可查/可删
// 安全：按 _openid 过滤
const { formatDate } = require('../utils/date');
const cache = require('../utils/cache');

const db = wx.cloud.database();
const COLLECTION = 'body_measurements';
const TTL = 5 * 60 * 1000;

const LATEST_KEY = 'body_measurements_latest';
const HISTORY_KEY = 'body_measurements_history';

function invalidate() {
  cache.remove(LATEST_KEY);
  cache.remove(HISTORY_KEY);
  cache.remove('archive_stats'); // 档案页聚合缓存（键名约定）
}

// 数值合法化：非负数，上限 200（防误输入）
function clampNum(v, max) {
  const n = Number(v);
  if (!n || n <= 0 || n > max) return null;
  return Math.round(n * 10) / 10;
}

/**
 * 获取最近一条围度记录（无返回 null）
 */
async function getLatest() {
  const cached = cache.get(LATEST_KEY);
  if (cached !== null) return cached;
  try {
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}' })
      .orderBy('date', 'desc')
      .limit(1)
      .get();
    const rec = res.data.length > 0 ? res.data[0] : null;
    cache.set(LATEST_KEY, rec, TTL);
    return rec;
  } catch (err) {
    console.error('[body-measurement] getLatest 失败', err);
    return null;
  }
}

/**
 * 按日期获取（编辑/校验用）
 */
async function getByDate(date) {
  try {
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}', date })
      .limit(1)
      .get();
    return res.data.length > 0 ? res.data[0] : null;
  } catch (err) {
    return null;
  }
}

/**
 * 保存（upsert）某日围度
 * @param {Object} data { date, body_fat_pct, waist_cm, chest_cm, hip_cm, arm_cm, thigh_cm }
 */
async function save(data) {
  const date = data.date || formatDate(new Date());
  const payload = {
    date,
    body_fat_pct: clampNum(data.body_fat_pct, 60),
    waist_cm: clampNum(data.waist_cm, 200),
    chest_cm: clampNum(data.chest_cm, 200),
    hip_cm: clampNum(data.hip_cm, 200),
    arm_cm: clampNum(data.arm_cm, 200),
    thigh_cm: clampNum(data.thigh_cm, 200),
    updated_at: db.serverDate()
  };
  const exist = await db
    .collection(COLLECTION)
    .where({ _openid: '{openid}', date })
    .limit(1)
    .get();
  if (exist.data.length > 0) {
    await db.collection(COLLECTION).doc(exist.data[0]._id).update({ data: payload });
  } else {
    payload.created_at = db.serverDate();
    await db.collection(COLLECTION).add({ data: payload });
  }
  invalidate();
  return payload;
}

/**
 * 删除某日围度
 */
async function remove(date) {
  await db
    .collection(COLLECTION)
    .where({ _openid: '{openid}', date })
    .remove();
  invalidate();
}

/**
 * 围度历史（倒序）
 */
async function getHistory(limit) {
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
    cache.set(key, res.data, TTL);
    return res.data;
  } catch (err) {
    return [];
  }
}

module.exports = {
  getLatest,
  getByDate,
  save,
  remove,
  getHistory
};
