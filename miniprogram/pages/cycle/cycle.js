// pages/cycle/cycle.js - 训练周期页（4~8 周长期训练周期）
// 展示：当前周期进度（第 X 周/共 Y 周）、本周计划（含渐进调整与减量周）、
//       每周 AI 总结、周期总结、历史周期；创建 / 放弃周期入口
// 统计全部由 services/cycle.js 程序计算（AI 文案为本地规则模板）
const userService = require('../../services/user');
const cycleService = require('../../services/cycle');
const planService = require('../../services/plan');

Page({
  data: {
    loading: true,
    hasCycle: false,
    cycle: null,
    currentWeek: 1,
    weekPercent: 0,
    weekPlan: null,
    weekDays: [],
    adjustText: '',
    todayExercises: [],
    summaries: [],
    finalSummary: null,
    cycles: []
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [cycleData, cycles, weekPlan] = await Promise.all([
        cycleService.getCycleWithSummaries(),
        cycleService.getCycles(),
        cycleService.getCurrentWeekPlan()
      ]);

      if (!cycleData || !cycleData.cycle) {
        this.setData({ hasCycle: false, cycles, loading: false });
        return;
      }

      const { cycle, currentWeek, summaries } = cycleData;
      const totalWeeks = cycle.total_weeks || 1;
      const weekPercent = Math.round((currentWeek / totalWeeks) * 100);

      // 本周 7 天摘要
      let weekDays = [];
      let adjustText = '';
      let todayExercises = [];
      if (weekPlan && weekPlan.days) {
        const weekNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        weekDays = weekPlan.days.map((d, i) => ({
          day: d.day,
          weekName: weekNames[i] || '',
          isRest: d.isRest,
          count: d.count || 0,
          isToday: d.day === ((new Date().getDay() + 6) % 7) + 1
        }));
        const adj = weekPlan.adjust || {};
        if (weekPlan.deload) {
          adjustText = '本周是减量周：组数 ' + (adj.sets_delta >= 0 ? '+' : '') + (adj.sets_delta || 0) +
            ' · 重量 ' + (adj.weight_delta_pct >= 0 ? '+' : '') + adj.weight_delta_pct + '%（促进恢复）';
        } else if (adj.sets_delta || adj.weight_delta_pct) {
          adjustText = '本周渐进调整：组数 ' + (adj.sets_delta >= 0 ? '+' : '') + (adj.sets_delta || 0) +
            (adj.weight_delta_pct ? ' · 重量 ' + (adj.weight_delta_pct >= 0 ? '+' : '') + adj.weight_delta_pct + '%' : '');
        }
      }

      // 今日动作（含建议重量）
      try {
        const plan = await cycleService.getTodayCyclePlan(cycle);
        todayExercises = plan && plan.exercises ? plan.exercises : [];
      } catch (err) {
        console.error('[cycle] 今日动作加载失败', err);
      }

      this.setData({
        hasCycle: true,
        cycle,
        currentWeek,
        weekPercent,
        weekPlan,
        weekDays,
        adjustText,
        todayExercises,
        summaries: (summaries || []).map((s) => Object.assign({ expanded: false }, s)),
        finalSummary: cycle.final_summary || null,
        cycles,
        loading: false
      });
    } catch (err) {
      console.error('[cycle] 加载失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 展开/收起周总结
  onToggleSummary(e) {
    const index = Number(e.currentTarget.dataset.index);
    const key = 'summaries[' + index + '].expanded';
    this.setData({ [key]: !this.data.summaries[index].expanded });
  },

  onGoCreate() {
    wx.navigateTo({ url: '/pages/cycle-create/cycle-create' });
  },

  // 放弃周期
  onAbandon() {
    const { cycle } = this.data;
    if (!cycle) return;
    wx.showModal({
      title: '放弃周期',
      content: '确定放弃当前周期「' + (cycle.name || '') + '」？放弃后不再生成总结。',
      confirmText: '放弃',
      confirmColor: '#FF6B6B',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await cycleService.abandonCycle(cycle._id);
          wx.showToast({ title: '已放弃', icon: 'none' });
          this.load();
        } catch (err) {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    });
  },

  onGoWorkout() {
    wx.switchTab({ url: '/pages/workout/workout' });
  },

  onBack() {
    wx.navigateBack();
  }
});
