// services/weight.js - 体重记录数据层
// 职责：weight_records 集合的增删查 + 统计（当前体重 / 30天变化 / 曲线数据）
// 安全：所有查询按 _openid 过滤（'{openid}' 自动替换为当前用户 openid）
// 设计：同一天多次记录会更新当天记录（体重一天只有一个值，避免曲线出现同点重复）
// 性能：统计结果缓存 1 小时（记录/删除体重后立即失效）
const { formatDate } = require('../utils/date');
const { getAllByWhere } = require('../utils/db');
const cache = require('../utils/cache');

const db = wx.cloud.database();
const _ = db.command;
const COLLECTION = 'weight_records';

// 体重合法范围（kg）
const MIN_WEIGHT = 20;
const MAX_WEIGHT = 300;

// 缓存键与有效期
const STATS_CACHE_KEY = 'weight_stats';
const RANGE_CACHE_KEY = 'weight_range';
const CACHE_TTL = 60 * 60 * 1000; // 1 小时

// 记录/删除后失效缓存
function invalidateWeightCache() {
  cache.remove(STATS_CACHE_KEY);
  cache.remove(RANGE_CACHE_KEY);
}

/**
 * 记录体重：同一天重复记录则更新当天记录
 * @param {number} weightKg 体重（kg）
 * @returns {Promise<Object>} { id, date, weight_kg }
 */
async function addWeightRecord(weightKg) {
  const w = Number(weightKg);
  if (!w || w < MIN_WEIGHT || w > MAX_WEIGHT) {
    throw new Error('体重需在 ' + MIN_WEIGHT + '-' + MAX_WEIGHT + 'kg 之间');
  }
  const weight = Math.round(w * 10) / 10; // 保留 1 位小数
  const date = formatDate(new Date());

  const exist = await db
    .collection(COLLECTION)
    .where({ _openid: '{openid}', date })
    .limit(1)
    .get();

  if (exist.data.length > 0) {
    await db.collection(COLLECTION).doc(exist.data[0]._id).update({
      data: { weight_kg: weight, updated_at: db.serverDate() }
    });
    invalidateWeightCache();
    return { id: exist.data[0]._id, date, weight_kg: weight };
  }

  const res = await db.collection(COLLECTION).add({
    data: {
      weight_kg: weight,
      date,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  invalidateWeightCache();
  return { id: res._id, date, weight_kg: weight };
}

/**
 * 查询最近 N 天的体重记录（升序，用于曲线）
 * @param {number} days 窗口天数，默认 30
 * @returns {Promise<Array>} [{ _id, date, weight }]
 */
async function getWeightHistory(days = 30) {
  const start = formatDate(new Date(Date.now() - (days - 1) * 86400000));
  const res = await db
    .collection(COLLECTION)
    .where({ _openid: '{openid}', date: _.gte(start) })
    .orderBy('date', 'asc')
    .get();
  return res.data.map((r) => ({ _id: r._id, date: r.date, weight: r.weight_kg }));
}

/**
 * 体重统计：当前体重 + 窗口内变化量（最早 vs 最新）+ 曲线数据
 * 性能：缓存 1 小时（记录/删除体重后自动失效）
 * @param {number} days 窗口天数，默认 30
 * @returns {Promise<Object>} { hasData, current, delta, records, days }
 *   delta 为窗口内体重变化（负数=下降），仅一条记录时为 null
 */
async function getWeightStats(days = 30) {
  const cached = cache.get(STATS_CACHE_KEY);
  if (cached) return cached;

  const records = await getWeightHistory(days);
  let result;
  if (records.length === 0) {
    result = { hasData: false, current: null, delta: null, records: [], days };
  } else {
    const current = records[records.length - 1].weight;
    const baseline = records[0].weight;
    const delta = records.length > 1 ? Math.round((current - baseline) * 10) / 10 : null;
    result = { hasData: true, current, delta, records, days };
  }
  cache.set(STATS_CACHE_KEY, result, CACHE_TTL);
  return result;
}

/**
 * 体重累计变化：全部记录中最早一条 vs 最新一条（如 82kg → 80kg）
 * 性能：缓存 1 小时（记录/删除体重后自动失效）
 * @returns {Promise<Object>} { hasData, first, last, count } 或 { hasData: false }
 */
async function getWeightRange() {
  const cached = cache.get(RANGE_CACHE_KEY);
  if (cached) return cached;

  const records = await getAllByWhere(
    COLLECTION,
    { _openid: '{openid}' },
    { orderField: 'date', orderDir: 'asc', max: 500 }
  );
  let result;
  if (records.length === 0) {
    result = { hasData: false };
  } else {
    result = {
      hasData: true,
      first: records[0].weight_kg,
      last: records[records.length - 1].weight_kg,
      count: records.length
    };
  }
  cache.set(RANGE_CACHE_KEY, result, CACHE_TTL);
  return result;
}

/**
 * 删除一条体重记录（where 同时限定 _openid，防止越权）
 * @param {string} id 记录 _id
 */
async function deleteWeightRecord(id) {
  await db
    .collection(COLLECTION)
    .where({ _id: id, _openid: '{openid}' })
    .remove();
  invalidateWeightCache();
}

module.exports = {
  addWeightRecord,
  getWeightHistory,
  getWeightStats,
  getWeightRange,
  deleteWeightRecord
};
