// utils/db.js - 通用数据库查询工具
// 小程序端单次 get 最多返回 20 条记录，统计类需求（如累计训练次数、月均饮水）
// 必须取全量数据，这里统一封装翻页查询，避免各 service 重复实现

const db = wx.cloud.database();

// 小程序端单次查询上限
const MAX_PER_GET = 20;

/**
 * 翻页获取满足条件的所有记录（默认上限 500 条，MVP 足够）
 * @param {string} collectionName 集合名
 * @param {Object} where 查询条件（需自行包含 _openid 过滤）
 * @param {Object} options
 * @param {string} options.orderField 排序字段（可选）
 * @param {string} options.orderDir 'asc' | 'desc'，默认 asc
 * @param {number} options.max 最大获取条数，默认 500
 * @returns {Promise<Array>} 记录数组
 */
async function getAllByWhere(collectionName, where, options) {
  const { orderField, orderDir, max = 500 } = options || {};
  let all = [];
  let skip = 0;
  while (true) {
    let query = db.collection(collectionName).where(where);
    if (orderField) {
      query = query.orderBy(orderField, orderDir || 'asc');
    }
    const res = await query.skip(skip).limit(MAX_PER_GET).get();
    all = all.concat(res.data);
    if (res.data.length < MAX_PER_GET) break;
    skip += MAX_PER_GET;
    if (skip >= max) break; // 安全上限，防止异常死循环
  }
  return all;
}

module.exports = {
  getAllByWhere,
  MAX_PER_GET
};
