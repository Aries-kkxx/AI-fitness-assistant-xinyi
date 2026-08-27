// utils/cache.js - 本地缓存工具
// 作用：为高频数据（用户资料/今日训练/统计等）提供带过期时间的本地缓存，
//       减少云数据库查询次数，提升页面切换与启动速度。
// 原则：缓存是性能优化手段，任何读写失败都不影响主功能（静默降级）。
const PREFIX = 'cache_';

/**
 * 读取缓存
 * @param {string} key 缓存键
 * @returns {*} 缓存值；无缓存或已过期返回 null
 */
function get(key) {
  try {
    const raw = wx.getStorageSync(PREFIX + key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.expire && Date.now() > data.expire) {
      wx.removeStorageSync(PREFIX + key);
      return null;
    }
    return data.value;
  } catch (err) {
    return null;
  }
}

/**
 * 写入缓存
 * @param {string} key 缓存键
 * @param {*} value 缓存值（可序列化）
 * @param {number} ttlMs 过期时间（毫秒）；不传则永不过期
 */
function set(key, value, ttlMs) {
  try {
    const data = { value, expire: ttlMs ? Date.now() + ttlMs : 0 };
    wx.setStorageSync(PREFIX + key, JSON.stringify(data));
  } catch (err) {
    // 存储失败（如容量满）忽略：缓存失败不影响功能
  }
}

/**
 * 删除缓存（数据变更后调用，保证下次读取为最新）
 * @param {string} key 缓存键
 */
function remove(key) {
  try {
    wx.removeStorageSync(PREFIX + key);
  } catch (err) {
    // 忽略
  }
}

module.exports = { get, set, remove };
