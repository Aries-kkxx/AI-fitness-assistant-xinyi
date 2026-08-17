// pages/workout/workout.js - 训练页
// 功能：根据用户资料（规则引擎）生成并展示今日训练 + 本周训练计划
// 无用户资料时引导前往填写
const userService = require('../../services/user');
const recommendService = require('../../services/recommend');

Page({
  data: {
    hasUser: false, // 是否已填写用户资料
    loading: true,
    workout: null, // 今日训练
    weekPlan: [], // 本周计划 [{ weekday, partsText, isRest }]
    todayIndex: 0 // 今天在一周中的下标（0=周一）
  },

  // 每次显示页面时重新生成（资料变化后自动生效）
  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const user = await userService.getUser();
      if (!user) {
        this.setData({ hasUser: false, loading: false });
        return;
      }

      // 并行生成今日训练 + 本周计划
      const [workout, weekPlan] = await Promise.all([
        recommendService.getTodayWorkout(user),
        recommendService.getWeekPlan(user)
      ]);

      const todayIndex = (new Date().getDay() + 6) % 7;
      // 组装本周计划展示数据
      const plan = weekPlan.map((day, i) => ({
        weekday: recommendService.WEEK_DAYS[i],
        partsText: day ? day.partsText : '休息',
        isRest: !day,
        isToday: i === todayIndex
      }));

      this.setData({
        hasUser: true,
        workout,
        weekPlan: plan,
        todayIndex,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  // 去填写用户资料
  onGoUserInfo() {
    wx.navigateTo({ url: '/pages/user-info/user-info' });
  },

  // 去动作库查看动作教学
  onGoExercises() {
    wx.switchTab({ url: '/pages/exercise/exercise' });
  }
});
