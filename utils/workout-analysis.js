// utils/workout-analysis.js - 训练表现分析（纯函数，无 wx 依赖，可单测）
// 职责：基于 workout_records 记录计算
//   1. 单条记录统计：最大重量 / 最大次数 / 训练容量 / 组数 / RPE
//   2. 个人 PR：最大重量 PR / 最大次数 PR / 最大训练容量 PR
//   3. 最近一次 / 上一次表现
//   4. 最近 7 天 / 30 天表现
//   5. 趋势数据点（重量 / 次数 / 容量）
//   6. 渐进超负荷建议（全部基于历史数据，禁止凭空生成重量）
// 口径：
//   - 训练容量 volume = Σ(每组 重量 × 次数) ；
//     当每组重量/次数相同时等价于需求公式 volume = weight × reps × sets
//   - 同一天同一动作只有一条记录（唯一键 openid+workout_date+exercise_id），
//     因此按日期聚合天然正确，同一天多次训练不影响
//   - 旧数据（v1，无 set_records）：maxWeight/volume 为 0（无重量数据），maxReps 回退计划次数
// 注意：cloudfunctions/aiCoach/analysis.js 与本文件保持逻辑一致（云函数独立部署，需同步修改）

// 数字取 0.5 的倍数（重量建议用）
function roundToHalf(n) {
  return Math.round(n * 2) / 2;
}

// 单条记录统计
// @param {Object} r 规范化后的训练记录（含 set_records）
// @returns {Object} { date, sets, maxWeight, maxWeightReps, maxReps, maxRepsWeight, volume, maxRpe }
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

// 汇总个人 PR（输入记录数组，任意顺序）
// @returns {Object} { maxWeightPR, maxRepsPR, maxVolumePR }
//   每项 { value, date, reps?/weight?/sets? }，无数据时为 null
//   tie-break：相同值取最近达成日期
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

// 判断某条记录的统计是否打破对应 PR（严格大于才算是新 PR）
// @param {Object} st computeRecordStats 的结果
// @param {Object} prs computePRs 的结果
// @returns {Array<string>} 新打破的 PR 类型：['weight'|'reps'|'volume']
function detectNewPRs(st, prs) {
  const list = [];
  if (st.maxWeight > 0 && (!prs.maxWeightPR || st.maxWeight > prs.maxWeightPR.value)) list.push('weight');
  if (st.maxReps > 0 && (!prs.maxRepsPR || st.maxReps > prs.maxRepsPR.value)) list.push('reps');
  if (st.volume > 0 && (!prs.maxVolumePR || st.volume > prs.maxVolumePR.value)) list.push('volume');
  return list;
}

// 最近一次表现（records 升序，取最后一条）；无记录返回 null
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

// 上一次表现（倒数第二条）；无返回 null
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

// 日期工具（与 utils/date.js 一致，纯函数内部自实现避免依赖顺序）
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// 最近 N 天表现（含今天；records 升序）
// @returns {Object|null} { days, volume, maxWeight, maxReps, records }
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
  return { days: list.length, volume: Math.round(volume), maxWeight, maxReps, records: list };
}

// 趋势数据点（升序；days 不传或 0 = 全部）
// @returns {Array<{ date, maxWeight, maxReps, volume, sets }>}
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

// 训练容量统计
// @param {Array} records 升序记录
// @param {number} days 最近 N 天（不传 = 全部）
// @returns {Object} { totalVolume, dayCount, trend, byDay: [{date, volume}] }
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
  // 趋势方向：后半段日均 vs 前半段日均（至少 4 个点才有意义）
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

// ===== 渐进超负荷建议（数据依据，禁止凭空） =====

/**
 * 生成下次训练建议
 * @param {Object} opts
 * @param {Object|null} opts.last 最近一次表现（computeLastPerformance 结果）
 * @param {Object|null} opts.prev 上一次表现
 * @param {Object} opts.prs PR 汇总
 * @param {number} opts.plannedSets 动作库推荐组数
 * @param {number} opts.plannedReps 动作库推荐次数
 * @returns {Object} { action, actionText, reason, nextWeightKg, nextReps, nextSets, nearPR }
 */
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

  // 无任何数据：从轻开始（依据动作库推荐）
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

  // 只有一条记录：保持或轻微递增
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

  // 容量对比（±5% 视为持平）
  const up = last.volume > prev.volume * 1.05;
  const down = last.volume < prev.volume * 0.95;
  const reachedTarget = !!(plannedReps && last.maxReps >= plannedReps);

  if (down) {
    // 容量下降：恢复优先，保持或降低
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
    // 容量上升：可持续加重（仅当有重量数据）
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

  // 持平：达标则加重，未达标加次数
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
  roundToHalf
};
