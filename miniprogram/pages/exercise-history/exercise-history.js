// pages/exercise-history/exercise-history.js - 动作历史与表现分析页
// 展示：个人 PR（重量/次数/容量）、最近 vs 上次、渐进超负荷建议、
//       重量/次数/容量趋势图、最近训练列表
// 数据：全部来自 services/workout.js 的分析接口（计算在 services/utils 层完成）
const workoutService = require('../../services/workout');
const { drawTrendChart } = require('../../utils/chart');

Page({
  data: {
    loading: true,
    exerciseId: '',
    exerciseName: '',
    analysis: null, // getExerciseAnalysis 结果
    hasData: false,
    prItems: [], // [{ label, value, sub, key }]
    compare: [], // [{ label, lastText, prevText, up, same }]
    recentText: '',
    suggestion: null,
    chartData: { weight: [], reps: [], volume: [] },
    recentList: [] // [{ date, sets, maxWeight, maxReps, volume, maxRpe }]
  },

  onLoad(options) {
    const exerciseId = options && options.id ? decodeURIComponent(options.id) : '';
    const exerciseName = options && options.name ? decodeURIComponent(options.name) : '';
    this.setData({
      exerciseId,
      exerciseName
    });
    this.load();
  },

  async load() {
    const { exerciseId } = this.data;
    if (!exerciseId) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      const analysis = await workoutService.getExerciseAnalysis(exerciseId, this.data.exerciseName);
      this.setData({ analysis, hasData: analysis.hasData, loading: false }, () => {
        this.prepareDisplay();
        if (analysis.hasData) wx.nextTick(() => this.drawCharts());
      });
    } catch (err) {
      console.error('[exercise-history] 加载失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 预计算展示字段（WXML 不支持函数调用）
  prepareDisplay() {
    const a = this.data.analysis;
    if (!a || !a.hasData) return;

    // PR 展示
    const prItems = [];
    const w = a.prs.maxWeightPR;
    const r = a.prs.maxRepsPR;
    const v = a.prs.maxVolumePR;
    if (w) prItems.push({ label: '最大重量', value: w.value + 'kg', sub: (w.reps ? '× ' + w.reps + ' 次 · ' : '') + (w.date || '').slice(5), key: 'weight' });
    if (r) prItems.push({ label: '最大次数', value: r.value + ' 次', sub: (r.weight > 0 ? r.weight + 'kg · ' : '') + (r.date || '').slice(5), key: 'reps' });
    if (v) prItems.push({ label: '最大容量', value: v.value + 'kg', sub: (v.sets ? v.sets + ' 组 · ' : '') + (v.date || '').slice(5), key: 'volume' });

    // 最近一次 vs 上一次
    const compare = [];
    const last = a.last;
    const prev = a.prev;
    if (last) {
      const fmtW = (x) => (x > 0 ? x + 'kg' : '—');
      const fmtN = (x) => (x > 0 ? x + ' 次' : '—');
      const fmtV = (x) => (x > 0 ? x + 'kg' : '—');
      if (last.maxWeight > 0 || (prev && prev.maxWeight > 0)) {
        compare.push({
          label: '最大重量',
          lastText: fmtW(last.maxWeight),
          prevText: prev ? fmtW(prev.maxWeight) : '—',
          up: !!prev && last.maxWeight > prev.maxWeight,
          same: !!prev && last.maxWeight === prev.maxWeight
        });
      }
      if (last.maxReps > 0 || (prev && prev.maxReps > 0)) {
        compare.push({
          label: '最大次数',
          lastText: fmtN(last.maxReps),
          prevText: prev ? fmtN(prev.maxReps) : '—',
          up: !!prev && last.maxReps > prev.maxReps,
          same: !!prev && last.maxReps === prev.maxReps
        });
      }
      if (last.volume > 0 || (prev && prev.volume > 0)) {
        compare.push({
          label: '训练容量',
          lastText: fmtV(last.volume),
          prevText: prev ? fmtV(prev.volume) : '—',
          up: !!prev && last.volume > prev.volume,
          same: !!prev && last.volume === prev.volume
        });
      }
    }

    // 最近 7/30 天摘要
    let recentText = '';
    if (a.recent7 || a.recent30) {
      const r7 = a.recent7 ? a.recent7.days + ' 次' : '0 次';
      const r30 = a.recent30 ? a.recent30.days + ' 次' : '0 次';
      recentText = '近 7 天训练 ' + r7 + ' · 近 30 天训练 ' + r30;
    }

    // 趋势图数据
    const trend = a.trend || [];
    const chartData = {
      weight: trend.filter((p) => p.maxWeight > 0).map((p) => ({ date: p.date, value: p.maxWeight })),
      reps: trend.map((p) => ({ date: p.date, value: p.maxReps })),
      volume: trend.map((p) => ({ date: p.date, value: p.volume }))
    };

    this.setData({
      prItems,
      compare,
      recentText,
      chartData,
      recentList: a.recentList || [],
      suggestion: a.suggestion || null
    });
  },

  // 绘制三张趋势图
  drawCharts() {
    const { chartData } = this.data;
    const charts = [
      { id: '#chart-weight', points: chartData.weight, opts: { lineColor: '#FFB54D', pointColor: '#FFB54D', unit: 'kg' } },
      { id: '#chart-reps', points: chartData.reps, opts: { lineColor: '#4D9EFF', pointColor: '#4D9EFF', unit: '次', integer: true } },
      { id: '#chart-volume', points: chartData.volume, opts: { lineColor: '#66CDAA', pointColor: '#66CDAA', unit: 'kg', integer: true } }
    ];
    charts.forEach((c) => {
      this.createSelectorQuery()
        .select(c.id)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res && res[0] && res[0].node) {
            drawTrendChart(res[0].node, res[0].width, res[0].height, c.points, c.opts);
          }
        });
    });
  },

  onBack() {
    wx.navigateBack();
  },

  onGoWorkout() {
    wx.switchTab({ url: '/pages/workout/workout' });
  }
});
