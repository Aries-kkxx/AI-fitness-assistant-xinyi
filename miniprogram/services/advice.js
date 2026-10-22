// services/advice.js - 「欣一今日建议」聚合数据层
// 职责：组合 用户资料 + 今日恢复状态 + 训练负荷 + 训练状态判断 + 饮水统计，
//       输出首页「欣一今日建议」卡片所需全部数据（本地规则生成，不依赖 AI）。
// 缓存：聚合结果 60 秒（内部各 service 有更长缓存）；训练/恢复写入时立即失效
//       （键名约定 'home_advice'，recovery.js 与 workout.js 失效时同步清除）。
const userService = require('./user');
const recoveryService = require('./recovery');
const workoutService = require('./workout');
const waterService = require('./water');
const cache = require('../utils/cache');
const { computeTrainingState, buildTodayAdvice } = require('../utils/training-state');

const ADVICE_CACHE_KEY = 'home_advice';
const ADVICE_TTL = 60 * 1000;

/**
 * 获取今日建议（首页 + 本地兜底共用）
 * @returns {Promise<Object>} {
 *   hasUser, hasRecovery, recovery, trainingState,
 *   trainingText, recoveryTips, waterText, summary
 * }
 */
async function getTodayAdvice() {
  const cached = cache.get(ADVICE_CACHE_KEY);
  if (cached !== null) return cached;

  const result = await computeAdvice();
  cache.set(ADVICE_CACHE_KEY, result, ADVICE_TTL);
  return result;
}

async function computeAdvice() {
  try {
    const user = await userService.getUser();
    if (!user) {
      return {
        hasUser: false,
        hasRecovery: false,
        recovery: null,
        trainingState: null,
        trainingText: '',
        recoveryTips: [],
        waterText: '',
        summary: ''
      };
    }

    // 并行：今日恢复 + 训练负荷 + 今日饮水
    const [recovery, loadStats, water] = await Promise.all([
      recoveryService.getTodayRecovery(),
      workoutService.getTrainingLoadStats(),
      waterService.getTodayStats()
    ]);

    const trainingState = computeTrainingState({
      recovery,
      consecutiveDays: loadStats ? loadStats.consecutiveDays : 0,
      weekTrainingDays: loadStats ? loadStats.weekTrainingDays : 0,
      volumeTrend: loadStats ? loadStats.volumeTrend : 'flat',
      painNote: recovery ? recovery.note : ''
    });

    const advice = buildTodayAdvice({ trainingState, recovery, water });

    return {
      hasUser: true,
      hasRecovery: !!recovery,
      recovery,
      trainingState,
      trainingText: advice.trainingText,
      recoveryTips: advice.recoveryTips,
      waterText: advice.waterText,
      summary: advice.summary
    };
  } catch (err) {
    console.error('[advice] getTodayAdvice 失败', err);
    // 失败静默降级：返回空建议，不影响首页其他卡片
    return {
      hasUser: false,
      hasRecovery: false,
      recovery: null,
      trainingState: null,
      trainingText: '',
      recoveryTips: [],
      waterText: '',
      summary: ''
    };
  }
}

// 供 recovery 保存/删除后失效（约定键名，避免循环依赖）
module.exports = {
  getTodayAdvice
};
