// pages/water/water.js - 饮水主页
// 功能：今日饮水统计（总量/杯数/目标/完成率/剩余）+ 喝一杯 + 记录列表 + 删除 + 入口
const { formatTime } = require('../../utils/date');
const waterService = require('../../services/water');

Page({
  data: {
    stats: null, // 今日饮水统计
    records: [], // 今日饮水记录列表
    loading: false
  },

  // 每次显示页面时刷新（从设置页/添加页返回、切换 Tab 都会触发）
  onShow() {
    this.refresh();
  },

  // 刷新统计数据与记录列表
  async refresh() {
    this.setData({ loading: true });
    try {
      const [stats, records] = await Promise.all([
        waterService.getTodayStats(),
        waterService.getTodayRecords()
      ]);
      this.setData({ stats, records });
    } catch (err) {
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 喝一杯：以设置的每杯容量新增一条记录
  async onDrinkOne() {
    try {
      const settings = await waterService.getSettings();
      await waterService.addRecord({
        drink_time: formatTime(new Date()),
        amount_ml: settings.cup_ml,
        drink_type: '白水',
        remark: ''
      });
      wx.showToast({ title: '已记录一杯', icon: 'success' });
      this.refresh();
    } catch (err) {
      wx.showToast({ title: '记录失败，请稍后重试', icon: 'none' });
    }
  },

  // 跳转手动添加记录页
  onAddRecord() {
    wx.navigateTo({ url: '/pages/water-add/water-add' });
  },

  // 跳转饮水设置页
  onGoSetting() {
    wx.navigateTo({ url: '/pages/water-setting/water-setting' });
  },

  // 跳转历史记录页
  onGoHistory() {
    wx.navigateTo({ url: '/pages/water-history/water-history' });
  },

  // 删除一条记录（先确认再删除）
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条饮水记录吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await waterService.deleteRecord(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.refresh();
        } catch (err) {
          wx.showToast({ title: '删除失败，请稍后重试', icon: 'none' });
        }
      }
    });
  }
});
