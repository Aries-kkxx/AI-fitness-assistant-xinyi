// services/exercise.js - 动作库数据层
// 职责：exercises 集合的查询 + 首次初始化导入（幂等）+ 推荐过滤
// 注意：exercises 是公共数据（非用户数据），集合权限需设为「所有用户可读，仅创建者可读写」，
//       因此查询不带 _openid 过滤
// 性能：动作库内容相对固定，全部动作缓存 24 小时；初始化标记避免每次启动都查库
const seedExercises = require('../data/exercises');
const cache = require('../utils/cache');

const COLLECTION = 'exercises';
// 小程序端单次查询上限
const MAX_PER_GET = 20;

// 缓存键
const ALL_CACHE_KEY = 'exercises_all';
const ALL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小时
const INIT_FLAG_KEY = 'exercises_init_done';

// 注意：本模块会被 app.js 在顶层 require（执行时机早于 App.onLaunch 中的 wx.cloud.init()），
// 因此不能在模块加载时调用 wx.cloud.database()，必须惰性获取（在函数被调用时获取，
// 此时 onLaunch 已完成初始化）
let db = null;
function getDb() {
  if (!db) {
    db = wx.cloud.database();
  }
  return db;
}

/**
 * 首次初始化动作库：集合为空时导入种子数据（幂等，已有数据则跳过）
 * 性能：初始化成功后写本地标记，后续启动直接跳过 count 查询
 * 注意：若在控制台手动清空了 exercises 集合，需要清除本地缓存
 * （删除 storage 中 cache_exercises_all 与 exercises_init_done）才会重新导入
 */
async function initExercisesIfEmpty() {
  try {
    if (wx.getStorageSync(INIT_FLAG_KEY)) {
      return; // 已初始化过，跳过数据库查询
    }
    const countRes = await getDb().collection(COLLECTION).count();
    if (countRes.total > 0) {
      wx.setStorageSync(INIT_FLAG_KEY, true);
      return;
    }
    // 串行逐条导入（小程序端单次 add 一条，串行避免并发超限）
    for (const ex of seedExercises) {
      await getDb().collection(COLLECTION).add({
        data: Object.assign({}, ex, {
          created_at: getDb().serverDate(),
          updated_at: getDb().serverDate()
        })
      });
    }
    wx.setStorageSync(INIT_FLAG_KEY, true);
    console.log('[exercise] 动作库初始化完成，共导入 ' + seedExercises.length + ' 条');
  } catch (err) {
    console.error('[exercise] 动作库初始化失败', err);
  }
}

/**
 * 手动清除动作库缓存（控制台更新数据后调用，可选）
 */
function clearExerciseCache() {
  cache.remove(ALL_CACHE_KEY);
  try {
    wx.removeStorageSync(INIT_FLAG_KEY);
  } catch (err) {
    // 忽略
  }
}

/**
 * 翻页获取全部动作（小程序端单次最多 20 条，这里取完）
 * 性能：结果缓存 24 小时（动作库内容相对固定）
 * @returns {Promise<Array>} 全部动作（按 sort 升序）
 */
async function getAll() {
  const cached = cache.get(ALL_CACHE_KEY);
  if (cached) return cached;

  const all = [];
  let skip = 0;
  while (true) {
    const res = await getDb()
      .collection(COLLECTION)
      .where({})
      .orderBy('sort', 'asc')
      .skip(skip)
      .limit(MAX_PER_GET)
      .get();
    all.push.apply(all, res.data);
    if (res.data.length < MAX_PER_GET) break;
    skip += MAX_PER_GET;
    if (skip >= 500) break; // 安全上限
  }
  cache.set(ALL_CACHE_KEY, all, ALL_CACHE_TTL);
  return all;
}

/**
 * 按分类查询动作（分类为空时返回全部动作）
 * @param {string} category 分类名（胸部/背部/肩部/手臂/腿部/臀部/核心/有氧/拉伸），可空
 * @returns {Promise<Array>} 动作数组（按 sort 升序）
 */
async function getByCategory(category) {
  if (!category) {
    return getAll();
  }
  const res = await getDb()
    .collection(COLLECTION)
    .where({ category })
    .orderBy('sort', 'asc')
    .get();
  return res.data;
}

/**
 * 按 _id 批量查询动作（去重，分批查询，保留传入顺序）
 * @param {Array<string>} ids 动作 _id 列表
 * @returns {Promise<Array>} 动作数组（按 ids 顺序）
 */
async function getExercisesByIds(ids) {
  const uniqueIds = [];
  const seen = {};
  (ids || []).forEach((id) => {
    if (id && !seen[id]) {
      seen[id] = true;
      uniqueIds.push(id);
    }
  });
  if (uniqueIds.length === 0) return [];

  const _ = getDb().command;
  const map = {};
  // 分批查询（每批 20）
  for (let i = 0; i < uniqueIds.length; i += MAX_PER_GET) {
    const batch = uniqueIds.slice(i, i + MAX_PER_GET);
    const res = await getDb().collection(COLLECTION).where({ _id: _.in(batch) }).get();
    res.data.forEach((e) => {
      map[e._id] = e;
    });
  }
  return uniqueIds.map((id) => map[id]).filter(Boolean);
}

/**
 * 推荐动作：按用户资料（器械兼容 + 经验难度等级）从动作库过滤
 * @returns {Promise<Object|null>} { list, user }；未填写资料返回 null
 */
async function getRecommended() {
  // 惰性 require，避免模块加载时序问题
  const userService = require('./user');
  const recommend = require('./recommend');
  const user = await userService.getUser();
  if (!user) return null;

  const maxLevel = recommend.EXP_LEVEL[user.experience] || 2;
  const allowedEquipment = recommend.EQUIPMENT_COMPAT[user.equipment] || ['无器械'];
  const all = await getAll();
  const list = all.filter((e) => {
    if (allowedEquipment.indexOf(e.equipment) < 0) return false;
    if ((recommend.DIFF_LEVEL[e.difficulty] || 2) > maxLevel) return false;
    return true;
  });
  return { list, user };
}

module.exports = {
  initExercisesIfEmpty,
  getByCategory,
  getAll,
  getExercisesByIds,
  getRecommended,
  clearExerciseCache
};
