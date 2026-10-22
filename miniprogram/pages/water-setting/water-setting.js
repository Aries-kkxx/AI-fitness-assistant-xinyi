// pages/water-setting/water-setting.js - 饮水设置页
// 功能：设置每天喝几杯、每杯多少 ml，自动计算每日目标水量
const waterService = require('../../services/water');

Page({
  data: {
    dailyCups: 8, // 每天杯数
    cupMl: 250, // 每杯容量 ml
    dailyTargetMl: 2000 // 自动计算的每日目标水量
  },

  // 进入页面时读取当前设置
  async onLoad() {
    try {
      const settings = await waterService.getSettings();
      this.setData({
        dailyCups: settings.daily_cups,
        cupMl: settings.cup_ml,
        dailyTargetMl: settings.daily_target_ml
      });
    } catch (err) {
      wx.showToast({ title: '加载设置失败，请稍后重试', icon: 'none' });
    }
  },

  // 根据杯数与容量实时计算目标水量
  calcTarget() {
    const { dailyCups, cupMl } = this.data;
    this.setData({ dailyTargetMl: dailyCups * cupMl });
  },

  // 杯数步进（范围 1-30）
  onCupsMinus() {
    this.setData({ dailyCups: Math.max(1, this.data.dailyCups - 1) });
    this.calcTarget();
  },
  onCupsPlus() {
    this.setData({ dailyCups: Math.min(30, this.data.dailyCups + 1) });
    this.calcTarget();
  },

  // 容量步进（范围 50-1000，步长 50）
  onMlMinus() {
    this.setData({ cupMl: Math.max(50, this.data.cupMl - 50) });
    this.calcTarget();
  },
  onMlPlus() {
    this.setData({ cupMl: Math.min(1000, this.data.cupMl + 50) });
    this.calcTarget();
  },

  // 保存设置
  async onSave() {
    const { dailyCups, cupMl } = this.data;
    try {
      await waterService.saveSettings({ daily_cups: dailyCups, cup_ml: cupMl });
      wx.showToast({ title: '保存成功', icon: 'success' });
      // 稍等片刻返回上一页，让用户看到成功提示
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.showToast({ title: '保存失败，请重新操作', icon: 'none' });
    }
  }
});
