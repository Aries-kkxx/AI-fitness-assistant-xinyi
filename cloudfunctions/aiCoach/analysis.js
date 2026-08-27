// cloudfunctions/aiCoach/analysis.js - 训练表现分析（云函数端）
// ⚠️ 与前端 utils/workout-analysis.js 保持逻辑一致（云函数独立部署，修改需同步两边）。
// 职责：基于 workout_records 计算
//   1. 单条记录统计（最大重量/最大次数/容量/RPE）
//   2. 个人 PR（最大重量/最大次数/最大容量）
//   3. 最近一次/上一次表现、最近 N 天统计、趋势点
//   4. 渐进超负荷建议（数据依据，禁止凭空生成重量）
// 口径：volume = Σ(每组 重量×次数)（同组时等价于 weight×reps×sets）；
//       同一天同一动作只有一条记录，按日期聚合天然正确。

function roundToHalf(n) {
  return Math.round(n * 2) / 2;
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// 单条记录统计
function computeRecordStats(r) {
  const arr = Array.isArray(r.set_records) ? r.set_records : [];
  let maxWeight = 0;
  let maxWeightReps = 0;
  let maxReps = 0;
  let maxRepsWeight = 0;
  let volume = 0;
  let maxRpe = 0;
  arr.forEach((s) => {
    const weight = Number(s.weight) || 0;
    const reps = Number(s.reps) || 0;
    const rpe = Number(s.rpe) || 0;
    volume += weight * reps;
    if (weight > 0 && weight > maxWeight) {
      maxWeight = weight;
      maxWeightReps = reps;
    }
    if (reps > maxReps) {
      maxReps = reps;
      maxRepsWeight = weight;
    }
    if (rpe > maxRpe) maxRpe = rpe;
  });
  return {
    date: r.workout_date || '',
    sets: Number(r.actual_sets) || (arr.length > 0 ? arr.length : Number(r.sets) || 0),
    maxWeight: roundToHalf(maxWeight),
    maxWeightReps,
    maxReps,
    maxRepsWeight: roundToHalf(maxRepsWeight),
    volume: Math.round(volume),
    maxRpe
  };
}

// 汇总个人 PR
function computePRs(records) {
  const prs = { maxWeightPR: null, maxRepsPR: null, maxVolumePR: null };
  (records || []).forEach((r) => {
    const st = computeRecordStats(r);
    if (st.maxWeight > 0 && (!prs.maxWeightPR || st.maxWeight > prs.maxWeightPR.value)) {
      prs.maxWeightPR = { value: st.maxWeight, date: st.date, reps: st.maxWeightReps };
    }
    if (st.maxReps > 0 && (!prs.maxRepsPR || st.maxReps > prs.maxRepsPR.value)) {
      prs.maxRepsPR = { value: st.maxReps, date: st.date, weight: st.maxRepsWeight };
    }
    if (st.volume > 0 && (!prs.maxVolumePR || st.volume > prs.maxVolumePR.value)) {
      prs.maxVolumePR = { value: st.volume, date: st.date, sets: st.sets };
    }
  });
  return prs;
}

// 判断是否打破 PR（严格大于）
function detectNewPRs(st, prs) {
  const list = [];
  if (st.maxWeight > 0 && (!prs.maxWeightPR || st.maxWeight > prs.maxWeightPR.value)) list.push('weight');
  if (st.maxReps > 0 && (!prs.maxRepsPR || st.maxReps > prs.maxRepsPR.value)) list.push('reps');
  if (st.volume > 0 && (!prs.maxVolumePR || st.volume > prs.maxVolumePR.value)) list.push('volume');
  return list;
}

// 最近一次表现
function computeLastPerformance(records) {
  const list = records || [];
  if (list.length === 0) return null;
  const r = list[list.length - 1];
  const st = computeRecordStats(r);
  return {
    date: r.workout_date,
    sets: st.sets,
    maxWeight: st.maxWeight,
    maxWeightReps: st.maxWeightReps,
    maxReps: st.maxReps,
    volume: st.volume,
    maxRpe: st.maxRpe,
    note: r.note || ''
  };
}

// 上一次表现
function computePrevPerformance(records) {
  const list = records || [];
  if (list.length < 2) return null;
  const r = list[list.length - 2];
  const st = computeRecordStats(r);
  return {
    date: r.workout_date,
    sets: st.sets,
    maxWeight: st.maxWeight,
    maxWeightReps: st.maxWeightReps,
    maxReps: st.maxReps,
    volume: st.volume,
    maxRpe: st.maxRpe
  };
}

// 最近 N 天表现
function computeRecentStats(records, days) {
  const n = Math.max(1, Number(days) || 7);
  const today = formatDate(new Date());
  const start = formatDate(new Date(Date.now() - (n - 1) * 24 * 60 * 60 * 1000));
  const list = (records || []).filter((r) => r.workout_date && r.workout_date >= start && r.workout_date <= today);
  if (list.length === 0) return null;
  let volume = 0;
  let maxWeight = 0;
  let maxReps = 0;
  list.forEach((r) => {
    const st = computeRecordStats(r);
    volume += st.volume;
    if (st.maxWeight > maxWeight) maxWeight = st.maxWeight;
    if (st.maxReps > maxReps) maxReps = st.maxReps;
  });
  return { days: list.length, volume: Math.round(volume), maxWeight, maxReps };
}

// 趋势数据点
function computeTrendPoints(records, days) {
  let list = records || [];
  if (days && Number(days) > 0) {
    const n = Number(days);
    const today = formatDate(new Date());
    const start = formatDate(new Date(Date.now() - (n - 1) * 24 * 60 * 60 * 1000));
    list = list.filter((r) => r.workout_date && r.workout_date >= start && r.workout_date <= today);
  }
  return list.map((r) => {
    const st = computeRecordStats(r);
    return { date: r.workout_date, maxWeight: st.maxWeight, maxReps: st.maxReps, volume: st.volume, sets: st.sets };
  });
}

// 容量统计
function computeVolumeStats(records, days) {
  let list = records || [];
  if (days && Number(days) > 0) {
    const n = Number(days);
    const today = formatDate(new Date());
    const start = formatDate(new Date(Date.now() - (n - 1) * 24 * 60 * 60 * 1000));
    list = list.filter((r) => r.workout_date && r.workout_date >= start && r.workout_date <= today);
  }
  let totalVolume = 0;
  const byDay = [];
  list.forEach((r) => {
    const v = computeRecordStats(r).volume;
    totalVolume += v;
    byDay.push({ date: r.workout_date, volume: v });
  });
  let trend = 'flat';
  if (byDay.length >= 4) {
    const half = Math.floor(byDay.length / 2);
    const first = byDay.slice(0, half).reduce((s, d) => s + d.volume, 0) / half;
    const second = byDay.slice(half).reduce((s, d) => s + d.volume, 0) / (byDay.length - half);
    if (second > first * 1.05) trend = 'up';
    else if (second < first * 0.95) trend = 'down';
  }
  return { totalVolume: Math.round(totalVolume), dayCount: byDay.length, trend, byDay };
}

// 渐进超负荷建议（数据依据）
function buildOverloadSuggestion(opts) {
  const { last, prev, prs, plannedSets, plannedReps } = opts || {};
  const base = {
    action: 'maintain',
    actionText: '保持当前训练量',
    reason: '',
    nextWeightKg: null,
    nextReps: null,
    nextSets: null,
    nearPR: false
  };

  if (!last) {
    return Object.assign({}, base, {
      action: 'start',
      actionText: '开始训练，从轻重量起步',
      reason: '该动作还没有训练记录。建议按动作库推荐 ' + (plannedSets || 3) + ' 组 × ' + (plannedReps || 10) + ' 次开始，' +
        (plannedSets && plannedReps ? '重量从轻开始（自重或最轻配重），先掌握动作质量。' : '先掌握动作质量。'),
      nextWeightKg: null,
      nextReps: plannedReps || null,
      nextSets: plannedSets || null
    });
  }

  const lastWeight = last.maxWeight || 0;
  const nearPR = !!(prs && prs.maxWeightPR && lastWeight > 0 && lastWeight < prs.maxWeightPR.value && lastWeight >= prs.maxWeightPR.value * 0.95);

  if (!prev) {
    const reachedTarget = !!(plannedReps && last.maxReps >= plannedReps);
    if (lastWeight > 0 && reachedTarget) {
      const next = roundToHalf(lastWeight + Math.max(2.5, roundToHalf(lastWeight * 0.05)));
      return Object.assign({}, base, {
        action: 'increase_weight',
        actionText: '小幅增加重量',
        reason: '首次记录已达标（' + last.maxReps + ' 次 ≥ 推荐 ' + plannedReps + ' 次）。建议下次加重 ' +
          Math.max(2.5, roundToHalf(lastWeight * 0.05)) + 'kg 到 ' + next + 'kg，保持 ' + last.maxReps + ' 次。',
        nextWeightKg: next,
        nextReps: last.maxReps,
        nextSets: last.sets || plannedSets || 3,
        nearPR
      });
    }
    return Object.assign({}, base, {
      action: 'maintain',
      actionText: '保持当前训练量',
      reason: '首次记录建议先稳定动作质量。下次保持相同重量与次数，' +
        (last.maxReps < (plannedReps || 99) ? '尝试每组做到 ' + Math.min((plannedReps || 10), last.maxReps + 2) + ' 次后，再考虑加重。' : '之后每次可小幅递增。'),
      nextWeightKg: lastWeight || null,
      nextReps: Math.min((plannedReps || 10), last.maxReps + 2),
      nextSets: last.sets || plannedSets || 3,
      nearPR
    });
  }

  const up = last.volume > prev.volume * 1.05;
  const down = last.volume < prev.volume * 0.95;
  const reachedTarget = !!(plannedReps && last.maxReps >= plannedReps);

  if (down) {
    return Object.assign({}, base, {
      action: 'reduce',
      actionText: '降低训练量，注意恢复',
      reason: '训练容量从 ' + prev.volume + 'kg 降至 ' + last.volume + 'kg（-' +
        Math.round((1 - last.volume / prev.volume) * 100) + '%）。建议先保持或减少 1 组，优先恢复状态，' +
        (lastWeight > 0 ? '重量暂不加。' : '再逐步恢复。'),
      nextWeightKg: lastWeight || null,
      nextReps: last.maxReps || null,
      nextSets: Math.max(1, (last.sets || 3) - 1),
      nearPR
    });
  }

  if (up) {
    if (lastWeight > 0) {
      const next = roundToHalf(lastWeight + Math.max(2.5, roundToHalf(lastWeight * 0.05)));
      return Object.assign({}, base, {
        action: 'increase_weight',
        actionText: '增加重量',
        reason: '训练容量持续上升（' + prev.volume + 'kg → ' + last.volume + 'kg）。建议下次加重 ' +
          Math.max(2.5, roundToHalf(lastWeight * 0.05)) + 'kg 到 ' + next + 'kg，保持 ' + last.maxReps + ' 次。',
        nextWeightKg: next,
        nextReps: last.maxReps,
        nextSets: last.sets || plannedSets || 3,
        nearPR
      });
    }
    return Object.assign({}, base, {
      action: 'maintain',
      actionText: '保持当前训练量',
      reason: '容量上升但缺少重量数据，保持当前组数与次数即可，逐步增加次数。',
      nextWeightKg: null,
      nextReps: Math.min((plannedReps || 15), last.maxReps + 2),
      nextSets: last.sets || plannedSets || 3,
      nearPR
    });
  }

  if (reachedTarget && lastWeight > 0) {
    const next = roundToHalf(lastWeight + Math.max(2.5, roundToHalf(lastWeight * 0.05)));
    return Object.assign({}, base, {
      action: 'increase_weight',
      actionText: '增加重量',
      reason: '已完成 ' + last.maxReps + ' 次（≥ 推荐 ' + plannedReps + ' 次），容量稳定。建议下次加重 ' +
        Math.max(2.5, roundToHalf(lastWeight * 0.05)) + 'kg 到 ' + next + 'kg。',
      nextWeightKg: next,
      nextReps: last.maxReps,
      nextSets: last.sets || plannedSets || 3,
      nearPR
    });
  }
  return Object.assign({}, base, {
    action: 'increase_reps',
    actionText: '保持重量，增加次数',
    reason: '当前 ' + last.maxReps + ' 次还未达到推荐 ' + (plannedReps || 10) + ' 次。保持重量 ' +
      (lastWeight > 0 ? lastWeight + 'kg ' : '') + '，下次目标 ' + Math.min((plannedReps || 10), last.maxReps + 2) + ' 次。',
    nextWeightKg: lastWeight || null,
    nextReps: Math.min((plannedReps || 10), last.maxReps + 2),
    nextSets: last.sets || plannedSets || 3,
    nearPR
  });
}

module.exports = {
  computeRecordStats,
  computePRs,
  detectNewPRs,
  computeLastPerformance,
  computePrevPerformance,
  computeRecentStats,
  computeTrendPoints,
  computeVolumeStats,
  buildOverloadSuggestion,
  roundToHalf,
  // 训练状态判断（与前端 utils/training-state.js 保持一致）
  detectPain,
  computeTrainingState,
  buildTodayAdvice
};

// ===== 训练状态判断（与前端 utils/training-state.js 逻辑一致，需同步修改） =====

const PAIN_KEYWORDS = ['痛', '疼', '伤', '扭', '拉伤', '不适', '疼痛', '受伤', '酸疼', '崴'];

/**
 * 检测备注中是否提到疼痛/伤病（仅提示安全，不构成医疗诊断）
 */
function detectPain(note) {
  if (!note) return false;
  return PAIN_KEYWORDS.some((k) => note.indexOf(k) >= 0);
}

/**
 * 训练状态判断：NORMAL / REDUCE / RECOVERY / REST
 * @param {Object} input { recovery, consecutiveDays, weekTrainingDays, volumeTrend, painNote }
 * @returns {Object} { state, stateText, risk, pain, reasons, suggestions }
 */
function computeTrainingState(input) {
  const { recovery, consecutiveDays, weekTrainingDays, volumeTrend, painNote } = input || {};
  const reasons = [];
  const suggestions = [];
  let risk = 0;

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

  const pain = detectPain(painNote) || (recovery && detectPain(recovery.note));
  if (pain) {
    reasons.push('身体反馈中提到疼痛/不适');
  }

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

/**
 * 今日建议文案（云函数端兜底用；页面端用 utils/training-state.js）
 */
function buildTodayAdvice(input) {
  const { trainingState, recovery, water } = input || {};
  const ts = trainingState || computeTrainingState({});
  const tips = [];

  let trainingText = '状态良好，按今日计划正常训练 💪';
  if (ts.state === 'REDUCE') trainingText = '状态一般：建议降低训练量，减少 1 个动作或每组减 1-2 次';
  else if (ts.state === 'RECOVERY') trainingText = '身体需要恢复：建议以低强度活动、拉伸放松为主';
  else if (ts.state === 'REST') trainingText = '建议今天休息，让身体充分恢复';
  if (ts.pain) trainingText = '身体有不适反馈：今天不建议训练，注意休息观察';

  if (recovery) {
    if (Number(recovery.sleep_quality) <= 2) tips.push('昨晚睡眠不足，今晚尽量早点休息');
    if (Number(recovery.fatigue) >= 4) tips.push('疲劳度较高，训练节奏放慢，多喝水');
    if (Number(recovery.soreness) >= 4) tips.push('肌肉酸痛明显，注意拉伸放松，可热敷缓解');
    if (Number(recovery.motivation) <= 2) tips.push('今天状态一般，不强求，动一动就好');
  }
  if (ts.reasons.length > 0) tips.push(ts.reasons[0] + '，注意身体反馈');
  if (tips.length === 0) tips.push('保持规律作息，训练后充分补水');

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

  let summary = trainingText.replace(/💪|！|。/g, '');
  if (ts.state === 'NORMAL' && recovery) summary = '状态不错，今天按计划好好练';
  else if (ts.state === 'NORMAL') summary = '状态正常，按计划训练';
  if (ts.pain) summary = '身体有不适，先别练，好好休息，必要时咨询专业人士';
  if (water && water.percent < 60) summary += '，记得多喝水';

  return { trainingText, recoveryTips: tips, waterText, summary };
}
