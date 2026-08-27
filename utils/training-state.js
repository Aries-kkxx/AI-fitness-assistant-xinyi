// utils/training-state.js - 训练状态判断与今日建议（纯函数，无 wx 依赖）
// 职责：
//   1. 疼痛/伤病关键词检测（用于安全建议，不做医疗诊断）
//   2. 训练状态判断：NORMAL / REDUCE / RECOVERY / REST
//      - 输入：今日恢复记录（睡眠/疲劳/酸痛/意愿）+ 训练负荷（连续训练天数、近7天训练天数、容量趋势）
//      - 输出：状态 + 风险分 + 依据（reasons）+ 建议（suggestions）
//   3. 今日建议文案（训练建议 / 恢复建议 / 饮水建议 / 一句话总结）
// 原则：全部数据依据来自恢复记录与训练记录，禁止凭空生成。
// 注意：cloudfunctions/aiCoach/analysis.js 与本文件保持逻辑一致（云函数独立部署，需同步修改）。

// 疼痛/伤病关键词（仅提示安全，不构成任何医疗诊断）
const PAIN_KEYWORDS = ['痛', '疼', '伤', '扭', '拉伤', '不适', '疼痛', '受伤', '酸疼', '崴'];

/**
 * 检测备注中是否提到疼痛/伤病
 * @param {string} note 恢复备注或训练备注
 * @returns {boolean}
 */
function detectPain(note) {
  if (!note) return false;
  return PAIN_KEYWORDS.some((k) => note.indexOf(k) >= 0);
}

/**
 * 训练状态判断
 * @param {Object} input
 * @param {Object|null} input.recovery 今日恢复记录 { sleep_quality, fatigue, soreness, motivation, body_status, note }
 * @param {number} input.consecutiveDays 连续训练天数（从今天往回）
 * @param {number} input.weekTrainingDays 近 7 天训练天数（仅作信息展示，不重复计分）
 * @param {string} input.volumeTrend 容量趋势 'up' | 'flat' | 'down'
 * @param {string} [input.painNote] 额外备注（如训练备注），用于疼痛检测
 * @returns {Object} {
 *   state: 'NORMAL'|'REDUCE'|'RECOVERY'|'REST',
 *   stateText: 中文状态,
 *   risk, pain, reasons: string[], suggestions: string[]
 * }
 */
function computeTrainingState(input) {
  const { recovery, consecutiveDays, weekTrainingDays, volumeTrend, painNote } = input || {};
  const reasons = [];
  const suggestions = [];
  let risk = 0;

  // 今日恢复数据评分
  if (recovery) {
    if (Number(recovery.fatigue) >= 5) {
      risk += 2;
      reasons.push('疲劳度很高（' + recovery.fatigue + '/5）');
    } else if (Number(recovery.fatigue) >= 4) {
      risk += 1;
      reasons.push('疲劳度较高（' + recovery.fatigue + '/5）');
    }
    if (Number(recovery.sleep_quality) <= 2) {
      risk += 1;
      reasons.push('睡眠质量较差（' + recovery.sleep_quality + '/5）');
    }
    if (Number(recovery.soreness) >= 4) {
      risk += 1;
      reasons.push('肌肉酸痛明显（' + recovery.soreness + '/5）');
    }
    if (Number(recovery.motivation) <= 2) {
      risk += 0.5;
      reasons.push('训练意愿较低（' + recovery.motivation + '/5）');
    }
  }

  // 训练负荷评分（连续天数是主维度；近 7 天训练天数仅作信息，避免重复计分）
  const cd = Number(consecutiveDays) || 0;
  const wd = Number(weekTrainingDays) || 0;
  if (cd >= 7) {
    risk += 3;
    reasons.push('已连续训练 ' + cd + ' 天');
  } else if (cd === 6) {
    risk += 2;
    reasons.push('已连续训练 ' + cd + ' 天');
  } else if (cd === 5) {
    risk += 1.5;
    reasons.push('已连续训练 ' + cd + ' 天');
  } else if (cd === 4) {
    risk += 1;
    reasons.push('已连续训练 ' + cd + ' 天');
  } else if (cd === 3) {
    risk += 0.5;
    reasons.push('已连续训练 ' + cd + ' 天');
  }
  if (wd >= 6) {
    reasons.push('近 7 天已训练 ' + wd + ' 天');
  } else if (wd === 5) {
    reasons.push('近 7 天已训练 ' + wd + ' 天');
  }
  if (volumeTrend === 'down') {
    risk += 1;
    reasons.push('训练容量近期呈下降趋势');
  }

  // 疼痛检测（安全优先，不构成医疗诊断）
  const pain = detectPain(painNote) || (recovery && detectPain(recovery.note));
  if (pain) {
    reasons.push('身体反馈中提到疼痛/不适');
  }

  // 状态判定：REDUCE(≥2) < RECOVERY(≥3) < REST(≥4)；疼痛优先恢复
  let state = 'NORMAL';
  if (pain) {
    state = 'RECOVERY';
  } else if (risk >= 4) {
    state = 'REST';
  } else if (risk >= 3) {
    state = 'RECOVERY';
  } else if (risk >= 2) {
    state = 'REDUCE';
  }

  // 建议文案（数据依据）
  if (state === 'NORMAL') suggestions.push('状态良好，按今日计划正常训练');
  if (state === 'REDUCE') suggestions.push('建议降低训练量：减少 1 个动作，或每组减少 1-2 次');
  if (state === 'RECOVERY') suggestions.push('建议以恢复为主：低强度活动、拉伸放松或轻有氧');
  if (state === 'REST') suggestions.push('建议休息一天，让身体充分恢复');
  if (pain) suggestions.push('涉及疼痛/不适：请停止相关动作、降低负荷，必要时咨询专业医疗或运动专业人士');

  return {
    state,
    stateText: state === 'NORMAL' ? '正常' : state === 'REDUCE' ? '降低' : state === 'RECOVERY' ? '恢复' : '休息',
    risk: Math.round(risk * 10) / 10,
    pain,
    reasons,
    suggestions
  };
}

// 评分标签（1-5 档位文案，展示用）
const SCORE_LABELS = {
  sleep: ['很差', '较差', '一般', '不错', '很好'],
  fatigue: ['很低', '较低', '一般', '较高', '很高'],
  soreness: ['无', '轻微', '一般', '明显', '很酸'],
  motivation: ['不想练', '偏低', '一般', '想练', '很想练'],
  body: ['很差', '较差', '一般', '不错', '很好']
};

function scoreText(key, value) {
  const list = SCORE_LABELS[key];
  const v = Number(value);
  if (!list || !v) return '';
  return list[Math.max(1, Math.min(5, v)) - 1];
}

/**
 * 生成今日建议（首页「欣一今日建议」与本地兜底共用）
 * @param {Object} input
 * @param {Object} input.trainingState computeTrainingState 结果
 * @param {Object|null} input.recovery 今日恢复记录
 * @param {Object} input.water 今日饮水统计 { total, target, percent }
 * @returns {Object} { trainingText, recoveryTips: string[], waterText, summary }
 */
function buildTodayAdvice(input) {
  const { trainingState, recovery, water } = input || {};
  const ts = trainingState || computeTrainingState({});
  const tips = [];

  // 训练建议
  let trainingText = '状态良好，按今日计划正常训练 💪';
  if (ts.state === 'REDUCE') trainingText = '状态一般：建议降低训练量，减少 1 个动作或每组减 1-2 次';
  else if (ts.state === 'RECOVERY') trainingText = '身体需要恢复：建议以低强度活动、拉伸放松为主';
  else if (ts.state === 'REST') trainingText = '建议今天休息，让身体充分恢复';
  if (ts.pain) trainingText = '身体有不适反馈：今天不建议训练，注意休息观察';

  // 恢复建议（数据依据）
  if (recovery) {
    if (Number(recovery.sleep_quality) <= 2) tips.push('昨晚睡眠不足，今晚尽量早点休息');
    if (Number(recovery.fatigue) >= 4) tips.push('疲劳度较高，训练节奏放慢，多喝水');
    if (Number(recovery.soreness) >= 4) tips.push('肌肉酸痛明显，注意拉伸放松，可热敷缓解');
    if (Number(recovery.motivation) <= 2) tips.push('今天状态一般，不强求，动一动就好');
  }
  if (ts.reasons.length > 0) {
    tips.push(ts.reasons[0] + '，注意身体反馈');
  }
  if (tips.length === 0) tips.push('保持规律作息，训练后充分补水');

  // 饮水建议
  let waterText = '';
  if (water) {
    const remain = Math.max(0, water.target - water.total);
    waterText =
      water.percent >= 100
        ? '今日饮水 ' + water.total + '/' + water.target + 'ml 已达标 👍'
        : '今日饮水 ' + water.total + '/' + water.target + 'ml，还差 ' + remain + 'ml，记得补水';
  } else {
    waterText = '记得保持每日饮水目标';
  }

  // 一句话总结（数据依据拼接）
  let summary = trainingText.replace(/💪|！|。/g, '');
  if (ts.state === 'NORMAL' && recovery) {
    summary = '状态不错，今天按计划好好练';
  } else if (ts.state === 'NORMAL') {
    summary = '状态正常，按计划训练';
  }
  if (ts.pain) {
    summary = '身体有不适，先别练，好好休息，必要时咨询专业人士';
  }
  if (water && water.percent < 60) {
    summary += '，记得多喝水';
  }

  return { trainingText, recoveryTips: tips, waterText, summary };
}

module.exports = {
  detectPain,
  computeTrainingState,
  buildTodayAdvice,
  scoreText,
  PAIN_KEYWORDS
};
