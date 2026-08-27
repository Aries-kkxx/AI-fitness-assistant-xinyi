// pages/cycle-create/cycle-create.js - 创建训练周期（4~8 周）
// 选择目标 / 周数 / 名称 → 创建周期（模板基于自定义周计划或规则引擎生成）
const userService = require('../../services/user');
const cycleService = require('../../services/cycle');

Page({
  data: {
    goals: ['增肌', '减脂', '塑形', '提升体能', '保持健康'],
    goal: '增肌',
    weekOptions: [4, 6, 8],
    totalWeeks: 8,
    name: '',
    creating: false
  },

  onGoalTap(e) {
    this.setData({ goal: e.currentTarget.dataset.goal });
  },

  onWeekTap(e) {
    this.setData({ totalWeeks: Number(e.currentTarget.dataset.weeks) });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  async onCreate() {
    if (this.data.creating) return;
    wx.showLoading({ title: '创建中...' });
    try {
      const user = await userService.getUser();
      if (!user) {
        wx.hideLoading();
        wx.showToast({ title: '请先填写个人资料', icon: 'none' });
        return;
      }
      const name = (this.data.name || '').trim() || this.data.goal + '周期';
      const cycle = await cycleService.createCycle({
        user,
        goal: this.data.goal,
        totalWeeks: this.data.totalWeeks,
        name,
        weeklyFrequency: user.training_days || 3
      });
      wx.hideLoading();
      wx.showToast({ title: '周期已创建 🎉', icon: 'none' });
      // 返回周期页查看
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/cycle/cycle' });
      }, 600);
    } catch (err) {
      wx.hideLoading();
      console.error('[cycle-create] 创建失败', err);
      wx.showToast({ title: '创建失败，请检查网络', icon: 'none' });
    }
  },

  onBack() {
    wx.navigateBack();
  }
});
