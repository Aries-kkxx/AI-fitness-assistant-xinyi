// pages/weight/weight.js - 体重记录页
// 功能：记录体重（同一天自动更新）、查看 30 天体重曲线（Canvas 2D）、历史记录管理
const weightService = require('../../services/weight');
const { drawWeightChart } = require('../../utils/chart');

Page({
  data: {
    stats: null, // { hasData, current, delta, records }
    inputWeight: '', // 输入框
    saving: false,
    chartReady: false // canvas 节点是否已渲染
  },

  onShow() {
    this.load();
  },

  // 加载统计数据
  async load() {
    try {
      const stats = await weightService.getWeightStats(30);
      // 变化量展示字段预计算（WXML 表达式不支持函数调用/复杂运算）
      let display = stats;
      if (stats && stats.hasData && stats.delta !== null) {
        display = Object.assign({}, stats, {
          deltaText: stats.delta <= 0 ? '↓ ' + -stats.delta + ' kg' : '↑ ' + stats.delta + ' kg'
        });
      }
      this.setData({ stats: display, chartReady: true });
      // 等渲染完成后绘制曲线
      wx.nextTick(() => this.drawChart());
    } catch (err) {
      console.error('[weight] 加载失败', err);
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  // 绘制曲线
  drawChart() {
    const { stats } = this.data;
    if (!stats || !stats.hasData) return;
    this.createSelectorQuery()
      .select('#weight-chart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0] && res[0].node) {
          drawWeightChart(res[0].node, res[0].width, res[0].height, stats.records);
        }
      });
  },

  onInput(e) {
    this.setData({ inputWeight: e.detail.value });
  },

  // 记录体重
  async onSave() {
    const w = Number(this.data.inputWeight);
    if (!w || w < 20 || w > 300) {
      wx.showToast({ title: '请输入 20-300 之间的体重', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await weightService.addWeightRecord(w);
      wx.showToast({ title: '已记录', icon: 'success' });
      this.setData({ inputWeight: '', saving: false });
      this.load();
    } catch (err) {
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败，请重新操作', icon: 'none' });
    }
  },

  // 删除记录
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条体重记录吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await weightService.deleteWeightRecord(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load();
        } catch (err) {
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' });
        }
      }
    });
  }
});
