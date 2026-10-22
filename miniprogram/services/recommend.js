// services/recommend.js - 个性化训练推荐引擎（规则引擎，不接 AI）
//
// 输入：用户资料（goal / experience / training_days / training_duration / equipment）
// 输出：一周训练安排 + 今日训练（动作全部从 exercises 数据库查询，禁止硬编码动作库）
//
// 规则设计：
// 1. goal        → 匹配部位训练模板（周一为一周起点）
// 2. experience  → 过滤动作难度 + 调整组数（新手减组、高级加组）
// 3. training_days → 决定一周哪几天训练（均匀分布）
// 4. training_duration → 决定动作数量（30min≈4个 / 45min≈5个 / 60min≈6个 / 90min≈7个）
// 5. equipment   → 过滤动作所需器械（哑铃用户看不到杠铃动作）

const exerciseService = require('./exercise');
const cache = require('../utils/cache');
const { formatDate } = require('../utils/date');

// ===== 规则表 =====

// 目标 → 部位模板（数组按训练日顺序循环使用）
// 每个元素：{ parts: [部位1, 部位2, ...] }
// 部位关键词：胸/背/肩/三头/二头/手臂/腿/臀/核心/有氧；'全身' 表示多部位综合
const GOAL_TEMPLATES = {
  减脂: [
    { parts: ['胸', '三头', '有氧'] },
    { parts: ['背', '二头'] },
    { parts: ['腿', '核心', '有氧'] },
    { parts: ['肩', '手臂'] },
    { parts: ['全身', '有氧'] }
  ],
  增肌: [
    { parts: ['胸', '三头'] },
    { parts: ['背', '二头'] },
    { parts: ['腿'] },
    { parts: ['肩', '手臂'] },
    { parts: ['臀', '腿'] },
    { parts: ['胸', '背'] },
    { parts: ['核心'] }
  ],
  塑形: [
    { parts: ['臀', '腿'] },
    { parts: ['核心'] },
    { parts: ['全身'] },
    { parts: ['臀', '腿'] },
    { parts: ['肩', '手臂'] },
    { parts: ['核心', '有氧'] },
    { parts: ['全身'] }
  ],
  提升体能: [
    { parts: ['全身', '有氧'] },
    { parts: ['核心'] },
    { parts: ['腿', '有氧'] },
    { parts: ['全身'] },
    { parts: ['全身', '有氧'] },
    { parts: ['核心', '有氧'] },
    { parts: ['有氧'] }
  ],
  保持健康: [
    { parts: ['全身'] },
    { parts: ['核心'] },
    { parts: ['全身', '有氧'] },
    { parts: ['腿'] },
    { parts: ['全身'] },
    { parts: ['有氧'] },
    { parts: ['核心'] }
  ]
};

// 部位关键词 → 动作分类
const PART_CATEGORY = {
  胸: '胸部',
  背: '背部',
  肩: '肩部',
  三头: '手臂',
  二头: '手臂',
  手臂: '手臂',
  腿: '腿部',
  臀: '臀部',
  核心: '核心',
  有氧: '有氧'
};

// 用户器械 → 可使用的动作器械（包含关系）
const EQUIPMENT_COMPAT = {
  无器械: ['无器械'],
  哑铃: ['无器械', '哑铃'],
  杠铃: ['无器械', '哑铃', '杠铃'],
  家庭器械: ['无器械', '哑铃', '家庭器械'],
  健身房: ['无器械', '哑铃', '杠铃', '健身房']
};

// 难度等级（数字越大越难）
const DIFF_LEVEL = { 初级: 1, 中级: 2, 高级: 3 };
// 健身经验允许的最高难度等级（新手=1 初级=2 中级=3 高级=3）
const EXP_LEVEL = { 新手: 1, 初级: 2, 中级: 3, 高级: 3 };

// 每次训练时长 → 动作数量
const DURATION_COUNT = { 30: 4, 45: 5, 60: 6, 90: 7 };

// 周一到周日名称
const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ===== 纯函数规则 =====

/**
 * 生成一周训练安排（0=周一 ... 6=周日，null 表示休息）
 * 训练日按「均匀分布」放到一周中
 */
function buildWeekTemplate(goal, trainingDays) {
  const pool = GOAL_TEMPLATES[goal] || GOAL_TEMPLATES['保持健康'];
  const days = Math.min(7, Math.max(1, Number(trainingDays) || 3));
  const week = new Array(7).fill(null);
  for (let i = 0; i < days; i++) {
    // 均匀铺开：i*7/days 四舍五入到 0-6，且严格递增无冲突
    const dayIndex = Math.min(6, Math.round((i * 7) / days));
    week[dayIndex] = pool[i % pool.length];
  }
  return week;
}

/**
 * 根据经验调整组数：新手减 1 组（最少 2 组），高级加 1 组（最多 5 组）
 */
function adjustSets(recommendedSets, experience) {
  let sets = Number(recommendedSets) || 3;
  if (experience === '新手') {
    sets = Math.max(2, sets - 1);
  } else if (experience === '高级') {
    sets = Math.min(5, sets + 1);
  }
  return sets;
}

/**
 * 打乱数组（Fisher-Yates），保证每日训练有随机性
 */
function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * 将总动作数均分到多个部位（保证总和等于 total）
 * 例：5 个动作分给 2 个部位 → [3, 2]
 */
function splitCount(total, partCount) {
  const result = [];
  let remain = total;
  for (let i = 0; i < partCount; i++) {
    const n = i === partCount - 1 ? remain : Math.round(total / partCount);
    result.push(n);
    remain -= n;
  }
  return result;
}

/**
 * 是否为训练日（今日安排非空）
 */
function isRestDay(weekTemplate, weekdayIndex) {
  return !weekTemplate[weekdayIndex];
}

// ===== 数据库查询 + 过滤 =====

/**
 * 为指定部位挑选动作（从 exercises 数据库查询后过滤）
 * @param {string} part 部位关键词
 * @param {Object} user 用户资料
 * @param {number} count 需要数量
 */
async function pickExercises(part, user, count) {
  if (count <= 0) return [];

  // 全身：从主要肌群各取 1 个，再随机打乱截断
  if (part === '全身') {
    const parts = ['胸', '背', '腿', '核心', '手臂'];
    const picked = [];
    for (const p of parts) {
      const list = await pickExercises(p, user, 1);
      if (list.length > 0) picked.push(list[0]);
    }
    return shuffle(picked).slice(0, count);
  }

  const category = PART_CATEGORY[part];
  if (!category) return [];

  const all = await exerciseService.getByCategory(category);
  const maxLevel = EXP_LEVEL[user.experience] || 2;
  const allowedEquipment = EQUIPMENT_COMPAT[user.equipment] || ['无器械'];

  // 1. 器械过滤（equipment 过滤）
  // 2. 难度过滤（experience 过滤）
  // 3. 肌群细分过滤（三头/二头 属于 手臂 分类，按 target_muscle 再细分）
  let list = all.filter((e) => allowedEquipment.indexOf(e.equipment) >= 0);
  list = list.filter((e) => (DIFF_LEVEL[e.difficulty] || 2) <= maxLevel);
  if (part === '三头') {
    list = list.filter((e) => (e.target_muscle || []).some((m) => m.indexOf('三头') >= 0));
  } else if (part === '二头') {
    list = list.filter((e) => (e.target_muscle || []).some((m) => m.indexOf('二头') >= 0));
  }

  // 随机挑选 count 个，并按推荐顺序（sort）稳定呈现
  const picked = shuffle(list).slice(0, count);
  picked.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  return picked;
}

// ===== 对外接口 =====

/**
 * 获取本周训练安排
 * @param {Object} user 用户资料
 * @returns {Array} 7 项（0=周一），每项 { parts, partsText } 或 null（休息）
 */
function getWeekPlan(user) {
  const week = buildWeekTemplate(user.goal, user.training_days);
  return week.map((day) => {
    if (!day) return null;
    return {
      parts: day.parts,
      partsText: day.parts.join(' + ')
    };
  });
}

/**
 * 生成今日训练
 * @param {Object} user 用户资料（来自 users 集合）
 * @returns {Promise<Object>} {
 *   isRestDay, weekday, partsText, goal,
 *   exercises: [{ name, sets, reps, repsUnit, restSeconds, category, difficulty, equipment, targetMuscle }],
 *   totalMinutes, count
 * }
 */
/**
 * 为指定部位组合挑选动作（供今日训练 / 按天生成共用）
 * @param {Array} parts 部位组合
 * @param {Object} user 用户资料
 * @returns {Promise<Array>} 动作列表（含 _id，用于完成记录与自定义计划）
 */
async function pickExercisesForParts(parts, user) {
  const totalCount = DURATION_COUNT[String(user.training_duration)] || 5;
  const counts = splitCount(totalCount, parts.length);
  const exercises = [];
  const pickedList = await Promise.all(
    parts.map((part, i) => pickExercises(part, user, counts[i]))
  );
  pickedList.forEach((list) => {
    list.forEach((e) => {
      exercises.push({
        _id: e._id, // 动作 ID：用于保存完成记录（幂等键之一）
        name: e.name,
        sets: adjustSets(e.recommended_sets, user.experience),
        reps: e.recommended_reps,
        repsUnit: e.reps_unit || '次',
        restSeconds: e.rest_seconds,
        category: e.category,
        difficulty: e.difficulty,
        equipment: e.equipment,
        targetMuscle: (e.target_muscle || []).join(' / ')
      });
    });
  });
  return exercises;
}

/**
 * 生成某一天（0=周一）的训练动作（规则引擎）
 * 供今日训练与自定义计划编辑页「智能推荐预填」共用
 * @param {Object} user 用户资料
 * @param {number} weekdayIndex 0=周一 ... 6=周日
 * @returns {Promise<Object>} { parts, partsText, exercises }
 */
async function getDayWorkout(user, weekdayIndex) {
  const week = buildWeekTemplate(user.goal, user.training_days);
  const today = week[weekdayIndex];
  if (!today) {
    return { parts: [], partsText: '休息日', exercises: [] };
  }
  const exercises = await pickExercisesForParts(today.parts, user);
  return { parts: today.parts, partsText: today.parts.join(' + '), exercises };
}

/**
 * 获取今日推荐训练
 * 性能：结果按「日期 + 用户资料特征」缓存 24 小时——
 *   - 当天内切 Tab/回页面秒开，不再重复查询数据库
 *   - 动作当天固定不变（不再每次随机变化）
 *   - 用户资料变化（目标/器械/经验/频率/时长）后自动生成新缓存
 * @param {Object} user 用户资料（来自 users 集合）
 * @returns {Promise<Object>} 今日训练（休息日或动作列表）
 */
async function getTodayWorkout(user) {
  // 缓存键：日期 + 资料特征（资料任一变化 → 新键）
  const sig = [
    user.goal,
    user.experience,
    user.training_days,
    user.training_duration,
    user.equipment
  ].join('|');
  const key = 'workout_today_' + formatDate(new Date()) + '_' + sig;

  const cached = cache.get(key);
  if (cached) return cached;

  // 周一为一周起点：getDay() 0=周日 → (getDay()+6)%7 得 0=周一
  const weekdayIndex = (new Date().getDay() + 6) % 7;
  const day = await getDayWorkout(user, weekdayIndex);

  let result;
  if (day.parts.length === 0) {
    result = {
      isRestDay: true,
      weekday: WEEK_DAYS[weekdayIndex],
      partsText: '休息日',
      exercises: [],
      totalMinutes: 0,
      count: 0,
      goal: user.goal
    };
  } else {
    result = {
      isRestDay: false,
      weekday: WEEK_DAYS[weekdayIndex],
      partsText: day.partsText,
      goal: user.goal,
      exercises: day.exercises,
      totalMinutes: Number(user.training_duration) || 45,
      count: day.exercises.length
    };
  }

  cache.set(key, result, 24 * 60 * 60 * 1000);
  return result;
}

module.exports = {
  buildWeekTemplate,
  getWeekPlan,
  getDayWorkout,
  getTodayWorkout,
  WEEK_DAYS,
  // 规则常量导出：供动作页「推荐」栏等复用（器械兼容 / 难度等级）
  EQUIPMENT_COMPAT,
  DIFF_LEVEL,
  EXP_LEVEL
};
