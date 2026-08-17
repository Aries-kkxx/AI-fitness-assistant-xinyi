// pages/index/index.js - 首页
// 展示：身体数据（含 BMI）、今日训练（规则引擎推荐）、今日饮水
const { formatTime } = require('../../utils/date');
const { calcBMI, getBMICategory } = require('../../utils/bmi');
const waterService = require('../../services/water');
const userService = require('../../services/user');
const recommendService = require('../../services/recommend');

Page({
  data: {
    water: null, // 今日饮水统计
    user: null, // 用户资料（含 BMI 计算）
    workout: null, // 今日训练
    hasUser: false // 是否已填写资料
  },

  // 每次显示页面时刷新（切 Tab 返回也会触发）
  onShow() {
    this.load();
  },

  // 加载首页全部数据
  async load() {
    // 饮水统计（独立加载，失败不影响其他卡片）
    this.refreshWater();

    // 用户资料 + 今日训练
    try {
      const user = await userService.getUser();
      if (!user) {
        this.setData({ user: null, workout: null, hasUser: false });
        return;
      }
      const workout = await recommendService.getTodayWorkout(user);
      const bmi = calcBMI(user.height, user.weight);
      this.setData({
        user: Object.assign({}, user, {
          bmi,
          bmiCategory: bmi ? getBMICategory(bmi) : ''
        }),
        workout,
        hasUser: true
      });
    } catch (err) {
      console.error('[index] 加载用户/训练失败', err);
    }
  },

  // 加载今日饮水统计
  async refreshWater() {
    try {
      const stats = await waterService.getTodayStats();
      this.setData({ water: stats });
    } catch (err) {
      // 首页不打断用户操作，失败时静默并输出日志；饮水页有完整错误提示
      console.error('[index] 加载今日饮水失败', err);
    }
  },

  // 首页快捷「喝一杯」
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
      this.refreshWater();
    } catch (err) {
      wx.showToast({ title: '记录失败，请稍后重试', icon: 'none' });
    }
  },

  // 页面跳转
  onGoWater() {
    wx.switchTab({ url: '/pages/water/water' });
  },
  onGoWorkout() {
    wx.switchTab({ url: '/pages/workout/workout' });
  },
  onGoUserInfo() {
    wx.navigateTo({ url: '/pages/user-info/user-info' });
  }
});
