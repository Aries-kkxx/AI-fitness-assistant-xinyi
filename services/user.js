// services/user.js - 用户数据层
// 职责：users 集合的读取与保存
// 安全：所有查询按 _openid 过滤（'{openid}' 自动替换为当前用户 openid），
//       配合集合权限「仅创建者可读写」保证用户数据隔离
const db = wx.cloud.database();
const COLLECTION = 'users';

/**
 * 获取当前用户资料；未填写过返回 null
 * @returns {Promise<Object|null>} 用户文档或 null
 */
async function getUser() {
  try {
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}' })
      .limit(1)
      .get();
    return res.data.length > 0 ? res.data[0] : null;
  } catch (err) {
    console.error('[user] getUser 失败', err);
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
    const payload = Object.assign({}, data, { updated_at: db.serverDate() });
    if (existing) {
      await db.collection(COLLECTION).doc(existing._id).update({ data: payload });
      return existing._id;
    }
    payload.created_at = db.serverDate();
    const res = await db.collection(COLLECTION).add({ data: payload });
    return res._id;
  } catch (err) {
    console.error('[user] saveUser 失败', err);
    throw err;
  }
}

module.exports = {
  getUser,
  saveUser
};
