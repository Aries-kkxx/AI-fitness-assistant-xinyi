// pages/profile/profile.js - 我的页
// 功能：展示用户摘要 + 功能入口（AI健身教练 / 我的资料 / 饮水设置）
const userService = require('../../services/user');

Page({
  data: {
    user: null // 用户资料摘要
  },

  onShow() {
    this.loadUser();
  },

  async loadUser() {
    try {
      const user = await userService.getUser();
      this.setData({ user });
    } catch (err) {
      console.error('[profile] 加载用户失败', err);
    }
  },

  // 功能入口
  onGoAI() {
    wx.navigateTo({ url: '/pages/ai/ai' });
  },
  onGoUserInfo() {
    wx.navigateTo({ url: '/pages/user-info/user-info' });
  },
  onGoWaterSetting() {
    wx.navigateTo({ url: '/pages/water-setting/water-setting' });
  }
});
