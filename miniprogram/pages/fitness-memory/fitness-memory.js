// pages/fitness-memory/fitness-memory.js - 「欣一记住的事情」长期健身记忆
// 展示/修改/删除 fitness_memory（结构化长期记忆，每用户 1 条）
// 区块：训练偏好 / 训练习惯 / 身体反馈 / 目标 / AI 备注
// 数据层：services/fitness-memory.js（openid 隔离、敏感信息过滤、空记忆降级）
const fitnessMemoryService = require('../../services/fitness-memory');
const { detectSensitive } = require('../../utils/sensitive');

Page({
  data: {
    loading: true,
    hasMemory: false,
    // 训练偏好
    prefStyles: [],
    prefFav: [],
    prefDislike: [],
    prefTime: '',
    prefDuration: 45,
    // 训练习惯
    habitFrequency: 0,
    habitTime: '',
    habitMissed: [],
    habitPatterns: [],
    // 身体反馈
    slowParts: [],
    tiredEx: [],
    feedback: [],
    // 目标
    goalCurrent: '',
    goalHistory: [],
    goalsUpdatedAt: '',
    // AI 备注
    aiNotes: [],
    // 输入草稿
    input: { styles: '', fav: '', dislike: '', missed: '', patterns: '', slow: '', tired: '' },
    frequencyOptions: ['0 次', '1 次', '2 次', '3 次', '4 次', '5 次', '6 次', '7 次'],
    durationOptions: [30, 45, 60, 90],
    saving: false
  },

  onLoad() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const m = await fitnessMemoryService.getFitnessMemory();
      this.applyMemory(m);
    } catch (err) {
      console.error('[fitness-memory] 加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 记忆 → 页面扁平字段
  applyMemory(m) {
    const pre = m.training_preferences || {};
    const hab = m.training_habits || {};
    const body = m.body_response || {};
    const goals = m.goals || {};
    this.setData({
      prefStyles: pre.preferred_training_styles || [],
      prefFav: pre.favorite_exercises || [],
      prefDislike: pre.disliked_exercises || [],
      prefTime: pre.preferred_time || '',
      prefDuration: pre.preferred_duration || 45,
      habitFrequency: hab.weekly_frequency || 0,
      habitTime: hab.common_time || '',
      habitMissed: hab.often_missed_days || [],
      habitPatterns: hab.common_patterns || [],
      slowParts: body.slow_recovery_parts || [],
      tiredEx: body.easily_tired_exercises || [],
      feedback: body.feedback || [],
      goalCurrent: goals.current || '',
      goalHistory: goals.history || [],
      goalsUpdatedAt: goals.updated_at || '',
      aiNotes: m.ai_notes || []
    });
    this.updateHasMemory();
  },

  // 是否有任何记忆内容
  updateHasMemory() {
    const d = this.data;
    const has =
      d.prefStyles.length > 0 || d.prefFav.length > 0 || d.prefDislike.length > 0 ||
      d.prefTime || d.habitFrequency > 0 || d.habitTime || d.habitMissed.length > 0 ||
      d.habitPatterns.length > 0 || d.slowParts.length > 0 || d.tiredEx.length > 0 ||
      d.feedback.length > 0 || d.goalCurrent || d.goalHistory.length > 0 || d.aiNotes.length > 0;
    this.setData({ hasMemory: has });
  },

  // ===== 标签（chips）增删 =====

  onInputChange(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ['input.' + key]: e.detail.value });
  },

  onAddChip(e) {
    const listKey = e.currentTarget.dataset.list; // 数据字段名，如 prefStyles
    const inputKey = e.currentTarget.dataset.key; // input 字段名
    const value = String(this.data.input[inputKey] || '').trim();
    if (!value) return;
    if (detectSensitive(value)) {
      wx.showToast({ title: '含敏感信息，请勿保存', icon: 'none' });
      return;
    }
    const list = (this.data[listKey] || []).slice();
    if (list.indexOf(value) >= 0) {
      wx.showToast({ title: '已存在', icon: 'none' });
      return;
    }
    list.push(value);
    this.setData({ [listKey]: list, ['input.' + inputKey]: '' }, () => this.updateHasMemory());
  },

  onRemoveChip(e) {
    const listKey = e.currentTarget.dataset.list;
    const index = Number(e.currentTarget.dataset.index);
    const list = (this.data[listKey] || []).slice();
    list.splice(index, 1);
    this.setData({ [listKey]: list }, () => this.updateHasMemory());
  },

  // ===== 文本/数值字段 =====

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onDurationChange(e) {
    this.setData({ prefDuration: Number(this.data.durationOptions[e.detail.value]) });
  },

  onFrequencyChange(e) {
    this.setData({ habitFrequency: e.detail.value });
  },

  // ===== AI 写入的只读列表（用户可删除） =====

  onRemoveNote(e) {
    const listKey = e.currentTarget.dataset.list; // feedback / goalHistory / aiNotes
    const index = Number(e.currentTarget.dataset.index);
    const list = (this.data[listKey] || []).slice();
    list.splice(index, 1);
    this.setData({ [listKey]: list }, () => this.updateHasMemory());
  },

  // ===== 保存 / 清空 =====

  // 组装记忆结构（敏感信息预检）
  buildMemory() {
    const d = this.data;
    const allTexts = []
      .concat(d.prefStyles, d.prefFav, d.prefDislike, [d.prefTime], d.habitMissed, d.habitPatterns, [d.habitTime], d.slowParts, d.tiredEx, [d.goalCurrent])
      .map((x) => String(x || ''));
    for (let i = 0; i < allTexts.length; i++) {
      if (detectSensitive(allTexts[i])) return null;
    }
    return {
      training_preferences: {
        preferred_training_styles: d.prefStyles,
        favorite_exercises: d.prefFav,
        disliked_exercises: d.prefDislike,
        preferred_time: d.prefTime,
        preferred_duration: Number(d.prefDuration) || 45
      },
      training_habits: {
        weekly_frequency: Number(d.habitFrequency) || 0,
        common_time: d.habitTime,
        often_missed_days: d.habitMissed,
        common_patterns: d.habitPatterns
      },
      body_response: {
        slow_recovery_parts: d.slowParts,
        easily_tired_exercises: d.tiredEx,
        feedback: d.feedback
      },
      goals: {
        current: d.goalCurrent,
        history: d.goalHistory,
        updated_at: d.goalsUpdatedAt
      },
      ai_notes: d.aiNotes
    };
  },

  async onSave() {
    if (this.data.saving) return;
    const memory = this.buildMemory();
    if (!memory) {
      wx.showToast({ title: '包含手机号/身份证等敏感信息，已拦截', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    try {
      const saved = await fitnessMemoryService.saveFitnessMemory(memory);
      this.applyMemory(saved);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onClearAll() {
    wx.showModal({
      title: '清空记忆',
      content: '确定清空「欣一记住的事情」全部内容？此操作不可恢复。',
      confirmText: '清空',
      confirmColor: '#FF6B6B',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await fitnessMemoryService.deleteFitnessMemory();
          const m = await fitnessMemoryService.getFitnessMemory();
          this.applyMemory(m);
          wx.showToast({ title: '已清空', icon: 'none' });
        } catch (err) {
          wx.showToast({ title: '清空失败', icon: 'none' });
        }
      }
    });
  },

  onBack() {
    wx.navigateBack();
  }
});
