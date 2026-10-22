// pages/stats/stats.js - 个人健身成长档案
// 汇总：训练（周/月/累计/完成率/容量/平均时长/PR）、体重（当前/30天/90天）、
//       身体（BMI/体脂率/围度）、饮水（本月/日均/达标/连续达标）、恢复（疲劳/睡眠/酸痛）、
//       6 类趋势图、成就、AI 数据分析、数据管理入口
// 统计全部由 services/archive.js（utils/archive-math.js 纯函数）程序计算
const archiveService = require('../../services/archive');
const { drawTrendChart } = require('../../utils/chart');

const TREND_TABS = [
  { key: 'weight', label: '体重', unit: 'kg' },
  { key: 'volume', label: '训练容量', unit: 'kg', integer: true },
  { key: 'trainingDays', label: '训练次数', unit: '次', integer: true },
  { key: 'pr', label: '新 PR', unit: '个', integer: true },
  { key: 'water', label: '饮水', unit: 'ml', integer: true },
  { key: 'waist', label: '腰围', unit: 'cm' }
];

Page({
  data: {
    loading: true,
    archive: null,
    training: null,
    weight: null,
    body: null,
    water: null,
    recovery: null,
    weightDelta30: '',
    weightDelta90: '',
    trendTabs: TREND_TABS,
    activeTrend: 0,
    trendEmpty: false,
    achievements: null,
    unlockedCount: 0,
    aiResult: '',
    aiLoading: false
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [archive, achievements] = await Promise.all([
        archiveService.getArchiveStats(),
        archiveService.getAchievements()
      ]);
      // 体重变化展示预计算
      let weightDelta30 = '';
      let weightDelta90 = '';
      if (archive.weight && archive.weight.hasData) {
        const fmt = (v) => (v === null ? '—' : (v >= 0 ? '↑ +' + v : '↓ ' + (-v)) + ' kg');
        weightDelta30 = fmt(archive.weight.change30);
        weightDelta90 = fmt(archive.weight.change90);
      }
      const unlockedCount = achievements ? achievements.list.filter((a) => a.unlocked).length : 0;

      this.setData({
        archive,
        training: archive.training,
        weight: archive.weight,
        body: archive.body,
        water: archive.water,
        recovery: archive.recovery,
        weightDelta30,
        weightDelta90,
        achievements,
        unlockedCount,
        loading: false
      }, () => {
        // 新成就提示
        if (achievements && achievements.newly && achievements.newly.length > 0) {
          wx.showToast({ title: '🏆 解锁成就：' + achievements.newly[0], icon: 'none', duration: 2500 });
        }
        wx.nextTick(() => this.drawChart());
      });
    } catch (err) {
      console.error('[stats] 加载失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // ===== 趋势图 =====

  onTrendTap(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === this.data.activeTrend) return;
    this.setData({ activeTrend: index }, () => this.drawChart());
  },

  drawChart() {
    const { archive, activeTrend } = this.data;
    if (!archive || !archive.trends) return;
    const tab = TREND_TABS[activeTrend];
    const points = (archive.trends[tab.key] || []).map((p) => ({ date: p.date, value: p.value }));
    this.setData({ trendEmpty: points.length === 0 || !points.some((p) => p.value > 0) });
    this.createSelectorQuery()
      .select('#archive-chart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0] && res[0].node) {
          drawTrendChart(res[0].node, res[0].width, res[0].height, points, {
            lineColor: '#FFB54D',
            pointColor: '#FF9F1C',
            unit: tab.unit || '',
            integer: !!tab.integer,
            emptyText: '近 30 天暂无数据'
          });
        }
      });
  },

  // ===== AI 数据分析 =====

  async onAiAnalyze() {
    if (this.data.aiLoading) return;
    this.setData({ aiLoading: true, aiResult: '' });
    wx.showLoading({ title: 'AI 分析中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiCoach',
        data: { userText: '请基于我的真实数据，分析我最近的训练表现、体重、恢复和饮水情况，指出进步与问题，并给出一周训练建议。' },
        timeout: 60000
      });
      wx.hideLoading();
      const reply = (res.result && res.result.reply) || 'AI 暂时无法分析，请稍后再试。';
      this.setData({ aiResult: reply, aiLoading: false });
    } catch (err) {
      wx.hideLoading();
      this.setData({ aiLoading: false });
      wx.showToast({ title: 'AI 分析失败，请稍后再试', icon: 'none' });
    }
  },

  // ===== 跳转 =====

  onGoWorkout() {
    wx.switchTab({ url: '/pages/workout/workout' });
  },
  onGoWater() {
    wx.switchTab({ url: '/pages/water/water' });
  },
  onGoWeight() {
    wx.navigateTo({ url: '/pages/weight/weight' });
  },
  onGoBodyMeasure() {
    wx.navigateTo({ url: '/pages/body-measure/body-measure' });
  },
  onGoDataManage() {
    wx.navigateTo({ url: '/pages/data-manage/data-manage' });
  },
  onGoCycle() {
    wx.navigateTo({ url: '/pages/cycle/cycle' });
  },
  onBack() {
    wx.navigateBack();
  }
});
