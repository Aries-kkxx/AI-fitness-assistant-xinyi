// cloudfunctions/aiCoach/tools.js - 8 个 Agent 工具实现
// 安全：所有用户数据操作都按 openid（cloud.getWXContext().OPENID）过滤；
//       云函数拥有数据库管理权限，必须自行实现 openid 隔离，不能依赖集合权限。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const recommend = require('./recommend');

// ===== 日期工具（云函数独立运行，不复用前端 utils） =====
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function formatTime(d) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// ===== 工具 1：获取用户资料 =====
async function getUserProfile(openid) {
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
  const u = res.data[0];
  if (!u) {
    return { ok: false, found: false, message: '用户还没有填写个人资料' };
  }
  return {
    ok: true,
    found: true,
    profile: {
      nickname: u.nickname || '',
      gender: u.gender || '',
      age: u.age,
      height: u.height,
      weight: u.weight,
      goal: u.goal,
      experience: u.experience,
      training_days: u.training_days,
      training_duration: u.training_duration,
      equipment: u.equipment
    }
  };
}

// ===== 工具 2：获取今日训练（支持参数模拟条件） =====
async function getTodayWorkout(openid, args) {
  const userRes = await getUserProfile(openid);
  if (!userRes.found) {
    return { ok: false, message: '用户还没有填写个人资料，请先引导用户填写资料' };
  }
  const p = userRes.profile;
  const plan = await recommend.getTodayWorkout({
    goal: args.goal || p.goal,
    equipment: args.equipment || p.equipment,
    experience: p.experience,
    training_days: p.training_days,
    duration: args.duration || p.training_duration
  });
  return plan;
}

// ===== 工具 3：历史训练记录 =====
async function getWorkoutHistory(openid, args) {
  try {
    const limit = Math.min(30, Number(args.limit) || 10);
    const res = await db
      .collection('workout_records')
      .where({ _openid: openid })
      .orderBy('workout_date', 'desc')
      .limit(limit)
      .get();
    // 补充动作名称（批量查 exercises）
    const ids = [];
    const seen = {};
    res.data.forEach((r) => {
      if (r.exercise_id && !seen[r.exercise_id]) {
        seen[r.exercise_id] = true;
        ids.push(r.exercise_id);
      }
    });
    const nameMap = {};
    if (ids.length > 0) {
      const exRes = await db.collection('exercises').where({ _id: _.in(ids) }).get();
      exRes.data.forEach((e) => {
        nameMap[e._id] = e.name;
      });
    }
    return {
      ok: true,
      count: res.data.length,
      records: res.data.map((r) => ({
        date: r.workout_date,
        name: nameMap[r.exercise_id] || '未知动作',
        sets: r.sets,
        reps: r.reps,
        duration: r.duration,
        note: r.note || ''
      }))
    };
  } catch (err) {
    console.error('[aiCoach] getWorkoutHistory 失败', err);
    // workout_records 集合可能尚未创建
    return { ok: false, message: '暂无训练记录' };
  }
}

// ===== 工具 4：饮水记录 =====
async function getWaterRecords(openid, args) {
  try {
    const limit = Math.min(30, Number(args.limit) || 10);
    const res = await db
      .collection('water_records')
      .where({ _openid: openid })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    let totalMl = 0;
    res.data.forEach((r) => {
      totalMl += r.amount_ml || 0;
    });
    return {
      ok: true,
      count: res.data.length,
      totalMl,
      records: res.data.map((r) => ({
        date: r.date,
        time: r.drink_time,
        amount_ml: r.amount_ml,
        drink_type: r.drink_type,
        remark: r.remark || ''
      }))
    };
  } catch (err) {
    console.error('[aiCoach] getWaterRecords 失败', err);
    return { ok: false, message: '暂无饮水记录' };
  }
}

// ===== 工具 5：查询动作库（公共数据，不带 openid 条件） =====
async function getExercises(openid, args) {
  const where = {};
  if (args.category) where.category = args.category;
  if (args.difficulty) where.difficulty = args.difficulty;
  if (args.equipment) {
    const compat = recommend.EQUIPMENT_COMPAT[args.equipment];
    where.equipment = compat ? _.in(compat) : args.equipment;
  }
  const limit = Math.min(30, Number(args.limit) || 10);
  const res = await db
    .collection('exercises')
    .where(where)
    .orderBy('sort', 'asc')
    .limit(limit)
    .get();
  return {
    ok: true,
    count: res.data.length,
    exercises: res.data.map((e) => ({
      _id: e._id,
      name: e.name,
      category: e.category,
      difficulty: e.difficulty,
      equipment: e.equipment,
      target_muscle: e.target_muscle,
      sets: e.recommended_sets,
      reps: e.recommended_reps,
      repsUnit: e.reps_unit || '次',
      restSeconds: e.rest_seconds
    }))
  };
}

// ===== 工具 6：生成训练方案（不入库，仅作为建议返回给 AI） =====
async function createWorkoutPlan(openid, args) {
  const userRes = await getUserProfile(openid);
  const p = userRes.found ? userRes.profile : {};
  const goal = args.goal || p.goal || '保持健康';
  const equipment = args.equipment || p.equipment || '无器械';
  const experience = p.experience || '初级';
  const duration = args.duration || p.training_duration || 45;
  const parts = Array.isArray(args.parts) && args.parts.length > 0 ? args.parts : null;

  const plan = await recommend.generatePlan({ goal, equipment, experience, duration, parts });
  if (!plan.ok && parts == null) {
    // 未指定部位时退回今日训练
    return recommend.getTodayWorkout({
      goal,
      equipment,
      experience,
      training_days: p.training_days || 3,
      duration
    });
  }
  return plan;
}

// ===== 工具 7：保存训练记录（校验动作必须真实存在于动作库） =====
async function saveWorkoutRecord(openid, args) {
  const ids = Array.isArray(args.exercise_ids) ? args.exercise_ids : [];
  const sets = Array.isArray(args.sets) ? args.sets : [];
  const reps = Array.isArray(args.reps) ? args.reps : [];
  if (ids.length === 0 || ids.length !== sets.length || ids.length !== reps.length) {
    return { ok: false, message: 'exercise_ids / sets / reps 数量不一致或为空，请先通过 getExercises 获取真实动作' };
  }

  // 防 AI 幻觉：校验所有动作 _id 真实存在于动作库
  const existRes = await db.collection('exercises').where({ _id: _.in(ids) }).get();
  const existIds = {};
  existRes.data.forEach((e) => {
    existIds[e._id] = true;
  });
  const invalid = ids.filter((id) => !existIds[id]);
  if (invalid.length > 0) {
    return { ok: false, message: '以下动作不存在于动作库，禁止保存: ' + invalid.join(', ') };
  }

  const date = args.date || formatDate(new Date());
  const duration = Number(args.duration) || 0;
  const note = String(args.note || '');
  let saved = 0;
  for (let i = 0; i < ids.length; i++) {
    await db.collection('workout_records').add({
      data: {
        _openid: openid,
        openid,
        exercise_id: ids[i],
        workout_date: date,
        sets: Number(sets[i]) || 0,
        reps: Number(reps[i]) || 0,
        duration,
        completed: true,
        note,
        created_at: db.serverDate()
      }
    });
    saved++;
  }
  return { ok: true, saved, message: '已保存 ' + saved + ' 条训练记录（' + date + '）' };
}

// ===== 工具 8：保存饮水记录 =====
async function saveWaterRecord(openid, args) {
  const ml = Number(args.amount_ml);
  if (!ml || ml < 50 || ml > 1000) {
    return { ok: false, message: '饮水量需在 50-1000ml 之间' };
  }
  const drinkType = ['白水', '温水', '茶', '其他'].indexOf(args.drink_type) >= 0 ? args.drink_type : '白水';
  const now = new Date();
  const res = await db.collection('water_records').add({
    data: {
      _openid: openid,
      openid,
      drink_time: args.drink_time || formatTime(now),
      amount_ml: ml,
      drink_type: drinkType,
      remark: String(args.remark || ''),
      date: args.date || formatDate(now),
      created_at: db.serverDate()
    }
  });
  return { ok: true, _id: res._id, message: '已记录饮水 ' + ml + 'ml（' + drinkType + '）' };
}

// ===== 工具分发 =====
async function executeTool(openid, name, args) {
  try {
    switch (name) {
      case 'getUserProfile':
        return await getUserProfile(openid, args);
      case 'getTodayWorkout':
        return await getTodayWorkout(openid, args);
      case 'getWorkoutHistory':
        return await getWorkoutHistory(openid, args);
      case 'getWaterRecords':
        return await getWaterRecords(openid, args);
      case 'getExercises':
        return await getExercises(openid, args);
      case 'createWorkoutPlan':
        return await createWorkoutPlan(openid, args);
      case 'saveWorkoutRecord':
        return await saveWorkoutRecord(openid, args);
      case 'saveWaterRecord':
        return await saveWaterRecord(openid, args);
      default:
        return { ok: false, message: '未知工具: ' + name };
    }
  } catch (err) {
    console.error('[aiCoach] 工具执行失败', name, err);
    return { ok: false, message: '工具执行失败: ' + err.message };
  }
}

module.exports = {
  executeTool
};
