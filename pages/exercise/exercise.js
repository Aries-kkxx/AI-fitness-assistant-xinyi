// pages/exercise/exercise.js - 动作库页
// 功能：
//   1. 「推荐」栏：根据用户资料（器械/经验/目标）从动作库过滤出的推荐动作
//   2. 「全部」栏：显示动作数据库中的全部动作
//   3. 分类栏：按 9 大分类筛选
const exerciseService = require('../../services/exercise');

Page({
  data: {
    categories: ['推荐', '全部', '胸部', '背部', '肩部', '手臂', '腿部', '臀部', '核心', '有氧', '拉伸'],
    activeIndex: 0,
    exercises: [], // 当前栏的动作列表
    loading: true,
    // 推荐栏相关
    isRecommend: true,
    noUser: false, // 未填写资料
    recUser: null // 用户资料（用于展示推荐依据）
  },

  async onLoad() {
    // 兜底初始化动作库（幂等：已有数据则跳过）
    await exerciseService.initExercisesIfEmpty();
    this.loadList();
  },

  // 切换分类
  onTabChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === this.data.activeIndex) return;
    this.setData({ activeIndex: index, isRecommend: index === 0 });
    this.loadList();
  },

  // 从数据库加载动作列表
  async loadList() {
    this.setData({ loading: true });
    try {
      let list = [];
      let noUser = false;
      let recUser = null;

      if (this.data.activeIndex === 0) {
        // 推荐栏：按用户资料过滤
        const rec = await exerciseService.getRecommended();
        if (!rec) {
          noUser = true;
        } else {
          list = rec.list;
          recUser = rec.user;
        }
      } else {
        // 全部 / 分类：数据库查询（全部=翻页取全量）
        const category = this.data.activeIndex === 1 ? '' : this.data.categories[this.data.activeIndex];
        list = await exerciseService.getByCategory(category);
      }

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
      this.setData({ exercises, noUser, recUser, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '动作库加载失败，请稍后重试', icon: 'none' });
    }
  },

  // 去填写资料（推荐栏引导）
  onGoUserInfo() {
    wx.navigateTo({ url: '/pages/user-info/user-info' });
  },

  // 查看动作历史与表现分析
  onGoHistory(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/exercise-history/exercise-history?id=' + encodeURIComponent(id) + '&name=' + encodeURIComponent(name || '')
    });
  }
});
