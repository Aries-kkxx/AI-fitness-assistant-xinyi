// pages/week-plan-edit/week-plan-edit.js - 自定义周训练计划编辑页
// 功能：为周一~周日每天从动作库（exercises 全部动作）勾选训练动作，或设为休息
// 保存到 week_plan 集合，训练页优先使用自定义计划
// 初始状态：已有自定义计划 → 回显为勾选状态；无自定义计划 → 用智能推荐预填
const exerciseService = require('../../services/exercise');
const planService = require('../../services/plan');
const userService = require('../../services/user');
const recommendService = require('../../services/recommend');

const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

Page({
  data: {
    weekLabels: WEEK_LABELS,
    currentDay: 0, // 当前编辑的天（0=周一）
    days: [], // 7 天配置 [{ day, isRest, exercise_ids }]
    selectedIds: [], // 当前天已选动作 id（冗余，便于渲染）
    categories: ['全部', '胸部', '背部', '肩部', '手臂', '腿部', '臀部', '核心', '有氧', '拉伸'],
    activeCat: 0,
    catExercises: [], // 当前分类动作（含 selected 标记）
    saving: false,
    loading: true,
    planSource: '' // 'custom' 已有自定义计划 / 'recommend' 智能推荐预填 / '' 空白
  },

  async onLoad() {
    try {
      const [plan, exercises] = await Promise.all([
        planService.getWeekPlanCustom(),
        exerciseService.getByCategory('') // 全部动作（翻页取全）
      ]);
      const built = await this.buildInitialDays(plan);
      this.setData({
        days: built.days,
        allExercises: exercises,
        planSource: built.source,
        loading: false
      });
      this.applyDay();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  // 构建初始 7 天计划：
  // 1. 已有自定义计划 → 原样回显（勾选状态）
  // 2. 无自定义计划 → 用智能推荐（规则引擎按用户资料生成 7 天）预填
  // 3. 无用户资料 → 空白计划
  async buildInitialDays(plan) {
    const days = [];
    if (plan && plan.days && plan.days.length === 7) {
      for (let i = 0; i < 7; i++) {
        const exist = plan.days[i];
        days.push({
          day: i + 1,
          isRest: !!exist.isRest,
          exercise_ids: exist.exercise_ids || []
        });
      }
      return { days, source: 'custom' };
    }

    // 无自定义计划：尝试智能推荐预填
    try {
      const user = await userService.getUser();
      if (user) {
        for (let i = 0; i < 7; i++) {
          const day = await recommendService.getDayWorkout(user, i);
          days.push({
            day: i + 1,
            isRest: day.exercises.length === 0,
            exercise_ids: day.exercises.map((e) => e._id)
          });
        }
        return { days, source: 'recommend' };
      }
    } catch (err) {
      console.error('[week-plan-edit] 智能推荐预填失败', err);
    }

    // 兜底：空白计划
    for (let i = 0; i < 7; i++) {
      days.push({ day: i + 1, isRest: false, exercise_ids: [] });
    }
    return { days, source: '' };
  },

  // 切换编辑的天
  onDayTap(e) {
    const day = Number(e.currentTarget.dataset.day);
    if (day === this.data.currentDay) return;
    this.setData({ currentDay: day }, () => this.applyDay());
  },

  // 同步当前天的选中状态并刷新分类列表
  applyDay() {
    const { days, currentDay } = this.data;
    const selectedIds = days[currentDay] ? days[currentDay].exercise_ids.slice() : [];
    this.setData({ selectedIds }, () => this.refreshCat());
  },

  // 休息开关
  onRestChange(e) {
    const { days, currentDay } = this.data;
    days[currentDay].isRest = e.detail.value;
    this.setData({ days: days.slice() });
  },

  // 切换分类
  onCatChange(e) {
    this.setData({ activeCat: Number(e.currentTarget.dataset.index) }, () => this.refreshCat());
  },

  // 渲染当前分类的动作列表（附 selected 标记，供 WXML 判断勾选态）
  refreshCat() {
    const { allExercises, activeCat, categories, selectedIds } = this.data;
    if (!allExercises) return;
    const category = activeCat === 0 ? '' : categories[activeCat];
    const list = category ? allExercises.filter((e) => e.category === category) : allExercises;
    const catExercises = list.map((e) =>
      Object.assign({}, e, { selected: selectedIds.indexOf(e._id) >= 0 })
    );
    this.setData({ catExercises });
  },

  // 勾选/取消勾选动作（id 为 __clear__ 时清空当天选择）
  onToggleExercise(e) {
    const id = e.currentTarget.dataset.id;
    const { days, currentDay, selectedIds } = this.data;
    if (id === '__clear__') {
      days[currentDay].exercise_ids = [];
      this.setData({ days: days.slice(), selectedIds: [] }, () => this.refreshCat());
      return;
    }
    const idx = selectedIds.indexOf(id);
    if (idx >= 0) {
      selectedIds.splice(idx, 1);
    } else {
      selectedIds.push(id);
    }
    days[currentDay].exercise_ids = selectedIds.slice();
    this.setData({ days: days.slice(), selectedIds: selectedIds.slice() }, () =>
      this.refreshCat()
    );
  },

  // 清空所有：清空周一~周日全部动作（保留休息设置）
  onClearAll() {
    wx.showModal({
      title: '清空所有',
      content: '确定清空周一到周日的所有动作吗？清空后保存将恢复智能推荐。',
      success: (res) => {
        if (!res.confirm) return;
        const { days, currentDay } = this.data;
        days.forEach((d) => {
          d.exercise_ids = [];
        });
        this.setData({ days: days.slice() }, () => this.applyDay());
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  // 保存计划（允许为空：空计划保存后训练页恢复智能推荐）
  async onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await planService.saveWeekPlanCustom(this.data.days);
      wx.showToast({ title: '计划已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      this.setData({ saving: false });
      const msg =
        err && err.message === 'COLLECTION_NOT_EXIST'
          ? '保存失败：请先在云开发控制台创建 week_plan 集合'
          : '保存失败，请重新操作';
      wx.showToast({ title: msg, icon: 'none' });
    }
  }
});
