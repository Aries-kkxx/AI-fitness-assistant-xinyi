// services/archive.js - 个人健身成长档案聚合（stats 页数据源）
// 职责：组合 训练/体重/身体围度/饮水/恢复 统计 + 成就检测与解锁
// 统计计算在 utils/archive-math.js（纯函数），本层只负责数据获取与组装
// 缓存：聚合结果 5 分钟；训练/体重/饮水/恢复/围度等写入时经各 service 失效
const { getAllByWhere } = require('../utils/db');
const { formatDate } = require('../utils/date');
const cache = require('../utils/cache');
const archiveMath = require('../utils/archive-math');

const db = wx.cloud.database();
const ACHIEVEMENT_COLLECTION = 'achievements';
const ARCHIVE_CACHE_KEY = 'archive_stats';
const ACHIEVE_CACHE_KEY = 'archive_achievements';
const TTL = 5 * 60 * 1000;

async function invalidate() {
  cache.remove(ARCHIVE_CACHE_KEY);
  cache.remove(ACHIEVE_CACHE_KEY);
}

/**
 * 获取个人成长档案全部统计
 * @param {number} [weeklyFrequency] 每周计划训练次数（完成率分母，缺省读用户资料）
 * @returns {Promise<Object>} {
 *   training, weight, body, water, recovery,
 *   trends: { weight, volume, trainingDays, pr, water, waist },
 *   hasUser
 * }
 */
async function getArchiveStats(weeklyFrequency) {
  const cached = cache.get(ARCHIVE_CACHE_KEY);
  if (cached !== null) return cached;

  let freq = weeklyFrequency;
  try {
    if (!freq) {
      const userService = require('./user');
      const user = await userService.getUser();
      freq = user ? user.training_days : 3;
    }
  } catch (err) {
    freq = 3;
  }

  try {
    // 并行获取原始数据
    const [
      workoutRecords,
      weightRecords,
      waterRecords,
      recoveryRecords,
      bodyLatest,
      bodyHistory,
      cycles
    ] = await Promise.all([
      getAllByWhere('workout_records', { _openid: '{openid}' }, { orderField: 'workout_date', orderDir: 'asc', max: 500 }),
      getAllByWhere('weight_records', { _openid: '{openid}' }, { orderField: 'date', orderDir: 'asc', max: 200 }),
      getAllByWhere('water_records', { _openid: '{openid}' }, { orderField: 'date', orderDir: 'asc', max: 500 }),
      getRecentRecovery(),
      require('./body-measurement').getLatest(),
      require('./body-measurement').getHistory(60),
      getCyclesCount()
    ]);

    // 训练日期去重
    const dateSet = {};
    workoutRecords.forEach((r) => {
      if (r.workout_date) dateSet[r.workout_date] = true;
    });
    const trainingDates = Object.keys(dateSet);

    const training = archiveMath.computeTrainingStats(trainingDates, workoutRecords, freq);
    const weight = archiveMath.computeWeightStats(weightRecords);

    // 饮水按日汇总
    const waterDaily = {};
    waterRecords.forEach((r) => {
      if (!r.date) return;
      if (!waterDaily[r.date]) waterDaily[r.date] = { date: r.date, total: 0, target: r.daily_target_ml || 0 };
      waterDaily[r.date].total += r.amount_ml || 0;
      if (!waterDaily[r.date].target && r.daily_target_ml) waterDaily[r.date].target = r.daily_target_ml;
    });
    const water = archiveMath.computeWaterStats(Object.keys(waterDaily).map((d) => waterDaily[d]));

    const recovery = archiveMath.computeRecoveryStats(recoveryRecords);

    // 身体（BMI + 围度）
    let bmi = null;
    let body = { hasData: false, bmi: null, bodyFat: null, waist: null, chest: null, hip: null, arm: null, thigh: null };
    try {
      const userService = require('./user');
      const user = await userService.getUser();
      if (user && user.height && user.weight) {
        const bmiUtil = require('../utils/bmi');
        bmi = bmiUtil.calcBMI(user.height, user.weight);
      }
      if (bodyLatest) {
        body = {
          hasData: true,
          bmi,
          bodyFat: bodyLatest.body_fat_pct || null,
          waist: bodyLatest.waist_cm || null,
          chest: bodyLatest.chest_cm || null,
          hip: bodyLatest.hip_cm || null,
          arm: bodyLatest.arm_cm || null,
          thigh: bodyLatest.thigh_cm || null,
          date: bodyLatest.date
        };
      } else {
        body = { hasData: false, bmi, bodyFat: null, waist: null, chest: null, hip: null, arm: null, thigh: null };
      }
    } catch (err) {
      console.error('[archive] 身体数据计算失败', err);
    }

    // 趋势（近 30 天）
    const today = formatDate(new Date());
    const volumeByDate = {};
    const trainByDate = {};
    workoutRecords.forEach((r) => {
      if (!r.workout_date) return;
      volumeByDate[r.workout_date] = (volumeByDate[r.workout_date] || 0) + archiveMath.computeRecordStats(r).volume;
      trainByDate[r.workout_date] = 1;
    });
    const waterByDate = {};
    Object.keys(waterDaily).forEach((d) => {
      waterByDate[d] = waterDaily[d].total;
    });
    const weightByDate = {};
    weightRecords.forEach((r) => {
      if (r.date) weightByDate[r.date] = r.weight_kg;
    });
    const waistByDate = {};
    bodyHistory.forEach((r) => {
      if (r.date && r.waist_cm) waistByDate[r.date] = r.waist_cm;
    });

    const trends = {
      volume: archiveMath.buildDailySeries(volumeByDate, 30),
      trainingDays: archiveMath.buildDailySeries(trainByDate, 30),
      water: archiveMath.buildDailySeries(waterByDate, 30),
      weight: Object.keys(weightByDate)
        .sort()
        .slice(-30)
        .map((d) => ({ date: d, value: weightByDate[d] })),
      pr: archiveMath.computeDailyPRs(workoutRecords, 30),
      waist: Object.keys(waistByDate)
        .sort()
        .slice(-30)
        .map((d) => ({ date: d, value: waistByDate[d] }))
    };

    const result = {
      hasUser: true,
      training,
      weight,
      body,
      water,
      recovery,
      trends,
      cyclesCompleted: cycles,
      weeklyFrequency: freq
    };
    cache.set(ARCHIVE_CACHE_KEY, result, TTL);
    return result;
  } catch (err) {
    console.error('[archive] getArchiveStats 失败', err);
    throw err;
  }
}

async function getRecentRecovery() {
  try {
    const start = formatDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
    const res = await db
      .collection('recovery_records')
      .where({ _openid: '{openid}', date: db.command.gte(start) })
      .orderBy('date', 'asc')
      .limit(60)
      .get();
    return res.data;
  } catch (err) {
    return [];
  }
}

async function getCyclesCount() {
  try {
    const res = await db
      .collection('training_cycles')
      .where({ _openid: '{openid}', status: 'completed' })
      .count();
    return res.total || 0;
  } catch (err) {
    return 0;
  }
}

/**
 * 成就检测：计算当前全部成就状态，新解锁的写入 achievements 集合
 * @returns {Promise<Object>} { list: [{key,title,desc,icon,unlocked,progress,unlockedAt}], newly: [title...] }
 */
async function getAchievements() {
  const cached = cache.get(ACHIEVE_CACHE_KEY);
  if (cached !== null) return cached;

  const stats = await getArchiveStats();

  // 连续训练（历史最长）
  const dateSet = {};
  try {
    const records = await getAllByWhere('workout_records', { _openid: '{openid}' }, { orderField: 'workout_date', orderDir: 'asc', max: 500 });
    records.forEach((r) => {
      if (r.workout_date) dateSet[r.workout_date] = true;
    });
  } catch (err) {
    // 忽略
  }
  const maxStreak = archiveMath.maxConsecutive(Object.keys(dateSet));

  // 体重连续记录
  let weightStreak = 0;
  try {
    const wRes = await getAllByWhere('weight_records', { _openid: '{openid}' }, { orderField: 'date', orderDir: 'asc', max: 200 });
    weightStreak = archiveMath.maxConsecutive(wRes.map((r) => r.date));
  } catch (err) {
    // 忽略
  }

  const input = {
    totalTrainingDays: stats.training.total,
    maxStreak,
    totalVolume: stats.training.totalVolume,
    prCount: stats.training.prCount,
    weightStreak,
    waterStreak: stats.water.streakDays,
    cyclesCompleted: stats.cyclesCompleted
  };

  const computed = archiveMath.computeAchievements(input);
  const unlockedKeys = new Set(computed.filter((a) => a.unlocked).map((a) => a.key));

  // 读取已解锁记录
  let stored = [];
  try {
    const res = await db
      .collection(ACHIEVEMENT_COLLECTION)
      .where({ _openid: '{openid}' })
      .limit(1)
      .get();
    stored = res.data.length > 0 ? res.data[0].unlocked || [] : [];
  } catch (err) {
    stored = [];
  }
  const storedMap = {};
  stored.forEach((u) => {
    storedMap[u.key] = u.unlocked_at;
  });

  // 新解锁
  const newly = [];
  const merged = stored.slice();
  computed.forEach((a) => {
    if (a.unlocked && !storedMap[a.key]) {
      merged.push({ key: a.key, unlocked_at: new Date().toISOString() });
      newly.push(a.title);
    }
  });
  if (newly.length > 0) {
    try {
      const exist = await db
        .collection(ACHIEVEMENT_COLLECTION)
        .where({ _openid: '{openid}' })
        .limit(1)
        .get();
      const payload = { unlocked: merged.slice(-100), updated_at: db.serverDate() };
      if (exist.data.length > 0) {
        await db.collection(ACHIEVEMENT_COLLECTION).doc(exist.data[0]._id).update({ data: payload });
      } else {
        payload.created_at = db.serverDate();
        await db.collection(ACHIEVEMENT_COLLECTION).add({ data: payload });
      }
    } catch (err) {
      console.error('[archive] 成就写入失败', err);
    }
  }

  const result = {
    list: computed.map((a) => ({
      key: a.key,
      title: a.title,
      desc: a.desc,
      icon: a.icon,
      unlocked: a.unlocked,
      progress: a.progress,
      unlockedAt: storedMap[a.key] || ''
    })),
    newly
  };
  cache.set(ACHIEVE_CACHE_KEY, result, 60 * 60 * 1000); // 成就变化低频，缓存 1h
  return result;
}

module.exports = {
  getArchiveStats,
  getAchievements,
  invalidate
};
