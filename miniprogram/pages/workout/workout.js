// pages/workout/workout.js - 训练页
// 功能：
//   1. 今日训练：优先使用自定义周计划（week_plan，动作来自动作库），无自定义时回退规则引擎生成
//   2. 动作完成状态：每个动作含「未完成 / 已完成」两个按钮，均可点击（支持取消完成）
//   3. 顶部筛选「未完成 / 已完成」+ 完成进度（3/4 + 完成率%）
//   4. 本周训练计划展示 + 「编辑计划」入口（自定义编辑）
const userService = require('../../services/user');
const recommendService = require('../../services/recommend');
const workoutService = require('../../services/workout');
const planService = require('../../services/plan');

Page({
  data: {
    hasUser: false, // 是否已填写用户资料
    loading: true,
    workout: null, // 今日训练（全量动作）
    showExercises: [], // 按筛选条件过滤后的动作列表
    filter: 'pending', // 筛选：pending 未完成 / done 已完成
    completedMap: {}, // 今日完成状态 { exerciseId: { completedAt, recordId, actualSets, setsText } }
    completedCount: 0, // 已完成动作数
    percent: 0, // 完成率（%）
    weekPlan: [], // 本周计划（[{ weekday, partsText, isRest, isToday }]）
    isCustomPlan: false, // 是否使用自定义计划
    todayIndex: 0, // 今天在一周中的下标（0=周一）
    hasDraft: false, // 今天是否有未完成的训练草稿（自动保存的数据）
    draftCount: 0, // 草稿中已记录组的动作数
    cycleInfo: null // 活跃训练周期信息 { name, currentWeek, totalWeeks, deload }
  },

  // 每次显示页面时重新生成（切 Tab 返回、编辑计划返回后都会刷新）
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

      // 并行：今日训练解析（自定义计划优先）+ 今日完成状态 + 今日草稿
      const [resolved, completedMap] = await Promise.all([
        planService.resolveTodayWorkout(user),
        workoutService.getTodayCompletedMap()
      ]);
      const todayIndex = resolved.todayIndex;
      const workout = resolved.workout;
      const weekPlan = resolved.weekPlan;
      const isCustomPlan = resolved.isCustomPlan;

      // 未完成训练草稿：自动保存兜底，退出页面后回来可继续
      const draft = workoutService.getTodayDraft();
      const hasDraft = !!draft && !!draft.session && draft.session.status !== 'ended';
      const draftCount = draft
        ? (draft.exercises || []).filter((e) => e.sets && e.sets.length > 0).length
        : 0;

      // 训练周期信息（活跃周期时 resolveTodayWorkout 返回）
      const cycleInfo = resolved.isCyclePlan
        ? {
            name: resolved.cycleName || '',
            currentWeek: resolved.cycleCurrentWeek || 1,
            totalWeeks: resolved.cycleTotalWeeks || 0,
            deload: !!resolved.cycleDeload
          }
        : null;

      const summary = await workoutService.getWorkoutSummary();
      const plan = weekPlan.map((day, i) => {
        // 本周第 i 天是否已有训练记录：根据 workout_date 判断
        const dayDate = this.getWeekDate(i);
        const done = summary && summary.dates && summary.dates.indexOf(dayDate) >= 0;
        return {
          weekday: recommendService.WEEK_DAYS[i],
          partsText: day ? day.partsText : '休息',
          isRest: !day,
          isToday: i === todayIndex,
          done: done && !day?.isRest
        };
      });

      this.setData(
        {
          hasUser: true,
          workout,
          weekPlan: plan,
          todayIndex,
          completedMap,
          isCustomPlan,
          hasDraft,
          draftCount,
          cycleInfo,
          loading: false
        },
        () => {
          this.updateProgress(completedMap);
        }
      );
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }
  },

  // 按当前筛选条件过滤动作列表
  applyFilter() {
    const { workout, filter, completedMap } = this.data;
    if (!workout) return;
    const showExercises = workout.exercises.filter((e) => {
      const done = !!completedMap[e._id];
      return filter === 'done' ? done : !done;
    });
    this.setData({ showExercises });
  },

  // 统一更新完成状态并重算进度/筛选
  updateProgress(map) {
    const { workout, completedMap } = this.data;
    const m = map || completedMap; // 未传参时使用当前完成状态表
    const completedCount = (workout.exercises || []).filter((x) => m[x._id]).length;
    const percent = workout.count > 0 ? Math.round((completedCount / workout.count) * 100) : 0;
    this.setData({ completedMap: m, completedCount, percent }, () => this.applyFilter());
  },

  // 切换筛选：未完成 / 已完成
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter;
    if (filter === this.data.filter) return;
    this.setData({ filter }, () => this.applyFilter());
  },

  // 点击「已完成」按钮：标记完成（幂等，重复点击不新增记录）
  async onMarkDone(e) {
    const id = e.currentTarget.dataset.id;
    const { workout, completedMap } = this.data;
    if (completedMap[id]) return; // 已是完成状态
    const ex = (workout.exercises || []).find((x) => x._id === id);
    if (!ex) return;

    try {
      await workoutService.markExerciseCompleted({
        exerciseId: id,
        exerciseName: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        planId: workout.partsText
      });
      const map = Object.assign({}, completedMap);
      map[id] = Object.assign({}, completedMap[id], { completedAt: this.nowTime() });
      this.updateProgress(map);

      const allDone = Object.keys(map).length === (workout.exercises || []).length;
      wx.showToast({ title: allDone ? '今日训练已完成 🎉' : '已完成，继续加油！', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: '保存失败，请稍后重试', icon: 'none' });
    }
  },

  // 点击「未完成」按钮：取消完成（标记未完成）
  async onMarkUndone(e) {
    const id = e.currentTarget.dataset.id;
    const { completedMap } = this.data;
    if (!completedMap[id]) return; // 已是未完成状态
    try {
      await workoutService.markExerciseIncomplete(id);
      const map = Object.assign({}, completedMap);
      delete map[id];
      this.updateProgress(map);
      wx.showToast({ title: '已标记为未完成', icon: 'none' });
    } catch (err) {
      wx.showToast({ title: '操作失败，请稍后重试', icon: 'none' });
    }
  },

  // 获取本周第 i 天（0=周一）的日期 YYYY-MM-DD
  getWeekDate(i) {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - ((day === 0 ? 7 : day) - 1) + i;
    const nd = new Date(d.setDate(diff));
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return nd.getFullYear() + '-' + pad(nd.getMonth() + 1) + '-' + pad(nd.getDate());
  },

  // 当前时间 HH:mm
  nowTime() {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  // 完成时间展示：'YYYY-MM-DD HH:mm' → 'HH:mm'
  formatCompletedAt(t) {
    if (!t) return '';
    return t.length >= 16 ? t.slice(11, 16) : t;
  },

  // 一键智能推荐：根据「我的资料」用规则引擎生成 7 天计划，覆盖当前计划
  async onSmartRecommend() {
    wx.showModal({
      title: '智能推荐',
      content: '将根据你的资料（目标/器械/经验/频率）重新生成 7 天训练计划，并覆盖当前计划？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '生成中...' });
        try {
          const user = await userService.getUser();
          if (!user) {
            wx.hideLoading();
            wx.showToast({ title: '请先在「我的资料」中填写信息', icon: 'none' });
            return;
          }
          // 按规则引擎生成周一~周日 7 天计划
          const days = [];
          for (let i = 0; i < 7; i++) {
            const day = await recommendService.getDayWorkout(user, i);
            days.push({
              day: i + 1,
              isRest: day.exercises.length === 0,
              exercise_ids: day.exercises.map((e) => e._id)
            });
          }
          await planService.saveWeekPlanCustom(days);
          wx.hideLoading();
          wx.showToast({ title: '已生成智能推荐', icon: 'success' });
          this.load(); // 刷新本周计划与今日训练
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '生成失败，请稍后重试', icon: 'none' });
        }
      }
    });
  },

  // 编辑自定义计划
  onEditPlan() {
    wx.navigateTo({ url: '/pages/week-plan-edit/week-plan-edit' });
  },

  // 去填写用户资料
  onGoUserInfo() {
    wx.navigateTo({ url: '/pages/user-info/user-info' });
  },

  // 去动作库
  onGoExercises() {
    wx.switchTab({ url: '/pages/exercise/exercise' });
  },

  // 切换动作完成状态（点击状态标签时）
  onToggleStatus(e) {
    const id = e.currentTarget.dataset.id;
    const { completedMap } = this.data;
    if (completedMap[id]) {
      this.onMarkUndone(e);
    } else {
      this.onMarkDone(e);
    }
  },

  // 跳转训练详情页
  onGoDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/workout-detail/workout-detail?id=' + id });
  },

  // 开始训练：进入训练记录编辑页（力量训练明细 + 计时器）
  onStartTraining() {
    const { workout } = this.data;
    if (!workout || workout.isRestDay || workout.count === 0) return;
    wx.navigateTo({ url: '/pages/workout-detail/workout-detail' });
  },

  // 继续上次训练：恢复自动保存的草稿
  onResumeTraining() {
    wx.navigateTo({ url: '/pages/workout-detail/workout-detail' });
  },

  // 查看训练周期
  onGoCycle() {
    wx.navigateTo({ url: '/pages/cycle/cycle' });
  }
});
