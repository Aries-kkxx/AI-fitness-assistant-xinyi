// pages/water-history/water-history.js - 饮水历史记录页
// 功能：按日期倒序展示每日饮水汇总（总量/目标/杯数/完成率/状态），分页加载
const waterService = require('../../services/water');

// 每页显示的日期条数
const PAGE_SIZE = 20;

Page({
  data: {
    loading: true,
    list: [], // 当前已展示的日期汇总
    hasMore: false, // 是否还有更多
    empty: false // 是否完全没有记录
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      // 全量汇总（按日期倒序），前端分页展示
      const summary = await waterService.getHistorySummary();
      this.setData({
        summary,
        list: summary.slice(0, PAGE_SIZE),
        hasMore: summary.length > PAGE_SIZE,
        empty: summary.length === 0,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  // 加载更多
  onLoadMore() {
    const { summary, list } = this.data;
    if (!summary) return;
    const next = summary.slice(list.length, list.length + PAGE_SIZE);
    this.setData({
      list: list.concat(next),
      hasMore: list.length + next.length < summary.length
    });
  },

  // 查看某天详情
  onGoDetail(e) {
    const date = e.currentTarget.dataset.date;
    wx.navigateTo({ url: '/pages/water-history-detail/water-history-detail?date=' + date });
  },

  // 空状态：去记录今天的饮水
  onGoWater() {
    wx.switchTab({ url: '/pages/water/water' });
  },

  onBack() {
    wx.navigateBack();
  }
});
