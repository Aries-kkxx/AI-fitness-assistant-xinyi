// pages/index/index.js - 首页
// 展示：身体数据（含 BMI）、今日训练（规则引擎推荐）、今日饮水、体重趋势、本周概览
const { formatTime, formatDate, getMondayDate } = require('../../utils/date');
const { calcBMI, getBMICategory } = require('../../utils/bmi');
const { drawWeightChart } = require('../../utils/chart');
const waterService = require('../../services/water');
const userService = require('../../services/user');
const recommendService = require('../../services/recommend');
const weightService = require('../../services/weight');
const workoutService = require('../../services/workout');
const adviceService = require('../../services/advice');

Page({
  data: {
    water: null, // 今日饮水统计
    user: null, // 用户资料（含 BMI 计算）
    workout: null, // 今日训练
    hasUser: false, // 是否已填写资料
    weightStats: null, // 体重统计（当前体重 / 30天变化 / 曲线数据）
    weekOverview: null, // 本周概览（训练次数 / 饮水达标天数）—— 纯展示字段
    advice: null // 欣一今日建议（身体状态 + 训练/恢复/饮水建议 + 总结）
  },

  // 每次显示页面时刷新（切 Tab 返回也会触发）
  onShow() {
    this.load();
  },

  // 加载首页全部数据
  async load() {
    // 今日建议（独立加载，失败不影响其他卡片）
    this.refreshAdvice();

    // 饮水统计（独立加载，失败不影响其他卡片）
    this.refreshWater();

    // 本周概览（独立加载，失败不影响其他卡片）
    this.loadWeekOverview();

    // 用户资料 + 今日训练 + 体重统计
    try {
      const [user, weightStats] = await Promise.all([
        userService.getUser(),
        weightService.getWeightStats(30)
      ]);
      if (!user) {
        this.setData({ user: null, workout: null, hasUser: false, weightStats });
        return;
      }
      const workout = await recommendService.getTodayWorkout(user);
      const bmi = calcBMI(user.height, user.weight);
      // 体重变化展示字段预计算（WXML 表达式不支持函数调用/复杂运算）
      let weightStatsDisplay = weightStats;
      if (weightStats && weightStats.hasData && weightStats.delta !== null) {
        weightStatsDisplay = Object.assign({}, weightStats, {
          deltaText: weightStats.delta <= 0
            ? '↓ ' + -weightStats.delta + ' kg'
            : '↑ ' + weightStats.delta + ' kg'
        });
      }
      this.setData({
        user: Object.assign({}, user, {
          bmi,
          bmiCategory: bmi ? getBMICategory(bmi) : ''
        }),
        workout,
        weightStats: weightStatsDisplay,
        hasUser: true
      });
      // 等渲染完成后绘制体重迷你曲线
      wx.nextTick(() => this.drawWeightChart());
    } catch (err) {
      console.error('[index] 加载用户/训练/体重失败', err);
    }
  },

  // 加载本周概览（只读展示：本周训练次数 + 本周饮水达标天数）
  async loadWeekOverview() {
    try {
      const [summary, history] = await Promise.all([
        workoutService.getWorkoutSummary(),
        waterService.getHistorySummary()
      ]);
      const monday = getMondayDate(new Date());
      const today = formatDate(new Date());
      // 饮水达标：本周内 rate >= 100 的天数（与饮水历史页"已完成"口径一致）
      let waterDoneDays = 0;
      (history || []).forEach((d) => {
        if (d.date >= monday && d.date <= today && d.rate >= 100) waterDoneDays++;
      });
      this.setData({
        weekOverview: {
          workoutDays: summary ? summary.week : 0,
          waterDoneDays
        }
      });
    } catch (err) {
      // 纯展示模块：失败时静默隐藏该卡片，不影响首页其他功能
      console.error('[index] 加载本周概览失败', err);
    }
  },

  // 绘制首页体重迷你曲线
  drawWeightChart() {
    const { weightStats } = this.data;
    if (!weightStats || !weightStats.hasData) return;
    this.createSelectorQuery()
      .select('#home-weight-chart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0] && res[0].node) {
          drawWeightChart(res[0].node, res[0].width, res[0].height, weightStats.records);
        }
      });
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

  // 加载「欣一今日建议」（本地规则生成，不依赖 AI）
  async refreshAdvice() {
    try {
      const advice = await adviceService.getTodayAdvice();
      // 预计算身体状态评分展示项（WXML 不支持函数调用）
      if (advice && advice.hasRecovery && advice.recovery) {
        const r = advice.recovery;
        advice.recoveryItems = [
          { label: '睡眠', value: r.sleep_quality || '-' },
          { label: '疲劳', value: r.fatigue || '-' },
          { label: '酸痛', value: r.soreness || '-' },
          { label: '意愿', value: r.motivation || '-' }
        ];
      }
      this.setData({ advice });
    } catch (err) {
      // 纯展示模块：失败时静默隐藏
      console.error('[index] 加载今日建议失败', err);
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
  onGoWaterAdd() {
    wx.navigateTo({ url: '/pages/water-add/water-add' });
  },
  onGoWorkout() {
    wx.switchTab({ url: '/pages/workout/workout' });
  },
  onGoUserInfo() {
    wx.navigateTo({ url: '/pages/user-info/user-info' });
  },
  onGoRecovery() {
    wx.navigateTo({ url: '/pages/recovery/recovery' });
  },
  onGoWeight() {
    wx.navigateTo({ url: '/pages/weight/weight' });
  }
});
