// pages/water-history-detail/water-history-detail.js - 饮水历史详情页
// 功能：显示某一天的所有饮水记录 + 当天统计（目标/总量/完成率/状态）
//       删除记录后立即重新计算当天统计
const waterService = require('../../services/water');

Page({
  data: {
    date: '', // 查询日期 YYYY-MM-DD
    stats: null, // 当天统计 { total, cups, target, targetCups, rate, status, records }
    loading: true
  },

  onLoad(options) {
    const date = options.date || '';
    this.setData({ date });
    if (!date) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.load();
  },

  // 加载当天统计与明细
  async load() {
    this.setData({ loading: true });
    try {
      const stats = await waterService.getDateStats(this.data.date);
      this.setData({ stats, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  // 删除一条记录，删除后重新计算当天统计（实时更新）
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条饮水记录吗？删除后当天统计会重新计算。',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await waterService.deleteRecord(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load(); // 重新统计：总量/杯数/完成率实时更新
        } catch (err) {
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' });
        }
      }
    });
  },

  // 回饮水主页
  onGoWater() {
    wx.switchTab({ url: '/pages/water/water' });
  }
});
