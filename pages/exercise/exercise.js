// pages/exercise/exercise.js - 动作库页
// 功能：从 exercises 数据库集合加载动作列表，支持按分类筛选
const exerciseService = require('../../services/exercise');

Page({
  data: {
    categories: ['全部', '胸部', '背部', '肩部', '手臂', '腿部', '臀部', '核心', '有氧', '拉伸'],
    activeIndex: 0,
    exercises: [], // 当前分类的动作列表
    loading: true
  },

  async onLoad() {
    // 兜底初始化动作库（幂等：已有数据则跳过）
    await exerciseService.initExercisesIfEmpty();
    this.loadList();
  },

  // 切换分类
  onTabChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ activeIndex: index });
    this.loadList();
  },

  // 从数据库加载动作列表
  async loadList() {
    this.setData({ loading: true });
    try {
      const category = this.data.activeIndex === 0 ? '' : this.data.categories[this.data.activeIndex];
      const list = await exerciseService.getByCategory(category);
      // 组装展示字段
      const exercises = list.map((e) => ({
        _id: e._id,
        name: e.name,
        category: e.category,
        difficulty: e.difficulty,
        equipment: e.equipment,
        targetMuscle: (e.target_muscle || []).join(' / '),
        sets: e.recommended_sets,
        reps: e.recommended_reps,
        repsUnit: e.reps_unit || '次',
        restSeconds: e.rest_seconds
      }));
      this.setData({ exercises, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '动作库加载失败，请稍后重试', icon: 'none' });
    }
  }
});
