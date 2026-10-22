// cloudfunctions/aiCoach/tools.js - 23 个 Agent 工具实现
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

// ===== 工具 2：获取今日训练（支持参数模拟条件 + 排除部位） =====
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
    duration: args.duration || p.training_duration,
    excludeParts: Array.isArray(args.exclude_parts) ? args.exclude_parts : undefined
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
        nameMap[e._id] = { name: e.name, category: e.category, target_muscle: e.target_muscle || [] };
      });
    }
    return {
      ok: true,
      count: res.data.length,
      records: res.data.map((r) => {
        const info = nameMap[r.exercise_id] || {};
        // v2 兼容：旧记录（v1）没有 set_records/planned_sets 时自动回退 sets/reps
        const setRecords = Array.isArray(r.set_records) ? r.set_records : [];
        const plannedSets = Number(r.planned_sets) || Number(r.sets) || 0;
        const plannedReps = Number(r.planned_reps) || Number(r.reps) || 0;
        const actualSets =
          Number(r.actual_sets) || (setRecords.length > 0 ? setRecords.length : Number(r.sets) || 0);
        // 容量与最大值汇总（程序计算）
        let totalVolume = 0;
        let maxWeight = 0;
        let maxReps = 0;
        setRecords.forEach((s) => {
          const w = Number(s.weight) || 0;
          const n = Number(s.reps) || 0;
          totalVolume += w * n;
          if (w > maxWeight) maxWeight = w;
          if (n > maxReps) maxReps = n;
        });
        // 明细压缩：每条只返回汇总 + 最近 3 组精简明细，并去掉 AI 判断不需要的冗余字段
        // （duration/sets/reps/起止时间/休息秒），避免工具结果超长被截断
        const recentSets = setRecords.slice(-3).map((s) => ({
          weight: Number(s.weight) || 0,
          reps: Number(s.reps) || 0,
          rpe: s.rpe !== undefined && s.rpe !== null ? Number(s.rpe) : null,
          is_failure: !!s.is_failure
        }));
        return {
          date: r.workout_date,
          name: info.name || '未知动作',
          // 部位信息：AI 据此判断用户上次训练了哪些部位，避免连续训练
          category: info.category || '',
          target_muscle: info.target_muscle || [],
          planned_sets: plannedSets,
          planned_reps: plannedReps,
          actual_sets: actualSets,
          total_volume_kg: Math.round(totalVolume),
          max_weight_kg: maxWeight,
          max_reps: maxReps,
          set_records: recentSets,
          note: r.note || ''
        };
      })
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
  const excludeParts = Array.isArray(args.exclude_parts) && args.exclude_parts.length > 0 ? args.exclude_parts : undefined;

  const plan = await recommend.generatePlan({
    goal,
    equipment,
    experience,
    duration,
    parts,
    excludeParts
  });
  if (!plan.ok && parts == null) {
    // 未指定部位时退回今日训练
    return recommend.getTodayWorkout({
      goal,
      equipment,
      experience,
      training_days: p.training_days || 3,
      duration,
      excludeParts
    });
  }
  return plan;
}

// ===== 工具 7：保存训练记录（校验动作必须真实存在于动作库） =====
// 两种入参（向后兼容）：
//   旧格式：{ exercise_ids[], sets[], reps[], duration, date, note }
//   v2 格式：{ details: [{ exercise_id, set_records: [{weight, reps, rpe, is_failure, rest_seconds}],
//             note, duration_minutes, planned_sets, planned_reps }], date }
async function saveWorkoutRecord(openid, args) {
  const details = Array.isArray(args.details) ? args.details : null;
  let ids;
  let legacySets = [];
  let legacyReps = [];
  if (details) {
    ids = details.map((d) => d.exercise_id);
  } else {
    ids = Array.isArray(args.exercise_ids) ? args.exercise_ids : [];
    legacySets = Array.isArray(args.sets) ? args.sets : [];
    legacyReps = Array.isArray(args.reps) ? args.reps : [];
  }

  if (ids.length === 0) {
    return { ok: false, message: '缺少动作 exercise_ids，请先通过 getExercises 获取真实动作' };
  }
  if (!details && (ids.length !== legacySets.length || ids.length !== legacyReps.length)) {
    return { ok: false, message: 'exercise_ids / sets / reps 数量不一致，请检查后重试' };
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
    const d = details ? details[i] || {} : null;
    // v2：每组明细
    const setRecords = d && Array.isArray(d.set_records)
      ? d.set_records.map((s) => ({
          weight: Number(s.weight) || 0,
          reps: Number(s.reps) || 0,
          rpe: s.rpe !== undefined && s.rpe !== null ? Number(s.rpe) : null,
          is_failure: !!s.is_failure,
          rest_seconds: Number(s.rest_seconds) || 0
        }))
      : [];
    const plannedSets = d ? Number(d.planned_sets) || 0 : Number(legacySets[i]) || 0;
    const plannedReps = d ? Number(d.planned_reps) || 0 : Number(legacyReps[i]) || 0;
    const durationMinutes = d ? Number(d.duration_minutes) || 0 : 0;
    const noteDetail = d && d.note ? String(d.note) : note;

    // 幂等：同一天同一动作已存在 → 更新明细（v2 完整覆盖），否则新增
    const exist = await db
      .collection('workout_records')
      .where({ _openid: openid, workout_date: date, exercise_id: ids[i] })
      .limit(1)
      .get();

    const recordData = {
      _openid: openid, // 云函数端 add 不自动注入 _openid，必须显式写入，否则前端按 openid 查询不可见（与 saveWaterRecord 一致）
      openid,
      exercise_id: ids[i],
      workout_date: date,
      sets: plannedSets,
      reps: plannedReps,
      planned_sets: plannedSets,
      planned_reps: plannedReps,
      actual_sets: setRecords.length > 0 ? setRecords.length : plannedSets,
      set_records: setRecords,
      duration,
      duration_minutes: durationMinutes,
      completed: true,
      note: noteDetail,
      data_version: 2,
      updated_at: db.serverDate()
    };

    if (exist.data.length > 0) {
      const doc = exist.data[0];
      if (!doc.completed_at) recordData.completed_at = formatDate(new Date()) + ' ' + formatTime(new Date());
      await db.collection('workout_records').doc(doc._id).update({ data: recordData });
    } else {
      recordData.completed_at = formatDate(new Date()) + ' ' + formatTime(new Date());
      recordData.created_at = db.serverDate();
      await db.collection('workout_records').add({ data: recordData });
    }
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

// ===== 训练表现分析（工具 9-13） =====
// 计算在 analysis.js（与前端 utils/workout-analysis.js 逻辑一致）完成，
// AI 只消费计算结果，不参与计算、不编造数字。
const analysis = require('./analysis');

// 解析动作：优先 exercise_id，其次按动作名称精确查询动作库（防 AI 编造）
async function resolveExercise(openid, args) {
  if (args && args.exercise_id) {
    return { _id: args.exercise_id, name: '' };
  }
  const name = String((args && args.exercise_name) || '').trim();
  if (!name) return null;
  const res = await db.collection('exercises').where({ name }).limit(1).get();
  if (res.data.length === 0) return null;
  return { _id: res.data[0]._id, name: res.data[0].name };
}

async function getExerciseNameById(exerciseId) {
  try {
    const res = await db.collection('exercises').where({ _id: exerciseId }).limit(1).get();
    return res.data[0] ? res.data[0].name : '';
  } catch (err) {
    return '';
  }
}

// 某动作全部历史记录（升序；云函数端单次 limit 上限高，500 足够 MVP）
async function getExerciseRecords(openid, exerciseId) {
  const res = await db
    .collection('workout_records')
    .where({ _openid: openid, exercise_id: exerciseId })
    .orderBy('workout_date', 'asc')
    .limit(500)
    .get();
  return res.data;
}

// 单条记录 → AI 可读结构（含 v2 明细，兼容 v1 缺字段）
function formatRecordForAI(r) {
  const setRecords = Array.isArray(r.set_records) ? r.set_records : [];
  const plannedSets = Number(r.planned_sets) || Number(r.sets) || 0;
  const plannedReps = Number(r.planned_reps) || Number(r.reps) || 0;
  const actualSets = Number(r.actual_sets) || (setRecords.length > 0 ? setRecords.length : Number(r.sets) || 0);
  const totalVolume = setRecords.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
  return {
    date: r.workout_date,
    planned_sets: plannedSets,
    planned_reps: plannedReps,
    actual_sets: actualSets,
    total_volume_kg: Math.round(totalVolume),
    set_records: setRecords.map((s) => ({
      weight: Number(s.weight) || 0,
      reps: Number(s.reps) || 0,
      rpe: s.rpe !== undefined && s.rpe !== null ? Number(s.rpe) : null,
      is_failure: !!s.is_failure,
      rest_seconds: Number(s.rest_seconds) || 0
    })),
    note: r.note || '',
    duration_minutes: Number(r.duration_minutes) || 0,
    started_at: r.started_at || '',
    ended_at: r.ended_at || ''
  };
}

// 工具 9：动作训练历史
async function getExerciseHistory(openid, args) {
  const ex = await resolveExercise(openid, args);
  if (!ex) {
    return { ok: false, message: '找不到该动作，请提供动作 _id（来自 getExercises/getTodayWorkout/createWorkoutPlan）或正确的动作名称' };
  }
  const limit = Math.min(30, Number(args.limit) || 10);
  const res = await db
    .collection('workout_records')
    .where({ _openid: openid, exercise_id: ex._id })
    .orderBy('workout_date', 'desc')
    .limit(limit)
    .get();
  const name = ex.name || (await getExerciseNameById(ex._id)) || '未知动作';
  return {
    ok: true,
    count: res.data.length,
    exercise_id: ex._id,
    exercise_name: name,
    records: res.data.map(formatRecordForAI)
  };
}

// 工具 10：动作个人 PR
async function getExercisePR(openid, args) {
  const ex = await resolveExercise(openid, args);
  if (!ex) {
    return { ok: false, message: '找不到该动作，请提供动作 _id 或正确的动作名称' };
  }
  const records = await getExerciseRecords(openid, ex._id);
  const prs = analysis.computePRs(records);
  const name = ex.name || (await getExerciseNameById(ex._id)) || '未知动作';
  return {
    ok: true,
    has_data: records.length > 0,
    exercise_id: ex._id,
    exercise_name: name,
    prs
  };
}

// 工具 11：训练容量统计（可按动作 / 全部动作，按最近 N 天）
async function getTrainingVolume(openid, args) {
  const where = { _openid: openid };
  let name = '(全部动作)';
  if (args && (args.exercise_id || args.exercise_name)) {
    const ex = await resolveExercise(openid, args);
    if (!ex) {
      return { ok: false, message: '找不到该动作，请提供动作 _id 或正确的动作名称' };
    }
    where.exercise_id = ex._id;
    name = ex.name || (await getExerciseNameById(ex._id)) || '未知动作';
  }
  const days = Number(args.days) || 0;
  let records;
  if (where.exercise_id) {
    records = await getExerciseRecords(openid, where.exercise_id);
  } else {
    const res = await db
      .collection('workout_records')
      .where(where)
      .orderBy('workout_date', 'asc')
      .limit(500)
      .get();
    records = res.data;
  }
  const stats = analysis.computeVolumeStats(records, days || undefined);
  return {
    ok: true,
    has_data: stats.dayCount > 0,
    exercise_name: name,
    days: days || null,
    total_volume_kg: stats.totalVolume,
    day_count: stats.dayCount,
    trend: stats.trend, // up / flat / down
    by_day: stats.byDay
  };
}

// 工具 12：动作进度趋势
async function getProgressTrend(openid, args) {
  const ex = await resolveExercise(openid, args);
  if (!ex) {
    return { ok: false, message: '找不到该动作，请提供动作 _id 或正确的动作名称' };
  }
  const records = await getExerciseRecords(openid, ex._id);
  const days = Number(args.days) || 0;
  const points = analysis.computeTrendPoints(records, days || undefined);
  const name = ex.name || (await getExerciseNameById(ex._id)) || '未知动作';
  const result = {
    ok: true,
    has_data: points.length > 0,
    exercise_id: ex._id,
    exercise_name: name,
    points
  };
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    result.summary = {
      first_date: first.date,
      last_date: last.date,
      weight_change_kg: last.maxWeight > 0 && first.maxWeight > 0 ? last.maxWeight - first.maxWeight : null,
      volume_change_kg: last.volume - first.volume,
      weight_up: last.maxWeight > first.maxWeight,
      volume_up: last.volume > first.volume
    };
  }
  return result;
}

// 工具 13：最近一次表现 + 上一次对比 + 渐进超负荷建议
async function getLastPerformance(openid, args) {
  const ex = await resolveExercise(openid, args);
  if (!ex) {
    return { ok: false, message: '找不到该动作，请提供动作 _id 或正确的动作名称' };
  }
  const records = await getExerciseRecords(openid, ex._id);
  const name = ex.name || (await getExerciseNameById(ex._id)) || '未知动作';
  if (records.length === 0) {
    return { ok: true, has_data: false, exercise_id: ex._id, exercise_name: name, message: '该动作还没有训练记录' };
  }
  const prs = analysis.computePRs(records);
  const last = analysis.computeLastPerformance(records);
  const prev = analysis.computePrevPerformance(records);
  // 建议基于可量化记录（有重量/容量明细），避免旧版无明细记录干扰
  const quantified = records.filter((r) => Array.isArray(r.set_records) && r.set_records.length > 0);
  const qLast = analysis.computeLastPerformance(quantified);
  let suggestion = null;
  if (qLast) {
    const libRes = await db.collection('exercises').where({ _id: ex._id }).limit(1).get();
    const lib = libRes.data[0] || {};
    suggestion = analysis.buildOverloadSuggestion({
      last: qLast,
      prev: analysis.computePrevPerformance(quantified),
      prs,
      plannedSets: lib.recommended_sets || 3,
      plannedReps: lib.recommended_reps || 10
    });
  }
  return {
    ok: true,
    has_data: true,
    exercise_id: ex._id,
    exercise_name: name,
    last,
    prev,
    prs,
    suggestion
  };
}

// ===== 恢复状态与训练负荷（工具 14-17） =====
// 训练状态判断规则在 analysis.js（与前端 utils/training-state.js 一致）完成。

// 云函数端：全部训练记录（升序，最多 500）
async function getAllWorkoutRecords(openid) {
  const res = await db
    .collection('workout_records')
    .where({ _openid: openid })
    .orderBy('workout_date', 'asc')
    .limit(500)
    .get();
  return res.data;
}

// 按日期查恢复记录
async function getRecoveryByDate(openid, date) {
  const res = await db
    .collection('recovery_records')
    .where({ _openid: openid, date })
    .limit(1)
    .get();
  return res.data.length > 0 ? res.data[0] : null;
}

// 最近 N 天恢复记录（升序）
async function getRecentRecoveryRecords(openid, days) {
  const start = formatDate(new Date(Date.now() - (Number(days) - 1) * 24 * 60 * 60 * 1000));
  const res = await db
    .collection('recovery_records')
    .where({ _openid: openid, date: _.gte(start) })
    .orderBy('date', 'asc')
    .limit(60)
    .get();
  return res.data;
}

function prevDateStr(dateStr) {
  const d = new Date(dateStr.replace(/-/g, '/'));
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

// 训练负荷统计（云函数端）
async function computeLoadStats(openid) {
  const records = await getAllWorkoutRecords(openid);
  const dateSet = {};
  records.forEach((r) => {
    if (r.workout_date) dateSet[r.workout_date] = true;
  });
  const dates = Object.keys(dateSet).sort();
  const today = formatDate(new Date());

  let consecutiveDays = 0;
  let cur = today;
  while (dateSet[cur]) {
    consecutiveDays++;
    cur = prevDateStr(cur);
  }

  const start7 = formatDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  const weekDates = dates.filter((d) => d >= start7 && d <= today);
  const volStats = analysis.computeVolumeStats(records, 7);

  const recentParts = [];
  for (let i = dates.length - 1; i >= 0 && recentParts.length < 3; i--) {
    const d = dates[i];
    if (d > today) continue;
    const rec = records.find((r) => r.workout_date === d && r.plan_id);
    const part = rec ? rec.plan_id : '';
    if (part && recentParts.indexOf(part) < 0) recentParts.push(part);
  }

  return {
    consecutiveDays,
    weekTrainingDays: weekDates.length,
    volumeTrend: volStats.trend,
    recentParts,
    lastDate: dates.length > 0 ? dates[dates.length - 1] : '',
    hasTraining: !!dateSet[today]
  };
}

// 最近体重变化（30 天内最早 vs 最新）
async function getRecentWeightChange(openid) {
  try {
    const res = await db
      .collection('weight_records')
      .where({ _openid: openid })
      .orderBy('date', 'asc')
      .limit(100)
      .get();
    if (res.data.length === 0) return { has_data: false };
    const first = res.data[0];
    const last = res.data[res.data.length - 1];
    return {
      has_data: true,
      latest_kg: last.weight_kg,
      latest_date: last.date,
      change_30d_kg: res.data.length > 1 ? Math.round((last.weight_kg - first.weight_kg) * 10) / 10 : 0
    };
  } catch (err) {
    return { has_data: false };
  }
}

// 工具 14：今日恢复状态
async function getRecoveryStatus(openid, args) {
  const today = formatDate(new Date());
  const r = await getRecoveryByDate(openid, today);
  if (!r) {
    return { ok: true, has_data: false, date: today, message: '今天还没有记录身体状态（睡眠/疲劳/酸痛/意愿）' };
  }
  const pain = analysis.detectPain(r.note);
  return {
    ok: true,
    has_data: true,
    date: today,
    sleep_quality: r.sleep_quality,
    fatigue: r.fatigue,
    soreness: r.soreness,
    motivation: r.motivation,
    body_status: r.body_status,
    note: r.note || '',
    pain_detected: pain,
    // 身体状态简评（仅基于恢复数据，不含训练负荷；综合判断用 analyzeTrainingLoad）
    state: analysis.computeTrainingState({
      recovery: r,
      consecutiveDays: 0,
      weekTrainingDays: 0,
      volumeTrend: 'flat'
    })
  };
}

// 工具 15：恢复历史（身体反馈历史）
async function getRecoveryHistory(openid, args) {
  const limit = Math.min(30, Number(args.limit) || 10);
  const res = await db
    .collection('recovery_records')
    .where({ _openid: openid })
    .orderBy('date', 'desc')
    .limit(limit)
    .get();
  return {
    ok: true,
    count: res.data.length,
    records: res.data.map((r) => ({
      date: r.date,
      sleep_quality: r.sleep_quality,
      fatigue: r.fatigue,
      soreness: r.soreness,
      motivation: r.motivation,
      body_status: r.body_status,
      note: r.note || '',
      pain_detected: analysis.detectPain(r.note)
    }))
  };
}

// 工具 16：综合训练负荷分析（训练状态判断）
async function analyzeTrainingLoad(openid, args) {
  const [load, recoveryToday] = await Promise.all([
    computeLoadStats(openid),
    getRecoveryByDate(openid, formatDate(new Date()))
  ]);
  const state = analysis.computeTrainingState({
    recovery: recoveryToday,
    consecutiveDays: load.consecutiveDays,
    weekTrainingDays: load.weekTrainingDays,
    volumeTrend: load.volumeTrend,
    painNote: recoveryToday ? recoveryToday.note : ''
  });
  const weight = await getRecentWeightChange(openid);
  return {
    ok: true,
    has_recovery_data: !!recoveryToday,
    training_load: load,
    today_recovery: recoveryToday
      ? {
          sleep_quality: recoveryToday.sleep_quality,
          fatigue: recoveryToday.fatigue,
          soreness: recoveryToday.soreness,
          motivation: recoveryToday.motivation,
          body_status: recoveryToday.body_status,
          note: recoveryToday.note || ''
        }
      : null,
    recent_weight_change: weight,
    state
  };
}

// 工具 17：最近身体状态（含平均值）
async function getRecentBodyStatus(openid, args) {
  const days = Math.min(30, Math.max(1, Number(args.days) || 7));
  const records = await getRecentRecoveryRecords(openid, days);
  if (records.length === 0) {
    return { ok: true, has_data: false, days, message: '最近 ' + days + ' 天没有身体状态记录' };
  }
  const avg = (k) => Math.round((records.reduce((s, r) => s + (Number(r[k]) || 0), 0) / records.length) * 10) / 10;
  return {
    ok: true,
    has_data: true,
    days,
    count: records.length,
    avg: {
      sleep_quality: avg('sleep_quality'),
      fatigue: avg('fatigue'),
      soreness: avg('soreness'),
      motivation: avg('motivation'),
      body_status: avg('body_status')
    },
    records: records.map((r) => ({
      date: r.date,
      sleep_quality: r.sleep_quality,
      fatigue: r.fatigue,
      soreness: r.soreness,
      motivation: r.motivation,
      body_status: r.body_status,
      note: r.note || ''
    }))
  };
}

// ===== 长期健身记忆（工具 18-21） =====
// 结构化 fitness_memory（每用户 1 条）：训练偏好 / 训练习惯 / 身体反馈 / 目标 / AI 备注
// 保存条件由 prompt 约束（长期价值/明确偏好/稳定习惯/用户要求），
// 工具层做结构与敏感信息校验，敏感信息一律不入库。
const memoryUtil = require('./memory');

// 工具 18：获取长期记忆
async function getFitnessMemory(openid, args) {
  try {
    const res = await db.collection('fitness_memory').where({ _openid: openid }).limit(1).get();
    const memory =
      res.data.length > 0
        ? memoryUtil.normalizeMemory(res.data[0])
        : JSON.parse(JSON.stringify(memoryUtil.EMPTY_MEMORY));
    return { ok: true, has_memory: res.data.length > 0, memory };
  } catch (err) {
    console.error('[aiCoach] getFitnessMemory 失败', err);
    return { ok: true, has_memory: false, memory: JSON.parse(JSON.stringify(memoryUtil.EMPTY_MEMORY)) };
  }
}

// 工具 19：保存长期记忆（全量）
async function saveFitnessMemory(openid, args) {
  const raw = (args && args.memory) || {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'memory 参数格式错误，请传入对象' };
  }
  const normalized = memoryUtil.normalizeMemory(raw);
  // 容量上限（防滥用）
  if (JSON.stringify(normalized).length > 8000) {
    return { ok: false, message: '记忆内容过长，请精简后保存（最多 8000 字符）' };
  }
  const payload = {
    _openid: openid, // 云函数端 add 不自动注入 _openid；缺失会让 getFitnessMemory/updateFitnessMemory 按 _openid 查询永远找不到新文档（与 saveWaterRecord 一致）
    training_preferences: normalized.training_preferences,
    training_habits: normalized.training_habits,
    body_response: normalized.body_response,
    goals: normalized.goals,
    ai_notes: normalized.ai_notes,
    updated_at: db.serverDate()
  };
  try {
    const exist = await db.collection('fitness_memory').where({ _openid: openid }).limit(1).get();
    if (exist.data.length > 0) {
      await db.collection('fitness_memory').doc(exist.data[0]._id).update({ data: payload });
    } else {
      payload.created_at = db.serverDate();
      await db.collection('fitness_memory').add({ data: payload });
    }
    return { ok: true, message: '已保存到长期记忆', memory: normalized };
  } catch (err) {
    console.error('[aiCoach] saveFitnessMemory 失败', err);
    return { ok: false, message: '长期记忆保存失败: ' + err.message };
  }
}

// 工具 20：更新长期记忆（局部更新/追加）
async function updateFitnessMemory(openid, args) {
  const section = args && args.section;
  if (memoryUtil.SECTIONS.indexOf(section) < 0) {
    return { ok: false, message: '未知记忆区块，可用: ' + memoryUtil.SECTIONS.join('/') };
  }
  try {
    const res = await db.collection('fitness_memory').where({ _openid: openid }).limit(1).get();
    const memory =
      res.data.length > 0
        ? memoryUtil.normalizeMemory(res.data[0])
        : JSON.parse(JSON.stringify(memoryUtil.EMPTY_MEMORY));

    if (args.append) {
      // 追加（ai_notes / body_response.feedback / goals.current）
      const content = String(args.append).slice(0, 300);
      if (!content) return { ok: false, message: 'append 内容为空' };
      if (memoryUtil.detectSensitive(content)) {
        return { ok: false, message: '包含敏感信息，已拒绝保存' };
      }
      if (section === 'goals') {
        const oldCurrent = memory.goals.current;
        if (oldCurrent && oldCurrent !== content) {
          memory.goals.history = memory.goals.history.concat([
            { content: oldCurrent, date: memory.goals.updated_at || todayStr() }
          ]);
        }
        memory.goals.current = content;
        memory.goals.updated_at = todayStr();
      } else if (section === 'ai_notes') {
        memory.ai_notes = memory.ai_notes.concat([{ content, date: todayStr() }]);
      } else if (section === 'body_response') {
        memory.body_response.feedback = memory.body_response.feedback.concat([{ content, date: todayStr() }]);
      } else {
        return { ok: false, message: '该区块不支持 append，请使用 data 整体更新' };
      }
    } else {
      // 局部更新（白名单键）
      const data = (args && args.data) || {};
      const allowed = memoryUtil.SECTION_KEYS[section] || [];
      allowed.forEach((k) => {
        if (data[k] !== undefined) memory[section][k] = data[k];
      });
      // goals.current 变化时记录历史目标
      if (section === 'goals' && data.current && data.current !== memory.goals.current && memory.goals.current) {
        memory.goals.history = memory.goals.history.concat([
          { content: memory.goals.current, date: memory.goals.updated_at || todayStr() }
        ]);
        memory.goals.updated_at = todayStr();
      }
    }

    const normalized = memoryUtil.normalizeMemory(memory);
    const payload = {
      _openid: openid, // 新建分支 add 时必须显式写入 _openid，否则文档成为孤儿数据（与 saveFitnessMemory 一致）
      training_preferences: normalized.training_preferences,
      training_habits: normalized.training_habits,
      body_response: normalized.body_response,
      goals: normalized.goals,
      ai_notes: normalized.ai_notes,
      updated_at: db.serverDate()
    };
    if (res.data.length > 0) {
      await db.collection('fitness_memory').doc(res.data[0]._id).update({ data: payload });
    } else {
      payload.created_at = db.serverDate();
      await db.collection('fitness_memory').add({ data: payload });
    }
    return { ok: true, message: '已更新长期记忆', memory: normalized };
  } catch (err) {
    console.error('[aiCoach] updateFitnessMemory 失败', err);
    return { ok: false, message: '长期记忆更新失败: ' + err.message };
  }
}

// 工具 21：删除长期记忆（整条或某区块）
async function deleteFitnessMemory(openid, args) {
  const section = args && args.section;
  if (section) {
    if (memoryUtil.SECTIONS.indexOf(section) < 0) {
      return { ok: false, message: '未知记忆区块，可用: ' + memoryUtil.SECTIONS.join('/') };
    }
    try {
      const res = await db.collection('fitness_memory').where({ _openid: openid }).limit(1).get();
      if (res.data.length === 0) {
        return { ok: true, message: '还没有长期记忆，无需删除' };
      }
      const memory = memoryUtil.normalizeMemory(res.data[0]);
      memory[section] = JSON.parse(JSON.stringify(memoryUtil.EMPTY_MEMORY[section]));
      const payload = {
        training_preferences: memory.training_preferences,
        training_habits: memory.training_habits,
        body_response: memory.body_response,
        goals: memory.goals,
        ai_notes: memory.ai_notes,
        updated_at: db.serverDate()
      };
      await db.collection('fitness_memory').doc(res.data[0]._id).update({ data: payload });
      return { ok: true, message: '已删除 ' + section + ' 区块' };
    } catch (err) {
      return { ok: false, message: '删除失败: ' + err.message };
    }
  }
  try {
    await db.collection('fitness_memory').where({ _openid: openid }).remove();
    return { ok: true, message: '已清空长期记忆' };
  } catch (err) {
    return { ok: false, message: '清空失败: ' + err.message };
  }
}

function todayStr() {
  return formatDate(new Date());
}

// ===== 训练周期（工具 22） =====
// 统计全部由 cycle.js 程序计算（与前端 services/cycle.js 逻辑一致），AI 只解释不伪造。
const cycleUtil = require('./cycle');

async function getTrainingCycle(openid, args) {
  try {
    const data = await cycleUtil.getTrainingCycleData(openid);
    return Object.assign({ ok: true }, data);
  } catch (err) {
    console.error('[aiCoach] getTrainingCycle 失败', err);
    return { ok: false, has_cycle: false, message: '暂无训练周期数据' };
  }
}

// ===== 个人档案统计（工具 23） =====
// 全部统计程序计算（复用 analysis.js），AI 只解释不伪造。
async function getFitnessReport(openid, args) {
  try {
    const days = Math.min(90, Math.max(7, Number(args.days) || 30));

    // 训练记录
    const records = await getAllWorkoutRecords(openid);
    const dateSet = {};
    let totalVolume = 0;
    records.forEach((r) => {
      if (r.workout_date) dateSet[r.workout_date] = true;
      totalVolume += analysis.computeRecordStats(r).volume;
    });
    const dates = Object.keys(dateSet).sort();
    const today = formatDate(new Date());
    const start = formatDate(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));

    // 窗口内统计
    const inWindow = records.filter((r) => r.workout_date >= start && r.workout_date <= today);
    const windowDates = {};
    let windowVolume = 0;
    inWindow.forEach((r) => {
      if (r.workout_date) windowDates[r.workout_date] = true;
      windowVolume += analysis.computeRecordStats(r).volume;
    });
    // 窗口前后半段容量对比（趋势）
    const halfStart = formatDate(new Date(Date.now() - (Math.floor(days / 2) - 1) * 24 * 60 * 60 * 1000));
    const firstHalf = records.filter((r) => r.workout_date >= start && r.workout_date < halfStart).reduce((s, r) => s + analysis.computeRecordStats(r).volume, 0);
    const secondHalf = records.filter((r) => r.workout_date >= halfStart && r.workout_date <= today).reduce((s, r) => s + analysis.computeRecordStats(r).volume, 0);
    const windowTrainingDays = Object.keys(windowDates).length;
    const volumeTrend = firstHalf > 0 ? (secondHalf / firstHalf >= 1.05 ? 'up' : secondHalf / firstHalf <= 0.95 ? 'down' : 'flat') : 'flat';

    // PR 数
    const byEx = {};
    records.forEach((r) => {
      if (!r.exercise_id) return;
      (byEx[r.exercise_id] = byEx[r.exercise_id] || []).push(r);
    });
    let prCount = 0;
    Object.keys(byEx).forEach((exId) => {
      const prs = analysis.computePRs(byEx[exId]);
      if (prs.maxWeightPR) prCount++;
      if (prs.maxRepsPR) prCount++;
      if (prs.maxVolumePR) prCount++;
    });

    // 体重
    let weight = { has_data: false };
    try {
      const wRes = await db.collection('weight_records').where({ _openid: openid }).orderBy('date', 'asc').limit(100).get();
      if (wRes.data.length > 0) {
        const list = wRes.data;
        const current = list[list.length - 1].weight_kg;
        const d30 = formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        const d90 = formatDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
        const f30 = list.find((r) => r.date >= d30);
        const f90 = list.find((r) => r.date >= d90);
        weight = {
          has_data: true,
          current_kg: current,
          change_30d_kg: f30 ? Math.round((current - f30.weight_kg) * 10) / 10 : null,
          change_90d_kg: f90 ? Math.round((current - f90.weight_kg) * 10) / 10 : null
        };
      }
    } catch (err) {
      // 忽略
    }

    // 饮水（近 N 天达标情况）
    let water = { has_data: false };
    try {
      const waterRes = await db.collection('water_records').where({ _openid: openid }).orderBy('date', 'asc').limit(500).get();
      const groups = {};
      waterRes.data.forEach((r) => {
        if (!r.date) return;
        if (!groups[r.date]) groups[r.date] = { total: 0, target: r.daily_target_ml || 0 };
        groups[r.date].total += r.amount_ml || 0;
        if (!groups[r.date].target && r.daily_target_ml) groups[r.date].target = r.daily_target_ml;
      });
      const goalDays = Object.keys(groups).filter((d) => d >= start && groups[d].target > 0 && groups[d].total >= groups[d].target).length;
      water = {
        has_data: Object.keys(groups).length > 0,
        goal_days: goalDays,
        total_ml: waterRes.data.reduce((s, r) => s + (r.amount_ml || 0), 0)
      };
    } catch (err) {
      // 忽略
    }

    // 恢复（近 N 天均值）
    let recovery = { has_data: false };
    try {
      const recRes = await db.collection('recovery_records').where({ _openid: openid, date: _.gte(start) }).limit(60).get();
      const recs = recRes.data;
      if (recs.length > 0) {
        const avg = (k) => Math.round((recs.reduce((s, r) => s + (Number(r[k]) || 0), 0) / recs.length) * 10) / 10;
        recovery = {
          has_data: true,
          avg_fatigue: avg('fatigue'),
          avg_sleep: avg('sleep_quality'),
          avg_soreness: avg('soreness'),
          days: recs.length
        };
      }
    } catch (err) {
      // 忽略
    }

    return {
      ok: true,
      days,
      training: {
        total_training_days: dates.length,
        window_training_days: windowTrainingDays,
        window_volume_kg: Math.round(windowVolume),
        volume_trend: volumeTrend,
        total_volume_kg: Math.round(totalVolume),
        pr_count: prCount
      },
      weight,
      water,
      recovery
    };
  } catch (err) {
    console.error('[aiCoach] getFitnessReport 失败', err);
    return { ok: false, message: '统计计算失败: ' + err.message };
  }
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
      case 'getExerciseHistory':
        return await getExerciseHistory(openid, args);
      case 'getExercisePR':
        return await getExercisePR(openid, args);
      case 'getTrainingVolume':
        return await getTrainingVolume(openid, args);
      case 'getProgressTrend':
        return await getProgressTrend(openid, args);
      case 'getLastPerformance':
        return await getLastPerformance(openid, args);
      case 'getRecoveryStatus':
        return await getRecoveryStatus(openid, args);
      case 'getRecoveryHistory':
        return await getRecoveryHistory(openid, args);
      case 'analyzeTrainingLoad':
        return await analyzeTrainingLoad(openid, args);
      case 'getRecentBodyStatus':
        return await getRecentBodyStatus(openid, args);
      case 'getFitnessMemory':
        return await getFitnessMemory(openid, args);
      case 'saveFitnessMemory':
        return await saveFitnessMemory(openid, args);
      case 'updateFitnessMemory':
        return await updateFitnessMemory(openid, args);
      case 'deleteFitnessMemory':
        return await deleteFitnessMemory(openid, args);
      case 'getTrainingCycle':
        return await getTrainingCycle(openid, args);
      case 'getFitnessReport':
        return await getFitnessReport(openid, args);
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


