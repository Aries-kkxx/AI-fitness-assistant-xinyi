// services/plan.js - 自定义周训练计划数据层
// 职责：week_plan 集合的读写（每用户 1 条，包含周一~周日 7 天的动作配置）
// 结构：{ _openid, days: [{ day: 1..7, isRest, exercise_ids: [] }, ...], updated_at }
// 安全：按 _openid 过滤
// 性能：计划内容变更频率低，缓存 1 小时；保存后立即失效
const cache = require('../utils/cache');

const db = wx.cloud.database();
const COLLECTION = 'week_plan';

const PLAN_CACHE_KEY = 'week_plan';
const PLAN_CACHE_TTL = 60 * 60 * 1000; // 1 小时

// 集合不存在的错误码
const ERR_COLLECTION_NOT_EXIST = '-502005';

/**
 * 获取当前用户的自定义周计划；未设置过或查询失败返回 null
 * @returns {Promise<Object|null>} 计划文档（含 days 数组）
 */
async function getWeekPlanCustom() {
  // 缓存命中直接返回
  const cached = cache.get(PLAN_CACHE_KEY);
  if (cached !== null) return cached;

  try {
    const res = await db
      .collection(COLLECTION)
      .where({ _openid: '{openid}' })
      .limit(1)
      .get();
    const plan = res.data.length > 0 ? res.data[0] : null;
    cache.set(PLAN_CACHE_KEY, plan, PLAN_CACHE_TTL);
    return plan;
  } catch (err) {
    // 集合未创建（-502005）：静默降级为无自定义计划（规则引擎兜底），不刷错误日志
    if (err && String(err.errCode) === ERR_COLLECTION_NOT_EXIST) {
      return null;
    }
    // 其他错误（网络异常等）：记录日志后同样降级，不影响页面使用
    console.error('[plan] getWeekPlanCustom 失败', err);
    return null;
  }
}

/**
 * 保存自定义周计划（7 天；已存在则更新，不存在则新增）
 * 集合未创建时抛出 COLLECTION_NOT_EXIST 错误，由页面给出明确提示
 * @param {Array} days 7 项 [{ day, isRest, exercise_ids }]
 * @returns {Promise<string>} 文档 _id
 */
async function saveWeekPlanCustom(days) {
  try {
    const existing = await getWeekPlanCustom();
    const data = { days, updated_at: db.serverDate() };
    if (existing) {
      await db.collection(COLLECTION).doc(existing._id).update({ data });
      cache.remove(PLAN_CACHE_KEY);
      return existing._id;
    }
    data.created_at = db.serverDate();
    const res = await db.collection(COLLECTION).add({ data });
    cache.remove(PLAN_CACHE_KEY);
    return res._id;
  } catch (err) {
    console.error('[plan] saveWeekPlanCustom 失败', err);
    if (err && String(err.errCode) === ERR_COLLECTION_NOT_EXIST) {
      throw new Error('COLLECTION_NOT_EXIST');
    }
    throw err;
  }
}

/**
 * 解析今日训练（自定义计划优先，无有效自定义计划时回退规则引擎）
 * 训练页 / 训练记录页共用，保证两侧展示一致
 * @param {Object} user 用户资料（来自 users 集合）
 * @returns {Promise<Object>} {
 *   workout,          // 今日训练（restDay 或含 exercises 数组）
 *   weekPlan,         // 本周计划 [{ partsText, isCustom } | null]
 *   isCustomPlan,     // 是否使用自定义计划
 *   todayIndex        // 今天在一周中的下标（0=周一）
 * }
 */
async function resolveTodayWorkout(user) {
  // 惰性 require：避免模块加载时序问题（recommend/exercise 均不依赖 plan）
  const recommend = require('./recommend');
  const exerciseService = require('./exercise');

  const todayIndex = (new Date().getDay() + 6) % 7;

  // 优先级 1：训练周期（活跃周期存在时优先；周期计划 > 自定义周计划 > 规则推荐）
  try {
    const cycleService = require('./cycle');
    const activeCycle = await cycleService.getActiveCycle();
    if (activeCycle) {
      const plan = await cycleService.getTodayCyclePlan(activeCycle);
      const workout = {
        isRestDay: plan.isRestDay,
        weekday: plan.weekday,
        partsText: plan.partsText,
        goal: activeCycle.goal || user.goal,
        exercises: plan.exercises,
        totalMinutes: Number(user.training_duration) || 45,
        count: plan.exercises.length,
        cycle: {
          name: activeCycle.name || '',
          currentWeek: plan.currentWeek,
          totalWeeks: plan.totalWeeks,
          deload: !!plan.deload
        }
      };
      // 周期本周 7 天摘要（动作名）
      const currentWeek = cycleService.getCurrentWeek(activeCycle.start_date, activeCycle.end_date);
      const weekData = (activeCycle.weeks || []).find((w) => w.week_no === currentWeek) || (activeCycle.weeks || [])[0];
      const weekPlan = await buildCycleWeekPlan(weekData, exerciseService);
      return {
        workout,
        weekPlan,
        isCustomPlan: false,
        todayIndex,
        isCyclePlan: true,
        cycleName: activeCycle.name || '',
        cycleCurrentWeek: plan.currentWeek,
        cycleTotalWeeks: plan.totalWeeks,
        cycleDeload: !!plan.deload
      };
    }
  } catch (err) {
    console.error('[plan] 周期计划解析失败，回退自定义/规则推荐', err);
  }

  // 优先级 2/3：自定义周计划 → 规则引擎
  const ruleWorkout = await recommend.getTodayWorkout(user);
  let workout = ruleWorkout;
  let weekPlan = recommend.getWeekPlan(user);
  let isCustomPlan = false;

  const customPlan = await getWeekPlanCustom();
  if (customPlan && customPlan.days && customPlan.days.length === 7) {
    // 计划有效（至少一天有动作）→ 使用自定义计划
    // 空计划（清空所有后保存）→ 视为未设置，回退智能推荐
    const hasAny = customPlan.days.some(
      (d) => !d.isRest && d.exercise_ids && d.exercise_ids.length > 0
    );
    if (hasAny) {
      // 收集 7 天全部动作 id，一次性查详情（去重）
      const allIds = [];
      customPlan.days.forEach((d) => {
        (d.exercise_ids || []).forEach((id) => allIds.push(id));
      });
      const exList = await exerciseService.getExercisesByIds(allIds);
      const exMap = {};
      exList.forEach((e) => {
        exMap[e._id] = e;
      });

      // 本周展示：每天动作名摘要（最多 3 个 + 等N个）或休息
      weekPlan = customPlan.days.map((d) => {
        if (d.isRest || !d.exercise_ids || d.exercise_ids.length === 0) {
          return null;
        }
        const names = d.exercise_ids
          .map((id) => (exMap[id] ? exMap[id].name : ''))
          .filter(Boolean);
        const summary = names.slice(0, 3).join('、') + (names.length > 3 ? ' 等' + names.length + '个' : '');
        return { partsText: summary || '自定义训练', isCustom: true };
      });

      // 今日训练
      const day = customPlan.days[todayIndex];
      if (!day || day.isRest || !day.exercise_ids || day.exercise_ids.length === 0) {
        workout = {
          isRestDay: true,
          weekday: recommend.WEEK_DAYS[todayIndex],
          partsText: '休息日',
          exercises: [],
          totalMinutes: 0,
          count: 0,
          goal: user.goal
        };
      } else {
        const exercises = day.exercise_ids
          .map((id) => exMap[id])
          .filter(Boolean)
          .map((e) => ({
            _id: e._id,
            name: e.name,
            sets: e.recommended_sets,
            reps: e.recommended_reps,
            repsUnit: e.reps_unit || '次',
            restSeconds: e.rest_seconds,
            category: e.category,
            difficulty: e.difficulty,
            equipment: e.equipment,
            targetMuscle: (e.target_muscle || []).join(' / ')
          }));

        // 部位文本：动作分类去重
        const cats = [];
        exercises.forEach((e) => {
          if (cats.indexOf(e.category) < 0) cats.push(e.category);
        });

        workout = {
          isRestDay: false,
          weekday: recommend.WEEK_DAYS[todayIndex],
          partsText: cats.join(' + ') || '自定义训练',
          goal: user.goal,
          exercises,
          totalMinutes: Number(user.training_duration) || 45,
          count: exercises.length
        };
      }
      isCustomPlan = true;
    }
  }

  return { workout, weekPlan, isCustomPlan, todayIndex };
}

// 周期周计划 7 天摘要（动作名，最多 3 个 + 等N个；休息日 null）
async function buildCycleWeekPlan(weekData, exerciseService) {
  try {
    const allIds = [];
    (weekData && weekData.days || []).forEach((d) => {
      (d.exercise_ids || []).forEach((id) => allIds.push(id));
    });
    const exList = await exerciseService.getExercisesByIds(allIds);
    const exMap = {};
    exList.forEach((e) => {
      exMap[e._id] = e.name;
    });
    return (weekData && weekData.days || []).map((d) => {
      if (d.isRest || !d.exercise_ids || d.exercise_ids.length === 0) return null;
      const names = d.exercise_ids.map((id) => exMap[id] || '').filter(Boolean);
      const summary = names.slice(0, 3).join('、') + (names.length > 3 ? ' 等' + names.length + '个' : '');
      return { partsText: summary || '周期训练', isCycle: true };
    });
  } catch (err) {
    console.error('[plan] 周期周计划摘要失败', err);
    return null;
  }
}

module.exports = {
  getWeekPlanCustom,
  saveWeekPlanCustom,
  resolveTodayWorkout
};
