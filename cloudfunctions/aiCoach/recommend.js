// cloudfunctions/aiCoach/recommend.js - 云端规则推荐引擎
// 注意：云函数与小程序端物理隔离、各自部署，因此这里保留一份与前端
// services/recommend.js 一致的推荐规则（目标模板/器械兼容/难度过滤/组数调整）。
// 若修改规则，请同步两处。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ===== 规则表（与前端 services/recommend.js 保持一致） =====
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

const EQUIPMENT_COMPAT = {
  无器械: ['无器械'],
  哑铃: ['无器械', '哑铃'],
  杠铃: ['无器械', '哑铃', '杠铃'],
  家庭器械: ['无器械', '哑铃', '家庭器械'],
  健身房: ['无器械', '哑铃', '杠铃', '健身房']
};

const DIFF_LEVEL = { 初级: 1, 中级: 2, 高级: 3 };
const EXP_LEVEL = { 新手: 1, 初级: 2, 中级: 3, 高级: 3 };
const DURATION_COUNT = { 20: 3, 30: 4, 45: 5, 60: 6, 90: 7 };
const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ===== 纯函数 =====
function buildWeekTemplate(goal, trainingDays) {
  const pool = GOAL_TEMPLATES[goal] || GOAL_TEMPLATES['保持健康'];
  const days = Math.min(7, Math.max(1, Number(trainingDays) || 3));
  const week = new Array(7).fill(null);
  for (let i = 0; i < days; i++) {
    const dayIndex = Math.min(6, Math.round((i * 7) / days));
    week[dayIndex] = pool[i % pool.length];
  }
  return week;
}

function adjustSets(recommendedSets, experience) {
  let sets = Number(recommendedSets) || 3;
  if (experience === '新手') sets = Math.max(2, sets - 1);
  else if (experience === '高级') sets = Math.min(5, sets + 1);
  return sets;
}

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
 * 过滤掉需要排除的部位（如昨天练过胸 → 排除 ['胸']）
 * @param {Array} parts 部位列表
 * @param {Array} excludeParts 排除的部位关键词
 * @returns {Array} 过滤后的部位
 */
function filterExcluded(parts, excludeParts) {
  if (!excludeParts || excludeParts.length === 0) return parts.slice();
  return parts.filter((p) => excludeParts.indexOf(p) < 0);
}

/**
 * 从一周模板中寻找下一个「不被排除部位影响」的训练日
 * 从今天之后开始找，最多找 7 天；返回过滤后的部位组合
 */
function findAlternative(week, fromIndex, excludeParts) {
  for (let i = 1; i <= 7; i++) {
    const idx = (fromIndex + i) % 7;
    const day = week[idx];
    if (day) {
      const kept = filterExcluded(day.parts, excludeParts);
      if (kept.length > 0) {
        return { parts: kept };
      }
    }
  }
  return null;
}

// ===== 数据库查询 + 过滤（动作全部来自 exercises 集合） =====
async function queryExercisesByCategory(category) {
  const res = await db
    .collection('exercises')
    .where({ category })
    .limit(50)
    .get();
  return res.data;
}

async function pickExercises(part, opts, count) {
  if (count <= 0) return [];

  if (part === '全身') {
    const parts = ['胸', '背', '腿', '核心', '手臂'];
    const picked = [];
    for (const p of parts) {
      const list = await pickExercises(p, opts, 1);
      if (list.length > 0) picked.push(list[0]);
    }
    return shuffle(picked).slice(0, count);
  }

  const category = PART_CATEGORY[part];
  if (!category) return [];

  const all = await queryExercisesByCategory(category);
  const maxLevel = EXP_LEVEL[opts.experience] || 2;
  const allowedEquipment = EQUIPMENT_COMPAT[opts.equipment] || ['无器械'];

  let list = all.filter((e) => allowedEquipment.indexOf(e.equipment) >= 0);
  list = list.filter((e) => (DIFF_LEVEL[e.difficulty] || 2) <= maxLevel);
  if (part === '三头') {
    list = list.filter((e) => (e.target_muscle || []).some((m) => m.indexOf('三头') >= 0));
  } else if (part === '二头') {
    list = list.filter((e) => (e.target_muscle || []).some((m) => m.indexOf('二头') >= 0));
  }

  const picked = shuffle(list).slice(0, count);
  picked.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  return picked;
}

// ===== 对外接口 =====

/**
 * 生成一套训练方案（动作来自数据库，不入库）
 * @param {Object} param
 * @param {string} param.goal 目标
 * @param {string} param.equipment 器械
 * @param {string} param.experience 经验
 * @param {number} param.duration 时长（分钟）
 * @param {Array} param.parts 部位组合（如 ['胸','三头']）
 * @param {Array} param.excludeParts 排除的部位（可选）
 */
async function generatePlan({ goal, equipment, experience, duration, parts, excludeParts }) {
  if (!parts || parts.length === 0) {
    return { ok: false, message: '缺少部位组合 parts' };
  }
  // 排除用户不想要的部位（如昨天刚练过）
  const finalParts = filterExcluded(parts, excludeParts);
  if (finalParts.length === 0) {
    return { ok: false, message: '部位组合全部被排除，请指定其他部位' };
  }
  const totalCount = DURATION_COUNT[String(duration)] || 5;
  const counts = splitCount(totalCount, finalParts.length);

  const exercises = [];
  const pickedList = await Promise.all(
    finalParts.map((part, i) => pickExercises(part, { equipment, experience }, counts[i]))
  );
  pickedList.forEach((list) => {
    list.forEach((e) => {
      exercises.push({
        _id: e._id,
        name: e.name,
        sets: adjustSets(e.recommended_sets, experience),
        reps: e.recommended_reps,
        repsUnit: e.reps_unit || '次',
        restSeconds: e.rest_seconds,
        category: e.category,
        difficulty: e.difficulty,
        equipment: e.equipment
      });
    });
  });

  return {
    ok: true,
    partsText: finalParts.join(' + '),
    exercises,
    totalMinutes: Number(duration) || 45,
    count: exercises.length
  };
}

/**
 * 获取今日推荐训练（按目标模板 + 星期几）
 * @param {Object} param
 * @param {Array} param.excludeParts 排除的部位（可选，如昨天练过胸传 ['胸']）
 * 当今天模板的部位全部被排除时，自动从模板中寻找下一个不冲突的训练日
 */
async function getTodayWorkout({ goal, equipment, experience, training_days, duration, excludeParts }) {
  const weekdayIndex = (new Date().getDay() + 6) % 7;
  const week = buildWeekTemplate(goal, training_days);
  let today = week[weekdayIndex];
  let partsText = '';
  let isRestDay = false;

  if (today) {
    const kept = filterExcluded(today.parts, excludeParts);
    if (kept.length === 0) {
      // 今天模板部位全被排除 → 从模板中找下一个不冲突的训练日
      today = findAlternative(week, weekdayIndex, excludeParts);
    } else if (kept.length < 2 && today.parts.length >= 2) {
      // 排除后只剩 1 个部位（内容过少）→ 优先找更完整的替代训练日
      const alt = findAlternative(week, weekdayIndex, excludeParts);
      today = alt || { parts: kept };
    } else {
      today = { parts: kept };
    }
  }

  if (isRestDay || !today) {
    return {
      ok: true,
      isRestDay: true,
      weekday: WEEK_DAYS[weekdayIndex],
      partsText: '休息日',
      exercises: [],
      totalMinutes: 0,
      count: 0
    };
  }
  const plan = await generatePlan({
    goal,
    equipment,
    experience,
    duration,
    parts: today.parts,
    excludeParts
  });
  return Object.assign({ isRestDay: false, weekday: WEEK_DAYS[weekdayIndex] }, plan);
}

module.exports = {
  EQUIPMENT_COMPAT,
  buildWeekTemplate,
  generatePlan,
  getTodayWorkout
};
