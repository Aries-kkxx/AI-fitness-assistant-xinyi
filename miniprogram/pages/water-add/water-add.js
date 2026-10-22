// pages/water-add/water-add.js - 手动添加饮水记录页
// 功能：手动输入饮水时间、饮水量、饮水类型、备注，保存为一条 water_records
const { formatTime } = require('../../utils/date');
const waterService = require('../../services/water');

Page({
  data: {
    drinkTime: '08:00', // 饮水时间（picker 时间选择器）
    amountMl: '', // 饮水量
    drinkTypes: waterService.DRINK_TYPES, // 类型选项
    drinkTypeIndex: 0, // 当前选中的类型下标
    remark: '' // 备注
  },

  // 进入页面：默认时间为当前时刻，默认水量为设置的每杯容量
  async onLoad() {
    const now = new Date();
    try {
      const settings = await waterService.getSettings();
      this.setData({
        drinkTime: formatTime(now),
        amountMl: String(settings.cup_ml)
      });
    } catch (err) {
      // 读取设置失败时仍允许手动填写，时间默认当前时刻
      this.setData({ drinkTime: formatTime(now) });
    }
  },

  onTimeChange(e) {
    this.setData({ drinkTime: e.detail.value });
  },

  onAmountInput(e) {
    this.setData({ amountMl: e.detail.value });
  },

  onTypeChange(e) {
    this.setData({ drinkTypeIndex: Number(e.detail.value) });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 保存记录
  async onSave() {
    const { drinkTime, amountMl, drinkTypeIndex, remark } = this.data;
    const amount = Number(amountMl);
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入正确的饮水量', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    try {
      await waterService.addRecord({
        drink_time: drinkTime,
        amount_ml: amount,
        drink_type: this.data.drinkTypes[drinkTypeIndex],
        remark: remark.trim()
      });
      wx.hideLoading();
      wx.showToast({ title: '添加成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重新操作', icon: 'none' });
    }
  }
});
