// services/workout.js - 训练数据层
// 职责：
//   1. 训练统计（本周/本月/累计次数，按日期去重）
//   2. 动作完成记录（幂等写入：同一天同一动作只保留一条完成记录）
//   3. 今日完成状态查询（页面持久化展示）
//   4. 【v2】力量训练明细记录：每个动作一条文档，内嵌 set_records 数组
//      （每组重量/次数/RPE/力竭/休息），外加计划组数/次数、实际组数、动作备注、
//      动作起止时间与动作耗时 —— 避免为每组数据创建大量无意义文档
//   5. 【v2】训练会话（workout_sessions）：训练计时器状态与训练总时长（每会话 1 条文档）
//   6. 【v2】训练草稿（本地存储）：训练中自动保存，退出页面/杀进程不丢数据
// 口径：
//   - 完成记录唯一键：openid + workout_date + exercise_id
//     （不用 plan_id 参与判断：AI 云函数写入的历史记录没有 plan_id，避免重复插入）
//   - workout_date 严格区分日期：昨天的完成状态不会受今天影响
//   - 兼容旧数据（v1）：旧记录没有 v2 字段时，读取端自动回退（planned_sets || sets 等），
//     页面/统计/AI 全部不报错；旧字段 sets/reps 继续同步写入，保持对外语义不变
// 安全：所有查询按 _openid 过滤
const { getAllByWhere } = require('../utils/db');
const { formatDate, getMondayDate, getMonthStartDate } = require('../utils/date');
const cache = require('../utils/cache');
const analysis = require('../utils/workout-analysis');

const db = wx.cloud.database();
const COLLECTION = 'workout_records';
const SESSION_COLLECTION = 'workout_sessions';

// 缓存键与有效期
const SUMMARY_CACHE_KEY = 'workout_summary';
const SUMMARY_CACHE_TTL = 60 * 60 * 1000; // 1 小时
const COMPLETED_CACHE_TTL = 24 * 60 * 60 * 1000; // 当天有效（键含日期）
const DRAFT_KEY = 'workout_draft';
// 训练表现分析缓存：TTL 5 分钟兜底 + 数据变更时由 invalidateWorkoutCache 立即失效
const ANALYSIS_TTL = 5 * 60 * 1000;
// 已设置的分析缓存键（内存注册表）：训练数据变化时逐个失效
const analysisCacheKeys = [];

// ===== v1/v2 兼容读取（旧记录缺失新字段时回退，页面不报错） =====

// 计划组数：v2 优先，回退 v1 的 sets
function getPlannedSets(r) {
  return Number(r.planned_sets) || Number(r.sets) || 0;
}

// 计划次数：v2 优先，回退 v1 的 reps
function getPlannedReps(r) {
  return Number(r.planned_reps) || Number(r.reps) || 0;
}

// 每组明细数组：旧记录没有时返回空数组
function getSetRecords(r) {
  return Array.isArray(r.set_records) ? r.set_records : [];
}

// 实际完成组数：显式 actual_sets 优先，其次 set_records 长度，最后回退 v1 sets
function getActualSets(r) {
  const n = Number(r.actual_sets);
  if (n > 0) return n;
  const arr = getSetRecords(r);
  if (arr.length > 0) return arr.length;
  return Number(r.sets) || 0;
}

// 总训练容量 = Σ(重量 × 次数)，用于长期追踪负荷变化
function getTotalVolume(r) {
  const arr = getSetRecords(r);
  if (arr.length === 0) return 0;
  return arr.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
}

// 完成记录摘要文本（如「3组 · 总容量720kg」；无明细返回空串，页面不展示）
function getSetsText(r) {
  const arr = getSetRecords(r);
  if (arr.length === 0) return '';
  const vol = Math.round(getTotalVolume(r));
  return arr.length + '组' + (vol > 0 ? ' · 总容量' + vol + 'kg' : '');
}

// 统一输出给页面/工具的安全记录对象（缺字段全部有默认值）
function normalizeRecord(r) {
  return {
    _id: r._id,
    exercise_id: r.exercise_id,
    exercise_name: r.exercise_name || '',
    workout_date: r.workout_date,
    plan_id: r.plan_id || '',
    completed: !!r.completed,
    completed_at: r.completed_at || '',
    planned_sets: getPlannedSets(r),
    planned_reps: getPlannedReps(r),
    actual_sets: getActualSets(r),
    set_records: getSetRecords(r),
    total_volume: getTotalVolume(r),
    note: r.note || '',
    started_at: r.started_at || '',
    ended_at: r.ended_at || '',
    duration_minutes: Number(r.duration_minutes) || 0,
    session_id: r.session_id || ''
  };
}

// ===== 内部工具 =====

function completedCacheKey() {
  return 'workout_completed_' + formatDate(new Date());
}

// 分析缓存键（按内容区分）
function analysisKey(scope, id, suffix) {
  return 'workout_ana_' + scope + '_' + (id || 'all') + (suffix ? '_' + suffix : '');
}

// 记忆已设置的分析缓存键（供失效）
function rememberAnalysisKey(key) {
  if (analysisCacheKeys.indexOf(key) < 0) analysisCacheKeys.push(key);
}

// 读取分析缓存（命中即返回，并记忆键以便失效）
function analysisCacheGet(key) {
  const v = cache.get(key);
  if (v !== null) rememberAnalysisKey(key);
  return v;
}

// 写入分析缓存（记忆键 + TTL 兜底）
function analysisCacheSet(key, value) {
  rememberAnalysisKey(key);
  cache.set(key, value, ANALYSIS_TTL);
}

// 完成状态/统计/训练表现变化后失效缓存
// （写入/修改/删除训练记录都会走到这里 → 所有分析缓存立即失效）
function invalidateWorkoutCache() {
  cache.remove(completedCacheKey());
  cache.remove(SUMMARY_CACHE_KEY);
  // 首页「今日建议」聚合缓存（键名约定，与 advice.js 一致）
  cache.remove('home_advice');
  analysisCacheKeys.forEach((k) => cache.remove(k));
  analysisCacheKeys.length = 0;
}

// 当前时间字符串 YYYY-MM-DD HH:mm（用于 completed_at / 起止时间展示）
function nowStr() {
  const d = new Date();
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return formatDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/**
 * 训练统计：本周 / 本月 / 累计训练次数（按 workout_date 去重）
 * @returns {Promise<Object>} { week, month, total, dates }
 */
async function getWorkoutSummary() {
  try {
    const cached = cache.get(SUMMARY_CACHE_KEY);
    if (cached) return cached;

    const records = await getAllByWhere(
      COLLECTION,
      { _openid: '{openid}' },
      { orderField: 'workout_date', orderDir: 'asc', max: 500 }
    );

    const dateSet = {};
    records.forEach((r) => {
      if (r.workout_date) dateSet[r.workout_date] = true;
    });
    const dates = Object.keys(dateSet).sort();

    const today = formatDate(new Date());
    const monday = getMondayDate(new Date());
    const monthStart = getMonthStartDate(new Date());

    let week = 0;
    let month = 0;
    dates.forEach((d) => {
      if (d >= monday && d <= today) week++;
      if (d >= monthStart && d <= today) month++;
    });

    const result = { week, month, total: dates.length, dates };
    cache.set(SUMMARY_CACHE_KEY, result, SUMMARY_CACHE_TTL);
    return result;
  } catch (err) {
    console.error('[workout] getWorkoutSummary 失败', err);
    throw err;
  }
}

/**
 * 标记动作完成（幂等）—— 快速勾选入口（训练页/详情页共用）
 * 同一天同一动作已存在完成记录时：不重复插入，仅补齐缺失字段
 * （不会覆盖 v2 明细 set_records，两者互不干扰）
 * @param {Object} param
 * @param {string} param.exerciseId 动作 _id（必须来自动作库）
 * @param {string} param.exerciseName 动作名称
 * @param {number} param.sets 计划组数
 * @param {number} param.reps 计划次数
 * @param {string} param.planId 训练计划标识（当日部位组合，如 '背 + 二头'）
 * @returns {Promise<Object>} { inserted: boolean, id }
 */
async function markExerciseCompleted({ exerciseId, exerciseName, sets, reps, planId }) {
  try {
    const date = formatDate(new Date());
    const completedAt = nowStr();
    const plannedSets = Number(sets) || 0;
    const plannedReps = Number(reps) || 0;

    // 幂等检查：openid + workout_date + exercise_id
    const exist = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}', workout_date: date, exercise_id: exerciseId })
      .limit(1)
      .get();

    if (exist.data.length > 0) {
      // 已存在 → 不重复插入，只补齐缺失的完成/计划信息（保留已有 set_records）
      const doc = exist.data[0];
      const updateData = { completed: true };
      if (!doc.completed_at) updateData.completed_at = completedAt;
      if (!doc.exercise_name) updateData.exercise_name = exerciseName;
      if (!doc.plan_id) updateData.plan_id = planId || '';
      if (!doc.planned_sets && plannedSets) updateData.planned_sets = plannedSets;
      if (!doc.planned_reps && plannedReps) updateData.planned_reps = plannedReps;
      if (!doc.sets && plannedSets) updateData.sets = plannedSets;
      if (!doc.reps && plannedReps) updateData.reps = plannedReps;
      if (!doc.data_version) updateData.data_version = 2;
      await db.collection(COLLECTION).doc(doc._id).update({ data: updateData });
      invalidateWorkoutCache();
      return { inserted: false, id: doc._id };
    }

    // 不存在 → 新增完成记录（同时写入 v2 字段，旧字段同步，保证兼容）
    const res = await db.collection(COLLECTION).add({
      data: {
        exercise_id: exerciseId,
        exercise_name: exerciseName,
        workout_date: date,
        plan_id: planId || '',
        sets: plannedSets,
        reps: plannedReps,
        planned_sets: plannedSets,
        planned_reps: plannedReps,
        actual_sets: 0,
        set_records: [],
        completed: true,
        completed_at: completedAt,
        data_version: 2,
        created_at: db.serverDate()
      }
    });
    invalidateWorkoutCache();
    return { inserted: true, id: res._id };
  } catch (err) {
    console.error('[workout] markExerciseCompleted 失败', err);
    throw err;
  }
}

/**
 * 取消完成：将今日该动作的完成记录标记为未完成
 * 保留记录（completed: false），再次完成时走幂等更新，不会重复插入
 * @param {string} exerciseId 动作 _id
 */
async function markExerciseIncomplete(exerciseId) {
  try {
    const date = formatDate(new Date());
    await db
      .collection(COLLECTION)
      .where({
        _openid: '{openid}',
        workout_date: date,
        exercise_id: exerciseId,
        completed: true
      })
      .update({ data: { completed: false } });
    invalidateWorkoutCache();
  } catch (err) {
    console.error('[workout] markExerciseIncomplete 失败', err);
    throw err;
  }
}

/**
 * 删除某天某动作的训练记录（数据纠错/清理入口）
 * @param {string} exerciseId 动作 _id
 * @param {string} [workoutDate] 日期，默认今天
 */
async function deleteExerciseRecord(exerciseId, workoutDate) {
  const date = workoutDate || formatDate(new Date());
  await db
    .collection(COLLECTION)
    .where({ _openid: '{openid}', workout_date: date, exercise_id: exerciseId })
    .remove();
  invalidateWorkoutCache();
}

/**
 * 今日已完成动作状态表
 * 性能：缓存当天（完成/取消后自动失效）
 * v2 扩展：附带 actualSets / setsText（「3组 · 总容量720kg」）供列表展示
 * @returns {Promise<Object>} { [exerciseId]: { completedAt, recordId, actualSets, setsText } }
 */
async function getTodayCompletedMap() {
  const key = completedCacheKey();
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const date = formatDate(new Date());
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}', workout_date: date, completed: true })
      .get();
    const map = {};
    res.data.forEach((r) => {
      map[r.exercise_id] = {
        completedAt: r.completed_at || '',
        recordId: r._id,
        actualSets: getActualSets(r),
        setsText: getSetsText(r)
      };
    });
    cache.set(key, map, COMPLETED_CACHE_TTL);
    return map;
  } catch (err) {
    console.error('[workout] getTodayCompletedMap 失败', err);
    throw err;
  }
}

/**
 * 获取今日全部训练记录（含 v2 明细），训练编辑器恢复用
 * @returns {Promise<Array>} 规范化后的记录数组
 */
async function getTodayRecords() {
  const date = formatDate(new Date());
  const res = await db
    .collection(COLLECTION)
    .where({ _openid: '{openid}', workout_date: date })
    .get();
  return res.data.map(normalizeRecord);
}

/**
 * 保存/更新单个动作的训练明细（v2 主写入入口）
 * 幂等：openid + workout_date + exercise_id 已存在则更新（完整覆盖明细），否则新增
 * @param {Object} record
 * @param {string} record.exerciseId 动作 _id
 * @param {string} record.exerciseName 动作名称
 * @param {string} [record.workoutDate] 训练日期，默认今天
 * @param {string} [record.planId] 计划标识
 * @param {number} [record.plannedSets] 计划组数
 * @param {number} [record.plannedReps] 计划次数
 * @param {Array} [record.setRecords] 每组明细 [{ weight, reps, rpe, is_failure, rest_seconds }]
 * @param {string} [record.note] 动作备注
 * @param {string} [record.startedAt] 动作开始时间
 * @param {string} [record.endedAt] 动作结束时间
 * @param {number} [record.durationMinutes] 动作耗时（分钟，可为小数）
 * @param {boolean} [record.completed] 是否已完成
 * @param {string} [record.sessionId] 关联的训练会话 _id
 * @returns {Promise<Object>} { id, inserted }
 */
async function upsertExerciseRecord(record) {
  try {
    const date = record.workoutDate || formatDate(new Date());
    const exerciseId = record.exerciseId;
    if (!exerciseId) throw new Error('exerciseId 必填');

    const setRecords = Array.isArray(record.setRecords) ? record.setRecords : [];
    const plannedSets = Number(record.plannedSets) || 0;
    const plannedReps = Number(record.plannedReps) || 0;

    const base = {
      exercise_name: record.exerciseName || '',
      plan_id: record.planId || '',
      // 旧字段同步（保持 v1 读取兼容：sets/reps 仍是计划组数/次数）
      sets: plannedSets,
      reps: plannedReps,
      // v2 字段
      planned_sets: plannedSets,
      planned_reps: plannedReps,
      set_records: setRecords,
      actual_sets: setRecords.length,
      note: record.note || '',
      started_at: record.startedAt || '',
      ended_at: record.endedAt || '',
      duration_minutes: Number(record.durationMinutes) || 0,
      session_id: record.sessionId || '',
      completed: !!record.completed,
      data_version: 2,
      updated_at: db.serverDate()
    };

    const exist = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}', workout_date: date, exercise_id: exerciseId })
      .limit(1)
      .get();

    if (exist.data.length > 0) {
      const doc = exist.data[0];
      const updateData = Object.assign({}, base);
      // 已完成且原记录没有完成时间 → 补上（保留已有完成时间）
      if (base.completed && !doc.completed_at) updateData.completed_at = nowStr();
      await db.collection(COLLECTION).doc(doc._id).update({ data: updateData });
      invalidateWorkoutCache();
      return { id: doc._id, inserted: false };
    }

    const addData = Object.assign({}, base, {
      exercise_id: exerciseId,
      workout_date: date,
      created_at: db.serverDate()
    });
    if (addData.completed) addData.completed_at = nowStr();
    const res = await db.collection(COLLECTION).add({ data: addData });
    invalidateWorkoutCache();
    return { id: res._id, inserted: true };
  } catch (err) {
    console.error('[workout] upsertExerciseRecord 失败', err);
    throw err;
  }
}

// ===== 训练会话（workout_sessions） =====

/**
 * 创建一次训练会话（训练计时器启动时调用）
 * @param {Object} data { workoutDate, planId, partsText, startedAt, endedAt, durationMinutes, status }
 * @returns {Promise<string>} 会话 _id
 */
async function createWorkoutSession(data) {
  const res = await db.collection(SESSION_COLLECTION).add({
    data: {
      workout_date: data.workoutDate || formatDate(new Date()),
      plan_id: data.planId || '',
      parts_text: data.partsText || '',
      started_at: data.startedAt || nowStr(),
      ended_at: data.endedAt || '',
      duration_minutes: Number(data.durationMinutes) || 0,
      status: data.status || 'active',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  return res._id;
}

/**
 * 更新训练会话（暂停/继续/结束时调用）
 * @param {string} sessionId 会话 _id
 * @param {Object} data { status?, endedAt?, startedAt?, durationMinutes?, planId?, partsText? }
 */
async function updateWorkoutSession(sessionId, data) {
  const payload = { updated_at: db.serverDate() };
  if (data.status) payload.status = data.status;
  if (data.endedAt !== undefined) payload.ended_at = data.endedAt;
  if (data.startedAt !== undefined) payload.started_at = data.startedAt;
  if (data.durationMinutes !== undefined) payload.duration_minutes = Number(data.durationMinutes) || 0;
  if (data.planId !== undefined) payload.plan_id = data.planId;
  if (data.partsText !== undefined) payload.parts_text = data.partsText;
  await db.collection(SESSION_COLLECTION).doc(sessionId).update({ data: payload });
}

// ===== 训练草稿（本地存储，自动保存兜底） =====

/**
 * 保存训练草稿（每次数据变更后调用，同步写本地，防抖写数据库）
 * @param {Object} draft { workout_date, plan_id, parts_text, session_id, session, exercises, updated_at }
 */
function saveDraft(draft) {
  cache.set(
    DRAFT_KEY,
    Object.assign({}, draft, { saved_at: Date.now() }),
    7 * 24 * 60 * 60 * 1000 // 7 天，覆盖跨天未结束的草稿
  );
}

/**
 * 读取训练草稿；无草稿返回 null
 * @returns {Object|null}
 */
function getDraft() {
  return cache.get(DRAFT_KEY) || null;
}

/**
 * 读取今天的训练草稿；不是今天的草稿视为无效（返回 null，页面不恢复）
 * @returns {Object|null}
 */
function getTodayDraft() {
  const draft = getDraft();
  if (!draft) return null;
  if (draft.workout_date !== formatDate(new Date())) return null;
  return draft;
}

/**
 * 清除训练草稿（完成训练后调用）
 */
function clearDraft() {
  cache.remove(DRAFT_KEY);
}

// ===== 训练表现分析（v3：PR / 趋势 / 渐进超负荷建议） =====
// 全部计算在 services/utils 层完成（utils/workout-analysis.js 纯函数），
// 页面与 AI 只消费计算结果，不依赖大模型计算。

/**
 * 获取某动作全部历史记录（升序，规范化）
 * @param {string} exerciseId 动作 _id
 * @returns {Promise<Array>} 规范化记录（升序）
 */
async function getAllRecordsOfExercise(exerciseId) {
  const records = await getAllByWhere(
    COLLECTION,
    { _openid: '{openid}', exercise_id: exerciseId },
    { orderField: 'workout_date', orderDir: 'asc', max: 200 }
  );
  return records.map(normalizeRecord);
}

/**
 * 查询动作库推荐组数/次数（分析建议用；动作库查询失败时用默认值）
 * @param {string} exerciseId 动作 _id
 * @returns {Promise<{plannedSets: number, plannedReps: number}>}
 */
async function getPlannedByExercise(exerciseId) {
  try {
    const exerciseService = require('./exercise');
    const list = await exerciseService.getExercisesByIds([exerciseId]);
    const ex = list[0];
    if (ex) {
      return {
        plannedSets: Number(ex.recommended_sets) || 3,
        plannedReps: Number(ex.recommended_reps) || 10
      };
    }
  } catch (err) {
    console.error('[workout] 查询动作库推荐失败', err);
  }
  return { plannedSets: 3, plannedReps: 10 };
}

/**
 * 单动作完整分析（动作历史页用）
 * @param {string} exerciseId 动作 _id
 * @param {string} [exerciseName] 动作名（缺省取记录）
 * @returns {Promise<Object>} {
 *   exerciseId, exerciseName, hasData,
 *   prs, last, prev, recent7, recent30, trend, suggestion, recentList
 * }
 */
async function getExerciseAnalysis(exerciseId, exerciseName) {
  const key = analysisKey('analysis', exerciseId);
  const cached = analysisCacheGet(key);
  if (cached) return cached;

  const records = await getAllRecordsOfExercise(exerciseId);
  const result = buildAnalysisResult(exerciseId, exerciseName, records);
  if (result.hasData) {
    // 建议只基于可量化记录（有重量/容量明细），避免旧版无明细记录干扰判断
    const quantified = records.filter((r) => Array.isArray(r.set_records) && r.set_records.length > 0);
    const qLast = analysis.computeLastPerformance(quantified);
    if (qLast) {
      const qPrev = analysis.computePrevPerformance(quantified);
      const planned = await getPlannedByExercise(exerciseId);
      result.suggestion = analysis.buildOverloadSuggestion({
        last: qLast,
        prev: qPrev,
        prs: result.prs,
        plannedSets: planned.plannedSets,
        plannedReps: planned.plannedReps
      });
    }
  }
  analysisCacheSet(key, result);
  return result;
}

// 由记录数组构建分析结果（services 与云函数共用同一套纯函数逻辑）
function buildAnalysisResult(exerciseId, exerciseName, records) {
  if (records.length === 0) {
    return {
      exerciseId,
      exerciseName: exerciseName || '',
      hasData: false,
      prs: { maxWeightPR: null, maxRepsPR: null, maxVolumePR: null },
      last: null,
      prev: null,
      recent7: null,
      recent30: null,
      trend: [],
      suggestion: null,
      recentList: []
    };
  }

  const prs = analysis.computePRs(records);
  const last = analysis.computeLastPerformance(records);
  const prev = analysis.computePrevPerformance(records);
  const recent7 = analysis.computeRecentStats(records, 7);
  const recent30 = analysis.computeRecentStats(records, 30);
  const trend = analysis.computeTrendPoints(records, 90);
  const recentList = records
    .slice(-10)
    .reverse()
    .map((r) => {
      const st = analysis.computeRecordStats(r);
      return {
        date: r.workout_date,
        sets: st.sets,
        maxWeight: st.maxWeight,
        maxReps: st.maxReps,
        volume: st.volume,
        maxRpe: st.maxRpe
      };
    });

  return {
    exerciseId,
    exerciseName: exerciseName || records[records.length - 1].exercise_name || '',
    hasData: true,
    prs,
    last,
    prev,
    recent7,
    recent30,
    trend,
    suggestion: null, // 由调用方补充（需要异步查动作库推荐）
    recentList
  };
}

/**
 * 单动作训练历史（倒序，含每组明细）
 * @param {string} exerciseId 动作 _id
 * @param {number} [limit] 最大条数，默认 20
 * @returns {Promise<Array>} 倒序记录
 */
async function getExerciseHistory(exerciseId, limit) {
  const n = Math.min(50, Math.max(1, Number(limit) || 20));
  const key = analysisKey('history', exerciseId, n);
  const cached = analysisCacheGet(key);
  if (cached) return cached;

  const records = await getAllRecordsOfExercise(exerciseId);
  const list = records.slice(-n).reverse();
  analysisCacheSet(key, list);
  return list;
}

/**
 * 单动作个人 PR（最大重量 / 最大次数 / 最大容量）
 * @param {string} exerciseId 动作 _id
 * @returns {Promise<Object>} { hasData, prs }
 */
async function getExercisePR(exerciseId) {
  const key = analysisKey('pr', exerciseId);
  const cached = analysisCacheGet(key);
  if (cached) return cached;

  const records = await getAllRecordsOfExercise(exerciseId);
  const prs = analysis.computePRs(records);
  const result = { hasData: records.length > 0, prs };
  analysisCacheSet(key, result);
  return result;
}

/**
 * 训练容量统计
 * @param {Object} opts
 * @param {string} [opts.exerciseId] 指定动作；缺省统计全部动作
 * @param {number} [opts.days] 最近 N 天；缺省全部
 * @returns {Promise<Object>} { hasData, totalVolume, dayCount, trend, byDay }
 */
async function getTrainingVolume(opts) {
  const { exerciseId, days } = opts || {};
  const key = analysisKey('volume', exerciseId || 'all', days ? String(days) : '');
  const cached = analysisCacheGet(key);
  if (cached) return cached;

  const records = exerciseId
    ? await getAllRecordsOfExercise(exerciseId)
    : await getAllByWhere(
        COLLECTION,
        { _openid: '{openid}' },
        { orderField: 'workout_date', orderDir: 'asc', max: 500 }
      );
  const stats = analysis.computeVolumeStats(records, days);
  const result = { hasData: stats.dayCount > 0, ...stats };
  analysisCacheSet(key, result);
  return result;
}

/**
 * 动作进度趋势（数据点 + 首尾对比摘要）
 * @param {string} exerciseId 动作 _id
 * @param {number} [days] 最近 N 天；缺省全部
 * @returns {Promise<Object>} { hasData, points, summary }
 */
async function getProgressTrend(exerciseId, days) {
  const key = analysisKey('trend', exerciseId, days ? String(days) : '');
  const cached = analysisCacheGet(key);
  if (cached) return cached;

  const records = await getAllRecordsOfExercise(exerciseId);
  const points = analysis.computeTrendPoints(records, days);
  const result = { hasData: points.length > 0, points };
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    result.summary = {
      weightChange: last.maxWeight > 0 && first.maxWeight > 0 ? last.maxWeight - first.maxWeight : null,
      volumeChange: last.volume - first.volume,
      weightUp: last.maxWeight > first.maxWeight,
      volumeUp: last.volume > first.volume,
      firstDate: first.date,
      lastDate: last.date
    };
  }
  analysisCacheSet(key, result);
  return result;
}

/**
 * 最近一次表现 + 上一次对比 + 渐进超负荷建议（AI 与页面共用）
 * 建议只基于可量化记录（有重量/容量明细），避免旧版无明细记录干扰判断
 * @param {string} exerciseId 动作 _id
 * @returns {Promise<Object>} { hasData, last, prev, suggestion, prs }
 */
async function getLastPerformance(exerciseId) {
  const key = analysisKey('last', exerciseId);
  const cached = analysisCacheGet(key);
  if (cached) return cached;

  const records = await getAllRecordsOfExercise(exerciseId);
  const prs = analysis.computePRs(records);
  // 可量化记录：有 set_records 明细的（旧 v1 记录无法计算重量/容量）
  const quantified = records.filter((r) => Array.isArray(r.set_records) && r.set_records.length > 0);
  const last = analysis.computeLastPerformance(records);
  const qLast = analysis.computeLastPerformance(quantified);
  const qPrev = analysis.computePrevPerformance(quantified);
  const planned = await getPlannedByExercise(exerciseId);
  const suggestion = qLast
    ? analysis.buildOverloadSuggestion({
        last: qLast,
        prev: qPrev,
        prs,
        plannedSets: planned.plannedSets,
        plannedReps: planned.plannedReps
      })
    : null;

  const result = { hasData: records.length > 0, last, prev: analysis.computePrevPerformance(records), suggestion, prs };
  analysisCacheSet(key, result);
  return result;
}

/**
 * 检测本次训练（今日记录）是否创造新 PR
 * 严格大于历史 PR 才算新纪录；追平不算
 * @param {string} exerciseId 动作 _id
 * @param {Object} [todayRecord] 内存中的今日记录（{ set_records, actual_sets }）；
 *   传入时优先用它做检测，避免依赖防抖写库的时序；缺省回退数据库今日记录
 * @returns {Promise<Object>} { isNew, newPRs: ['weight'|'reps'|'volume'], stats, prs }
 */
async function checkNewPR(exerciseId, todayRecord) {
  const records = await getAllRecordsOfExercise(exerciseId);
  const today = formatDate(new Date());
  const history = records.filter((r) => r.workout_date !== today);
  const empty = { isNew: false, newPRs: [], stats: null, prs: null };

  let stats;
  if (todayRecord && Array.isArray(todayRecord.set_records)) {
    stats = analysis.computeRecordStats({
      set_records: todayRecord.set_records,
      actual_sets: todayRecord.actual_sets
    });
  } else {
    const dbToday = records.filter((r) => r.workout_date === today);
    if (dbToday.length === 0) return empty;
    stats = analysis.computeRecordStats(dbToday[0]);
  }

  const prs = analysis.computePRs(history);
  const newPRs = analysis.detectNewPRs(stats, prs);
  return {
    isNew: newPRs.length > 0,
    newPRs,
    stats,
    // 含今日的完整 PR（供展示）
    prs: analysis.computePRs(records)
  };
}

// 前一天日期 YYYY-MM-DD
function prevDate(dateStr) {
  const d = new Date(dateStr.replace(/-/g, '/'));
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

/**
 * 训练负荷统计（供训练状态判断 / AI 综合分析）
 * @returns {Promise<Object>} {
 *   consecutiveDays,   // 连续训练天数（从今天往回数）
 *   weekTrainingDays,  // 近 7 天训练天数（含今天）
 *   volumeTrend,       // 近 7 天容量趋势 up/flat/down
 *   recentParts,       // 最近 3 个训练日的部位组合（plan_id 去重）
 *   lastDate,          // 最近一次训练日期（无则空串）
 *   hasTraining        // 今天是否有训练记录
 * }
 */
async function getTrainingLoadStats() {
  const key = analysisKey('load', 'all');
  const cached = analysisCacheGet(key);
  if (cached) return cached;

  const records = await getAllByWhere(
    COLLECTION,
    { _openid: '{openid}' },
    { orderField: 'workout_date', orderDir: 'asc', max: 500 }
  );
  const dateSet = {};
  records.forEach((r) => {
    if (r.workout_date) dateSet[r.workout_date] = true;
  });
  const dates = Object.keys(dateSet).sort();
  const today = formatDate(new Date());

  // 连续训练天数（从今天往回）
  let consecutiveDays = 0;
  let cur = today;
  while (dateSet[cur]) {
    consecutiveDays++;
    cur = prevDate(cur);
  }

  // 近 7 天训练天数
  const start7 = formatDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  const weekDates = dates.filter((d) => d >= start7 && d <= today);

  // 容量趋势（近 7 天）
  const volStats = analysis.computeVolumeStats(records, 7);

  // 最近 3 个训练日的部位组合（按 plan_id 去重）
  const recentParts = [];
  for (let i = dates.length - 1; i >= 0 && recentParts.length < 3; i--) {
    const d = dates[i];
    if (d > today) continue;
    const pid = records.find((r) => r.workout_date === d && r.plan_id) || null;
    const part = pid ? pid.plan_id : '';
    if (part && recentParts.indexOf(part) < 0) recentParts.push(part);
  }

  const result = {
    consecutiveDays,
    weekTrainingDays: weekDates.length,
    volumeTrend: volStats.trend,
    recentParts,
    lastDate: dates.length > 0 ? dates[dates.length - 1] : '',
    hasTraining: !!dateSet[today]
  };
  analysisCacheSet(key, result);
  return result;
}

module.exports = {
  getWorkoutSummary,
  markExerciseCompleted,
  markExerciseIncomplete,
  deleteExerciseRecord,
  getTodayCompletedMap,
  // v2：训练明细
  getTodayRecords,
  upsertExerciseRecord,
  // v2：训练会话
  createWorkoutSession,
  updateWorkoutSession,
  // v2：训练草稿
  saveDraft,
  getDraft,
  getTodayDraft,
  clearDraft,
  // v3：训练表现分析
  getExerciseAnalysis,
  getExerciseHistory,
  getExercisePR,
  getTrainingVolume,
  getProgressTrend,
  getLastPerformance,
  checkNewPR,
  // v3：训练负荷统计（状态判断/AI 分析用）
  getTrainingLoadStats,
  // 兼容读取（供其他模块复用）
  normalizeRecord
};
