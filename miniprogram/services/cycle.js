// services/cycle.js - 长期训练周期数据层（training_cycles + training_cycle_weeks）
// 职责：
//   1. 周期 CRUD：创建 4~8 周周期（名称/目标/起止日期/周频率/状态/每周训练计划）
//   2. 当前周计算（日期运算，跨月/跨年正确）；周期到期惰性标记 completed
//   3. 渐进式训练：每周 plan 附带 adjust（组数/次数/重量百分比），每 2 周递增；中段插入减量周（deload）
//   4. 每周总结（程序计算统计 + 本地规则文案）：训练次数/完成率/容量/PR/体重/饮水/恢复 + 表现/进步/问题/下周建议
//   5. 周期总结：完成率/总次数/总容量/PR 数/体重变化/表现变化 + AI 总结/下周期建议
// 口径：
//   - 优先级：周期计划 > 自定义周计划 > 规则推荐（由 plan.resolveTodayWorkout 集成）
//   - 周窗口：周期第 n 周 = [start_date + (n-1)*7天, start_date + n*7天 - 1]（跨月/跨年安全）
//   - 所有统计由程序计算，AI 只解释（aiCoach getTrainingCycle 工具读取结果）
// 安全：所有查询按 _openid 过滤（'{openid}' 自动替换）
const { getAllByWhere } = require('../utils/db');
const { formatDate } = require('../utils/date');
const cache = require('../utils/cache');
const analysis = require('../utils/workout-analysis');
const cycleMath = require('../utils/cycle-math');

const db = wx.cloud.database();
const CYCLE_COLLECTION = 'training_cycles';
const WEEK_COLLECTION = 'training_cycle_weeks';
const CYCLE_TTL = 5 * 60 * 1000;

// 周期范围
const MIN_WEEKS = 4;
const MAX_WEEKS = 8;

// ===== 日期工具（复用 utils/cycle-math.js 纯函数） =====

function getWeekRange(startDate, weekNo) {
  return cycleMath.getWeekRange(startDate, weekNo);
}

function getCurrentWeek(startDate, endDate) {
  return cycleMath.getCurrentWeek(startDate, endDate);
}

function isCycleOver(endDate) {
  return cycleMath.isCycleOver(endDate);
}

function todayIndex() {
  return cycleMath.todayIndex();
}

function addDays(dateStr, days) {
  return cycleMath.addDays(dateStr, days);
}

// ===== 渐进调整 =====

// 某周的动作调整参数（数据规则，不随机）
function buildAdjust(goal, weekNo, totalWeeks, deload) {
  return cycleMath.buildAdjust(goal, weekNo, totalWeeks, deload);
}

// 减量周号（≥6 周周期在中段插入；4 周不插）
function getDeloadWeek(totalWeeks) {
  return cycleMath.getDeloadWeek(totalWeeks);
}

// ===== 查询 =====

async function invalidateCycleCache() {
  cache.remove('cycle_active');
  cache.remove('cycle_list');
  cache.remove('cycle_detail');
  cache.remove('cycle_summaries');
}

/**
 * 获取当前活跃周期；过期周期惰性标记 completed 并生成周期总结
 * @returns {Promise<Object|null>}
 */
async function getActiveCycle() {
  const cached = cache.get('cycle_active');
  if (cached !== null) return cached;

  try {
    const res = await db
      .collection(CYCLE_COLLECTION)
      .where({ _openid: '{openid}', status: 'active' })
      .orderBy('start_date', 'desc')
      .limit(1)
      .get();
    if (res.data.length === 0) return null;
    const cycle = res.data[0];
    // 惰性：周期到期 → 结束并生成周期总结，视为无活跃周期（引导创建新周期）
    if (isCycleOver(cycle.end_date)) {
      await completeCycle(cycle._id);
      cache.set('cycle_active', null, 60 * 1000);
      return null;
    }
    cache.set('cycle_active', cycle, CYCLE_TTL);
    return cycle;
  } catch (err) {
    console.error('[cycle] getActiveCycle 失败', err);
    return null; // 集合未创建等错误降级，不影响训练页
  }
}

/**
 * 按 _id 获取周期
 */
async function getCycleById(cycleId) {
  try {
    const res = await db.collection(CYCLE_COLLECTION).doc(cycleId).get();
    return res.data || null;
  } catch (err) {
    console.error('[cycle] getCycleById 失败', err);
    return null;
  }
}

/**
 * 历史周期列表（倒序，不含 active 的完整 weeks 以减负载——取摘要字段）
 */
async function getCycles() {
  const cached = cache.get('cycle_list');
  if (cached !== null) return cached;

  try {
    const res = await db
      .collection(CYCLE_COLLECTION)
      .where({ _openid: '{openid}' })
      .orderBy('start_date', 'desc')
      .limit(20)
      .get();
    const list = res.data.map((c) => ({
      _id: c._id,
      name: c.name || '',
      goal: c.goal || '',
      start_date: c.start_date,
      end_date: c.end_date,
      total_weeks: c.total_weeks || 0,
      status: c.status || 'active',
      final_summary: c.final_summary || null
    }));
    cache.set('cycle_list', list, CYCLE_TTL);
    return list;
  } catch (err) {
    console.error('[cycle] getCycles 失败', err);
    return [];
  }
}

// ===== 创建周期 =====

// 生成基础周计划模板（优先自定义周计划，其次规则引擎）
async function buildTemplateDays(user) {
  try {
    const planService = require('./plan');
    const custom = await planService.getWeekPlanCustom();
    if (custom && custom.days && custom.days.length === 7) {
      const hasAny = custom.days.some((d) => !d.isRest && d.exercise_ids && d.exercise_ids.length > 0);
      if (hasAny) {
        return custom.days.map((d) => ({
          day: d.day,
          isRest: !!d.isRest,
          exercise_ids: (d.exercise_ids || []).slice()
        }));
      }
    }
  } catch (err) {
    console.error('[cycle] 读取自定义计划失败，回退规则引擎', err);
  }
  const recommend = require('./recommend');
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = await recommend.getDayWorkout(user, i);
    days.push({
      day: i + 1,
      isRest: day.exercises.length === 0,
      exercise_ids: day.exercises.map((e) => e._id)
    });
  }
  return days;
}

/**
 * 创建训练周期（4~8 周；渐进 + 减量周）
 * @param {Object} opts { user, goal, totalWeeks, name, weeklyFrequency }
 * @returns {Promise<Object>} 创建的周期
 */
async function createCycle(opts) {
  const totalWeeks = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.round(Number(opts.totalWeeks) || 8)));
  const goal = opts.goal || '增肌';
  const startDate = formatDate(new Date());
  const endDate = addDays(startDate, totalWeeks * 7 - 1);
  const templateDays = await buildTemplateDays(opts.user);
  const deloadWeek = getDeloadWeek(totalWeeks);

  // 生成每周计划（渐进 + 减量周）
  const weeks = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const deload = w === deloadWeek;
    weeks.push({
      week_no: w,
      deload,
      adjust: buildAdjust(goal, w, totalWeeks, deload),
      note: deload ? '减量周：降低重量与组数，促进恢复' : '',
      days: JSON.parse(JSON.stringify(templateDays))
    });
  }

  const data = {
    name: String(opts.name || goal + '周期 ' + startDate.slice(0, 7)),
    goal,
    start_date: startDate,
    end_date: endDate,
    total_weeks: totalWeeks,
    weekly_frequency: Math.min(7, Math.max(0, Number(opts.weeklyFrequency) || 0)),
    status: 'active',
    weeks,
    final_summary: null,
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  };
  const res = await db.collection(CYCLE_COLLECTION).add({ data });
  invalidateCycleCache();
  const created = Object.assign({ _id: res._id }, data);
  // 生成当前周的周总结占位（统计在周结束后补全）
  await ensureWeekSummary(res._id, getCurrentWeek(startDate, endDate) || 1);
  return created;
}

// ===== 周计划读取（周期优先级入口） =====

/**
 * 周期当前周的今日动作（周期优先级核心）
 * @param {Object} cycle 周期文档
 * @returns {Object} { isRestDay, weekday, partsText, exercises: [{ _id, name, sets, reps, repsUnit, restSeconds, category, suggestedWeightKg }], currentWeek, totalWeeks }
 *   exercises 的 sets/reps 已应用该周 adjust；suggestedWeightKg 基于历史表现（无数据为 null）
 */
async function getTodayCyclePlan(cycle) {
  const currentWeek = getCurrentWeek(cycle.start_date, cycle.end_date);
  if (!currentWeek) return null;
  const week = (cycle.weeks || []).find((w) => w.week_no === currentWeek) || (cycle.weeks || [])[0];
  if (!week) return null;

  const idx = todayIndex();
  const day = week.days[idx];
  const weekday = require('./recommend').WEEK_DAYS[idx];

  if (!day || day.isRest || !day.exercise_ids || day.exercise_ids.length === 0) {
    return {
      isRestDay: true,
      weekday,
      partsText: '休息日',
      exercises: [],
      currentWeek,
      totalWeeks: cycle.total_weeks,
      deload: !!week.deload
    };
  }

  const exerciseService = require('./exercise');
  const list = await exerciseService.getExercisesByIds(day.exercise_ids);
  const adjust = week.adjust || { sets_delta: 0, reps_delta: 0, weight_delta_pct: 0 };

  const exercises = [];
  for (const e of list) {
    // 渐进调整组数/次数（数据规则）
    const sets = Math.max(1, (Number(e.recommended_sets) || 3) + (adjust.sets_delta || 0));
    const reps = Math.max(1, (Number(e.recommended_reps) || 10) + (adjust.reps_delta || 0));
    // 建议重量：基于该动作最近表现（数据依据，无历史返回 null）
    let suggestedWeightKg = null;
    try {
      const last = await require('./workout').getLastPerformance(e._id);
      if (last && last.suggestion && last.suggestion.nextWeightKg) {
        suggestedWeightKg =
          Math.round(last.suggestion.nextWeightKg * (1 + (adjust.weight_delta_pct || 0) / 100) * 2) / 2;
      }
    } catch (err) {
      // 建议重量查询失败不影响计划
    }
    exercises.push({
      _id: e._id,
      name: e.name,
      sets,
      reps,
      repsUnit: e.reps_unit || '次',
      restSeconds: e.rest_seconds,
      category: e.category,
      difficulty: e.difficulty,
      equipment: e.equipment,
      targetMuscle: (e.target_muscle || []).join(' / '),
      suggestedWeightKg
    });
  }

  // 部位文本
  const cats = [];
  exercises.forEach((x) => {
    if (cats.indexOf(x.category) < 0) cats.push(x.category);
  });

  return {
    isRestDay: false,
    weekday,
    partsText: cats.join(' + ') || cycle.goal || '周期训练',
    exercises,
    currentWeek,
    totalWeeks: cycle.total_weeks,
    deload: !!week.deload,
    cycleName: cycle.name || ''
  };
}

/**
 * 获取周期当前周完整计划（7 天，周期页展示）
 * @returns {Promise<Object|null>} { cycleId, currentWeek, totalWeeks, deload, days: [{day, isRest, exerciseNames, adjustText}] }
 */
async function getCurrentWeekPlan() {
  const cycle = await getActiveCycle();
  if (!cycle) return null;
  const currentWeek = getCurrentWeek(cycle.start_date, cycle.end_date);
  if (!currentWeek) return null;
  const week = (cycle.weeks || []).find((w) => w.week_no === currentWeek) || (cycle.weeks || [])[0];

  // 批量查动作名
  const allIds = [];
  (week.days || []).forEach((d) => {
    (d.exercise_ids || []).forEach((id) => allIds.push(id));
  });
  const exerciseService = require('./exercise');
  const exList = await exerciseService.getExercisesByIds(allIds);
  const exMap = {};
  exList.forEach((e) => {
    exMap[e._id] = e.name;
  });

  const days = (week.days || []).map((d) => ({
    day: d.day,
    isRest: !!d.isRest,
    names: (d.exercise_ids || []).map((id) => exMap[id] || ''),
    count: (d.exercise_ids || []).length
  }));

  return {
    cycleId: cycle._id,
    cycleName: cycle.name || '',
    goal: cycle.goal || '',
    currentWeek,
    totalWeeks: cycle.total_weeks,
    deload: !!week.deload,
    deloadNote: week.note || '',
    adjust: week.adjust || { sets_delta: 0, reps_delta: 0, weight_delta_pct: 0 },
    days
  };
}

// ===== 每周总结 =====

/**
 * 计算某周统计（程序计算）
 * @param {Object} cycle 周期
 * @param {number} weekNo
 * @returns {Promise<Object>} summary 统计对象
 */
async function computeWeekStats(cycle, weekNo) {
  const { start, end } = getWeekRange(cycle.start_date, weekNo);
  const week = (cycle.weeks || []).find((w) => w.week_no === weekNo);
  const plannedIds = new Set();
  (week ? week.days : []).forEach((d) => {
    (d.exercise_ids || []).forEach((id) => plannedIds.add(id));
  });

  // 训练记录（周窗口）
  const records = await getAllByWhere(
    'workout_records',
    { _openid: '{openid}' },
    { orderField: 'workout_date', orderDir: 'asc', max: 500 }
  );
  const inWeek = records.filter((r) => r.workout_date >= start && r.workout_date <= end);

  // 训练天数 / 完成动作（计划内去重）
  const dateSet = {};
  const doneIds = new Set();
  inWeek.forEach((r) => {
    if (r.workout_date) dateSet[r.workout_date] = true;
    if (r.completed && r.exercise_id && plannedIds.has(r.exercise_id)) doneIds.add(r.exercise_id);
  });
  const trainingDays = Object.keys(dateSet).length;
  const completedCount = doneIds.size;
  const plannedCount = plannedIds.size;
  const completionRate = plannedCount > 0 ? Math.min(100, Math.round((completedCount / plannedCount) * 100)) : 0;

  // 容量合计
  let totalVolume = 0;
  inWeek.forEach((r) => {
    totalVolume += analysis.computeRecordStats(r).volume;
  });

  // PR 数（周内 vs 周前，按动作对比）
  const before = records.filter((r) => r.workout_date < start);
  const prCount = countPRs(before, inWeek);

  // 体重变化（周内首末）
  let weightChange = null;
  try {
    const wRes = await db
      .collection('weight_records')
      .where({ _openid: '{openid}', date: db.command.gte(start).and(db.command.lte(end)) })
      .orderBy('date', 'asc')
      .limit(20)
      .get();
    if (wRes.data.length >= 1) {
      weightChange =
        wRes.data.length >= 2
          ? Math.round((wRes.data[wRes.data.length - 1].weight_kg - wRes.data[0].weight_kg) * 10) / 10
          : 0;
    }
  } catch (err) {
    // 体重集合缺失忽略
  }

  // 饮水达标天数
  let waterDays = 0;
  try {
    const waterRes = await getAllByWhere(
      'water_records',
      { _openid: '{openid}' },
      { orderField: 'date', orderDir: 'asc', max: 500 }
    );
    const groups = {};
    waterRes.forEach((r) => {
      if (r.date >= start && r.date <= end) {
        if (!groups[r.date]) groups[r.date] = { total: 0, target: r.daily_target_ml || 0 };
        groups[r.date].total += r.amount_ml || 0;
        if (!groups[r.date].target && r.daily_target_ml) groups[r.date].target = r.daily_target_ml;
      }
    });
    Object.keys(groups).forEach((d) => {
      const g = groups[d];
      if (g.target > 0 && g.total >= g.target) waterDays++;
    });
  } catch (err) {
    // 忽略
  }

  // 恢复均值与疼痛
  let sleepAvg = 0;
  let fatigueAvg = 0;
  let sorenessAvg = 0;
  let painDetected = false;
  try {
    const recRes = await db
      .collection('recovery_records')
      .where({ _openid: '{openid}', date: db.command.gte(start).and(db.command.lte(end)) })
      .limit(30)
      .get();
    const recs = recRes.data;
    if (recs.length > 0) {
      sleepAvg = Math.round((recs.reduce((s, r) => s + (Number(r.sleep_quality) || 0), 0) / recs.length) * 10) / 10;
      fatigueAvg = Math.round((recs.reduce((s, r) => s + (Number(r.fatigue) || 0), 0) / recs.length) * 10) / 10;
      sorenessAvg = Math.round((recs.reduce((s, r) => s + (Number(r.soreness) || 0), 0) / recs.length) * 10) / 10;
      painDetected = recs.some((r) => {
        const state = require('../utils/training-state');
        return state.detectPain(r.note) || (r.fatigue >= 5 && r.soreness >= 4);
      });
    }
  } catch (err) {
    // 忽略
  }

  return {
    week_no: weekNo,
    start_date: start,
    end_date: end,
    training_days: trainingDays,
    planned_exercises: plannedCount,
    completed_exercises: completedCount,
    completion_rate: completionRate,
    total_volume: Math.round(totalVolume),
    pr_count: prCount,
    weight_change_kg: weightChange,
    water_days: waterDays,
    recovery: {
      sleep_avg: sleepAvg,
      fatigue_avg: fatigueAvg,
      soreness_avg: sorenessAvg
    },
    pain_detected: painDetected
  };
}

// 周内 PR 计数（严格大于周前 PR 才算）
function countPRs(before, inWeek) {
  const beforeByEx = {};
  before.forEach((r) => {
    if (!r.exercise_id) return;
    if (!beforeByEx[r.exercise_id]) beforeByEx[r.exercise_id] = [];
    beforeByEx[r.exercise_id].push(r);
  });
  const inWeekByEx = {};
  inWeek.forEach((r) => {
    if (!r.exercise_id) return;
    if (!inWeekByEx[r.exercise_id]) inWeekByEx[r.exercise_id] = [];
    inWeekByEx[r.exercise_id].push(r);
  });

  let count = 0;
  Object.keys(inWeekByEx).forEach((exId) => {
    const beforePrs = analysis.computePRs(beforeByEx[exId] || []);
    const allPrs = analysis.computePRs((beforeByEx[exId] || []).concat(inWeekByEx[exId]));
    if (allPrs.maxWeightPR && (!beforePrs.maxWeightPR || allPrs.maxWeightPR.value > beforePrs.maxWeightPR.value)) count++;
    if (allPrs.maxRepsPR && (!beforePrs.maxRepsPR || allPrs.maxRepsPR.value > beforePrs.maxRepsPR.value)) count++;
    if (allPrs.maxVolumePR && (!beforePrs.maxVolumePR || allPrs.maxVolumePR.value > beforePrs.maxVolumePR.value)) count++;
  });
  return count;
}

// 周总结 AI 文案（本地规则，基于统计拼接；AI 可在对话中解释）
function buildWeekAiSummary(summary, prevSummary, state) {
  const performance =
    '本周训练 ' + summary.training_days + ' 天，完成率 ' + summary.completion_rate + '%，训练容量 ' +
    summary.total_volume + 'kg' + (summary.pr_count > 0 ? '，创造 ' + summary.pr_count + ' 项新纪录' : '') + '。';

  const improvements = [];
  if (prevSummary) {
    if (summary.total_volume > prevSummary.total_volume) {
      improvements.push('容量较上周提升 ' + Math.round((summary.total_volume / Math.max(1, prevSummary.total_volume) - 1) * 100) + '%');
    } else if (summary.total_volume < prevSummary.total_volume) {
      improvements.push('容量较上周下降（恢复或减量周属正常）');
    } else {
      improvements.push('容量与上周持平');
    }
  }
  if (summary.pr_count > 0) improvements.push('刷新 ' + summary.pr_count + ' 项个人纪录');
  if (improvements.length === 0) improvements.push('训练节奏稳定');

  const problems = [];
  if (summary.completion_rate < 70) problems.push('完成率偏低（' + summary.completion_rate + '%），可能有缺席');
  if (summary.pain_detected) problems.push('身体反馈中有疼痛/不适信号，注意安全');
  if (summary.recovery && summary.recovery.fatigue_avg >= 4) problems.push('周内平均疲劳度偏高（' + summary.recovery.fatigue_avg + '/5）');
  if (summary.recovery && summary.recovery.sleep_avg <= 2) problems.push('周内睡眠质量偏低（' + summary.recovery.sleep_avg + '/5）');
  if (summary.weight_change_kg !== null && summary.weight_change_kg > 1) problems.push('体重上升 ' + summary.weight_change_kg + 'kg，注意饮食');
  if (problems.length === 0) problems.push('本周无明显问题');

  // 下周建议（基于统计 + 训练状态）
  let advice = '';
  if (state && state.state === 'REDUCE') advice = '下周建议降低训练量：减少动作或组数，优先恢复';
  else if (state && state.state === 'RECOVERY') advice = '下周建议以恢复为主，低强度活动或休息';
  else if (state && state.state === 'REST') advice = '下周建议安排休息日，充分恢复后再继续';
  else if (summary.completion_rate < 70) advice = '下周建议提高计划完成度，尽量按计划训练';
  else advice = '下周建议保持当前训练节奏，继续渐进增加负荷';

  return { performance, improvements, problems, next_week_advice: advice };
}

/**
 * 生成（幂等）某周总结：统计程序计算 + 文案本地规则
 * @param {string} cycleId 周期 _id
 * @param {number} weekNo 周号
 * @returns {Promise<Object|null>} 周总结文档
 */
async function ensureWeekSummary(cycleId, weekNo) {
  const cycle = await getCycleById(cycleId);
  if (!cycle) return null;
  const { start, end } = getWeekRange(cycle.start_date, weekNo);

  // 幂等：已生成且周未结束 → 直接返回（周结束后强制重算）
  const exists = await db
    .collection(WEEK_COLLECTION)
    .where({ _openid: '{openid}', cycle_id: cycleId, week_no: weekNo })
    .limit(1)
    .get();
  const weekOver = isCycleOver(end);
  if (exists.data.length > 0 && !weekOver) {
    return exists.data[0];
  }

  const summary = await computeWeekStats(cycle, weekNo);
  // 上周总结（用于对比）
  let prevSummary = null;
  if (weekNo > 1) {
    const prev = await db
      .collection(WEEK_COLLECTION)
      .where({ _openid: '{openid}', cycle_id: cycleId, week_no: weekNo - 1 })
      .limit(1)
      .get();
    prevSummary = prev.data.length > 0 ? prev.data[0].summary : null;
  }
  // 训练状态（用于下周建议）
  let state = null;
  try {
    const workoutService = require('./workout');
    const recoveryService = require('./recovery');
    const load = await workoutService.getTrainingLoadStats();
    const recovery = await recoveryService.getTodayRecovery();
    const stateUtil = require('../utils/training-state');
    state = stateUtil.computeTrainingState({
      recovery,
      consecutiveDays: load ? load.consecutiveDays : 0,
      weekTrainingDays: load ? load.weekTrainingDays : 0,
      volumeTrend: load ? load.volumeTrend : 'flat',
      painNote: recovery ? recovery.note : ''
    });
  } catch (err) {
    // 忽略
  }

  const aiSummary = buildWeekAiSummary(summary, prevSummary, state);
  const payload = {
    cycle_id: cycleId,
    week_no: weekNo,
    start_date: start,
    end_date: end,
    summary,
    ai_summary: aiSummary,
    status: weekOver ? 'completed' : 'active',
    updated_at: db.serverDate()
  };

  if (exists.data.length > 0) {
    await db.collection(WEEK_COLLECTION).doc(exists.data[0]._id).update({ data: payload });
  } else {
    payload.created_at = db.serverDate();
    await db.collection(WEEK_COLLECTION).add({ data: payload });
  }
  invalidateCycleCache();
  return Object.assign({}, payload, { _id: exists.data.length > 0 ? exists.data[0]._id : '' });
}

/**
 * 补生成所有已结束周的总结（周期页加载时调用）
 * @param {string} cycleId
 */
async function ensureCompletedWeekSummaries(cycleId) {
  const cycle = await getCycleById(cycleId);
  if (!cycle) return;
  const currentWeek = getCurrentWeek(cycle.start_date, cycle.end_date) || cycle.total_weeks;
  for (let w = 1; w < currentWeek; w++) {
    await ensureWeekSummary(cycleId, w);
  }
}

/**
 * 周期 + 全部周总结
 * @returns {Promise<Object|null>} { cycle, summaries }
 */
async function getCycleWithSummaries() {
  const cycle = await getActiveCycle();
  if (!cycle) return null;
  const currentWeek = getCurrentWeek(cycle.start_date, cycle.end_date) || 1;
  // 补生成已结束周总结
  await ensureCompletedWeekSummaries(cycle._id);

  const res = await db
    .collection(WEEK_COLLECTION)
    .where({ _openid: '{openid}', cycle_id: cycle._id })
    .orderBy('week_no', 'asc')
    .limit(20)
    .get();
  return { cycle, currentWeek, summaries: res.data };
}

// ===== 周期总结 =====

/**
 * 生成周期总结（程序计算 + 本地规则文案）
 * @param {string} cycleId
 * @returns {Promise<Object|null>} final_summary
 */
async function completeCycle(cycleId) {
  const cycle = await getCycleById(cycleId);
  if (!cycle) return null;
  // 确保所有周总结已生成
  await ensureCompletedWeekSummaries(cycleId);

  const weekRes = await db
    .collection(WEEK_COLLECTION)
    .where({ _openid: '{openid}', cycle_id: cycleId })
    .orderBy('week_no', 'asc')
    .limit(20)
    .get();
  const summaries = weekRes.data;

  let totalVolume = 0;
  let prTotal = 0;
  let trainingDays = 0;
  let completionSum = 0;
  summaries.forEach((w) => {
    totalVolume += w.summary.total_volume || 0;
    prTotal += w.summary.pr_count || 0;
    trainingDays += w.summary.training_days || 0;
    completionSum += w.summary.completion_rate || 0;
  });
  const completionRate = summaries.length > 0 ? Math.round(completionSum / summaries.length) : 0;

  // 体重变化（周期首末）
  let weightChange = null;
  try {
    const wRes = await db
      .collection('weight_records')
      .where({ _openid: '{openid}' })
      .orderBy('date', 'asc')
      .limit(100)
      .get();
    const inRange = wRes.data.filter((r) => r.date >= cycle.start_date && r.date <= cycle.end_date);
    if (inRange.length >= 2) {
      weightChange = Math.round((inRange[inRange.length - 1].weight_kg - inRange[0].weight_kg) * 10) / 10;
    } else if (inRange.length === 1) {
      weightChange = 0;
    }
  } catch (err) {
    // 忽略
  }

  // 表现变化：首周 vs 末周平均容量
  let performanceChange = null;
  if (summaries.length >= 2) {
    const first = summaries[0].summary.total_volume || 0;
    const last = summaries[summaries.length - 1].summary.total_volume || 0;
    if (first > 0) {
      performanceChange = Math.round((last / first - 1) * 100);
    }
  }

  const summary = {
    completion_rate: completionRate,
    total_training_days: trainingDays,
    total_volume: totalVolume,
    pr_total: prTotal,
    weight_change_kg: weightChange,
    performance_change_pct: performanceChange
  };

  // AI 文案（本地规则，数据依据）
  const aiSummary = {
    summary_text:
      '本周期共训练 ' + trainingDays + ' 天，完成率 ' + completionRate + '%，总容量 ' + totalVolume + 'kg，' +
      '刷新 ' + prTotal + ' 项个人纪录' + (weightChange !== null ? '，体重变化 ' + (weightChange >= 0 ? '+' : '') + weightChange + 'kg' : '') + '。',
    improvement:
      prTotal > 0 ? '周期内表现稳步提升，共刷新 ' + prTotal + ' 项纪录，训练容量充足。' :
      performanceChange !== null && performanceChange > 0 ? '训练容量整体上升 ' + performanceChange + '%，表现进步。' :
      '本周期以稳定积累为主，保持训练连续性。',
    problem:
      completionRate < 70 ? '计划完成率偏低（' + completionRate + '%），建议下周期合理安排日程减少缺席。' :
      summaries.some((w) => w.summary.pain_detected) ? '周期内出现身体不适反馈，下周期注意恢复与动作安全。' :
      '无明显问题。',
    next_cycle_advice:
      performanceChange !== null && performanceChange < -10 ? '容量有所下降，下周期建议从较轻负荷开始，逐步回升。' :
      '下周期可继续渐进增加负荷（每 2 周小幅加重），并保持 1 次减量周安排。'
  };

  const payload = { status: 'completed', final_summary: { summary, ai_summary: aiSummary }, updated_at: db.serverDate() };
  await db.collection(CYCLE_COLLECTION).doc(cycleId).update({ data: payload });
  invalidateCycleCache();
  return payload.final_summary;
}

/**
 * 放弃周期（标记 abandoned，不生成周期总结）
 * @param {string} cycleId
 */
async function abandonCycle(cycleId) {
  await db
    .collection(CYCLE_COLLECTION)
    .doc(cycleId)
    .update({ data: { status: 'abandoned', updated_at: db.serverDate() } });
  invalidateCycleCache();
}

module.exports = {
  createCycle,
  getActiveCycle,
  getCycleById,
  getCycles,
  getTodayCyclePlan,
  getCurrentWeekPlan,
  getCycleWithSummaries,
  ensureWeekSummary,
  ensureCompletedWeekSummaries,
  completeCycle,
  abandonCycle,
  getWeekRange,
  getCurrentWeek
};
