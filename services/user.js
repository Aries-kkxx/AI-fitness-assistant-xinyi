// services/user.js - 用户数据层
// 职责：users 集合的读取与保存
// 安全：所有查询按 _openid 过滤（'{openid}' 自动替换为当前用户 openid），
//       配合集合权限「仅创建者可读写」保证用户数据隔离
// 性能：用户资料变更频率低，缓存 10 分钟，页面切换秒开；保存资料后立即失效
const cache = require('../utils/cache');

const COLLECTION = 'users';

// 懒加载云数据库实例：本模块被 exercise.js 等多个服务在顶层 require，
// 执行时机可能早于 App.onLaunch 中的 wx.cloud.init()，因此不能在模块加载时
// 调用 wx.cloud.database()，必须惰性获取。
let _db = null;
function getDB() {
  if (!_db) _db = wx.cloud.database();
  return _db;
}

const USER_CACHE_KEY = 'user';
const USER_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

/**
 * 获取当前用户资料；未填写过返回 null
 * 优先读缓存（10 分钟内秒开），缓存过期或不存在才查数据库
 * @returns {Promise<Object|null>} 用户文档或 null
 */
async function getUser() {
  // 缓存命中直接返回（仅缓存非 null 用户）
  const cached = cache.get(USER_CACHE_KEY);
  if (cached) return cached;

  try {
    const res = await getDB()
      .collection(COLLECTION)
      .where({ _openid: '{openid}' })
      .limit(1)
      .get();
    const user = res.data.length > 0 ? res.data[0] : null;
    if (user) {
      cache.set(USER_CACHE_KEY, user, USER_CACHE_TTL);
    }
    return user;
  } catch (err) {
    console.error('[user] getUser 失败', err);
    // 查询失败时回退到过期缓存（如有），保证页面可用
    const stale = cache.get(USER_CACHE_KEY);
    if (stale) return stale;
    throw err;
  }
}

/**
 * 保存用户资料（已存在则更新，不存在则新增）
 * @param {Object} data 用户资料字段（nickname/gender/age/height/weight/goal/experience/training_days/training_duration/equipment）
 * @returns {Promise<string>} 文档 _id
 */
async function saveUser(data) {
  try {
    const existing = await getUser();
    const payload = Object.assign({}, data, { updated_at: getDB().serverDate() });
    if (existing) {
      await getDB().collection(COLLECTION).doc(existing._id).update({ data: payload });
    } else {
      payload.created_at = getDB().serverDate();
      await getDB().collection(COLLECTION).add({ data: payload });
    }
    // 资料已变：立即失效缓存
    cache.remove(USER_CACHE_KEY);
    return existing ? existing._id : '';
  } catch (err) {
    console.error('[user] saveUser 失败', err);
    throw err;
  }
}

module.exports = {
  getUser,
  saveUser
};
