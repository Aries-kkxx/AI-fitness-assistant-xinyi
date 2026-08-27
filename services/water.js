// services/water.js - 饮水业务数据层
// 职责：封装 water_settings / water_records 两个集合的全部云数据库操作
// 安全：所有查询显式按 _openid 过滤（'{openid}' 会被云开发自动替换为当前用户 openid），
//       配合云开发控制台集合权限「仅创建者可读写」，保证用户只能访问自己的数据
// 错误处理：所有操作 catch 后 console.error 并向上抛错，由页面统一提示用户

const { formatDate, getMonthStartDate } = require('../utils/date');
const { getAllByWhere } = require('../utils/db');
const cache = require('../utils/cache');

const db = wx.cloud.database();
const _ = db.command;

// 集合名称（需先在云开发控制台手动创建）
const SETTINGS_COLLECTION = 'water_settings';
const RECORDS_COLLECTION = 'water_records';

// 缓存键与有效期
const SETTINGS_CACHE_KEY = 'water_settings';
const SETTINGS_CACHE_TTL = 60 * 60 * 1000; // 1 小时
const MONTH_CACHE_KEY = 'water_month'; // 月统计
const MONTH_CACHE_TTL = 60 * 60 * 1000; // 1 小时
const HISTORY_CACHE_KEY = 'water_history'; // 历史汇总
const HISTORY_CACHE_TTL = 60 * 60 * 1000; // 1 小时

// 今日统计缓存键（含日期，跨天自动失效）
function todayCacheKey() {
  return 'water_today_' + formatDate(new Date());
}

// 新增/删除记录后失效相关缓存（保证数据实时准确）
function invalidateWaterCache() {
  cache.remove(todayCacheKey());
  cache.remove(MONTH_CACHE_KEY);
  cache.remove(HISTORY_CACHE_KEY);
}

// 首次使用的默认设置：8 杯 × 250ml = 2000ml/天
const DEFAULT_SETTINGS = {
  daily_cups: 8,
  cup_ml: 250,
  daily_target_ml: 2000
};

// 饮水类型可选值（与页面 picker 保持一致）
const DRINK_TYPES = ['白水', '温水', '茶', '其他'];

/**
 * 获取当前用户的饮水设置；首次使用自动创建默认设置
 * @returns {Promise<Object>} 设置文档
 */
async function getSettings() {
  // 缓存命中直接返回（设置变更频率低）
  const cached = cache.get(SETTINGS_CACHE_KEY);
  if (cached) return cached;

  try {
    const res = await db
      .collection(SETTINGS_COLLECTION)
      .where({ _openid: '{openid}' })
      .limit(1)
      .get();
    if (res.data.length > 0) {
      cache.set(SETTINGS_CACHE_KEY, res.data[0], SETTINGS_CACHE_TTL);
      return res.data[0];
    }
    // 首次使用：写入默认设置（8 杯 × 250ml = 2000ml）
    const now = db.serverDate();
    const defaults = Object.assign({}, DEFAULT_SETTINGS, {
      created_at: now,
      updated_at: now
    });
    const addRes = await db.collection(SETTINGS_COLLECTION).add({ data: defaults });
    const result = Object.assign({ _id: addRes._id }, defaults);
    cache.set(SETTINGS_CACHE_KEY, result, SETTINGS_CACHE_TTL);
    return result;
  } catch (err) {
    console.error('[water] getSettings 失败', err);
    const stale = cache.get(SETTINGS_CACHE_KEY);
    if (stale) return stale;
    throw err;
  }
}

/**
 * 保存饮水设置：每天杯数、每杯容量，自动计算每日目标（杯数 × 容量）
 * @param {Object} param
 * @param {number} param.daily_cups 每天杯数（1-30）
 * @param {number} param.cup_ml 每杯容量 ml（50-1000）
 * @returns {Promise<Object>} 保存后的设置
 */
async function saveSettings({ daily_cups, cup_ml }) {
  try {
    const cups = Number(daily_cups);
    const ml = Number(cup_ml);
    if (!cups || cups < 1 || cups > 30) {
      throw new Error('每天杯数需在 1-30 之间');
    }
    if (!ml || ml < 50 || ml > 1000) {
      throw new Error('每杯容量需在 50-1000ml 之间');
    }
    const dailyTargetMl = cups * ml;
    const settings = await getSettings();
    await db.collection(SETTINGS_COLLECTION).doc(settings._id).update({
      data: {
        daily_cups: cups,
        cup_ml: ml,
        daily_target_ml: dailyTargetMl,
        updated_at: db.serverDate()
      }
    });
    // 设置已变：失效设置/统计缓存
    cache.remove(SETTINGS_CACHE_KEY);
    invalidateWaterCache();
    return { daily_cups: cups, cup_ml: ml, daily_target_ml: dailyTargetMl };
  } catch (err) {
    console.error('[water] saveSettings 失败', err);
    throw err;
  }
}

/**
 * 新增一条饮水记录
 * 同时快照当时的每日目标（daily_target_ml），用于历史日期统计时还原当日目标
 * @param {Object} param
 * @param {string} param.drink_time 饮水时间 'HH:mm'
 * @param {number} param.amount_ml 饮水量 ml
 * @param {string} param.drink_type 饮水类型（白水/温水/茶/其他）
 * @param {string} param.remark 备注
 * @returns {Promise<string>} 新记录 _id
 */
async function addRecord({ drink_time, amount_ml, drink_type = '白水', remark = '' }) {
  try {
    const ml = Number(amount_ml);
    if (!ml || ml <= 0) {
      throw new Error('饮水量必须大于 0');
    }
    const date = formatDate(new Date());
    // 快照当前目标（历史日期统计用；旧记录无此字段时回退当前设置）
    const settings = await getSettings();
    const res = await db.collection(RECORDS_COLLECTION).add({
      data: {
        drink_time,
        amount_ml: ml,
        drink_type,
        remark,
        date,
        daily_target_ml: settings.daily_target_ml || DEFAULT_SETTINGS.daily_target_ml,
        daily_cups: settings.daily_cups || DEFAULT_SETTINGS.daily_cups,
        created_at: db.serverDate()
      }
    });
    invalidateWaterCache(); // 新增记录：统计缓存失效
    return res._id;
  } catch (err) {
    console.error('[water] addRecord 失败', err);
    throw err;
  }
}

/**
 * 删除一条饮水记录（where 同时限定 _openid，防止越权删除他人数据）
 * @param {string} id 记录 _id
 */
async function deleteRecord(id) {
  try {
    await db
      .collection(RECORDS_COLLECTION)
      .where({ _id: id, _openid: '{openid}' })
      .remove();
    invalidateWaterCache(); // 删除记录：统计缓存失效
  } catch (err) {
    console.error('[water] deleteRecord 失败', err);
    throw err;
  }
}

/**
 * 查询今日饮水记录（按时间正序）
 * @returns {Promise<Array>} 记录数组
 */
async function getTodayRecords() {
  try {
    const date = formatDate(new Date());
    const res = await db
      .collection(RECORDS_COLLECTION)
      .where({ _openid: '{openid}', date })
      .orderBy('drink_time', 'asc')
      .get();
    return res.data;
  } catch (err) {
    console.error('[water] getTodayRecords 失败', err);
    throw err;
  }
}

/**
 * 今日饮水统计
 * @returns {Promise<Object>} { total, cups, target, percent, remain, dailyCups, cupMl }
 */
async function getTodayStats() {
  // 今日统计缓存（当天内秒开；喝水/删除后自动失效）
  const key = todayCacheKey();
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const settings = await getSettings();
    const records = await getTodayRecords();

    let total = 0;
    records.forEach((r) => {
      total += r.amount_ml;
    });

    const cups = records.length;
    const target = settings.daily_target_ml || DEFAULT_SETTINGS.daily_target_ml;
    const percent = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
    const remain = Math.max(0, target - total);

    const result = {
      total,
      cups,
      target,
      percent,
      remain,
      dailyCups: settings.daily_cups,
      cupMl: settings.cup_ml
    };
    cache.set(key, result, 24 * 60 * 60 * 1000);
    return result;
  } catch (err) {
    console.error('[water] getTodayStats 失败', err);
    throw err;
  }
}

/**
 * 本月饮水统计：本月总量 + 日均（按本月已过天数平均）
 * @returns {Promise<Object>} { monthTotal, monthDays, avgPerDay }
 */
async function getMonthStats() {
  const cached = cache.get(MONTH_CACHE_KEY);
  if (cached) return cached;

  try {
    const monthStart = getMonthStartDate(new Date());
    const records = await getAllByWhere(
      RECORDS_COLLECTION,
      { _openid: '{openid}', date: _.gte(monthStart) },
      { max: 500 }
    );
    let monthTotal = 0;
    records.forEach((r) => {
      monthTotal += r.amount_ml || 0;
    });
    const monthDays = new Date().getDate(); // 本月已过天数（含今天）
    const avgPerDay = monthDays > 0 ? Math.round(monthTotal / monthDays) : 0;
    const result = { monthTotal, monthDays, avgPerDay };
    cache.set(MONTH_CACHE_KEY, result, MONTH_CACHE_TTL);
    return result;
  } catch (err) {
    console.error('[water] getMonthStats 失败', err);
    throw err;
  }
}

/**
 * 查询某天饮水记录（按时间正序）
 * @param {string} date 日期 YYYY-MM-DD
 * @returns {Promise<Array>} 记录数组
 */
async function getRecordsByDate(date) {
  try {
    const res = await db
      .collection(RECORDS_COLLECTION)
      .where({ _openid: '{openid}', date })
      .orderBy('drink_time', 'asc')
      .get();
    return res.data;
  } catch (err) {
    console.error('[water] getRecordsByDate 失败', err);
    throw err;
  }
}

// 完成状态分档：
//   >=100% → 已完成
//   当天未达标 → 进行中（当天还在记录中，允许继续喝）
//   已过去的日期未达标 → 未完成（当天已结束，没达到就是没完成）
function calcStatus(rate, date) {
  if (rate >= 100) return '已完成';
  const today = formatDate(new Date());
  if (date === today) return '进行中';
  return '未完成';
}

/**
 * 某一天饮水统计（详情页/删除后重算用）
 * @param {string} date 日期 YYYY-MM-DD
 * @returns {Promise<Object>} { date, records, total, cups, target, targetCups, rate, status }
 *   目标水量：优先取当天记录的快照 daily_target_ml，无快照回退当前设置
 */
async function getDateStats(date) {
  try {
    const records = await getRecordsByDate(date);
    const settings = await getSettings();
    const currentTarget = settings.daily_target_ml || DEFAULT_SETTINGS.daily_target_ml;
    const currentCups = settings.daily_cups || DEFAULT_SETTINGS.daily_cups;

    let total = 0;
    let target = null;
    let targetCups = null;
    records.forEach((r) => {
      total += r.amount_ml || 0;
      if (target == null && r.daily_target_ml) {
        target = r.daily_target_ml;
      }
      if (targetCups == null && r.daily_cups) {
        targetCups = r.daily_cups;
      }
    });
    const t = target || currentTarget;
    const tc = targetCups || currentCups;
    const rate = t > 0 ? Math.round((total / t) * 100) : 0;

    return {
      date,
      records,
      total,
      cups: records.length,
      target: t,
      targetCups: tc,
      rate,
      status: calcStatus(rate, date)
    };
  } catch (err) {
    console.error('[water] getDateStats 失败', err);
    throw err;
  }
}

/**
 * 历史饮水汇总：全部记录按日期分组统计，日期倒序
 * 每日：total_ml / cup_count / target_ml（当天快照，无则当前设置）/ completion_rate / status
 * @returns {Promise<Array>} 汇总数组（最新日期在前）
 */
async function getHistorySummary() {
  const cached = cache.get(HISTORY_CACHE_KEY);
  if (cached) return cached;

  try {
    const records = await getAllByWhere(
      RECORDS_COLLECTION,
      { _openid: '{openid}' },
      { max: 2000 }
    );
    if (records.length === 0) {
      return [];
    }
    const settings = await getSettings();
    const currentTarget = settings.daily_target_ml || DEFAULT_SETTINGS.daily_target_ml;
    const currentCups = settings.daily_cups || DEFAULT_SETTINGS.daily_cups;

    // 按日期分组
    const groups = {};
    records.forEach((r) => {
      if (!r.date) return;
      if (!groups[r.date]) {
        groups[r.date] = { total: 0, cups: 0, target: null, targetCups: null };
      }
      groups[r.date].total += r.amount_ml || 0;
      groups[r.date].cups++;
      // 目标快照：取当天第一条带快照字段的记录
      if (groups[r.date].target == null && r.daily_target_ml) {
        groups[r.date].target = r.daily_target_ml;
      }
      if (groups[r.date].targetCups == null && r.daily_cups) {
        groups[r.date].targetCups = r.daily_cups;
      }
    });

    // 日期倒序（YYYY-MM-DD 字典序 = 时间序，reverse 后最新在前）
    const list = Object.keys(groups)
      .sort()
      .reverse()
      .map((date) => {
        const g = groups[date];
        const target = g.target || currentTarget;
        const targetCups = g.targetCups || currentCups;
        const rate = target > 0 ? Math.round((g.total / target) * 100) : 0;
        return {
          date,
          total: g.total,
          cups: g.cups,
          target,
          targetCups,
          rate,
          status: calcStatus(rate, date)
        };
      });
    cache.set(HISTORY_CACHE_KEY, list, HISTORY_CACHE_TTL);
    return list;
  } catch (err) {
    console.error('[water] getHistorySummary 失败', err);
    throw err;
  }
}

module.exports = {
  DRINK_TYPES,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  addRecord,
  deleteRecord,
  getTodayRecords,
  getTodayStats,
  getMonthStats,
  getRecordsByDate,
  getDateStats,
  getHistorySummary
};
