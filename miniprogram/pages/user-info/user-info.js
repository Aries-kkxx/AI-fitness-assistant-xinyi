// pages/user-info/user-info.js - 用户信息设置页
// 功能：填写个人资料（性别/年龄/身高/体重/目标/经验/频率/时长/器械），
//       实时计算 BMI，保存到 users 集合，作为训练推荐引擎的输入
const userService = require('../../services/user');
const weightService = require('../../services/weight');
const { calcBMI, getBMICategory } = require('../../utils/bmi');

Page({
  data: {
    nickname: '',
    // 各选择器选项
    genders: ['男', '女'],
    goals: ['减脂', '增肌', '塑形', '提升体能', '保持健康'],
    experiences: ['新手', '初级', '中级', '高级'],
    daysOptions: [2, 3, 4, 5, 6],
    durations: [30, 45, 60, 90],
    equipmentOptions: ['无器械', '哑铃', '杠铃', '健身房', '家庭器械'],
    // 当前选中下标
    genderIndex: 0,
    goalIndex: 0,
    expIndex: 0,
    daysIndex: 1,
    durationIndex: 1,
    equipmentIndex: 0,
    // 数字输入
    age: '',
    height: '',
    weight: '',
    // BMI 预览
    bmi: null,
    bmiCategory: ''
  },

  // 进入页面时回显已有资料
  async onLoad() {
    try {
      const user = await userService.getUser();
      if (!user) return;
      const goals = this.data.goals;
      const experiences = this.data.experiences;
      const daysOptions = this.data.daysOptions;
      const durations = this.data.durations;
      const equipmentOptions = this.data.equipmentOptions;
      this.setData({
        nickname: user.nickname || '',
        genderIndex: this.data.genders.indexOf(user.gender) >= 0 ? this.data.genders.indexOf(user.gender) : 0,
        age: user.age != null ? String(user.age) : '',
        height: user.height != null ? String(user.height) : '',
        weight: user.weight != null ? String(user.weight) : '',
        goalIndex: goals.indexOf(user.goal) >= 0 ? goals.indexOf(user.goal) : 0,
        expIndex: experiences.indexOf(user.experience) >= 0 ? experiences.indexOf(user.experience) : 0,
        daysIndex: daysOptions.indexOf(user.training_days) >= 0 ? daysOptions.indexOf(user.training_days) : 1,
        durationIndex: durations.indexOf(user.training_duration) >= 0 ? durations.indexOf(user.training_duration) : 1,
        equipmentIndex: equipmentOptions.indexOf(user.equipment) >= 0 ? equipmentOptions.indexOf(user.equipment) : 0
      });
      this.calcBMI();
    } catch (err) {
      wx.showToast({ title: '加载资料失败，请稍后重试', icon: 'none' });
    }
  },

  // 输入事件
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },
  onAgeInput(e) {
    this.setData({ age: e.detail.value });
    this.calcBMI();
  },
  onHeightInput(e) {
    this.setData({ height: e.detail.value });
    this.calcBMI();
  },
  onWeightInput(e) {
    this.setData({ weight: e.detail.value });
    this.calcBMI();
  },

  // 选择器事件
  onGenderChange(e) {
    this.setData({ genderIndex: Number(e.detail.value) });
  },
  onGoalChange(e) {
    this.setData({ goalIndex: Number(e.detail.value) });
  },
  onExpChange(e) {
    this.setData({ expIndex: Number(e.detail.value) });
  },
  onDaysChange(e) {
    this.setData({ daysIndex: Number(e.detail.value) });
  },
  onDurationChange(e) {
    this.setData({ durationIndex: Number(e.detail.value) });
  },
  onEquipmentChange(e) {
    this.setData({ equipmentIndex: Number(e.detail.value) });
  },

  // 实时计算 BMI（身高体重都填写时）
  calcBMI() {
    const { height, weight } = this.data;
    const bmi = calcBMI(height, weight);
    this.setData({
      bmi,
      bmiCategory: bmi ? getBMICategory(bmi) : ''
    });
  },

  // 保存资料
  async onSave() {
    const d = this.data;
    const age = Number(d.age);
    const height = Number(d.height);
    const weight = Number(d.weight);

    // 输入校验
    if (!d.nickname || !d.nickname.trim()) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }
    if (!age || age < 10 || age > 100) {
      wx.showToast({ title: '年龄需在 10-100 之间', icon: 'none' });
      return;
    }
    if (!height || height < 100 || height > 250) {
      wx.showToast({ title: '身高需在 100-250cm 之间', icon: 'none' });
      return;
    }
    if (!weight || weight < 20 || weight > 300) {
      wx.showToast({ title: '体重需在 20-300kg 之间', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    try {
      await userService.saveUser({
        nickname: d.nickname.trim(),
        gender: d.genders[d.genderIndex],
        age,
        height,
        weight,
        goal: d.goals[d.goalIndex],
        experience: d.experiences[d.expIndex],
        training_days: d.daysOptions[d.daysIndex],
        training_duration: d.durations[d.durationIndex],
        equipment: d.equipmentOptions[d.equipmentIndex]
      });
      // 同步记录今天的体重（同一天重复保存会更新当天记录），失败不阻塞主流程
      try {
        await weightService.addWeightRecord(weight);
      } catch (wErr) {
        console.error('[user-info] 同步体重记录失败', wErr);
      }
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重新操作', icon: 'none' });
    }
  }
});
