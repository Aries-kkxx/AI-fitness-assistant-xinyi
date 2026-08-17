// services/water.js - 饮水业务数据层
// 职责：封装 water_settings / water_records 两个集合的全部云数据库操作
// 安全：所有查询显式按 _openid 过滤（'{openid}' 会被云开发自动替换为当前用户 openid），
//       配合云开发控制台集合权限「仅创建者可读写」，保证用户只能访问自己的数据
// 错误处理：所有操作 catch 后 console.error 并向上抛错，由页面统一提示用户

const { formatDate } = require('../utils/date');

const db = wx.cloud.database();

// 集合名称（需先在云开发控制台手动创建）
const SETTINGS_COLLECTION = 'water_settings';
const RECORDS_COLLECTION = 'water_records';

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
  try {
    const res = await db
      .collection(SETTINGS_COLLECTION)
      .where({ _openid: '{openid}' })
      .limit(1)
      .get();
    if (res.data.length > 0) {
      return res.data[0];
    }
    // 首次使用：写入默认设置（8 杯 × 250ml = 2000ml）
    const now = db.serverDate();
    const defaults = Object.assign({}, DEFAULT_SETTINGS, {
      created_at: now,
      updated_at: now
    });
    const addRes = await db.collection(SETTINGS_COLLECTION).add({ data: defaults });
    return Object.assign({ _id: addRes._id }, defaults);
  } catch (err) {
    console.error('[water] getSettings 失败', err);
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
    return { daily_cups: cups, cup_ml: ml, daily_target_ml: dailyTargetMl };
  } catch (err) {
    console.error('[water] saveSettings 失败', err);
    throw err;
  }
}

/**
 * 新增一条饮水记录
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
    const res = await db.collection(RECORDS_COLLECTION).add({
      data: {
        drink_time,
        amount_ml: ml,
        drink_type,
        remark,
        date,
        created_at: db.serverDate()
      }
    });
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

    return {
      total,
      cups,
      target,
      percent,
      remain,
      dailyCups: settings.daily_cups,
      cupMl: settings.cup_ml
    };
  } catch (err) {
    console.error('[water] getTodayStats 失败', err);
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
  getTodayStats
};
