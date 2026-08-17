// services/exercise.js - 动作库数据层
// 职责：exercises 集合的查询 + 首次初始化导入（幂等）
// 注意：exercises 是公共数据（非用户数据），集合权限需设为「所有用户可读，仅创建者可读写」，
//       因此查询不带 _openid 过滤
const seedExercises = require('../data/exercises');

const COLLECTION = 'exercises';

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
 * 仅在初始化时使用种子文件，运行时的推荐/查询全部走数据库
 */
async function initExercisesIfEmpty() {
  try {
    const countRes = await getDb().collection(COLLECTION).count();
    if (countRes.total > 0) {
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
    console.log('[exercise] 动作库初始化完成，共导入 ' + seedExercises.length + ' 条');
  } catch (err) {
    console.error('[exercise] 动作库初始化失败', err);
  }
}

/**
 * 按分类查询动作（分类为空时查询全部）
 * @param {string} category 分类名（胸部/背部/肩部/手臂/腿部/臀部/核心/有氧/拉伸），可空
 * @returns {Promise<Array>} 动作数组（按 sort 升序）
 */
async function getByCategory(category) {
  const where = category ? { category } : {};
  const res = await getDb()
    .collection(COLLECTION)
    .where(where)
    .orderBy('sort', 'asc')
    .get();
  return res.data;
}

module.exports = {
  initExercisesIfEmpty,
  getByCategory
};
