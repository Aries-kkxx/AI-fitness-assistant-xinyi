// pages/workout-detail/workout-detail.js - 训练记录编辑页（力量训练明细）
// 功能：
//   1. 训练计时器：开始 / 暂停 / 继续 / 结束，自动记录训练总时长
//   2. 逐动作记录：每组重量 / 次数 / RPE / 力竭 / 组间休息，添加 / 删除训练组
//   3. 完成动作（含备注），完成训练统一收尾保存
//   4. 组间休息倒计时，休息结束后可继续下一组（可跳过）
//   5. 自动保存：每次变更写本地草稿 + 防抖写数据库（退出页面/杀进程不丢数据）
//   6. 选择动作：从动作库（exercises 集合）追加动作
//   7. 兼容旧数据：今日已有旧格式记录（快速勾选）时合并展示，可继续补充明细
// 数据层：所有数据库操作均经 services（workoutService / planService / exerciseService）
const { formatDate } = require('../../utils/date');
const userService = require('../../services/user');
const workoutService = require('../../services/workout');
const planService = require('../../services/plan');
const exerciseService = require('../../services/exercise');

const MAX_SETS = 30; // 单个动作最多组数（防误触）
const CATEGORIES = ['全部', '胸部', '背部', '肩部', '手臂', '腿部', '臀部', '核心', '有氧', '拉伸'];

Page({
  data: {
    loading: true,
    hasUser: false,
    planId: '', // 计划标识（今日部位组合，如 '胸 + 三头'）
    partsText: '',
    session: { status: 'idle', timerText: '00:00', elapsedMs: 0, accumulatedMs: 0, startedAt: 0 },
    exercises: [], // 训练动作列表（含每组明细与输入草稿）
    completedCount: 0,
    percent: 0,
    restTimer: null, // { exerciseId, totalSeconds, secondsLeft }
    restText: '',
    showAddPanel: false, // 添加动作面板
    categories: CATEGORIES,
    activeCat: 0,
    addExercises: [], // 动作库全量（面板数据源）
    addFiltered: [], // 按分类过滤后的展示列表
    draftRestored: false // 是否从自动保存的草稿恢复
  },

  onLoad(options) {
    // 训练页点击动作进入时的高亮动作
    this._highlightId = (options && options.id) || '';
    this._sessionId = ''; // 数据库会话 _id（延迟创建）
    this._setSeq = 0; // 组唯一 key 序号
    this._timer = null; // 会话计时器
    this._restTimer = null; // 组间休息倒计时
    this._saveTimer = null; // 防抖保存
    this._saving = false;
    this.load();
  },

  onShow() {
    // 从后台/其他页面返回：恢复计时器继续走时
    if (this.data.session && this.data.session.status === 'active') {
      this.startSessionTimer();
    }
  },

  onHide() {
    this.stopSessionTimer();
    this.clearRest();
    this.flushNow();
  },

  onUnload() {
    this.stopSessionTimer();
    this.clearRest();
    this.flushNow();
  },

  onBack() {
    wx.navigateBack();
  },

  // ===== 加载与恢复 =====

  async load() {
    this.setData({ loading: true });
    try {
      const user = await userService.getUser();
      if (!user) {
        this.setData({ hasUser: false, loading: false });
        return;
      }
      this.setData({ hasUser: true });

      const today = formatDate(new Date());
      const draft = workoutService.getTodayDraft();
      let session;
      let exercises;

      if (draft) {
        // 恢复自动保存的草稿（跨页/杀进程兜底）
        this._sessionId = draft.session_id || '';
        exercises = (draft.exercises || []).map((e) => this.deserializeExercise(e));
        const ds = draft.session || {};
        if (ds.status === 'ended') {
          // 草稿异常状态：重新开始计时，但保留已记录数据
          session = { status: 'idle', timerText: '00:00', elapsedMs: 0, accumulatedMs: 0, startedAt: 0 };
        } else {
          session = {
            status: ds.status === 'active' || ds.status === 'paused' ? ds.status : 'idle',
            timerText: ds.timerText || '00:00',
            elapsedMs: Number(ds.elapsedMs) || 0,
            accumulatedMs: Number(ds.accumulatedMs) || 0,
            startedAt: Date.now() // 重新锚定：走时基于累计时长
          };
        }
        this.setData({
          planId: draft.plan_id || '',
          partsText: draft.parts_text || '',
          draftRestored: true
        });
      } else {
        // 全新：今日训练计划（自定义优先）+ 今日已有记录合并（兼容旧数据）
        const resolved = await planService.resolveTodayWorkout(user);
        const workout = resolved.workout;
        exercises = (workout.exercises || []).map((ex) => this.initExercise(ex));
        const records = await workoutService.getTodayRecords();
        const recMap = {};
        records.forEach((r) => {
          recMap[r.exercise_id] = r;
        });
        exercises.forEach((ex) => {
          const r = recMap[ex._id];
          if (r) this.mergeRecordIntoExercise(ex, r);
        });
        session = { status: 'idle', timerText: '00:00', elapsedMs: 0, accumulatedMs: 0, startedAt: 0 };
        this.setData({ planId: workout.partsText, partsText: workout.partsText });
      }

      this.setData({ session, exercises, loading: false }, () => {
        this.updateProgress();
        if (session.status === 'active') this.startSessionTimer();
        // 训练页点击动作进入 → 展开该动作编辑区
        if (this._highlightId) {
          const idx = exercises.findIndex((e) => e._id === this._highlightId);
          if (idx >= 0) this.expandExercise(idx);
        }
      });
    } catch (err) {
      console.error('[workout-detail] 加载失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 新动作初始化（含输入草稿字段）
  initExercise(ex) {
    return {
      _id: ex._id,
      name: ex.name,
      plannedSets: Number(ex.sets) || 0,
      plannedReps: Number(ex.reps) || 0,
      repsUnit: ex.repsUnit || '次',
      restSeconds: Number(ex.restSeconds) || 60,
      category: ex.category || '',
      sets: [], // [{ key, weight, reps, rpe, is_failure, rest_seconds }]
      note: '',
      completed: false,
      recordId: '',
      startedAt: '',
      endedAt: '',
      durationMinutes: 0,
      expanded: false,
      draftWeight: '',
      draftReps: ex.reps ? String(ex.reps) : '',
      draftRpe: '',
      draftFailure: false,
      draftRest: String(Number(ex.restSeconds) || 60)
    };
  },

  // 合并今日已有记录（旧版快速勾选 / 之前保存的明细）
  mergeRecordIntoExercise(ex, r) {
    ex.sets = r.set_records.map((s) => ({
      key: 'k' + ++this._setSeq,
      weight: Number(s.weight) || 0,
      reps: Number(s.reps) || 0,
      rpe: s.rpe ? Number(s.rpe) : '',
      is_failure: !!s.is_failure,
      rest_seconds: Number(s.rest_seconds) || 0
    }));
    ex.note = r.note || '';
    ex.completed = !!r.completed;
    ex.recordId = r._id || '';
    ex.startedAt = r.started_at || '';
    ex.endedAt = r.ended_at || '';
    ex.durationMinutes = Number(r.duration_minutes) || 0;
    if (ex.sets.length > 0) {
      const last = ex.sets[ex.sets.length - 1];
      ex.draftWeight = last.weight ? String(last.weight) : '';
      ex.draftReps = last.reps ? String(last.reps) : '';
      ex.draftRest = String(last.rest_seconds || ex.restSeconds || 60);
    }
  },

  // 草稿 → 页面动作对象
  deserializeExercise(d) {
    return {
      _id: d._id,
      name: d.name || '',
      plannedSets: Number(d.plannedSets) || 0,
      plannedReps: Number(d.plannedReps) || 0,
      repsUnit: d.repsUnit || '次',
      restSeconds: Number(d.restSeconds) || 60,
      category: d.category || '',
      sets: (d.sets || []).map((s) => ({
        key: 'k' + ++this._setSeq,
        weight: Number(s.weight) || 0,
        reps: Number(s.reps) || 0,
        rpe: s.rpe ? Number(s.rpe) : '',
        is_failure: !!s.is_failure,
        rest_seconds: Number(s.rest_seconds) || 0
      })),
      note: d.note || '',
      completed: !!d.completed,
      recordId: d.recordId || '',
      startedAt: d.startedAt || '',
      endedAt: d.endedAt || '',
      durationMinutes: Number(d.durationMinutes) || 0,
      expanded: false,
      draftWeight: d.draftWeight || '',
      draftReps: d.draftReps || '',
      draftRpe: d.draftRpe || '',
      draftFailure: !!d.draftFailure,
      draftRest: d.draftRest || String(Number(d.restSeconds) || 60)
    };
  },

  // 页面动作对象 → 草稿
  serializeExercise(ex) {
    return {
      _id: ex._id,
      name: ex.name,
      plannedSets: ex.plannedSets,
      plannedReps: ex.plannedReps,
      repsUnit: ex.repsUnit,
      restSeconds: ex.restSeconds,
      category: ex.category,
      sets: ex.sets.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        is_failure: s.is_failure,
        rest_seconds: s.rest_seconds
      })),
      note: ex.note,
      completed: ex.completed,
      recordId: ex.recordId,
      startedAt: ex.startedAt,
      endedAt: ex.endedAt,
      durationMinutes: ex.durationMinutes,
      draftWeight: ex.draftWeight,
      draftReps: ex.draftReps,
      draftRpe: ex.draftRpe,
      draftFailure: ex.draftFailure,
      draftRest: ex.draftRest
    };
  },

  // 构建草稿（本地自动保存兜底）
  buildDraft() {
    return {
      workout_date: formatDate(new Date()),
      plan_id: this.data.planId,
      parts_text: this.data.partsText,
      session_id: this._sessionId || '',
      session: {
        status: this.data.session.status,
        elapsedMs: this.data.session.elapsedMs,
        accumulatedMs: this.data.session.accumulatedMs,
        timerText: this.data.session.timerText
      },
      exercises: this.data.exercises.map((e) => this.serializeExercise(e)),
      updated_at: Date.now()
    };
  },

  // 页面动作对象 → 数据库记录
  exerciseToRecord(ex) {
    return {
      exerciseId: ex._id,
      exerciseName: ex.name,
      planId: this.data.planId,
      plannedSets: ex.plannedSets,
      plannedReps: ex.plannedReps,
      setRecords: ex.sets.map((s) => ({
        weight: Number(s.weight) || 0,
        reps: Number(s.reps) || 0,
        rpe: s.rpe ? Number(s.rpe) : null,
        is_failure: !!s.is_failure,
        rest_seconds: Number(s.rest_seconds) || 0
      })),
      note: ex.note || '',
      startedAt: ex.startedAt,
      endedAt: ex.endedAt,
      durationMinutes: ex.durationMinutes,
      completed: !!ex.completed,
      sessionId: this._sessionId || ''
    };
  },

  // ===== 自动保存 =====

  autoSave() {
    // 1) 本地草稿（同步，可靠兜底）
    workoutService.saveDraft(this.buildDraft());
    // 2) 数据库防抖写入（连续操作合并）
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.flushDbSave(), 800);
  },

  flushNow() {
    workoutService.saveDraft(this.buildDraft());
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.flushDbSave();
  },

  async flushDbSave() {
    if (this._saving) return;
    this._saving = true;
    try {
      const s = this.data.session;
      // 会话文档（计时器状态 + 总时长）
      if (s.status !== 'idle') {
        const elapsedMs =
          s.status === 'active' ? s.accumulatedMs + (Date.now() - s.startedAt) : s.accumulatedMs;
        const durationMinutes = Math.round((elapsedMs / 60000) * 10) / 10;
        if (this._sessionId) {
          await workoutService.updateWorkoutSession(this._sessionId, {
            status: s.status,
            durationMinutes,
            endedAt: s.status === 'ended' ? this.nowStr() : ''
          });
        } else {
          this._sessionId = await workoutService.createWorkoutSession({
            planId: this.data.planId,
            partsText: this.data.partsText,
            startedAt: s.startedAt ? this.nowStrFromTs(s.startedAt) : this.nowStr(),
            status: s.status
          });
        }
      }
      // 动作记录（有数据才写：组/备注/已完成任一）
      for (const ex of this.data.exercises) {
        if (ex.completed || ex.sets.length > 0 || ex.note) {
          await workoutService.upsertExerciseRecord(this.exerciseToRecord(ex));
        }
      }
    } catch (err) {
      console.error('[workout-detail] 自动保存失败', err);
    } finally {
      this._saving = false;
    }
  },

  // ===== 训练计时器 =====

  startSessionTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.tickSession(), 1000);
    this.tickSession();
  },

  stopSessionTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  tickSession() {
    const s = this.data.session;
    if (!s || s.status !== 'active') return;
    const elapsed = s.accumulatedMs + (Date.now() - s.startedAt);
    this.setData({
      'session.elapsedMs': elapsed,
      'session.timerText': this.formatMs(elapsed)
    });
  },

  onStartSession() {
    if (this.data.session.status !== 'idle') return;
    this._sessionId = '';
    const session = { status: 'active', timerText: '00:00', elapsedMs: 0, accumulatedMs: 0, startedAt: Date.now() };
    this.setData({ session }, () => {
      this.startSessionTimer();
      this.autoSave();
    });
    wx.showToast({ title: '开始训练 💪', icon: 'none' });
  },

  onPauseSession() {
    const s = this.data.session;
    if (s.status !== 'active') return;
    this.stopSessionTimer();
    const accumulated = s.accumulatedMs + (Date.now() - s.startedAt);
    const session = Object.assign({}, s, {
      status: 'paused',
      accumulatedMs: accumulated,
      elapsedMs: accumulated,
      timerText: this.formatMs(accumulated)
    });
    this.setData({ session }, () => this.autoSave());
    wx.showToast({ title: '已暂停', icon: 'none' });
  },

  onResumeSession() {
    const s = this.data.session;
    if (s.status !== 'paused') return;
    const session = Object.assign({}, s, { status: 'active', startedAt: Date.now() });
    this.setData({ session }, () => {
      this.startSessionTimer();
      this.autoSave();
    });
    wx.showToast({ title: '继续训练', icon: 'none' });
  },

  onFinishWorkout() {
    if (this.data.session.status === 'idle') {
      wx.showToast({ title: '请先开始训练', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '完成训练',
      content: '确定结束本次训练？所有记录将自动保存。',
      confirmText: '完成训练',
      success: (res) => {
        if (res.confirm) this.finishWorkout();
      }
    });
  },

  async finishWorkout() {
    wx.showLoading({ title: '保存中...' });
    try {
      this.stopSessionTimer();
      this.clearRest();
      const s = this.data.session;
      const endedAt = this.nowStr();
      const elapsed =
        s.status === 'active' ? s.accumulatedMs + (Date.now() - s.startedAt) : s.accumulatedMs;
      const durationMinutes = Math.round((elapsed / 60000) * 10) / 10;
      const sessionStartedAt = s.startedAt ? this.nowStrFromTs(s.startedAt) : endedAt;

      // 收尾每个动作：补起止时间与动作耗时
      const exercises = this.data.exercises.map((ex) => {
        const hasData = ex.completed || ex.sets.length > 0 || ex.note;
        if (!hasData) return ex;
        const e = Object.assign({}, ex);
        if (!e.startedAt) e.startedAt = sessionStartedAt;
        e.endedAt = endedAt;
        if (!e.durationMinutes) {
          const ms = e.startedAt ? Date.now() - this.tsFromStr(e.startedAt) : 0;
          e.durationMinutes = Math.max(0, Math.round((ms / 60000) * 10) / 10);
        }
        return e;
      });

      this.setData({
        exercises,
        session: Object.assign({}, s, {
          status: 'ended',
          accumulatedMs: elapsed,
          elapsedMs: elapsed,
          timerText: this.formatMs(elapsed)
        })
      });

      // 结束会话文档
      if (this._sessionId) {
        await workoutService.updateWorkoutSession(this._sessionId, {
          status: 'completed',
          endedAt,
          durationMinutes
        });
      } else {
        this._sessionId = await workoutService.createWorkoutSession({
          planId: this.data.planId,
          partsText: this.data.partsText,
          startedAt: sessionStartedAt,
          status: 'completed',
          endedAt,
          durationMinutes
        });
      }

      // 保存所有动作记录
      for (const ex of exercises) {
        if (ex.completed || ex.sets.length > 0 || ex.note) {
          await workoutService.upsertExerciseRecord(this.exerciseToRecord(ex));
        }
      }

      // 新 PR 检测：完成训练后的汇总反馈
      const newPRs = [];
      for (const ex of exercises) {
        if (!ex.completed && ex.sets.length === 0) continue;
        try {
          const r = await workoutService.checkNewPR(ex._id, this.exerciseSetData(ex));
          if (r.isNew && r.stats) {
            r.newPRs.forEach((t) => {
              const label = t === 'weight' ? '最大重量' : t === 'reps' ? '最大次数' : '最大容量';
              const val = t === 'weight' ? r.stats.maxWeight + 'kg' : t === 'reps' ? r.stats.maxReps + ' 次' : r.stats.volume + 'kg';
              newPRs.push(ex.name + ' · ' + label + ' ' + val);
            });
          }
        } catch (err) {
          console.error('[workout-detail] PR 检测失败', ex._id, err);
        }
      }

      // 完成：清除草稿
      workoutService.clearDraft();
      wx.hideLoading();
      if (newPRs.length > 0) {
        wx.showModal({
          title: '🎉 新个人纪录！',
          content: newPRs.join('\n'),
          showCancel: false,
          confirmText: '太棒了',
          success: () => setTimeout(() => wx.navigateBack(), 100)
        });
      } else {
        wx.showToast({ title: '训练已完成 🎉', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
      }
    } catch (err) {
      console.error('[workout-detail] 完成训练失败', err);
      wx.hideLoading();
      wx.showToast({ title: '保存失败，已保留草稿', icon: 'none' });
    }
  },

  // ===== 动作编辑 =====

  expandExercise(idx) {
    this.setData({ [`exercises[${idx}].expanded`]: true });
  },

  onToggleEdit(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const ex = this.data.exercises[idx];
    if (!ex) return;
    this.setData({ [`exercises[${idx}].expanded`]: !ex.expanded });
  },

  // 拦截编辑面板内控件（输入框/开关/备注）的点击冒泡，防止触发卡片收起
  onStopTap() {},

  // 查看动作历史与表现分析（当前动作）
  onGoHistory(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/exercise-history/exercise-history?id=' + encodeURIComponent(id) + '&name=' + encodeURIComponent(name || '')
    });
  },

  // 删除该动作今日训练记录（数据纠错）
  onDeleteExerciseRecord(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const ex = this.data.exercises[idx];
    if (!ex) return;
    wx.showModal({
      title: '删除训练记录',
      content: '确定删除「' + ex.name + '」今天的全部训练记录？删除后不可恢复，也不会影响历史其他日期的记录。',
      confirmText: '删除',
      confirmColor: '#FF6B6B',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await workoutService.deleteExerciseRecord(ex._id);
          // 重置该动作（清空组与状态；草稿同步，避免残留）
          this.setData(
            {
              [`exercises[${idx}].sets`]: [],
              [`exercises[${idx}].completed`]: false,
              [`exercises[${idx}].recordId`]: '',
              [`exercises[${idx}].note`]: '',
              [`exercises[${idx}].startedAt`]: '',
              [`exercises[${idx}].endedAt`]: '',
              [`exercises[${idx}].durationMinutes`]: 0
            },
            () => {
              this.updateProgress();
              this.autoSave();
              wx.showToast({ title: '已删除', icon: 'none' });
            }
          );
        } catch (err) {
          console.error('[workout-detail] 删除记录失败', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  onWeightInput(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ [`exercises[${idx}].draftWeight`]: e.detail.value });
  },

  onRepsInput(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ [`exercises[${idx}].draftReps`]: e.detail.value });
  },

  onRpeInput(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ [`exercises[${idx}].draftRpe`]: e.detail.value });
  },

  onRestInput(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ [`exercises[${idx}].draftRest`]: e.detail.value });
  },

  onFailureChange(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ [`exercises[${idx}].draftFailure`]: e.detail.value });
  },

  onNoteInput(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ [`exercises[${idx}].note`]: e.detail.value });
  },

  // 添加训练组
  onAddSet(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const ex = this.data.exercises[idx];
    if (!ex) return;
    if (this.data.restTimer && this.data.restTimer.exerciseId === ex._id) {
      wx.showToast({ title: '休息中，可先跳过休息', icon: 'none' });
      return;
    }
    const reps = Number(ex.draftReps) || 0;
    if (reps <= 0) {
      wx.showToast({ title: '请先输入次数', icon: 'none' });
      return;
    }
    if (ex.sets.length >= MAX_SETS) {
      wx.showToast({ title: '单个动作最多 ' + MAX_SETS + ' 组', icon: 'none' });
      return;
    }
    const weight = Number(ex.draftWeight) || 0;
    const rpeRaw = String(ex.draftRpe || '').trim();
    const rpe = rpeRaw ? Math.min(10, Math.max(1, Number(rpeRaw))) : '';
    const restSeconds = Math.max(0, Number(ex.draftRest) || ex.restSeconds || 60);

    const set = {
      key: 'k' + ++this._setSeq,
      weight,
      reps,
      rpe,
      is_failure: !!ex.draftFailure,
      rest_seconds: restSeconds
    };

    const patch = {};
    const sessionIdle = this.data.session.status === 'idle';
    if (sessionIdle) {
      // 未点「开始训练」直接记录 → 自动开始会话计时
      this._sessionId = '';
      patch['session'] = { status: 'active', timerText: '00:00', elapsedMs: 0, accumulatedMs: 0, startedAt: Date.now() };
    }
    patch[`exercises[${idx}].sets`] = ex.sets.concat([set]);
    if (!ex.startedAt) patch[`exercises[${idx}].startedAt`] = this.nowStr();
    // 输入框保持（连续组通常同重量同次数），仅复位力竭
    patch[`exercises[${idx}].draftFailure`] = false;

    this.setData(patch, () => {
      if (sessionIdle) this.startSessionTimer();
      this.updateProgress();
      this.autoSave();
      this.startRest(ex._id, restSeconds);
    });
  },

  // 删除训练组
  onDeleteSet(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const setIdx = Number(e.currentTarget.dataset.setIndex);
    const ex = this.data.exercises[idx];
    if (!ex || !ex.sets[setIdx]) return;
    const sets = ex.sets.slice();
    sets.splice(setIdx, 1);
    this.setData({ [`exercises[${idx}].sets`]: sets }, () => {
      this.autoSave();
    });
  },

  // 完成动作
  onCompleteExercise(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const ex = this.data.exercises[idx];
    if (!ex) return;
    const endedAt = this.nowStr();
    const patch = {
      [`exercises[${idx}].completed`]: true,
      [`exercises[${idx}].endedAt`]: endedAt
    };
    if (!ex.startedAt) {
      patch[`exercises[${idx}].startedAt`] = this.data.session.startedAt
        ? this.nowStrFromTs(this.data.session.startedAt)
        : endedAt;
    }
    if (!ex.durationMinutes) {
      const ms = ex.startedAt ? Date.now() - this.tsFromStr(ex.startedAt) : 0;
      patch[`exercises[${idx}].durationMinutes`] = Math.max(0, Math.round((ms / 60000) * 10) / 10);
    }
    this.setData(patch, () => {
      this.updateProgress();
      this.autoSave();
      // 新 PR 检测：完成动作时轻量反馈（保存后基于数据库历史）
      this.checkPRAndToast(ex);
    });
  },

  // 完成动作后的 PR 检测与轻量反馈（基于内存数据，不依赖防抖写库时序）
  async checkPRAndToast(ex) {
    if (!ex || ex.sets.length === 0) return;
    try {
      const r = await workoutService.checkNewPR(ex._id, this.exerciseSetData(ex));
      if (!r.isNew || !r.stats) return;
      const parts = r.newPRs.map((t) => {
        if (t === 'weight') return '最大重量 ' + r.stats.maxWeight + 'kg';
        if (t === 'reps') return '最大次数 ' + r.stats.maxReps + ' 次';
        return '最大容量 ' + r.stats.volume + 'kg';
      });
      wx.showToast({
        title: '🎉 新PR！' + ex.name + ' ' + parts.join(' · '),
        icon: 'none',
        duration: 2500
      });
    } catch (err) {
      console.error('[workout-detail] PR 检测失败', err);
    }
  },

  // 页面动作 → 检测用今日记录数据
  exerciseSetData(ex) {
    return {
      actual_sets: ex.sets.length,
      set_records: ex.sets.map((s) => ({
        weight: Number(s.weight) || 0,
        reps: Number(s.reps) || 0,
        rpe: s.rpe ? Number(s.rpe) : null,
        is_failure: !!s.is_failure,
        rest_seconds: Number(s.rest_seconds) || 0
      }))
    };
  },

  // ===== 组间休息倒计时 =====

  startRest(exerciseId, seconds) {
    this.clearRest();
    const restTimer = { exerciseId, totalSeconds: seconds, secondsLeft: seconds };
    this.setData({ restTimer, restText: this.formatRest(seconds) });
    this._restTimer = setInterval(() => {
      const r = this.data.restTimer;
      if (!r || r.exerciseId !== exerciseId) return;
      const left = r.secondsLeft - 1;
      if (left <= 0) {
        this.clearRest();
        wx.vibrateShort({ type: 'medium', fail: () => {} });
        wx.showToast({ title: '休息结束，继续下一组', icon: 'none' });
        return;
      }
      this.setData({ 'restTimer.secondsLeft': left, restText: this.formatRest(left) });
    }, 1000);
  },

  clearRest() {
    if (this._restTimer) {
      clearInterval(this._restTimer);
      this._restTimer = null;
    }
    this.setData({ restTimer: null, restText: '' });
  },

  onSkipRest() {
    this.clearRest();
  },

  // ===== 添加动作（选择动作，全部来自动作库 exercises 集合） =====

  onToggleAddPanel() {
    if (this.data.showAddPanel) {
      this.setData({ showAddPanel: false });
      return;
    }
    wx.showLoading({ title: '加载动作库...' });
    exerciseService
      .getAll()
      .then((all) => {
        const exists = {};
        this.data.exercises.forEach((e) => {
          exists[e._id] = true;
        });
        const addExercises = all.map((e) => ({
          _id: e._id,
          name: e.name,
          category: e.category || '',
          recommended_sets: e.recommended_sets,
          recommended_reps: e.recommended_reps,
          reps_unit: e.reps_unit || '次',
          rest_seconds: e.rest_seconds,
          difficulty: e.difficulty,
          equipment: e.equipment,
          added: !!exists[e._id]
        }));
        wx.hideLoading();
        this._allAdd = addExercises;
        this.filterAddExercises(0);
        this.setData({ showAddPanel: true, activeCat: 0 });
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  // 按分类过滤动作库（0 = 全部）
  filterAddExercises(activeCat) {
    const cat = CATEGORIES[activeCat];
    const addFiltered =
      cat === '全部' ? (this._allAdd || []) : (this._allAdd || []).filter((e) => e.category === cat);
    this.setData({ addFiltered });
  },

  onCatChange(e) {
    const activeCat = Number(e.currentTarget.dataset.index);
    this.setData({ activeCat });
    this.filterAddExercises(activeCat);
  },

  onAddExercisePick(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.exercises.some((x) => x._id === id)) {
      wx.showToast({ title: '该动作已在训练中', icon: 'none' });
      return;
    }
    const lib = this.data.addExercises.find((x) => x._id === id);
    if (!lib) return;
    const ex = this.initExercise({
      _id: lib._id,
      name: lib.name,
      sets: lib.recommended_sets,
      reps: lib.recommended_reps,
      repsUnit: lib.reps_unit,
      restSeconds: lib.rest_seconds,
      category: lib.category
    });
    const exercises = this.data.exercises.concat([ex]);
    this.setData({ exercises, showAddPanel: false }, () => {
      this.updateProgress();
      this.autoSave();
      this.expandExercise(exercises.length - 1);
    });
  },

  // ===== 工具与进度 =====

  updateProgress() {
    const exercises = this.data.exercises || [];
    const completedCount = exercises.filter((e) => e.completed).length;
    const percent = exercises.length > 0 ? Math.round((completedCount / exercises.length) * 100) : 0;
    this.setData({ completedCount, percent });
  },

  formatMs(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return (h > 0 ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
  },

  formatRest(sec) {
    const s = Math.max(0, Math.floor(sec));
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  },

  nowStr() {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    );
  },

  nowStrFromTs(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    );
  },

  tsFromStr(str) {
    if (!str) return 0;
    return new Date(str.replace(' ', 'T')).getTime();
  },

  onGoUserInfo() {
    wx.navigateTo({ url: '/pages/user-info/user-info' });
  }
});
