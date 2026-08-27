// cloudfunctions/aiCoach/cycle.js - 训练周期统计（云函数端）
// ⚠️ 与前端 services/cycle.js 的统计逻辑保持一致（云函数独立部署，需同步修改）。
// 职责：为 AI 工具 getTrainingCycle 提供程序计算的周期/每周统计：
//   - 当前周计算、周期到期惰性完成
//   - 每周总结（训练天数/完成率/容量/PR/体重/饮水/恢复 + 本地规则文案）
//   - 周期总结（完成率/总容量/纪录/表现变化 + 下周期建议）
// 原则：所有统计由程序计算，AI 只解释，不伪造数字。

const analysis = require('./analysis');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const database = cloud.database();
const _ = database.command;

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function parseDate(dateStr) {
  return new Date(dateStr.replace(/-/g, '/'));
}
function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}
function getWeekRange(startDate, weekNo) {
  return { start: addDays(startDate, (weekNo - 1) * 7), end: addDays(startDate, weekNo * 7 - 1) };
}
function getCurrentWeek(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (today < start || today > end) return 0;
  return Math.floor(Math.floor((today - start) / (24 * 60 * 60 * 1000)) / 7) + 1;
}
function isCycleOver(endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > parseDate(endDate);
}

// 某动作全部历史记录（升序）
async function getAllRecords(openid) {
  const res = await database
    .collection('workout_records')
    .where({ _openid: openid })
    .orderBy('workout_date', 'asc')
    .limit(500)
    .get();
  return res.data;
}

// 周内 PR 计数（严格大于周前 PR）
function countPRs(before, inWeek) {
  const beforeByEx = {};
  before.forEach((r) => {
    if (!r.exercise_id) return;
    (beforeByEx[r.exercise_id] = beforeByEx[r.exercise_id] || []).push(r);
  });
  const inWeekByEx = {};
  inWeek.forEach((r) => {
    if (!r.exercise_id) return;
    (inWeekByEx[r.exercise_id] = inWeekByEx[r.exercise_id] || []).push(r);
  });
  let count = 0;
  Object.keys(inWeekByEx).forEach((exId) => {
    const b = analysis.computePRs(beforeByEx[exId] || []);
    const a = analysis.computePRs((beforeByEx[exId] || []).concat(inWeekByEx[exId]));
    if (a.maxWeightPR && (!b.maxWeightPR || a.maxWeightPR.value > b.maxWeightPR.value)) count++;
    if (a.maxRepsPR && (!b.maxRepsPR || a.maxRepsPR.value > b.maxRepsPR.value)) count++;
    if (a.maxVolumePR && (!b.maxVolumePR || a.maxVolumePR.value > b.maxVolumePR.value)) count++;
  });
  return count;
}

// 周统计（程序计算）
async function computeWeekStats(openid, cycle, weekNo) {
  const { start, end } = getWeekRange(cycle.start_date, weekNo);
  const week = (cycle.weeks || []).find((w) => w.week_no === weekNo);
  const plannedIds = new Set();
  (week ? week.days : []).forEach((d) => {
    (d.exercise_ids || []).forEach((id) => plannedIds.add(id));
  });

  const records = await getAllRecords(openid);
  const inWeek = records.filter((r) => r.workout_date >= start && r.workout_date <= end);

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

  let totalVolume = 0;
  inWeek.forEach((r) => {
    totalVolume += analysis.computeRecordStats(r).volume;
  });

  const before = records.filter((r) => r.workout_date < start);
  const prCount = countPRs(before, inWeek);

  // 体重变化
  let weightChange = null;
  try {
    const wRes = await database
      .collection('weight_records')
      .where({ _openid: openid, date: _.gte(start).and(_.lte(end)) })
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
    // 忽略
  }

  // 饮水达标天数
  let waterDays = 0;
  try {
    const waterRes = await database
      .collection('water_records')
      .where({ _openid: openid })
      .orderBy('date', 'asc')
      .limit(500)
      .get();
    const groups = {};
    waterRes.data.forEach((r) => {
      if (r.date >= start && r.date <= end) {
        if (!groups[r.date]) groups[r.date] = { total: 0, target: r.daily_target_ml || 0 };
        groups[r.date].total += r.amount_ml || 0;
        if (!groups[r.date].target && r.daily_target_ml) groups[r.date].target = r.daily_target_ml;
      }
    });
    Object.keys(groups).forEach((d) => {
      if (groups[d].target > 0 && groups[d].total >= groups[d].target) waterDays++;
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
    const recRes = await database
      .collection('recovery_records')
      .where({ _openid: openid, date: _.gte(start).and(_.lte(end)) })
      .limit(30)
      .get();
    const recs = recRes.data;
    if (recs.length > 0) {
      sleepAvg = Math.round((recs.reduce((s, r) => s + (Number(r.sleep_quality) || 0), 0) / recs.length) * 10) / 10;
      fatigueAvg = Math.round((recs.reduce((s, r) => s + (Number(r.fatigue) || 0), 0) / recs.length) * 10) / 10;
      sorenessAvg = Math.round((recs.reduce((s, r) => s + (Number(r.soreness) || 0), 0) / recs.length) * 10) / 10;
      painDetected = recs.some((r) => analysis.detectPain(r.note) || (Number(r.fatigue) >= 5 && Number(r.soreness) >= 4));
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
    recovery: { sleep_avg: sleepAvg, fatigue_avg: fatigueAvg, soreness_avg: sorenessAvg },
    pain_detected: painDetected
  };
}

// 周总结文案（本地规则）
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

  let advice = '';
  if (state && state.state === 'REDUCE') advice = '下周建议降低训练量：减少动作或组数，优先恢复';
  else if (state && state.state === 'RECOVERY') advice = '下周建议以恢复为主，低强度活动或休息';
  else if (state && state.state === 'REST') advice = '下周建议安排休息日，充分恢复后再继续';
  else if (summary.completion_rate < 70) advice = '下周建议提高计划完成度，尽量按计划训练';
  else advice = '下周建议保持当前训练节奏，继续渐进增加负荷';

  return { performance, improvements, problems, next_week_advice: advice };
}

// 生成（幂等）某周总结
async function ensureWeekSummary(openid, cycle, weekNo) {
  const { end } = getWeekRange(cycle.start_date, weekNo);
  const exists = await database
    .collection('training_cycle_weeks')
    .where({ _openid: openid, cycle_id: cycle._id, week_no: weekNo })
    .limit(1)
    .get();
  const weekOver = isCycleOver(end);
  if (exists.data.length > 0 && !weekOver) return exists.data[0];

  const summary = await computeWeekStats(openid, cycle, weekNo);
  let prevSummary = null;
  if (weekNo > 1) {
    const prev = await database
      .collection('training_cycle_weeks')
      .where({ _openid: openid, cycle_id: cycle._id, week_no: weekNo - 1 })
      .limit(1)
      .get();
    prevSummary = prev.data.length > 0 ? prev.data[0].summary : null;
  }
  let state = null;
  try {
    const today = formatDate(new Date());
    const recRes = await database.collection('recovery_records').where({ _openid: openid, date: today }).limit(1).get();
    const recovery = recRes.data.length > 0 ? recRes.data[0] : null;
    const records = await getAllRecords(openid);
    const dateSet = {};
    records.forEach((r) => {
      if (r.workout_date) dateSet[r.workout_date] = true;
    });
    const dates = Object.keys(dateSet).sort();
    let consecutiveDays = 0;
    let cur = today;
    while (dateSet[cur]) {
      consecutiveDays++;
      const x = new Date(cur.replace(/-/g, '/'));
      x.setDate(x.getDate() - 1);
      cur = formatDate(x);
    }
    const start7 = formatDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    const weekTrainingDays = dates.filter((d) => d >= start7 && d <= today).length;
    const volStats = analysis.computeVolumeStats(records, 7);
    state = analysis.computeTrainingState({
      recovery,
      consecutiveDays,
      weekTrainingDays,
      volumeTrend: volStats.trend,
      painNote: recovery ? recovery.note : ''
    });
  } catch (err) {
    // 忽略
  }

  const aiSummary = buildWeekAiSummary(summary, prevSummary, state);
  const payload = {
    cycle_id: cycle._id,
    week_no: weekNo,
    start_date: summary.start_date,
    end_date: summary.end_date,
    summary,
    ai_summary: aiSummary,
    status: weekOver ? 'completed' : 'active',
    updated_at: cloud.database().serverDate()
  };

  if (exists.data.length > 0) {
    await database.collection('training_cycle_weeks').doc(exists.data[0]._id).update({ data: payload });
  } else {
    payload.created_at = cloud.database().serverDate();
    await database.collection('training_cycle_weeks').add({ data: payload });
  }
  return Object.assign({}, payload, { _id: exists.data.length > 0 ? exists.data[0]._id : '' });
}

// 补生成已结束周总结
async function ensureEndedWeekSummaries(openid, cycle) {
  const currentWeek = getCurrentWeek(cycle.start_date, cycle.end_date) || cycle.total_weeks;
  for (let w = 1; w < currentWeek; w++) {
    await ensureWeekSummary(openid, cycle, w);
  }
}

// 周期到期 → 生成周期总结并标记完成
async function completeCycleIfOver(openid, cycle) {
  if (!isCycleOver(cycle.end_date)) return cycle;
  await ensureEndedWeekSummaries(openid, cycle);

  const weekRes = await database
    .collection('training_cycle_weeks')
    .where({ _openid: openid, cycle_id: cycle._id })
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

  let weightChange = null;
  try {
    const wRes = await database
      .collection('weight_records')
      .where({ _openid: openid })
      .orderBy('date', 'asc')
      .limit(100)
      .get();
    const inRange = wRes.data.filter((r) => r.date >= cycle.start_date && r.date <= cycle.end_date);
    if (inRange.length >= 2) weightChange = Math.round((inRange[inRange.length - 1].weight_kg - inRange[0].weight_kg) * 10) / 10;
    else if (inRange.length === 1) weightChange = 0;
  } catch (err) {
    // 忽略
  }

  let performanceChange = null;
  if (summaries.length >= 2) {
    const first = summaries[0].summary.total_volume || 0;
    const last = summaries[summaries.length - 1].summary.total_volume || 0;
    if (first > 0) performanceChange = Math.round((last / first - 1) * 100);
  }

  const summary = {
    completion_rate: completionRate,
    total_training_days: trainingDays,
    total_volume: totalVolume,
    pr_total: prTotal,
    weight_change_kg: weightChange,
    performance_change_pct: performanceChange
  };
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

  await database
    .collection('training_cycles')
    .doc(cycle._id)
    .update({ data: { status: 'completed', final_summary: { summary, ai_summary: aiSummary }, updated_at: cloud.database().serverDate() } });
  cycle.status = 'completed';
  cycle.final_summary = { summary, ai_summary: aiSummary };
  return cycle;
}

// AI 工具主入口：返回活跃周期 + 当前周 + 周总结 + 周期总结
async function getTrainingCycleData(openid) {
  const res = await database
    .collection('training_cycles')
    .where({ _openid: openid, status: 'active' })
    .orderBy('start_date', 'desc')
    .limit(1)
    .get();
  if (res.data.length === 0) {
    return { has_cycle: false };
  }
  let cycle = res.data[0];
  cycle = await completeCycleIfOver(openid, cycle);
  if (cycle.status !== 'active') {
    return {
      has_cycle: false,
      last_cycle: {
        name: cycle.name || '',
        status: cycle.status,
        final_summary: cycle.final_summary || null
      }
    };
  }
  await ensureEndedWeekSummaries(openid, cycle);

  const weekRes = await database
    .collection('training_cycle_weeks')
    .where({ _openid: openid, cycle_id: cycle._id })
    .orderBy('week_no', 'asc')
    .limit(20)
    .get();

  return {
    has_cycle: true,
    cycle: {
      _id: cycle._id,
      name: cycle.name || '',
      goal: cycle.goal || '',
      start_date: cycle.start_date,
      end_date: cycle.end_date,
      total_weeks: cycle.total_weeks || 0,
      weekly_frequency: cycle.weekly_frequency || 0,
      status: cycle.status
    },
    current_week: getCurrentWeek(cycle.start_date, cycle.end_date),
    current_week_deload: !!((cycle.weeks || []).find((w) => w.week_no === getCurrentWeek(cycle.start_date, cycle.end_date)) || {}).deload,
    week_summaries: weekRes.data.map((w) => ({
      week_no: w.week_no,
      start_date: w.start_date,
      end_date: w.end_date,
      summary: w.summary,
      ai_summary: w.ai_summary
    })),
    final_summary: cycle.final_summary || null
  };
}

module.exports = {
  getTrainingCycleData,
  getWeekRange,
  getCurrentWeek,
  formatDate
};
